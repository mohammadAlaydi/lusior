# Lusion.co Recreation — Claude entry point

**MANDATORY FIRST STEP: read `docs/AI-README.md` before doing anything else.**
It is the single main brief — current state, conventions, and pointers to the
deeper docs. Do NOT read every doc up front; the brief tells you which one you
need for your task.

Quick facts (details live in the brief):

- Goal: pixel-faithful recreation of https://lusion.co — match layout, motion,
  scroll, hover and click behavior EXACTLY; all copy/media stay ORIGINAL
  placeholders.
- Run: `npm run dev` (Vite, port 5173). Build: `npm run build` (tsc + vite).
- `docs/HANDOFF.md` is the detailed per-section source of truth;
  `docs/AI-README.md` is the fast entry brief that links into it.
- A GateGuard hook intercepts the first Edit/Write per file — retry the
  identical call once and it proceeds.
- Never wait on the live lusion.co in an automated browser (it never finishes
  loading); ask the user for screenshots instead.
