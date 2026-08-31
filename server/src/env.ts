/*
 * Environment bootstrap. It must be the first dependency evaluated by the app
 * factory: security.ts caches CORS_ORIGIN at module load, so `.env` has to be
 * applied before that module. Uses Node's built-in loader (Node >= 20.12) — no
 * dotenv dependency. Looks for `.env` in the process CWD (the repo root when
 * run via the root package.json scripts).
 */

try {
  process.loadEnvFile();
} catch {
  // No .env present — fine; every variable has a safe default.
}
