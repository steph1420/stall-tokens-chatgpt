# ADR-0003 — Stall accent family (vibrant cyan, night + day)
Format: agent-common `templates/ADR-0000.md`.

- Date: 16 Nov 2026
- Who: Pos; Steve locked the look in Q-POLISH-SET1 (15:26 IST) and Q-POLISH-SET2 (15:40 IST), plan D-ACCENT
- Owner: Pos
- Status: Accepted
- End condition: permanent for Stall Tokens unless Steve picks another family.

## Context
agent-common `04-app-standards.md` names Driftline blue as the primary accent. Steve locked a vibrant dark-glass look for this app with a cyan CTA and Apple-system semantic colours (green #30D158, amber #FF9F0A, red #FF453A, info #5AC8FA), plus a bright day mode for sunlight (Q-DAY-1).

## Decision
- Add a `stall` family (night + day) to `src/tokens/tokens.json` with the locked values; it is contrast-checked like every other family.
- Values that are not semantic colours (background art, CTA gradient, glows, item accents, numeric weights) live in `src/tokens/stall.tokens.css` as `--dl-stall-*`.
- Day text colours use the AA-darkened values from the locked day mockups.

## Rejected options
- Driftline blue: does not match the locked mockups Steve approved.
- Raw colours in CSS modules: banned by `06` rule 3.

## Consequences
The kit's `tokens.json` gains one family (recorded in `src/tokens/SOURCE.md`). Other apps are not affected.
