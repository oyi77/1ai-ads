#!/usr/bin/env python3
"""SATPAM 1134 minimal patrol — engine-assisted, robust token load + classification."""

import sys
import os
import json
import time
import urllib.parse
import urllib.request

from datetime import datetime, timezone, timedelta

WIB = timezone(timedelta(hours=7))


def load_token(env_path: str) -> str:
    key = 'META_ACCESS_TOKEN'
    for line in open(env_path, 'r', encoding='utf-8').read().splitlines():
        if not line or line.startswith('#'):
            continue
        if line.split('=', 1)[0] == key:
            return line.split('=', 1)[1].strip()
    raise RuntimeError('token missing')


def load_env() -> str:
    candidates = [
        '/home/openclaw/projects/1ai-ads/.env',
        '/home/openclaw/.env',
        '/home/openclaw/projects/.env',
    ]
    for path in candidates:
        if os.path.isfile(path):
            tok = load_token(path)
            if tok:
                return tok
    raise RuntimeError('token missing')


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


try:
    token = load_env()
except Exception as e:
    print('ENV_LOAD_FAILED:', repr(e))
    sys.exit(1)

print('token_len:', len(token))


class Meta:
    API = 'https://graph.facebook.com/v22.0'

    def __init__(self, token: str, delay: float = 1.5, retries: int = 3):
        self.token = token
        self.delay = delay
        self.retries = retries

    def req(self, path: str, params: dict | None = None, method: str = 'GET', body: dict | None = None):
        full_path = path if str(path).startswith('act_') else f'act_{path}'
        url = f'{self.API}/{full_path}'
        params = dict(params or {})
        params['access_token'] = self.token
        qs = urllib.parse.urlencode(params)
        if method == 'GET':
            req = urllib.request.Request(f'{url}?{qs}')
        else:
            encoded = urllib.parse.urlencode(body or {}).encode()
            req = urllib.request.Request(url, data=encoded, method=method)
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')

        last_err = None
        for i in range(1, self.retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    raw = r.read().decode()
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        return raw.strip()
            except urllib.error.HTTPError as e:
                body_text = ''
                try:
                    body_text = e.read().decode('utf-8', errors='ignore')
                except Exception:
                    pass
                last_err = RuntimeError(f'HTTP {e.code}: {e.reason} | {body_text}')
                if e.code in (400, 403) and i < self.retries:
                    time.sleep(self.delay * i)
                    continue
                raise last_err
            except Exception as e:
                last_err = e
                time.sleep(self.delay)
        raise last_err or RuntimeError('meta request failed')

    def get(self, path, fields, **params):
        params = dict(params)
        params['fields'] = ','.join(fields)
        return self.req(path, params=params)

    def post(self, path, data: dict):
        return self.req(path, method='POST', body=data)


def load_engine():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import vilona_trakpro_engine as engine
    return engine


def main():
    engine = load_engine()
    accounts = getattr(engine, 'ACCOUNTS', {}) or {}
    cfg = accounts.get('1134', {}) or {}

    act_id = '2125021885010866'
    meta = Meta(token=token, delay=1.5, retries=3)
    end_dt = datetime.now(WIB).date()
    since = (end_dt - timedelta(days=7)).isoformat()
    until = end_dt.isoformat()
    time_range = json.dumps({'since': since, 'until': until})

    account_name = ''
    try:
        acct = meta.get(f'{act_id}', ['id'])
        account_name = acct.get('name') or acct.get('account_name') or ''
    except Exception as e:
        print('account_selfcheck_failed:', repr(e))

    try:
        camps_raw = meta.get(
            f'{act_id}/campaigns',
            ['id', 'name', 'status', 'effective_status', 'daily_budget', 'lifetime_budget', 'spend', 'cpc'],
            limit='200',
        )
        campaigns = camps_raw.get('data', []) or []
    except Exception as e:
        print('campaigns_fetch_failed:', repr(e))
        campaigns = []

    active = [c for c in campaigns if c.get('status') == 'ACTIVE']
    off_ = [c for c in campaigns if str(c.get('name', '')).startswith('OFF_')]
    print('inventory: campaigns=', len(campaigns), 'active=', len(active), 'off_=', len(off_))

    cpc_thresholds = {
        'cpc_kill': float(cfg.get('cpc_kill', 400)),
        'cpc_safe_cbo': float(cfg.get('cpc_safe_cbo', 100)),
        'cpc_danger_cbo': float(cfg.get('cpc_danger_cbo', 140)),
        'cpc_safe_abo': float(cfg.get('cpc_safe_abo', 150)),
        'cpc_danger_abo': float(cfg.get('cpc_danger_abo', 250)),
    }

    def classify_name(name):
        n = (name or '').upper()
        if n.startswith('ON_LC_') or n.startswith('CBO') or n.startswith('BC_') or n.startswith('TC_') or n.startswith('LC_') or n.startswith('GLW'):
            return 'CBO'
        if n.startswith('ABO') or n.startswith('BIDCAP') or 'TEST' in n:
            return 'ABO'
        return 'CBO'

    def insights(campaign_id):
        try:
            raw = meta.get(
                f'{act_id}/insights',
                ['campaign_id', 'campaign_name', 'spend', 'cpc', 'clicks', 'ctr', 'impressions'],
                time_range=time_range,
                level='campaign',
                limit='1',
                filtering=json.dumps([{'field': 'campaign.id', 'operator': 'EQUAL', 'value': campaign_id}]),
            )
            rows = raw.get('data', []) or []
        except Exception as e:
            print('insights fetch failed', campaign_id, e)
            return {'spend': 0, 'cpc': None, 'clicks': 0, 'ctr': 0, 'impressions': 0}
        row = rows[0] if rows else {}

        def num(k):
            v = row.get(k)
            if v in ('', None):
                return 0 if k != 'cpc' else None
            try:
                return float(v)
            except Exception:
                return 0 if k != 'cpc' else None

        return {
            'campaign_id': row.get('campaign_id') or campaign_id,
            'campaign_name': row.get('campaign_name', ''),
            'spend': num('spend'),
            'cpc': num('cpc'),
            'clicks': num('clicks'),
            'ctr': num('ctr'),
            'impressions': num('impressions'),
        }

    ins_map = {}
    for c in campaigns:
        ins_map[c.get('id')] = insights(c.get('id'))
        time.sleep(0.4)

    kill = []
    watch = []
    total_spend = 0.0
    for c in campaigns:
        if str(c.get('name', '')).startswith('OFF_'):
            continue
        info = ins_map.get(c.get('id'), {})
        spend = float(info.get('spend', 0) or 0)
        total_spend += spend
        cpc = info.get('cpc')
        ctr = float(info.get('ctr', 0) or 0)
        impr = float(info.get('impressions', 0) or 0)
        clicks = float(info.get('clicks', 0) or 0)
        ctype = classify_name(c.get('name'))
        thr_danger = cpc_thresholds['cpc_danger_cbo'] if ctype == 'CBO' else cpc_thresholds['cpc_danger_abo']
        thr_kill = cpc_thresholds['cpc_kill']
        reasons = []
        if isinstance(cpc, float) and spend > 2000 and cpc > thr_kill:
            reasons.append(f'CPC {cpc:.1f} > {int(thr_kill)}')
        if not reasons and isinstance(cpc, float) and spend > 5000 and cpc > thr_danger:
            reasons.append(f'CPC {cpc:.1f} > {int(thr_danger)}')
        if not reasons and impr > 1000 and ctr < 1.0:
            reasons.append(f'CTR {ctr:.2f}% < 1%')
        verdict = 'OK'
        if reasons:
            verdict = 'KILL' if isinstance(cpc, float) and spend > 2000 and cpc > thr_kill else 'WATCH'
        entry = {
            'id': c.get('id'),
            'name': c.get('name', ''),
            'status': c.get('status'),
            'spend': round(spend, 1),
            'cpc': cpc,
            'clicks': int(round(clicks)),
            'ctr': round(ctr, 3),
            'impr': int(round(impr)),
            'verdict': verdict,
            'reasons': reasons,
        }
        if verdict == 'KILL':
            kill.append(entry)
        elif verdict == 'WATCH':
            watch.append(entry)
    stars = [
        {
            'id': c.get('id'),
            'name': c.get('name', ''),
            'spend': round(float(ins_map.get(c.get('id'), {}).get('spend', 0) or 0), 1),
            'cpc': ins_map.get(c.get('id'), {}).get('cpc'),
            'clicks': int(round(float(ins_map.get(c.get('id'), {}).get('clicks', 0) or 0))),
            'ctr': round(float(ins_map.get(c.get('id'), {}).get('ctr', 0) or 0), 3),
        }
        for c in campaigns
        if c.get('status') == 'ACTIVE'
        and float(ins_map.get(c.get('id'), {}).get('spend', 0) or 0) > 50000
        and float(ins_map.get(c.get('id'), {}).get('clicks', 0) or 0) > 0
        and (
            isinstance(ins_map.get(c.get('id'), {}).get('cpc'), float)
            and ins_map.get(c.get('id'), {}).get('cpc') < 140
            or float(ins_map.get(c.get('id'), {}).get('spend', 0) or 0) > 100000
        )
    ]

    print('kill count=', len(kill))
    for r in kill:
        print('KILL', r['id'], r['name'], r['reasons'])
    print('watch count=', len(watch))
    for r in watch:
        print('WATCH', r['id'], r['name'], r['reasons'])
    print('stars count=', len(stars))
    for r in stars:
        print('STAR', r['id'], r['name'], round(r['spend'], 1), r['cpc'], r['clicks'], r['ctr'])
    print('total_spend_7d=', round(total_spend, 1))


if __name__ == '__main__':
    main()
