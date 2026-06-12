import os
from pathlib import Path

env_path = Path("/home/openclaw/projects/1ai-ads/.env")
tk_path = Path("/tmp/_tk_1134.txt")

token = None
for line in env_path.read_text().splitlines():
    if not line or line.startswith("#"):
        continue
    if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
        token = line.split("=", 1)[1].strip()
        break

if not token:
    raise SystemExit("META_ACCESS_TOKEN missing from %s" % env_path)

tk_path.write_text(token)
print("wrote %d chars to %s" % (len(token), tk_path))
