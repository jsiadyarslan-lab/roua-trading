// ═══════════════════════════════════════════════════════════
// Chart Poll Worker — runs setInterval in a Web Worker to avoid
// mobile browser timer throttling.
//
// PROBLEM (documented in Chrome/Safari):
//   - Chrome: "Intensive throttling" after 5 min hidden → 1 wake/min
//   - Safari: silently drops WebSocket/polling after inactivity
//   - Result: chart polling stops on mobile after ~5 minutes
//
// SOLUTION:
//   Web Workers are NOT subject to the same throttling as the main
//   thread. setInterval inside a Worker continues running at its
//   configured interval even when the tab is hidden or the page is
//   considered "idle" by the browser.
//
// USAGE:
//   const worker = new Worker('/chart-poll-worker.js');
//   worker.postMessage({ type: 'start', intervalMs: 2000 });
//   worker.onmessage = (e) => {
//     if (e.data.type === 'tick') { /* poll for candle */ }
//   };
//   worker.postMessage({ type: 'stop' });
//
// The worker does NOT make fetch calls itself — it only sends 'tick'
// messages. The main thread does the fetch. This keeps the worker
// simple and avoids CORS/credential issues.
// ═══════════════════════════════════════════════════════════

let intervalId = null;
let intervalMs = 2000;

self.onmessage = (e) => {
  const { type, intervalMs: newInterval } = e.data;

  if (type === 'start') {
    // Stop any existing interval
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    // Use new interval if provided
    if (typeof newInterval === 'number' && newInterval > 0) {
      intervalMs = newInterval;
    }
    // Start polling — Web Worker timers are NOT throttled like main thread
    intervalId = setInterval(() => {
      self.postMessage({ type: 'tick', timestamp: Date.now() });
    }, intervalMs);
    // Send immediate tick so caller doesn't wait intervalMs for first one
    self.postMessage({ type: 'tick', timestamp: Date.now(), initial: true });
    self.postMessage({ type: 'started', intervalMs });
  } else if (type === 'stop') {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    self.postMessage({ type: 'stopped' });
  } else if (type === 'set-interval') {
    if (typeof newInterval === 'number' && newInterval > 0) {
      intervalMs = newInterval;
      // Restart with new interval if currently running
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = setInterval(() => {
          self.postMessage({ type: 'tick', timestamp: Date.now() });
        }, intervalMs);
        self.postMessage({ type: 'interval-updated', intervalMs });
      }
    }
  }
};
