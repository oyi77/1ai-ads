export function renderScheduleQueue() {
  return `
    <div class="schedule-queue">
      <div class="schedule-item">
        <div class="schedule-icon">📅</div>
        <div class="schedule-info">
          <div class="schedule-title">Post 1</div>
          <div class="schedule-time">Tomorrow 10:00 AM</div>
          <div class="schedule-platform">Platform: TikTok</div>
        </div>
        <div class="schedule-status">Scheduled</div>
      </div>
      <div class="schedule-item">
        <div class="schedule-icon">📸</div>
        <div class="schedule-info">
          <div class="schedule-title">Post 2</div>
          <div class="schedule-time">Tomorrow 2:00 PM</div>
          <div class="schedule-platform">Platform: Instagram</div>
        </div>
        <div class="schedule-status">Scheduled</div>
      </div>
      <div class="schedule-item">
        <div class="schedule-icon">📝</div>
        <div class="schedule-info">
          <div class="schedule-title">Post 3</div>
          <div class="schedule-time">Friday 8:00 PM</div>
          <div class="schedule-platform">Platform: Facebook</div>
        </div>
        <div class="schedule-status">Scheduled</div>
      </div>
    </div>
  `;
}

export function renderAdsLibrary() {
  return `
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
  `;
}
