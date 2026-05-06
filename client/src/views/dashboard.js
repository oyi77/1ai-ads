import { api } from '../lib/api.js';
import { renderCampaignsList } from '../components/campaigns.js';
import { renderAnalyticsChart } from '../components/analytics.js';
import { renderScheduleQueue } from '../components/schedule.js';
import { renderAISuggestions } from '../components/ai-suggestions.js';

// Simple auth check using localStorage
function checkAuth() {
  const token = localStorage.getItem('adforge_token');
  return token !== null;
}

export function renderDashboard() {
  if (!checkAuth()) {
    router.navigate('/login');
    return;
  }

  // Fetch all campaign data first
  api.get('/api/campaigns')
    .then(campaigns => {
      const html = `
        <div class="dashboard-container">
          <!-- STATUS OVERVIEW -->
          <div class="status-overview">
            <h2 class="section-title">📊 Status Overview</h2>
            <div class="status-cards">
              <div class="status-card" onclick="syncPlatform('meta')">
                <div class="status-icon">🔗 Meta</div>
                <div class="status-value">${campaigns.filter(c => c.platform === 'meta').length} Active</div>
              </div>
              <div class="status-card" onclick="syncPlatform('tiktok')">
                <div class="status-icon">🔗 TikTok</div>
                <div class="status-value">Sync Now</div>
              </div>
              <div class="status-card" onclick="syncPlatform('google')">
                <div class="status-icon">🔗 Google Ads</div>
                <div class="status-value">Sync Now</div>
              </div>
              <div class="status-card">
                <div class="status-icon">💰 Total Spend</div>
                <div class="status-value">IDR 2.5M</div>
              </div>
              <div class="status-card">
                <div class="status-icon">📈 Current ROAS</div>
                <div class="status-value">3.4x</div>
              </div>
            </div>
          </div>

          <!-- PLATFORM STATUS -->
          <div class="platform-status">
            <h2 class="section-title">🔌 Platform Status</h2>
            <div class="ad-account-selector-container">
              ${renderAdAccountSelector()}
            </div>
            <div class="platform-cards">
              <div class="platform-card">
                <h3>Facebook (Meta)</h3>
                <p>Last sync: 2h ago</p>
                <button onclick="syncAllCampaigns('meta')">🔄 Sync Now</button>
              </div>
              <div class="platform-card">
                <h3>TikTok Ads</h3>
                <p>Last sync: 5h ago</p>
                <button onclick="syncAllCampaigns('tiktok')">🔄 Sync Now</button>
              </div>
              <div class="platform-card">
                <h3>Google Ads</h3>
                <p>Last sync: 1d ago</p>
                <button onclick="syncAllCampaigns('google')">🔄 Sync Now</button>
              </div>
            </div>
          </div>

          <!-- ACTIVE CAMPAIGNS -->
          <div class="active-campaigns">
            <h2 class="section-title">🎯 Active Campaigns</h2>
            
            <!-- Meta Ads -->
            <div class="platform-section">
              <div class="platform-header">
                <h3> Meta Campaigns</h3>
                <div class="platform-actions">
                  <button onclick="createCampaign('meta')">+</button>
                  <button onclick="filterCampaigns('meta')">Filter</button>
                </div>
              </div>
              <div id="meta-campaigns-list">
                ${renderCampaignsList(campaigns.filter(c => c.platform === 'meta'), 'meta')}
              </div>
            </div>

            <!-- TikTok Ads -->
            <div class="platform-section">
              <div class="platform-header">
                <h3> TikTok Campaigns</h3>
                <div class="platform-actions">
                  <button onclick="createCampaign('tiktok')">+</button>
                  <button onclick="filterCampaigns('tiktok')">Filter</button>
                </div>
              </div>
              <div id="tiktok-campaigns-list">
                ${renderCampaignsList(campaigns.filter(c => c.platform === 'tiktok'), 'tiktok')}
              </div>
            </div>

            <!-- Google Ads -->
            <div class="platform-section">
              <div class="platform-header">
                <h3> Google Ads Campaigns</h3>
                <div class="platform-actions">
                  <button onclick="createCampaign('google')">+</button>
                  <button onclick="filterCampaigns('google')">Filter</button>
                </div>
              </div>
              <div id="google-campaigns-list">
                ${renderCampaignsList(campaigns.filter(c => c.platform === 'google'), 'google')}
              </div>
            </div>
          </div>

          <!-- AI SUGGESTIONS -->
          <div class="ai-suggestions">
            <h2 class="section-title">🤖 AI Suggestions</h2>
            <div id="ai-suggestions-container">
              ${renderAISuggestions()}
            </div>
            <button class="btn-primary" onclick="applyAllAiSuggestions()">⚡ Apply All AI Suggestions</button>
          </div>

          <!-- ANALYTICS -->
          <div class="analytics">
            <h2 class="section-title">📊 Analytics</h2>
            <div id="analytics-container">
              ${renderAnalyticsChart()}
            </div>
          </div>

          <!-- SCHEDULED POSTS -->
          <div class="scheduled-posts">
            <h2 class="section-title">⏰ Scheduled Posts</h2>
            <div id="schedule-container">
              ${renderScheduleQueue()}
            </div>
            <button class="btn-primary" onclick="openScheduleModal()">⏱️ Schedule Post</button>
          </div>

          <!-- AD LIBRARY -->
          <div class="ad-library">
            <h2 class="section-title">📁 Ad Library</h2>
            <div class="library-actions">
              <button onclick="openUploadModal('image')">Upload Image</button>
              <button onclick="openUploadModal('video')">Upload Video</button>
              <button onclick="openUploadModal('copy')">Upload Copy</button>
            </div>
            <div class="ads-grid">
              <div class="ad-item">
                <div class="ad-preview">🖼️</div>
                <div class="ad-info">
                  <div class="ad-name">Summer Sale Image 1</div>
                  <div class="ad-type">Image</div>
                </div>
                <div class="ad-status">✅ Used</div>
              </div>
              <div class="ad-item">
                <div class="ad-preview">🎥</div>
                <div class="ad-info">
                  <div class="ad-name">Flash Sale Video</div>
                  <div class="ad-type">Video</div>
                </div>
                <div class="ad-status">✅ Used</div>
              </div>
              <div class="ad-item">
                <div class="ad-preview">🖼️</div>
                <div class="ad-info">
                  <div class="ad-name">New Arrival Image 1</div>
                  <div class="ad-type">Image</div>
                </div>
                <div class="ad-status">Draft</div>
              </div>
              <div class="ad-item">
                <div class="ad-preview">🎥</div>
                <div class="ad-info">
                  <div class="ad-name">Test Video 1</div>
                  <div class="ad-type">Video</div>
                </div>
                <div class="ad-status">Draft</div>
              </div>
              <div class="ad-item">
                <div class="ad-preview">📝</div>
                <div class="ad-info">
                  <div class="ad-name">Copy - Summer Sale</div>
                  <div class="ad-type">Text</div>
                </div>
                <div class="ad-status">Draft</div>
              </div>
            </div>
          </div>

          <!-- QUICK ACTIONS -->
          <div class="quick-actions">
            <button class="btn-danger" onclick="optimizeAllCampaigns()">⚡ Optimize All</button>
            <button class="btn-primary" onclick="syncAllPlatforms()">🔄 Sync All Platforms</button>
            <button class="btn-success" onclick="schedulePost()">📅 Schedule Post</button>
          </div>
        </div>
      `;

      document.getElementById('app').innerHTML = html;
    })
    .catch(err => {
      console.error('Dashboard load failed:', err);
      alert('Failed to load dashboard');
    });
}

