import { api } from '../lib/api.js';

export function renderCampaignsList(campaigns, platform) {
  if (!campaigns || campaigns.length === 0) {
    return `<div class="empty-state">No campaigns found for ${platform}</div>`;
  }

  return campaigns.map(campaign => `
    <div class="campaign-item" data-campaign-id="${campaign.id}">
      <div class="campaign-header">
        <div class="campaign-name">${campaign.name || 'Untitled Campaign'}</div>
        <div class="campaign-status">${campaign.status || 'active'}</div>
      </div>
      <div class="campaign-stats">
        <div class="stat">
          <span class="stat-label">ROAS</span>
          <span class="stat-value roas">${(campaign.roas || 0).toFixed(2)}x</span>
        </div>
        <div class="stat">
          <span class="stat-label">Budget</span>
          <span class="stat-value budget">IDR ${formatCurrency(campaign.budget || 0)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Spent</span>
          <span class="stat-value spent">IDR ${formatCurrency(campaign.spend || 0)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Revenue</span>
          <span class="stat-value revenue">IDR ${formatCurrency(campaign.revenue || 0)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Impressions</span>
          <span class="stat-value impressions">${formatNumber(campaign.impressions || 0)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Clicks</span>
          <span class="stat-value clicks">${formatNumber(campaign.clicks || 0)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Conversions</span>
          <span class="stat-value conversions">${formatNumber(campaign.conversions || 0)}</span>
        </div>
      </div>
      <div class="campaign-actions">
        <button class="btn-sm" onclick="editCampaign('${campaign.id}')">✏️ Edit</button>
        <button class="btn-sm" onclick="optimizeCampaign('${campaign.id}')">⚡ Optimize</button>
        <button class="btn-sm" onclick="pauseCampaign('${campaign.id}')">⏸️ Pause</button>
      </div>
    </div>
  `).join('');
}

export function editCampaign(id) {
  alert('Edit campaign: ' + id);
  // TODO: Implement edit campaign
}

export function optimizeCampaign(id) {
  if (!confirm('Apply AI optimization to this campaign?')) return;
  
  api.post(`/api/campaigns/${id}/optimize`)
    .then(result => {
      alert('Optimization applied! ROAS: ' + result.roas);
    })
    .catch(err => alert('Optimization failed: ' + err.message));
}

export function pauseCampaign(id) {
  if (!confirm('Pause this campaign?')) return;
  
  api.post(`/api/campaigns/${id}/pause`)
    .then(() => alert('Campaign paused'))
    .catch(err => alert('Failed to pause: ' + err.message));
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID').format(amount);
}

export function formatNumber(amount) {
  return new Intl.NumberFormat('id-ID').format(amount);
}
