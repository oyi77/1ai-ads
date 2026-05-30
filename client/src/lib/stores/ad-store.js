import { createStore } from '../store.js';
import { api } from '../api.js';

export const adStore = createStore(
  {
    ads: [],
    selected: null,
    loading: false,
    error: null,
  },
  {
    async fetchAds({ setState, getState }) {
      if (getState().loading) return;
      setState({ loading: true, error: null });
      try {
        const { data } = await api.get('/ads');
        setState({ ads: Array.isArray(data) ? data : [], loading: false });
      } catch (err) {
        setState({ ads: [], loading: false, error: err.message });
      }
    },

    async createAd({ setState, getState }, adData) {
      setState({ loading: true, error: null });
      try {
        const { data } = await api.post('/ads', adData);
        setState({ ads: [...getState().ads, data], loading: false });
        return data;
      } catch (err) {
        setState({ loading: false, error: err.message });
        throw err;
      }
    },

    selectAd({ setState }, ad) {
      setState({ selected: ad });
    },
  }
);
