/**
 * Simple pub/sub state management for vanilla JS.
 * Each store is a standalone object with state, getters, and actions.
 */

export function createStore(initialState, actions = {}) {
  let state = { ...initialState };
  const listeners = new Set();

  function getState() {
    return { ...state };
  }

  function setState(partial) {
    const prev = state;
    state = { ...state, ...partial };
    if (state !== prev) {
      listeners.forEach(fn => fn(state, prev));
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Bind actions so they can call setState/getState
  const boundActions = {};
  for (const [key, fn] of Object.entries(actions)) {
    boundActions[key] = (...args) => fn({ getState, setState, ...boundActions }, ...args);
  }

  return { getState, setState, subscribe, ...boundActions };
}
