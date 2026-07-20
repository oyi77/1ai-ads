import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from '../lib/logger.js';
import { calculateProfit, evaluateROAS, getCampaignStatus } from './profitability-calculator.js';

const log = createLogger('mcp-server');

export function create1aiAdsMCPServer(campaignsRepo, landingRepo, adsRepo, services = {}) {
  const { adGenerator, creativeStudio, aiAgent, competitorSpyService: competitorSpy, autoOptimizer, llmClient: _llmClient } = services;

  const server = new Server(
    {
      name: "1ai-ads-server",
      version: "2.0.0",
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
          name: "1ai-ads_list_campaigns",
          description: "List all advertising campaigns and their performance metrics",
          inputSchema: {
            type: "object",
            properties: {
              platform: { type: "string", enum: ["meta", "google", "tiktok"], description: "Filter by platform" }
            }
          },
        },
        {
          name: "1ai-ads_get_analytics",
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
          name: "1ai-ads_list_landing_pages",
          description: "List all generated landing pages",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "1ai-ads_list_creatives",
          description: "List all generated ad creatives/copy",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "1ai-ads_generate_ad_copy",
          description: "Generate 4 ad copy variations using P.A.S, Efek Gravitasi, Hasil x3, Prospects-to-Prospects models",
          inputSchema: {
            type: "object",
            properties: {
              product: { type: "string", description: "Product name and description" },
              target: { type: "string", description: "Target audience" },
              keunggulan: { type: "string", description: "Product advantages/USP" }
            },
            required: ["product", "target", "keunggulan"]
          },
        },
        {
          name: "1ai-ads_generate_creative_package",
          description: "Generate complete ad package: copy, image directions, video script, targeting suggestions",
          inputSchema: {
            type: "object",
            properties: {
              product: { type: "string", description: "Product name and description" },
              target: { type: "string", description: "Target audience" },
              keunggulan: { type: "string", description: "Product advantages/USP" },
              platform: { type: "string", enum: ["meta", "google", "tiktok"], description: "Target platform" }
            },
            required: ["product", "target", "keunggulan"]
          },
        },
        {
          name: "1ai-ads_get_ai_suggestions",
          description: "Get AI-powered optimization suggestions for campaigns and ads",
          inputSchema: {
            type: "object",
            properties: {
              user_id: { type: "string", description: "User ID to get suggestions for" }
            },
            required: ["user_id"]
          },
        },
        {
          name: "1ai-ads_apply_suggestion",
          description: "Apply an AI suggestion to optimize a campaign or ad",
          inputSchema: {
            type: "object",
            properties: {
              suggestion_id: { type: "string", description: "The suggestion ID to apply" },
              user_id: { type: "string", description: "User ID who owns the suggestion" }
            },
            required: ["suggestion_id", "user_id"]
          },
        },
        {
          name: "1ai-ads_list_suggestions",
          description: "List all pending and applied AI suggestions",
          inputSchema: {
            type: "object",
            properties: {
              user_id: { type: "string", description: "User ID to filter suggestions" },
              status: { type: "string", enum: ["pending", "applied", "all"], description: "Filter by status" }
            },
            required: ["user_id"]
          },
        },
        {
          name: "1ai-ads_analyze_competitor",
          description: "Analyze a competitor's ads and landing pages",
          inputSchema: {
            type: "object",
            properties: {
              competitor_url: { type: "string", description: "Competitor website or Facebook page URL" }
            },
            required: ["competitor_url"]
          },
        },
        {
          name: "1ai-ads_get_automation_rules",
          description: "List all automation rules for campaign optimization",
          inputSchema: {
            type: "object",
            properties: {
              user_id: { type: "string", description: "User ID to filter rules" }
            },
            required: ["user_id"]
          },
        },
        {
          name: "1ai-ads_create_campaign",
          description: "Create a new advertising campaign",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Campaign name" },
              platform: { type: "string", enum: ["meta", "google", "tiktok"], description: "Target platform" },
              budget: { type: "number", description: "Daily budget in local currency" },
              objective: { type: "string", description: "Campaign objective (conversions, traffic, reach)" }
            },
            required: ["name", "platform", "budget"]
          },
        },
        {
          name: "1ai-ads_selow_list_accounts",
          description: "List all SELOW ad accounts with balance info",
          inputSchema: {
            type: "object",
            properties: {
              search: { type: "string", description: "Search filter" },
              status: { type: "string", description: "Status filter" }
            }
          },
        },
        {
          name: "1ai-ads_selow_topup",
          description: "Initiate topup for a SELOW ad account",
          inputSchema: {
            type: "object",
            properties: {
              account_id: { type: "string", description: "SELOW account ID" },
              amount: { type: "number", description: "Topup amount in Rp" },
              merchant: { type: "string", description: "Payment merchant (bri, bca, mandiri)" }
            },
            required: ["account_id", "amount"]
          },
        },
        {
          name: "1ai-ads_check_profitability",
          description: "Check campaign profitability using IKLAN_WORKFLOW formula (Profit = Commission - Spend×1.06)",
          inputSchema: {
            type: "object",
            properties: {
              campaign_id: { type: "string", description: "Campaign ID" },
              commission: { type: "number", description: "Affiliate commission in Rp" },
              spend: { type: "number", description: "Total ad spend in Rp" }
            },
            required: ["campaign_id", "commission", "spend"]
          },
        },
        {
          name: "1ai-ads_run_workflow",
          description: "Run IKLAN_WORKFLOW daily check or 3-day evaluation",
          inputSchema: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["daily_check", "3day_eval", "weekly_cycle"], description: "Workflow action" },
              campaign_id: { type: "string", description: "Campaign ID (required for 3day_eval)" },
              user_id: { type: "string", description: "User ID" }
            },
            required: ["action", "user_id"]
          },
        },
        {
          name: "1ai-ads_trigger_scale",
          description: "Trigger scale-up for a winning campaign — duplicate with new interests",
          inputSchema: {
            type: "object",
            properties: {
              campaign_id: { type: "string", description: "Winning campaign ID to scale" },
              account_id: { type: "string", description: "Meta ad account ID" },
              product: { type: "string", description: "Product name for interest generation" }
            },
            required: ["campaign_id", "account_id", "product"]
          },
        },
        {
          name: "1ai-content_generate_video",
          description: "Request video generation from 1ai-content service (cross-project)",
          inputSchema: {
            type: "object",
            properties: {
              niche: { type: "string", description: "Product niche (fashion, fb, tech, health, travel)" },
              duration: { type: "number", description: "Video duration in seconds (5-60)" },
              customPrompt: { type: "string", description: "Custom prompt for video generation" },
              platform: { type: "string", description: "Target platform (tiktok, instagram, facebook)" }
            },
            required: ["niche", "duration"]
          },
        },
        {
          name: "1ai-content_list_videos",
          description: "List videos from 1ai-content service",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "1ai-content_health",
          description: "Check 1ai-content service health",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "1ai-social_post_fanpage",
          description: "Post content to Facebook Fanpage via GoLogin (cross-project to 1ai-social)",
          inputSchema: {
            type: "object",
            properties: {
              profile_id: { type: "string", description: "GoLogin browser profile ID" },
              page_id: { type: "string", description: "Facebook page ID" },
              message: { type: "string", description: "Post content/caption" },
              image_url: { type: "string", description: "Optional image URL" }
            },
            required: ["profile_id", "page_id", "message"]
          },
        },
        {
          name: "1ai-social_health",
          description: "Check 1ai-social service health",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
  });

  const TOOL_HANDLERS = {
    '1ai-ads_list_campaigns': async (args) => {
      const campaigns = campaignsRepo.getAll();
      const filtered = args?.platform ? campaigns.filter(c => c.platform === args.platform) : campaigns;
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    },

    '1ai-ads_get_analytics': async (args) => {
      const campaign = campaignsRepo.getById(args.campaign_id);
      if (!campaign) throw new Error("Campaign not found");
      return { content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] };
    },

    '1ai-ads_list_landing_pages': async (_args) => {
      const pages = landingRepo.getAll();
      return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
    },

    '1ai-ads_list_creatives': async (_args) => {
      const ads = adsRepo.getAll();
      return { content: [{ type: "text", text: JSON.stringify(ads, null, 2) }] };
    },

    '1ai-ads_generate_ad_copy': async (args) => {
      if (!adGenerator) throw new Error("AdGenerator service not available");
      const result = await adGenerator.generateAds(args.product, args.target, args.keunggulan);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-ads_generate_creative_package': async (args) => {
      if (!creativeStudio) throw new Error("CreativeStudio service not available");
      const result = await creativeStudio.generateAdPackage(args.product, args.target, args.keunggulan, args.platform || 'meta');
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-ads_get_ai_suggestions': async (args) => {
      if (!aiAgent) throw new Error("AiAgent service not available");
      if (!args.user_id) throw new Error("user_id is required");
      const suggestions = await aiAgent.analyzeAndSuggest(args.user_id);
      return { content: [{ type: "text", text: JSON.stringify({ suggestions_created: suggestions }, null, 2) }] };
    },

    '1ai-ads_apply_suggestion': async (args) => {
      if (!aiAgent) throw new Error("AiAgent service not available");
      if (!args.user_id) throw new Error("user_id is required");
      const result = await aiAgent.applySuggestion(args.user_id, args.suggestion_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-ads_list_suggestions': async (args) => {
      if (!aiAgent?.suggestionsRepo) throw new Error("Suggestions repository not available");
      if (!args.user_id) throw new Error("user_id is required");
      const status = args.status || 'all';
      const suggestions = aiAgent.suggestionsRepo.getByUserId
        ? aiAgent.suggestionsRepo.getByUserId(args.user_id)
        : [];
      const filtered = status === 'all' ? suggestions : suggestions.filter(s => s.status === status);
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    },

    '1ai-ads_analyze_competitor': async (args) => {
      if (!competitorSpy) throw new Error("CompetitorSpy service not available");
      const result = await competitorSpy.analyzePage(args.competitor_url);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-ads_get_automation_rules': async (args) => {
      const rules = autoOptimizer?.rulesRepo?.getByUserId
        ? autoOptimizer.rulesRepo.getByUserId(args.user_id)
        : [];
      return { content: [{ type: "text", text: JSON.stringify(rules, null, 2) }] };
    },

    '1ai-ads_create_campaign': async (args) => {
      const campaign = campaignsRepo.create({
        name: args.name,
        platform: args.platform,
        budget: args.budget,
        objective: args.objective || 'conversions',
        status: 'draft',
        created_at: new Date().toISOString()
      });
      return { content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] };
    },

    '1ai-ads_selow_list_accounts': async (args) => {
      if (!services.selowApi) throw new Error("SELOW API not configured");
      const result = await services.selowApi.listAccounts({ search: args?.search, status: args?.status });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-ads_selow_topup': async (args) => {
      if (!services.selowApi) throw new Error("SELOW API not configured");
      const result = await services.selowApi.topupBalance(args.account_id, args.amount, args.merchant || 'bri');
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-ads_check_profitability': async (args) => {
      const profit = calculateProfit(args.commission, args.spend);
      const roas = evaluateROAS(args.commission, args.spend);
      const status = getCampaignStatus(args.commission, args.spend);
      return { content: [{ type: "text", text: JSON.stringify({ profit, roas, status, campaign_id: args.campaign_id }, null, 2) }] };
    },

    '1ai-ads_run_workflow': async (args) => {
      if (!services.workflowEngine) throw new Error("WorkflowEngine not available");
      const WORKFLOW_ACTIONS = {
        daily_check: () => services.workflowEngine.runDailyCheck(args.user_id),
        '3day_eval': () => {
          if (!args.campaign_id) throw new Error("campaign_id required for 3day_eval");
          return services.workflowEngine.run3DayEvaluation(args.campaign_id);
        },
        weekly_cycle: () => services.workflowEngine.getWeeklyAction(),
      };
      const action = WORKFLOW_ACTIONS[args.action];
      if (!action) throw new Error(`Unknown workflow action: ${args.action}`);
      const result = await action();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-ads_trigger_scale': async (args) => {
      if (!services.scaleManager) throw new Error("ScaleManager not available");
      const interests = await services.scaleManager.expandHiddenInterests(args.product);
      const result = await services.scaleManager.duplicateCampaign(args.account_id, args.campaign_id, interests);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-content_generate_video': async (args) => {
      if (!services.contentBridge) throw new Error("ContentBridge not available");
      const result = await services.contentBridge.requestVideoGeneration({
        niche: args.niche,
        duration: args.duration || 15,
        customPrompt: args.customPrompt,
        platform: args.platform || 'facebook',
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-content_list_videos': async (_args) => {
      if (!services.contentBridge) throw new Error("ContentBridge not available");
      const videos = await services.contentBridge.listVideos();
      return { content: [{ type: "text", text: JSON.stringify(videos, null, 2) }] };
    },

    '1ai-content_health': async (_args) => {
      if (!services.contentBridge) throw new Error("ContentBridge not available");
      const health = await services.contentBridge.healthCheck();
      return { content: [{ type: "text", text: JSON.stringify(health, null, 2) }] };
    },

    '1ai-social_post_fanpage': async (args) => {
      if (!services.socialBridge) throw new Error("SocialBridge not available");
      const result = await services.socialBridge.postToFanpage({
        profileId: args.profile_id,
        pageId: args.page_id,
        message: args.message,
        imageUrl: args.image_url,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },

    '1ai-social_health': async (_args) => {
      if (!services.socialBridge) throw new Error("SocialBridge not available");
      const health = await services.socialBridge.healthCheck();
      return { content: [{ type: "text", text: JSON.stringify(health, null, 2) }] };
    },
  };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const handler = TOOL_HANDLERS[name];
      if (!handler) throw new Error(`Unknown tool: ${name}`);
      return await handler(args);
    } catch (error) {
      log.error('MCP tool error', { tool: name, error: error.message });
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  return server;
}
