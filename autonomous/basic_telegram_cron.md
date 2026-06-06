# basic_telegram_cron.md

Fallback Telegram reporter jika modul reporter gagal.
Gunakan cron/systemd timer kirim laporan teks dari file.

## systemd unit minimal
```ini
[Unit]
Description=Telegram Daily Reporter

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /home/openclaw/projects/1ai-ads/autonomy/reporter/daily_telegram_reporter.py
```

## cron
```cron
10 0 * * * /usr/bin/python3 /home/openclaw/projects/1ai-ads/autonomy/reporter/daily_telegram_reporter.py >> /home/openclaw/projects/1ai-ads/logs/reporter_cron.log 2>&1
```
