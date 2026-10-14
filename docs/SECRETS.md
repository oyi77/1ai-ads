# Secrets & Key Management Runbook (1ai-ads)

## What is protected where

| Secret | Storage | Encryption |
|--------|---------|------------|
| Platform OAuth tokens (Meta/Google/…) | `platform_accounts.credentials` | **AES-256-GCM** (`server/lib/crypto.js`) |
| LLM provider key (`llm_config.apiKey`) | `settings` row `llm_config` | **AES-256-GCM**, `enc:v1:` prefixed |
| LLM fallback key | `.env` `OMNIROUTE_API_KEY` | plaintext file (gitignored) |
| JWT / refresh tokens | cookie (httpOnly) + `refresh_tokens` table | signed; hash-stored |
| `JWT_SECRET`, `ENCRYPTION_KEY` | `.env` | plaintext file (gitignored) — **the root of trust** |

`ENCRYPTION_KEY` is a 64-hex (32-byte) key. **Losing or rotating it without
re-encrypting makes every encrypted value unreadable** (the read path fails
safe: it returns no key rather than crashing — see `settings.js` `decryptSecrets`).

## Rotating the LLM / 9router key

1. Create the new key on 9router (per-service keys — one per consuming app).
2. Update `.env`:
   ```bash
   OMNIROUTE_API_KEY=<new>
   ```
3. Save it via the admin Settings UI (Settings → AI Configuration → Save), which
   re-encrypts it into `settings.llm_config`, **or** let the boot hydration in
   `server/app/services.js` pick it up from `.env`.
4. Recreate the container: `docker compose up -d --force-recreate 1ai-ads`.
5. Verify: `docker logs --since 2m 1ai-ads | grep -i 'LLM API Error'` → empty, and
   `curl -s localhost:5000/health | jq .aiPlane` → `configured: true`.

## Purging a leaked key from git history

If a key was ever committed (e.g. the old `sk-f0c1dd…` in `opencode.json`):

1. **Rotate first** — assume the old value is public; revoke it upstream.
2. Rewrite history locally:
   ```bash
   git filter-repo --replace-text <(printf 'sk-OLD…==>REDACTED\n')
   ```
3. Force-push and tell every collaborator to re-clone:
   ```bash
   git push --force-with-lease origin main
   ```
4. Enable GitHub secret scanning / push protection on the repo.

## Offsite backups

The in-app job (`server/bot/scheduler/jobs/db-backup.js`) writes WAL-safe local
snapshots to `./backups` (keeps 7 triplets). **Those are on the same disk** — run
`scripts/backup-offsite.sh` nightly for real durability:

```bash
cp backup.env.example backup.env   # pick a target, fill creds
./scripts/backup-offsite.sh --install   # nightly systemd user timer @ 03:30
```

Restore is a **triple**: `adforge.db.<ts>.backup` + `-wal` + `-shm` must be
copied together (the main file alone can hold a near-empty snapshot).

## Redaction in logs

`server/lib/platform-client.js` `redactSecretsForLogs()` scrubs `access_token`,
`EAA…` tokens and friends before they reach the logger. Any new provider client
MUST route URLs/messages through it.
