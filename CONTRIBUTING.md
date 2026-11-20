# Contributing
This app follows `steph1420/agent-common` **`06-coding-standards.md`** and agent-common **`CONTRIBUTING.md`** (read both first). The documents lead; the code follows. Short version, in order (the bundle order from agent-common):

1. Read `06-coding-standards.md` and `docs/ARCHITECTURE.md`.
2. State `fits ARCHITECTURE §x` in the bundle and the PR. If no section fits, write an ADR in `docs/adr/` and wait for Steve's OK.
3. Find or add the feature ID in `FEATURES.md`; use it in code and commit.
4. Send a bundle proposal (agent-common `templates/BUNDLE.md`) locked to what Steve named.
5. Wait for Steve's go.
6. Back up, tag a rollback point, branch from an up-to-date `origin`. Never work on `main`.
7. Write the tests with the code.
8. Run `npm run check` (pins, leak scan, build output, types, ESLint, stylelint, dependency rules, contrast, tests, build). It must be green. Look at screenshots at every scale in ARCHITECTURE §6, night and day.
9. Push only on Steve's OK. Never force-push, never move a tag, stage files by explicit path (never `git add -A`).
10. The pre-push hook runs the leak scan (installed by `npm install` via `core.hooksPath=.githooks`). Codenames only, no secrets.

PRs use agent-common `templates/PR_CHECKLIST.md` (see `.github/pull_request_template.md`).
