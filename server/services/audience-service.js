import { createLogger } from '../lib/logger.js';

const log = createLogger('audience-service');

export class AudienceService {
  constructor(metaApi) {
    this.meta = metaApi;
  }

  async getAudiences(actId) {
    log.info('getAudiences', { actId });
    return this.meta._get(`/${actId}/customaudiences`, {
      fields: 'id,name,description,subtype,approximate_count,time_created,time_updated,operation_status'
    });
  }

  async createAudience(actId, { name, description, subtype, customer_file_source }) {
    log.info('createAudience', { actId, name, subtype });
    return this.meta._post(`/${actId}/customaudiences`, {
      name, description, subtype: subtype || 'CUSTOM',
      customer_file_source: customer_file_source || 'USER_PROVIDED_ONLY'
    });
  }

  async addUsersToAudience(audienceId, users, schema = ['EMAIL', 'PHONE']) {
    log.info('addUsersToAudience', { audienceId, count: users.length });
    return this.meta._post(`/${audienceId}/users`, {
      payload: { schema, data: users }
    });
  }

  /**
   * Ingest a customer contact list as a Meta Custom Audience.
   * @param {string} actId - Meta ad account id (act_xxx)
   * @param {{name:string, contacts:Array<string|{phone?:string}>}} opts
   * @returns {Promise<{id:string}>} the created audience id (Meta shape)
   */
  async createCustomListAudience(actId, { name, contacts }) {
    log.info('createCustomListAudience', { actId, name, count: contacts?.length });
    const audience = await this.createAudience(actId, { name, subtype: 'CUSTOM' });
    const id = audience?.id;
    if (id && Array.isArray(contacts) && contacts.length) {
      const users = contacts
        .map(c => (typeof c === 'string' ? c : (c && (c.phone || c.Phone || c.PHONE))))
        .filter(Boolean);
      if (users.length) {
        await this.addUsersToAudience(id, users, ['PHONE']);
      }
    }
    return audience;
  }

  async deleteAudience(audienceId) {
    log.info('deleteAudience', { audienceId });
    return this.meta._delete(`/${audienceId}`);
  }

  async createLookalike(sourceId, { country, ratio, ad_account_id }) {
    log.info('createLookalike', { sourceId, country, ratio });
    return this.meta._post(`/${ad_account_id}/customaudiences`, {
      name: `Lookalike_${sourceId}_${country}_${ratio}`,
      subtype: 'LOOKALIKE',
      origin_audience_id: sourceId,
      country, ratio
    });
  }

  async shareAudience(audienceId, targetAccountId) {
    log.info('shareAudience', { audienceId, targetAccountId });
    return this.meta._post(`/${audienceId}/adaccounts`, {
      adaccount: targetAccountId
    });
  }
}
