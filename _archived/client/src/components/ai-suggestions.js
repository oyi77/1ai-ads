import { api } from '../lib/api.js';

export function renderAISuggestions() {
  return `
    <div class="ai-suggestions-list">
      <div class="ai-suggestion warning">
        <span class="ai-icon">🔥</span>
        <div class="ai-content">
          <span class="ai-message">3 campaigns below ROAS 2.0 — Optimize recommended</span>
          <button class="btn-sm" onclick="applyAiSuggestion('low_roas')">⚡ Apply</button>
        </div>
      </div>
      <div class="ai-suggestion success">
        <span class="ai-icon">💡</span>
        <div class="ai-content">
          <span class="ai-message">Flash Sale CTR high — Increase budget by 30%</span>
          <button class="btn-sm" onclick="applyAiSuggestion('increase_budget')">⚡ Apply</button>
        </div>
      </div>
      <div class="ai-suggestion info">
        <span class="ai-icon">⏰</span>
        <div class="ai-content">
          <span class="ai-message">Best time to post: tonight 9 PM — Schedule now?</span>
          <button class="btn-sm" onclick="applyAiSuggestion('schedule')">⚡ Apply</button>
        </div>
      </div>
    </div>
  `;
}

export function applyAiSuggestion(type) {
  if (type === 'low_roas') {
    if (!confirm('Apply optimization to all campaigns with low ROAS?')) return;
    
    api.post('/campaigns/optimize-low-roas')
      .then(result => {
        alert('Low ROAS campaigns optimized!\n' + result.message);
      })
      .catch(err => alert('Failed: ' + err.message));
  } else if (type === 'increase_budget') {
    if (!confirm('Increase budget for high-performing campaigns?')) return;
    
    api.post('/campaigns/increase-budget')
      .then(result => {
        alert('Budget increased!\n' + result.message);
      })
      .catch(err => alert('Failed: ' + err.message));
  } else if (type === 'schedule') {
    window.location.hash = '#/schedule';
  }
}
