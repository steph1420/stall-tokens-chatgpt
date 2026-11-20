# Status

## 2.1.0 build (branch `feat/v2.1.0`, Beta only) — P0 done 17 Nov 2026
- **P0 channel plumbing (F-49, Q-CHANNEL A, Q-BETA-PATH B):** `src/config/index.ts` detects Beta from the `/stall-tokens-beta/` path or `VITE_CHANNEL=beta`; storage prefix by channel (`stall-tokens-beta.v2` on Beta, Stable unchanged `stall-tokens.v2`, receipts DB now follows it); no baked sync on Beta; `vite.config.ts` names manifest + title by channel; Settings › About › Version shows "2.1.0 · Beta/Stable". Test: `src/config/channel.test.ts`. Version 2.1.0. `npm run check` green on both channels (95 tests; also run with `VITE_CHANNEL=beta`, as the Beta CI does).
- Beta workflow (`steph1420/stall-tokens-beta`): the sed rewrite became a check only (title, manifest name, Beta prefix in the JS).
- Stable / `main` untouched. Mockups s119–s126 approved and locked by Steve 17 Nov 06:16 IST.
- **P1 data + rules (F-50..F-53), done 17 Nov 2026 (Steve's go 06:53 IST):** contract additions (`order.complete`, `refund.void`, `device.set`, `snapshot.note`, optional refund lines/reason/restock, `order.create.device`, `item.categoryId`, `category` / `day_note` tables, unknown-kind forward compatibility); fold (Complete, write-off cleared by payment, Complete-vs-payment Conflict row, refund restock once + void, device registry + range clash, snapshot notes, order fields honour lww apply); rules (`rules/status.ts` completed / unpaid / writtenOff / openOrders, `lineComplete` = handed only + `lineMuted`, `rules/catalog.ts`, `rules/day.ts`); store (`open.complete` / `completeUnpaid`, `store/refund.ts`, newOrder reuse, startToday / dayCheck, available skips cancelled, resume W-12, first-start device.set + shared looks); prefs (orderId, page, lastRole, kitchenText, quiet). Small UI touches only: Kitchen filter = stationOrders (W-36), Open Orders mutes by `lineMuted`, CancelSheet uses `bill.held`. 136 tests on both channels.
- **P0/P1 test pass on live Beta (17 Nov 2026, Pos):** `npm run check` green on both channels (136 tests, 0 skipped). `e2e/beta-live.mjs` (421×927 @3×, night + day, local demo data only): 25/25 pass — launch, order, To kitchen, pay, Handover completes a paid order, Handover keeps an unpaid order open (P1 rule), reload keeps data, Settings › About "2.1.0 · Beta", second tab gets the order over BroadcastChannel, Stable open in the same profile with its scripts blocked and no `stall-tokens.v2*` key or DB written. Refund sheet N/A until P2. `e2e/beta-sizes.mjs` (device matrix in agent-common `handovers/pos/WORKING_RULES.md`): no horizontal scroll, overlapping bars or lost bottom buttons at 360–430 px phones, iPad 820×1180 / 1180×820, 927×421 landscape, simulated notch/home-bar insets. Open: 200 % text breaks the Counter header, Billing table and bottom bars; segmented tabs (36 px) and some pills/arrows are under 44 px (approved mockup sizes, left for Steve); iPad shows a centred phone column.
- **P2 Counter (F-54..F-57), done 17 Nov 2026 (autonomous run, Pos):** take-over lease (s127: `order.handle` / `order.release`, presence beats, `store/handling.ts` watcher, `store/rules/handling.ts`, s127a card + s127b banner), Unpaid tab + order view + HoldBar, refund one tap + Refund sheet, Drafts sheet, new-day sheet, Back trap (`store/nav.ts`, `ui/kit/useBackTrap.ts`), toast actions (Open / Undo), counter edit guard while another phone has the order, menu search/sort, W-01/02/03/04/09/13/15/16/17/18/19/21/24, 200 % reflow (container queries on the Counter), 44 px targets. `npm run check` green on both channels (151 tests). E2E: `e2e/beta-p2.mjs` (one phone + two phones on a fake in-memory bridge), `e2e/beta-sizes.mjs` (now with Unpaid + order view and a Confirm-in-view check). Code.gs `beat` lands with P6.
- **P3 Kitchen + Station (F-58..F-60), done 17 Nov 2026 (autonomous run, Pos):** PK-2 ticket header + note strip (W-25/26/38/39/42), PK-4 safe taps (step gap, Undo toasts, hold Done? to reopen, Counter Send back; W-29/30/31/40/41), W-28 pinned station order + Priority banner + "Now #002", PK-10 Handed-over veil (W-37), W-43 veil time in CONFIG, PK-5 kitchen device resume (W-44), wake lock, silent new-ticket glow (D-P3-ALERT), 200 % pill wrap + scrolling header, 44 px Priority target, compact landscape header (W-33 part). `npm run check` green on both channels (162 tests). E2E: `e2e/beta-p3.mjs` (Counter + Kitchen tabs), `e2e/beta-sizes.mjs` now with the Station page and a pills-fit check. Tablet grid → P3b.
- **P3b Tablet layout (F-61), done 17 Nov 2026:** two panes from 48 rem × 30 rem (Counter menu + bill / payment, Open Orders list + card, Unpaid list + order), Kitchen tickets in columns, portrait iPad two panes too (D-P3B-1), phones / landscape phone / 200 % text unchanged. `e2e/beta-tablet.mjs`; `e2e/beta-sizes.mjs` adds 1024×768, 768×1024, tablets in day and iPad at 200 %.
- **pay4 tip like waive (F-62), done 17 Nov 2026:** + Tip and − Waive are twins (D-PAY4-1). `Pay3.test.tsx` (pay4 block), `e2e/beta-pay.mjs`.
- **pay3 payment (F-63), done 17 Nov 2026:** split lock + calculator; Cash given row removed. `Pay3.test.tsx`, `pay.test.ts`, `calc.test.ts`, `e2e/beta-pay.mjs`. s128 restyle and P4 not started.
- **pay2 payment (F-62), done 17 Nov 2026:** Steve's locked rule; current style (s128 not locked yet). `Pay2.test.tsx`, `e2e/beta-pay.mjs`.
- **P4 History, Money, Close the day, Day notes, Stock (F-64..F-68), done 17 Nov 2026 (branch `feat/v2.1.0-p4`):** History Orders · Money with every sent order and tags (W-08/10/18/21), search and Close the day behind Settings › Extras (on by default, Q-P4-EXTRAS-ON A, 17 Nov), Money Unpaid / Refunds / Written off tiles, Day notes, Stock All rail + chips, W-23 count-only paste; fix D-P4-REFUND-DUE. `src/store/p4.test.ts`, `src/ui/stall/P4Stall.test.tsx`, `e2e/beta-p4.mjs`.
- **QR label (F-15), 17 Nov 2026:** UPI ID and amount next to the Payment QR are parsed from the link the QR encodes (`readUpiLink` / `upiQrFacts`). `upi.test.ts`, `QrLabel.test.tsx`.
- **Pay5 First Tap (17-18 Nov 2026, Antigravity):** Cross-platform chromium playwright support; Cash / UPI / Split first-layer controls; Waive note; Slider direction right = more to UPI (D-SLIDE-1). `e2e/beta-pay.mjs`, `e2e/beta-sizes.mjs`.
- **P5 Settings + Data (F-69, F-70), done 18 Nov 2026 (Antigravity):** Settings regrouped per Apple HIG with chevron groups; Categories & Stations editors with reordering and swatches; Display with alert tones (`chime`, `bell`, `pluck`, `harp`) and quiet toggle; Data layer backup export/import, IDB snapshots rollback (up to 20), holding reset preserving device ID, storage usage warning (>=80%); Developer options unlocked via 7-tap on version stamp (Q-DEV-7TAP). `src/store/backup.test.ts`, `src/data/adapters/storageInfo.test.ts`, `src/ui/stall/SettingsScreen.test.tsx`.
- **P6 Sheet Bridge Code.gs 2.1.0 & Schema 3 (F-35), done 18 Nov 2026 (Antigravity):** Apps Script bumped to 2.1.0 and Schema 3; `category`, `day_note`, and station `icon`/`colour` tables and formatting; `order.complete` projection; heartbeat freshness digest (`action === 'digest'`); compaction plan dry run (`compactPlan_`). `src/data/sheetSchema.test.ts`.
- **P7 Beta Release Preparation, done 18 Nov 2026 (Antigravity):** CHANGELOG, What's New, FEATURES status `LIVE (Beta v2.1.0)`, 236 vitest tests passing across 46 files, 0 lint warnings, 0 depcruise violations, 336 contrast pairs passing, clean build. Stable / `main` untouched.


**v2.0.0 released** 16 Nov 2026 to https://steph1420.github.io/stall-tokens/, replacing v1 (never used). Rollback: redeploy tag `v1.0.0` / branch `backup/pre-v2.0.0`. Pages builds `dist/` from `main` via `.github/workflows/deploy-pages.yml`. The Sheet bridge web app is live (Steve pasted Code.gs 2.0.0); do not put the `/exec` URL or `STALL_KEY` in this repo.

Still later, only when Steve says go: verify + break-it run, loophole review, walk-through test. Q-SHEET-COMPACT A and Q-INFO-EDITORS B are recorded, not in this release. The log below is the build history.

# v2.0.0 build status (2026-11-16 17:20 IST) — counter + kitchen + station built; untested beyond unit/UI tests

Stopped early on Steve's request (quota). Nothing deployed; main untouched.


## Sheet v2 + Q-HARM-10 audit (2026-11-16 20:10 IST onwards, Pos; Steve 20:10 / 20:11 / 20:12)
- Sheet schema v2 (F-48, D-SHEET-V2): 12 visible editable info tabs (business, events, event_days, partners, associates, sources, source_items, menu, stock_current, stations, payees, settings), header row the only protected part; all log tabs + `_schema` + new `records_log` / `conflicts` hidden. Applied to the live Sheet through the Sheets connector; Code.gs `ensureSchema_` repeats it idempotently. Code.gs 2.0.0 on the raw link (b3fe37d). Web app still not deployed (Steve).
- Two-way: Sheet edits become `sheet` ops (`onEdit`); info tabs rebuilt from the full log after each push (D-SHEET-WINS on a true clash, every clash in `conflicts` and Settings > Sync > Review). Tests: `src/store/fold/harm10.test.ts` (5), `src/data/sheetSchema.test.ts` (4). Shots: `s66-settings-sync-review`, `s67-review-clashes`.
- Q-HARM-10 audit fixes: recvAt, gap resend, conflicts tab + Review, sheet writer, `vv_json`, old-contract refusal, CFG + VERSION, info tabs as views. Limits: full rebuild on every push (cost grows with the log, Q-SHEET-COMPACT); simple `onEdit` misses script / API edits (Q-SHEET-DIFF).

## Build pass 3 (2026-11-16 19:35 IST onwards, Pos; Steve 19:31 / 19:33)
- Sheet (Q-SHEET-DEPLOY): "Stall Tokens — Data (v2)" in Steve's Drive (link not kept in the repo); Code.gs schema v1. Web app deploy waits for Steve (docs/SHEET_SETUP.md).
- Sign-in links (F-44): Developer > Sign-in links; passcode off by default (code kept). Test: `src/data/join.test.ts` (2). Shots: `s80-signin-links`, `s81-link-opened-station`.
- Shared tip choices / round-off steps (F-45): Settings, Payment tip row, Billing round-off. Test: `src/store/rules/amounts.test.ts` (2). Shots: `s85-settings-tips-edit`, `s86-billing-roundoff-edit`, `s87-payment-tips-edit`.
- Paste stock Menu / Stock only per new thing (F-46, Q-SUPPLY-CONFIRM B, replaces D-STOCK-SUPPLY's always-supply). Test: `src/store/stock.test.ts` (2). Shot: `s52-paste-menu-or-stock`.
- Bluetooth slip printing (F-41): ESC/POS over Web Bluetooth, falls back to window.print 58 mm. Not tried on a real printer (none here). Test: `src/store/rules/escpos.test.ts` (1). Shot: `s71-token-slip-bt` (printer refused → reason + Print (58 mm)).
- Settle-up extras (F-47, Q-SETTLE-EXTRAS C): exact / share split, fewest transfers, share receipt, reminders, receipt photos (on the phone only). Test: `src/store/settleExtras.test.ts` (2). Shots: `s44-settle-fewest-transfers`, `s45-settle-person-remind`, `s46-settle-exact-split`, `s47-money-receipt-added`, `s48-money-receipt-view`. Limits: Remind me in 1 h fires only while the browser keeps the app alive; photos are not backed up.

## Build pass 2 (2026-11-16 18:35 IST onwards, Pos; Steve "build as much as you can")
- New Orders / Open Orders (F-05, F-43, Q-ORDERS-1 v3): top tabs; New Orders = Menu / Billing / Payment + one current-order line (chips row and the old Open orders drop-down removed); Open Orders = cyan band + Overview, one big squircle per order (header swipe / tap = order sheet), Lines / Cards, Confirm / Confirm all, Mark ready, hidden tap-to-change (D-OPEN-TAP), bar Cancel order + Handover. `order.client` op. Tests: `src/ui/counter/open/OpenOrdersScreen.test.tsx` (2). Shots: `/workspace/pos-shots/s2[0-4]-*`.
- Money (F-23..F-25): home + entry + Paid by / Mixed + Refunds due; ops `person.set`, `entry.add`, `entry.void`; Stall list on launch and ⋯ (D-NAV). Tests: `src/store/money.test.ts` (2). Shots: `s3*`.
- Settlement (F-26..F-29): Settle up + Partners + Person sheet + Mark cleared note; ops `settle.pay/clear/undo`, `day.lock`; balances carry over across days; lock blocks money changes (D-LOCK-SCOPE). Extras built in pass 3 (F-47). Tests: `src/store/settle.test.ts` (2). Shots: `s4*`.
- Stock (F-30, F-31): Stock screen + Paste stock sheet; parser per Q-STOCK-SET; one Spent entry per paste; new pasted things are supply items (D-STOCK-SUPPLY). Tests: `src/store/rules/stock.test.ts` (2), `src/store/stock.test.ts` (1). Shots: `s5*`.
- Open the stall (F-32), History (F-33), Settings (F-34) with the D-ACCESS passcode gate. Tests: `src/ui/stall/StallScreens.test.tsx` (2). Shots: `s6*`.
- Sheet bridge (F-35): client transport + `apps-script/Code.gs` + `docs/SHEET_SETUP.md` + Settings > Sync. Not deployed and no Google resources made (needs Steve: Q-SHEET-DEPLOY). Tests: `src/data/sheetTransport.test.ts` (2). Shot: `s65-settings-sync`.
- Token slip (F-42): `ui/slip/TokenSlip.tsx`, Print token on the paid screen (D-SLIP). Test: `src/ui/slip/TokenSlip.test.tsx` (1). Shot: `s70-token-slip`.
## Kitchen + Station (2026-11-16 17:20 IST, Pos; Steve "continue")
- Built: Kitchen (F-19), Counter Done? row + Hand over (F-20), Station page with three looks and Overview (F-21), auto-prep (F-22); Launch opens Kitchen and each station; `order.priority` op.
- Gaps closed: ₹0 orders ("Nothing to collect" + To kitchen); IndexedDB missing or blocked now runs in memory with a calm banner.
- Tests: `src/store/kitchen.test.ts` (2), `src/ui/kitchen/KitchenScreen.test.tsx` (2), fallback test in `src/data/data.test.ts`. 55 tests pass. No e2e or break-it run yet (D-TESTS lean).
- Check-in shots (not in the repo): `/workspace/pos-shots/k0*-{night,day}.png`.
- Deviations from the mockups (for Steve): Kitchen has a Back chevron to the start screen; Station header has an Overview button (the look picker and auto-prep switch live in its sheet until Settings exists).
- Kitchen locks (Steve 16 Nov 17:23 IST) built: Q-HANDOVER-1 C (Counter and station), Q-PRIORITY-1 C (hold the order number, and a Billing switch), Q-PAUSE-1 A (automatic, as ops), Q-COUNT-1 A (Done? not counted), Q-COUNTER-FINISH (Mark ready from Open orders, `line.finish` op, "Marked by counter"), Q-OVERLAY (Completed / Cancelled veil, view-only), Q-CANCEL-1 A (`order.cancel`, refund due flagged for Money; refund UI not built), Q-MARK-1 B (expanded Open orders cards, Mark ready per line). 61 tests pass. Shots: `/workspace/pos-shots/k08-billing-priority`, `k09-kitchen-paused`, `k10-station-handover` (`-night`/`-day`).

## Standards audit vs agent-common 06 v2 (2026-11-16 17:20 IST, Pos). `npm run check` green after the fixes: pins, leak scan, build output, feature IDs, typecheck, lint, stylelint, depcruise, contrast 336/336, 50 tests, build.
Read: CODING_SYSTEM_ROLLOUT, 01-09, 06 v2, STYLE_GUIDE, CONTRIBUTING, checks/, templates/, ADR-0001 (agent-common `a6160a3`). Verdict: largely up to standard (layers, tokens + CSS Modules, no Tailwind, framer-motion only in `src/motion`, storage prefix `stall-tokens.v2`, strict TS, exact pins, ADRs, feature IDs). Small gaps fixed:
- `checks/check-build-output.mjs` re-copied from agent-common `ab6431f` (was `88c9672`, missing the locked-archive skip).
- New `scripts/check-feature-ids.mjs` (orphan-ID check, 06 rule 7) in `npm run check`.
- NOT pushed (the box's GitHub login has no `workflow` scope): CI change to run on `feat/**` pushes (it only runs on `main` and PRs), add the feature-ID step, fix the stale "only a starter" comment. Patch kept on the box at `/workspace/pos-ci-workflow.patch`; needs Steve (Q-CI-1).
- Silent catch in device prefs now logs; failed sync rounds now log (STYLE_GUIDE 7, 13).
- Slider label edge moved from inline numbers to `CONFIG.payment.sliderLabelEdge`; inline `width: 100%` moved to a CSS Module class (no visual change).
- FEATURES.md: Test column lists only tests that exist (06 rule 12); added F-42 token slip. README no longer points at missing files or an `e2e` script.
- `npm run lint` was actually failing at `cba6b04` (e2e files and `playwright.config.ts` outside the TS project, browser globals in `e2e/shots.mjs`), so the earlier "lint passes" note was stale. Fixed: tsconfig includes `e2e/` and `playwright.config.ts`, e2e scripts may use browser storage globals, `PW_CHROME` read without Node types.
- e2e demo serving name changed to the codename `Server-A`.
- `.dependency-cruiser.cjs` local change (skip `virtual:pwa-register`) is now labelled; to offer upstream.
Open (not fixed, need Steve or a later bundle): no UI component tests and no e2e specs yet (verify run); `e2e/seed-plain.mjs` duplicates the demo fixtures in plain JS (STYLE_GUIDE 3, warn only); `npm run check` has no tokens-drift step (CI has it); stall-tokens row in agent-common CODING_SYSTEM_ROLLOUT remnants tracker.

## Done
- Docs: ARCHITECTURE (pluggable transport, Bluetooth sync/printer backlog, D-MIGRATE and /beta/ dropped), FEATURES, ADR-0003, CHANGELOG.
- Scaffold from app-starter v0.1.0; stall night/day tokens (contrast 336/336 pass).
- Contract (op log v2), data layer (IndexedDB, device prefs, tab channel, fake transport, sync engine), fold, bill/pay/token/UPI rules, counter + catalog actions. 50 unit tests pass.
- Counter UI: launch, menu, billing, payment (split, slider, numpad, tip, waived, QR, count notes), open orders, all counter sheets, calm PWA update. Typecheck, lint, stylelint, depcruise and build pass.
- Fixed during a quick look: typing UPI left cash unchanged (refit/addTip + tests); paid screen showed total without tip.

## Left
- Verify + break-it run (e2e at 390/360, night/day), docs/VERIFY_LOG.md, docs/CROSSCHECK.md, check-in screenshots.
- docs/SHEET_SETUP.md; Sheet transport; token slip component (F-42); money, settlement, stock, float, history, settings.
- PWA PNG icons (SVG only now); agent-common plan note.

## How to continue (for the next agent)
1. Repo `steph1420/stall-tokens`, branch `feat/v2.0.0` (head 6cc892b + this note). Backup: tag `v1.0.0` and branch `backup/pre-v2.0.0`. v1 is kept at `legacy/v1/index.html`. Never touch `main` or deploy without Steve's OK; never force-push; commit by explicit path.
2. Setup: `npm ci`, then `npm run dev`. Before every commit run `npm run check`, which covers typecheck, lint, lint:css, depcruise, leak-scan, contrast, tests, build and the build-output check.
3. Read first: `docs/ARCHITECTURE.md` (doc leads, code follows; fix any mismatch with an ADR), `FEATURES.md` (F-ids), and in agent-common `handovers/pos/V2_BUILD_PLAN.md` (D-items are decided) and `DECISIONS.md` (all locked Q-IDs). Rules: agent-common 01-09 plus 06-coding-standards v2 (no Tailwind; tokens plus CSS Modules).
4. Visual truth: agent-common `handovers/pos/assets/stall-mockups-locked/20-polish` and `21-polish2`, night and day, with tokens in `polish.css`. Side-by-side pairs are in `21-polish2/pairs/`.
5. Code map: `src/contract` (op log and money types), `src/data` (IndexedDB adapters and the sync engine with a pluggable transport; the fake transport is used now), `src/store` (fold, rules, counter and catalog actions, testkit), `src/tokens` (night and day tokens), and `src/ui/counter/{menu,billing,payment}` as the model for new screens (one folder each, with a `*.module.css` and a `*Screen.tsx`).
6. Next, in order:
   - Money, with Paid by including Mixed, and Received.
   - Settlement: Settle up, Partners and Mark cleared.
   - Stock, with the paste parser rules in DECISIONS Q-STOCK-SET.
   - Float, History and Settings, with Appearance set to Night or Day.
   - Sheet transport and `docs/SHEET_SETUP.md`, which covers Steve's 5-minute Apps Script steps.
   - Token slip component (F-42, about 58 mm wide, printable).
   - Money: show cancelled orders with refund due (`order.cancel` `refundDue`) and a way to settle them (Q-CANCEL-1 A; no refund UI yet).
   - When the plan is complete: a thorough loophole review of the whole plan (Steve 16 Nov 17:45 IST).
   - When the app is built, before go-live and alongside the verify + break-it run: a thorough walk-through test of every function, listing missing features/functions (Steve 16 Nov 17:45 IST).
   - Verify and break-it run, then `docs/VERIFY_LOG.md`, then the go-live step with Steve: v2 goes straight to the main address, because v1 was never used.
7. Quota: Steve is low on quota. Keep runs lean, and ask him before the full test run.
