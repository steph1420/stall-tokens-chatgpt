# Stall Tokens — feature reference sheet (2.1.0 planning)
Written by Pos, 16 Nov 2026, 23:05–23:40 IST, for Steve's t66u ("overhaul the app … write a feature reference sheet … add features and functions that should be there but aren't"). Branch `feat/v2.1.0`. **Design reference only: nothing here is built yet.** Build waits for review (Steve 23:00 IST: LFPS-SOW and Lippy see this first).

This sheet lists every screen and every UI element: what it does, its states, night/day, edge cases and status. The ID registry that the code cites stays in `/FEATURES.md` (F-xx, checked by `npm run check:ids`). New F-IDs for 2.1.0 (F-49 onwards) are added there in phase P1, before any code cites them.

## 0. How to read this

**Status words**
- **existing**: in v2.0.0 and kept as is.
- **fix 2.1.0 (W-xx)**: broken in v2.0.0. The walkthrough on 16 Nov found it; 2.1.0 fixes it.
- **new 2.1.0 (lock)**: a feature Steve locked that isn't built yet. Q-SPLIT A, Q-COMPLETE-2 A, Q-REFUND-1 A, Q-NEWORDERS-NAV A, the revised Q-HANDOVER-PAY, PK-1…PK-10 (t66u), Prioritise (t61u) and Q-CHANNEL A (t71u).
- **gap — added by Pos**: something a real stall POS needs that nobody asked for. Each has a one-line reason, and **Steve can veto any of them**. Nothing in this group changes a locked behaviour.
- **2.2.0**: the next build (Q-SPLIT A). **later**: needs its own design round first.

**Sources quoted**
- Walkthrough report `handovers/pos/walkthrough-2026-11-16.md` (W-01…W-44, P-1…P-14, PK-1…PK-10).
- `handovers/pos/DECISIONS.md`.
- agent-common 06/07/08 and STYLE_GUIDE.
- **(Lippy kit)**: Steve's taste as recorded by Lippy in `handovers/lippy`. Calm, uncluttered, a quiet first layer with more on demand. Undo toast is preferred over confirm dialogs. Short holds with a press animation. No decorative rings. Amber only means "needs action". Soft rose instead of harsh red. Plain wording.
- **(LFPS-SOW kit)**: patterns from `handovers/lfps-sow`. Quiet grouped Settings rows with chevrons. Sync shown as a status dot only. Back up now, plus an automatic backup before every destructive step. One ordered undo stack. Updates never reload mid-work. Empty states are never a blank gap.

**Rules that apply to every screen.** They aren't repeated in each row below.

*Look and wording*
- **Night and day.** Every element ships in `stall-night` and `stall-day`, with contrast checked in both (`npm run contrast`, 06 rule 5).
  - Day uses the same brand hue, calmer contrast and softer glows (LFPS-SOW kit). Night stays the hero (Lippy kit).
