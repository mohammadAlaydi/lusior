# Production Content Plan — real Reevez data into the lusion-recreation

Status: PLAN (2026-07-24). This is the single source of truth for taking the
site from placeholder content to a production launch under the **Reevez**
brand. It was derived from a full sweep of the codebase (every content slot,
with file:line refs) and a full inventory of the projects on the Desktop.

Related docs: `AI-README.md` (entry brief), `media-credits.md` (current
placeholder media — all of it must be replaced), `project-details-spec.md`
(detail-page data contract), `ARCHITECTURE.md` (engineering endgame).

> **UPDATE 2026-07-28 — see `MEDIA-CAPTURE-PLAN.md`** for the verified
> per-project platform matrix, per-surface shot lists, and the automated
> capture pipeline (it supersedes the sketches in §5–§6 here). Facts
> corrected by that scan: **canonical Envaglo repo is
> `Desktop\merging-envaglo\envaglo-ai`** (not `envaglo-erp`);
> point3labs.com/stampi.io/klipp.app are currently DEAD (Magic Stamp v1
> magicstamp.com + both app-store listings ARE live); mawared.sa is live
> but its EC2 API is down (film from local seeded stack); MyWill admin
> lives at mywill-dashboard.bashsquare.com (HTTP). New bench candidates
> found: Enigma (paligram), ZadPay, Tech for Palestine, Balmy; labs
> candidates: 3pals (Aether / Drive World), Reevez Workspace reels.

> **IMPLEMENTATION UPDATE 2026-08-31:** the home grid now has seven case
> studies, with Paligram promoted under its published product name. Current
> media provenance and completed captures are tracked in `media-credits.md`
> and `MEDIA-CAPTURE-PLAN.md`; older six-slot recommendations below are retained
> as planning history.

---

## 0. TL;DR

- Content architecture is already production-shaped: **`shared/projects.ts`
  is the CMS** (typed, versioned, served by the API with a bundled fallback).
  No external CMS needed for 6–10 case studies. We swap data + media files,
  not code.
- The home featured grid is **duplicated as static HTML** in
  `index.html:304–418` — the one real wiring gotcha. Keep in sync (or add the
  small codegen/QA-diff task in §8).
