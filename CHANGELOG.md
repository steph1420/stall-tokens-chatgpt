# Changelog
All notable changes to Stall Tokens. SemVer. Times IST.

## [2.1.0] - 18 Nov 2026 (Beta)

### 2.1.0 P6 — Sheet Bridge Code.gs 2.1.0 & Schema 3 (18 Nov 2026, Beta; F-35)
- **Code.gs 2.1.0 (Schema 3):** Added `category` and `day_note` to record tables; visible info tabs `categories` and `day_notes` with automatic formatting; added `icon` and `colour` columns to stations.
- `order.complete` projection support for Google Sheets.
- Added `digest_` freshness check endpoint (`action === 'digest'`) for bridge heartbeats.
- Added `compactPlan_` 60-day compaction dry-run support.

### 2.1.0 P5 — Settings regrouped & Data Layer (18 Nov 2026, Beta; F-69, F-70)
- **Settings regrouped (F-69):** Apple HIG quiet grouped rows with chevrons across General, Display, Menu, Kitchen, Money, Sync, Extras, Data, Account, Passcode, Developer, and About.
- **Categories & Stations editors:** Reorder (↑/↓), rename, default station, colour swatch picker, hide categories; name, icon, colour, active toggles for stations.
- **Display & Audio:** Appearance (Night/Day/Auto), Haptics, Kitchen text size, selectable alert tone (`chime`, `bell`, `pluck`, `harp`) and quiet toggle.
- **Data layer & Backup Engine (F-70):** Back up now (JSON export with timestamp and device ID), Restore from file with op fold integrity, Snapshots list with one-tap rollback (keeping up to 20 local IDB snapshots), Reset app with 3-second hold-to-confirm preserving device ID, and storage persistence & warning (>=80% usage).
- **Developer 7-tap (Q-DEV-7TAP):** Tapping the version stamp 7 times within 1.5 seconds unlocks Developer options with countdown toasts. Sign-in links moved under Account group.

### Payment first tap (s129b, Q-PAY5-1 A), 17 Nov 2026
- A tall **Cash | UPI | Split** control is the first layer. Nothing is selected when Payment opens. Cash puts the whole amount on Cash; UPI puts it on UPI and shows the QR (with the UPI ID and amount from the link) straight away; Split reveals the existing boxes, locks, calculator, slider, + Tip / − Waive and the Allowed by note.
- In Cash and UPI, Tip or waive is one tap away (the mockup hides the pills). Count notes is an inline drawer, only when Cash is more than ₹0, hidden the first time, and this phone remembers whether it was left open or closed.

### Waive note (Steve, 17 Nov 2026)
- Typing an Other amount for − Waive or + Tip no longer closes the chip row.
- The Waive picker is only for the amount (₹10, ₹20, Other). Once a waiver is set, a calm note under the amounts reads "₹30 waived · Allowed by Choose ▾". Tapping it opens the existing Waived sheet (optional name and reason; Confirm never waits for it).
- Every handle sheet (and the Payment number pad) can be dragged, closes on a tap outside, and closes with a downward flick.

### Extras on by default (Q-P4-EXTRAS-ON A), 17 Nov 2026
- Close the day and History search are on for every phone, including ones with saved settings that never touched the toggle. A phone that explicitly turned one off stays off. The switches stay in Settings › Extras.

### P4 follow-up — Stock at large text, 17 Nov 2026
- On a phone at 200 % text, Stock names and "Not counted" no longer run off the row. Categories become a wrapping chip row, and the count sits under the name when the line is tight. The size e2e now fails (instead of a false pass) if anything is off-screen.

### QR label (F-15), 17 Nov 2026 — Steve
- Next to the payee selector, above the Payment QR, the UPI ID and the amount are shown (the ID is selectable). Both are read back from the same `upi://pay` link the QR encodes (`pa` and `am`), so the number on screen is the number that will be scanned. The QR still sits below the split, and still hides while UPI is ₹0.

