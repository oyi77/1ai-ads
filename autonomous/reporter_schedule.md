# reporter_schedule.md
Generated: 2026-06-06T05:07:44.457203+00:00

## Daily Reporter @ 00:10 WIB
Script: `autonomy/reporter/daily_telegram_reporter.py`
Sender: Telegram user `@alwayscuanbos`, chat_id `157228659`

## Failover
- Jika `daily_telegram_reporter.py` fail: gunakan `basic_telegram_cron.md`.
- Log di `logs/reporter_cron.log` dan `logs/reporter_err.log`.
