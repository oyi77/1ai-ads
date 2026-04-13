#!/usr/bin/env node

/**
 * AdForge CLI - Simple Command-Line Interface
 *
 * Access AdForge API features directly from command line
 */

import { program } from 'commander';

const API_BASE = process.env.ADFORGE_CLI_API_URL || 'http://localhost:3001/api';
let AUTH_TOKEN = null;

// Helper: Check authentication
async function ensureAuth() {
  if (!AUTH_TOKEN) {
    const token = process.env.ADFORGE_CLI_TOKEN;
    if (token) {
      AUTH_TOKEN = token;
    } else {
      console.error('Authentication required. Set ADFORGE_CLI_TOKEN environment variable or run: adforge login');
      process.exit(1);
    }
  }
  return AUTH_TOKEN;
}

// Helper: API request
async function apiRequest(endpoint, options = {}) {
  const token = await ensureAuth();
  let url = `${API_BASE}${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const opts = {
    method: 'POST',
    headers,
  };

  // For GET requests with query params
  if (options.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== null && value !== undefined) {
        params.set(key, value);
      }
    }
    url += `?${params.toString()}`;
  }

  // For POST with body
  if (options.body) {
    opts.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, opts);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error (${response.status}): ${error}`);
  }

  return await response.json();
}

// ================================
// MAIN PROGRAM
// ================================

program
  .name('adforge')
  .description('AdForge CLI - Command-line interface')
  .version('1.0.0');

// ================================
// AUTHENTICATION COMMANDS
// ================================

program
  .command('login')
  .description('Login to AdForge')
  .option('--username <user>', 'Username')
  .option('--password <pass>', 'Password')
  .action(async (options) => {
    const { username, password } = options;

    const response = await apiRequest('/auth/login', { body: { username, password } });

    AUTH_TOKEN = response.token;
    console.log(`✓ Logged in as ${response.username}`);
    console.log('Authentication token stored');
  });

program
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    await ensureAuth();
    console.log('✓ Authenticated');
    console.log(`API URL: ${API_BASE}`);
  });

// ================================
// CAMPAIGNS COMMANDS
// ================================

program
  .command('campaigns')
  .description('List campaigns')
  .option('--platform <platform>', 'Filter by platform')
  .action(async (options) => {
    const campaigns = await apiRequest('/api/campaigns', { query: options });

    if (campaigns.length === 0) {
      console.log('No campaigns found');
      return;
    }

    console.log(`📊 Found ${campaigns.length} campaign(s)`);
    console.table(campaigns.map(c => ({
      ID: c.id.substring(0, 8),
      Name: c.name.substring(0, 30),
      Platform: c.platform,
      Status: c.status.toUpperCase(),
      ROAS: c.roas ? c.roas.toFixed(2) : 'N/A',
      Budget: c.budget ? `IDR ${parseFloat(c.budget).toFixed(2)}` : 'N/A',
    })));
  });

program
  .command('campaign-get <id>')
  .description('Get campaign details')
  .action(async (id) => {
    const campaign = await apiRequest(`/api/campaigns/${id}`);

    console.log(`📊 Campaign: ${campaign.name}`);
    console.log('');
    console.log(`Status: ${campaign.status}`);
    console.log(`Objective: ${campaign.objective}`);
    console.log(`Budget: IDR ${campaign.budget}`);
    console.log(`ROAS: ${campaign.roas ? campaign.roas.toFixed(2) : 'N/A'}`);
    console.log(`Platform: ${campaign.platform}`);
    console.log('');
    if (campaign.creatives && campaign.creatives.length > 0) {
      console.log('Creatives:');
      for (const creative of campaign.creatives.slice(0, 3)) {
        console.log(`  - ${creative.name}: ${creative.status}`);
      }
    }
  });

program
  .command('campaign-sync')
  .description('Sync campaigns from platforms')
  .requiredOption('--platform <platform>', 'Platform to sync (meta, google, tiktok)')
  .action(async (options) => {
    const response = await apiRequest(`/api/platforms/${options.platform}/sync`);

    console.log(`✓ Synced ${options.platform} campaigns`);
    console.log(`  Accounts synced: ${response.length || 0}`);
  });

// ================================
// ADS LIBRARY COMMANDS
// ================================

program
  .command('ads-search <query>')
  .description('Search ad library across platforms')
  .option('--platform <platform>', 'Platform: meta, google, tiktok, all', 'all')
  .option('--country <code>', 'Country code', 'US')
  .option('--source <source>', 'Data source: api, scrape, auto', 'auto')
  .action(async (query, options) => {
    const response = await apiRequest('/ads-library/search', {
      query: {
        q: query,
        platform: options.platform,
        country: options.country,
        source: options.source,
        limit: 50,
      },
    });

    const data = response.data;
    console.log(`Found ${data?.total || 0} ads across platforms`);

    if (data?.ads?.length > 0) {
      console.table(data.ads.slice(0, 20).map(ad => ({
        Platform: ad.platform || '',
        Title: (ad.headline || ad.name || '').substring(0, 35),
        Status: ad.status || '',
        Impressions: ad.metrics?.impressions || 0,
        CTR: ad.metrics?.ctr || 0,
      })));
    } else {
      console.log('No ads found. Try different search terms.');
    }
  });

