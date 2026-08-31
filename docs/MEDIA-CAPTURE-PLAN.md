# Media Capture & Showcase Plan — verified inventory + how to shoot everything

Status: PLAN (2026-07-28). Companion to `PRODUCTION-CONTENT-PLAN.md`:
that doc owns slot specs (§4), copy worksheets (§7), rebrand/deploy/legal;
THIS doc owns the **verified project inventory (platform matrix)**, the
**per-surface shot lists**, and the **automated capture pipeline** — i.e.
what to film in each app, how, and what Claude (Fable) can do autonomously.
Derived from a 6-agent scan of every Desktop project + live URL probes.

---

## 0. TL;DR

- 14 real products found on the Desktop; Paligram is now the seventh featured
  case study. New bench additions: ZadPay, Tech for Palestine, and Balmy. Labs candidates: 3pals
  (Aether, Drive World). Skip list at §2.
- **Platform truth** (user's premise verified): Magic Stamp/Stampi is the
  only FULL-STACK product line (site + 2 dashboards + 4 native mobile apps
  + APIs). Mawared has site + dashboard + native Android. MyWill has
  Flutter app + admin dashboard. Envaglo & Rahmet Ihsan are web-only
  (multi-surface, no mobile). Paligram, ZadPay, and T4P are mobile-first.
- **Live today (probed 2026-07-28):** reevez.com · wealthist.reevez.com ·
  rahmetihsan.com (+api) · envaglo.com + app + stage · mawared.sa ·
  magicstamp.com · Magic Stamp on App Store & Google Play ·
  mywill-api + mywill-dashboard (HTTP) · nahid-hr.vercel.app.
  **Dead:** klipp.app, stampi.io, point3labs.com (+vendor/ops/api),
  Mawared EC2 API (13.61.32.65.nip.io), ohda EC2. Anything dead gets
  captured from a local seeded run.
- **Capture is ~90 % automatable by Fable** on this machine: Playwright
  (installed) for all web stills+loops, Android emulator (3 AVDs present)
  + adb for mobile, prebuilt APKs already on disk for MyWill, Stampi
  customer + ops apps, and T4P. Not automatable: iOS captures (no Mac),
  logins (you type credentials once, sessions are reused), client
  permissions, physical-device b-roll. Detail in §6.
- **Blocker before ANY filming:** the security pre-flight in §7 — several
  repos have live credentials/keys in the tree that must never appear in
  a frame and should be rotated regardless.

---

## 1. Verified inventory — the platform matrix

Surfaces: **W** = marketing website · **D** = dashboard/web-app ·
**M** = mobile app · **B** = backend API. ✅ live now · 🔌 runnable
locally · 💀 was deployed, now dead · — absent.

| Project | Path (canonical) | W | D | M | B | Stack highlights | Live proof today |
|---|---|---|---|---|---|---|---|
| **Magic Stamp (v1)** | `Desktop\magic-stamp` | ✅ magicstamp.com | 🔌 vendor portal + ops portal (CRA/AntD, needs Auth0) | ✅ App Store + Play (`com.parktechnology.purse`; source not on disk) | 🔌 7 services (Express/Lambda) | React 17 CRA, Auth0, RabbitMQ, BigQuery | Site + both store listings live |
| **Stampi (v2)** | `Desktop\stampi` (Turborepo) | 💀 `apps/landing` (Next 16; Vercel preview live) | 🔌 `apps/vendor-portal` :5173 + `apps/ops-portal` :5174 (React 19/Vite, Recharts, Leaflet) | 🔌 native Kotlin/Compose `apps/android` (`com.stampi.app`, **APK built**) + SwiftUI `apps/iOS` + ops stamping apps (`com.stampi.opsadmin`, **APK built**) | 🔌 `apps/api` Fastify 5 + Drizzle + PostGIS :4000 | Rust SDK: stamp-geometry fingerprint verify | Prebuilt APKs + `docker/seed.sql` demo vendor + 1.8k-line DB dump |
| **Rahmet Ihsan** | `Desktop\alrahma-new` | ✅ rahmetihsan.com (`newfront` :3001, ar/en/**tr**, RTL default) | same app: donor dashboard + full admin | — | ✅ `newbackend` Express+Mongo :3000 | Stripe+PayPal+Apple/Google Pay, TipTap CMS | Site + API live; seeders (`seed-progress`, `seed:countries`) |
| **Envaglo ERP** | **`Desktop\merging-envaglo\envaglo-ai`** ← canonical (updated today; NOT `envaglo-erp`) | ✅ envaglo.com (same app `/website`) | ✅ app.envaglo.com — ERP (77 routes: POS, BI, live dashboard, HR…) + multi-tenant storefront `/s/[slug]` + super-admin | — | external Laravel API (stage-api.envaglo.com live) | Next 16, Arabic-first RTL, Reverb realtime, Vego AI | All 3 domains + stage live; `/try` sandbox exists |
| **Mawared** | `Desktop\Mawared` | ✅ mawared.sa (`website` :3002) | 🔌 `admin-dashboard` :3001 (20 routes) | 🔌 native Kotlin/Compose `android` (`com.mawared.dawliah`, Lottie set) | 💀 EC2 API dead → run `backend` NestJS :3000 + seed | Next 16, Prisma, Signit/Nafath verify | Site live; API needs local run (`prisma db seed`: 2 workers, admin) |
| **MyWill** | `Desktop\mywill` | — | 🔌 `mywill-admin-dashboard` :3001 (18 routes, TOTP 2FA) — ✅ mywill-dashboard.bashsquare.com (HTTP) | ✅ Flutter `my-will` (android+ios+web, `com.bashsquare.my_will`) — APK on Desktop + Google Play/App Store listings live | ✅ mywill-api.bashsquare.com (NestJS+TypeORM) | 3.2k-line guided will builder, drawn e-signature, PDF gen, lawyer persona | Native emulator capture + seven official Google Play screenshots captured |
| **Reevez** | `Desktop\reevez` | ✅ reevez.com (`reevez-front` :3001) | same app: `/dashboard-demo` (12 screens, **fully self-seeded — offline**), workflows canvas, Atelier | — | ✅ api.reevez.com (NestJS) | Alex mascot ×5 poses, xyflow canvas | Live + mock-data demo needs no backend |
| **Reevez Workspace** | `Desktop\reevez-workspace` | — (GitHub OSS) | 🔌 self-hosted AI workspace :7000 (Docker) | — | included | Python+JS, MCP servers | **8 ready-made product reels** `docs\*.webm` — drop-in b-roll |
| **ZadPay** | `Desktop\zad\zad` (nested) | — | 🔌 admin console :3100 (22 pages) + merchant portal :3200 | 🔌 Expo RN `apps/mobile` (`com.zadpay.app`) — **69 screens**, no APK, needs backend | 🔌 Fastify+Prisma ledger | Send-money, QR pay, card issuance, KYC; 9 hand-built SVG illustrations | No live deploy; mock data was deleted → needs a seed script written |
| **Paligram** | `Desktop\paligram` | — | — | ✅ Flutter `frontend` (android+ios+macos+web; local ID `com.enigma.messaging.enigma`, published ID `com.messaging.enigma`) | 🔌 FastAPI 9-service compose + seeders | Messaging, profiles, groups, events, and live map; gold visual system | Google Play/App Store live; seven official Play screenshots captured; package-ID mismatch documented |
| **Klipp** | `Desktop\Klipp` | 💀 klipp.app (`apps/landing` :3000, ar/en RTL) | 🔌 `apps/vendor-portal` :5173 — **loyalty-card designer + wallet-pass preview** | — | 🔌 Fastify+Drizzle (docker :5433/:6380) | Apple/Google wallet passes | Local only; partial seeds |
| **Wealthist** | `Desktop\wealthist` | ✅ wealthist.reevez.com (landing) | same app: dashboard/portfolio/analytics (24 routes) | — | ✅ api.wealthist… (Bun+Elysia+Mongo) | Multi-asset: gold/silver/indexes/real-estate | Live, but NO seed script — needs a populated account |
| **Tech for Palestine** | `Desktop\tech-for-palestine` | — | — | 🔌 Flutter `app` (android+ios+web) — **APK at `Desktop\zad\T4P-app-v0.1.apk`** | — | News/events/donations/boycott scanner; full PRD | APK installable today |
| **Balmy** | `Desktop\balmy` | ✅-ish (client repo) | Next 15 bilingual EN/AR storefront: cart, auth, CMS | — | — | 69 commits, polished | Client e-commerce (permission needed) |
| ohda / hr (Nahid) | `Desktop\ohda`, `Desktop\hr` | — | 🔌 ohda Angular 17 RTL (10 seeders, 7 demo logins) · hr Angular 21 dashboard (✅ nahid-hr.vercel.app, live-backend only) | — | ohda Laravel 11 | Approval-chain narrative | **Client-confidential — written OK required; hr repo has live creds in `HANDOFF.md`** |

Not showcase material (verified): `about-us-website`, `final-wordpress`,
`coding` (all empty), `Games` (installed 3rd-party game), `wallet` (1-commit
experiment), `clinicdesk_git_backup` (bare repo, PHP school project),
`watan`/`core`/`investments`/`3d-printing` (real but unfinished — revisit
later), `mohammad` (portfolio shell superseded by this site), `youtube`
(content ops), `cv` (documents). `3pals` → labs, not case studies.

Rahmet Ihsan is a web platform. `alrahma-new` is only the local repository
folder name; it must not be described or presented as a mobile app.

Port collisions when running locally: Mawared admin & MyWill admin both
:3001; Mawared/MyWill/alrahma backends all :3000; three magic-stamp CRAs
all :3000. **Run one product stack at a time** (the capture pipeline does
this anyway).

---

## 2. Showcase tiers (what deserves to be on the site)

- **Featured seven (home grid):** Magic Stamp/Stampi · Rahmet Ihsan ·
  Envaglo ERP · Mawared · MyWill · Paligram · Reevez. Every one has live proof
  through a site, store listing, authorized staging capture, or live API.
- **Bench (detail-page ring, added post-launch, no home tile):**
  Wealthist (live), Klipp (best single visual: card designer), ZadPay
  (deepest mobile UI, 69 screens), Tech for Palestine (mission story, APK
  ready), Balmy (client
  e-commerce, permission first).
- **Labs page (future, per LABS-CLONE-PLAN):** 3pals/Aether (R3F site),
  3pals/Drive World (three.js physics game), Reevez Workspace reels,
  Atelier renders.
- **Skip:** everything in the "not showcase material" list above.
- **Reevez Workspace** also feeds the *Reevez* featured tile as gallery
  material (it's a Reevez product) — its 8 `.webm` reels are free media.

---

## 3. How each platform mix maps onto the site

The detail-page gallery (`shared/projects.ts` media[]) is the instrument —
5–7 items mixing `image`/`video`/`panel`/`text`. Three presentation
patterns cover all seven:

**Pattern A — full-stack product (Magic Stamp/Stampi, Mawared):**
tell it as one ecosystem. Gallery order: wide dashboard still →
`panel` → phone portrait pair (customer app) → **the loop video showing a
cross-surface flow** (e.g. merchant stamps on device → customer app
updates) → text pull-quote → marketing-site still. The story IS the
multi-surface reach; copy names all surfaces ("one platform, five apps").

**Pattern B — web multi-surface (Envaglo, Rahmet Ihsan, Reevez, Wealthist):**
lead with the money screen (POS/live dashboard/donation flow) as the loop,
support with 2 stills from different surfaces (storefront vs admin;
marketing vs dashboard), one `panel`, one `text`. Desktop-frame
everything; use the RTL Arabic UI proudly — it's a differentiator.

**Pattern C — mobile-first (MyWill, Paligram, ZadPay, T4P):**
phone-portrait gallery items (`width: '26em'`) in pairs, loop video is a
screen-recorded flow composited into a device frame over a brand-color
backdrop, one wide still (dashboard if it exists, else marketing/brand
board). Home-tile stills for these = framed-device composites (§5.5).

---

## 4. Per-project shot lists (exact screens, exact sources)

Slot specs (sizes/aspects/encodes) live in PRODUCTION-CONTENT-PLAN §4.
Every featured project needs: 1 tile still (2400×1560, 20:13) · 1 loop
video (1080p, 8–15 s) · 2+ gallery stills · phone shots if mobile.
Below: WHAT to point the camera at, per surface, ranked.

### 4.1 Magic Stamp / Stampi — "two generations of loyalty"
Run for capture: stampi stack locally (`docker compose up` → migrate →
seed → api :4000 → vendor-portal :5173 / ops-portal :5174; login
`demo@stampi.io` from `docker/seed.sql`; load `stampi_db.sql` dump so
charts have volume). v1: only `magicstamp-fe` (`npm start`, static) — or
shoot live magicstamp.com.
- **Tile still:** Card Designer Studio (`vendor-portal /card-designer`,
  live card preview mid-edit) — or device-framed customer app over brand
  backdrop.
- **Loop video (the money shot):** emulator screen-record — customer app
  `Stamp` screen collecting a stamp → card fills → `Rewards` unlock
  (`com.stampi.app` APK is prebuilt). Alt: card-designer interaction
  (flip + live JSON-driven preview).
- **Gallery stills:** vendor `/insights` (Recharts KPIs, seeded from
  dump) · `/map` (Leaflet outlets) · ops-portal `VendorQueue`/`AuditLog`
  ("real platform governance") · magicstamp.com hero (v1 heritage).
- **Phone shots:** `MyCards`, `Stamp`, `Rewards`, `Discover` map
  (emulator, demo-mode status bar).
- **Reel clips:** ops stamping-device app pass/fail verify (the Rust
  stamp-geometry story — "Scan QR → stamp → auto-verify"); card-designer
  flip; stamp-collect moment.
- **Reusable assets:** v1 `magicstamp-fe/src/assets/images/*` (client
  logos — Ozone Coffee, Perky Blenders… **rights check §7 of
  PRODUCTION-CONTENT-PLAN**), `public/assets/screen-scroll.mp4`, brand
  fonts, ar/en copy. Store badges: both listings verified live.
- **Watch out:** all point3labs/stampi.io domains dead — copy should say
  "on the App Store & Google Play" (true) rather than naming dead URLs.

### 4.2 Rahmet Ihsan — "giving, engineered"
Run: live site is fine for public pages; for seeded progress bars run
locally (`newbackend` + Mongo + `seed.ts`/`seed-progress` → `newfront`
:3001).
- **Tile still:** Arabic RTL homepage hero (live site, 1919×1024 backdrop
  energy) — full-bleed, proud RTL.
- **Loop:** donation flow — campaign card → `AmountSelector` →
  `DonationPaymentModal` (Stripe/PayPal sheet) → success confetti page.
  Use Stripe TEST mode locally; never a real payment.
- **Stills:** campaign/project detail with seeded progress bar ·
  zakat/kafalah vertical page (unique Islamic-giving IA) · phone-viewport
  donation (390×844).
- **Bonus:** the `/tr` Turkish locale — one still proves trilingual.
- **Assets:** `newfront/public/figma/` (~40 exported SVGs), `Logo.png`,
  `og-image.png`. Blur/avoid real donor names — reshoot with seeded data
  rather than blurring (§7 rule).

### 4.3 Envaglo ERP — "the system that runs itself"
Captured directly from `stage.envaglo.com` using the owner-provided,
explicitly authorized staging login. The public website, staging storefront,
and authenticated ERP are kept as distinct surfaces.
- **Tile still:** authenticated ERP module home, with no staff or customer data.
- **Loop:** ERP home → inventory analytics → accounting analytics. The POS
  chooser capture was rejected because it exposed staff names and session totals.
- **Stills:** storefront `/s/[slug]/en` product→checkout (LTR variety) ·
  super-admin `NewTenantView`/`FeatureFlagsView` (platform control
  plane) · inventory `abc`/`stocktake`.
- **Goal-section "in" (tablet mock):** strongest candidate site-wide per
  the original plan — use BI dashboard here, pick a DIFFERENT shot for
  the tile to avoid repetition.
- **Assets:** `BRAND.md` (Arabic manifesto — mine for copy), tokens
  `#442c7f`/`#f16332`, Cairo font. NO raster logo exists — export the
  `EnvagloLogo.tsx` SVG at capture time.

### 4.4 Mawared — "workforce, verified"
Run: `backend` infra:up → migrate → `prisma db seed` (admin + 2 workers)
→ `admin-dashboard` :3001 → `website` :3002 pointed at localhost; Android
app built with `-PapiBaseUrl=http://10.0.2.2:3000`. mawared.sa itself is
live for public pages.
- **Tile still:** mawared.sa hero (Arabic, Alexandria font) or worker
  catalog grid.
- **Loop:** Android app — splash Lottie → browse workers → worker detail
  → order flow steps → OTP → success checkmark Lottie. (Compose + Lottie
  = the most "alive" native footage in the whole portfolio.)
- **Stills:** admin worker profile **using the bundled placeholder docs**
  (`public/workers/doc-iqama.png`, `doc-passport.png` — safe by design) ·
  verifications queue (Nafath/Signit angle) · website worker catalog.
- **Phone shots:** home, worker detail, order tracking.
- **Watch out:** seed only creates 2 workers — duplicate via seed edit or
  hand-add ~8 more so grids look populated. Real worker docs are
  radioactive (§7): only the placeholder scans, only seeded names.

### 4.5 MyWill — "a will, without the dread"
Run: Flutter app against LIVE api (`OTP_DEV_MODE` accepts any 4-digit
code — filmable with zero SMS) with a fresh synthetic persona; dashboard
:3001 against local backend + `seed-m*-fixture.sql` + `seed:admin`
(TOTP enroll once).
- **PRE-FLIGHT:** `docs/audit-user.md` says will-create may 400
  (DTO whitelist mismatch) — smoke-test the builder end-to-end BEFORE
  scheduling any recording; fix or film around it.
- **Tile still:** device-framed will-builder step over `#41C0ED` backdrop.
- **Loop:** guided builder — personal info → assets → distribution
  sliders → **signature sheet (finger-drawing the signature is the
  single best motion moment in the portfolio)** → success.
- **Stills:** will PDF preview · lawyer booking calendar · dashboard
  `overview` KPIs · dead-man's-switch `check_in_screen` (unique feature).
- **Phone shots:** onboarding (flutter_animate), document vault, lawyer
  persona home (second persona = breadth).
- **Watch out:** every will screen is synthetic-persona-only; the
  Desktop APK (v1.0.0-final) is the fallback if source build fights.

### 4.6 Reevez — the self-tile
Run: nothing to set up — reevez.com live; `/dashboard-demo` is
self-seeded and works offline (`npm run dev` in `reevez-front` :3001).
- **Tile still:** reevez.com hero (HeroGeometric) — it already looks the
  part.
- **Loop:** `/dashboard-demo` walkthrough — KPI overview → revenue →
  cash-flow → sales-pipeline (12 mocked screens, zero risk).
- **Stills:** workflows canvas (xyflow node graph = visual "AI plumbing")
  · Atelier (plan upload → render gallery) · one Alex-mascot moment.
- **Free b-roll:** `reevez-workspace/docs/*.webm` (8 reels: research,
  compare, chat, gallery…) — re-encode and drop into gallery/reel.
- **Gallery text items:** Hermes / Qeed / Atelier one-liners (per brand
  bible).

### 4.7 Bench shot lists (one line each, shoot during spare cycles)
- **Wealthist:** loop = live dashboard with YOUR real account? NO —
  needs a demo account populated by hand (no seed script); stills =
  multi-asset pages (gold/real-estate) + landing hero. Live-site shots OK.
- **Klipp:** single hero visual = card designer + wallet-pass preview
  (local: docker → seed price-books → portal :5173). Landing RTL flip
  (EN↔AR) is a great 4-second reel clip.
- **ZadPay:** REQUIRES writing a seed script first (mock data was
  deleted). Then: send-money flow (69-screen app), QR pay, card issuance.
  Illustrations (`src/illustrations/`) usable as gallery art today.
  Biggest lift — schedule last or phase 2.
- **Paligram:** seven first-party Play listing screens are captured and
  published in the case-study gallery. The local development APK was also
  launched in the emulator, but authenticated in-app recording remains a
  separate follow-up because its development package differs from the store ID.
- **T4P:** install `Desktop\zad\T4P-app-v0.1.apk` on emulator → news/
  events/boycott-scanner screens.

### 4.8 Reel (45–70 s montage, 2.541:1) — clip pool
Stamp-collect (Stampi) · signature draw (MyWill) · POS checkout + ZATCA
(Envaglo) · donation success (Rahmet) · Mawared Lottie order flow ·
dashboard-demo pipeline (Reevez) · card-designer flip (Klipp) · Paligram
official-listing motion edit · workspace research reel excerpt. Edit ultrawide, AI-generated
original track (generate_audio), per PRODUCTION-CONTENT-PLAN §4 recipe.

---

## 5. The capture pipeline (how, exactly)

### 5.1 One-time setup (15 min, Fable does it)
1. `winget install --id Gyan.FFmpeg` (Playwright's bundled ffmpeg is
   VP8-only — real ffmpeg needed for H.264 mp4 per spec).
2. `harness/capture-media.mjs` + `harness/shot-list.json` — Playwright
   script: `{project, url, viewport, dpr, waitFor, actions[], out}` per
   shot. Viewport/DPR table in PRODUCTION-CONTENT-PLAN §5.1.
   `recordVideo: {size: 1920×1080}` for loops → webm → ffmpeg → mp4.
3. Login handling: scripts use Playwright `storageState`. **You perform
   each login once** in a headed browser (`--save-session <name>` mode
   pauses for you); every subsequent capture reuses the session file.
   OTP-dev-mode apps (MyWill "any 4 digits") need no credentials at all.
4. Emulator prep: `Pixel7_API35` AVD + demo-mode status bar
   (`sysui_demo` broadcast: full battery, no notifications, 9:41).

### 5.2 Web captures (stills + loops) — fully automated
Per project: boot the stack per §4 run recipe (docker/seeds as listed) →
run the shot list → screenshots land at exact 2× pixels → loops recorded
by scripted Playwright actions (deliberate cursor, rehearsed 10-second
path — the script IS the rehearsal, reshoots are free).

### 5.3 Android captures — automated with prebuilt APKs
`emulator -avd Pixel7_API35` → `adb install <apk>` → drive UI via
`adb shell input tap/swipe` sequences (coordinates confirmed by
screenshot-loop) → stills `adb exec-out screencap -p`, motion
`adb shell screenrecord --bit-rate 20000000` (mp4, up to 3 min).
APKs ready today: MyWill (Desktop), Stampi customer + opsadmin (in-tree),
T4P (in `Desktop\zad`), and the Paligram development APK. Buildable on demand: Mawared
(`gradlew assembleDebug -PapiBaseUrl=http://10.0.2.2:3000`), Paligram
(`flutter run --flavor development`), ZadPay (`expo run:android`, needs
backend + seed first).

### 5.4 Encode & post — automated
ffmpeg recipes verbatim from PRODUCTION-CONTENT-PLAN §4 (loop mp4 CRF 20,
poster extraction, reel CRF 21 @ 3456×1360). Reel assembly: scripted
ffmpeg concat + crossfades; music via `generate_audio` (original, licensed
by construction).

### 5.5 Device-frame composites (mobile tile stills)
Composite emulator screenshots into a phone frame over brand-color
backdrop — scripted (sharp/canvas in the harness) for consistency across
all mobile tiles; backdrops can be AI-generated (`generate_image`), kept
non-cheesy and uniform.

---

## 6. What Fable does autonomously vs what needs you

**Fable, hands-off (≈90 % of the media):**
- Build + run every local stack (docker, seeds, dev servers), including
  writing the missing ZadPay seed script.
- All web stills and loop videos (Playwright harness, §5.2), from local
  runs AND the live sites.
- All Android stills/videos via emulator + adb (§5.3), incl. installing
  the 4 prebuilt APKs and building debug APKs for the rest.
- All encoding, posters, device-frame composites, reel assembly; AI music
  + backdrop generation; OG card build.
- Smoke-verifying flows before filming (e.g. the MyWill 400 check).

**You (short, mostly one-time):**
1. **Logins** — type each credential once into the paused capture browser
   / emulator (Fable never enters passwords): stampi demo login, Envaglo
   stage tenant, Mawared seeded admin, MyWill dashboard TOTP enrollment,
   Wealthist demo account (also populate it — no seeder exists).
2. **iOS anything** — no Mac here. Options: (a) skip — copy says "App
   Store & Google Play" with Android footage framed neutrally (recommended
   for launch); (b) you record on your iPhone/Mac later (QuickTime),
   Fable edits it in.
3. **Physical-world b-roll** — the Stampi stamping device in a real café,
   hands holding phones: your phone camera (Fable writes the 6-shot
   brief), or we AI-generate stylized equivalents.
4. **Permissions & claims** (PRODUCTION-CONTENT-PLAN §9): client OKs
   (Point3 Labs, BashSquare, Nahid, Rahmet Ihsan org, Envaglo, Mawared),
   UK client-logo rights, verify "190K users / 10k businesses" numbers.
5. **Decisions:** confirm the featured seven + this plan; approve the
   `winget` ffmpeg install.

**Explicitly out of scope for automation:** anything on the §7 list until
fixed; real customer tenants/data anywhere.

---

## 7. Security pre-flight (fix BEFORE any capture or repo screen-share)

Found during the scan — rotate/remove regardless of filming:
1. `Desktop\hr\HANDOFF.md` — live backend login + pointers to
   `~/.figma-token` (PAT) and `~/.hr-token`; `.env.production` + 1 MB
   Postman collection tracked. Rotate the login + Figma PAT, scrub file.
2. `Desktop\stampi\` — root `.env` (real values), TWO EC2 `.pem` keys,
   `release-keystore.jks`, `google-services.json`;
   `Desktop\magic-stamp\CREDENTIALS.md` (12.5 KB of logins).
3. `Desktop\alrahma-new\newbackend\` — `stripe_webhook_secret.txt`,
   `stripe.exe` committed to the repo.
4. `Desktop\zad\` root — Firebase adminsdk JSON + `zadpay.ppk` loose.
5. `Desktop\youtube\readme.txt` line 1 — plaintext Google API key.
6. `Desktop\mywill\` — `backend.log` (3.3 MB, may contain PII traces),
   `key.properties` + keystore in-repo; `Desktop\my-well.ppk`.
7. Never film: any `.env`, the folders above, `reference/`,
   `server/data/*.jsonl`, `.claude/worktrees/` stale copies (Mawared).

Also fix-before-camera (cosmetic): `reevez/README.md` is still the
AI-Studio template; stampi landing `public/` still has stock Next SVGs.

---

## 8. Execution order (capture sessions)

| # | Session | Needs from you first | Output |
|---|---|---|---|
| 0 | Security pre-flight (§7) + ffmpeg install + build `capture-media.mjs` | approve ffmpeg; rotate creds | harness ready |
| 1 | **Reevez** (live + offline demo — zero risk, calibrates the pipeline) | — | tile, loop, 3 stills |
| 2 | **Rahmet Ihsan** (live site + local seeded donation flow) | — | full set |
| 3 | **Envaglo** (stage + sandbox) | stage tenant login | full set + goal-"in" |
| 4 | **Magic Stamp/Stampi** (local stack + emulator + v1 live site) | demo login typed once | full set + reel clips |
| 5 | **Mawared** (local seeded stack + emulator build) | seeded-admin login | full set |
| 6 | **MyWill** (emulator vs live API; dashboard local) | TOTP enroll; 400-fix verdict | full set |
| 7 | **Paligram** official listing set + native launch, then T4P → Klipp → Wealthist | Wealthist demo acct | featured set + bench loops/stills |
| 8 | Reel edit + music + OG card + goal frames + device composites | pick music vibe | reel + brand slots |
| 9 | (phase 2) ZadPay seed script + capture; labs page media | — | bench +1 |

Sessions 1–6 ≈ one per half-day with the harness; 7–8 ≈ one day. Fits the
"P2 Capture 2–3 d" line in PRODUCTION-CONTENT-PLAN §10 if run
back-to-back.
