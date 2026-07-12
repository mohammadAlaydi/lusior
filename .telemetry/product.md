# Product Model — Northwind Studio (lusion.co recreation)

## What it is

A WebGL/scroll-driven **studio portfolio site** (Vite + TS + three.js + GSAP +
Lenis) with an Express API. Single page + project-detail overlay routes
(`/projects/<slug>`). All copy/media are original placeholders under the
"Northwind Studio" brand. No auth, no accounts, no billing, no user-generated
content.

- **Category:** marketing / portfolio site (B2C-style anonymous visitors)
- **Business goal:** generate qualified studio leads and demonstrate craft
- **Primary value actions:** newsletter subscription (`POST /api/newsletter`)
  and contact intent (LET'S TALK mailto). Secondary: project engagement.

## Surfaces & features

| Surface | Features |
|---|---|
| Home | hero (physics jacks), showreel + video overlay, featured grid (6 projects), manifesto, 3D tunnel, end CTA, footer |
| Project detail | themed overlay, horizontal gallery, next-project overscroll advance, launch CTA |
| Global | header menu (anchor nav), sound engine toggle, newsletter forms (footer + menu), reduced-motion fallbacks |

## Entity model

Anonymous visitors only — **no group hierarchy; user-level tracking only.**
Newsletter email is collected server-side and is NOT used as an analytics
identity (see PII policy in tracking plan).

## Integrations / destinations

None connected today. Plan is destination-agnostic (CDP-ready). Server API is
Express with zod validation + rate limiting; a server-side proxy for events is
possible later.

## Current tracking state

Greenfield — zero analytics calls anywhere in `src/` or `server/` (audited
2026-07-12 during the production-hardening session). No audit artifact needed;
the delta is pure ADD.
