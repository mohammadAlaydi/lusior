# Roadmap — post-release priorities

Current as of 2026-08-31. The release candidate is complete in source; this
roadmap starts with production operations and follows measured value.

## 1. Launch operations

- Configure the final HTTPS edge, `CORS_ORIGIN`, `TRUST_PROXY`, private
  readiness probe, cache purge, and immutable release image.
- Provision and restore-test the persistent submission volume; assign PII
  retention/deletion and incident ownership.
- Add liveness/readiness/log alerts and decide on public error telemetry.
- Complete iOS Safari, mid-tier Android, keyboard-only, zoom, and screen-reader
  checks against the final hostname.
- Verify social previews, search-console ownership, sitemap ingestion, and the
  previous-image rollback procedure.

## 2. Lead operations

- Add explicit duplicate-subscription semantics and operator tooling for
  export/deletion.
- Integrate an approved CRM/ESP or transactional notification path behind the
  repository/service boundary.
- Move persistence and rate limiting to shared managed services before a second
  application replica.

## 3. Performance based on field data

- Capture Core Web Vitals and WebGL initialization timing by device tier.
- Track the separately cached Rapier WASM download/compile time and Hero quality
  tier; change preload or scene budgets only when field data identifies a real
  bottleneck, with visual/physics regression tests retained.
- Convert remaining large lossless case-study images to modern formats with
  visual baselines and explicit fallbacks where the target browser matrix needs them.
- Consolidate renderers behind a scene manager only if profiling or planned
  cross-scene morphs justify the complexity.

## 4. Content workflow

- Generate home-card markup from the shared content manifest if the fixed
  six-slot art direction becomes dynamic.
- Add route-specific server-rendered social metadata if individual case-study
  link previews become a marketing requirement.
- Formalize asset provenance/approval fields when non-studio contributors begin
  publishing content.

## 5. Engineering quality

- Add focused unit tests when pure routing/validation/repository logic grows;
  keep browser tests for user-observable contracts.
- Add screenshot baselines only for stable visual invariants; avoid brittle
  pixel tests for physics and continuous motion.
- Review dependencies on a schedule through Dependabot; treat three.js 0.x and
  build-tool upgrades as tested release events.
