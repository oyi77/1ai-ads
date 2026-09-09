import json, urllib.request, urllib.parse, time
from datetime import datetime

ACT_ID = "act_380721031313330"
BASE = f"https://graph.facebook.com/v22.0/{ACT_ID}"
TOKEN_FILE = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    with open(TOKEN_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith("FB_SYSTEM_TOKEN=***                return line.split("=", 1)[1]
            if line.startswith("META_ACCESS_TOKEN=***                return line.split("=", 1)[1]
    raise SystemExit("Token not found")

TOKEN = load_t... and cleanup
old = load_old_payload()
used_names = {tuple(x[:2]) for x in old["used_rename"] + old["used_winner"] + old["used_off"]}
actions_winner = [x for x in actions_winner if tuple(x[:2]) not in used_names]
actions_off = [x for x in actions_off if tuple(x[:2]) not in used_names]

old["used_winner"].extend([tuple(x[:2]) for x in actions_winner])
old["used_off"].extend([tuple(x[:2]) for x in actions_off])
old["history"].append({
    "hour_min": hour_min,
    "active": len(active_ids),
    "global_cpc": global_cpc,
    "mode": mode,
    "actions": {
        "off": actions_off,
        "pause": actions_pause,
        "watch": actions_watch,
        "winner": actions_winner,
        "lc_scale": actions_lc_scale,
    }
})
write_payload(old)

except Exception as e:
    print(f"FATAL DECISION ENGINE ERROR: {e}")
    raise