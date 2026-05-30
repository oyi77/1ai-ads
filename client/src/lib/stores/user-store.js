import { createStore } from '../store.js';
import { api } from '../api.js';

export const userStore = createStore(
  {
    user: null,
    loading: false,
    error: null,
    authenticated: false,
  },
  {
    async fetchUser({ setState, getState }) {
      if (getState().loading) return;
      setState({ loading: true, error: null });
      try {
        const { data } = await api.get('/auth/me');
        setState({ user: data, authenticated: true, loading: false });
      } catch (err) {
        setState({ user: null, authenticated: false, loading: false, error: err.message });
      }
    },

    async login({ setState }, credentials) {
      setState({ loading: true, error: null });
      try {
        const { data } = await api.post('/auth/login', credentials);
        localStorage.setItem('token', data.token);
        setState({ user: data.user, authenticated: true, loading: false });
        return data;
      } catch (err) {
        setState({ loading: false, error: err.message });
        throw err;
      }
    },

    logout({ setState }) {
      localStorage.removeItem('token');
      setState({ user: null, authenticated: false });
    },
  }
);
