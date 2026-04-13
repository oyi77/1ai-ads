#!/usr/bin/env node

/**
 * AdForge CLI Entry Point
 *
 * Universal command-line interface for AdForge functionality.
 * Powered by OpenCLI - https://github.com/jackwener/opencli
 */

import { program } from 'commander';
import { AdForgeAdapter } from './adapter.js';

// Parse AdForge API URL from arguments
const apiBase = process.argv.find(arg => arg.startsWith('--api-url='))?.split('=')[1] || process.env.ADFORGE_CLI_API_URL || 'http://localhost:3001/api';

// Initialize adapter with API URL
const adapter = new AdForgeAdapter(apiBase);

// ================================
// COMMAND DEFINITIONS
// ================================

program
  .name('adforge')
  .description('AdForge CLI - Universal ad management, competitor spy, and analytics')
  .version('1.0.0')
  .option('--api-url <url>', 'AdForge API URL (default: http://localhost:3001/api)')
  .option('--format <format>', 'Output format: json, table, csv (default: table)')
  .option('--verbose', 'Verbose output');

// ================================
// AUTHENTICATION COMMANDS
// ================================

program
  .command('login')
  .description('Login to AdForge')
  .action(async (options) => {
    const { username, password } = options;

    if (!username || !password) {
      console.error('Error: --username and --password are required');
      process.exit(1);
    }

    try {
      const result = await adapter.login({ username, password });

      console.log(`Welcome, ${result.username}!`);
      console.log(`Plan: ${result.plan.toUpperCase()}`);
      console.log('');
      console.log('Useful commands:');
      console.log('  adforge campaigns list      List all campaigns');
      console.log('  adforge ads search         Search ad library');
      console.log('  adforge trending           Get market trends');
      console.log('  adforge competitors add      Add competitor to track');
    } catch (error) {
      console.error(`Login failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    const result = await adapter.status();

    if (result.authenticated) {
      console.log(`✓ Authenticated as ${result.username || 'user'}`);
      console.log(`Plan: ${(result.plan || 'free').toUpperCase()}`);
    } else {
      console.log('Not authenticated');
      console.log('');
      console.log('Login with: adforge login --username <user> --password <pass>');
    }
  });

// ================================
// CAMPAIGN COMMANDS
// ================================

program
  .command('campaigns')
  .description('Campaign management commands')
  .addCommand('list')
  .argument('[filters...]')
  .description('List all campaigns')
  .action(async (options, filters) => {
    const parsedFilters = parseFilters(filters);

    try {
      const campaigns = await adapter.listCampaigns(parsedFilters);
      displayCampaignsTable(campaigns, options.format, options.verbose);
    } catch (error) {
      console.error(`Failed to list campaigns: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('campaigns')
  .addCommand('get <id>')
  .description('Get campaign details')
  .action(async (options, id) => {
    try {
      const campaign = await adapter.getCampaign(id);
      displayCampaignDetails(campaign, options.verbose);
    } catch (error) {
      console.error(`Failed to get campaign: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('campaigns')
  .addCommand('create')
  .description('Create a new campaign')
  .option('--platform <platform>', 'Platform: meta, google, tiktok')
  .option('--name <name>', 'Campaign name')
  .option('--objective <objective>', 'Campaign objective')
  .option('--budget <amount>', 'Daily budget')
  .option('--status <status>', 'Campaign status (default: paused)')
  .action(async (options) => {
    const { platform, name, objective, budget, status } = options;

    if (!name) {
      console.error('Error: --name is required');
      process.exit(1);
    }

    try {
      const campaign = await adapter.createCampaign({
        platform,
        name,
        objective,
        budget,
        status,
      });

      console.log(`✓ Campaign "${name}" created with ID: ${campaign.id}`);
    } catch (error) {
      console.error(`Failed to create campaign: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('campaigns')
  .addCommand('update <id>')
  .description('Update campaign status, budget, etc.')
  .option('--status <status>', 'New status')
  .option('--budget <amount>', 'New budget')
  .action(async (options, id, status, budget) => {
    try {
      const updates = {};
      if (status) updates.status = status;
      if (budget) updates.budget = parseFloat(budget);

      const campaign = await adapter.updateCampaign(id, updates);
      console.log(`✓ Campaign "${campaign.name}" updated`);
    } catch (error) {
      console.error(`Failed to update campaign: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('campaigns')
  .addCommand('sync')
  .description('Sync all campaigns from connected platforms')
  .option('--platform <platform>', 'Sync specific platform')
  .action(async (options) => {
    const { platform } = options;

    try {
      const result = await adapter.syncCampaigns(platform);
      console.log(`✓ Synced ${platform} campaigns`);
      console.log(`  Accounts synced: ${result.length}`);
    } catch (error) {
      console.error(`Sync failed: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// ADS LIBRARY COMMANDS
// ================================

program
  .command('ads')
  .description('Ads library commands')
  .addCommand('search')
  .argument('<query>')
  .description('Search ad library')
  .option('--platform <platform>', 'Platform: meta, facebook, instagram, google, tiktok, all')
  .option('--country <code>', 'Country code: US, ID, MY, SG, GB, etc.')
  .option('--limit <number>', 'Max results (default: 30)')
  .action(async (options, query, platform, country, limit) => {
    try {
      const result = await adapter.searchAdsLibrary({
        query,
        platform: platform || 'meta',
        country: country || 'US',
        limit: limit || 30,
      });

      displayAdsTable(result, options.format, options.verbose);
      console.log(`\nFound ${result.count} ads from ${result.platform} library`);
    } catch (error) {
      console.error(`Search failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('ads')
  .addCommand('list')
  .description('List all ad creatives')
  .option('--platform <platform>', 'Filter by platform')
  .option('--status <status>', 'Filter by status')
  .option('--limit <number>', 'Max results (default: 20)')
  .action(async (options) => {
    try {
      const creatives = await adapter.listCreatives(options);

      displayCreativesTable(creatives, options.format, options.verbose);
    } catch (error) {
      console.error(`Failed to list creatives: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('ads')
  .addCommand('create')
  .description('Create a new ad creative')
  .option('--platform <platform>', 'Platform')
  .option('--name <name>', 'Creative name')
  .option('--type <type>', 'Ad type: image, video')
  .option('--message <text>', 'Ad message')
  .action(async (options) => {
    const { platform, name, type, message } = options;

    if (!name) {
      console.error('Error: --name is required');
      process.exit(1);
    }

    try {
      const creative = await adapter.createCreative({
        platform,
        name,
        type,
        message,
      });

      console.log(`✓ Creative "${name}" created with ID: ${creative.id}`);
    } catch (error) {
      console.error(`Failed to create creative: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// COMPETITOR SPY COMMANDS
// ================================

program
  .command('competitors')
  .description('Competitor monitoring and analysis')
  .addCommand('list')
  .description('List all tracked competitors')
  .action(async () => {
    try {
      const competitors = await adapter.listCompetitors();

      if (competitors.length === 0) {
        console.log('No competitors tracked yet.');
        console.log('Use: adforge competitors add <url>');
        return;
      }

      displayCompetitorsTable(competitors, options.format, options.verbose);
    } catch (error) {
      console.error(`Failed to list competitors: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('competitors')
  .addCommand('add <url>')
  .description('Add a competitor to track')
  .option('--platform <platform>', 'Platform: meta, google, tiktok')
  .option('--name <name>', 'Competitor name')
  .action(async (options, url, platform, name) => {
    try {
      const competitor = await adapter.addCompetitor({
        url,
        platform: platform || 'all',
        name: name || new URL(url).hostname,
      });

      console.log(`✓ Competitor "${name}" added for tracking`);
      console.log('Use: adforge competitors analyze <id> to get detailed analysis');
    } catch (error) {
      console.error(`Failed to add competitor: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('competitors')
  .addCommand('analyze <id>')
  .description('Analyze competitor strategy and performance')
  .option('--platform <platform>', 'Platform: all, meta, google, tiktok')
  .action(async (options, id, platform) => {
    try {
      const analysis = await adapter.getCompetitorAnalysis(id, platform || 'all');

      displayCompetitorAnalysis(analysis, options.verbose);
      console.log('Use: adforge competitors strategy <id> for strategy analysis');
    } catch (error) {
      console.error(`Analysis failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('competitors')
  .addCommand('strategy <id>')
  .description('Get detailed competitor strategy analysis')
  .option('--platform <platform>', 'Platform: all, meta, google, tiktok')
  .action(async (options, id, platform) => {
    try {
      const strategy = await adapter.analyzeCompetitorStrategy(id, platform || 'all');

      displayCompetitorStrategy(strategy, options.verbose);
    } catch (error) {
      console.error(`Strategy analysis failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('competitors')
  .addCommand('refresh')
  .description('Refresh all tracked competitors with latest data')
  .action(async () => {
    try {
      const result = await adapter.refreshCompetitors();

      console.log(`✓ Refreshed ${result.length} competitors`);
      console.log('Latest data fetched from: Meta Ad Library, Similarweb API, or public data');
    } catch (error) {
      console.error(`Refresh failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('competitors')
  .addCommand('remove <url>')
  .description('Stop tracking a competitor')
  .action(async (options, url) => {
    try {
      await adapter.removeCompetitor(url);
      console.log(`✓ Competitor removed: ${url}`);
    } catch (error) {
      console.error(`Failed to remove competitor: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// TRENDING COMMANDS
// ================================

program
  .command('trending')
  .description('Trending and market intelligence')
  .addCommand('')
  .argument('[options...]')
  .description('Get trending data (internal + external)')
  .option('--industry <industry>', 'Filter by industry')
  .option('--region <region>', 'Filter by region')
  .option('--source <source>', 'Source: internal, external, all (default: all)')
  .action(async (options, industry, region, source) => {
    try {
      const result = await adapter.getTrending({
        industry,
        region,
        source,
      });

      displayTrendingData(result, options.format, options.verbose);
      console.log(`\nFound ${result.total} trending items`);
    } catch (error) {
      console.error(`Failed to get trending: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// CREATIVES COMMANDS
// ================================

program
  .command('creatives')
  .description('Creative management')
  .addCommand('list')
  .argument('[filters...]')
  .description('List all ad creatives (alias for "ads list")')
  .action(async (options, filters) => {
    const parsedFilters = parseFilters(filters);

    try {
      const creatives = await adapter.listCreatives(parsedFilters);

      displayCreativesTable(creatives, options.format, options.verbose);
    } catch (error) {
      console.error(`Failed to list creatives: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('creatives')
  .addCommand('update <id>')
  .description('Update creative')
  .option('--name <name>', 'New name')
  .option('--status <status>', 'New status')
  .action(async (options, id, name, status) => {
    try {
      const updates = {};
      if (name) updates.name = name;
      if (status) updates.status = status;

      const creative = await adapter.updateCreative(id, updates);
      console.log(`✓ Creative updated: ${creative.name}`);
    } catch (error) {
      console.error(`Failed to update creative: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// ANALYTICS COMMANDS
// ================================

program
  .command('analytics')
  .description('Campaign analytics and performance metrics')
  .option('--platform <platform>', 'Platform')
  .option('--days <number>', 'Days to analyze (default: 30)')
  .addCommand('')
  .argument('<command> [args...]')
  .description('Analytics commands')
  .action(async (options, command, args) => {
    switch (command) {
      case 'campaign':
        await showCampaignAnalytics(options, args[0], options.days, options.platform);
        break;
      case 'performance':
        await showPerformanceMetrics(options, args[0], options.platform);
        break;
      default:
        console.error(`Unknown analytics command: ${command}`);
        console.log('Available: campaign, performance');
        process.exit(1);
    }
  });

async function showCampaignAnalytics(options, campaignId, days, platform) {
  try {
    const analytics = await adapter.getAnalytics({
      campaignId,
      days,
      platform,
    });

    displayAnalyticsTable(analytics, options.format, options.verbose);
  } catch (error) {
    console.error(`Failed to get analytics: ${error.message}`);
    process.exit(1);
  }
}

async function showPerformanceMetrics(options, campaignId, platform) {
  try {
    const metrics = await adapter.getPerformanceMetrics(campaignId, platform);

    console.log(`\nPerformance Metrics for Campaign: ${campaignId}`);
    console.log(`  Impressions:  ${metrics.impressions || 0}`);
    console.log(`  Clicks:      ${metrics.clicks || 0}`);
    console.log(`  CTR:         ${(metrics.ctr || 0).toFixed(2)}%`);
    console.log(`  CPC:         ${metrics.cpc || 0}`);

    if (options.verbose && metrics.costPerAction) {
      console.log(`\nCost per action type:`);
      for (const [action, cost] of Object.entries(metrics.costPerAction)) {
        console.log(`  ${action}: ${cost.toFixed(2)}`);
      }
    }
  } catch (error) {
    console.error(`Failed to get performance metrics: ${error.message}`);
    process.exit(1);
  }
}

// ================================
// ACCOUNT COMMANDS
// ================================

program
  .command('accounts')
  .description('Platform account management')
  .addCommand('list')
  .description('List connected platform accounts')
  .option('--platform <platform>', 'Filter by platform: meta, google, tiktok')
  .action(async (options) => {
    try {
      const accounts = await adapter.listAccounts(options.platform);

      if (accounts.length === 0) {
        console.log('No accounts connected.');
        console.log('Use: adforge accounts connect <platform> to add an account');
        return;
      }

      displayAccountsTable(accounts, options.format, options.verbose);
    } catch (error) {
      console.error(`Failed to list accounts: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('accounts')
  .addCommand('connect <platform>')
  .description('Connect a platform account')
  .action(async (options, platform) => {
    try {
      const credentials = promptForCredentials(platform);

      const account = await adapter.connectAccount(platform, credentials);
      console.log(`✓ ${platform} account connected`);
    } catch (error) {
      console.error(`Failed to connect account: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('accounts')
  .addCommand('sync')
  .description('Sync all accounts from connected platforms')
  .action(async () => {
    try {
      await adapter.syncAccounts();
      console.log('✓ All accounts synced');
    } catch (error) {
      console.error(`Sync failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('accounts')
  .addCommand('health')
  .description('Check account health and connection status')
  .option('--platform <platform>', 'Check specific platform')
  .action(async (options, platform) => {
    try {
      const health = await adapter.getAccountHealth(platform);

      displayHealthStatus(health, options.verbose);
    } catch (error) {
      console.error(`Health check failed: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// SETTINGS COMMANDS
// ================================

program
  .command('settings')
  .description('Configuration and settings')
  .addCommand('get')
  .description('Get user settings')
  .action(async () => {
    try {
      const settings = await adapter.getSettings();
      displaySettings(settings, options.verbose);
    } catch (error) {
      console.error(`Failed to get settings: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('settings')
  .addCommand('set')
  .description('Update user settings')
  .option('--key <key>', 'Setting key')
  .option('--value <value>', 'Setting value')
  .action(async (options, key, value) => {
    try {
      const settings = {};
      settings[key] = value;

      await adapter.updateSettings(settings);
      console.log(`✓ Setting "${key}" updated to "${value}"`);
    } catch (error) {
      console.error(`Failed to update settings: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('settings')
  .addCommand('credentials')
  .description('Check platform credentials status')
  .action(async () => {
    try {
      const status = await adapter.getCredentialsStatus();

      displayCredentialsStatus(status, options.verbose);
    } catch (error) {
      console.error(`Failed to check credentials: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// EXPORT & REPORTING COMMANDS
// ================================

program
  .command('export')
  .description('Export campaigns and analytics data')
  .option('--format <format>', 'Output format: json, csv (default: csv)')
  .option('--platform <platform>', 'Filter by platform')
  .option('--file <path>', 'Save to file instead of stdout')
  .action(async (options, format, platform, file) => {
    try {
      const report = await adapter.exportCampaigns({ format, platform });

      if (file) {
        await adapter.saveReport(report, file);
        console.log(`✓ Report saved to ${file}`);
      } else {
        console.log(report.content || JSON.stringify(report.data || [], null, 2));
      }
    } catch (error) {
      console.error(`Export failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('reports')
  .description('Generate performance and analysis reports')
  .option('--type <type>', 'Report type: campaign, competitor, trending')
  .option('--output <path>', 'Save to file')
  .option('--format <format>', 'Output format: json, csv (default: json)')
  .action(async (options, type, output, format) => {
    try {
      const report = await adapter.generateReport(type, options);

      if (output) {
        await adapter.saveReport(report, output);
        console.log(`✓ ${type} report saved to ${output}`);
      } else {
        console.log(JSON.stringify(report.data || {}, null, 2));
      }
    } catch (error) {
      console.error(`Report generation failed: ${error.message}`);
      process.exit(1);
    }
  });

// ================================
// HELPER FUNCTIONS
// ================================

function parseFilters(filters) {
  const parsed = {};

  for (let i = 0; i < filters.length; i += 2) {
    const key = filters[i];
    const value = filters[i + 1];

    if (!value) {
      console.error(`Missing value for filter: ${key}`);
      process.exit(1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function promptForCredentials(platform) {
  console.log(`\nEnter credentials for ${platform.toUpperCase()}:`);
  const credentials = {};

  switch (platform.toLowerCase()) {
    case 'meta':
    credentials.access_token = prompt('  Access Token (optional): ');
      break;
    case 'google':
      credentials.developer_token = prompt('  Developer Token: ');
      credentials.oauth_token = prompt('  OAuth Token (optional): ');
      break;
    case 'tiktok':
      credentials.access_token = prompt('  Access Token: ');
      break;
    default:
      console.error(`Unsupported platform: ${platform}`);
      process.exit(1);
  }

  return credentials;
}

// ================================
// DISPLAY FUNCTIONS
// ================================

function displayCampaignsTable(campaigns, format, verbose) {
  console.log(`\n📊 Campaigns (${campaigns.length} total)`);
  console.log('');

  if (format === 'json') {
    console.log(JSON.stringify(campaigns, null, 2));
    return;
  }

  const table = [];
  for (const c of campaigns) {
    table.push({
      ID: c.id.substring(0, 8),
      Name: c.name.substring(0, 30),
      Platform: c.platform.substring(0, 10),
      Status: c.status.substring(0, 10).toUpperCase(),
      Budget: formatCurrency(c.budget),
      Spend: formatCurrency(c.spend),
      ROAS: c.roas.toFixed(2),
      CTR: c.ctr + '%',
    });
  }

  console.table(table);
}

function displayCampaignDetails(campaign, verbose) {
  console.log(`\n📊 Campaign Details: ${campaign.name}`);
  console.log('');

  const details = [
    ['ID', campaign.id],
    ['Name', campaign.name],
    ['Platform', campaign.platform],
    ['Status', campaign.status.toUpperCase()],
    ['Objective', campaign.objective],
    ['Budget', formatCurrency(campaign.budget)],
    ['Spend', formatCurrency(campaign.spend)],
    ['Revenue', formatCurrency(campaign.revenue)],
    ['ROAS', campaign.roas.toFixed(2)],
    ['CTR', campaign.ctr + '%'],
    ['Impressions', formatNumber(campaign.impressions)],
    ['Clicks', formatNumber(campaign.clicks)],
    ['Conversions', formatNumber(campaign.conversions)],
    ['Created', formatDate(campaign.createdAt)],
  ];

  for (const [key, value] of details) {
    console.log(`  ${key}: ${value}`);
  }

  if (verbose && campaign.platform === 'meta') {
    console.log('\nCreative Info:');
    if (campaign.creatives && campaign.creatives.length > 0) {
      for (const creative of campaign.creatives.slice(0, 3)) {
        console.log(`    - ${creative.name}: ${creative.status}`);
      }
    }
  }
}

function displayAdsTable(result, format, verbose) {
  console.log(`\n📊 Ads Library Search - ${result.platform.toUpperCase()}`);
  console.log(`  Query: ${result.query || '(all)'}`);
  console.log('');

  if (result.ads.length === 0) {
    console.log('No ads found.');
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(result.ads, null, 2));
    return;
  }

  const table = [];
  for (const ad of result.ads.slice(0, 10)) {
    table.push({
      ID: ad.id?.substring(0, 8),
      Title: ad.headline?.substring(0, 35) || ad.name?.substring(0, 35) || '',
      Platform: ad.platform || '',
      Status: ad.status || '',
      Spend: formatCurrency(ad.metrics?.spend || 0),
      Impressions: formatNumber(ad.metrics?.impressions || 0),
      CTR: (ad.metrics?.ctr || 0).toFixed(2) + '%',
    });
  }

  console.table(table);

  if (result.ads.length > 10) {
    console.log(`\n... and ${result.ads.length - 10} more ads`);
  }
}

function displayCreativesTable(creatives, format, verbose) {
  console.log(`\n📊 Creatives (${creatives.length} total)`);
  console.log('');

  if (format === 'json') {
    console.log(JSON.stringify(creatives, null, 2));
    return;
  }

  const table = [];
  for (const c of creatives.slice(0, 20)) {
    table.push({
      ID: c.id?.substring(0, 8),
      Name: c.name?.substring(0, 30),
      Platform: c.platform || '',
      Type: c.type || 'text',
      Status: c.status?.toUpperCase() || '',
    Created: formatDate(c.createdAt),
    });
  }

  console.table(table);
}

function displayCompetitorsTable(competitors, format, verbose) {
  console.log(`\n🔍 Competitors (${competitors.length} total)`);
  console.log('');

  if (format === 'json') {
    console.log(JSON.stringify(competitors, null, 2));
    return;
  }

  const table = [];
  for (const c of competitors) {
    table.push({
      ID: c.id?.substring(0, 8),
      Name: c.name?.substring(0, 30),
      URL: c.url?.substring(0, 40),
      Platform: c.platform || '',
      Added: formatDate(c.createdAt),
    });
  }

  console.table(table);
}

function displayCompetitorAnalysis(analysis, verbose) {
  console.log(`\n🔍 Competitor Analysis`);
  console.log('');

  console.log(`Total Ads: ${analysis.totalAds || 0}`);
  console.log(`Total Spend: ${formatCurrency(analysis.totalSpend || 0)}`);
  console.log(`Avg CTR: ${(analysis.avgCTR || 0).toFixed(2)}%`);

  if (analysis.platforms) {
    console.log(`\nPlatform Distribution:`);
    for (const [platform, data] of Object.entries(analysis.platforms)) {
      const count = data.count || 0;
      const percentage = data.percentage || 0;
      console.log(`  ${platform}: ${count} ads (${percentage}%)`);
    }
  }

  if (analysis.adTypes) {
    console.log(`\nAd Types:`);
    for (const [type, data] of Object.entries(analysis.adTypes)) {
      const count = data.count || 0;
      const percentage = data.percentage || 0;
      console.log(`  ${type}: ${count} ads (${percentage}%)`);
    }
  }

  if (analysis.topPerformingAds && analysis.topPerformingAds.length > 0) {
    console.log(`\nTop Performing Ads:`);
    for (const ad of analysis.topPerformingAds.slice(0, 5)) {
      console.log(`  - ${ad.headline}: ${ad.ctr}% CTR`);
    }
  }
}

function displayCompetitorStrategy(strategy, verbose) {
  console.log(`\n💡 Competitor Strategy Analysis`);
  console.log('');

  console.log(`Platform Usage:`);
  for (const [platform, data] of Object.entries(strategy.platforms || {})) {
    const count = data.count || 0;
    const percentage = data.percentage || 0;
    console.log(`  ${platform}: ${count} ads (${percentage}%)`);
  }

  console.log(`\nContent Patterns:`);
  if (strategy.contentPatterns) {
    console.log(`  Top Keywords:`);
    for (const kw of strategy.contentPatterns.topHeadlineKeywords || []) {
      console.log(`  - ${kw.word} (${kw.count})`);
    }
  }

  console.log(`\nBidding Behavior:`);
  if (strategy.biddingBehavior) {
    const { estimatedCTR, estimatedCPC } = strategy.biddingBehavior;
    console.log(`  Estimated CTR: ${estimatedCTR.toFixed(2)}%`);
    console.log(`  Estimated CPC: ${formatCurrency(estimatedCPC)}`);
    console.log(`  Strategy: ${strategy.biddingBehavior.aggressiveBidding ? 'Aggressive' : strategy.biddingBehavior.conservativeBidding ? 'Conservative' : 'Moderate'}`);
  }

  if (strategy.recommendations && strategy.recommendations.length > 0) {
    console.log(`\nRecommendations:`);
    for (const rec of strategy.recommendations) {
      const icon = rec.priority === 'high' ? '⚠️' : rec.priority === 'medium' ? '⚡' : '✅';
      console.log(`  ${icon} ${rec.type.toUpperCase()}: ${rec.message}`);
    }
  }
}

function displayTrendingData(result, format, verbose) {
  console.log(`\n📈 Trending Data`);
  console.log('');

  console.log(`Internal Trends: ${result.internal?.length || 0}`);
  console.log(`External Trends: ${result.external?.length || 0}`);
  console.log(`Total Items: ${result.total || 0}`);

  if (format === 'json') {
    console.log(JSON.stringify(result.internal?.concat(result.external) || [], null, 2));
    return;
  }

  const table = [];
  const allTrends = [...(result.internal || []), ...(result.external || [])];
  for (const t of allTrends.slice(0, 20)) {
    const theme = t.theme || 'Unknown';
    const category = t.category || 'General';
    const growth = t.growth || '+0%';

    table.push({
      Theme: theme.substring(0, 30),
      Category: category.substring(0, 15),
      Growth: growth,
      Platforms: (t.platforms || []).join(', '),
    Popularity: t.popularity || 0,
    Example: (t.adsExample || '').substring(0, 50),
    Source: t.internal ? 'Internal' : 'External',
    });
  }

  console.table(table);
}

function displayAnalyticsTable(analytics, format, verbose) {
  console.log(`\n📊 Analytics`);
  console.log('');

  console.log(`Total Spend: ${formatCurrency(analytics.totalSpend || 0)}`);
  console.log(`Total Impressions: ${formatNumber(analytics.totalImpressions || 0)}`);
  console.log(`Total Clicks: ${formatNumber(analytics.totalClicks || 0)}`);
  console.log(`Total Conversions: ${formatNumber(analytics.totalConversions || 0)}`);
  console.log(`Avg CTR: ${(analytics.totalClicks / analytics.totalImpressions * 100).toFixed(2)}%`);
  console.log(`Avg CPC: ${formatCurrency(analytics.totalSpend / analytics.totalClicks)}`);

  if (verbose && analytics.campaigns) {
    console.log(`\nCampaign Breakdown:`);
    for (const campaign of analytics.campaigns.slice(0, 5)) {
      console.log(`  ${campaign.name}: ${formatCurrency(campaign.spend)} spend (${formatNumber(campaign.impressions)} impressions)`);
    }
  }
}

function displayAccountsTable(accounts, format, verbose) {
  console.log(`\n🔗 Connected Accounts (${accounts.length} total)`);
  console.log('');

  if (format === 'json') {
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }

  const table = [];
  for (const acc of accounts) {
    const status = acc.status === 'active' ? '✅' : '⚠️';
    table.push({
      Platform: acc.name?.substring(0, 20),
      Status: status,
      'Last Sync': formatDate(acc.lastSynced),
    });
  }

  console.table(table);
}

function displayHealthStatus(health, verbose) {
  console.log(`\n🏥 Account Health Status`);
  console.log('');

  for (const [platform, status] of Object.entries(health)) {
    const configured = status.configured ? '✅ Configured' : '❌ Not configured';
    const error = status.error ? ` (${status.error})` : '';

    console.log(`  ${platform}: ${configured}${error}`);
  }

  if (verbose && health.platforms) {
    console.log(`\nPlatform Details:`);
    for (const [platform, data] of Object.entries(health.platforms || {})) {
      console.log(`  ${platform}: ${data.count || 0} accounts`);
    }
  }
}

function displaySettings(settings, verbose) {
  console.log(`\n⚙️ User Settings`);
  console.log('');

  console.log(`Username: ${settings.username || 'Not set'}`);
  console.log(`Plan: ${(settings.plan || 'free').toUpperCase()}`);
  console.log(`Features: ${Array.isArray(settings.features) ? settings.features.join(', ') : 'basic'}`);
}

function displayCredentialsStatus(status, verbose) {
  console.log(`\n🔑 Platform Credentials`);
  console.log('');

  for (const [platform, data] of Object.entries(status)) {
    const configured = data.configured ? '✅' : '❌';
    const lastChecked = formatDate(data.lastChecked);
    const error = data.error ? ` (${data.error})` : '';

    console.log(`  ${platform}: ${configured}${error} - Last checked: ${lastChecked}`);
  }
}

// ================================
// FORMATTING UTILITIES
// ================================

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  return 'IDR ' + parseFloat(amount).toLocaleString('id-ID', { minimumFractionDigits: 0 });
}

function formatNumber(num) {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// ================================
// CLI ENTRY POINT
// ================================

program.parse(process.argv);
