#!/bin/bash
# Fail-safe: if guardian is dead > 1 hour, PAUSE ALL 0858 campaigns
GUARDIAN_PID=$(pgrep -f "vilona_0858_guardian")
LOG="/home/openclaw/.openclaw/workspace/logs/failsafe_0858.log"
STATE="/home/openclaw/.openclaw/workspace/data/0858_guardian_state.json"

if [ -z "$GUARDIAN_PID" ]; then
    # Guardian is dead - check last state time
    if [ -f "$STATE" ]; then
        LAST=$(python3 -c "import json; s=json.load(open('$STATE')); print(s.get('cycle_count',0))" 2>/dev/null)
        echo "[$(date '+%H:%M:%S')] ⚠️ GUARDIAN DEAD! Last cycle: #$LAST" >> "$LOG"
        
        # EMERGENCY: PAUSE ALL campaigns
        python3 -c "
import requests, sys, time
sys.path.insert(0, '/home/openclaw/.openclaw/workspace/scripts')
from ads_dashboard import ACCESS_TOKEN as TOKEN
API='https://graph.facebook.com/v19.0'
ACT='act_435670549443081'
r=requests.get(f'{API}/{ACT}/campaigns', params={'access_token': TOKEN, 'fields': 'id,name,effective_status', 'limit': 100}, timeout=15).json()
paused=0
for c in r.get('data',[]):
    if c.get('effective_status') in ('ACTIVE','IN_PROCESS'):
        resp=requests.post(f'{API}/{c[\"id\"]}', params={'access_token': TOKEN}, data={'status': 'PAUSED'}, timeout=15).json()
        if resp.get('success'): paused+=1
        time.sleep(0.3)
print(f'🆘 FAILSAFE: {paused} campaigns emergency-paused')
" >> "$LOG" 2>&1
        
        # Try restart guardian
        cd /home/openclaw/.openclaw/workspace
        nohup python3 scripts/vilona_0858_guardian.py >> logs/vilona_0858_guardian.log 2>&1 &
        echo "[$(date '+%H:%M:%S')] 🔄 Guardian auto-restarted" >> "$LOG"
    fi
fi
