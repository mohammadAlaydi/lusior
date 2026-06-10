# Agent briefing — how AIs talk to each other in this repo

This is the message template the orchestrator sends to every builder
subagent, plus the rules that make parallel work safe. It captured what
actually worked across the multi-agent sessions that built this site.

## The reusable preamble (paste into every builder prompt)

> You are building ONE section of a pixel-faithful recreation of lusion.co.
> Project root: C:\Users\pc\Desktop\website (Vite + TypeScript, no framework).
>
> MANDATORY first reads: docs/AI-README.md, src/styles/tokens.css,
> src/styles/global.css, src/styles/end.css + src/ui/end.ts (model section),
> src/ui/splitWords.ts, src/ui/scroll.ts.
>
> HARD RULES:
> 1. Write ONLY the new files listed in your task. NEVER edit index.html,
>    src/main.ts, tokens.css, or any other existing file — the orchestrator
>    integrates markup and wiring.
> 2. A GateGuard hook may intercept your FIRST Write/Edit per file — retry
>    the identical call once.
> 3. Reference CSS measurements in your prompt are ground truth — match them
>    EXACTLY (font sizes, em paddings, grid columns, easing curves).
> 4. ALL copy/media must be ORIGINAL placeholders.
> 5. Every animation needs a prefers-reduced-motion fallback.
> 6. TypeScript strict, no `any`, explicit return types on exports,
>    2-space indent, single quotes.
> 7. You may run `npx tsc --noEmit`; do NOT run dev servers or browsers.

## The output contract (structured output schema)

Every builder returns: `files` (absolute paths written), `markup` (HTML
snippet with a placement comment on line 1), `imports` (exact main.ts import
lines), `calls` (exact setup-call lines + params the orchestrator must
supply), `notes` (caveats, behaviors, deviations).

## Parallelization rules

- Sections are independent: one agent per section, each creating only its own
  `src/styles/X.css` + `src/ui/X.ts` (or `src/scene/X.ts`).
- The orchestrator alone edits shared files (index.html, main.ts, tokens.css)
  — sequentially, after all agents return.
- Cross-agent contracts go through explicit APIs (e.g. tunnel.ts exposes
  `onProgress(cb)`; TunnelScene exposes `setProgress(p)`) — agents never
  import each other's unwritten files.
- Exception: a scene-tuning agent may own and edit an existing scene file
  (e.g. HeroScene.ts) if NOTHING else runs against that file concurrently.
