# ARCHITECTURE.md — Stall Tokens v2
Based on `steph1420/agent-common` `templates/ARCHITECTURE.md` and the starter `steph1420/app-starter` v0.1.0 (`0746f7b`, checks from agent-common `88c9672`). Plan: agent-common `handovers/pos/V2_BUILD_PLAN.md` (`36b2e06`) with Steve's 16 Nov 15:48 IST changes (§10). The doc leads; the code follows (`06` rule 0). Every commit states `fits ARCHITECTURE §x`.

## 1. Context
Stall Tokens is the ordering, billing and token app for Steve's fair stall: one or two Counter phones, a Kitchen screen and per-station screens, plus money, settle-up and stock. It is an offline-first PWA. Every device keeps the whole op log in IndexedDB and works with no network. A Google Sheet (through an Apps Script web app, the "Sheet bridge") is the locked cloud copy and the way devices see each other (Q-HARM-1, Sheets locked 16 Nov). Screens follow the locked mockups in agent-common `handovers/pos/assets/stall-mockups-locked/` (final look: `20-polish/`, `21-polish2/`, night and day).

Not in v2.0.0: Bluetooth printing (paused), UPI auto-detection (Q-UPI-1 manual), Bluetooth / local-peer sync (backlog, §4.3), hold/fire timing, merge/move lines, cancellation resolver, PDF share, v1 import (dropped, §10).

## 2. Layers and allowed imports
| Layer | Folder | May import | Must not import |
| --- | --- | --- | --- |
| config/tokens | `src/config/`, `src/tokens/` | nothing | anything else |
| contract | `src/contract/` (op shapes, money, validation) | config/tokens | data, store, ui, motion, mock |
| data | `src/data/` (interfaces + `adapters/`, `sync/`) | contract, config/tokens | store, ui, motion, mock; network/storage except inside its own adapters |
| store (Zustand) | `src/store/` (actions, `fold/`, `rules/`) | contract, data, config/tokens | ui, motion, mock, network, storage |
| motion | `src/motion/` | contract, config/tokens, framer-motion | data, store, ui, mock, network, storage |
| ui | `src/ui/` (screens, `kit/`) | contract, store, config/tokens, motion | data, network, storage, framer-motion |
| mock | `src/mock/` | contract, config/tokens | production app (tests and e2e only) |

Rules are checked by `.dependency-cruiser.cjs` and ESLint (no `fetch`/storage globals in ui, store, motion). Pure domain rules (bill maths, paste parser, settlement) live in `store/rules/` and are unit-tested on their own; the fold lives in `store/fold/`.

