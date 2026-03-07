const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "/ws";

export function createRunSocket() {
  return {
    url: SOCKET_URL,
    connect() {
      return {
        close() {}
      };
    }
  };
}