program
  .command('ads-sources')
  .description('List available ad data sources per platform')
  .option('--platform <platform>', 'Filter by platform: meta, google, tiktok')
  .action(async (options) => {
    const response = await apiRequest('/ads-library/sources', {
      query: options.platform ? { platform: options.platform } : {},
    });

    const sources = response.data || [];
    console.log(`Available data sources (${sources.length} platforms):`);
    for (const src of sources) {
      console.log(`\n  ${src.displayName || src.name}`);
      console.log(`    API available:     ${src.apiAvailable}`);
      console.log(`    API configured:    ${src.apiConfigured}`);
      console.log(`    Scrape available:  ${src.scrapeAvailable}`);
      if (src.apis?.length) {
        for (const api of src.apis) {
          console.log(`    - ${api.name}: ${api.description || ''}`);
        }
      }
    }
  });

// ================================
// COMPETITOR COMMANDS
// ================================

program
  .command('competitors')
  .description('List tracked competitors')
  .action(async () => {
    const response = await apiRequest('/api/competitor-spy');

    if (!response.data || response.data.length === 0) {
      console.log('No competitors tracked yet.');
      console.log('Use: adforge competitor-add <url>');
      return;
    }

    console.log(`🔍 Tracked Competitors (${response.data.length})`);
    console.table(response.data.map(c => ({
      ID: c.id?.substring(0, 8),
      Name: c.name?.substring(0, 30),
      URL: c.url?.substring(0, 40),
      Platform: c.platform || 'all',
      Added: new Date(c.createdAt).toLocaleDateString(),
    })));
  });

program
  .command('competitor-add <url>')
  .description('Add competitor to track')
  .option('--platform <platform>', 'Platform: meta, google, tiktok', 'all')
  .action(async (url, options) => {
    const response = await apiRequest('/api/competitor-spy', {
      body: {
        url,
        platform: options.platform,
      },
    });

    console.log(`✓ Competitor added: ${response.data.url}`);
  });

program
  .command('competitor-analyze <id>')
  .description('Analyze competitor strategy')
  .option('--platform <platform>', 'Platform: all, meta, google, tiktok', 'all')
  .action(async (id, options) => {
    const response = await apiRequest(`/api/competitor-spy/${id}/analyze`, {
      query: options,
    });

    console.log(`✓ Strategy analysis completed for ${id}`);
    console.log(`Platform usage: ${response.data?.platforms || {}}`);
  });

// ================================
// TRENDING COMMANDS
// ================================

program
  .command('trending')
  .description('Get trending data')
  .option('--source <source>', 'Data source: internal, external, all', 'all')
  .action(async (options) => {
    const response = await apiRequest('/api/trending/all');

    if (options.source === 'internal') {
      console.log(`Internal trends: ${response.data?.internal?.length || 0}`);
    } else if (options.source === 'external') {
      console.log(`External trends: ${response.data?.external?.length || 0}`);
    } else {
      console.log(`Internal trends: ${response.data?.internal?.length || 0}`);
      console.log(`External trends: ${response.data?.external?.length || 0}`);
    }
  });

// ================================
// HELP
// ================================

program
  .command('help')
  .description('Show help information')
  .action(() => {
    console.log('AdForge CLI - Command-Line Interface');
    console.log('');
    console.log('Usage: adforge <command> [options]');
    console.log('');
    console.log('Authentication:');
    console.log('  adforge login --username <user> --password <pass>');
    console.log('  adforge status');
    console.log('');
    console.log('Campaigns:');
    console.log('  adforge campaigns [--platform <platform>]');
    console.log('  adforge campaign-get <id>');
    console.log('  adforge campaign-sync --platform <platform>');
    console.log('');
    console.log('Ads Library:');
    console.log('  adforge ads-search <query> [--platform <platform>] [--source api|scrape|auto]');
    console.log('  adforge ads-sources [--platform <platform>]');
    console.log('');
    console.log('Competitors:');
    console.log('  adforge competitors');
    console.log('  adforge competitor-add <url> [--platform <platform>]');
    console.log('  adforge competitor-analyze <id>');
    console.log('');
    console.log('Trending:');
    console.log('  adforge trending [--source <source>]');
    console.log('');
    console.log('Options:');
    console.log('  --api-url <url>    Set API URL (default: http://localhost:3001/api)');
    console.log('');
    console.log('Environment Variables:');
    console.log('  ADFORGE_CLI_API_URL    API endpoint (required for commands)');
    console.log('  ADFORGE_CLI_TOKEN        Auth token (set with adforge login)');
    console.log('');
    console.log('Examples:');
    console.log('  # Login');
    console.log('  adforge login --username admin --password secret');
    console.log('');
    console.log('  # List campaigns');
    console.log('  adforge campaigns');
    console.log('');
    console.log('  # Search ads library');
    console.log('  adforge ads-search "running shoes" --platform meta');
    console.log('');
    console.log('  # List available data sources');
    console.log('  adforge ads-sources');
    console.log('  adforge ads-sources --platform meta');
    console.log('');
    console.log('  # Search with specific source');
    console.log('  adforge ads-search "running shoes" --platform all --source auto');
    console.log('');
    console.log('  # Get trending');
    console.log('  adforge trending --source internal');
  });

program.parse(process.argv);
