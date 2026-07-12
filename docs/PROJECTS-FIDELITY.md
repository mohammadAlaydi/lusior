# Projects fidelity — closing the gap on the two "projects" surfaces

The projects experience is the current fidelity gap: it's good, but not
identical to the reference. This doc is the working protocol to make it
identical. Two surfaces are in scope:

1. **Home featured section** (`src/ui/featured.ts` + `featured.css`) — the 6
   tiles, their scroll bend, hover POV.
2. **Project detail layer** (`src/ui/projectDetail.ts` + `projectDetail.css`)
   — open/close choreography, the horizontal gallery scroll, and the
   next-project advance.

Prereqs from ARCHITECTURE.md: phase 0 (tunables + HUD) and phase 1 (verify
tool). Do those first — without live tuning and repeatable screenshots this
protocol degenerates back into guesswork.

---

## 1. Where the feel currently lives (code map)

| Behavior | Location |
|---|---|
| Gallery wheel/drag → translateX, smoothing | `projectDetail.ts` → `attachInteractions`: `addDelta`, `tick` |
| Next-project fill/drain + advance | `attachInteractions`: `applyNextRatio`, `addDelta`; `drivePreview` |
| Item reveal as they enter | `attachInteractions`: `revealVisible` |
| Open/close choreography | `runOpenChoreography` / `runCloseChoreography` |
| Featured scroll bend (CSS approximation) | `featured.ts` → `setupScrollBend` (`velocity * 0.035`, ease `0.12`, clamp ±1.2°) |
| Featured hover POV | `featured.ts` → `setupHover` (`POV_PAN 0.03`, `POV_SCALE 1.12`, blur pulse) |
| Existing evidence | `harness/drive.mjs` + `harness/shots*/` (gallery-end → next-fill 25/50/75/95 → advance; reverse drain) |

Every constant named above migrates into the tunables registry
(ARCHITECTURE §2.4) as step one.

## 2. Deviation checklist (suspected gaps, most-visible first)

Each row: verify against a fresh reference recording, then fix, then re-diff.
Do not "fix" unverified rows — some may already match.

| # | Suspected deviation | Where | Likely fix |
|---|---|---|---|
| D1 | **Scroll bend is CSS skew, reference is a WebGL mesh warp** — content itself bends there; ours tilts rigidly | featured tiles + likely detail gallery media | The real fix is architecture phase 5 (TrackedPlane + vertex bend by smoothed velocity). Interim: tune skew constants to read closer at normal speed. |
| D2 | **Gallery smoothing is frame-rate-dependent or wrong τ** — `current += (target-current)*k` per tick with fixed k behaves differently at 60/120/144Hz | `tick` | Switch to `k = 1 - Math.exp(-dt/τ)`; measure τ per §3 (expect 0.08–0.2s). |
| D3 | **Wheel normalization** — trackpad vs notched wheel vs Firefox line-mode land at different speeds | `onWheel`/`addDelta` | Normalize `deltaMode` (×1 / ×16 / ×viewport); clamp per-event max; single `wheelScale` tunable. |
| D4 | **No release momentum on drag** — reference almost certainly coasts after a flick and rubber-bands at the edges | pointer handlers + `tick` | Track velocity over last ~80ms of moves; on release decay `v *= exp(-dt/τv)`; sub-linear resistance past [0,max] with spring-back. Verify each behavior in the recording FIRST. |
| D5 | **Next-advance friction** — fill rate per px, drain rate, the hold-at-full before firing, and whether the preview is draggable all need numbers (recent commit made it "deliberate"; deliberate ≠ measured) | `applyNextRatio`, `addDelta`, `drivePreview` | Measure from recording: px of over-scroll to reach 100%, ms of hold before navigation, drain speed on reverse. Encode as `nextFillPerPx`, `nextHoldMs`, `nextDrainTau`. |
| D6 | **Item reveal timing** — threshold, duration, and whether reveals are scrub-linked or one-shot | `revealVisible` | Frame-step the recording at a constant slow scroll; note viewport fraction at trigger + animation length. |
| D7 | **Open choreography order/overlap** — title rise vs desc vs side-list vs back-btn offsets can drift from the reference stagger | `runOpenChoreography` | Frame-by-frame the open recording; write the timeline offsets down; match. |
| D8 | **Hover POV magnitude/lag** — pan fraction, over-scale, blur pulse timing | `setupHover` | Same frame method on a slow hover recording; tune `POV_PAN`/`POV_SCALE`/durations live. |
| D9 | **Mobile gallery** (<=812px vertical stack) unverified against reference mobile | CSS + interactions | Capture mobile recording; verify stack spacing + native scroll behavior. |

