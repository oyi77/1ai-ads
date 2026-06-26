/**
 * Connect a store to a view rendering function.
 * Automatically re-renders when store state changes.
 *
 * Usage:
 *   const disconnect = connectStore(campaignStore, (state) => {
 *     el.innerHTML = renderCampaigns(state.campaigns, state.loading);
 *   });
 *   // Later: disconnect() to stop listening
 */
export function connectStore(store, renderFn) {
  // Initial render
  renderFn(store.getState());

  // Subscribe to changes
  const unsub = store.subscribe((state) => {
    renderFn(state);
  });

  return unsub;
}

/**
 * Helper to show loading/error/empty states consistently.
 *
 * Usage:
 *   const { loading, error, empty } = stateHelpers(campaignStore);
 *   if (loading()) return showSpinner();
 *   if (error()) return showError(error());
 *   if (empty('campaigns')) return showEmpty();
 */
export function stateHelpers(store) {
  return {
    loading: () => store.getState().loading,
    error: () => store.getState().error,
    empty: (key) => {
      const state = store.getState();
      return !state.loading && !state.error && Array.isArray(state[key]) && state[key].length === 0;
    },
  };
}
