import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import { createLogger } from '../lib/logger.js';

const log = createLogger('bigquery-export');

const CAMPAIGNS_SCHEMA = {
  fields: [
    { name: 'campaign_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'campaign_name', type: 'STRING' },
    { name: 'campaign_status', type: 'STRING' },
    { name: 'campaign_start_date', type: 'DATE' },
    { name: 'campaign_stop_date', type: 'DATE' },
    { name: 'campaign_objective', type: 'STRING' },
    { name: 'platform', type: 'STRING', mode: 'REQUIRED' },
    { name: 'meta_business_id', type: 'STRING' },
    { name: 'meta_ad_account_id', type: 'STRING' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP' },
  ],
};

const ADS_SCHEMA = {
  fields: [
    { name: 'ad_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'ad_name', type: 'STRING' },
    { name: 'ad_status', type: 'STRING' },
    { name: 'campaign_id', type: 'STRING' },
    { name: 'adset_id', type: 'STRING' },
    { name: 'platform', type: 'STRING', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP' },
    { name: 'creative_id', type: 'STRING' },
    { name: 'adset_name', type: 'STRING' },
    { name: 'campaign_name', type: 'STRING' },
  ],
};

const METRICS_SCHEMA = {
  fields: [
    { name: 'ad_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'impressions', type: 'INTEGER' },
    { name: 'spend', type: 'FLOAT' },
    { name: 'clicks', type: 'INTEGER' },
    { name: 'ctr', type: 'FLOAT' },
    { name: 'cpc', type: 'FLOAT' },
    { name: 'cpm', type: 'FLOAT' },
    { name: 'conversions', type: 'INTEGER' },
    { name: 'conversion_rate', type: 'FLOAT' },
    { name: 'roas', type: 'FLOAT' },
    { name: 'reach', type: 'INTEGER' },
    { name: 'engagement_rate', type: 'FLOAT' },
    { name: 'platform', type: 'STRING' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ],
};

const TABLE_SCHEMAS = {
  campaigns: CAMPAIGNS_SCHEMA,
  ads: ADS_SCHEMA,
  ads_metrics: METRICS_SCHEMA,
};

/**
 * BigQuery Export Service
 * Exports Facebook Ads data to Google BigQuery for Looker Studio dashboards
 */
export class BigQueryExportService {
  static loadCredentials() {
    const credentialPath = process.env.GCP_SERVICE_ACCOUNT;
    if (!credentialPath) { log.info('GCP_SERVICE_ACCOUNT not configured'); return null; }
    try {
      return JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    } catch (error) {
      log.error('Failed to load BigQuery credentials', { path: credentialPath, error: error.message });
      return null;
    }
  }

  constructor(projectId) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID;
    this.datasetId = process.env.BIGQUERY_DATASET || 'adforge_reports';
    if (!this.projectId) { this.bigQuery = null; return; }
    const credentials = BigQueryExportService.loadCredentials();
    if (!credentials) { this.bigQuery = null; return; }
    try {
      this.bigQuery = new BigQuery({ projectId: this.projectId, credentials });
    } catch (error) {
      log.warn('Failed to initialize BigQuery', { error: error.message });
      this.bigQuery = null;
    }
  }

  async ensureDataset() {
    if (!this.bigQuery) { log.info('BigQuery not initialized, skipping dataset creation'); return null; }
    try {
      const [dataset] = await this.bigQuery.createDataset(this.datasetId, {
        metadata: { friendlyName: 'AdForge Reports', description: 'Facebook Ads data for Looker Studio dashboards', labels: { project: 'adforge' } },
      });
      log.info(`Dataset [${dataset.id}] created.`);
      return dataset;
    } catch (error) {
      if (error.code === 409) { log.info(`Dataset [${this.datasetId}] already exists.`); return this.bigQuery.dataset(this.datasetId); }
      throw error;
    }
  }

  async createCampaignsTable() { return this._createTable('campaigns'); }
  async createAdsTable() { return this._createTable('ads'); }
  async createAdsMetricsTable() { return this._createTable('ads_metrics'); }

  async _createTable(tableId) {
    const schema = TABLE_SCHEMAS[tableId];
    try {
      const [table] = await this.bigQuery.dataset(this.datasetId).createTable(tableId, { schema });
      log.info(`Table [${tableId}] created.`);
      return table;
    } catch (error) {
      if (error.code === 409) { log.info(`Table [${tableId}] already exists.`); return this.bigQuery.dataset(this.datasetId).table(tableId); }
      throw error;
    }
  }

  async insertCampaigns(campaigns) {
    await this.ensureDataset();
    await this.createCampaignsTable();
    const rows = campaigns.map(c => ({
      campaign_id: c.campaign_id, campaign_name: c.name, campaign_status: c.status,
      campaign_start_date: c.start_date, campaign_stop_date: c.stop_date, campaign_objective: c.objective,
      platform: c.platform, meta_business_id: c.meta_business_id, meta_ad_account_id: c.meta_ad_account_id,
      created_at: c.created_at || new Date(), updated_at: c.updated_at || new Date(),
    }));
    return this._insertRows('campaigns', rows);
  }

  async insertAds(ads) {
    await this.ensureDataset();
    await this.createAdsTable();
    const rows = ads.map(ad => ({
      ad_id: ad.ad_id, ad_name: ad.name, ad_status: ad.status, campaign_id: ad.campaign_id,
      adset_id: ad.adset_id, platform: ad.platform, created_at: ad.created_at || new Date(),
      updated_at: ad.updated_at || new Date(), creative_id: ad.creative_id,
      adset_name: ad.adset_name, campaign_name: ad.campaign_name,
    }));
    return this._insertRows('ads', rows);
  }

  async insertMetrics(metrics) {
    await this.ensureDataset();
    await this.createAdsMetricsTable();
    const rows = metrics.map(m => ({
      ad_id: m.ad_id, date: m.date, impressions: m.impressions, spend: m.spend,
      clicks: m.clicks, ctr: m.ctr, cpc: m.cpc, cpm: m.cpm, conversions: m.conversions,
      conversion_rate: m.conversion_rate, roas: m.roas, reach: m.reach,
      engagement_rate: m.engagement_rate, platform: m.platform, created_at: new Date(),
    }));
    return this._insertRows('ads_metrics', rows);
  }

  async _insertRows(tableId, rows, label = tableId) {
    const table = this.bigQuery.dataset(this.datasetId).table(tableId);
    const [insertResults] = await table.insert(rows);
    if (insertResults.length > 0) { log.warn('Failed inserts', { table: label, errors: insertResults }); }
    else { log.info(`Inserted ${rows.length} ${label} to BigQuery.`); }
    return rows.length;
  }

  async exportFacebookData(campaigns, ads, metrics) {
    if (!this.bigQuery) { log.info('BigQuery not initialized, skipping export'); return { error: 'Not configured' }; }
    log.info('Starting BigQuery export...');
    const results = { campaigns: 0, ads: 0, metrics: 0 };
    try {
      if (campaigns?.length) results.campaigns = await this.insertCampaigns(campaigns);
      if (ads?.length) results.ads = await this.insertAds(ads);
      if (metrics?.length) results.metrics = await this.insertMetrics(metrics);
      log.info('BigQuery export complete', results);
      return results;
    } catch (error) {
      log.error('BigQuery export failed', { error: error.message });
      throw error;
    }
  }

  getConnectionInfo() {
    return {
      projectId: this.projectId, datasetId: this.datasetId,
      serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
      query: `SELECT * FROM \`${this.projectId}.${this.datasetId}.campaigns\` LIMIT 1000`,
    };
  }
}
