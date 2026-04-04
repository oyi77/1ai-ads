# Skill: adforge-manager

**Base directory**: /home/openclaw/projects/adforge

Manage and monitor advertising campaigns, landing pages, and creatives across multiple platforms (Meta, Google, TikTok) using the AdForge system.

## Usage

This skill allows agents to:
1. List and analyze campaign performance metrics.
2. View generated landing pages and their status.
3. Manage ad creative and copy stored in the AdForge database.

## Available Tools

### adforge_list_campaigns
List all advertising campaigns and their performance metrics (spend, revenue, impressions, clicks, ROAS).
- `platform` (optional): Filter by platform ("meta", "google", "tiktok").

### adforge_get_analytics
Get detailed performance metrics for a specific campaign ID.
- `campaign_id` (required): The unique ID of the campaign.

### adforge_list_landing_pages
List all generated landing pages, including their templates, themes, and publishing status.

### adforge_list_creatives
List all generated ad creatives and copy variations.

## Integration

To add this to your OpenClaw environment, add the following to your MCP configuration:

```json
{
  "mcpServers": {
    "adforge": {
      "command": "node",
      "args": ["/home/openclaw/projects/adforge/mcp.js"],
      "env": {
        "DB_PATH": "/home/openclaw/projects/adforge/db/adforge.db"
      }
    }
  }
}
```
