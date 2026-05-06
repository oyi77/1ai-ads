import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';

/**
 * BigQuery Export Service
 * Exports Facebook Ads data to Google BigQuery for Looker Studio dashboards
 */
export class BigQueryExportService {
  /**
   * Load credentials from service account JSON file
   */
  static loadCredentials() {
    console.log('🔍 loadCredentials called');
    console.log('🔍 process.env.GCP_SERVICE_ACCOUNT:', process.env.GCP_SERVICE_ACCOUNT);
    const credentialPath = process.env.GCP_SERVICE_ACCOUNT;
    if (!credentialPath) {
      console.log('⚠️  GCP_SERVICE_ACCOUNT not configured in .env');
      return null;
    }
    try {
      const credContent = fs.readFileSync(credentialPath, 'utf8');
      const credentials = JSON.parse(credContent);
      console.log('✅ BigQuery: Service account credentials loaded from:', credentialPath);
      return credentials;
    } catch (error) {
      console.error('❌ BigQuery: Failed to load credentials from', credentialPath, ':', error.message);
      return null;
    }
  }

  constructor(projectId) {
    console.log('🔍 BigQueryExportService constructor called');
    console.log('🔍 projectId param:', projectId);
    console.log('🔍 process.env.GCP_PROJECT_ID:', process.env.GCP_PROJECT_ID);
    console.log('🔍 process.env.BIGQUERY_DATASET:', process.env.BIGQUERY_DATASET);
    
    this.projectId = projectId || process.env.GCP_PROJECT_ID;
    this.datasetId = process.env.BIGQUERY_DATASET || 'adforge_reports';
    
    console.log('🔍 this.projectId:', this.projectId);
    console.log('🔍 this.datasetId:', this.datasetId);
    
    // Skip initialization if credentials not available (optional feature)
    if (!this.projectId) {
      console.log('⚠️  BigQuery: Not configured, skipping initialization');
      this.bigQuery = null;
      return;
    }
    
    // Load credentials from service account file
    const credentials = BigQueryExportService.loadCredentials();
    if (!credentials) {
      console.log('⚠️  BigQuery: Credentials not available');
      this.bigQuery = null;
      return;
    }
    
    // Initialize BigQuery client with service account credentials
    try {
      this.bigQuery = new BigQuery({
        projectId: this.projectId,
        credentials: credentials,
      });
    } catch (error) {
      console.log('⚠️  BigQuery: Failed to parse credentials:', error.message);
      this.bigQuery = null;
    }
  }

  /**
   * Create dataset if not exists
   */
  async ensureDataset() {
    if (!this.bigQuery) {
      console.log('⚠️  BigQuery not initialized, skipping dataset creation');
      return null;
    }
    try {
      const [dataset] = await this.bigQuery.createDataset(this.datasetId, {
        metadata: {
          friendlyName: 'AdForge Reports',
          description: 'Facebook Ads data for Looker Studio dashboards',
          labels: { project: 'adforge' },
        },
      });
      console.log(`Dataset [${dataset.id}] created.`);
      return dataset;
    } catch (error) {
      if (error.code === 409) {
        console.log(`Dataset [${this.datasetId}] already exists.`);
        return this.bigQuery.dataset(this.datasetId);
      }
      throw error;
    }
  }

