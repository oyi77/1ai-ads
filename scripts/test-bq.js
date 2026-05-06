/**
 * Test BigQuery connection and table creation
 */

import fs from 'fs';
import { BigQueryExportService } from '../server/services/bigquery-export.js';

// Load .env manually (like server.js does)
const envPath = '../.env';
const envContent = fs.readFileSync(new URL(envPath, import.meta.url).pathname, 'utf8');
const lines = envContent.split('\n');
for (const line of lines) {
  const eqIndex = line.indexOf('=');
  if (eqIndex > 0) {
    const key = line.substring(0, eqIndex).trim();
    const value = line.substring(eqIndex + 1).trim();
    process.env[key] = value;
  }
}
console.log('✅ .env loaded');

// Now we have GCP vars!

async function testBigQueryConnection() {
  console.log('🚀 Testing BigQuery connection...');
  
  const bigQueryExport = new BigQueryExportService();
  
  if (!bigQueryExport.bigQuery) {
    console.error('❌ BigQuery not initialized');
    return;
  }
  
  console.log('✅ BigQuery initialized successfully');
  console.log('   Project:', bigQueryExport.projectId);
  console.log('   Dataset:', bigQueryExport.datasetId);
  
  try {
    // Ensure dataset exists
    await bigQueryExport.ensureDataset();
    console.log('✅ Dataset ready');
    
    // Create tables
    await bigQueryExport.createCampaignsTable();
    console.log('✅ Campaigns table ready');
    
    await bigQueryExport.createAdsTable();
    console.log('✅ Ads table ready');
    
    await bigQueryExport.createAdsMetricsTable();
    console.log('✅ Metrics table ready');
    
    // Insert test data
    const testCampaigns = [{
      campaign_id: 'test_1',
      name: 'Test Campaign',
      status: 'ACTIVE',
      platform: 'meta',
      created_at: new Date(),
      updated_at: new Date(),
    }];
    
    await bigQueryExport.insertCampaigns(testCampaigns);
    console.log('✅ Test data inserted');
    
    console.log('🎉 BigQuery connection test PASSED!');
    console.log('Data is ready for Looker Studio dashboard!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.errors && error.errors.length > 0) {
      console.error('Details:', error.errors);
    }
  }
}

testBigQueryConnection()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
