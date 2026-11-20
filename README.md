# Stall Tokens
Ordering, billing and token app for a fair stall: Counter (menu, billing, payment), Kitchen and stations, money, settle-up and stock. Offline-first PWA; every phone keeps the whole op log and syncs through a Google Sheet bridge.

- Live: https://steph1420.github.io/stall-tokens/ (v2.0.0). Rollback: redeploy tag `v1.0.0`.
- Docs: `docs/ARCHITECTURE.md` (read first), `FEATURES.md`, `docs/adr/`, `CHANGELOG.md`, `docs/STATUS.md`, `docs/SHEET_SETUP.md`. Still to come: `docs/VERIFY_LOG.md` (verify run).
- Develop: `npm ci`, `npm run dev`. Full gate: `npm run check`. End-to-end (Playwright, `playwright.config.ts`): no specs yet; they come with the verify run.
- v1 (the original single file, never used) lives in `legacy/v1/index.html`, tag `v1.0.0`, branch `backup/pre-v2.0.0`.
