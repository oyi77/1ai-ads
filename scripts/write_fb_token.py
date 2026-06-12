import json
from pathlib import Path

ENV_PATH = Path('/home/openclaw/projects/1ai-ads/.env').resolve()
OUT_PATH = Path('/tmp/fb_token.txt')
key = 'META_ACCESS_TOKEN'
for line in ENV_PATH.read_text().splitlines():
    if not line or line.startswith('#'):
        continue
    k, sep, v = line.partition('=')
    if sep and k.strip() == key:
        OUT_PATH.write_text(v.strip())
        print('TOKEN_WRITTEN')
        raise SystemExit
raise SystemExit('TOKEN_MISSING')