  /**
   * Create campaigns table schema
   */
  async createCampaignsTable() {
    const tableId = 'campaigns';
    const schema = {
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

    try {
      const dataset = this.bigQuery.dataset(this.datasetId);
      const [table] = await dataset.createTable(tableId, { schema });
      console.log(`Table [${tableId}] created.`);
      return table;
    } catch (error) {
      if (error.code === 409) {
        console.log(`Table [${tableId}] already exists.`);
        return this.bigQuery.dataset(this.datasetId).table(tableId);
      }
      throw error;
    }
  }

  /**
   * Create ads table schema
   */
  async createAdsTable() {
    const tableId = 'ads';
    const schema = {
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

    try {
      const dataset = this.bigQuery.dataset(this.datasetId);
      const [table] = await dataset.createTable(tableId, { schema });
      console.log(`Table [${tableId}] created.`);
      return table;
    } catch (error) {
      if (error.code === 409) {
        console.log(`Table [${tableId}] already exists.`);
        return this.bigQuery.dataset(this.datasetId).table(tableId);
      }
      throw error;
    }
  }

  /**
   * Create ads_metrics table for performance data
   */
  async createAdsMetricsTable() {
    const tableId = 'ads_metrics';
    const schema = {
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

    try {
      const dataset = this.bigQuery.dataset(this.datasetId);
      const [table] = await dataset.createTable(tableId, { schema });
      console.log(`Table [${tableId}] created.`);
      return table;
    } catch (error) {
      if (error.code === 409) {
        console.log(`Table [${tableId}] already exists.`);
        return this.bigQuery.dataset(this.datasetId).table(tableId);
      }
      throw error;
    }
  }

  /**
   * Insert campaigns data
   */
  async insertCampaigns(campaigns) {
    await this.ensureDataset();
    await this.createCampaignsTable();

    const table = this.bigQuery.dataset(this.datasetId).table('campaigns');
    
    const rows = campaigns.map(c => ({
      campaign_id: c.campaign_id,
      campaign_name: c.name,
      campaign_status: c.status,
      campaign_start_date: c.start_date,
      campaign_stop_date: c.stop_date,
      campaign_objective: c.objective,
      platform: c.platform,
      meta_business_id: c.meta_business_id,
      meta_ad_account_id: c.meta_ad_account_id,
      created_at: c.created_at || new Date(),
      updated_at: c.updated_at || new Date(),
    }));

    const [insertResults] = await table.insert(rows);
    
    if (insertResults.length > 0) {
      console.log('Failed inserts:', insertResults);
    } else {
      console.log(`✅ Inserted ${rows.length} campaigns to BigQuery.`);
    }

    return rows.length;
  }

  /**
   * Insert ads data
   */
  async insertAds(ads) {
    await this.ensureDataset();
    await this.createAdsTable();

    const table = this.bigQuery.dataset(this.datasetId).table('ads');
    
    const rows = ads.map(ad => ({
      ad_id: ad.ad_id,
      ad_name: ad.name,
      ad_status: ad.status,
      campaign_id: ad.campaign_id,
      adset_id: ad.adset_id,
      platform: ad.platform,
      created_at: ad.created_at || new Date(),
      updated_at: ad.updated_at || new Date(),
      creative_id: ad.creative_id,
      adset_name: ad.adset_name,
      campaign_name: ad.campaign_name,
    }));

    const [insertResults] = await table.insert(rows);
    
    if (insertResults.length > 0) {
      console.log('Failed inserts:', insertResults);
    } else {
      console.log(`✅ Inserted ${rows.length} ads to BigQuery.`);
    }

    return rows.length;
  }

  /**
   * Insert metrics data
   */
  async insertMetrics(metrics) {
    await this.ensureDataset();
    await this.createAdsMetricsTable();

    const table = this.bigQuery.dataset(this.datasetId).table('ads_metrics');
    
    const rows = metrics.map(m => ({
      ad_id: m.ad_id,
      date: m.date,
      impressions: m.impressions,
      spend: m.spend,
      clicks: m.clicks,
      ctr: m.ctr,
      cpc: m.cpc,
      cpm: m.cpm,
      conversions: m.conversions,
      conversion_rate: m.conversion_rate,
      roas: m.roas,
      reach: m.reach,
      engagement_rate: m.engagement_rate,
      platform: m.platform,
      created_at: new Date(),
    }));

    const [insertResults] = await table.insert(rows);
    
    if (insertResults.length > 0) {
      console.log('Failed inserts:', insertResults);
    } else {
      console.log(`✅ Inserted ${rows.length} metrics records to BigQuery.`);
    }

    return rows.length;
  }

  /**
   * Export all Facebook Ads data to BigQuery
   */
  async exportFacebookData(campaigns, ads, metrics) {
    if (!this.bigQuery) {
      console.log('⚠️  BigQuery not initialized, skipping export');
      return { error: 'Not configured' };
    }
    console.log('🚀 Starting BigQuery export...');
    
    const results = {
      campaigns: 0,
      ads: 0,
      metrics: 0,
    };

    try {
      if (campaigns && campaigns.length > 0) {
        results.campaigns = await this.insertCampaigns(campaigns);
      }
      if (ads && ads.length > 0) {
        results.ads = await this.insertAds(ads);
      }
      if (metrics && metrics.length > 0) {
        results.metrics = await this.insertMetrics(metrics);
      }

      console.log('✅ BigQuery export complete:', results);
      return results;
    } catch (error) {
      console.error('❌ BigQuery export failed:', error);
      throw error;
    }
  }

  /**
   * Get dataset connection info for Looker Studio
   */
  getConnectionInfo() {
    return {
      projectId: this.projectId,
      datasetId: this.datasetId,
      serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
      query: `SELECT * FROM \`${this.projectId}.${this.datasetId}.campaigns\` LIMIT 1000`,
    };
  }
}
