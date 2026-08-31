/* global URL, fetch, process, setTimeout */

/**
 * Production HTTP contract test.
 *
 * Run after `npm run build && npm run server:build`. It intentionally launches
 * the compiled entrypoint rather than importing application code, so it catches
 * wrong output paths, missing production assets, and environment wiring bugs.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const entrypoint = join(repositoryRoot, 'server', 'dist', 'server', 'src', 'index.js');
const tempRoot = await mkdtemp(join(tmpdir(), 'emryn-production-smoke-'));
const dataDir = join(tempRoot, 'submissions');
const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;

try {
  server = await startServer();
  await waitForReady();
  await runContract();
  process.stdout.write('Production HTTP smoke passed.\n');
} finally {
  await stopServer(server);
  await rm(tempRoot, { recursive: true, force: true });
}

async function runContract() {
  const health = await request('/api/health');
  assert.equal(health.status, 200, 'GET /api/health must return 200');
  assert.deepEqual(await health.json(), { success: true, data: { status: 'ok' } });
  assert.match(health.headers.get('cache-control') ?? '', /no-store/i);
  assert.match(health.headers.get('content-security-policy') ?? '', /default-src 'none'/i);

  const corsHealth = await request('/api/health', { headers: { origin: baseUrl } });
  assert.equal(corsHealth.headers.get('access-control-allow-origin'), baseUrl);

  const ready = await request('/api/ready');
  assert.equal(ready.status, 200, 'GET /api/ready must return 200 when DATA_DIR is writable');
  assert.deepEqual(await ready.json(), {
    success: true,
    data: { status: 'ready', submissions: 'writable' },
  });

  const projects = await request('/api/projects');
  assert.equal(projects.status, 200, 'GET /api/projects must return 200');
  const projectPayload = await projects.json();
  assert.equal(projectPayload.success, true, 'Project list must use the success envelope');
  assert.ok(
    Array.isArray(projectPayload.data) && projectPayload.data.length > 0,
    'Project list must not be empty',
  );
  const summaries = projectPayload.data;
  const slug = summaries[0].slug;

  const home = await request('/');
  assert.equal(home.status, 200, 'GET / must return 200');
  assert.match(home.headers.get('content-type') ?? '', /text\/html/i, 'Home must be HTML');
  assertSecurityHeaders(home);
  const homeHtml = await home.text();
  assert.doesNotMatch(
    homeHtml,
    /LUSION|example\.com/i,
    'Production HTML must not ship placeholders',
  );
  assert.match(homeHtml, /<link rel="canonical" href="https:\/\/reevez\.com\/"/i);
  assert.match(homeHtml, /property="og:image" content="https:\/\/reevez\.com\//i);

  await assertProjectContent(summaries, homeHtml);
  await assertDiscoveryFiles(summaries.map((project) => project.slug));
  await assertRapierWasmArtifact();

  const compressedHome = await request('/', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(compressedHome.status, 200, 'Compressed home request must return 200');
  assert.equal(
    compressedHome.headers.get('content-encoding'),
    'gzip',
    'Text responses must use gzip when the client requests it',
  );

  const projectPage = await request(`/projects/${encodeURIComponent(slug)}`);
  assert.equal(projectPage.status, 200, 'Known project deep link must serve the SPA shell');
  assert.match(projectPage.headers.get('content-type') ?? '', /text\/html/i);

  const missingProject = await request('/projects/definitely-not-a-real-slug');
  assert.equal(missingProject.status, 404, 'Unknown project deep links must return a real 404');
  assert.match(missingProject.headers.get('content-type') ?? '', /application\/json/i);

  const missingAsset = await request('/assets/does-not-exist.js');
  assert.equal(
    missingAsset.status,
    404,
    'Missing static assets must return a real 404, never the SPA shell',
  );
  assert.match(missingAsset.headers.get('content-type') ?? '', /application\/json/i);

  const unknownRoute = await request('/this-route-must-not-exist');
  assert.equal(
    unknownRoute.status,
    404,
    'Unknown routes must return a real 404, never the SPA shell',
  );
  assert.match(unknownRoute.headers.get('content-type') ?? '', /application\/json/i);

  const assetPath = extractHashedAsset(homeHtml);
  const asset = await request(assetPath);
  assert.equal(asset.status, 200, `Built asset ${assetPath} must be reachable`);
  assert.match(
    asset.headers.get('cache-control') ?? '',
    /max-age=31536000.*immutable/i,
    'Hashed assets must be immutable',
  );
  assertSecurityHeaders(asset);

  const publicSourceMap = await request(`${assetPath}.map`);
  assert.equal(publicSourceMap.status, 404, 'Production JavaScript source maps must not be public');

  const malformed = await request('/api/newsletter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad json',
  });
  assert.equal(malformed.status, 400, 'Malformed JSON must be rejected with 400');

  const tooLarge = await request('/api/newsletter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `a${'x'.repeat(17_000)}@example.com` }),
  });
  assert.equal(tooLarge.status, 413, 'Bodies over the documented limit must be rejected with 413');

  // A successful write proves DATA_DIR, not a build-relative directory, is used.
  for (let count = 0; count < 10; count += 1) {
    const response = await request('/api/newsletter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `release-smoke-${count}@example.test` }),
    });
    assert.equal(response.status, 201, `Write ${count + 1} of 10 must be accepted`);
  }
  const limited = await request('/api/newsletter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'release-smoke-limited@example.test' }),
  });
  assert.equal(limited.status, 429, 'The 11th write in one minute must be rate limited');
  assert.ok(limited.headers.get('retry-after'), 'Rate-limited responses must include Retry-After');

  const newsletterPath = join(dataDir, 'newsletter.jsonl');
  const persisted = await readFile(newsletterPath, 'utf8');
  assert.match(
    persisted,
    /release-smoke-0@example\.test/,
    'DATA_DIR must contain accepted submissions',
  );
  assert.equal(
    (await readdir(dataDir)).some((name) => name.startsWith('.ready-')),
    false,
    'Readiness probes must clean up their temporary files',
  );
  if (process.platform !== 'win32') {
    const permissions = (await stat(newsletterPath)).mode & 0o777;
    assert.equal(permissions & 0o077, 0, 'Submission files must not be group/world accessible');
  }
}

async function assertRapierWasmArtifact() {
  const assetsDir = join(repositoryRoot, 'dist', 'assets');
  const assetNames = await readdir(assetsDir);
  const wasmNames = assetNames.filter((name) => /^rapier_wasm3d_bg-.*\.wasm$/i.test(name));
  assert.equal(wasmNames.length, 1, 'The release must emit one hashed Rapier WASM asset');

  const heroNames = assetNames.filter((name) => /^HeroScene-.*\.js$/i.test(name));
  assert.equal(heroNames.length, 1, 'The release must emit one lazy HeroScene chunk');
  const heroSource = await readFile(join(assetsDir, heroNames[0]), 'utf8');
  assert.doesNotMatch(heroSource, /AGFzb|data:application\/wasm/i, 'HeroScene must not embed WASM');

  const wasmPath = `/assets/${wasmNames[0]}`;
  assert.match(heroSource, new RegExp(wasmNames[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const wasm = await request(wasmPath);
  assert.equal(wasm.status, 200, `Built Rapier asset ${wasmPath} must be reachable`);
  assert.match(wasm.headers.get('content-type') ?? '', /application\/wasm/i);
  assert.match(
    wasm.headers.get('cache-control') ?? '',
    /max-age=31536000.*immutable/i,
    'Hashed Rapier WASM must be immutable',
  );
}

async function assertDiscoveryFiles(slugs) {
  const robots = await request('/robots.txt');
  assert.equal(robots.status, 200, 'robots.txt must ship with the release');
  assert.match(await robots.text(), /Sitemap: https:\/\/reevez\.com\/sitemap\.xml/i);

  const sitemap = await request('/sitemap.xml');
  assert.equal(sitemap.status, 200, 'sitemap.xml must ship with the release');
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /<loc>https:\/\/reevez\.com\/<\/loc>/i);
  for (const slug of slugs) {
    assert.match(
      sitemapXml,
      new RegExp(`<loc>https://reevez\\.com/projects/${slug}</loc>`, 'i'),
      `Sitemap must include ${slug}`,
    );
  }

  const securityContact = await request('/.well-known/security.txt');
  assert.equal(securityContact.status, 200, 'security.txt must ship with the release');
  assert.match(await securityContact.text(), /Contact: mailto:contact@reevez\.com/i);
}

async function assertProjectContent(summaries, homeHtml) {
  const slugs = summaries.map((project) => project.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'Project slugs must be unique');

  const tileSlugs = Array.from(homeHtml.matchAll(/data-slug="([a-z0-9-]+)"/g), (match) => match[1]);
  assert.deepEqual(
    [...new Set(tileSlugs)].sort(),
    [...slugs].sort(),
    'Server-rendered home tiles must match the API project set',
  );

  const details = [];
  const localAssets = new Set();
  for (const summary of summaries) {
    assert.match(summary.thumb, /^\/(?!\/)/, `${summary.slug} thumbnail must be self-hosted`);
    localAssets.add(summary.thumb);
    if (summary.thumbVideo) {
      assert.match(summary.thumbVideo, /^\/(?!\/)/, `${summary.slug} video must be self-hosted`);
      localAssets.add(summary.thumbVideo);
    }

    const response = await request(`/api/projects/${encodeURIComponent(summary.slug)}`);
    assert.equal(response.status, 200, `Project API must resolve ${summary.slug}`);
    const payload = await response.json();
    assert.equal(payload.success, true, `${summary.slug} must use the success envelope`);
    assert.equal(payload.data?.slug, summary.slug, `${summary.slug} detail must match its summary`);
    details.push(payload.data);

    for (const media of payload.data.media) {
      if (media.kind !== 'image' && media.kind !== 'video') continue;
      assert.match(media.src, /^\/(?!\/)/, `${summary.slug} media must be self-hosted`);
      localAssets.add(media.src);
      if (media.poster) {
        assert.match(media.poster, /^\/(?!\/)/, `${summary.slug} poster must be self-hosted`);
        localAssets.add(media.poster);
      }
    }
  }

  const bySlug = new Map(details.map((project) => [project.slug, project]));
  const visited = new Set();
  let cursor = slugs[0];
  while (!visited.has(cursor)) {
    const project = bySlug.get(cursor);
    assert.ok(project, `Next-project ring references unknown slug ${cursor}`);
    visited.add(cursor);
    cursor = project.nextSlug;
  }
  assert.equal(cursor, slugs[0], 'Next-project ring must close at its starting project');
  assert.equal(
    visited.size,
    slugs.length,
    'Next-project ring must include every project exactly once',
  );

  for (const assetPath of localAssets) {
    const response = await request(assetPath);
    assert.equal(response.status, 200, `Project media ${assetPath} must exist in the release`);
    assert.match(
      response.headers.get('content-type') ?? '',
      /^(?:image|video)\//i,
      `Project media ${assetPath} must have an image/video content type`,
    );
  }
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
  const csp = response.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'self'/i);
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/i);
  assert.match(csp, /frame-ancestors 'none'/i);
  assert.equal(response.headers.get('x-powered-by'), null, 'Express fingerprint must not be sent');
}

function extractHashedAsset(html) {
  const match = html.match(/<script[^>]+src="(\/assets\/[^"?]+\.js)"/i);
  assert.ok(match, 'Built home HTML must reference a hashed JavaScript asset');
  return match[1];
}

async function request(path, init) {
  return fetch(`${baseUrl}${path}`, { redirect: 'manual', ...init });
}

async function startServer() {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      DATA_DIR: dataDir,
      CORS_ORIGIN: baseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  child.once('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`Compiled server exited early (${code}):\n${output}\n`);
    }
  });
  return child;
}

async function waitForReady() {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await request('/api/ready');
      if (response.ok) return;
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Compiled server did not become healthy within 15 seconds: ${String(lastError)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 6_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => {
    probe.once('error', rejectListen);
    probe.listen(0, '127.0.0.1', resolveListen);
  });
  const address = probe.address();
  assert.ok(address && typeof address !== 'string', 'Unable to allocate an ephemeral port');
  await new Promise((resolveClose, rejectClose) =>
    probe.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
  return address.port;
}
