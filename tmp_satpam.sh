#!/usr/bin/env bash
set -euo pipefail

proj=/home/openclaw/projects/1ai-ads
cd "$proj"

token=$(grep '^META_ACCESS_TOKEN=*** "$proj/.env" | head -1 | cut -d= -f2-)
act=380721031313330
api="https://graph.facebook.com/v22.0"
now=$(date '+%Y-%m-%d %H:%M:%S')

curl_get() {
  curl -sS -G "$1" \
    --data-urlencode "fields=$3" \
    --data-urlencode "limit=200" \
    --data-urlencode "access_token=$token"
  sleep 0.5
}

campaigns_json=$(curl_get "$api/act_$act/campaigns" dummy "id,name,status" || true)
count=$(printf '%s' "$campaigns_json" | jq 'if type=="object" and has("data") then (.data|length) else 0 end')
if [ "$count" -eq 0 ]; then
  campaigns_json=$(curl_get "$api/$act/campaigns" dummy "id,name,status" || true)
fi

seven_ago=$(date -d '6 days ago' +%Y-%m-%d)
today=$(date +%Y-%m-%d)
time_range=$(printf '{"since":"%s","until":"%s"}' "$seven_ago" "$today")
insights_json=$(curl -sS -G "$api/act_$act/insights" \
  --data-urlencode "fields=campaign_id,campaign_name,spend,clicks,cpc,ctr" \
  --data-urlencode "time_range=$time_range" \
  --data-urlencode "level=campaign" \
  --data-urlencode "limit=200" \
  --data-urlencode "access_token=$token"; sleep 0.5)

jq -n \
  --argjson campaigns "$campaigns_json" \
  --argjson insights "$insights_json" '
  def tof: (. // "0" | tonumber // 0);
  def floatv: (. // "0" | tostring | tonumber // 0);
  ($insights | if type=="object" and has("data") then .data else [] end
   | map({key:(.campaign_id|tostring), value:{spend:(.spend|floatv), clicks:(.clicks|tof|floor), cpc:(.cpc // ((.spend|floatv)/(.clicks|tof)) // 0)}}) | from_entries) as $map |

