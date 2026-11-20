# Sheet bridge setup (F-35, F-48, D-SYNC, D-SHEET-V2, Q-SHEET-DEPLOY)

The app works fully offline on every phone. The Sheet bridge is how phones see each other's orders and money, the cloud copy of the op log, and (schema v2) a place Steve can read and edit the stall's information by hand.

## The Sheet (made 16 Nov 2026 19:40 IST; schema v2 since 16 Nov 20:25 IST)
"Stall Tokens — Data (v2)" in Steve's Drive (search Drive for the name; the link is kept out of the repo by the leak scan).

### Visible, editable info tabs (master data and current state)
| Tab | Key | What it holds |
| --- | --- | --- |
| `business` | `business_id` (`main`) | name, legal name, logo, phone, email, address, city, GSTIN, UPI ID, FSSAI no. |
| `events` | `event_id` | fair / event: name, venue (place), address, city, start / end date, days, status, organiser, stall no., fee |
| `event_days` | `day_id` | each day: date, day name (read only), open / close time, opening float, status |
| `partners` | `person_id` | partners and their share % |
| `associates` | `person_id` | helpers, volunteers, staff, supplier contacts (role dropdown) |
| `sources` | `source_id` | where raw material comes from: type Market / Online store / Supplier / Wholesaler / Other, contact, terms |
| `source_items` | `source_item_id` | what each source supplies: item, unit, pack size, last price |
| `menu` | `item_id` | menu (and stock-only) items: name, category, price ₹, station, sold out, active, sort order |
| `stock_current` | `item_id` | stock on hand, unit, low-stock level, sold (read only), usual source |
| `stations` | `station_id` | kitchen stations |
| `payees` | `payee_id` | UPI payees |
| `settings` | `key` | shared settings (tip choices, round-off steps, split mode, …) |

Every info tab: frozen bold header (the only protected part, warning only), stable snake_case headers, checkboxes for yes/no, dropdowns for fixed lists, `yyyy-mm-dd` dates, money in rupees (`*_inr`), no merged cells. The italic columns (`updated_at`, `updated_by`, `last_op_id`, `day_name`, `sold`) are filled by the bridge; anything typed there is overwritten.

**Editing:** change any other cell, or add a row (leave the id blank; the bridge gives it one, e.g. `sh3f9a…`). To remove a row, untick `active` (do not delete the row; a deleted row comes back on the next rebuild). Each edit becomes an op from writer `sheet`, stored in the hidden `ops` log and pulled by every phone, so the app shows it on its next sync. Phone changes come back into the same rows (matched by id); extra columns you add to the right are kept.

### Hidden tabs (app-maintained history; kept intact, do not edit)
`_schema` (column dictionary), `ops` (source of truth, append-only, idempotent by `op_id`, `payload_json` + `vv_json`), `conflicts`, and the append-only per-op logs `days`, `orders`, `order_events`, `order_lines`, `line_events`, `payments`, `refunds`, `money`, `settlements`, `menu_log`, `stock_moves`, `people_log`, `payees_log`, `settings_log`, `records_log`. Code.gs writes them while hidden and creates any new log tab hidden. To look: View → Hidden sheets. Money in logs stays in integer paise.

### Views
`v_devices`, `v_daily_sales`, `v_money_by_day`, `v_stock_moves`: formula views over the logs (read only).

### How changes are merged (Q-HARM-10, D-SHEET-WINS)
Info tabs are views the bridge rewrites from the op log; the log is never overwritten. Ops are ordered by Lamport clock and version vectors, never by wall clocks (a phone clock a day out changes nothing). A Sheet edit is an op from `sheet`, causally after everything already synced. When a phone edit and a Sheet edit truly clash (neither saw the other), the Sheet's value wins, both stay in the log, a row is written to the hidden `conflicts` tab, and the app lists it under Settings → Sync → Review, where one tap switches to the other value (a new op). Nothing blocks sync. Duplicate ops are ignored; a gap in a phone's sequence makes the bridge ask that phone to resend.

Migration v1 → v2 (add only): `menu`, `people`, `payees`, `settings` logs renamed `*_log`; new info tabs, `records_log`, `conflicts`, and `ops.vv_json` added; log tabs hidden; `_meta.schema_version` = 2. `ensureSchema_` repeats this safely on every request.

## Deploy the bridge (Steve, one step, about 3 minutes; nothing is deployed from the repo)
In the Sheet: **Extensions → Apps Script** → replace the code with `apps-script/Code.gs` (raw link: https://raw.githubusercontent.com/steph1420/stall-tokens/v2.0.0/apps-script/Code.gs, also on `main`) → **Project Settings → Script Properties → `STALL_KEY`** = a word only the stall team knows → optionally run `setup` once from the editor (applies the schema and fills the info tabs) → **Deploy → New deployment → Web app** (Execute as: Me; Who has access: Anyone) → allow → copy the `/exec` URL. Hand edits reach the app through the simple `onEdit` trigger in the same script (no extra set-up).

Check: opening the URL shows `{"ok":true,"app":"stall-tokens-bridge","protocol":2,"schema_v":2,…}`.

## Phones
No pairing, no passcode. In the app: Stall → Settings → Developer → **Sign-in links**: fill the URL and key once, then make one link per person / role and send it to them. Opening the link sets up the phone (sync URL, key, role, name) and opens their screen. Or type URL + key under Settings → Sync. To revoke every link, change `STALL_KEY` in Script Properties and make new links. Phones on an older app get "update the app" and their ops are not stored.

Notes
- The key keeps strangers from writing to the Sheet; it is not a login.
- Edit info tabs freely; never edit, sort or delete rows in hidden log tabs.
- "Manage deployments → Edit → New version" keeps the same URL when Code.gs changes.
