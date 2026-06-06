# service_files.md
Daftar service systemd --user yang terdeteksi di server.

| service | status | Restart | RestartSec | Type | After |
|---|---|---|---|---|---|
| vilona-trakpro-0858.service | ok | always | 30 | simple | network-online.target |
| vilona-0858-guardian.service | ok | always | 30 | simple | network.target |
| vilona-trakpro-1134.service | ok | always | 30 | simple | network-online.target |
| vilona-guardian.service | ok | always | 10 | simple | network.target |
| autonomous_watchdog.service | missing | - | - | - | - |
| vilona-tradefx-bot.service | ok | always | 5 | simple | network-online.target |
| vilona-trakpro.service | ok | on-failure | 30 | simple | network-online.target |
