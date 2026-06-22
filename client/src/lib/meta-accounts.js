import { api } from './api.js';

export const metaAccounts = {
  // GET /api/meta/accounts - Fetch all Ad Accounts
  fetchAccounts: async () => {
    try {
      const response = await api.get('/meta/');
      return response.data;
    } catch (err) {
      console.error('Failed to fetch meta accounts:', err);
      throw err;
    }
  },

  // GET /api/meta/business-managers - Fetch Business Managers
  fetchBusinessManagers: async () => {
    try {
      const response = await api.get('/meta/business-managers');
      return response.data;
    } catch (err) {
      console.error('Failed to fetch business managers:', err);
      throw err;
    }
  },

  // GET /api/meta/business-manager/:id/ad-accounts - Fetch Ad Accounts for specific BM
  fetchBusinessManagerAccounts: async (businessManagerId) => {
    try {
      const response = await api.get(`/meta/business-manager/${businessManagerId}/ad-accounts`);
      return response.data;
    } catch (err) {
      console.error('Failed to fetch business manager accounts:', err);
      throw err;
    }
  },
};
