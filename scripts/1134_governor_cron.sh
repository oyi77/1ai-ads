#!/bin/bash
# Vilona 1134 Governor — Cron wrapper
# Runs every 15 minutes
# Add to crontab: */15 * * * * /home/openclaw/projects/1ai-ads/scripts/1134_governor_cron.sh
source /home/openclaw/projects/1ai-ads/.env 2>/dev/null
cd /home/openclaw/projects/1ai-ads
python3 scripts/1134_autonomous_governor.py >> logs/1134_governor_cron.log 2>&1