### 2.1.0 P4 — History, Money, Close the day, Day notes, Stock (17 Nov 2026, Beta only; F-64..F-68)
- **History** has Orders · Money. Every order that went to the kitchen is listed (unpaid ones too), with its #004 token and one plain tag: Paid cash / UPI, Unpaid ₹25, Written off, Refund due, Refunded ₹15 cash, Cancelled · Refund due ₹20. Tap a row: Take payment, Edit, Refund (whenever money is held), Print token, Hold to cancel. Each day has **Notes ›**.
- **Money** shows what came in, a separate **Refunds** tile, **Unpaid ₹X · n** (opens the Unpaid tab) and **Written off**.
- **Close the day** (switch on in Settings › Extras): Unpaid, Refunds due, Cash in the box (count notes; "₹20 short"), Day notes, Lock the day, then a **Day summary** with top sellers and Hold to share.
- **History search** (switch on in Settings › Extras): token, name or item.
- **Stock:** All at the top of the rail; Low and Sold out are chips. Pasting "Tea 20pcs" with no price just adds 20 to Tea (no Spent).
- **Fixed:** a refunded order showed up again as Unpaid (and in the Unpaid count) because the refund made the bill look owed. Only the part of a refund that gives back an overpayment counts against the bill now (D-P4-REFUND-DUE).

### pay4 tip like waive (F-62), 17 Nov 2026 — Steve
- **+ Tip is now a twin of − Waive:** same pill side by side, same chips (₹10, ₹20, Other), same Undo toast. The "No tip" chip and the pencil on the Payment screen are gone; tap a lit chip to take the tip off. An Other amount shows as its own lit chip. Tip choices stay in Settings (₹10, ₹20 by default).

### pay3 payment (F-63), 17 Nov 2026 — Steve: lock, calculator, no "Cash given"
- **Removed** the "Cash given" ₹100 / ₹200 / ₹500 row and the "Give back" box. Cash or UPI typed above the amount is clamped to it. Old records with a cash-given amount still read fine.
- **Padlock on Cash and UPI.** A locked side never changes by itself; the other is always the rest, so Cash + UPI = amount due. Locking one unlocks the other. + Tip / − Waive move the unlocked side; if the locked side is now above the amount it is lowered to fit, with a calm toast. While locked the slider rests (dimmed), and the "rest" box says so when tapped.
- **Calculator** button by "To collect": a big-key calculator sheet (0–9, ., +, −, ×, ÷, =, C, delete). Standalone; "Use as Cash" / "Use as UPI" put the result in and lock that side. Dividing by 0 shows "Can't divide by 0".

### pay2 payment (F-62), 17 Nov 2026 — Steve's locked rule
- Cash + UPI always equal the amount due; whichever box is typed or slid, the other is the rest. A shortfall can't happen.
- The amount due changes only with **+ Tip** and **− Waive** (₹10, ₹20, Other; Undo toast). Waive can't go above the bill. These replace the Tip row and "Round off / waive".
- **Cash given** ₹100 / ₹200 / ₹500 in one tap, with a big **Give back ₹X**.
- Tip and waive show on the slip and in Money (new Waived tile); the Sheet already records both.

### P3b tablet layout (F-61), 17 Nov 2026
- **Two panes on a tablet** (48 rem wide and 30 rem tall, so 820×1180, 1180×820, 1024×768, 768×1024): Menu beside the bill or payment; Open Orders list beside the order card; Unpaid list beside the order. The number pad stays in its pane.
- **Kitchen:** tickets in columns (3 across at 1180, 2 at 820).
- **Unchanged:** phones, a phone on its side (927×421) and 200 % text keep one column; at 200 % on a tablet the station pills wrap.

