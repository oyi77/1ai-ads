#!/usr/bin/env python3
"""Autonomous Watchdog — 1ai-ads Anti-Mati (Pilar 2)"""
import json, os, time, glob
from datetime import datetime
from pathlib import Path

WATCHDOG_HOME = Path('/home/openclaw/projects/1ai-ads')
ENGINE = WATCHDOG_HOME / 'scripts' / 'vilona_trakpro_engine.py'
LOG_DIR = WATCHDOG_HOME / 'logs'
PORT_FILE = WATCHDOG_HOME / 'autonomy' / 'watchdog' / 'last_port_check.json'
RESTART_LOG = WATCHDOG_HOME / 'autonomy' / 'watchdog' / 'restart_log.json'
REFRESH_SECONDS = int(os.getenv('WATCHDOG_REFRESH', '15'))
DEBOUNCE_SECONDS = int(os.getenv('WATCHDOG_RESTART_COOLDOWN', '300'))
MAX_RESTART_COUNT = 3
TARGET_SERVICES = [
    'vilona-trakpro-0858.service',
    'vilona-trakpro-1134.service',
    'vilona-0858-guardian.service',
    'vilona-guardian.service',
]
START = time.time()
session_id = datetime.now().strftime('%Y%m%d-%H%M%S')


def _check_process(proc_name: str) -> bool:
    try:
        out = os.popen(f'ps aux | grep -i "{proc_name}" | grep -v grep').read()
        return bool(out.strip())
    except Exception:
        return False


def _check_port(port: int) -> bool:
    try:
        return os.system(f'ss -tlnp 2>/dev/null | grep -q ": {port} "') == 0
    except Exception:
        return False


def _systemd_active(unit: str) -> bool:
    try:
        code = os.system(f'systemctl --user is-active --quiet {unit} 2>/dev/null')
        return code == 0
    except Exception:
        return False


def _load_json(path: Path, default):
    try:
        if path.exists():
            return json.loads(path.read_text())
    except Exception:
        pass
    return default


def _save_json(path: Path, data):
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, default=str))
        return True
    except Exception as e:
        print(f'[WATCHDOG] save fail {path}: {e}')
        return False


def _within_window(data: dict, key: str, window: int) -> bool:
    ts = data.get(key, 0)
    return (time.time() - float(ts)) < window


def _record_restart(service: str):
    data = _load_json(RESTART_LOG, {})
    svc = data.setdefault(service, {'since': session_id, 'count': 0, 'last_ts': []})
    svc['count'] = int(svc.get('count', 0)) + 1
    svc['last_ts'] = (svc.get('last_ts', []) + [time.time()])[-20:]
    _save_json(RESTART_LOG, data)


def _should_restart(service: str) -> bool:
    data = _load_json(RESTART_LOG, {})
    svc = data.get(service, {})
    count = int(svc.get('count', 0))
    recency = svc.get('last_ts', [])
    recent = sum(1 for t in recency if _within_window({'ts': t}, 'ts', DEBOUNCE_SECONDS))
    if count == 0:
        return True
    if count >= MAX_RESTART_COUNT:
        print(f'[WATCHDOG] {service} limit hit -> no auto restart ({recent} in {DEBOUNCE_SECONDS}s)')
        return False
    return True


# Optional executor alerts (best-effort, don't crash loop)
EXECUTOR = WATCHDOG_HOME / 'scripts' / 'vilona_watchdog_executor.py'

def _cheap_check_engine() -> str:
    try:
        return 'ACTIVE' if ENGINE.exists() else 'MISSING'
    except Exception:
        return 'ERR'


def main():
    global START
    print(f'[WATCHDOG] session={session_id} refresh={REFRESH_SECONDS}s')
    while True:
        try:
            data = _load_json(PORT_FILE, {})
            status_list = []
            now = datetime.now().isoformat()

            # health collection
            for svc in TARGET_SERVICES:
                status_list.append({
                    'service': svc,
                    'timestamp': now,
                    'engine_exists': _cheap_check_engine(),
                })

            # restart loop
            for svc in TARGET_SERVICES:
                active = _systemd_active(svc)
                if not active and _should_restart(svc):
                    old = _load_json(RESTART_LOG, {}).get(svc, {})
                    old_count = int(old.get('count', 0))
                    data['last_port_check'] = datetime.now().isoformat()
                    ok = os.system(f'systemctl --user restart {svc} 2>/dev/null') == 0
                    _record_restart(svc)
                    print(f'[WATCHDOG] {svc} restart={ok} attempt#{old_count+1}')
                else:
                    print(f'[WATCHDOG] {svc} active={active}')

            if status_list:
                data['last_dt'] = datetime.now().isoformat()
                data['status'] = status_list[-1]
                _save_json(PORT_FILE, data)

            time.sleep(REFRESH_SECONDS)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f'[WATCHDOG] loop err: {e}')
            time.sleep(min(REFRESH_SECONDS, 30))


if __name__ == '__main__':
    raise SystemExit(main())
