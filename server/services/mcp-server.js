import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from '../lib/logger.js';

const log = createLogger('mcp-server');

export function createAdForgeMCPServer(campaignsRepo, landingRepo, adsRepo) {
  const server = new Server(
    {
      name: "adforge-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "adforge_list_campaigns",
          description: "List all advertising campaigns and their performance metrics",
          inputSchema: {
            type: "object",
            properties: {
              platform: { type: "string", enum: ["meta", "google", "tiktok"], description: "Filter by platform" }
            }
          },
        },
        {
          name: "adforge_get_analytics",
          description: "Get performance analytics for a specific campaign",
          inputSchema: {
            type: "object",
            properties: {
              campaign_id: { type: "string", description: "The ID of the campaign" }
            },
            required: ["campaign_id"]
          },
        },
        {
          name: "adforge_list_landing_pages",
          description: "List all generated landing pages",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "adforge_list_creatives",
          description: "List all generated ad creatives/copy",
          inputSchema: { type: "object", properties: {} },
        }
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "adforge_list_campaigns": {
          const campaigns = campaignsRepo.getAll();
          const filtered = args?.platform ? campaigns.filter(c => c.platform === args.platform) : campaigns;
          return {
            content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
          };
        }

        case "adforge_get_analytics": {
          const campaign = campaignsRepo.getById(args.campaign_id);
          if (!campaign) throw new Error("Campaign not found");
          return {
            content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }],
          };
        }

        case "adforge_list_landing_pages": {
          const pages = landingRepo.getAll();
          return {
            content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
          };
        }

        case "adforge_list_creatives": {
          const ads = adsRepo.getAll();
          return {
            content: [{ type: "text", text: JSON.stringify(ads, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  return server;
}