// Global functions for button handlers
window.syncPlatform = (platform) => {
  alert('Syncing ' + platform + '...');
  api.post('/api/platforms/' + platform + '/sync')
    .then(() => alert('Sync complete!'))
    .catch(err => alert('Sync failed: ' + err.message));
};

window.syncAllCampaigns = (platform) => {
  alert('Syncing ' + platform + ' campaigns...');
  api.post('/api/campaigns/sync')
    .then(() => alert('Campaigns synced!'))
    .catch(err => alert('Sync failed: ' + err.message));
};

window.createCampaign = (platform) => {
  router.navigate('/campaigns/create?platform=' + platform);
};

window.filterCampaigns = (platform) => {
  alert('Filtering ' + platform + ' campaigns...');
};

window.optimizeAllCampaigns = () => {
  if (!confirm('Apply AI optimizations to all campaigns?')) return;
  
  api.post('/api/campaigns/optimize-all')
    .then(result => {
      alert('Optimization complete!\n' + result.message);
      renderDashboard();
    })
    .catch(err => alert('Optimization failed: ' + err.message));
};

window.syncAllPlatforms = () => {
  if (!confirm('Sync all platforms (Meta, TikTok, Google)?')) return;
  
  api.post('/api/platforms/sync-all')
    .then(result => {
      alert('Sync complete for all platforms!');
      renderDashboard();
    })
    .catch(err => alert('Sync failed: ' + err.message));
};

window.applyAllAiSuggestions = () => {
  if (!confirm('Apply all AI suggestions?')) return;
  
  api.post('/api/ai/apply-all')
    .then(result => {
      alert('AI suggestions applied!');
      renderDashboard();
    })
    .catch(err => alert('Apply failed: ' + err.message));
};

window.openScheduleModal = () => {
  alert('Open schedule modal (to be implemented)');
};

window.openUploadModal = (type) => {
  alert('Open upload modal for ' + type + ' (to be implemented)');
};

window.schedulePost = () => {
  alert('Open schedule post flow (to be implemented)');
};