### Hotfix 17 Nov 2026 — payment split always balances (Steve, live Beta #001)
- Typing Cash or UPI always moves the other box to the balance (UPI = total − cash, cash = total − UPI); the slider follows. Before, after the slider (or typing both boxes) the old value stayed and a "Waived" row appeared on its own.
- A waive / round-off is only made through the explicit "Round off / waive" control (then the pencil edits who / note). Payment checks refuse any gap that isn't that explicit amount (UI and store).
- Cash typed above the total is change due ("Cash given ₹X · Change ₹Y"), recorded as cash given; UPI above the total is clamped to it. Clearing a box gives the whole amount to the other.
- Supersedes the locked v5 behaviour "₹100 + ₹70 of ₹180 → Waived ₹10" (D-HF-PAY).

### 2.1.0 P3 — Kitchen + Station (17 Nov 2026, Beta only; F-58..F-60)
- **Ticket header (PK-2, s124).** Every ticket shows its age ("4 min", amber after 8, red after 15), the client, **Unpaid**, and the **order note** on all looks; allergy and diet words (nut, gluten, Jain, no onion…) show in the warning tone with ⚠. Line notes get a pencil and normal text; the station name is a small chip on All only. One colour dot per line. "Kitchen · 3" and "Momos · 12" counts. Bigger kitchen text.
- **Safe taps (PK-4).** A double or triple tap moves a line one step only; every step and every Priority change says what happened with **Undo** (5 s). Hold a Done? line to take it back to Preparing; the Counter's order sheet has **Send back to the kitchen**. An Undo never pulls back a line that has moved on since.
- **No swaps under the finger (W-28/29/41).** A Station keeps the order it shows; a Priority order elsewhere gets a banner "Priority #006 · Open". When the shown order leaves, its veil shows first, then "Now #002". A leaving card is inert from its first frame, and taps rest for a moment after the list reorders.
- **Veils (PK-10).** "Handed over · 2 left at other stations" joins Completed and Cancelled.
- **Kitchen device.** Reopens as the Kitchen or its Station after a reload (Counter phones still open on Launch); the screen stays awake where the browser allows. New tickets glow quietly for a few seconds; no sound (chime off; Q-KITCHEN-ALERT is still Steve's call).
- **200 % text and small screens.** Station pills wrap instead of running off-screen; header, pills and tickets scroll together; the Priority hold target and every kitchen button are at least 44 px; a phone on its side gets a compact header. The tablet grid is P3b.

### 2.1.0 P2 — Counter (17 Nov 2026, Beta only; F-54..F-57)
- **Two phones, one order (s127, locked).** The phone with an order on screen holds it. Another phone that opens it sees "#012 is open on Counter 1" with **Check now**, a 10 s countdown, and **Take over** · **New order** · **Back**. Leaving the order (Back, another order, cancel, complete, or 30 s in the background) hands it over at once; a phone not heard from for 90 s lets go by itself. The phone that was taken over goes view-only ("Taken over by Counter 2") with its own Take over. If this phone is busy with another order when the waited-for one comes free, a calm toast offers **Open** instead of switching.
- **Unpaid tab (s120).** Third Counter tab with a red count and "₹X to collect". Tap a row for the order: **Take payment**, or press and hold the yellow bar to complete without payment (the amount stays on record).
- **Refund (s122).** One tap refunds the whole order the way it was paid, with **Undo** in the toast. "Change lines, reason or note ›" opens the Refund sheet: some items or an amount, reason, note, Cash or UPI, back to stock. From the order view and the Open Orders order sheet.
- **Drafts (s123).** A "Drafts n" pill beside + lists unsent orders from every Counter; Discard needs a second tap.
- **A new day?** On a new date with yesterday's day still open, the first new order asks: Start today (tokens from #001) or Keep yesterday's day. The item you tapped is added after you answer.
- **Phone Back** steps back inside the app (sheet, order, tab, page, start screen) and never closes it mid-order. The token slip is a sheet, so Back closes it.
- Large text (200 %): Billing reflows into stacked rows, bars wrap, **Confirm payment** always stays on screen. Every Counter button is at least 44 px. One New order on the paid screen.
- Fixes from the walkthrough: Open Orders band removed, Overview moved beside Lines/Cards (W-01); colour swatches show (W-02); Category is a list with "+ Add category…", a new item takes its category's usual station (W-03); Stall list bullets and wrapping (W-04); a double tap on Handover no longer hands over the next order (W-09); "Adds up ✓" instead of "Paid ✓" before Confirm (W-15); a discount can't be more than the bill and a free order needs a note (W-16); long names clamp to two lines on the menu (W-17); History shows #004 (W-18); Print token from the order sheet and order view (W-19); cancelling a paid order is press-and-hold (W-21).
- Menu search and sort (past 8 items): Menu order, A to Z, Most sold today.
- Bluetooth printer errors are now plain: "The printer did not answer. Check it is on and near, or use Print (58 mm)."

### 2.1.0 P1 — data and rules, no new screens (17 Nov 2026, Beta only; F-50..F-53)
- **Unpaid orders no longer vanish (W-05, W-08).** Handing over an unpaid order keeps it on Open Orders as Unpaid. Only Handover + paid, or Complete, finishes an order (Q-COMPLETE-2 A).
- **Ready never finishes an order (W-06, W-27).** A line the Counter marks Ready stays on the Kitchen and Station, muted ("Marked by counter"), until it is handed over.
- Complete: one tap when paid; when unpaid the store asks for the press-and-hold (the bar comes in P2) and records it as written off. A later payment clears the write-off.
- Refunds (data): whole / lines / custom, reason, optional back to stock (once, never more than was sent), instant with Undo. Never more than was paid; a refund never cancels the order.
- Cancelling an order gives its stock back on the Menu (W-32). Drafts on every Counter hold stock and show whose they are.
- + New order reuses an empty order (no burnt tokens, W-07/W-14). Reload reopens the order in progress (W-12). A closed day rolls over to today by itself; an open one waits for the Counter's question (W-22, asked in P2).
- Kitchen station filter shows only what that station still has to do (W-36).
- Categories and stations are data (rename keeps the id); day notes; device registry with a clash warning for two Counters on one token range; snapshot notes; newer-app ops are kept, not refused.
- Fixed: a winning Sheet edit to an order's note, client, priority, discount or round-off could be overwritten in the fold (latent bug, now honours last-writer-wins).
- Tests: in Vitest the channel now also follows `VITE_CHANNEL` (it only followed the page path before), so the Beta CI really runs as Beta.

### 2.1.0 P0 — Beta / Stable channel (17 Nov 2026, Beta only; F-49, Q-CHANNEL A, Q-BETA-PATH B)
- Version 2.1.0 on `feat/v2.1.0` (Stable stays 2.0.0 on `main`).
- The app knows its channel: Beta when served under `/stall-tokens-beta/` or built with `VITE_CHANNEL=beta`, else Stable.
- Beta keeps its own storage (`stall-tokens-beta.v2`: orders, device settings, receipt photos, tab channel), so Beta and Stable never share data on the same phone. Stable storage names are unchanged.
- Beta never carries a baked-in sync link or key.
- Beta's home-screen name and page title are "Stall Tokens Beta" ("Stall β" short).
- Settings › About › Version shows the version and channel, e.g. "2.1.0 · Beta".
- Fixed: receipt photos used a fixed DB name; they now follow the channel prefix.

## [2.0.0] — 16 Nov 2026
Released to https://steph1420.github.io/stall-tokens/, replacing v1 (never used in the stall). 92 tests. Rollback: redeploy tag `v1.0.0` (branch `backup/pre-v2.0.0`). Footer stamp is `v2.0.0 · <short hash> · <build date IST>`; tap it for What's New (Q-HARM-7). GitHub Pages now deploys the Vite `dist/` from `deploy-pages.yml` on `main` (v1 was served from the repo root).

### Known limits
- F-36 backup export / import is not built. F-38 Now Serving is deferred. Q-SHEET-COMPACT A (60-day Drive backup, then compact and refresh) is not in Code.gs yet — due as 2.1.0 before the log is 60 days old. Q-INFO-EDITORS B is later, after Steve has used the Sheet. Developer options stay a normal Settings group (Sign-in links must stay easy to reach), not behind 7 taps (Q-HARM-5). No full e2e / verify / break-it run yet (Steve deferred).

### Added (16 Nov 20:25, Sheet v2 info tabs + Q-HARM-10 audit, F-48, Steve 20:10–20:12)
- Sheet schema v2 (add-only migration): 12 visible, editable info tabs (business, events, event_days, partners, associates, sources, source_items, menu, stock_current, stations, payees, settings) with stable ids, frozen header (the only protected row), checkboxes, dropdowns and dates; every log tab, `_schema` and the new `records_log` / `conflicts` are hidden and kept intact.
- Two-way: Sheet hand edits become ops from writer `sheet` (`onEdit`); info tabs are rewritten from the full op log after every push. New op `record.set` for business / event / day / source / station / extra details.
- Q-HARM-10: ops gain `recvAt`; gaps make the bridge ask for a resend; clashes are recorded (Sheet wins on a true clash) in a hidden `conflicts` tab and under Settings > Sync > Review, one tap to switch; old-contract pushes get "update the app". Code.gs gains a CFG block and `VERSION` 2.0.0. 9 tests (clock skew ±1 day, offline concurrency, duplicates, gaps, old app, bridge fold = app fold).

### Added (16 Nov 20:55, settle-up extras, F-47, Q-SETTLE-EXTRAS C)
- Partners: split type Share % / Exact ₹ (shared settings `splitMode`, `splitExact:<personId>`); exact amounts must add up before Split and lock.
- Settle up: Fewest transfers (simplify debts, greedy, at most n − 1 moves, the stall cash as one party) and Share receipt (plain text through the phone's share sheet, else copied).
- Person sheet: Send reminder (share sheet) and Remind me in 1 h (local notification on this phone; no push server).
- Money: 📷 receipt photo per entry (camera input, shrunk to about 1280 px JPEG), kept on this phone in IndexedDB; 🧾 opens it with Remove. Not synced, not in the Sheet.

### Added (16 Nov 20:40, Bluetooth slip printing, F-41)
- Print token: where the browser has Web Bluetooth (Chrome on Android) the preview offers Bluetooth printer (ESC/POS, 32 columns, ASCII with "Rs", feed + cut; `store/rules/escpos.ts`, `data/adapters/btPrinter.ts`) or Print (58 mm); a printer error says why and leaves Print (58 mm). Without Web Bluetooth it prints with the browser straight away, as before.

### Changed (16 Nov 20:30, Paste stock asks Menu or Stock only, F-46, Q-SUPPLY-CONFIRM B)
- Each new thing in Paste stock shows Menu / Stock only; Add stays off until every new thing is chosen. Menu = a menu item in category New at ₹0 (set its price on the Menu); Stock only = a supply item (was: every new thing became a supply, D-STOCK-SUPPLY).

### Added (16 Nov 20:20, shared tip choices / round-off steps, F-45)
- Tip choices and round-off steps are shared `setting.set` values (`tipChips`, `roundOffSteps`, comma-separated paise), synced to every phone and the Sheet `settings` tab; CONFIG keeps the defaults. Edit them in Settings > Money, with the pencil on the Payment tip row, or under Round-off in the Billing discount sheet (`ui/kit/AmountsEdit.tsx`).

### Added (16 Nov 20:05, sign-in links, F-44)
- Developer > Sign-in links: one link per person / role; URL, stall key, role and name ride in the #fragment (`src/data/join.ts`). Opening it sets up sync, the serving name and the role screen (Counter, Kitchen, a station or the start screen). Revoke by changing STALL_KEY.
- Passcode lock (D-ACCESS) now off by default (code kept; Settings > Developer > Passcode lock turns it on). No pairing.
- Builds can bake the bridge in: `VITE_SYNC_URL`, `VITE_SYNC_KEY` (empty by default).

### Added (16 Nov 19:45, Sheet schema v1)
- Q-SHEET-DEPLOY: Google Sheet "Stall Tokens — Data (v2)" made with `_meta`, `_schema`, append-only `ops` and 14 projection tabs plus 4 formula views; `apps-script/Code.gs` v1 matches it (projections, header-name columns, append-only migrations). Web app not deployed (Steve authorises it). 1 schema test.
### Added (16 Nov 20:10, Token slip)
- Token slip (F-42): 58 mm printable slip; Print token on the paid screen opens the print dialog. 1 UI test.
### Added (16 Nov 20:00, Sheet bridge)
- Sheet bridge transport (F-35): client `createSheetTransport` on the pluggable Transport, `apps-script/Code.gs` (append-only op log in a Sheet tab, stall key check), `docs/SHEET_SETUP.md`, Settings > Sync (URL + stall key, status). Not deployed; needs Steve's TEST Sheet. 2 tests with a fake web app.
### Added (16 Nov 19:45, Open the stall / History / Settings)
- Open the stall (F-32): float on a keypad, last fair's closing cash, sync pill, Start day (starts today's day if needed, saves `float:<dayId>`).
- History (F-33): per day, paid / cancelled orders and money entries with Refunded / Edited / Cancelled / Voided tags; order sheet with Edit, Refund, Hold to cancel order; entry sheet with Hold to void.
- Settings (F-34): Kitchen, Money (partner shares, tip choices, round-off), Feel (haptics, Night / Day), Counter, Passcode, Developer, footer. D-ACCESS passcode gate for Money, Settle up and Settings (device prefs `passcode`, `passcodeOff`). 2 UI tests.
### Added (16 Nov 19:20, Stock)
- Stock (F-30): search, navrail of categories + Low · n + Sold out, counts amber when low, dimmed Sold out, tap a row for −/+ (never below 0). Paste stock (F-31): paste box with format hint, Will add preview (+qty unit, paid, discount, New item; unclear lines amber), Paid by, "Add n · Spent ₹total"; adds stock and one Spent entry (Q-PASTE-1 A). New pasted things become supply items (additive item field `supply`, D-STOCK-SUPPLY), never on the Menu. 3 tests.
### Added (16 Nov 19:00, Settlement)
- Settlement (F-26..F-29): Settle up (Stall in hand, 1 Repay others with Pay, 2 Split between partners dimmed until step 1 is done, Repay all) and Partners (pending repayments warning with Review, To split, shares %, "Covering …'s ₹… · added back", Add a partner, Split anyway / Split and lock the day, Reopen). Person sheet: amount (partial ok), Via / When tiles, history with Undo, Mark cleared + Pay; Mark cleared asks Gifted / Paid directly / Written off / Shared cost + note. Ops `settle.pay`, `settle.clear`, `settle.undo`, `day.lock` (additive). A locked day refuses money changes. 2 store tests.
### Added (16 Nov 18:50, Money)
- Money (F-23..F-25): Stall screen with today's totals (sales cash / UPI, spent, received incl. donations, tips as own pot, register by the book), Refunds due from cancelled paid orders with Cash back / UPI back, and today's entries. Entry screen per Money v8 / Received v1: Spent | Received, For / Paid by (From / Received in) tiles, amount, keypad, Save. Paid by sheet: Register, UPI, Personal (people + Add a name), Mixed (amount per part, covered bar). Ops `person.set`, `entry.add`, `entry.void` (additive). Stall section on launch and in the Counter ⋯ sheet (D-NAV). 2 store tests.
### Added (16 Nov 18:40, New Orders / Open Orders)
- Counter top tabs New Orders | Open Orders (Q-ORDERS-1). New Orders keeps Menu / Billing / Payment with a single current-order line (chips row and the Open orders drop-down removed, Q-ORDERS-2 A).
- Open Orders (F-43): cyan band + Overview, one big squircle per order (swipe the header for previous / next, tap for the order sheet: client name, Priority, items, total, note, Edit in Billing, Cancel order), Lines / Cards, Mark ready, Ready + Confirm, Confirm all, hidden tap-to-change status, bar Cancel order + Handover. `order.client` op (additive). 2 UI tests.
### Added
- v2 rebuilt from `steph1420/app-starter` v0.1.0 (`0746f7b`; checks from agent-common `88c9672`): React 19, Vite 6, TypeScript strict, Driftline tokens + CSS Modules, Zustand, op-log sync with a pluggable transport.
- Docs first: `docs/ARCHITECTURE.md`, `FEATURES.md`, `docs/adr/ADR-0003-stall-accent.md`.
### Changed
- v1 single-file app moved to `legacy/v1/index.html` (kept byte for byte; rollback tag `v1.0.0`, branch `backup/pre-v2.0.0`).
### Added (16 Nov 17:30, Kitchen locks)
- Leaving veil revised (Q-OVERLAY, Steve 17:50): rounded frosted veil at the card radius with a centred circle badge, green check "Completed" / red × "Cancelled", gentle scale-in from `motion/` `PopIn` (reduced motion: fade).
- Cancel order (Q-CANCEL-1 A): `order.cancel` op at any status, confirm sheet with optional reason; paid money recorded as refund due for Money (no refund UI); Cancelled veil on Kitchen/Station; a cancelled Priority order releases the pause. Store + UI test.
- Open orders cards expand to their lines, each with its own inline Mark ready (Q-MARK-1 B); the per-order Mark ready sheet is gone.
- Leaving veil (Q-OVERLAY): orders whose lines are all complete (handed over, or marked by the Counter, by anyone) show "Completed" (bag icon), deleted ones "Cancelled" (red-tinted, muted) on Kitchen/Station cards for ~2.5 s, then drop off. View-only. A Cancel op for started orders is still pending.
- Mark ready (Q-COUNTER-FINISH): Open orders can finish any sent line straight to Ready (`line.finish` op); Kitchen and Station show it muted, "Marked by counter", with the Ready icon. 1 store test.
- Station hands over a Ready line with one more tap (Q-HANDOVER-1 C); Counter Hand over stays.
- Priority switch on Billing, beside the token (Q-PRIORITY-1 C); quiet "Hold # for Priority" cue on the first Kitchen card.
- Automatic pause / resume for Priority orders, written as real ops so sync stays consistent (Q-PAUSE-1 A).
### Added (16 Nov, Kitchen + Station)
- Kitchen screen (F-19): station pills with to-make counts, status icons with labels, Priority bob (motion/), handed-over lines muted, "Open <station>" only when a pill is picked.
- Station page (F-21): one order per screen, order tabs, swipe, three looks (Full card default, Item cards, Ticket), Overview sheet; Back returns to the opener.
- Counter Open orders: Done? amber row with Send back / Confirm, and Hand over for Ready orders (F-20). Auto-prep of the next order (F-22).
- `order.priority` op (additive, contract v2). Launch opens Kitchen and each station.
- Known gaps closed: ₹0 orders show "Nothing to collect" with To kitchen; no usable IndexedDB now runs in memory with a calm banner.
- CI runs on `feat/**` with the feature-ID step (Q-CI-1 A).
### Audit (16 Nov, vs agent-common 06 v2)
- Re-copied the build-output check (agent-common `ab6431f`); added the feature-ID check to `npm run check` (CI workflow change waits on a `workflow`-scoped login).
- Logged the two silent catch/retry spots; moved a slider threshold to config and an inline style to CSS Modules (no visual change).
- FEATURES.md test column made honest; F-42 row added; README fixed.
### Dropped
- v1 data import and the `/beta/` path (Steve 16 Nov 15:48 IST: v1 never used).

## [1.0.0] — d9daa49
- Initial single-file release (tagged later as the rollback point).