- **Words.** en-GB, plain and short, no jargon outside Developer. Times are IST (24-hour, `istClock`). Money is ₹ in en-IN grouping. The banned words "accept" and "vouch" never appear.
- **Sizes.** Touch targets are at least 48 CSS px (Lippy kit: 44 px minimum; the stall uses 48 because of wet or gloved hands). Sizes are in rem, so system large text scales the layout. Viewports: 360×780, 390×844 and 421×927 (Steve's phone), plus 844×390 landscape and 1024×768 tablet (new for Kitchen/Station, PK-3).
- **Values.** Every value comes from tokens or CONFIG (06 rule 3). Motion uses Driftline springs; reduced motion swaps them for a short fade (Q-HARM-3).

*Feedback and safety*
- **Feedback.** Every refused tap gets a toast that says why. Nothing is dropped silently (LFPS-SOW kit).
- **Undo.** Safe, reversible actions run at once and show an Undo toast (`CONFIG.timings.undoMs` = 5 s, PK-4). Payments, cancels and destructive actions use hold-to-confirm (kit `HoldButton`). **Refunds are instant with Undo** (Q-REFUND-INSTANT, Steve t75u).
  - Undo is always a new compensating op, never a deletion (Q-HARM-10).
- **Holds.** The hold length comes from the `HOLD` tokens. Hold buttons show a fill or press animation and give a haptic. Unpaid Complete is the exception in §9: the progress is a bar along the top of the action bar, not a fill or a ring on the button (Q-HOLD-RING A), because the thumb would hide it.
- **Back.** Phone Back closes the top sheet, then the screen, then returns to Launch. It never leaves the app during an order (P-6, W-13).

*Data*
- **Everything syncs** (Q-SYNC-ALL, Steve t76u). Every change is an op in the Q-HARM-10 log, pushed through the Sheet bridge at every step and folded on every device. The only exceptions are the per-device settings in **§0.1**.
  - Sheet hand edits are ops from writer `sheet`; the Sheet wins a true clash. Clashes go to the hidden `conflicts` tab and Settings › Sync › Review. The rule is never "newest timestamp wins".
- **Privacy.** No customer phone numbers are kept. Client names are free text typed at the stall (02-privacy).

## 0.1 What syncs, and the only per-device exceptions (Q-SYNC-ALL)
**Synced as ops (all of it):**
- Orders and **drafts** (Q-DRAFT-SYNC) and every line, note, discount, round-off, priority and client name.
- Payments, **refunds and refund undo** (`refund.void`), cancels and completes.
- Menu items, **categories**, **stations**, stock counts and stock moves, sold out.
- Shared settings: stall name, fair, tip choices, round-off steps, auto-prep, station look, Open Orders look, **menu sort**, age warnings and alert *rules*.
- Money entries, partners and settlement, day lock, **day notes**, info records.
- Conflicts and Review flips.
- **Device registry** (`device.set`): each device's label (serving name), its token range and its sign-in role, so every Counter can see who holds which range and whose draft is whose.
- **Snapshot and backup metadata** (`snapshot.note`: when, why, op count, hash). The snapshot content is the op log itself, which the Sheet already holds.

**Stays on the device only. These are the only exceptions, for Steve to check:**
| Setting | Why it stays on the device |
| --- | --- |
| Device id and its writer id | Identity: it must be unique per device (Q-HARM-9). |
| Sync link and stall key | Credentials, never sent through the log (06 rule 13). |
| Appearance (Night / Day / Auto) | Personal: a kitchen tablet in the sun and a Counter phone in the shade differ. |
| Kitchen text size | Personal to the screen's distance (W-39). |
| Quiet alerts and volume | Personal to where the device stands (PK-1). |
| Haptics strength | Personal feel (Steve 23:2x, confirmed). |
| Where the screen is (current order, tab, pill, station) | Navigation state, not data. Confirmed by Steve; lets a device resume (W-12, PK-5). |

**Images are never synced (Q-RECEIPT-SYNC C, Steve t79u: "Don't sync photos. Sync data to generate photos.").** Token slips, refund and settle-up receipts, day summaries and share images are **drawn on demand on any device from the synced data** with fixed templates, so the same data gives the same image on every device.
- **Edge (flagged):** a photo someone *captures* (e.g. a supplier's bill on a Money entry, F-47) stays on that device only and is not part of sync or backups. Other devices see the entry and a "photo on Ravi's phone" note, not the photo. If that device is reset or lost, the photo is gone; the entry's data is not.

---

## 0.2 Pos gaps — top 4
Steve asked (16 Nov) for only the strongest gaps to lead. Each one ships behind a shared setting.
1. **Close the day** (§21): a checklist (unpaid, refunds due, cash count, notes, lock) and a day summary. Why: a stall day needs an end, not just a start. **On by default** (Q-P4-EXTRAS-ON A, locked 17 Nov 2026, 21:47 IST). Settings › Extras can turn it off; a phone that never touched the toggle is on; an explicit off stays off.
2. **Keep data safe** (Settings › Data › Storage, `navigator.storage.persist()`). Why: Android can evict a PWA's storage under pressure. Still **default off**.
3. **Waiting to sync n** (Settings › Sync). Why: before a reset or a phone swap, staff must see what hasn't reached the server or Sheet. Still **default off**.
4. **History search** (§24): by token number, name or item. Why: "the boy in the red shirt's order from 6 pm" has to be findable. **On by default** (Q-P4-EXTRAS-ON A). Same toggle rule as Close the day.

### Later — Pos ideas (not in 2.1.0 unless Steve picks one)
- Menu search (magnifier in the sort row)
- Empty menu
- Duplicate-name warning on items
- Hold to remove a menu item
- Client name field on New order (optional; never asked for, Q-UNPAID-NAME B)
- Print failed
- History filter chips
- "Register by the book" help
- Appearance Auto (follows the phone)
- Install as app row
- The other rows marked "Later — Pos idea" below stay documented for reference but are **not built** in 2.1.0.

### Mockups (redo, 16 Nov 23:55 IST): `handovers/pos/assets/roughs-2.1.0/s119…s126`
- **Q-UNPAID-ROW B (locked 16 Nov 23:44 IST):** no Paid button on the row; a tap on the row opens it. The chosen layout is **s120**. (s119 was option A, not used.)

## 1. Launch (F-04)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Stall name kicker | Shows `settings.stallName`, or "Fair stall" if none is set. | Long name: one line with an ellipsis. | existing |
| Counter tile | Opens the Counter (New Orders). | — | existing |
| Kitchen tile | Opens the Kitchen. | — | existing |
| Station tiles | One tile per **active station from data** (PK-6). Shows the station's colour and icon and opens its Station page. | No stations yet: a "Set up stations" link to Settings › Stations. Renaming a station keeps its id (PK-6, W-34). | fix 2.1.0 (W-34) |
| Stall list (Money, Settle up, Stock, History, Open the stall, Settings) | Opens each Stall screen. | No bullets; "Open the stall" fits on one line (W-04). The last row has no border. | fix 2.1.0 (W-04) |
| Close the day row | Opens Close day (§21). Shown once a day has started, when the shared switch is on. | — | **Pos gap, top 4 (on by default, Q-P4-EXTRAS-ON A)**: a stall day needs an end, not just a start (unpaid, refunds and cash checked before going home) |
| Sync dot | Top right. Shows nothing when synced, a cloud with a slash when offline, and a brief saving ring then a tick after each sync (Lippy kit). A tap opens Settings › Sync. | Only shown when sync is set up. | kept — Steve: Sync as a dot only: phones in a fair lose signal; staff must know if their orders have reached the Sheet |
| Device resume | A device last used as Kitchen or a Station reopens there (screen place is a §0.1 exception). Counter devices still see Launch (PK-5 A, changes Q-LAUNCH-1 B for kitchen devices only). | A sign-in-link role still wins (F-44). | new 2.1.0 (PK-5) |
| Channel tag | On Beta builds only, a small "Beta" word under the stall name. | Stable shows nothing. | new 2.1.0 (Q-CHANNEL A) |

## 2. Counter shell (F-05)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Header kicker + ⋯ | The stall name. ⋯ opens the More sheet: Back to start, Appearance, Serving name, Token range, UPI IDs, Stall list. | — | existing |
| Top tabs **New Orders · Open Orders n · Unpaid n** | Switch the Counter view. The Open count = open orders. The Unpaid count = orders with money still to collect, sent or handed over (soft red badge). | The Unpaid tab is hidden when the count is 0 and nobody is on it. On a narrow phone the labels shorten to "New · Open n · Unpaid n". | new 2.1.0 (Q-HANDOVER-PAY revised, Unpaid tab) |
| Page tabs Menu · Billing · Payment | Per-order page, remembered per order. | — | existing |
| Header + (small) | Starts a new ticket. If the current draft is empty it is **reused**, so no token is burnt (W-07, W-14). | — | fix 2.1.0 (W-07) |
| **Order line** (under the page tabs) | Shows "#004 · new order · 2 items · ₹70". Swipe ‹ › to move between drafts (dots, or "2 of 4" past `openDotsMax`). Tap opens the **Drafts sheet**. | With no draft: "Tap an item to start an order". Wording follows `orderStatus` (fixes "paying" after handover, W-05). | new 2.1.0 (Q-NEWORDERS-NAV A) |
| **Drafts sheet** | **Every open draft from every Counter device** (Q-DRAFT-SYNC, Steve t75u): token, items, ₹, age and **who started it** (serving name / device label, e.g. "Meera · Counter 2"), with **Open** and **Discard** (hold). Includes "Held stock: Cold Drink ×2" so stranded stock is visible (W-11). | Drafts are ops in the shared log, synced through the Sheet bridge at every step and folded on every device. Two devices editing one draft merge like any other order ops (Q-HARM-10; clashes in Sync › Review). Empty drafts are discarded by themselves and never listed. Drafts untouched for `draftExpireMin` (CONFIG, default 45 min) show amber "Old draft" (never auto-deleted; see Q-DRAFT-EXPIRE). | new 2.1.0 (Q-NEWORDERS-NAV A, Q-DRAFT-SYNC, W-07, W-11, W-12) |
| **Big + New ticket** | A large round button at the bottom right of the Menu page, above the Billing bar (Q-SPLIT A "big + button at bottom of New Order"). Same rule as the header +. | Hidden on Billing and Payment so it never covers Confirm. | new 2.1.0 (Q-SPLIT A) |
| Resume after reload | Only the *pointer* to the order on screen stays on the device (§0.1); the draft itself is in the synced log. After a reload or an Android kill, the Counter opens the same draft (W-12). | If that order was paid, cancelled or discarded on another device, it opens the newest draft or Menu. | fix 2.1.0 (W-12) |
| Back button | Billing/Payment → Menu → Launch. Sheets close first. Leaving with a non-empty draft keeps the draft (it's never lost). | — | fix 2.1.0 (W-13) |
| Sync dot | Same as §1. | — | kept — Steve: Sync as a dot only (as §1) |

## 3. Menu (F-06)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Item card | Tap = +1. Shows the name (clamped to 2 lines with an ellipsis, price row fixed, W-17), the price, the colour edge and the stock badge. | Badges: "24 left" / "3 left" (amber at or below `lowAt`) / Sold out (dimmed; a tap gives the toast "Cold Drink is sold out"). If stock is only held by drafts, the toast says "Held in 2 drafts · Open drafts" (W-11). | fix 2.1.0 (W-17, W-11) |
| −/+ on a card | Changes the newest editable line of that item. | − on an item already being made: toast "Already being made; change it from the kitchen". | existing |
| Press and hold a card | Opens the stock panel (§5). | — | existing |
| **Sort chip** | My order · Name A–Z · Price ↑/↓ · Category (grouped headers) · Stock (low first, sold out last). | A **shared** setting (Q-SYNC-ALL; changes P-10 A from per-device), default Category. | new 2.1.0 (Q-SPLIT A menu sort) |
| Category headers | Shown when sort = Category. The order comes from Settings › Menu › Categories. | Items with no category go under "Other". | new 2.1.0 |
| Add item tile | Opens the Add item sheet (§4). | — | existing |
| **Search** (magnifier in the sort row) | Filters cards by name as you type. × clears it. | For menus over about 20 items. Hidden behind the magnifier so the first layer stays calm (Lippy kit). | Later — Pos idea: a fair menu with 40+ items is slow to scan by eye |
| Billing bar | Item count, ₹ total, "Billing ›". | — | existing |
| Empty menu | One line, "Add your first item", over a calm gradient (LFPS-SOW kit). | — | Later — Pos idea: no blank first screen |

## 4. Add / Edit item sheet (F-07)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Name | Up to 60 characters. | Duplicate name: amber line "Already on the menu · save anyway?" (it saves on a second tap). | Later — Pos idea: duplicates split sales counts and confuse the kitchen |
| Price (₹) | `inputMode="decimal"`. ₹0 is allowed; an empty price is refused. | — | existing |
| Colour swatches | 8 filled circles; the picked one is ringed. | The CSS variable mismatch is fixed (`--c`), with a UI test that the background isn't transparent in night and day (W-02). | fix 2.1.0 (W-02) |
| **Category dropdown** | A `<select>` listing the categories from Settings in their order, plus "**+ Add category…**", which opens an inline name field. Picking a category pre-fills its default Station and Colour. | No free text, so typos can't split the menu (W-03). A new item defaults to the last category used, not the first one. | new 2.1.0 (Q-SPLIT A, P-3) |
| Station dropdown | Stations from data (PK-6). The default comes from the category. | — | fix 2.1.0 (W-03, W-34) |
| Stock | Empty = no count. Whole numbers only. | — | existing |
| Remove | Hold to remove (was a single tap). | An Undo toast follows. | Later — Pos idea: removing an item mid-service by a stray tap is costly |
| Save / Cancel | Save checks every field and shows the error inline. | Enter in Name moves to Price; Enter in Price saves. | existing + keyboard gap |

## 5. Stock panel (hold a menu card) (F-08)
| Element | What it does | Status |
| --- | --- | --- |
| −/+ big steppers | Changes the count; it never goes below 0. | existing |
| "n left" | The number available to sell (count minus drafts). | fix 2.1.0 (W-32: a cancel gives stock back) |
| Mark sold out / Back on sale | Sets `soldOut`. | existing |
| Edit | Opens the item sheet. | existing |

## 6. Billing (F-09…F-11)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Token + Serving | Token and server name. | — | existing |
| Table (Item / Rate / Qty / Amount) | −/+, tap qty = the 1–99 list, pencil = line note. | Long names wrap in full here (W-17). | existing |
| Order note | Free text up to 140 characters. Quick chips: **Takeaway · Dine-in · Allergy** (Allergy pre-fills "ALLERGY: "). | Allergy words (CONFIG list) make the note show as a warning strip in the Kitchen (PK-2). | new 2.1.0 (PK-2, W-25) + chips gap (added by Pos: quicker than typing, and makes allergy notes consistent) |
| Client name | An optional field (it was only in the Open Orders sheet). | — | Later — Pos idea: unpaid orders need a name to chase; one place to type it before sending |
| Priority switch | `order.priority`. | — | existing |
| Discount (₹/%) + Allowed by | — | **More than the bill:** refused with "Discount is more than the bill". A 100% discount needs a note (W-16). | fix 2.1.0 (W-16) |
| Round-off | ±₹5/₹10, dropped when the bill changes. | — | existing |
| To kitchen | Sends unpaid; the button becomes "In kitchen". Then the Counter moves to a **fresh draft** with the toast "#004 sent to the kitchen", so nothing gets added to a sent ticket (report §3). | No Undo here: there is no "unsend" op, and Cancel order covers a mistaken send. | fix 2.1.0 (UX §3) |
| Pay ›, Delete (hold) | — | Delete is refused if the kitchen has started or money was paid (toast). | existing |
| Refund row | Shown after an edit leaves money owed back. Opens the Refund sheet (§13) pre-set to the owed amount. | — | change 2.1.0 (Q-REFUND-1 A) |
| **Edit an order from everywhere** | Billing opens any open, unpaid or paid order from Open Orders, Unpaid, History and the Drafts sheet. A paid order shows a "Paid · editing" strip, and changes show Collect ₹X / Refund ₹X. | Cancelled orders are view only. | new 2.1.0 (Q-SPLIT A) |

## 7. Payment (F-14…F-17)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| To collect | Due plus tip. | — | existing |
| Cash / UPI split, numpad, slider | — | — | existing |
| Tip chips | Shared settings (F-45). | — | existing |
| UPI QR + payee | QR stays below the split (hidden at ₹0 UPI). The UPI ID and amount beside it are parsed from the same link the QR encodes. | — | existing + 2.1.0 (QR label) |
| Count notes | Note tiles are made shorter: 3 per row on a 390 px screen, so Confirm is reachable (report §3). | — | fix 2.1.0 (UX) |
| Status line | "Adds up ✓" (it was "Paid ✓" before confirming, W-15). | — | fix 2.1.0 (W-15) |
| Confirm payment | Hold is not needed. A tap guard of `CONFIG.gesture.confirmGuardMs` (800 ms) stops a double tap reaching "New order" (W-14). | Paying an order that was already handed over **completes** it (Q-HANDOVER-PAY). | fix 2.1.0 (W-14) |
| Paid screen | Print token · New order · Done. | — | existing |

## 8. Token slip (F-42, F-41)
| Element | What it does | Status |
| --- | --- | --- |
| Slip preview (58 mm) | Moves to `kit/Sheet`, so Back and Escape close it (W-24). | fix 2.1.0 (W-24) |
| Print token entry points | The paid screen, plus **To kitchen** (slip marked UNPAID), the order sheet, Unpaid and History (reprint marked "Reprint") (W-19). | fix 2.1.0 (W-19) |
| Refunded mark | A slip reprinted after a refund shows "Refunded ₹X". | new 2.1.0 (P-2) |
| Print failed | If Bluetooth fails: toast "Printer not reached · Print with phone" (falls back to `window.print`). | Later — Pos idea: a silent print failure means a customer with no token |

## 9. Open Orders (F-43)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| ~~Band "Counter · All open orders"~~ | **Removed** (Steve). Overview moves into the order header as an icon next to the dots. | — | fix 2.1.0 (W-01) |
| Which orders show | Every **open** order. Open = not cancelled, not deleted, and not completed. Completed = an `order.complete` op, OR every line handed over AND nothing due (Q-COMPLETE-2 A, Q-HANDOVER-PAY revised). | Ready never completes, whoever marks it (W-06). | fix 2.1.0 (W-05, W-06) |
| Opens on | The most recently sent order (it used to open on the oldest). | — | fix 2.1.0 (UX §3) |
| Header: number, client, time · age, dots, ‹ › | Swipe or arrows to step. Tap = order sheet. **Age turns amber after `ageWarnMin` and soft red after `ageLateMin` (CONFIG 10/20 min).** | — | existing + age gap (added by Pos: same rule as the kitchen, PK-2, so the Counter sees late orders too) |
| **Unpaid ₹X tag** | Shown in the header when money is due (soft red text, no box; Lippy kit "no badges he didn't ask for", but Steve asked for a red Unpaid marker). | — | new 2.1.0 (W-05) |
| **Prioritise** | In the order sheet and as a long-press on the header number: toggles Priority (the same op as Billing and Kitchen). The toast reads "Priority on · Undo". | — | new 2.1.0 (Steve t61u) |
| Lines / Cards look | — | — | existing |
| Line: Mark ready / Confirm / Confirm all | As before, but Mark ready is just Ready. A Counter-marked line shows "Marked by counter" everywhere and **does not complete** the order. | — | fix 2.1.0 (W-06, W-27) |
| **Send back** | On a line the station marked Ready (Done?): Confirm / **Send back** (Send back = back to Preparing, with a toast to the station) (W-31, Q-KITCHEN-3 A). | — | fix 2.1.0 (W-31) |
| Bottom bar **Cancel · Handover · Complete** | **Handover** hands over every line; it never completes an unpaid order. If paid, the order completes and gets the green veil. If unpaid, the order stays, tagged "Handed over · Unpaid ₹55". **Complete** (paid): a tap completes it. **Complete** (unpaid): the button is **yellow** (warn token). A tap shows the toast "Order unpaid · Press and hold to complete without payment". Press and hold shows a **wide bar** filling left to right along the top edge of the bottom action bar, with the text "Marking as complete" above it (**Q-HOLD-RING A**, locked 16 Nov 23:49 IST). There is no ring on or around the button — Steve's thumb would hide it. A short haptic buzz on finish; release early cancels. Held to the end = `order.complete {unpaid:true}`. | Every action is bound to the order id it was drawn for. The bar is locked while the veil shows (W-09). After Handover, a 5 s Undo toast (compensating line.status ops). | new 2.1.0 (Q-HANDOVER-PAY revised, Q-HOLD-RING A) + fix W-09 |
| Empty | "No open orders" over a calm texture (LFPS-SOW kit). | — | existing (restyled) |
| Landscape | The card scrolls above the bar; lines are never hidden under it (report §3). | — | fix 2.1.0 |

## 10. Order sheet (tap an Open Orders header)
| Element | What it does | Status |
| --- | --- | --- |
| Token, client name, time, server | — | existing |
| Priority switch (= Prioritise) | — | existing (renamed in the toast) |
| Lines + total, "to collect" / "paid cash" | — | existing |
| Note | — | existing |
| **Take payment** | Opens Payment for this order. | new 2.1.0 (P-1) |
| **Refund** | Opens the Refund sheet (§13). | new 2.1.0 (Q-REFUND-1 A) |
| **Print token** | Reprint (W-19). | fix 2.1.0 |
| Edit in Billing | — | existing |
| Cancel order | Opens the Cancel sheet (§14). | existing |

## 11. Unpaid tab (new)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| List | Every sent order with money due, oldest first. Shows token, client, items, **₹ due** (soft red), status (In kitchen / Ready / Handed over) and age. Total at the top: "₹1,240 · 6 orders". | Drafts are not listed. Cancelled orders are not listed (they go to Refunds due instead). | new 2.1.0 (Q-HANDOVER-PAY revised) |
| Row tap | Opens the order sheet with Take payment first. There is no Paid button on the row (Q-UNPAID-ROW B, s120). | — | new 2.1.0 (Q-UNPAID-ROW B) |
| Order sheet actions | **Take payment** · **Complete** (the same yellow hold as §9: Q-HOLD-RING A, a wide bar along the top of the action bar, no ring on the button) live on the opened order sheet, not on the list row. | — | new 2.1.0 |
| ~~Handover-unpaid name ask~~ | Not built: **Q-UNPAID-NAME B** (Steve: never ask). | — | dropped |
| Empty | "Nothing unpaid ✓" in soft green text, no icon (Lippy kit). | — | new 2.1.0 |

## 12. Complete rule (data)
- **Completed** when an `order.complete` op exists, or when every live line is handed over and `due ≤ 0` (Q-COMPLETE-2 A).
- **Unpaid completion** is `order.complete {unpaid:true, dueAt, reason}`.
  - Money shows it as "Written off · unpaid" (its own line, not taken off Sales silently).
  - If a payment op for that order arrives later (from another phone), the payment counts and the order shows "Paid late". A concurrent clash writes a Conflict row (Q-HARM-10).
- **Kitchen views** drop an order once all its lines are handed over, paid or not. The kitchen doesn't chase money; the order keeps its "Unpaid" tag until then (PK-2).

## 13. Refund sheet (new, Q-REFUND-1 A)
Reached from the Open Orders sheet, Unpaid, History and Billing (after an edit).
| Element | What it does | Edge cases | Status |
| --- | --- | --- | --- |
| Amount chips | **Whole order** (paid less refunded) · **Pick lines** · **Custom ₹**. | It never goes above the money still held. | new 2.1.0 |
| Pick lines | Per-line qty steppers (0…qty). The ₹ total follows. | — | new 2.1.0 |
| Custom | Numpad. | — | new 2.1.0 |
| Reason chips | Wrong item · Late · Quality · Changed mind · Other. Optional; the note box is always visible (Lippy kit). | — | new 2.1.0 |
| Paid back by | Cash / UPI, defaulting to how the order was paid. | — | new 2.1.0 |
| Back to stock | A toggle, off by default. On = the picked lines' qty go back to stock. | Only offered when lines are picked. | new 2.1.0 |
| **Refund ₹X** (single tap, no hold) | `refund.add {reason, lines, restock}`, then a 5 s toast "Refunded ₹90 · Undo". Undo = a compensating `refund.void {refundId}` op (it never deletes; stock put back by `restock` is taken out again). **Does not cancel the order.** | A double tap is guarded (one refund per sheet). Undo after another device has already synced the refund still works (the void op syncs too). | new 2.1.0 (Q-REFUND-1 A amended by **Q-REFUND-INSTANT**, Steve t75u) |

## 14. Cancel sheet
| Element | What it does | Status |
| --- | --- | --- |
| Reason (optional), Keep order / Cancel order | A paid order needs **Hold to cancel** (W-21). The sheet shows "₹30 paid · recorded as refund due". | fix 2.1.0 (W-21) |
| Stock back | Lines not started go back to stock **and** to Menu availability (W-32). | fix 2.1.0 (W-32) |

## 15. Kitchen (F-19, F-22)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Header: Back, title, Open ‹station› | — | — | existing |
| Station pills | From station data (PK-6), with counts of lines still to make. | — | fix 2.1.0 (W-34) |
| Filter list | Uses `stationOrders` (W-36). | — | fix 2.1.0 (W-36) |
| **Ticket header (PK-2)** | Token · **age** ("4 min", amber/red by CONFIG) · **client** · Takeaway/Dine-in · **order note strip** (warning tone with an icon when it matches an allergy word) · **Unpaid** tag. | Long notes wrap to 3 lines, then "…" (tap shows the full note). | new 2.1.0 (PK-2, W-25, W-38) |
| Line row | Name, **note** (its own style: 14 px+, text colour, note icon), and a station chip only on All (W-26). | — | fix 2.1.0 (W-26) |
| Line tap | Moves one step. **Step gap** `CONFIG.gesture.stepGapMs` (600 ms) per line, and a 5 s **Undo** toast after each step (PK-4, W-30). | A double tap never skips Preparing. | fix 2.1.0 (W-30) |
| Hold Done? | Reopens to Preparing (PK-4, W-31). | — | fix 2.1.0 |
| Hold # | Priority on/off with the toast "Priority on · Undo" / "Priority off · Undo" and a haptic (W-40). | — | fix 2.1.0 (W-40) |
| Priority arrival | A banner "Priority #006", plus an animated insert (motion token) and a tap guard (W-41). | — | fix 2.1.0 (W-41) |
| Veils (PK-10) | Completed (green) · Cancelled (red) · **Handed over** (quiet) · **Marked by counter** (amber). The veil is inert from the first frame (W-09/W-29). | — | new 2.1.0 (PK-10, W-27, W-37) |
| **Alerts (PK-1)** | A chime, a haptic and a 1–3× card flash on: a new ticket for this station, Priority, Cancelled, Counter marked. **Quiet** switch and volume live in Settings › Display. | Plays only after the first tap (browser audio rule). Tones are token-named. | new 2.1.0 (PK-1, W-35) |
| **Tablet grid (PK-3)** | From 900 px wide: a grid of 6–8 tickets, a compact header, and pills on the left in landscape. | **Wake lock** while Kitchen/Station is open (the screen stays on). | new 2.1.0 (PK-3, W-33) |
| **Large text** | A per-device Display scale for kitchen views (W-39): notes ≥ 14 px, status ≥ 13 px, names 18–20 px. | — | fix 2.1.0 (W-39) |
| Empty | "Nothing to make right now". | — | existing |

## 16. Station page (F-21)
| Element | What it does | Status |
| --- | --- | --- |
| Title with count | "Momos · 12" (orders) and "11 plates" in the header (PK-8 A is 2.2.0, but the plate count is free, so it's included; see §29). | fix 2.1.0 (W-38) |
| Order tabs | Each tab shows its **age**. Tabs scroll to keep the current one visible. | fix 2.1.0 (W-38) |
| Pinned order | The shown order is pinned. When it leaves, the veil shows, then the toast "Now #002". When a Priority order arrives, the banner "Priority #006 · Open" appears instead of swapping (W-28). | fix 2.1.0 (W-28) |
| Full card | Own lines first, then a muted "Other stations" group (W-42). | fix 2.1.0 (W-42) |
| Looks (Full / Item cards / Ticket) | All carry the PK-2 header. | fix 2.1.0 (W-25) |
| Marked by counter | The line stays muted with "Marked by counter" until it's handed over (W-27). | fix 2.1.0 (W-27) |
| Hand over at the station | Ready → Handed over. The Unpaid tag is shown, but handover is still allowed (Q-HANDOVER-PAY). | fix 2.1.0 (W-05 ext.) |
| Browser Back | Goes to the opener (W-13). | fix 2.1.0 |
| Overview | — | existing |

## 17. Order History (new page, Q-SPLIT A)
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Where | Counter ⋯ › **Order History**, and Stall › History (one screen with a segment **Orders · Money**). | — | new 2.1.0 (see **Q-HISTORY-1**) |
| Day sections | Newest first. "Today", then dates (en-GB, IST). | — | existing |
| Rows | **Every sent order** (W-08), with token `#004` (W-18), time, items, ₹, and a tag: Unpaid ₹X · Paid cash/UPI/Mixed · Refunded ₹X · Refund due ₹X · Cancelled · Written off · Edited. | — | fix 2.1.0 (W-08, W-18, W-21) |
| **Search** | Token number, client name or item. Behind the shared "History search" switch, on by default. | — | **Pos gap, top 4 (on by default, Q-P4-EXTRAS-ON A)**: "the boy in the red shirt's order from 6 pm" has to be findable |
| **Filter chips** | All · Unpaid · Refunded · Cancelled. | — | Later — Pos idea (Q-P4-HFILTER A, locked 17 Nov 2026): once search is in use |
| Row tap → History sheet | Edit (Billing), **Refund** (always enabled when money is held, W-10), Take payment (if due), Print token, Hold to cancel. | — | fix 2.1.0 (W-10, W-19) |
| Money segment | The existing entries list (Spent/Received, Hold to void). | — | existing |
| Empty | "Nothing yet today". | — | existing |

## 18. Money (F-23…F-25)
| Element | What it does | Status |
| --- | --- | --- |
| Tiles: Sales cash, Sales UPI, Spent, Received, Register by the book | Sales no longer drop silently when cash goes back; there is a **Refunds** line. | fix 2.1.0 (report §3) |
| **Unpaid ₹X · n** tile | Opens the Unpaid tab (W-08). | fix 2.1.0 (W-08) |
| **Written off ₹X** line | Unpaid completions (§12). Outside the partner split until Steve says otherwise (**Q-WRITEOFF-SPLIT**). | new 2.1.0 |
| Refunds due (from cancels) | Cash back / UPI back. | existing |
| "Register by the book" help | One line of help on tap: "Cash that should be in the box: float + cash sales − cash spent − cash back". | Later — Pos idea: the report found the term unclear |

## 19. Settle up / Partners (F-26…F-29)
Unchanged in 2.1.0 (existing). The Close day screen (§21) links to it.

## 20. Stock screen (F-30, F-31)
| Element | What it does | Status |
| --- | --- | --- |
| Category rail | Adds an **All** entry at the top. Low and Sold out become chips, not categories (report §3). | fix 2.1.0 |
| Paste stock | "Tea 20pcs" with no price = a count-only restock with no Spent entry (W-23). | fix 2.1.0 (W-23) |
| Numbers | Stock and Menu numbers agree after a cancel (W-32). | fix 2.1.0 |

## 21. Open the stall / Close day
| Element | What it does | States / edge cases | Status |
| --- | --- | --- | --- |
| Open the stall | Float keypad, Start day. | **Day rollover:** on the first order of a new IST date while the old day is still open, ask "Start today (tokens from #001) or keep yesterday's day?" (W-22). The "Last fair closed with" wording is only used when a day was really closed. | fix 2.1.0 (W-22) |
| **Close day** (new screen) | A checklist with five steps. 1) **Unpaid** orders (n, ₹): take payment / complete. 2) **Refunds due**. 3) **Cash count**: count notes (the Payment tiles) vs Register by the book, showing the difference ("₹20 short"). 4) **Day notes** (§22). 5) **Settle up**, then Lock day (F-29). Behind the shared "Close the day" switch, on by default. | Every step can be skipped with a reason, but it's shown in the day summary. | **Pos gap, top 4 (on by default, Q-P4-EXTRAS-ON A)**: the report found no close-day checklist (§4); cash short/over is the most common stall dispute |
| Day summary | Totals, by item (top sellers), by payment type, refunds, write-offs. Shared with **hold to share** (LFPS-SOW kit). | — | **Pos gap, top 4 (on by default, Q-P4-EXTRAS-ON A)**: the partners ask "how did we do" every evening |

