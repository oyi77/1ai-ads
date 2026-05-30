import { createStore } from '../store.js';
import { api } from '../api.js';

export const campaignStore = createStore(
  {
    campaigns: [],
    selected: null,
    loading: false,
    error: null,
  },
  {
    async fetchCampaigns({ setState, getState }) {
      if (getState().loading) return;
      setState({ loading: true, error: null });
      try {
        const { data } = await api.get('/analytics/campaigns');
        setState({ campaigns: Array.isArray(data) ? data : [], loading: false });
      } catch (err) {
        setState({ campaigns: [], loading: false, error: err.message });
      }
    },

    async createCampaign({ setState, getState }, campaignData) {
      setState({ loading: true, error: null });
      try {
        const { data } = await api.post('/campaigns', campaignData);
        setState({ campaigns: [...getState().campaigns, data], loading: false });
        return data;
      } catch (err) {
        setState({ loading: false, error: err.message });
        throw err;
      }
    },

    async updateCampaign({ setState, getState }, id, updates) {
      setState({ loading: true, error: null });
      try {
        await api.put(`/campaigns/${id}`, updates);
        const campaigns = getState().campaigns.map(c => c.id === id ? { ...c, ...updates } : c);
        setState({ campaigns, loading: false });
      } catch (err) {
        setState({ loading: false, error: err.message });
        throw err;
      }
    },

    selectCampaign({ setState }, campaign) {
      setState({ selected: campaign });
    },
  }
);
