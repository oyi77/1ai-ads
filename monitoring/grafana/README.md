# AdForge — Grafana Dashboard (P3e)

`adforge-dashboard.json` is a provisionable Grafana dashboard for the metrics
emitted by `/metrics` (DEF-14, prom-client). Import via **Dashboards → New →
Import**, or provision it into a Grafana `dashboards/` directory.

## Panels

| Panel | Metric | Why |
|---|---|---|
| HTTP requests by path | `adforge_http_requests_total` | Traffic and error shape |
| Webhook DLQ depth | `adforge_webhook_dlq_depth` | Alert when > 0 for 10m |
| Active connections | `adforge_active_connections` | Capacity signal |
| Campaign spend | `adforge_campaign_spend_total` | Spend by platform |
| Revenue | `adforge_revenue_total` | Revenue by platform |
| Autonomous decisions | `adforge_autonomous_actions_total` | executed vs blocked |
| Rule fires | `adforge_rule_fires_total` | Automation behaviour |

## Alerting

Recommended Prometheus rules (not part of the dashboard JSON):

```yaml
groups:
  - name: adforge
    rules:
      - alert: AdForgeWebhookDLQBacklog
        expr: adforge_webhook_dlq_depth > 0
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: Webhook events are sitting in the dead-letter queue
      - alert: AdForgeHighErrorRate
        expr: sum(rate(adforge_http_requests_total{status=~"5.."}[5m])) / sum(rate(adforge_http_requests_total[5m])) > 0.05
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: AdForge 5xx rate above 5%
```

## Notes

- Labels use `user_id_hash` (sha256-8), never a raw user ID.
- Business metrics are written by `server/lib/metrics.js`; HTTP/DB metrics
  by the same module's `metricsMiddleware`.
- The `datasource` template variable defaults to the first Prometheus DS on
  import; select the correct one in Grafana if multiple are configured.