## 3. The measurement protocol (per interaction)

**Ask the user for capture** (automated browsing of lusion.co is banned —
AI-README rule 3). One 60fps recording each, slow + natural:

- G1: single wheel notch in the gallery, then hands off (measures input
  scale + τ from the settle)
- G2: continuous medium scroll through the whole gallery
- G3: fast trackpad flick, hands off (momentum: coast distance + stop time)
- G4: drag with mouse, release mid-motion (drag scale + momentum)
- G5: scroll to end, keep scrolling into next-project until it navigates
  (fill rate, hold, threshold)
- G6: fill next-project ~60% then reverse (drain rate)
- G7: project open transition (choreography offsets)
- G8: slow hover circle over one featured tile (POV lag + magnitude)

**Quantify** (`reference/` stays gitignored):

```bash
ffmpeg -i g1.mp4 -vf fps=60 reference/frames/g1/%04d.png
```

Track one high-contrast edge in the gallery across frames (Preview/GIMP
pixel ruler is fine). Produce `t, x` pairs. Then:

- input scale = total displacement for one notch
- τ = time until remaining distance falls to 37% after input stops
- momentum τv = same fit on the release segment
- next-advance = px-of-input ↔ bar `scaleX` mapping (our harness shots
  already show OUR side at 25/50/75/95% — mirror those against theirs)

**Tune live**: run our site + the recording side-by-side, HUD sliders until
motion overlays. Commit the numbers with the G-recording IDs in the commit
message so future sessions know what they were tuned against.

## 4. Refactor spec (small, do during phase 0)

```ts
// src/ui/feel.ts (until packages/core lands)
export const GALLERY_FEEL = tunable('projectGallery', {
  wheelScale: 1.0, dragScale: 1.6, smoothTau: 0.12,
  flickTauV: 0.6, edgeResistance: 0.35,
  nextFillPerPx: 1 / 900, nextHoldMs: 120, nextDrainTau: 0.25,
  itemRevealAt: 0.85,
});
export const FEATURED_FEEL = tunable('featured', {
  bendPerVelocity: 0.035, bendEase: 0.12, bendClamp: 1.2,
  povPan: 0.03, povScale: 1.12,
});
```

- `tunable()` returns the object as-is in prod; in dev it lazy-imports
  Tweakpane and binds a folder. No other file may keep inline feel numbers.
- `tick` in `attachInteractions` and `setupScrollBend` switch to
  `1 - Math.exp(-dt/τ)` smoothing (D2) in the same change — it alters
  perceived values of every other constant, so land it before tuning.

## 5. Harness promotion (phase 1)

`harness/` → `tools/verify/` (commit it — it's currently untracked):

- `scenarios/project-gallery.mjs` (today's `drive.mjs`),
  `project-reverse.mjs` (today's `reverse.mjs`), plus `featured-hover.mjs`
  and `project-open.mjs`.
- Shared helpers: boot-wait, `window.__lenis.scrollTo` driving, foreground
  guard, gsap manual-tick fallback (verification-playbook.md rules).
- `diff.mjs` (pixelmatch) against committed `golden/*.jpg`; `shots/`
  gitignored. Scripts: `verify:projects`, `verify:featured`, `verify:all`.

## 6. Acceptance

- [ ] Every D-row verified against a G-recording (matched or fixed+matched)
- [ ] All feel constants live in tunables; zero inline magic numbers left
- [ ] Smoothing is frame-rate independent (same feel at 60/120Hz — test by
      toggling monitor refresh or Chrome's frame-rate throttle)
- [ ] Side-by-side at 0.5×: gallery scroll, flick, next-advance, open
      choreography, featured hover indistinguishable
- [ ] `verify:projects` + `verify:featured` green, goldens updated
- [ ] Reduced-motion paths still correct after every change
