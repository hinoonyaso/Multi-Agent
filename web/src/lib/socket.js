const SOCKET_PATH = import.meta.env.VITE_SOCKET_URL ?? "/ws";

export function connectRunSocket(runId, handlers = {}) {
  const socket = new WebSocket(resolveSocketUrl(SOCKET_PATH));

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "subscribe",
        runId
      })
    );

    handlers.onOpen?.();
  });

  socket.addEventListener("message", (message) => {
    try {
      const payload = JSON.parse(message.data);
      handlers.onEvent?.(payload);
    } catch (error) {
      handlers.onError?.(error);
    }
  });

  socket.addEventListener("error", (event) => {
    handlers.onError?.(event);
  });

  socket.addEventListener("close", (event) => {
    handlers.onClose?.(event);
  });

  return socket;
}

function resolveSocketUrl(pathname) {
  if (pathname.startsWith("ws://") || pathname.startsWith("wss://")) {
    return pathname;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${pathname}`;
}
