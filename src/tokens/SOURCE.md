# Token source
- `tokens.json` and `scripts/` are copied from `steph1420/agent-common` `design-options/driftline-kit/packages/tokens/` — **Driftline Kit v0.3.0** (status PROPOSED), agent-common commit `822ff79`.
- One local change: `scripts/build.mjs` writes `tokens.css` and `tokens.ts` here (next to `tokens.json`) instead of `dist/`.
- `tokens.css` and `tokens.ts` are generated (`npm run tokens`); never edit them by hand. CI regenerates them and fails if they differ from `tokens.json`.
- To take a newer kit version: copy the new `tokens.json`, run `npm run tokens && npm run contrast`, record the version here and in `CHANGELOG.md`.
- Local change (ADR-0003, 16 Nov 2026): family `stall` (night + day) added to `tokens.json`, and `info` / `text-display` roles added to every family (defaulting to accent / text) so the stall pairs are contrast-checked. Stall extras live in `stall.tokens.css`.