- Six featured slots. Recommended lineup: **Magic Stamp, Rahmet Ihsan,
  Envaglo ERP, Mawared, MyWill, and Reevez itself** as the self-referential
  6th tile (mirrors lusion's "Northwind is our own studio site" move).
  Bench for the ring / later: Klipp, Wealthist, Stampi, ZadPay, Enigma.
- Media needed: 6 tile stills (20:13), ~6 gallery loop videos (16:9),
  2–3 detail stills per project, 1 ultrawide reel montage (2.541:1),
  2 goal-section images, OG card, favicon set. Full specs in §4, capture
  recipes in §5, per-project shot lists in §6.
- Launch blockers beyond content: rebrand pass (the header logo still reads
  "LUSION" — `index.html:29`), placeholder emails/links, SEO pack, SPA
  rewrite for `/projects/:slug`, newsletter destination, client permissions
  (§9). Phased checklist in §10.

---

## 1. Decisions to confirm (everything else proceeds on these defaults)

| # | Decision | Recommendation (default) | Alternatives |
|---|---|---|---|
| D1 | Domain | `work.reevez.com` (or `studio.reevez.com`), promoted from reevez.com. Doesn't displace the converting company site; can take over the apex later. | Make this the new `reevez.com`; personal domain |
| D2 | Brand voice of the site | Reevez studio site ("We build…" — the agency/studio showing shipped product work) | Personal portfolio ("I build…") |
| D3 | Featured six | Magic Stamp · Rahmet Ihsan · Envaglo ERP · Mawared · MyWill · Reevez | Swap any with Klipp / Wealthist / Stampi |
| D4 | Stampi vs Magic Stamp | One case study ("Magic Stamp / Stampi" — same engine lineage, richest media) | Two separate entries |
| D5 | Newsletter destination | Forward via Resend (or keep JSONL + daily off-box backup) — §8.4 | Buttondown/Mailchimp; drop newsletter |
| D6 | Menu dead links | Wire to anchors at launch (About→#goal, Projects→#featured, Contact→footer) | Build real About/Contact pages (post-launch) |
| D7 | Analytics | Implement the 7-event plan in `.telemetry/` with self-hosted Umami (fits your PM2/nginx habits) | Plausible; skip at launch |
| D8 | Arabic/RTL | English-only at launch; Arabic is a fast-follow (brand bible says Arabic beachhead — worth a phase 2) | Bilingual at launch (bigger scope) |

---

## 2. The lineup

### Featured six (home grid, ring order = `nextSlug` chain)

| # | Slug | Project | One-liner | Category line (draft) | Live proof |
|---|---|---|---|---|---|
| 1 | `magic-stamp` | Magic Stamp / Stampi | UK digital loyalty platform — physical punch cards → digital stamps; customer + merchant apps on App Store & Play | Product • Mobile • Loyalty | point3labs.com, stampi.io |
| 2 | `rahmet-ihsan` | Rahmet Ihsan | Charity donation platform with PCI-compliant payments and campaign pages (Arabic) | Web • Payments • Impact | rahmetihsan.com |
| 3 | `envaglo` | Envaglo ERP | Multi-tenant ERP + eCommerce analytics — stores, orders, POS, real-time dashboards | SaaS • Analytics • ERP | app.envaglo.com |
| 4 | `mawared` | Mawared International | Workforce & recruitment platform (Saudi) — worker docs, admin, marketing site, Android app | Platform • Workforce • Mobile | AWS Amplify deploy |
| 5 | `mywill` | MyWill | Digital will-writing with licensed lawyers — guided builder, e-signatures, encrypted storage (Flutter) | App • Legal Tech • Security | shipped APK v1.0.0; client dashboard live |
| 6 | `reevez` | Reevez | The studio itself — AI automation: custom workflows, dashboards, AI teammates | Studio • AI • Automation | reevez.com |

The 6th tile is self-referential exactly like the placeholder "Northwind"
entry (`shared/projects.ts:322`) — swap its copy for the Reevez story
(brand bible: `Desktop\reevez\.claude\skills\brand-builder\references\reevez-brand.md`,
LOCKED 2026-07-13; internal proof-products Hermes / Qeed / Atelier make
great gallery text-items).

### Bench (add to the detail ring later without adding home tiles)

Klipp (barbershop OS, klipp.app), Wealthist (wealthist.reevez.com — live
Reevez product), Stampi (if split from Magic Stamp), ZadPay (fintech),
Enigma (secure messaging — 260 assets). The ring can be longer than the
grid: `nextSlug` advance will pass through them even if they have no home
tile. Do this only after launch; it needs no new code.

---

## 3. How real data plugs in (the "best way")

**Keep `shared/projects.ts` as the CMS.** It is typed
(`ProjectDetail`/`MediaItem`/`ThemePalette`), feeds both the Express API and
the offline fallback, and versioned in git. An external CMS adds infra for
zero benefit at this scale.

Per project you author one `ProjectDetail` object:

```
slug, title, category, accent, thumb, thumbVideo?,
year, description[2 paragraphs], sideLists[Services, Credits/Links],
launchUrl, launchLabel, theme{9 colors}, media[5–7 items], nextSlug
```

Media conventions (new, replaces `p1..p6`):

```
public/media/<slug>/
  thumb.jpg        ← home tile + detail poster  (20:13, §4)
  loop.mp4         ← main gallery video (16:9 loop, §4)
  still-1.jpg …    ← gallery stills
  phone-1.jpg …    ← portrait app screenshots (mobile projects)
public/reel/desktop.mp4   ← the montage (shared reel + overlay)
public/goal/in.jpg, out.jpg
```

Update paths in `shared/projects.ts` AND in the hardcoded home grid
(`index.html:304–418` — slug, accent, name, category, background-image per
tile). These two MUST stay in sync (QA-diff script: §8.6).

Notes that reduce work:
- **Home tiles keep a still fallback and play `thumbVideo` only on hover or
  keyboard focus.** Touch and reduced-motion users retain the still. Each loop
  is also listed explicitly in the corresponding detail gallery.
- `panel` media items are pure CSS (gradient + big label) — free, no asset.
  Use them generously between real shots, like the placeholders do.
- `text` items carry pull-quotes — free.
- Theme palettes: derive from each product's brand assets
  (`Mawared\website\brand-assets`, alrahma `figma/`, MyWill logos, Stampi
  card designs, Reevez brand bible). Rule of thumb from the placeholders:
  `bg` = very dark shade of the brand hue, `bgAlt` one step lighter,
  `text` near-white tinted, `highlight` = the brand accent, buttons white.
  Contrast-check text/highlight on bg (WCAG AA) before locking.

---

## 4. Media specs per slot (capture to these, exactly)

Aspect ratios are pinned by CSS — deviating means crop. "Preferred" = 2×
retina headroom.

| Slot | Path | Aspect | Min | Preferred | Format & notes |
|---|---|---|---|---|---|
| Featured tile still | `media/<slug>/thumb.jpg` | **20:13** (padding-top 65%, `featured.css:81`) | 1200×780 | **2400×1560** | JPEG q82–88, sRGB, 150–450 KB. Cover-cropped; keep subject centered — hover pan pushes edges off-frame |
| Gallery loop video | `media/<slug>/loop.mp4` | 16:9 | 1280×720 | **1920×1080 @30fps** | H.264, muted, **no audio track**, 8–15 s seamless-ish loop, ≤10 MB, `+faststart`. Poster = extracted first frame |
| Gallery still | `media/<slug>/still-N.jpg` | flexible (band is height-fixed, items cover-crop) | 1600 px wide | **2000–2560 px wide** | Landscape 16:9-ish; the item's `width: "NNem"` in data should roughly match source aspect to minimize crop |
| Phone screenshot | `media/<slug>/phone-N.jpg` | ~9:19.5 portrait | 1080×2340 | **1170×2532** | Straight from device/emulator; render as narrow gallery item (`width: '26em'`-ish) |
| **Showreel** | `reel/desktop.mp4` | **2.541:1 (1728:680**, `reel.css:198–202`) | 2592×1020 | **3456×1360 @30fps** | Edit the montage natively ultrawide. Reel frame = cover (crop-safe), overlay = contain (letterboxed — looks cinematic). H.264 CRF 21 + AAC 160k audio, 45–70 s, ≤30 MB. Music must be original/licensed (AI-generate like the existing loops) |
| Goal "in" (tablet mock) | `goal/in.jpg` | **1496:1080** (`goal.css:119`) | 1496×1080 | **2992×2160** | Product-UI shot; outer ~4–5 % hidden under bezel inset — keep content off the edges |
| Goal "out" (banner) | `goal/out.jpg` | **2000:1404 source**, visible ≈1.9:1 band (`goal.css:146–155`) | 2000×1404 | **4000×2808** | Wide brand/studio/abstract shot; top+bottom ~15 % gets cropped — keep subject in the central horizontal band |
| OG card | `public/og.jpg` (new) | 1.91:1 | — | **1200×630** | Purpose-built: Reevez wordmark + montage. Replace `og:image` (`index.html:19` currently reuses p2.jpg) |
| Favicon set | `public/` | — | — | SVG + 32px .ico + **180×180 apple-touch** + webmanifest | Reevez mark exists: apple-touch 180×180 + logo in `Desktop\reevez\reevez-front` assets; wordmark at `reevez-workspace\docs\reevez-wordmark.png` |
| Audio loops | `assets/audios/*.m4a` | — | — | keep | Already original AI-generated — no action |

**Encode recipes (ffmpeg):**

```bash
# gallery loop: master (OBS/mkv or emulator mp4) → web
ffmpeg -i master.mkv -an -vf "scale=1920:1080:flags=lanczos,fps=30" \
  -c:v libx264 -profile:v high -crf 20 -preset slow -pix_fmt yuv420p \
  -movflags +faststart media/<slug>/loop.mp4

# reel montage (edited at 3456×1360)
ffmpeg -i reel-master.mov -vf "scale=3456:1360:flags=lanczos,fps=30" \
  -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart public/reel/desktop.mp4
# if >30 MB: -crf 23, or scale=2592:1020

# poster from first frame (prevents pop on hover-play)
ffmpeg -i loop.mp4 -frames:v 1 -q:v 2 poster.jpg
```

---

## 5. Capture playbook (how to actually take the pics)

### 5.1 Web products — automate it (pixel-exact, repeatable)

Use Playwright (already a repo habit — `harness/qa-*.mjs`). One capture
script + a shot-list JSON per project:

- Viewport = target CSS size, `deviceScaleFactor: 2` → exact 2× pixels:
  - Tile still: viewport **1200×780 @ DPR 2** → 2400×1560
  - Gallery still: **1280×720 @ DPR 2** → 2560×1440
  - Goal "in": **1496×1080 @ DPR 2** → 2992×2160
  - Phone: **390×844 @ DPR 3** → 1170×2532 (or real device, §5.2)
- Hygiene: fresh profile, no extensions, hide scrollbars, OS 100 % scaling,
  sRGB (Night Light OFF), let fonts/images settle (`networkidle` + small
  delay), freeze animated hero moments deliberately (capture at the beat
  that looks best, not at t=0).
- Proposed: `harness/capture-media.mjs` reading
  `harness/shot-list.json` (`{project, url, viewport, dpr, waitFor, out}`).
  ~1 h to build, then every reshoot is free — and when a product UI
  improves, re-running refreshes the whole portfolio.

### 5.2 Recordings (gallery loops + reel clips)

- **OBS**, 1920×1080 @ 60 fps, high-bitrate CQP master; browser in a clean
  window sized to 16:9. Slow, deliberate cursor; rehearse the 10-second
  path first (one scroll, one hover, one click — like lusion's clips,
  motion is the subject).
- Trim/encode with the §4 recipes (export at 30 fps; 60 only if a motion
  demo truly needs it — halves the bytes).
- Reel: capture 8–12 clips of 4–6 s across all projects (mix web + app +
  dashboards), edit to an AI-generated original track at 2.541:1. The crop
  to ultrawide is an *edit-time* decision per clip — frame the interesting
  band.

### 5.3 Mobile apps (MyWill, Magic Stamp, Enigma, Mawared Android)

- Android emulator (Pixel 7-class, 1080×2400) or real device:
  - Stills: `adb exec-out screencap -p > phone-1.png`
  - Motion: `adb shell screenrecord --bit-rate 20000000` or
    `scrcpy --record` (60 fps)
- Demo accounts with **seeded fake data only** (§9). Status bar: clean it
  (full battery, no notifications) — emulator demo mode:
  `adb shell settings put global sysui_demo_allowed 1` + demo broadcast.
- Stampi iOS: needs a Mac/TestFlight device — or frame the Android captures
  and say "App Store & Play" in copy without iOS-specific shots.
- Optional flourish for tile stills of mobile projects: composite the
  screenshot into a device frame over a brand-colored backdrop (you have an
  AI image pipeline — the Atelier habit — for tasteful backdrops). Keep it
  consistent across all mobile tiles.

### 5.4 Which projects have reusable assets already

Magic Stamp (408 files — client-logo marquee, 724×555 carousels), Enigma
(260), Mawared (251 — full brand set), Rahmet Ihsan (216 — 1919×1024
backdrop, figma logo set), Envaglo (182 — logos + icon library), MyWill
(69 — 1024² icon, splash), Balmy (55), Reevez front (63 — Alex mascot,
logos). Mine these for logos/palettes/marketing shots before capturing new.

---

## 6. Per-project shot list (what we need from each)

Every project needs: **1 tile still (2400×1560) · 1 loop video (10 s
1080p) · 2 gallery stills · palette + logo · copy worksheet (§7)**. Plus
specifically:

| Project | Extra captures | Watch out |
|---|---|---|
| Magic Stamp / Stampi | Customer app + merchant app (emulator: stamp-collect moment as the loop), stamp-card UI closeup, marketing FE from stampi.io, client-logo marquee still | **Client-logo rights** (Costa, Allpress…) §9; verify "10k businesses / 190K users" numbers before publishing; iOS shots need device |
| Rahmet Ihsan | Live site hero + campaign page (desktop), donation flow on phone viewport, reuse 1919×1024 backdrop | Blur/avoid real donor names & amounts; Arabic UI — pick shots that read RTL-proud |
| Envaglo ERP | Analytics dashboard with **seeded demo tenant** (charts moving = great loop), POS module, store-management screen | Never a real customer tenant; check no real revenue figures on screen |
| Mawared | Marketing site (Amplify URL), admin worker-profile screen (seeded), Android app still | Worker docs (iqama/passport/medical) are highly sensitive — only fabricated records on screen |
| MyWill | Flutter app on emulator: guided-builder step as the loop, e-signature screen still, dashboard still | Legal doc content must be dummy; client is BashSquare — permission §9 |
| Reevez | reevez.com hero, `/dashboard-demo` as the loop, Alex mascot asset, n8n workflow canvas shot | This tile doubles as the brand story — gallery `text` items: Hermes / Qeed / Atelier one-liners |
| — Reel | 1–2 best clips from each of the six + Wealthist/Klipp as bonus variety | Original music (AI-generate); 45–70 s total |
| — Goal frames | `in`: best product UI inside the tablet mock (Envaglo dashboard is the strongest candidate). `out`: wide Reevez brand shot (workspace/abstract — could be AI-generated, keep it non-cheesy) | Respect the crop bands (§4) |

---

## 7. Copy worksheet (fill one per project — I can draft all six for review)

```yaml
slug: magic-stamp
title: Magic Stamp            # tile + <h1> + next-preview
category: Product • Mobile • Loyalty   # tile line-1 + header info
year: "2026"                  # header info ("CATEGORY - YEAR")
accent: "#RRGGBB"             # tile hover + transition wipe
description:                  # exactly 2 <p>, ~40–60 words each
  - What it is + the hard thing we built (told like a story, not a spec).
  - The outcome/result line (numbers if verified, feeling if not).
sideLists:
  - title: Services           # 3–5 items
    items: [Product Design, Mobile Engineering, Backend & APIs, Loyalty Infrastructure]
  - title: Credits            # 2–4 items — real collaborators/clients (with permission)
    items: ["Client — Point3 Labs", "Build — Reevez"]
launchUrl: https://stampi.io  # real, or omit → CTA hides automatically
launchLabel: Launch website   # / "Get the app" / "Visit the studio"
theme: {bg, bgAlt, text, highlight, btnBg, btnText, btnTextHover, iconBg, iconColor}
media:                        # 5–7 items; mix kinds — panels/text are free
  - {kind: image, src: /media/magic-stamp/still-1.jpg, width: 64em, height: fill, alt: "…"}
  - {kind: text,  text: "One-sentence pull-quote.", width: 26em}
  - {kind: panel, tone: accent, width: 40em, height: fill, label: STAMPS}
  - {kind: video, src: /media/magic-stamp/loop.mp4, poster: /media/magic-stamp/thumb.jpg, width: 72em, height: fill, alt: "…"}
  - {kind: image, src: /media/magic-stamp/phone-1.jpg, width: 26em, height: fill, alt: "…", caption: "…"}
nextSlug: rahmet-ihsan
```

Voice: confident, sensory, first-person-plural ("We built…"), no jargon
walls — match the pacing of the existing placeholder copy, which already
has the right rhythm. Site-wide copy to rewrite at the same time: hero
headline, showreel title/paragraph, manifesto, end CTA, footer address —
all inventoried with line numbers in §8.1.

---

## 8. Integration & code tasks (small, then the content drops in)

### 8.1 Rebrand pass (the LUSION/Northwind/example.com sweep)

- `index.html:29` — header logo text **"LUSION" → "REEVEZ"** (most visible bug)
- `index.html:6,9,13–20` — title, **meta description (currently mentions
  lusion.co!)**, OG tags, `og:image` → new `/og.jpg`
- `src/ui/router.ts:39` — `BASE_TITLE` → "Reevez"
- `index.html:563–565,642` — footer address + "© 2026 Reevez"
- Emails: `hello@example.com` ×5 + `biz@example.com`
  (`index.html:50–64,136–140,597–609`) → `hello@reevez.com` (set up the
  mailbox/alias — D1 domain first)
- Socials `index.html:570–593` + `SIDE_LIST_LINK_URLS`
  (`src/ui/projectDetail.ts:293–305`) → real Reevez profiles
- Menu dead links `index.html:75–105,143` → anchors (D6); labs link
  `index.html:644–646` → hide or future labs subdomain
- `public/favicon.svg` → Reevez mark (+ .ico, apple-touch, webmanifest)
- Featured disclaimer `index.html:299–301` (placeholder-work note) → remove
- Placeholder studio names in copy ("Studio Northwind", "Northwind Labs",
  "Field Recordings", "Open Signals") — all die with the data swap

### 8.2 Data + grid swap

- Rewrite `PROJECTS` in `shared/projects.ts` (6 entries, new ring)
- Mirror the grid in `index.html:304–418` (slug, accent, name, category,
  background-image per tile)
- Drop old `public/featured/p*.{jpg,mp4}`, `public/reel/desktop.mp4`
  placeholders (they're third-party CC-BY media — **cannot ship**), add the
  new `public/media/<slug>/` tree

### 8.3 SEO / meta pack

`public/robots.txt`, `public/sitemap.xml` (`/` + 6 project URLs),
`<link rel=canonical>`, per-project `document.title` already works
(`router.ts:98`) — add meta-description/OG swap on route change if desired
(nice-to-have; crawlers get the static index anyway).

### 8.4 Newsletter/contact destination (D5)

`server/src/repository.ts` currently appends JSONL to `server/data/` —
fine on a single VPS, but add: forward-to-email (Resend) or at minimum a
cron'd off-box backup of the JSONL. In-memory rate limit is OK for one
instance. Set `CORS_ORIGIN` to the prod origin. A tiny `/privacy.html` +
footer link for the email collection (GCC + EU visitors).

### 8.5 Deploy (fits your existing PM2/nginx pattern)

- `npm run build` → `dist/` static; serve via nginx
- **SPA rewrite is mandatory**: `try_files $uri /index.html;` — deep links
  `/projects/<slug>` currently 404 on any static host
- Express API via PM2 (`node server`), nginx `location /api` proxy
- `vite.config.ts` — **turn off `build.sourcemap` for prod**
- Caching: hashed assets immutable 1y; `index.html` no-cache; videos with
  Range support (nginx default) — consider Cloudflare in front for video
  bandwidth
- TLS via certbot/Cloudflare; add the domain to CORS_ORIGIN

### 8.6 Nice-to-haves (post-launch OK)

- Grid-sync QA script (diff `index.html` tiles vs `shared/projects.ts` —
  harness style, catches drift)
- Analytics: implement the 7 events designed in `.telemetry/tracking-plan.yaml`
  (D7)
- Extend the ring with bench projects (§2)
- Arabic/RTL pass (D8); real About/Contact pages

---

## 9. Permissions, legal, truth (the stuff that bites later)

1. **Client approval** to publish each case study: Point3 Labs (Magic
   Stamp/Stampi), BashSquare (MyWill), Nahid (Ohda/HR — bench only),
   Rahmet Ihsan org, Envaglo, Mawared. Get a one-line written OK each.
2. **Third-party logos** (Costa, Allpress… in the Magic Stamp marquee):
   need permission or replace with a neutral "trusted by 10,000+ shops"
   line. Same for App Store / Google Play badges (those have usage rules
   but are freely licensed if unmodified).
3. **No real user data in any pixel**: donor names/amounts, worker
   documents (iqama/passport/medical!), wills, balances, phone numbers in
   WhatsApp shots. Seeded demo data only; re-shoot rather than blur where
   possible.
4. **Claims must be verifiable** ("190K users", "10,000+ businesses",
   "PCI-compliant") — confirm each number/cert with the client before it
   ships in copy.
5. **Current media legally cannot ship**: Sintel/Big Buck Bunny (CC-BY,
   credit required) + Picsum stills are placeholders per
   `media-credits.md` — replaced by this plan anyway.
6. **Reel music**: original or licensed only (AI-generate to match the
   existing original loops).
7. Fonts are safe (Aspekta, SIL OFL — `public/fonts/ASPEKTA-LICENSE.txt`).
8. Never ship `reference/` (already gitignored) or `server/data/*.jsonl`.

---

## 10. Phased rollout

| Phase | What | Effort |
|---|---|---|
| P0 Decisions | D1–D8 above; request client permissions (§9.1) — start now, it's the long pole | 0.5 d + wait |
| P1 Copy | Fill 6 worksheets (§7) + site-wide copy (hero, manifesto, footer). I can draft all of it for your review | 1 d |
| P2 Capture | Build `harness/capture-media.mjs`, shoot stills per shot list (§6); record loops + reel clips; edit reel + AI music | 2–3 d |
| P3 Integrate | §8.1 rebrand + §8.2 data/grid/media swap; palettes contrast-checked | 1 d |
| P4 Infra | §8.3 SEO pack + §8.4 newsletter + §8.5 deploy to staging URL | 0.5–1 d |
| P5 QA | `harness/qa-*.mjs` suite + content QA: every link resolves, alt text present, palette AA contrast, OG validators (opengraph.xyz), Lighthouse, low-end device scroll test, reduced-motion pass, 360px + ultrawide viewports | 0.5–1 d |
| Launch | DNS cutover, Cloudflare cache warm, socials announcement assets (reuse OG card) | 0.5 d |

Total: roughly **one focused week** once permissions are in.

### Definition of done (launch gate)

- [ ] Zero occurrences of: LUSION (visible), Northwind, example.com,
      lusion.co (meta), placeholder media files
- [ ] All 6 projects: real copy, real media, verified claims, client OK
- [ ] Reel plays (section + overlay), ≤30 MB, original music
- [ ] `/projects/<slug>` deep-link refresh works on prod host
- [ ] Newsletter POST lands somewhere a human reads
- [ ] robots/sitemap/OG/favicon/canonical in place; sourcemaps off
- [ ] QA suite green; Lighthouse sanity; reduced-motion honored
