# Delta: Current → Target

Current state is **greenfield** — a full audit of `src/` and `server/` (2026-07-12)
found zero analytics/tracking calls of any kind. No remove/rename/keep rows exist;
the delta is pure ADD. ADD (7) = total target events (7). ✓

## Add (not tracked today)

| Event | Category | Where to instrument | Why |
|-------|----------|--------------------|-----|
| `newsletter.subscribed` | core_value | `src/ui/newsletterClient.ts` on 201 (source passed by footer/menu callers) | The site's #1 lead conversion |
| `newsletter.subscribe_failed` | core_value | same module, on mapped failure | Friction visibility on the conversion path |
| `contact.clicked` | core_value | `#talk-btn` click (header) | Contact intent — the other conversion |
| `project.viewed` | core_value | `src/ui/router.ts` commitRoute (project branch); source derived from nav origin | Core portfolio engagement + attribution |
| `project.launch_clicked` | core_value | launch CTA handler in `src/ui/projectDetail.ts` | Click-through proof of project interest |
| `showreel.watched` | core_value | `src/ui/videoOverlay.ts` close path (duration from video.currentTime) | Showreel is the hero content |
| `sound.toggled` | configuration | `src/audio/soundEngine.ts` toggle handler | Experience-feature adoption |

## Traits to set (user, anonymous)

| Trait | When |
|-------|------|
| `first_seen_at` | first load (one-time) |
| `has_subscribed_newsletter` | on 201 subscribe |
| `prefers_reduced_motion` | boot + media-query change |

## Decisions recorded (defaults chosen autonomously — flag if wrong)

- **Naming:** `object.action` snake_case (greenfield shortcut).
- **PII: none in analytics.** Newsletter email never leaves the API path.
- **Internal exclusion:** skip tracking when `localStorage.nw_internal === '1'`.
- **Destinations:** none yet — wire a tiny `track()` module with a no-op default
  so instrumentation can land before a tool is chosen.

## Next step

Run **product-tracking-generate-implementation-guide** ("create instrumentation
guide") to turn this into SDK-specific wiring once a destination is picked.