## 3. State owners
| State | Owner (module) | Who may write | Who may read |
| --- | --- | --- | --- |
| Op log (the only truth for shared data) | `data/adapters/localIdb.ts` (persisted), mirrored in memory by `store/index.ts` | store `dispatch` only (local ops) and `store/sync` intake (remote ops) | store |
| Shared state (menu, orders, payments, money, people, stock, days, settings) | `store/fold/` = `fold(log)` | nobody: always derived | ui via `useApp` |
| Device prefs (deviceId, theme, serving name, token range, haptics, passcode) | `data/adapters/deviceStore.ts` | store actions | store |
| UI place (screen, current order, each order's last page, open sheet, Kitchen pill, Station place + opener) | `store/ui.ts` | store actions | ui |
| Storage mode (IndexedDB or memory-only fallback) | `data/adapters/fallback.ts`, surfaced as `memoryOnly` by `store/core.ts` | data adapter | ui (calm banner) |
| Sync status (pending count, last pull, errors) | `data/sync/engine.ts` | engine | store → ui (sync pill) |
| Conflicts | `store/fold/` (recorded during the fold) | nobody: derived | Settings › Sync › Review |
| Order handling (who has an order open, s127) | the op log (`order.handle` / `order.release`, folded into `order.handler`) | `store/handling.ts` only (claim on screen, release on leave) | ui via `handling.of(id)` |
| "Last heard from" per phone (s127) | `store/core.ts` `heard` (this phone's clock), fed by presence beats (`engine.presence()`) and incoming ops | `store/index.ts` sync round and log intake | `store/rules/handling.ts` `holding()` |
| Back steps (W-13) | `store/nav.ts` `backStep` (pure) + `ui/kit/useBackTrap.ts` (one armed history entry) | store `back()` | App |

One owner per piece of state; no second copy. Device prefs are per device on purpose (not synced).

## 4. Data flow
1. A tap goes to the screen's interaction owner (§5).
2. The screen calls a store action (an intent). It never calls data, network or storage.
3. The store checks the rule (e.g. "Pay only if something is due"), builds one op, applies it to memory at once and appends it to the op log through `OpStore` (IndexedDB). A failed write (quota, private mode) is shown calmly in a banner with Retry; the op stays in memory and the pending list, nothing is silently dropped.
4. The store hands the op to the sync engine, which sends it through the active transport(s).
5. Remote ops come back through the transport (or BroadcastChannel from another tab), are de-duplicated by `opId`, appended, and the state is re-folded.
6. UI reads from the store and redraws.

### 4.1 Op log (Q-HARM-10)
Every op: `{ v, opId = writer:seq, writer, seq, lamport, vv, kind, body, wallAt }` (`contract/op.ts`).
- `writer` = deviceId + a short per-page-load id, so two tabs on one phone never reuse a `seq`.
- `lamport` = 1 + highest lamport seen; `vv` = highest seq seen per writer when the op was made.
- State = `fold(sort(log))`, sorted by (lamport, writer, seq). The same log gives the same state on every device; wall clocks are display-only, so a phone clock set wrong (±1 day) changes nothing.
- Duplicates are ignored by `opId`; a gap in a writer's seq is fine (ops are independent facts) and is listed in Sync status until filled.
- Field sets (item fields, notes, discount, settings) are last-writer-wins by the sort order, and when two writers set the same field without having seen each other (vv check) a conflict is recorded; both values stay in the log, nothing is lost.
- Money ops (payments, refunds, Spent, Received, Pay, Mark cleared, reversals) only add; they never clash. Undo is a reversal op that references the op it undoes.
- Money is stored in whole paise (integers); `contract/money.ts` formats en-IN (₹1,23,456.50).

### 4.1a 2.1.0 op additions (P1, 17 Nov 2026; contract stays v2, all additive)
- New kinds: `order.complete {orderId, unpaid, dueAt, reason}` (F-50), `refund.void {refundId, orderId, reason}` (F-51), `device.set {deviceId, label, rangeIndex, role}` and `snapshot.note {snapshotId, at, reason, opCount, hash}` (F-53).
- Optional fields: `refund.add` `reason`, `lines[{lineId, qty}]`, `restock`; `order.create` `device`; `item.set` field `categoryId`. Record tables `category` and `day_note` (F-52).
- **Forward compatibility:** `isOp` keeps a well-formed op of an unknown kind (`area.verb`) in the log; the fold ignores it and a later app version folds it. A 2.0.0 phone still refuses them, so every phone updates before Stable gets 2.1.0.
- Conflicts: `order:<id>|complete` is shared by `order.complete` and `payment.add`, so a payment made without seeing a Complete is a Conflict row (`causal`); money is never dropped. Two Counters on one token range = a `range-clash` Conflict row. Order fields (note, client, priority, discount, round-off, line note) now honour `lww().apply`, so a winning Sheet edit keeps its value.
- Completion is derived (`store/rules/status.ts`): completed = `order.complete` or (every line handed over and nothing due). Written off = completed unpaid while money is still due; a later payment clears it. Refund back-to-stock is applied once per refundId, capped by the line's committed qty, and `refund.void` reverses it.

### 4.1b 2.1.0 P2 op additions (17 Nov 2026; additive)
- `order.handle {orderId, deviceId, label, takeover}` and `order.release {orderId, deviceId, reason}` (F-54). Folded with `lww(order:<id>, 'handler')`, so two phones taking over at once agree on one winner and the loser gets a Conflict row. A release clears only its own claim; a cancelled order still takes a release.
- Who still has it is judged on THIS phone's clock: `holding(order, me, {heard, since}, now)` = busy while the holder was heard from within `CONFIG.handling.leaseMs` (90 s), else free. A phone not heard from since this session started counts as heard at `syncSince`, so a reload waits one lease. No sync set up → same-phone tabs only (never busy).

### 4.2 Data source interface (Q-HARM-1)
`data/index.ts` exposes one `DataSource` = `{ ops: OpStore, device: DeviceStore, channel: TabChannel, transports: Transport[] }`.
- `OpStore`: `load()`, `append(ops)`. Adapters: `LocalIdb` (always, DB name prefixed with `CONFIG.storage.prefix`: `stall-tokens.v2` on Stable, `stall-tokens-beta.v2` on Beta, §4.7), `MemoryOpStore` (tests).
- `Transport`: `push(ops) → acked opIds`, `pull(cursor) → { ops, cursor }`, `name`, `health()`. Adapters: `FakeTransport` (tests and dev, replays delay, loss, duplicates, errors, timeouts) and `SheetBridge` (Apps Script; built last, TEST Sheet first).
- `TabChannel`: BroadcastChannel between tabs on one device.

### 4.3 Pluggable transport (Steve 16 Nov 15:48 IST)
The op log does not know how ops travel. The sync engine (`data/sync/engine.ts`) keeps a per-transport outbox (ops not yet acked) and pull cursor, polls with the adaptive interval in `CONFIG.sync`, and merges what each transport returns by `opId`. Any number of transports can run side by side, because ops are idempotent. v2.0.0 ships the Sheet bridge: `data/adapters/sheetTransport.ts` (plain-text JSON POSTs to the Apps Script web app, so no CORS preflight; push = append unless the opId is stored, pull = rows after a numeric cursor; a wrong stall key, HTTP error or timeout is an error the engine reports and backs off from) and `apps-script/Code.gs` (schema v1: append-only `ops` source of truth plus one append-only projection tab per entity and formula views, all idempotent by `op_id` under a script lock; `STALL_KEY` Script Property; columns found by header name, migrations only append columns). The Sheet "Stall Tokens — Data (v2)" exists (Q-SHEET-DEPLOY); `src/data/sheetSchema.test.ts` keeps the script's projections inside its declared columns. A phone joins when Settings > Sync has a URL and key (device prefs `syncUrl`, `syncKey`; saving reloads to reconnect); otherwise it stays local. Setup steps: `docs/SHEET_SETUP.md` (TEST copy first; nothing is deployed from the repo). **Presence (2.1.0 P2, Q-TAKE-ALIVE A):** a transport may implement `beat({deviceId, label, orderId}) → [{deviceId, label, orderId, ageMs}] | null`. The Sheet bridge keeps beats in Apps Script CacheService (outside the order log, 10 min); a 2.0 bridge answers "unknown action" → `null` → the app falls back to ops only. The engine keeps `presence()` and `hasPresence()`; the store merges them into `heard`. **Backlog:** a Bluetooth / local-peer transport (nearby phones with no internet) implements the same `Transport` interface; nothing in contract, fold, store or ui changes for it.

### 4.4 Sign-in links (F-44, Steve 16 Nov 19:31 IST)
`data/join.ts` reads `#join=<base64url JSON {v,u,k,r,n}>` before the data source picks transports, writes the device prefs (sync URL, key, role, serving name) and strips the fragment with `history.replaceState`. The fragment never reaches a server. `prefs.role` picks the first screen (`store/core.ts` uiForRole). Revocation = new STALL_KEY. The passcode gate (D-ACCESS) stays in code, off by default.

### 4.5 Device-only stores and devices (pass 3)
- Receipt photos: `data/adapters/receipts.ts`, own IndexedDB `<prefix>.receipts` (`stall-tokens.v2.receipts` on Stable), keyed by entry id; never in the op log or the Sheet (F-47).
- Bluetooth printer: `data/adapters/btPrinter.ts` (Web Bluetooth, writable characteristic on common ESC/POS services, 100-byte chunks); bytes from the pure `store/rules/escpos.ts` (F-41).
- Shared settings via `setting.set`: `tipChips`, `roundOffSteps` (F-45), `splitMode`, `splitExact:<personId>` (F-47).

### 4.6 Sheet v2: editable info tabs (F-48, D-SHEET-V2, D-SHEET-WINS, Steve 16 Nov 20:10–20:12 IST)
- Sheet hand edits are ops. `apps-script/Code.gs` (CFG block, `VERSION` 2.0.0, schema 2) has a simple `onEdit` trigger that turns an edited info-tab row into ops from writer `sheet` (`item.set`, `person.set`, `payee.set`, `setting.set`, or the new `record.set {table, id, fields, removed}` for business / event / event_day / source / source_item / station / person_info / item_info). Their `vv` = the bridge's version vector (Script Property) and `lamport` = its highest + 1, so they come after everything synced.
- Info tabs are views. After every push or edit, `rebuild_` folds the whole `ops` log with `foldState_` (it mirrors `store/fold`; `sheetSchema.test.ts` checks both give the same state) and rewrites the 12 visible tabs by id. Log tabs stay append-only and hidden.
- Conflicts. `store/fold/lww.ts` returns `{state, conflict, apply}`. A true clash (vv-concurrent) normally goes to the later sort order; if the earlier write came from `sheet` the Sheet keeps it (D-SHEET-WINS). Every clash is a `Conflict {rule}` in state and a row in the hidden `conflicts` tab. Settings > Sync > Review (`ui/stall/ReviewSheet.tsx`, `store/conflicts.ts`) flips one with a new op.
- Transport. Ops carry `recvAt` (set by the bridge on pull; tiebreak and display only). `push` returns `{stored, resend}`; a seq gap per writer (`gaps_`) makes the bridge ask for the missing ops, and the engine re-queues them from the local log. Ops with an older contract `v` are refused with "update the app".
- Units: logs keep paise; info tabs show rupees (`*_inr`) for hand editing (D-INFO-INR).

### 4.7 Channels: Stable and Beta (F-49, Q-CHANNEL A, Q-BETA-PATH B; 2.1.0 P0, 17 Nov 2026)
- `config/index.ts` decides the channel once at load: **Beta** when the build has `VITE_CHANNEL=beta` or the page is under `/stall-tokens-beta/`; otherwise **Stable**. Beta wins either way, so a Beta page can never open Stable data.
- Every storage name comes from `CONFIG.storage.prefix` (`stall-tokens.v2` Stable, `stall-tokens-beta.v2` Beta): op log IDB, receipts IDB, device prefs key and the tab BroadcastChannel. Stable names are unchanged. Both channels share the `steph1420.github.io` origin; the service workers are scoped by path, so they cannot cross.
- Beta never has a baked sync URL or key (`CONFIG.sync.bakedUrl/bakedKey` are empty); it only talks to a bridge typed in on that phone (a TEST Sheet).
- `vite.config.ts` reads `VITE_CHANNEL` to name the manifest and `<title>` ("Stall Tokens Beta", short name "Stall β"). Settings › About shows `version · channel`.
- Beta is built and published only by the workflow in `steph1420/stall-tokens-beta` (checks out `feat/v2.1.0`). Since P0 its step only checks the build; it no longer rewrites files.

## 5. Interaction owners
| Screen | Interaction owner | Gestures (one per direction) |
| --- | --- | --- |
| Launch | `ui/launch/LaunchScreen.tsx` | tap |
| Counter shell (top tabs New Orders / Open Orders, page tabs, current-order line) | `ui/counter/CounterShell.tsx` | tap |
| Open Orders (F-43, Q-ORDERS-1) | `ui/counter/open/OpenOrdersScreen.tsx` | header: swipe left/right = next/previous order (`CONFIG.gesture.swipePx`), tap = order sheet; body: vertical scroll; Lines: Mark ready / Confirm / Confirm all buttons, tap the line text = next status (hidden, D-OPEN-TAP); Cards: tap = next status; bar: Cancel order, Handover |
| Menu | `ui/counter/menu/MenuScreen.tsx` | tap card = +1; press-and-hold card = stock panel; −/+; pencil = note |
| Billing | `ui/counter/billing/BillingScreen.tsx` | −/+, tap qty = number strip; tap totals = Discount / Round-off sheet; hold Delete = delete |
| Payment | `ui/counter/payment/PaymentScreen.tsx` | tap Cash/UPI = numpad; drag slider (₹10 snap); tip chips; vertical scroll to Count notes |
| Kitchen (F-19) | `ui/kitchen/KitchenScreen.tsx` (+ `KitchenCard.tsx`) | pills: horizontal scroll, tap = filter; line: tap = next status, hold = On hold; hold the token = Priority; list: vertical scroll |
| Station (F-21) | `ui/station/StationScreen.tsx` | order tabs: horizontal scroll, tap = show; body: swipe left/right = next/previous order (`CONFIG.gesture.swipePx`), vertical scroll; line: tap = next status, hold = On hold |
| Sheets (note, item, discount, payee, numpad, station Overview) | `ui/kit/Sheet.tsx` + each sheet | tap scrim or Done to close |

Page changes use the header tabs and Back/Next buttons only; no page swipe. The only horizontal swipes are the Station body and the Open Orders header, each its own owner. Holds use `HOLD.durationMs`; motion springs come from the motion tokens; reduced motion = short fade.

### 5.2 Open Orders (F-43, Q-ORDERS-1 rough v3, locked 16 Nov 18:21 IST)
The Counter's top tabs are New Orders (Menu / Billing / Payment with one current-order line; the chips row is gone, Q-ORDERS-2 A) and Open Orders (count badge = `rules/kitchen.ts` `openOrders`, the same list the kitchen shows). Open Orders shows one order at a time as one big squircle: header (number, client name row always reserved, IST time and minutes ago), divider, then Lines or Cards (device pref `openLook`). A station's proposed-done line reads "Ready" with Confirm (no "Done?" wording at the Counter); Confirm all confirms every such line. Tap-to-change follows `counterNext` (D-OPEN-TAP). Handover writes `handed` for every line not yet handed over, so the order completes (Q-COMPLETE-1 A) and gets the Completed veil. The client name is an additive `order.client` op (LWW).

### 5.3 Money (F-23..F-25)
Entries are `entry.add` ops (`dir` spent / received, `amount`, `label`, `kind` normal / donation, `parts` [{source register / upi / person, personId, amount}], optional `personId` for a person From); they only add, and `entry.void` keeps the record. The fold drops bad parts and keeps an entry whose parts do not add up as one Register part (never half-applied); the store refuses such a save first (`rules/money.ts` `checkEntry`, Q-MIXED-1). People are `person.set` (LWW). Refunds due = money still held by cancelled orders (`refundsDue`); Cash back / UPI back writes `refund.add`. Day totals: `dayMoney` (tips are their own pot, D-MONEY). Stall screens share `ui/stall/StallPage.tsx`; the Stall list (D-NAV) is `ui/stall/StallNav.tsx`.

### 5.4 Settlement (F-26..F-29)
Ops: `settle.pay` {payId, dayId, personId, amount (signed: + the stall pays the person, − the person hands stall money back), via register / upi / person, byPersonId when a partner covers it}, `settle.clear` (Mark cleared, reason gifted / paid-directly / written-off / shared-cost + note; nothing recorded in money, Q-VOUCH-1 wording), `settle.undo` (keeps the record), `day.lock` {locked, split}. `rules/settle.ts`: `balances` run across all days, so whatever is not settled carries over by itself; `split` = in hand (register + UPI by the book − tips − register / UPI pays) minus what others are owed, shared by partner % with each partner's own balance added back (Q-NEXT-2 A); a partner who covered someone gets it added back ("Covering Manoj's ₹400 · added back"). A loss day gives negative shares. Locking needs shares adding to 100 %; a locked day refuses Money and settlement changes (not Counter orders, D-LOCK-SCOPE) until Reopen. UI: `ui/settle/` (SettleScreen with Settle up | Partners tabs, PersonSheet with Mark cleared note).

### 5.5 Stock (F-30, F-31)
Counts are the item `count` (null = not counted) changed by `stock.adjust` (never below 0) and by sales. `rules/stock.ts`: `level` (ok / low at `lowAt` / out when 0 or Sold out), the paste parser (`parseLine`, `parsePaste`, `pasteTotal`; Q-STOCK-SET rules, price paid in rupees, discount for info) and `matchItem` (case-insensitive name). Paste stock (`store/stock.ts`) writes the one Spent entry first (Paid by picked once, Mixed must cover it; refused = nothing added), then per clear line `stock.adjust` (or a first `count`) for a known item, or a new item with `supply: true` (D-STOCK-SUPPLY: an additive item field; supply items show in Stock only, never on the Menu or in a bill). UI: `ui/stock/` (StockScreen navrail + rows with −/+, PasteSheet).

### 5.6 Open the stall, History, Settings, passcode (F-32..F-34, D-ACCESS)
Open the stall: `money.openStall(paise)` starts today's day when the last day has another IST date, then writes setting `float:<dayId>`; "Last fair closed with" = last day's float + register by the book. History lists, per day, orders with a payment or a cancel and every money entry (newest first); the order sheet's Edit opens it in Billing, Refund opens the Counter refund sheet (only when the bill went down), Hold to cancel writes `order.cancel`; entries Hold to void. Settings edits device prefs (auto-prep, station look, haptics, Night / Day, token range); tip choices and round-off steps are shown read-only from CONFIG (D-SETTINGS-RO). D-ACCESS: `ui/stall/StallScreens.tsx` shows `PasscodeGate` for Money, Settle up and Settings unless this visit is unlocked (`ui.unlocked`, cleared by `closeStall`) or the Developer switch `passcodeOff` is on. The code is a device pref (4 digits, set on first use by typing it twice): a light gate for a shared phone, not a login.

### 5.6a 2.1.0 P4: History, Money, Close the day, Day notes, Stock (F-64..F-68, 17 Nov 2026)
History (`ui/stall/HistoryScreen.tsx`, sheets in `HistorySheets.tsx`) owns its Orders · Money segment, search text and picked row; rows and tags come from `store/rules/history.ts` (`historyOrders`, `historyTag`, `matchOrder`, `rowAt`). Money tiles read `dayMoney` (now with `unpaid` across all days and this day's `writtenOff`). Close the day (`ui/stall/CloseDayScreen.tsx`, `DaySummary.tsx`) reads `store/rules/close.ts` (`closeRecord`, `closeSteps`, `daySummary`, `cashCheck`, `summaryText`); its record lives on the day note (`record.set day_note`, id = dayId: `text`, `tags`, `counted` (−1 = not counted), `skip_unpaid` / `skip_refunds` / `skip_cash`), written only by `store/close.ts`. Day notes sheet: `ui/stall/DayNotesSheet.tsx`. The Extras switches (`extra:closeDay`, `extra:historySearch`, CONFIG.extras) are shared `setting.set` keys. Refund due maths: the fold derives `Refund.settled` (the part that gave back an overpayment when it was applied); `bill.due` adds back only that part (D-P4-REFUND-DUE). A Stall screen opened from another keeps the first `stallFrom`.

### 5.7 Token slip (F-42, D-SLIP)
`ui/slip/TokenSlip.tsx`: a 58 mm paper layout (stall name, token, IST time, client, lines, total, how paid, "Show this at pickup") in mm units with paper tokens (`--dl-stall-paper*`, black on white in both themes). Print token on the paid Payment screen shows it and opens the browser print dialog; print CSS hides everything else and sets `@page` to 58 mm. A Bluetooth thermal printer can reuse the same fields later.

### 5.1 Kitchen status flow (F-19..F-22)
**2.1.0 (Q-COMPLETE-2 A, P1):** Ready never completes, whoever marks it. `lineComplete` = handed over only; `lineMuted` (handed, or Ready "Marked by counter") is the display rule. Open Orders = sent orders until completed (`rules/status.ts openOrders`), so an unpaid handed-over order stays (W-05/W-08). The Kitchen station filter uses `stationOrders` (W-36).
Station tap: Waiting → Preparing → Done?; On hold → Preparing; Ready → Handed over (Q-HANDOVER-1 C, the Counter can hand over too). Counter (Open orders): Done? → Ready (Confirm) or → Preparing (Send back); Ready → Handed over. Mark ready (Q-COUNTER-FINISH, Q-MARK-1 B): expanding an Open orders card lists its lines, each with its own inline Mark ready; the Counter can finish any sent line whatever its kitchen status, as a `line.finish` op; it goes straight to Ready with `byCounter`, and Kitchen/Station show it muted with the Ready icon, labelled "Marked by counter" (the flag clears if the line moves off Ready/Handed over). Handed-over lines stay on the card, muted (Q-KITCHEN-4 A). Leaving (Q-OVERLAY): an order is Completed for kitchen views once every sent line is complete, whoever marked it (handed over by a station or the Counter, or marked by the Counter; `rules/kitchen.ts` `orderComplete`). It then keeps its card ~2.5 s under a rounded frosted veil with a centred circle badge (green check, "Completed"); one cancelled by the Counter gets a red × badge, "Cancelled" (badge scales in via `motion/` `PopIn`), then drops off; view-only (`ui/kitchen/Leaving.tsx`). Cancel (Q-CANCEL-1 A): Cancel order in an expanded Open orders card opens a confirm sheet with an optional reason and writes `order.cancel` at any status. The order keeps its record with `cancel {reason, at, by, refundDue}`; `refundDue` = money paid at that moment, flagged for the Money screen (no refund UI yet). Lines not started return their stock; started ones stay counted. After cancel the fold takes only `refund.add` for that order; the order leaves Open orders, Kitchen and Station, and the pause rule releases (`order.cancel` is a follow kind). When an order is finished at a station, the next order's waiting lines there go to Preparing (Q-AUTOPREP, device pref `autoPrep`, default On). Priority is an order flag (`order.priority` op), set by holding the order number on a Kitchen card or by the Billing switch (Q-PRIORITY-1 C); priority orders sort first. Pause (Q-PAUSE-1 A): after each local op that can change it, `store/core.ts` writes the derived `line.status` ops from `rules/kitchen.ts` `pauseMoves` (a station a Priority order still needs pauses other orders' Preparing lines; when none needs it, they go back to Preparing). The moves are pure and reach a fixed point, so every device folds the same log; a tap on a paused line is refused with a toast while the pause holds. Rules: `store/rules/kitchen.ts`; actions: `store/kitchen.ts`. Status colours: `--dl-stall-st-*`; the Priority bob is `motion/` `Bob` (`LOOPS` in `motion/tokens.ts`).

## 6. Display scales and test viewports
| Scale | Viewports |
| --- | --- |
| Standard | 360×780, 390×844 (the locked mockups' size) |
| Large text (root font 125%) | 390×844 |
| Landscape check | 844×390, 927×421 |
| Kitchen tablet (W-33; grid in P3b) | 1024×768, 820×1180, 1180×820 |
| 200 % text (P2/P3) | 421×927 with `html{font-size:200%}`: Counter reflows, Kitchen pills wrap and the header scrolls with the tickets (container `counter`, under 24rem) |

Night (`stall-night`) and day (`stall-day`) at every row. Contrast for every theme pair runs in `npm run contrast`. Sizes are in rem so large system text scales the layout.

## 7. Theming (ADR-0003)
`<html data-theme="stall-night|stall-day">`. Semantic colours are the `stall` family in `src/tokens/tokens.json` (contrast-checked); stall-only values (gradients, glows, item accents, CTA) are `--dl-stall-*` in `src/tokens/stall.tokens.css`. Fonts: system (D-FONT), no web font.

## 8. Live worktree
| Copy | Repo | Branch | Tag | Path | Owner | Release pointer | Rollback sha | Live bundle hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v2 (live) | steph1420/stall-tokens | main | v2.0.0 | `/stall-tokens/` | Pos | main | v1.0.0 / d9daa49 | footer stamp (hash + build date) |
| backup (v1, unused) | steph1420/stall-tokens | backup/pre-v2.0.0 | v1.0.0 | — | Pos | — | d9daa49 | v1 single file |

## 9. Risks
| Risk | What we do | Check |
| --- | --- | --- |
| Shared github.io origin | Every DB name and storage key starts `stall-tokens.v2` | unit test on adapter names |
| Two devices issue the same token offline | Counter devices pick a token range (1–500, 501–1000) in Settings (D-TOKEN) | `rules/tokens.test.ts` |
| Double taps create two payments | Button locks while busy and the store refuses Pay when nothing is due | e2e double-tap + store test |
| Storage full / private mode | Calm banner with Retry, op kept in memory | data test with failing OpStore |
| PWA stale version | Calm "Update ready" prompt, never mid-order | manual |
| Offline overselling stock | Allowed, flagged after sync | fold test |
| Sheet bridge load / latency | Adaptive polling, load check before go-live | SheetBridge contract test (TEST Sheet) |
| Secrets or real names pushed | Leak scan pre-push; names typed in the app only | `checks/leak-scan.mjs` |

## 10. Changes from the plan (Steve 16 Nov 15:48 IST)
- "V2 is live. V1 never used": **D-MIGRATE dropped** (no v1 import code, screen or tests) and **D-HOST changed**: no `/beta/` path; v2 replaces v1 at the main address once every test passes. v1 is kept as `legacy/v1/index.html`, tag `v1.0.0` and branch `backup/pre-v2.0.0`.
- Bluetooth local sync is backlog; the sync layer is a pluggable transport (§4.3).
- ADR numbering: the starter already uses ADR-0002 (framer-motion pin), so the plan's "ADR-0002 accent" is `ADR-0003-stall-accent.md`.
- Tokens are issued when an order is opened (the locked strip shows `#048 New`), not when it is placed; a deleted order leaves a gap in the numbers.

## 11. Decisions
- ADR-0001: one styling system, Driftline tokens + CSS Modules.
- ADR-0002: framer-motion pinned exactly at 12.43.0.
- ADR-0003: stall accent family (locked cyan/vibrant) beside Driftline blue.
