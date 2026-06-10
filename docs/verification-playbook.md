# Verification playbook — how to actually see this site working

## Basics

- Dev server: `npm run dev` → http://localhost:5173. Desktop = 1440px+ window
  via the Claude-in-Chrome MCP (the built-in preview panel renders ~739px).
- Drive scroll through Lenis, never window.scrollTo:
  `window.__lenis.scrollTo(y, { immediate: true })` (dev-only global), or
  `{ duration: 22 }` for a cinematic ride.
- Verify reveals by reading computed styles after a jump
  (clip-path/transform/opacity), not by eyeballing screenshots.

## The hidden-tab trap (the big one)

Chrome FULLY suspends requestAnimationFrame for hidden/occluded tabs:
gsap freezes, the preloader sticks at 100, Lenis stops, CDP screenshots time
out with "renderer frozen". JS keeps executing — only frames stop. This looks
exactly like a site bug. It is not; it self-heals on visibility.

Workarounds:
1. Bring the window forward: PowerShell
   `(New-Object -ComObject WScript.Shell).AppActivate(<chrome pid>)` +
   `SendKeys('^9')` to activate the last tab (Win32 SetForegroundWindow if
   AppActivate fails).
2. Or drive gsap manually while hidden:
   `import('/node_modules/.vite/deps/gsap.js?v=<hash>')` then
   `setInterval(() => gsap.ticker.tick(), 16)` — boot, scrubs and Lenis all
   work; remember to clearInterval after. CSS transitions still won't
   advance (compositor-driven).

## Other quirks

- Vite serves missing media as 200 text/html (SPA fallback) — a <video> may
  never fire 'error'. Force `video.load()` and/or check
  `readyState === HAVE_NOTHING` after a grace period.
- CDP screenshots can force frames on a hidden tab near the top of the page
  but tend to time out at deep scroll positions. Probe with JS instead.
- Reloading mid-page: boot intentionally restarts at top (matches the real
  site's preloader flow) — don't "fix" that.
- The GateGuard hook intercepts the first Edit/Write per file: retry the
  identical call once.
