#!/usr/bin/env bash
set -euo pipefail

proj=/home/openclaw/projects/1ai-ads
cd "$proj"

token=$(grep '^META_ACCESS_TOKEN=' .env | head -1 | cut -d= -f2-)
act=380721031313330
api="https://graph.facebook.com/v22.0"
now=$(date '+%Y-%m-%d %H:%M:%S')

auth() { echo "?access_token=$token"; }

sleep_for() { sleep 0.5; }

campaigns_json=$(curl -sS -G "$api/act_$act/campaigns" --data-urlencode "fields=id,name,status" --data-urlencode "limit=200" $(auth); sleep_for)
count=$(echo "$campaigns_json" | jq 'if type=="object" and has("data") then (.data|length) else 0 end')
if [ "$count" -eq 0 ]; then
  campaigns_json=$(curl -sS -G "$api/$act/campaigns" --data-urlencode "fields=id,name,status" --data-urlencode "limit=200" $(auth); sleep_for)
fi

seven_ago=$(date -d '6 days ago' +%Y-%m-%d)
today=$(date +%Y-%m-%d)
time_range=$(printf '{"since":"%s","until":"%s"}' "$seven_ago" "$today")
insights_json=$(curl -sS -G "$api/act_$act/insights" \
  --data-urlencode "fields=campaign_id,campaign_name,spend,clicks,cpc,ctr" \
  --data-urlencode "time_range=$time_range" \
  --data-urlencode "level=campaign" \
  --data-urlencode "limit=200" \
  $(auth); sleep_for)

# JQ dependencies
jq -n \
  --arg cj "$campaigns_json" \
  --arg ij "$insights_json" \
  --arg now "$now" '
  def floatv: (. // "0" | tonumber // 0);
  ($cj | fromjson? // {"data":[]}) as $campaigns |
  ($ij | fromjson? // {"data":[]}) as $insights |
  ($insights.data | map({key:(.campaign_id|tostring), value:{spend:(.spend|floatv), clicks:(.clicks|floatv|floor), cpc:(.cpc // ((.spend|floatv)/(.clicks|floatv)) // 0)}}) | from_entries) as $map |

  ([$campaigns.data[]] | length) as $total |
  ([$map[] | .spend] | add // 0) as $spend |
  ([$map[] | .clicks] | add // 0) as $clicks |
  (if $clicks > 0 then ($spend/$clicks) else 0 end) as $global_cpc |

  [
    $campaigns.data[] |
    .id as $id |
    (.name // "") as $name |
    ($map[($id|tostring)] // {spend:0, clicks:0, cpc:0}) as $info |
    ($info.spend) as $spend |
    ($info.clicks) as $clicks |
    $info.cpc as $cpc |
    if $cpc >= 1000 and $spend > 500 then {type:"MONSTER", text:"\($id)|\($name)"}
    elif $cpc >= 500 and $spend > 1000 then {type:"MONSTER", text:"\($id)|\($name)"}
    elif $global_cpc >= 120 and $cpc > 200 and $clicks == 0 and $spend > 500 then {type:"WATCH", text:"\($id)|\($name)"}
    elif $global_cpc >= 120 and $cpc > 200 and $clicks > 0 then {type:"WATCH", text:"\($id)|\($name)"}
    elif $global_cpc < 120 and $cpc < 120 and $clicks > 5 and $spend > 10000 then {type:"WINNER", text:"\($id)|\($name)"}
    elif ($name | test("LC")) and $cpc < 120 and $clicks > 0 then {type:"LC", text:"\($id)|\($name)"}
    else empty end
  ] as $classified |

  ($classified | map(select(.type=="MONSTER")) | map(.text)) as $monster |
  ($classified | map(select(.type=="WATCH")) | map(.text)) as $watch |
  ($classified | map(select(.type=="WINNER")) | map(.text)) as $winner |
  ($classified | map(select(.type=="LC")) | map(.text)) as $lc |

  {
    total:$total,
    global_cpc: $global_cpc,
    monster: $monster,
    watch: $watch,
    winner: $winner,
    lc: $lc
  }'
