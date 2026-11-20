# ADR-0001 — Styling: Driftline tokens + CSS Modules
Format: agent-common `templates/ADR-0000.md` (commit `8b0539c`).

- Date: 16 Nov 2026
- Who: Kiwi; follows agent-common `adr/ADR-0001-styling.md` (Steve 16 Nov)
- Owner: Kiwi
- Status: Accepted
- End condition: permanent

## Context
Steve chose one styling system for every app (agent-common `06` and `adr/ADR-0001-styling.md`). The starter is where new apps begin, so it must start on that system.

## Decision
- Every value comes from the Driftline tokens (`src/tokens/tokens.css`, Driftline Kit v0.3.0, see `src/tokens/SOURCE.md`) as `var(--dl-…)`.
- Component styles are CSS Modules (`*.module.css`) next to their component. Global CSS is only `src/ui/global.css`.
- No Tailwind: no dependency, no config, no utility classes, no `@tailwind`/`@apply`.

## Rejected options
- Tailwind on top of the tokens: retired by agent-common ADR-0001 (two systems, arbitrary-value loophole).
- CSS-in-JS: a second way to style and a runtime cost, for nothing the tokens don't give us.

## Consequences
- stylelint fails on raw hex/rgb/hsl/named colours and raw `px` outside `src/tokens/`.
- ESLint bans importing `tailwindcss`.
- Hairlines use the CSS keyword `thin` rather than a px value.