## 22. Day notes (new, Q-SPLIT A)
| Element | What it does | Status |
| --- | --- | --- |
| Notes per day | Free text plus quick chips (Weather, Crowd, Sold out early, Issue, Idea). `record.set day_note {day_id, text, tags}`. Editable any day later. | new 2.1.0 (P-13) |
| Where | Close day step 4, History day header ("Notes ›") and the Sheet info tab `day_notes` (an editable `sheet` op). Counted / skipped fields go to the Sheet in P6 (Q-P4-SHEET A, locked 17 Nov 2026). | new 2.1.0 |

## 23. Settings (F-34), regrouped to the Q-HARM-5 shell and LFPS S1 (quiet grouped rows with chevrons)
| Group › Row | What it does | Status |
| --- | --- | --- |
| **General** › Stall name | The shared setting (it was only in the Counter ⋯). | change 2.1.0 (Q-SPLIT A "quickly edit stall name") |
| General › Event / fair name | Edits today's `event` record name (P-14 is 2.2.0; this single field is in 2.1.0). | new 2.1.0 (Q-SPLIT A "event") |
| General › Serving name (device label), Token range | Synced through the device registry (`device.set`), so other Counters see who holds which range. | change 2.1.0 (Q-SYNC-ALL) |
| **Display** › Appearance Night / Day / **Auto** (follows the phone) | Auto = `prefers-color-scheme`. | change 2.1.0 (Auto is a Later — Pos idea: LFPS-SOW has it; it saves switching at sunset) |
| Display › Haptics | — | existing (moved) |
| Display › Kitchen text size (Standard / Large) | W-39. | new 2.1.0 |
| Display › Alerts: Quiet, Volume | PK-1. | new 2.1.0 |
| **Menu** › Categories | List: reorder (↑/↓, no drag), rename, default station, default colour, hide. Rename keeps the id (P-3 A). | new 2.1.0 |
| Menu › **Stations** | Name, icon, colour, order, active. Rename keeps the id (PK-6). | new 2.1.0 (PK-6) |
| **Kitchen** › Auto-prep, Station look | — | existing |
| **Money** › Partner shares, Tip choices, Round-off | — | existing (the round-off placeholder is fixed to "5, 10", W-20) |
| **Sync** › status (dot only), Sheet sync, **Review** (clashes) | — | existing |
| Sync › Waiting to sync n | Lists unsynced ops by kind. | **Pos gap, top 4 (default off)**: before a reset or a phone swap, staff must see what hasn't reached the Sheet |
| **Data** › **Back up now** | Exports `stall-tokens-backup-<IST date>-<device>.json`, containing the whole op log as known here (drafts included), plus the per-device settings in §0.1 ( contract version, op count, SHA-256). Share sheet / Downloads (P-7 A). | new 2.1.0 (Q-SPLIT A Backup) |
| Data › **Restore from a file** | Pick a file. Shows "ops new / already here", then Import, which runs through the normal fold. Duplicate opIds are ignored and nothing is overwritten (Q-HARM-10). **A backup of the current state is made first** (LFPS-SOW kit). | new 2.1.0 |
| Data › **Snapshots** | Automatic local snapshots before every destructive step (restore, reset, migrate) and every `snapshotEveryMin` (15) during a day, keeping the last 20. Restore one = import (it never deletes). | kept — Steve: pinned pre-risk snapshots + "Go back to this snapshot" (LFPS-SOW Q-BAK-1 pattern): a lost phone log mid-fair is unrecoverable without it |
| Data › **Reset app** | Step 1: shows unsynced ops ("12 changes not yet in the Sheet"). Step 2: Back up first (default on). Step 3: Sync now if possible. Step 4: **Hold to reset**. Wipes this channel's IndexedDB, prefs and receipts; keeps the device id (P-8 A). | new 2.1.0 (Q-SPLIT A Reset) |
| Data › Storage | Used space and "Keep data safe" (`navigator.storage.persist()`). | **Pos gap, top 4 (default off)**: Android can evict a PWA's storage under pressure unless it's persisted |
| **App** › **Install as app** | Calls the install prompt, or shows fallback steps (Lippy kit). | Later — Pos idea |
| App › **Updates** | A quiet dot when an update is ready; apply on next open or tap. It never reloads mid-order (LFPS-SOW kit, Q-HARM-2). | change 2.1.0 |
| App › **About** | Version, **channel (Stable / Beta)**, device id, the footer stamp. A tap opens What's New. | new 2.1.0 (Q-CHANNEL A) |
| **Account** › Sign-in links | Kept as a normal row (DECISIONS v2.0.0 note) and moved out of Developer. | change 2.1.0 |
| **Developer** (7 taps on the version, within 1.5 s, countdown from the 3rd tap; Q-HARM-5, Lippy kit) › Passcode lock, conflict rule tools, raw op viewer | — | change 2.1.0 (W-20) — see **Q-DEV-7TAP** |

