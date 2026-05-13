# Skill: 1ai-ads-manager

**Base directory**: /home/openclaw/projects/1ai-ads

Manage and monitor advertising campaigns, landing pages, and creatives across multiple platforms (Meta, Google, TikTok) using the 1ai-ads system.

## Usage

This skill allows agents to:
1. List and analyze campaign performance metrics.
2. View generated landing pages and their status.
3. Manage ad creative and copy stored in the 1ai-ads database.

## Available Tools

### 1ai-ads_list_campaigns
List all advertising campaigns and their performance metrics (spend, revenue, impressions, clicks, ROAS).
- `platform` (optional): Filter by platform ("meta", "google", "tiktok").

### 1ai-ads_get_analytics
Get detailed performance metrics for a specific campaign ID.
- `campaign_id` (required): The unique ID of the campaign.

### 1ai-ads_list_landing_pages
List all generated landing pages, including their templates, themes, and publishing status.

### 1ai-ads_list_creatives
List all generated ad creatives and copy variations.

## Integration

To add this to your OpenClaw environment, add the following to your MCP configuration:

```json
{
  "mcpServers": {
    "1ai-ads": {
      "command": "node",
      "args": ["/home/openclaw/projects/1ai-ads/mcp.js"],
      "env": {
        "DB_PATH": "/home/openclaw/projects/1ai-ads/db/1ai-ads.db"
      }
    }
  }
}
```
