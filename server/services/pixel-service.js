import { createLogger } from '../lib/logger.js';

const log = createLogger('pixel-service');

export class PixelService {
  constructor(metaApi) {
    this.meta = metaApi;
  }

  async getPixels(actId) {
    log.info('getPixels', { actId });
    return this.meta._get(`/${actId}/adspixels`, {
      fields: 'id,name,code,active,creation_time,last_fired_time'
    });
  }

  async getPixelEvents(pixelId, params = {}) {
    log.info('getPixelEvents', { pixelId });
    return this.meta._get(`/${pixelId}/events`, {
      fields: 'event_name,event_time,user_data,custom_data,action_source',
      limit: params.limit || 50,
      ...params
    });
  }

  async sendCAPIEvent(pixelId, { event_name, event_time, user_data, custom_data, action_source = 'website' }) {
    log.info('sendCAPIEvent', { pixelId, event_name });
    const accessToken = this.meta._getToken();
    const url = `${this.meta._base}/${pixelId}/events?access_token=${accessToken}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          event_name,
          event_time: event_time || Math.floor(Date.now() / 1000),
          user_data,
          custom_data,
          action_source
        }]
      })
    });
    return resp.json();
  }

  async getPixelStats(pixelId, dateRange = 'last_7d') {
    log.info('getPixelStats', { pixelId, dateRange });
    return this.meta._get(`/${pixelId}/stats`, { date_range: dateRange });
  }
}