## 24. Sync, offline and errors (cross-cutting)
- **Sync dot** (§1). Offline = a cloud with a slash. Nothing when all is well; no "Live" icon (Lippy kit).
- **Save error banner** (existing) and **memory-only banner** (existing).
- **Update ready**: calm, never mid-order (existing). Its F-ID cite is corrected (F-36 → F-34).
- **Error copy**: every refusal says what to do next ("Refund the payment before deleting").

## 25. Back navigation (P-6)
One navigation owner (`store/nav`) pushes a history state per screen and per sheet. Phone Back pops it. On Launch, Back asks "Leave Stall Tokens?" only when a draft has items. The slip, sheets and Station all close the same way. (W-13, W-24)

## 26. Undo (cross-cutting, PK-4 + LFPS-SOW kit)
- **Undo toast for:** kitchen steps, Priority on/off, Handover, Discard draft, Remove item and Send back.
- **Refunds** are instant with a 5 s Undo (`refund.void`, Q-REFUND-INSTANT).
- **Not undoable:** payments and cancels. These use hold-to-confirm instead.
- Undo writes compensating ops (never deletes). One undo stack per device session, capped at 60. The undo *ops* sync like any other op; the toast undoes the last entry only. **A full Undo/Redo bar is not added** (it would add clutter to the first layer).

