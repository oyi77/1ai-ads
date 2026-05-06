import { api } from '../lib/api.js';

export function renderAnalyticsChart() {
  return `
    <div class="chart-container">
      <div class="chart-card">
        <h3>📈 ROAS Last 7 Days</h3>
        <div id="roas-chart" class="chart">
          <div class="chart-bar" data-value="2.1" style="height: 21%">2.1</div>
          <div class="chart-bar" data-value="2.3" style="height: 23%">2.3</div>
          <div class="chart-bar" data-value="2.5" style="height: 25%">2.5</div>
          <div class="chart-bar" data-value="2.8" style="height: 28%">2.8</div>
          <div class="chart-bar" data-value="3.0" style="height: 30%">3.0</div>
          <div class="chart-bar" data-value="3.2" style="height: 32%">3.2</div>
          <div class="chart-bar" data-value="3.4" style="height: 34%">3.4</div>
        </div>
      </div>
      
      <div class="chart-card">
        <h3> 💹 Spend Breakdown</h3>
        <div class="pie-chart">
          <div class="pie-slice" style="background: #3b82f6; --slice: 45;">Meta</div>
          <div class="pie-slice" style="background: #f59e0b; --slice: 30;">TikTok</div>
          <div class="pie-slice" style="background: #10b981; --slice: 25%;">Google</div>
        </div>
        <div class="legend">
          <div class="legend-item">
            <span class="legend-color" style="background: #3b82f6;"></span>
            <span>Meta: 45%</span>
          </div>
          <div class="legend-item">
            <span class="legend-color" style="background: #f59e0b;"></span>
            <span>TikTok: 30%</span>
          </div>
          <div class="legend-item">
            <span class="legend-color" style="background: #10b981;"></span>
            <span>Google: 25%</span>
          </div>
        </div>
      </div>
      
      <div class="chart-card">
        <h3> 💰 Revenue by Platform</h3>
        <div class="bar-chart">
          <div class="bar-group">
            <span class="bar-label">Meta</span>
            <div class="bar-fill" style="width: 60%; background: #3b82f6;">IDR 1.5M</div>
          </div>
          <div class="bar-group">
            <span class="bar-label">TikTok</span>
            <div class="bar-fill" style="width: 35%; background: #f59e0b;">IDR 900K</div>
          </div>
          <div class="bar-group">
            <span class="bar-label">Google</span>
            <div class="bar-fill" style="width: 20%; background: #10b981;">IDR 500K</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderAISuggestions() {
  return `
    <div class="ai-suggestions-list">
      <div class="ai-suggestion warning">
        <span class="ai-icon">🔥</span>
        <span class="ai-message">3 campaigns below ROAS 2.0 — Optimize recommended</span>
        <button class="btn-sm" onclick="applyAiSuggestion('low_roas')">⚡ Apply</button>
      </div>
      <div class="ai-suggestion success">
        <span class="ai-icon">💡</span>
        <span class="ai-message">Flash Sale CTR high — Increase budget by 30%</span>
        <button class="btn-sm" onclick="applyAiSuggestion('increase_budget')">⚡ Apply</button>
      </div>
      <div class="ai-suggestion info">
        <span class="ai-icon">⏰</span>
        <span class="ai-message">Best time to post: tonight 9 PM — Schedule now?</span>
        <button class="btn-sm" onclick="applyAiSuggestion('schedule')">⚡ Apply</button>
      </div>
    </div>
  `;
}

export function applyAiSuggestion(type) {
  if (type === 'low_roas') {
    if (!confirm('Apply optimization to all campaigns with low ROAS?')) return;
    api.post('/api/campaigns/optimize-low-roas')
      .then(() => alert('Low ROAS campaigns optimized!'))
      .catch(err => alert('Failed: ' + err.message));
  } else if (type === 'increase_budget') {
    if (!confirm('Increase budget for high-performing campaigns?')) return;
    api.post('/api/campaigns/increase-budget')
      .then(() => alert('Budget increased!'))
      .catch(err => alert('Failed: ' + err.message));
  } else if (type === 'schedule') {
    alert('Opening schedule modal...');
    // TODO: Open schedule modal
  }
}
