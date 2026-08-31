/* Thin process entrypoint. Application wiring lives in app.ts so tests and
 * other hosts can import the Express factory without binding a real socket or
 * installing process-level signal handlers. */

import { createApp, resolvePort } from './app.js';

const port = resolvePort();
const server = createApp().listen(port, (): void => {
  process.stdout.write(`[api] listening on http://localhost:${port}\n`);
});

// Graceful shutdown for process managers / containers: stop accepting new
// connections, let in-flight requests finish, and hard-exit after 5s if
// something hangs. `unref` keeps the timer from holding the process open.
function shutdown(signal: NodeJS.Signals): void {
  process.stdout.write(`[api] ${signal} received, shutting down\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