## 27. Accessibility
- Every control has an `aria-label`. Toasts use `role="status"`; refusals use `role="alert"`.
- Holds also work with the keyboard (Enter held).
- Status is never shown by colour alone: an icon or a word goes with it (Q-ICON).
- `prefers-reduced-motion` gives fades only. Large system text works because sizes are in rem.

## 28. Beta channel (Q-CHANNEL A, Steve t71u)
- **Beta** lives at `/stall-tokens/beta/`. **Stable** stays at the root and only updates on Steve's go.
- Beta uses its own storage prefix `stall-tokens-beta.v2` (IndexedDB, localStorage and the SW cache), so it can't clash with Stable data on the same phone.
- Beta never carries a baked-in sync URL. It only talks to a bridge someone types in on that phone.
- Settings › App › About shows "Beta" or "Stable".
- **Q-BETA-PATH B (locked):** Beta is published from its own public repo `steph1420/stall-tokens-beta` (Pages via Actions), URL `https://steph1420.github.io/stall-tokens-beta/`. Stable is never touched. The app sees the `/stall-tokens-beta/` path and switches to the Beta storage prefix with no sync config.

## 29. Not in 2.1.0
| Item | When |
| --- | --- |
| Quick-edit menu grid (P-9) | 2.2.0 |
| Customer comments (P-11) | 2.2.0 |
| Info editors in the app (P-14), except stall name and event name | 2.2.0 |
| PK-7 Expo/pass screen | 2.2.0 (with F-38 Now Serving) |
| PK-8 Portion counts | 2.2.0 (but the free "n plates" header text is included in 2.1.0: it is one sum of qty already computed by Overview. **Flagged; Steve can drop it.**) |
| PK-9 86 from the kitchen | 2.2.0 |
| Customer-facing view, review carousel, signature (P-12) | later, with roughs first |
| Code.gs Drive-backup-then-compact (Q-SHEET-COMPACT A) | **2.1.0 bridge side** (BUILD_PLAN §5) |

