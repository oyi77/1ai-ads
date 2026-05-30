import { createStore } from '../store.js';

export const uiStore = createStore(
  {
    toasts: [],
    modal: null,
    sidebarOpen: true,
  },
  {
    showToast({ setState, getState }, message, type = 'info', duration = 3000) {
      const id = Date.now();
      const toast = { id, message, type };
      setState({ toasts: [...getState().toasts, toast] });
      setTimeout(() => {
        setState({ toasts: getState().toasts.filter(t => t.id !== id) });
      }, duration);
    },

    showModal({ setState }, modal) {
      setState({ modal });
    },

    hideModal({ setState }) {
      setState({ modal: null });
    },

    toggleSidebar({ setState, getState }) {
      setState({ sidebarOpen: !getState().sidebarOpen });
    },
  }
);
