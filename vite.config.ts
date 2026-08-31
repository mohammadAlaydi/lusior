import { defineConfig } from 'vite';
import type { HtmlTagDescriptor, Plugin } from 'vite';
import * as wasmPlugin from 'vite-plugin-wasm';

// vite-plugin-wasm 3.6 ships a dual ESM/CJS declaration wrapper that NodeNext
// resolves as a nested default module even though the runtime default is the
// documented plugin factory. Keep the assertion local to that package seam.
const createWasmPlugin = wasmPlugin.default as unknown as () => Plugin;

/**
 * The hero chunk (three.js + Rapier WASM, ~850KB gz) is dynamically imported
 * from main.ts, so Vite doesn't emit a modulepreload for it — the download
 * only starts after index.js has downloaded AND executed. Injecting preload
 * links lets the browser fetch the heavy chunks in parallel with index.js,
 * which directly shortens how long the preloader blocks first reveal.
 */
function preloadHeavyChunks(): Plugin {
  return {
    name: 'preload-heavy-chunks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return [];
        const tags: HtmlTagDescriptor[] = [];
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue;
          if (/^(HeroScene|three)/.test(chunk.name ?? '')) {
            tags.push({
              tag: 'link',
              attrs: { rel: 'modulepreload', href: `/${chunk.fileName}` },
              injectTo: 'head',
            });
          }
        }
        return tags;
      },
    },
  };
}

export default defineConfig({
  plugins: [createWasmPlugin(), preloadHeavyChunks()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Forward API calls to the Express backend (npm run server / dev:all).
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    // The Express static root is public. Even a "hidden" source map remains
    // downloadable by its predictable filename, so production artifacts never
    // place maps in dist. Generate/upload them in a separate private pipeline
    // if an error-monitoring service is introduced later.
    sourcemap: false,
  },
});