## 30. Questions for Steve (Q-IDs; lettered options, ★ = Pos recommendation; only Steve locks)
- **Locked by Steve 16 Nov 23:21–23:26 IST:** Q-UNPAID-NAME **B** (never ask) · Q-REFUND-LIMIT **B** (no "Allowed by" on refunds at all) · Q-HISTORY-1 **A** · Q-WRITEOFF-SPLIT **A** · Q-DRAFT-EXPIRE **A** · Q-DEV-7TAP **A** · Q-MOCK-SIZE **A** (421×927 @3×) · Q-BETA-PATH **B** (own public repo `steph1420/stall-tokens-beta`; Stable never touched) · Q-RECEIPT-SYNC **C** · Q-PASSCODE-SYNC **dropped** (no passcode for now, the existing lock).
- **Q-SYNC-GO / Q-SHEET-FLUSH (locked t77u/t78u) and Q-GO-HOST (locked t80u, 23:28 IST):** see `docs/SYNC_SERVER.md`. The Sheet hidden `ops` log is the durable store; the server has no database of its own as source of truth.
- **Q-GO-PUSH B (locked 16 Nov 23:44 IST):** polling plus an SSE live stream while a screen is open. Built with the Go server in 2.2.0.
- **Q-GO-WHEN B (locked 16 Nov 23:44 IST):** 2.1.0 ships on the current Code.gs bridge with the digest freshness check added. The Go server comes in 2.2.0, Beta first.
- **Q-UNPAID-ROW B (locked 16 Nov 23:44 IST):** no Paid button; a tap on the row opens it. Layout is s120.
- **Q-HOLD-RING A (locked 16 Nov 23:49 IST):** the unpaid Complete hold is a wide bar filling left to right along the top edge of the bottom action bar, with "Marking as complete" above it. No ring on or around the button (the thumb would hide it). A short haptic buzz on finish; release early cancels. Mockup: `s121-complete-hold-bar.png` (the earlier ring pair `s121-complete-toast-ring.png` is superseded).
