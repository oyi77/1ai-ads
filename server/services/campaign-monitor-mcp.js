import { createLogger } from '../lib/logger.js';
import { AutonomousAgent } from '../services/autonomous-agent.js';

const log = createLogger('mcp-campaign-monitor');

// MCP (Model Context Protocol) server for campaign monitoring
// Provides tools for autonomous campaign management

export class CampaignMonitorMCP {
  constructor(autonomousAgent) {
    this.agent = autonomousAgent;
    this.tools = this._createTools();
  }

  _createTools() {
    return {
      check_campaigns: {
        description: 'Check all campaigns and apply automation rules. Returns actions taken.',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID to check campaigns for' },
            auto_apply: { type: 'boolean', description: 'Automatically apply suggested actions', default: true }
          },
          required: ['user_id']
        },
        handler: async (params) => {
          const { user_id, auto_apply = true } = params;
          const results = await this.agent.checkCampaigns(user_id);
          
          if (auto_apply) {
            log.info('Auto-applying campaign actions', { userId: user_id, count: results.length });
          }
          
          return {
            success: true,
            user_id: user_id,
            actionsTaken: results.length,
            results: results
          };
        }
      },
      
      create_rule: {
        description: 'Create a new automation rule for campaign management',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID' },
            name: { type: 'string', description: 'Rule name' },
            condition: { type: 'object', description: 'Condition object (e.g., {type: "roas", operator: ">", value: 2.0})' },
            action: { type: 'object', description: 'Action object (e.g., {type: "scale_up", amount: 1.5})' },
            priority: { type: 'integer', description: 'Rule priority (lower = higher priority)', default: 1 },
            enabled: { type: 'boolean', description: 'Enable rule immediately', default: true }
          },
          required: ['user_id', 'name', 'condition', 'action']
        },
        handler: async (params) => {
          const rule = this.agent.createRule(
            params.user_id,
            { name: params.name, condition: params.condition, action: params.action, priority: params.priority, enabled: params.enabled }
          );
          
          return {
            success: true,
            rule_id: rule,
            message: 'Rule created successfully'
          };
        }
      },
      
      get_accounts: {
        description: 'Get available Meta business accounts for a user',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID' }
          },
          required: ['user_id']
        },
        handler: async (params) => {
          const { user_id } = params;
          const accounts = await this.agent.getFacebookAccounts(user_id);
          
          return {
            success: true,
            accounts: accounts
          };
        }
      },
      
      connect_account: {
        description: 'Connect a Facebook account for management',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID' },
            account_id: { type: 'string', description: 'Facebook account ID' },
            account_name: { type: 'string', description: 'Account name' },
            access_token: { type: 'string', description: 'Facebook access token' }
          },
          required: ['user_id', 'account_id', 'account_name', 'access_token']
        },
        handler: async (params) => {
          const linkResult = await this.agent.linkFacebookAccount(
            params.user_id,
            params.account_id,
            params.account_name,
            params.access_token
          );
          
          return {
            success: true,
            link_result: linkResult,
            message: 'Account connected successfully'
          };
        }
      },
      
      generate_report: {
        description: 'Generate daily campaign performance report',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID' },
            period: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'daily' }
          },
          required: ['user_id']
        },
        handler: async (params) => {
          const { user_id, period = 'daily' } = params;
          const report = await this.agent.sendDailyReport(user_id);
          
          return {
            success: true,
            report: report
          };
        }
      },
      
      set_autonomy_level: {
        description: 'Set autonomous mode level',
        parameters: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User ID' },
            level: { type: 'string', enum: ['off', 'manual', 'semi_auto', 'fully_auto'], default: 'off' }
          },
          required: ['user_id']
        },
        handler: async (params) => {
          // This should integrate with settings repo
          return {
            success: true,
            message: `Autonomous level set to ${params.level} (requires settings integration)`
          };
        }
      }
    };
  }

  // MCP server interface
  getHandlers() {
    const handlers = {};
    for (const [name, tool] of Object.entries(this.tools)) {
      handlers[name] = tool.handler;
    }
    return handlers;
  }

  // Get tool definitions for MCP
  getDefinitions() {
    return Object.entries(this.tools).map(([name, tool]) => ({
      name: name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
}
