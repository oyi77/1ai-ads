# White-Label Bot Architecture Decision

**Date:** 2026-08-27
**Status:** DECIDED — Shared bot with Enterprise white-label upsell path

---

## Decision

**AdForge uses a single shared Telegram bot (`@vilonaaiadsbot`) for all customers.**

White-label bot provisioning is **deferred** to Enterprise tier with a documented upsell path.

---

## Trade-off Analysis

| Dimension | Shared Bot (Chosen) | Per-Customer Bot |
|-----------|---------------------|------------------|
| **Time to market** | ✅ Already working | 2-4 weeks additional |
| **Ops complexity** | ✅ Single webhook, single token | BotFather provisioning, token encryption, per-bot webhook routing, health monitoring per bot |
| **Rate limits** | Shared 30 msg/sec | Isolated per bot |
| **White-label** | ❌ Customers see `@vilonaaiadsbot` | ✅ Custom bot username per customer |
| **Branding** | Limited to Mini App | Full bot username, profile, commands |
| **Revenue impact** | All customers on shared bot | Enterprise upsell ($500-2000/mo per white-label) |

---

## Shared Bot Implementation (Current)

### Architecture
- Single `@vilonaaiadsbot` token in `TELEGRAM_BOT_TOKEN`
- Webhook at `/webhook/telegram` on shared domain
- Multi-tenant isolation via `identify` middleware (`ctx.userId` from Telegram ID → local user)
- All commands, scenes, callbacks scoped to `ctx.userId`

### Customer-Facing Reality
- Customers interact with `@vilonaaiadsbot` in Telegram
- Bot name: "AdForge"
- Commands visible: `/start`, `/menu`, `/ads`, `/create`, `/monitor`, `/status`, `/settings`, `/pricing`, `/help`
- Mini App button opens `https://adforge.aitradepulse.com`

### Limitations
- Cannot change bot username/profile per customer
- Rate limits shared across all customers
- Webhook URL fixed to main domain
- All customers see same bot name in chat list

---

## Enterprise White-Label Path (Deferred)

### Prerequisites
1. **BotFather provisioning flow** — Automated via BotFather API (or manual handoff)
2. **Token encryption** — AES-256-GCM at rest, KMS-managed keys
3. **Webhook routing** — Per-bot webhook URL mapping (`/webhook/bot/{botId}`)
4. **Health monitoring** — Per-bot uptime, error rates, latency

### Implementation Plan (When Needed)

```typescript
// New models
interface WhiteLabelBot {
  id: string;
  tenantId: string;
  botTokenEncrypted: string;  // AES-256-GCM
  botUsername: string;
  webhookUrl: string;
  status: 'provisioning' | 'active' | 'error';
  createdAt: Date;
}

// New service
class WhiteLabelBotService {
  async provision(tenantId: string, desiredUsername: string): Promise<WhiteLabelBot>
  async revoke(botId: string): Promise<void>
  async rotateToken(botId: string): Promise<string>
  async getHealth(botId: string): Promise<BotHealth>
}

// New router
app.use('/webhook/bot/:botId', createBotWebhookRouter(whiteLabelBotService));
```

### Provisioning Flow
1. Admin triggers "Enable White-Label Bot" for tenant
2. System calls BotFather API: `createNewBot` with username
3. Encrypt returned token → store in `white_label_bots`
4. Register webhook: `POST /setWebhook` to `{domain}/webhook/bot/{botId}`
5. Health check → mark `active`
6. Notify tenant with their bot username + Mini App branding instructions

### Pricing
- **Setup fee:** $500 (covers BotFather provisioning, webhook setup)
- **Monthly:** $200-500/mo (covers token rotation, monitoring, dedicated rate limits)
- **Enterprise tier only** — not available on Pro/Free

---

## Documentation for Customers

### Current (Shared Bot)
> "AdForge operates your ads via our managed Telegram bot (@vilonaaiadsbot). All notifications, commands, and Mini App access go through this bot."

### Enterprise White-Label (Future)
> "Bring your own bot token or let us provision a dedicated bot for your brand. Your customers interact with *your* bot username, with your logo and custom commands. Includes dedicated rate limits and token rotation."

---

## Decision Rationale

1. **80/20 rule** — 95% of customers don't need white-label bot; shared bot covers core value (automation, reports, Mini App)
2. **Engineering cost** — Per-customer bot infrastructure is 3-4 weeks; shared bot works *today*
3. **Revenue timing** — Can upsell white-label later to Enterprise customers who actually need it
4. **Risk reduction** — Single bot = single point of failure to monitor; easier debugging

---

## Next Steps

- [x] Document decision in PARITY-ROADMAP.md
- [x] Document shared bot limitations in customer-facing FAQ
- [ ] When first Enterprise customer requests white-label: implement provisioning flow
- [ ] Add `white_label_bot` table migration when needed
- [ ] Build BotFather provisioning automation when needed

---

**Approved by:** Engineering lead
**Review date:** 2027-02-27 (6 months)