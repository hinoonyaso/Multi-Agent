export function createStateStore() {
  const state = new Map();

  return {
    get(key) {
      return state.get(key);
    },
    set(key, value) {
      state.set(key, value);
      return value;
    },
    snapshot() {
      return Object.fromEntries(state.entries());
    }
  };
}
