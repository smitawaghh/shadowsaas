/**
 * Resilient WebSocket client for the ShadowSaaS live event stream.
 * Auto-reconnects with exponential back-off if the backend restarts.
 *
 * Usage:
 *   const unsub = subscribeToEvents((event) => console.log(event));
 *   // later:
 *   unsub();
 */

const WS_URL = (import.meta.env.VITE_WS_URL || 'ws://localhost:8000') + '/ws/events';
const MAX_BACKOFF_MS = 30_000;

let socket = null;
let backoff = 1000;
let listeners = new Set();
let stopFlag = false;

function connect() {
  if (stopFlag) return;

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    backoff = 1000; // reset on successful connect
    // Send a heartbeat every 25s to keep the connection alive through proxies
    socket._pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('ping');
    }, 25_000);
  };

  socket.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'event') {
        listeners.forEach((cb) => cb(msg.data));
      }
    } catch {
      // ignore non-JSON messages (pong etc.)
    }
  };

  socket.onclose = () => {
    clearInterval(socket._pingInterval);
    if (!stopFlag) {
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 1.5, MAX_BACKOFF_MS);
    }
  };

  socket.onerror = () => {
    socket.close();
  };
}

/** Subscribe to live events. Returns an unsubscribe function. */
export function subscribeToEvents(callback) {
  listeners.add(callback);
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    stopFlag = false;
    connect();
  }
  return () => listeners.delete(callback);
}

/** Permanently stop the WebSocket (call on app unmount). */
export function closeEventSocket() {
  stopFlag = true;
  if (socket) socket.close();
}
