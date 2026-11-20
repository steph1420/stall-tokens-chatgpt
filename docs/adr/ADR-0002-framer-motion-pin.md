# ADR-0002 — Motion library: framer-motion pinned exactly at 12.43.0
Format: agent-common `templates/ADR-0000.md` (commit `8b0539c`).

- Date: 16 Nov 2026
- Who: Kiwi; agreed in the Coding System room (General, Lippy, LFPS SOW), Steve's go 16 Nov
- Owner: Kiwi
- Status: Accepted
- End condition: replaced by a future ADR for one tested upgrade of every app together (to `motion` and/or v14), with Steve's go.

## Context
Framer Motion was renamed Motion; its new package is `motion` (import from `motion/react`). The Driftline Kit and Steve's apps run `framer-motion` 12.x, the kit pinned at 12.43.0. The current release line is 14.x.

## Decision
- The starter uses `framer-motion`, pinned exactly at `12.43.0`, the same as the Driftline Kit.
- Only `src/motion/` imports it. Springs and timings come from the motion tokens (`src/motion/tokens.ts`, generated from Driftline `tokens.json`). Reduced motion falls back to a short fade.
- Nobody mixes `framer-motion` and `motion` in one app.

## Rejected options
- `motion` 12.43.0: it is a thin wrapper whose dependency on `framer-motion` is a range (`^12.43.0`), so the exact pin would leak.
- Moving to 14.x now: a visible behaviour change across apps; it belongs in one tested upgrade with its own ADR.

## Consequences
- dependency-cruiser fails if anything outside `src/motion/` imports `framer-motion`.
- ESLint fails on inline spring numbers, timings or easing, and on importing `motion` / `motion/react`.
- The upgrade, when Steve approves it, changes `package.json`, `package-lock.json`, `src/motion/` and this ADR together.
