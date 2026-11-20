/**
 * Stall Tokens Sheet bridge (F-35, F-48, Q-SHEET-DEPLOY, Q-HARM-10). Schema v2 of "Stall Tokens — Data (v2)".
 * Fits ARCHITECTURE §4.3 / §4.6. Server-script rules (06): 0, 1, 4, 6, 7, 10–13; limits in CFG; version in CFG.VERSION.
 *
 * Op log, never overwrite (Q-HARM-10, LOCKED): the hidden append-only `ops` tab is the source of truth, idempotent
 * by op_id, ordered by Lamport + version vectors (never a device clock; recvAt is display / tiebreak only). Hidden
 * log tabs are append-only projections of `ops`. The visible INFO tabs (business, events, …, menu, stock_current,
 * settings) are views this script rewrites from fold(log) after each push or hand edit. A hand edit on an info tab
 * becomes ops from writer `sheet` (onEdit), causally after everything synced; on a true clash the sheet wins and the
 * hidden `conflicts` tab gets a row (the app shows them under Settings > Sync > Review). A gap in a writer's seq is
 * answered with `resend` so the phone sends the missing ops again. Nothing blocks sync.
 *
 * Deploy (Steve, once): Extensions > Apps Script > paste this file > Project Settings > Script Properties:
 *   STALL_KEY = <shared stall key>  > Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 *   Optional: run setup() once from the editor to build the tabs straight away.
 * Protocol (POST, text/plain JSON body), mirrored by src/data/adapters/sheetTransport.ts:
 *   {action:'push', key, ops:[Op]}      -> {ok:true, stored:[opId], resend:[{writer, fromSeq}], schema_v, bridge}
 *   {action:'pull', key, cursor:'<n>'}  -> {ok:true, ops:[Op + recvAt], cursor:'<m>', schema_v, bridge}
 *   {action:'beat', key, deviceId, label, orderId} -> {ok:true, seen:[{deviceId, label, orderId, ageMs}]}  (s127 presence, cache only)
 *   GET                                 -> {ok:true, app:'stall-tokens-bridge', protocol:2, bridge, schema_v}
 *   an op from an older contract        -> {ok:false, error:'update the app'}
 * Future safe: columns found by header name, only ever appended (ensureSchema_); _meta.schema_version records it.
 * Money: integer paise in log tabs (*_paise); rupees (*_inr) on info tabs for hand editing. Times ISO-8601.
 */
var CFG = {
  VERSION: '2.1.0', // bridge script version (shown by GET and in _meta.bridge_version)
  PULL_MAX: 500, PUSH_MAX: 500, LOCK_MS: 20000, TEXT_MAX: 500,
  SHEET_WRITER: 'sheet' // writer id of hand edits (Q-HARM-10)
};
var SCHEMA_VERSION = 3;
var CONTRACT_VERSION = 2;
var IST_MS = 330 * 60000;
var RECORD_TABLES = ['business', 'event', 'event_day', 'source', 'source_item', 'station', 'person_info', 'item_info', 'category', 'day_note', 'day_summary'];
/** v1 -> v2 add-only migration: the v1 per-op tabs keep their rows under a *_log name; the plain names become info tabs. */
var V1_RENAMES = { menu: 'menu_log', people: 'people_log', payees: 'payees_log', settings: 'settings_log' };
var LOG_TABS = ['ops', 'conflicts', 'days', 'orders', 'order_events', 'order_lines', 'line_events', 'payments', 'refunds', 'money', 'settlements',
  'menu_log', 'stock_moves', 'people_log', 'payees_log', 'settings_log', 'records_log'];

var TABS = {
  ops: [
    ['op_id', 'text', 'Unique op id "<writer>:<seq>" (stable, never reused)'], ['schema_v', 'int', 'Sheet schema version at write'],
    ['contract_v', 'int', 'App op contract version'], ['device_id', 'text', 'Writer device (first part of writer)'],
    ['writer', 'text', 'Writer id (device + app load)'], ['seq', 'int', 'Per-writer sequence'], ['lamport', 'int', 'Lamport clock'],
    ['kind', 'enum', 'Op kind, e.g. order.create'], ['entity_id', 'text', 'Main id the op is about'],
    ['ts_utc', 'iso8601', 'Device wall time (display only), UTC'], ['ts_ist', 'iso8601', 'Same time in IST (+05:30)'],
    ['received_at_utc', 'iso8601', 'When the Sheet stored it (recvAt: display and tiebreak only)'], ['payload_json', 'json', 'The whole op as JSON (source of truth)'],
    ['vv_json', 'json', 'Version vector: what the writer had seen (causality)']],
  days: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['day_id', 'text', 'Fair day id'], ['label', 'date', 'IST date YYYY-MM-DD']],
  orders: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['order_id', 'text', ''], ['day_id', 'text', ''], ['token', 'int', 'Token number'], ['served_by', 'text', 'Serving name']],
  order_events: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['order_id', 'text', ''], ['event', 'enum', 'send / delete / cancel / priority / client / note / discount / roundoff'], ['value', 'text', 'Main value (reason, name, note, on)'], ['amount_paise', 'int', 'Discount value / round-off amount'], ['detail_json', 'json', 'Op body']],
  order_lines: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['order_id', 'text', ''], ['line_id', 'text', ''], ['item_id', 'text', ''], ['name', 'text', ''], ['price_paise', 'int', ''], ['qty', 'int', ''], ['category', 'text', ''], ['station_id', 'text', '']],
  line_events: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['order_id', 'text', ''], ['line_id', 'text', ''], ['event', 'enum', 'qty / note / status / finish'], ['value', 'text', 'New qty, note or status']],
  payments: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['day', 'date', 'IST date'], ['payment_id', 'text', ''], ['order_id', 'text', ''], ['cash_paise', 'int', ''], ['upi_paise', 'int', ''], ['upi_payee_id', 'text', ''], ['tip_paise', 'int', ''], ['waived_paise', 'int', ''], ['waived_by', 'text', ''], ['cash_given_paise', 'int', '']],
  refunds: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['day', 'date', ''], ['refund_id', 'text', ''], ['order_id', 'text', ''], ['amount_paise', 'int', ''], ['source', 'enum', 'cash / upi']],
  money: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['event', 'enum', 'add / void'], ['entry_id', 'text', ''], ['day_id', 'text', ''], ['dir', 'enum', 'spent / received'], ['amount_paise', 'int', ''], ['label', 'text', 'For / From'], ['kind', 'enum', 'normal / donation'], ['person_id', 'text', ''], ['parts_json', 'json', 'Paid by / Received in parts'], ['note', 'text', '']],
  settlements: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['event', 'enum', 'pay / clear / undo / lock'], ['settle_id', 'text', 'payId / clearId / target'], ['day_id', 'text', ''], ['person_id', 'text', ''], ['amount_paise', 'int', 'Signed: + stall pays the person'], ['via', 'text', ''], ['by_person_id', 'text', ''], ['reason', 'text', ''], ['note', 'text', ''], ['detail_json', 'json', '']],
  menu_log: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['item_id', 'text', ''], ['name', 'text', 'Blank = unchanged by this op'], ['price_paise', 'int', ''], ['category', 'text', ''], ['station_id', 'text', ''], ['count', 'int', ''], ['unit', 'text', ''], ['supply', 'bool', 'Stock only, never on the Menu'], ['sold_out', 'bool', ''], ['removed', 'bool', ''], ['fields_json', 'json', 'The partial update']],
  stock_moves: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['item_id', 'text', ''], ['delta', 'int', ''], ['reason', 'text', 'panel / stock / paste']],
  people_log: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['person_id', 'text', ''], ['name', 'text', ''], ['is_partner', 'bool', ''], ['share_pct', 'int', ''], ['removed', 'bool', '']],
  payees_log: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['payee_id', 'text', ''], ['name', 'text', ''], ['upi_id', 'text', ''], ['removed', 'bool', '']],
  settings_log: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['key', 'text', ''], ['value', 'text', '']],
  records_log: [['op_id', 'text', ''], ['ts_ist', 'iso8601', ''], ['table', 'enum', RECORD_TABLES.join(' / ')], ['record_id', 'text', ''], ['writer', 'text', 'sheet = a hand edit'], ['removed', 'bool', ''], ['fields_json', 'json', 'The patch']],
  conflicts: [['conflict_id', 'text', 'winner>loser|target|field'], ['detected_at_utc', 'iso8601', ''], ['target', 'text', ''], ['field', 'text', ''], ['rule', 'enum', 'causal / sheet-wins'],
    ['winner_op_id', 'text', ''], ['loser_op_id', 'text', ''], ['winner_writer', 'text', ''], ['loser_writer', 'text', ''], ['winner_recv_at_utc', 'iso8601', ''], ['loser_recv_at_utc', 'iso8601', '']]
};

/**
 * Info tabs (Steve 16 Nov 20:10 / 20:11 IST, F-48): readable, EDITABLE current state. Each is a view the bridge
 * rewrites from the op log (fold), never the source of truth. A hand edit becomes an op from writer `sheet`
 * (onEdit below), causally after everything synced (vv = the bridge's vector), then the tab is rewritten.
 * Column spec: [name, type, description, options]. type: id | text | int | num | inr (rupees, decimal) | bool |
 * date (YYYY-MM-DD) | time (HH:MM) | enum | url | ro (read-only, computed). Meta columns are added to every tab.
 */
var META_COLS = [['updated_at', 'ro', 'When the last change was stored (IST)'], ['updated_by', 'ro', 'Who: sheet or a phone id'], ['last_op_id', 'ro', 'Op that last changed this row']];
var INFO = {
  business: { key: 'business_id', record: 'business', cols: [
    ['business_id', 'id', 'Use "main" for the one business row'], ['name', 'text', 'Trading name'], ['legal_name', 'text', ''],
    ['logo_url', 'url', ''], ['phone', 'text', ''], ['email', 'text', ''], ['address', 'text', ''], ['city', 'text', ''],
    ['gstin', 'text', 'Optional'], ['upi_id', 'text', 'Optional, main UPI ID'], ['fssai_no', 'text', 'Optional food licence'], ['notes', 'text', '']] },
  events: { key: 'event_id', record: 'event', cols: [
    ['event_id', 'id', ''], ['name', 'text', 'Fair / event name'], ['venue', 'text', 'Place of event'], ['address', 'text', ''], ['city', 'text', ''],
    ['start_date', 'date', ''], ['end_date', 'date', ''], ['days_list', 'text', 'e.g. Fri, Sat, Sun'],
    ['status', 'enum', '', ['planned', 'live', 'done', 'cancelled']], ['organiser', 'text', ''], ['stall_no', 'text', ''], ['fee_inr', 'inr', 'Stall fee'], ['notes', 'text', '']] },
  event_days: { key: 'day_id', record: 'event_day', cols: [
    ['day_id', 'id', 'App fair day id'], ['event_id', 'text', 'From events'], ['date', 'date', ''], ['day_name', 'ro', 'From date'],
    ['open_time', 'time', ''], ['close_time', 'time', ''], ['float_inr', 'inr', 'Opening cash float'],
    ['status', 'enum', '', ['planned', 'open', 'closed']], ['notes', 'text', '']] },
  partners: { key: 'person_id', cols: [
    ['person_id', 'id', ''], ['name', 'text', ''], ['share_pct', 'int', 'Share of profit, %'], ['phone', 'text', ''], ['email', 'text', ''], ['notes', 'text', ''], ['active', 'bool', '']] },
  associates: { key: 'person_id', cols: [
    ['person_id', 'id', ''], ['name', 'text', ''], ['role', 'enum', '', ['helper', 'volunteer', 'staff', 'supplier contact', 'other']],
    ['phone', 'text', ''], ['email', 'text', ''], ['notes', 'text', ''], ['active', 'bool', '']] },
  sources: { key: 'source_id', record: 'source', cols: [
    ['source_id', 'id', ''], ['name', 'text', 'Business / market name'], ['type', 'enum', 'Where raw material comes from', ['Market', 'Online store', 'Supplier', 'Wholesaler', 'Other']],
    ['contact_name', 'text', ''], ['phone', 'text', ''], ['email', 'text', ''], ['address', 'text', ''], ['url', 'url', ''], ['payment_terms', 'text', ''], ['notes', 'text', ''], ['active', 'bool', '']] },
  source_items: { key: 'source_item_id', record: 'source_item', cols: [
    ['source_item_id', 'id', ''], ['source_id', 'text', 'From sources'], ['item_id', 'text', 'From menu / stock_current'], ['item_name', 'text', ''],
    ['unit', 'text', ''], ['pack_size', 'text', ''], ['last_price_inr', 'inr', ''], ['notes', 'text', ''], ['active', 'bool', '']] },
  menu: { key: 'item_id', cols: [
    ['item_id', 'id', ''], ['name', 'text', ''], ['category', 'text', ''], ['price_inr', 'inr', ''], ['station', 'text', 'Kitchen station'],
    ['sold_out', 'bool', ''], ['active', 'bool', 'Off = removed'], ['stock_only', 'bool', 'Supply, never on the Menu'], ['sort_order', 'int', '']] },
  stock_current: { key: 'item_id', cols: [
    ['item_id', 'id', ''], ['name', 'text', ''], ['on_hand', 'int', 'Blank = not counted'], ['unit', 'text', ''], ['low_at', 'int', 'Low-stock warning at'],
    ['sold', 'ro', 'Sold since counting began'], ['source_id', 'text', 'Usual source (sources)'], ['stock_only', 'bool', ''], ['notes', 'text', '']] },
  stations: { key: 'station_id', record: 'station', cols: [
    ['station_id', 'id', 'As used by menu.station'], ['name', 'text', ''], ['icon', 'text', 'Icon or emoji'], ['colour', 'text', 'Swatch/hex'], ['sort_order', 'int', ''], ['active', 'bool', ''], ['notes', 'text', '']] },
  categories: { key: 'category_id', record: 'category', cols: [
    ['category_id', 'id', ''], ['name', 'text', ''], ['sort_order', 'int', ''], ['default_station', 'text', ''], ['default_swatch', 'int', ''], ['active', 'bool', 'Off = removed'], ['notes', 'text', '']] },
  day_notes: { key: 'day_id', record: 'day_note', cols: [
    ['day_id', 'id', 'From days/event_days'], ['text', 'text', ''], ['tags', 'text', 'Comma-separated chips'], ['notes', 'text', '']] },
  payees: { key: 'payee_id', cols: [['payee_id', 'id', ''], ['name', 'text', ''], ['upi_id', 'text', 'name@bank'], ['active', 'bool', '']] },
  settings: { key: 'key', cols: [['key', 'id', 'Setting name'], ['value', 'text', '']] }
};
var INFO_ORDER = ['business', 'events', 'event_days', 'partners', 'associates', 'sources', 'source_items', 'menu', 'stock_current', 'categories', 'stations', 'day_notes', 'payees', 'settings'];
function infoCols_(tab) { return INFO[tab].cols.concat(META_COLS); }

/** Formula views (read-only; rebuilt by setup). */
var VIEWS = {
  v_devices: '=IFERROR(QUERY(ops!A:M,"select D, count(A), min(J), max(J) where A is not null group by D label count(A) \'ops\', min(J) \'first_ts_utc\', max(J) \'last_ts_utc\'",1),{"device_id","ops","first_ts_utc","last_ts_utc"})',
  v_daily_sales: '=IFERROR(QUERY(payments!A:L,"select C, sum(F)/100, sum(G)/100, sum(I)/100, sum(J)/100, count(D) where D is not null group by C label sum(F)/100 \'cash_inr\', sum(G)/100 \'upi_inr\', sum(I)/100 \'tips_inr\', sum(J)/100 \'waived_inr\', count(D) \'payments\'",1),{"day","cash_inr","upi_inr","tips_inr","waived_inr","payments"})',
  v_money_by_day: '=IFERROR(QUERY(money!A:L,"select E, F, sum(G)/100, count(D) where C = \'add\' group by E, F pivot I label sum(G)/100 \'inr\', count(D) \'entries\'",1),{"day_id","dir"})',
  v_stock_moves: '=IFERROR(QUERY(stock_moves!A:E,"select C, sum(D), count(A) where A is not null group by C label sum(D) \'net_delta\', count(A) \'moves\'",1),{"item_id","net_delta","moves"})'
};

function iso_(ms, offset) {
  var d = new Date(ms + offset);
  var s = d.toISOString().replace(/\.\d{3}Z$/, '');
  return offset ? s + '+05:30' : s + 'Z';
}
function day_(ms) { return iso_(ms, IST_MS).slice(0, 10); }
function json_(x) { return JSON.stringify(x === undefined ? null : x); }
function sanitizeCell_(x) {
  if (x === undefined || x === null) return '';
  if (typeof x === 'string' && /^[=+\-@\t\r]/.test(x)) return "'" + x;
  return x;
}
function v_(x) { return sanitizeCell_(x); }

/** op -> [tab, row object] or null. Every row carries op_id + ts_ist. */
function project_(op) {
  var b = op.body || {}; var k = op.kind;
  var base = { op_id: op.opId, ts_ist: iso_(op.wallAt, IST_MS) };
  function row(tab, o) { for (var key in o) base[key] = o[key]; return [tab, base]; }
  if (k === 'day.start') return row('days', { day_id: b.dayId, label: b.label });
  if (k === 'order.create') return row('orders', { order_id: b.orderId, day_id: b.dayId, token: b.token, served_by: b.servedBy });
  if (k === 'line.add') return row('order_lines', { order_id: b.orderId, line_id: b.lineId, item_id: b.itemId, name: b.name, price_paise: b.price, qty: b.qty, category: b.category, station_id: b.stationId });
  if (k === 'line.qty' || k === 'line.note' || k === 'line.status' || k === 'line.finish')
    return row('line_events', { order_id: b.orderId, line_id: b.lineId, event: k.slice(5), value: v_(k === 'line.qty' ? b.qty : k === 'line.note' ? b.note : b.status) });
  if (k.indexOf('order.') === 0) {
    var val = b.reason !== undefined ? b.reason : b.name !== undefined ? b.name : b.note !== undefined ? b.note : b.on !== undefined ? String(b.on) : b.kind !== undefined ? b.kind : '';
    return row('order_events', { order_id: b.orderId, event: k.slice(6), value: val, amount_paise: v_(b.value !== undefined ? b.value : b.amount), detail_json: json_(b) });
  }
  if (k === 'payment.add') return row('payments', { day: day_(op.wallAt), payment_id: b.paymentId, order_id: b.orderId, cash_paise: b.cash, upi_paise: b.upi, upi_payee_id: v_(b.upiPayeeId), tip_paise: b.tip, waived_paise: b.waived, waived_by: b.waivedBy, cash_given_paise: b.cashGiven });
  if (k === 'refund.add') return row('refunds', { day: day_(op.wallAt), refund_id: b.refundId, order_id: b.orderId, amount_paise: b.amount, source: b.source });
  if (k === 'entry.add') return row('money', { event: 'add', entry_id: b.entryId, day_id: b.dayId, dir: b.dir, amount_paise: b.amount, label: b.label, kind: b.kind, person_id: v_(b.personId), parts_json: json_(b.parts), note: b.note });
  if (k === 'entry.void') return row('money', { event: 'void', entry_id: b.entryId, note: b.reason });
  if (k.indexOf('settle.') === 0 || k === 'day.lock')
    return row('settlements', { event: k === 'day.lock' ? 'lock' : k.slice(7), settle_id: v_(b.payId || b.clearId || b.targetId), day_id: v_(b.dayId), person_id: v_(b.personId), amount_paise: v_(b.amount), via: v_(b.via), by_person_id: v_(b.byPersonId), reason: v_(b.reason), note: v_(b.note), detail_json: json_(b) });
  if (k === 'item.set') {
    var f = b.fields || {};
    return row('menu_log', { item_id: b.itemId, name: v_(f.name), price_paise: v_(f.price), category: v_(f.category), station_id: v_(f.stationId), count: v_(f.count), unit: v_(f.unit), supply: v_(f.supply), sold_out: v_(f.soldOut), removed: v_(f.removed), fields_json: json_(f) });
  }
  if (k === 'stock.adjust') return row('stock_moves', { item_id: b.itemId, delta: b.delta, reason: b.reason });
  if (k === 'person.set') return row('people_log', { person_id: b.personId, name: b.name, is_partner: b.isPartner, share_pct: b.sharePct, removed: b.removed });
  if (k === 'payee.set') return row('payees_log', { payee_id: b.payeeId, name: b.name, upi_id: b.upiId, removed: b.removed });
  if (k === 'setting.set') return row('settings_log', { key: b.key, value: b.value });
  if (k === 'record.set') return row('records_log', { table: b.table, record_id: b.id, writer: op.writer, removed: b.removed, fields_json: json_(b.fields) });
  return null; // a newer kind: kept in ops, projected once this script learns it
}

function entityId_(op) {
  var b = op.body || {};
  return v_(b.orderId || b.entryId || b.itemId || b.personId || b.payeeId || b.dayId || b.payId || b.clearId || b.targetId || b.key || (b.table ? b.table + ':' + b.id : '') || '');
}

/** Total order (same as src/contract/op.ts compareOps): lamport, then writer, then seq. Never a clock. */
function compareOps_(a, b) {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.writer !== b.writer) return a.writer < b.writer ? -1 : 1;
  return a.seq - b.seq;
}

/** Last-writer-wins by fold order with conflict recording and sheet wins (mirror of src/store/fold/lww.ts). */
function lww_(S, target, field, op) {
  var key = target + '|' + field;
  var prev = S.lw[key];
  var dev = function (w) { return String(w).split('.')[0]; };
  var concurrent = !!prev && dev(prev.writer) !== dev(op.writer) && ((op.vv || {})[prev.writer] || 0) < prev.seq;
  var sheetKeeps = concurrent && prev.writer === CFG.SHEET_WRITER && op.writer !== CFG.SHEET_WRITER;
  if (!sheetKeeps) S.lw[key] = { writer: op.writer, seq: op.seq, opId: op.opId, recvAt: op.recvAt || 0 };
  if (concurrent) {
    S.conflicts.push(sheetKeeps
      ? { target: target, field: field, winner: prev.opId, loser: op.opId, winner_writer: prev.writer, loser_writer: op.writer, rule: 'sheet-wins', winner_recv: prev.recvAt, loser_recv: op.recvAt || 0 }
      : { target: target, field: field, winner: op.opId, loser: prev.opId, winner_writer: op.writer, loser_writer: prev.writer, rule: 'causal', winner_recv: op.recvAt || 0, loser_recv: prev.recvAt });
  }
  return !sheetKeeps;
}

var ITEM_DEFAULTS = { name: '', price: 0, category: '', stationId: '', count: null, unit: '', lowAt: 0, soldOut: false, order: 0, removed: false, supply: false };
var NOT_STARTED = { draft: 1, waiting: 1, held: 1, paused: 1 };

function touch_(S, tab, id, op) { S.meta[tab + '|' + id] = { at: op.recvAt || op.wallAt, by: op.writer, op: op.opId }; }
function moveStock_(S, itemId, sold) {
  var it = S.items[itemId];
  if (!it || !sold) return;
  it.sold += sold;
  if (it.count !== null) it.count = Math.max(0, it.count - sold);
}
function commit_(S, o) {
  o.lines.forEach(function (l) { moveStock_(S, l.itemId, l.qty - l.committed); l.committed = l.qty; if (l.status === 'draft') l.status = 'waiting'; });
  o.sent = true;
}
function setQty_(S, o, lineId, raw) {
  var l = null; o.lines.forEach(function (x) { if (x.lineId === lineId) l = x; });
  if (!l) return;
  var qty = Math.max(0, Math.trunc(raw)); var committed = l.status === 'draft' ? 0 : qty;
  if (committed !== l.committed) moveStock_(S, l.itemId, committed - l.committed);
  l.qty = qty; l.committed = committed;
  if (qty === 0) o.lines = o.lines.filter(function (x) { return x.lineId !== lineId; });
}

/** The order ops that move stock (mirror of src/store/fold/orders.ts); everything else about orders stays in logs. */
function foldOrder_(S, op) {
  var b = op.body; var o = S.orders[b.orderId];
  if (op.kind === 'order.create') { if (!o) S.orders[b.orderId] = { lines: [], sent: false, payments: {}, refunds: {} }; return; }
  if (!o) return;
  if (!o.refunds) o.refunds = {};
  if (op.kind === 'line.add') {
    if (o.lines.some(function (l) { return l.lineId === b.lineId; })) return;
    o.lines.push({ lineId: b.lineId, itemId: b.itemId, qty: 0, committed: 0, restocked: 0, status: 'draft' });
    setQty_(S, o, b.lineId, b.qty);
  } else if (op.kind === 'line.qty') setQty_(S, o, b.lineId, b.qty);
  else if (op.kind === 'line.status') o.lines.forEach(function (l) { if (l.lineId === b.lineId) l.status = b.status; });
  else if (op.kind === 'line.finish') o.lines.forEach(function (l) { if (l.lineId === b.lineId && l.status !== 'draft' && l.status !== 'handed') l.status = 'ready'; });
  else if (op.kind === 'order.send') commit_(S, o);
  else if (op.kind === 'payment.add') { if (o.payments[b.paymentId]) return; o.payments[b.paymentId] = 1; commit_(S, o); }
  else if (op.kind === 'refund.add') {
    if (o.refunds[b.refundId]) return;
    var done = [];
    if (b.restock === true && Array.isArray(b.lines)) {
      b.lines.forEach(function (rl) {
        o.lines.forEach(function (l) {
          if (l.lineId === rl.lineId) {
            var restocked = l.restocked || 0;
            var ask = Math.max(0, Math.trunc(rl.qty));
            var qty = Math.min(ask, Math.max(0, l.committed - restocked));
            if (qty > 0) {
              moveStock_(S, l.itemId, -qty);
              l.restocked = restocked + qty;
              done.push({ lineId: l.lineId, qty: qty, itemId: l.itemId });
            }
          }
        });
      });
    }
    o.refunds[b.refundId] = { done: done, voided: false };
  } else if (op.kind === 'refund.void') {
    if (!o.refunds[b.refundId] || o.refunds[b.refundId].voided) return;
    var ref = o.refunds[b.refundId];
    ref.voided = true;
    ref.done.forEach(function (d) {
      o.lines.forEach(function (l) {
        if (l.lineId === d.lineId) {
          moveStock_(S, d.itemId, d.qty);
          l.restocked = Math.max(0, (l.restocked || 0) - d.qty);
        }
      });
    });
  } else if (op.kind === 'order.delete') o.lines.forEach(function (l) { moveStock_(S, l.itemId, -(l.committed - (l.restocked || 0))); l.committed = 0; });
  else if (op.kind === 'order.cancel') o.lines.forEach(function (l) { if (NOT_STARTED[l.status]) { moveStock_(S, l.itemId, -(l.committed - (l.restocked || 0))); l.committed = 0; } });
}

function foldItem_(S, op) {
  var id = op.body.itemId; var f = op.body.fields || {};
  var it = S.items[id] || (S.items[id] = (function () { var x = { id: id, sold: 0 }; for (var k in ITEM_DEFAULTS) x[k] = ITEM_DEFAULTS[k]; return x; })());
  for (var key in f) {
    if (!(key in ITEM_DEFAULTS)) continue;
    var v = f[key];
    var ok = key === 'count' ? v === null || (typeof v === 'number' && isFinite(v)) : v !== undefined && typeof v === typeof ITEM_DEFAULTS[key] && (typeof v !== 'number' || isFinite(v));
    if (!ok) continue;
    if (lww_(S, 'item:' + id, key, op)) it[key] = v;
  }
  touch_(S, 'item', id, op);
}

function foldRecord_(S, op) {
  var b = op.body;
  if (RECORD_TABLES.indexOf(b.table) < 0 || !b.id) return;
  var rows = S.rec[b.table] || (S.rec[b.table] = {});
  var r = rows[b.id] || (rows[b.id] = { fields: {}, removed: false });
  var f = b.fields || {};
  for (var k in f) {
    var v = f[k];
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k) || !(typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v)))) continue;
    if (lww_(S, 'rec:' + b.table + ':' + b.id, k, op)) r.fields[k] = typeof v === 'string' ? v.slice(0, CFG.TEXT_MAX) : v;
  }
  if (lww_(S, 'rec:' + b.table + ':' + b.id, 'removed', op)) r.removed = b.removed === true;
  touch_(S, 'rec:' + b.table, b.id, op);
}

/** State = fold(log) for the info tabs. `ops` in any order; sorted here. */
function foldState_(ops) {
  var S = { items: {}, people: {}, payees: {}, settings: {}, days: {}, rec: {}, orders: {}, lw: {}, conflicts: [], meta: {} };
  var seen = {};
  ops.slice().sort(compareOps_).forEach(function (op) {
    if (!op || seen[op.opId]) return;
    seen[op.opId] = true;
    var b = op.body || {}; var k = op.kind;
    if (k === 'item.set') foldItem_(S, op);
    else if (k === 'stock.adjust') { var it = S.items[b.itemId]; if (it && it.count !== null) it.count = Math.max(0, it.count + Math.trunc(b.delta)); }
    else if (k === 'person.set') { if (lww_(S, 'person:' + b.personId, 'all', op)) { S.people[b.personId] = { name: b.name, isPartner: b.isPartner, sharePct: Math.max(0, Math.min(100, b.sharePct)), removed: b.removed }; touch_(S, 'person', b.personId, op); } }
    else if (k === 'payee.set') { if (lww_(S, 'payee:' + b.payeeId, 'all', op)) { S.payees[b.payeeId] = { name: b.name, upiId: b.upiId, removed: b.removed }; touch_(S, 'payee', b.payeeId, op); } }
    else if (k === 'setting.set') { if (lww_(S, 'settings', b.key, op)) { S.settings[b.key] = b.value; touch_(S, 'setting', b.key, op); } }
    else if (k === 'day.start') { if (!S.days[b.dayId]) S.days[b.dayId] = { label: b.label }; touch_(S, 'day', b.dayId, op); }
    else if (k === 'record.set') foldRecord_(S, op);
    else if (k.indexOf('order.') === 0 || k.indexOf('line.') === 0 || k === 'payment.add' || k === 'refund.add' || k === 'refund.void') foldOrder_(S, op);
  });
  return S;
}

function inr_(p) { return typeof p === 'number' ? p / 100 : ''; }
function paise_(x) { var n = Number(x); return x === '' || x === null || !isFinite(n) ? null : Math.round(n * 100); }
function dayName_(d) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  return m ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : '';
}
function withMeta_(row, m) { row.updated_at = m ? iso_(m.at, IST_MS) : ''; row.updated_by = m ? m.by : ''; row.last_op_id = m ? m.op : ''; return row; }
function recRows_(S, table, key) {
  var rows = S.rec[table] || {}; var out = [];
  for (var id in rows) { var r = { }; r[key] = id; for (var f in rows[id].fields) r[f] = rows[id].fields[f]; if ('active' in INFO_COLS_BY_RECORD_(table)) r.active = !rows[id].removed; out.push(withMeta_(r, S.meta['rec:' + table + '|' + id])); }
  return out;
}
function INFO_COLS_BY_RECORD_(table) {
  for (var t in INFO) if (INFO[t].record === table) { var o = {}; INFO[t].cols.forEach(function (c) { o[c[0]] = 1; }); return o; }
  return {};
}

/** Pure: state -> {tab: [row objects]} for every info tab (the rows the bridge writes). */
function renderRows_(S) {
  var out = {}; var id;
  out.business = recRows_(S, 'business', 'business_id');
  out.events = recRows_(S, 'event', 'event_id');
  out.sources = recRows_(S, 'source', 'source_id');
  out.source_items = recRows_(S, 'source_item', 'source_item_id');
  out.categories = recRows_(S, 'category', 'category_id');
  out.day_notes = recRows_(S, 'day_note', 'day_id');
  out.menu = []; out.stock_current = [];
  var info = S.rec.item_info || {};
  for (id in S.items) {
    var it = S.items[id]; var m = S.meta['item|' + id];
    out.menu.push(withMeta_({ item_id: id, name: it.name, category: it.category, price_inr: inr_(it.price), station: it.stationId, sold_out: it.soldOut, active: !it.removed, stock_only: it.supply, sort_order: it.order }, m));
    var x = (info[id] || { fields: {} }).fields;
    out.stock_current.push(withMeta_({ item_id: id, name: it.name, on_hand: it.count === null ? '' : it.count, unit: it.unit, low_at: it.lowAt, sold: it.sold, source_id: v_(x.source_id), stock_only: it.supply, notes: v_(x.notes) }, m));
  }
  var stations = {}; var st = S.rec.station || {};
  for (id in S.items) if (S.items[id].stationId) stations[S.items[id].stationId] = 1;
  for (id in st) stations[id] = 1;
  out.stations = Object.keys(stations).map(function (sid) { var r = st[sid] || { fields: {}, removed: false }; return withMeta_({ station_id: sid, name: v_(r.fields.name) || sid, icon: v_(r.fields.icon), colour: v_(r.fields.colour), sort_order: v_(r.fields.sort_order), active: !r.removed, notes: v_(r.fields.notes) }, S.meta['rec:station|' + sid]); });
  out.partners = []; out.associates = [];
  var pinfo = S.rec.person_info || {};
  for (id in S.people) {
    var p = S.people[id]; var pi = (pinfo[id] || { fields: {} }).fields; var pm = S.meta['person|' + id];
    if (p.isPartner) out.partners.push(withMeta_({ person_id: id, name: p.name, share_pct: p.sharePct, phone: v_(pi.phone), email: v_(pi.email), notes: v_(pi.notes), active: !p.removed }, pm));
    else out.associates.push(withMeta_({ person_id: id, name: p.name, role: v_(pi.role), phone: v_(pi.phone), email: v_(pi.email), notes: v_(pi.notes), active: !p.removed }, pm));
  }
  out.payees = Object.keys(S.payees).map(function (pid) { var y = S.payees[pid]; return withMeta_({ payee_id: pid, name: y.name, upi_id: y.upiId, active: !y.removed }, S.meta['payee|' + pid]); });
  out.settings = Object.keys(S.settings).map(function (k) { return withMeta_({ key: k, value: S.settings[k] }, S.meta['setting|' + k]); });
  var days = {}; var ed = S.rec.event_day || {};
  for (id in S.days) days[id] = 1;
  for (id in ed) days[id] = 1;
  out.event_days = Object.keys(days).map(function (did) {
    var f = (ed[did] || { fields: {} }).fields; var date = v_(f.date) || (S.days[did] ? S.days[did].label : '');
    var fl = S.settings['float:' + did];
    return withMeta_({ day_id: did, event_id: v_(f.event_id), date: date, day_name: dayName_(date), open_time: v_(f.open_time), close_time: v_(f.close_time), float_inr: fl === undefined ? '' : Number(fl) / 100, status: v_(f.status), notes: v_(f.notes) }, S.meta['rec:event_day|' + did] || S.meta['day|' + did]);
  });
  return out;
}

/** A Sheet cell value as plain data: dates YYYY-MM-DD, times HH:MM, checkboxes true/false, trimmed text. */
function cell_(v, type) {
  if (v instanceof Date) {
    var ist = new Date(v.getTime() + IST_MS).toISOString();
    return type === 'time' ? ist.slice(11, 16) : ist.slice(0, 10);
  }
  if (type === 'bool') return v === true || String(v).toLowerCase() === 'true';
  if (type === 'int' || type === 'num' || type === 'inr') return v === '' || v === null ? '' : Number(v);
  return typeof v === 'string' ? v.trim().slice(0, CFG.TEXT_MAX) : v;
}

/** Pure: an edited info row -> op drafts [{kind, body}] (writer `sheet`). `edited` = column names Steve changed.
 * Read-only columns (meta, computed) are ignored; the next rewrite puts them back. */
function rowToOps_(tab, row, edited) {
  var spec = INFO[tab]; var id = String(row[spec.key] || '');
  if (!spec || !id) return [];
  var types = {}; infoCols_(tab).forEach(function (c) { types[c[0]] = c[1]; });
  var ed = edited.filter(function (c) { return types[c] && types[c] !== 'ro' && c !== spec.key; });
  if (!ed.length) return [];
  var has = function (c) { return ed.indexOf(c) >= 0; };
  var val = function (c) { return cell_(row[c], types[c]); };
  var pick = function (cols) { var f = {}; cols.forEach(function (c) { if (has(c)) f[c] = val(c); }); return f; };
  var nonEmpty = function (o) { for (var k in o) return true; return false; };
  var out = [];
  if (spec.record) {
    var f = {}; var removed = false;
    ed.forEach(function (c) { if (c === 'active') removed = val(c) === false; else f[c] = val(c) === '' ? '' : val(c); });
    if (tab === 'event_days' && has('float_inr')) { delete f.float_inr; var fp = paise_(row.float_inr); out.push({ kind: 'setting.set', body: { key: 'float:' + id, value: String(fp === null ? 0 : fp) } }); }
    if (nonEmpty(f) || has('active')) out.push({ kind: 'record.set', body: { table: spec.record, id: id, fields: f, removed: has('active') ? removed : row.active === false } });
    return out;
  }
  if (tab === 'menu' || tab === 'stock_current') {
    var map = { name: 'name', category: 'category', station: 'stationId', sold_out: 'soldOut', sort_order: 'order', stock_only: 'supply', unit: 'unit', low_at: 'lowAt' };
    var fields = {};
    for (var c in map) if (has(c)) fields[map[c]] = val(c);
    if (has('price_inr')) fields.price = paise_(row.price_inr) || 0;
    if (has('active')) fields.removed = val('active') === false;
    if (has('on_hand')) fields.count = val('on_hand') === '' ? null : Math.max(0, Math.trunc(val('on_hand')));
    if (typeof fields.order === 'string' || fields.order === '') fields.order = Number(fields.order) || 0;
    if (typeof fields.lowAt === 'string' || fields.lowAt === '') fields.lowAt = Number(fields.lowAt) || 0;
    if (nonEmpty(fields)) out.push({ kind: 'item.set', body: { itemId: id, fields: fields } });
    var extra = pick(['source_id', 'notes']);
    if (tab === 'stock_current' && nonEmpty(extra)) out.push({ kind: 'record.set', body: { table: 'item_info', id: id, fields: extra, removed: false } });
    return out;
  }
  if (tab === 'partners' || tab === 'associates') {
    if (has('name') || has('share_pct') || has('active')) out.push({ kind: 'person.set', body: { personId: id, name: String(val('name') || ''), isPartner: tab === 'partners', sharePct: tab === 'partners' ? Math.max(0, Math.min(100, Number(row.share_pct) || 0)) : 0, removed: row.active === false } });
    var pi = pick(['phone', 'email', 'notes', 'role']);
    if (nonEmpty(pi)) out.push({ kind: 'record.set', body: { table: 'person_info', id: id, fields: pi, removed: false } });
    return out;
  }
  if (tab === 'payees') return [{ kind: 'payee.set', body: { payeeId: id, name: String(val('name') || ''), upiId: String(val('upi_id') || ''), removed: row.active === false } }];
  if (tab === 'settings') return has('value') ? [{ kind: 'setting.set', body: { key: id, value: String(val('value')) } }] : [];
  return out;
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function headers_(sh) { return sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : []; }
function props_() { return PropertiesService.getScriptProperties(); }
function getJson_(k, d) { try { return JSON.parse(props_().getProperty(k) || '') || d; } catch (e) { return d; } }

/** One-time and per-version setup: renames v1 log tabs, creates missing tabs, appends missing columns (never
 * reorders or removes), hides log tabs, puts dropdowns / checkboxes on info tabs and protects only their header row. */
function ensureSchema_() {
  var props = props_();
  if (props.getProperty('SCHEMA_DONE') === String(SCHEMA_VERSION)) return;
  var ss = ss_();
  for (var old in V1_RENAMES) {
    var o = ss.getSheetByName(old);
    if (o && headers_(o)[0] === 'op_id' && !ss.getSheetByName(V1_RENAMES[old])) o.setName(V1_RENAMES[old]);
  }
  var all = {}; var t;
  for (t in TABS) all[t] = TABS[t];
  INFO_ORDER.forEach(function (tab) { all[tab] = infoCols_(tab); });
  for (t in all) {
    var cols = all[t].map(function (c) { return c[0]; });
    var sh = ss.getSheetByName(t);
    if (!sh) { sh = ss.insertSheet(t); sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); sh.setFrozenRows(1); }
    else {
      var have = headers_(sh);
      var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
      if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
    if (LOG_TABS.indexOf(t) >= 0 && !sh.isSheetHidden()) sh.hideSheet();
    if (INFO[t]) styleInfo_(sh, t);
  }
  ['_schema'].forEach(function (n) { var h = ss.getSheetByName(n); if (h && !h.isSheetHidden()) h.hideSheet(); });
  var meta = ss.getSheetByName('_meta');
  if (meta) {
    var vals = meta.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (vals[i][0] === 'schema_version') meta.getRange(i + 1, 2).setValue(SCHEMA_VERSION);
      if (vals[i][0] === 'bridge_version') meta.getRange(i + 1, 2).setValue(CFG.VERSION);
    }
  }
  props.setProperty('SCHEMA_DONE', String(SCHEMA_VERSION));
}

function styleInfo_(sh, tab) {
  var h = headers_(sh); var rows = Math.max(1, sh.getMaxRows() - 1);
  infoCols_(tab).forEach(function (c) {
    var col = h.indexOf(c[0]) + 1;
    if (!col) return;
    var r = sh.getRange(2, col, rows, 1);
    if (c[1] === 'bool') r.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    else if (c[1] === 'enum') r.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(c[3], true).setAllowInvalid(false).build());
    else if (c[1] === 'date') r.setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build()).setNumberFormat('yyyy-mm-dd');
  });
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (x) { x.remove(); }); // info tabs are editable
  var desc = 'Header row (column names are the contract)';
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(function (x) { return x.getDescription() === desc; }))
    sh.getRange(1, 1, 1, sh.getLastColumn()).protect().setDescription(desc).setWarningOnly(true);
}

/** Server version vector and Lamport high-water mark (what the Sheet has seen). */
function clock_() { return { vv: getJson_('VV', {}), lamport: Number(props_().getProperty('LAMPORT') || 0) }; }
function saveClock_(c) { props_().setProperty('VV', JSON.stringify(c.vv)); props_().setProperty('LAMPORT', String(c.lamport)); }

/** Pure: gap check per writer. Returns [{writer, fromSeq}] for writers whose new seqs skip numbers. */
function gaps_(vv, ops) {
  var by = {}; var out = [];
  ops.forEach(function (op) { (by[op.writer] = by[op.writer] || []).push(op.seq); });
  for (var w in by) {
    var seqs = by[w].sort(function (a, b) { return a - b; }); var have = vv[w] || 0;
    for (var i = 0; i < seqs.length; i++) {
      if (seqs[i] <= have) continue;
      if (seqs[i] > have + 1) { out.push({ writer: w, fromSeq: have + 1 }); break; }
      have = seqs[i];
    }
  }
  return out;
}

/** Appends new ops (idempotent by op_id) + their log rows; updates the server clock. Caller holds the lock. */
function appendOps_(ops) {
  var ss = ss_(); var sh = ss.getSheetByName('ops');
  var last = sh.getLastRow(); var seen = {};
  if (last > 1) { var ids = sh.getRange(2, 1, last - 1, 1).getValues(); for (var i = 0; i < ids.length; i++) seen[ids[i][0]] = true; }
  var clock = clock_(); var now = Date.now(); var rows = []; var byTab = {}; var fresh = [];
  ops.forEach(function (op) {
    if (seen[op.opId]) return;
    seen[op.opId] = true;
    fresh.push(op);
    clock.vv[op.writer] = Math.max(clock.vv[op.writer] || 0, op.seq);
    clock.lamport = Math.max(clock.lamport, op.lamport);
    rows.push({ op_id: op.opId, schema_v: SCHEMA_VERSION, contract_v: op.v, device_id: String(op.writer || '').split('.')[0], writer: op.writer, seq: op.seq, lamport: op.lamport,
      kind: op.kind, entity_id: entityId_(op), ts_utc: iso_(op.wallAt, 0), ts_ist: iso_(op.wallAt, IST_MS), received_at_utc: iso_(now, 0), payload_json: JSON.stringify(op), vv_json: JSON.stringify(op.vv || {}) });
    var p = project_(op);
    if (p) (byTab[p[0]] = byTab[p[0]] || []).push(p[1]);
  });
  appendObjects_(sh, rows);
  for (var t in byTab) { var tsh = ss.getSheetByName(t); if (tsh) appendObjects_(tsh, byTab[t]); }
  saveClock_(clock);
  return fresh;
}

function appendObjects_(sh, objs) {
  if (!objs.length) return;
  var h = headers_(sh);
  var rows = objs.map(function (o) { return h.map(function (c) { return sanitizeCell_(o[c]); }); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows);
}

function okOp_(op) {
  return op && typeof op.opId === 'string' && typeof op.writer === 'string' && op.opId === op.writer + ':' + op.seq && typeof op.kind === 'string'
    && typeof op.seq === 'number' && typeof op.lamport === 'number' && typeof op.wallAt === 'number' && op.body && typeof op.body === 'object';
}

function push_(ops) {
  if (!Array.isArray(ops)) return { ok: false, error: 'ops must be a list' };
  if (ops.length > CFG.PUSH_MAX) return { ok: false, error: 'too many ops in one push' };
  if (ops.some(function (op) { return op && typeof op.v === 'number' && op.v < CONTRACT_VERSION; })) return { ok: false, error: 'update the app' };
  var good = ops.filter(okOp_);
  var lock = LockService.getScriptLock();
  lock.waitLock(CFG.LOCK_MS);
  try {
    var resend = gaps_(clock_().vv, good);
    var fresh = appendOps_(good);
    if (fresh.length) rebuild_();
    return { ok: true, stored: good.map(function (op) { return op.opId; }), resend: resend, schema_v: SCHEMA_VERSION, bridge: CFG.VERSION };
  } finally { lock.releaseLock(); }
}

function pull_(cursor) {
  var sh = ss_().getSheetByName('ops'); var h = headers_(sh);
  var pc = h.indexOf('payload_json') + 1; var rc = h.indexOf('received_at_utc') + 1;
  var total = Math.max(0, sh.getLastRow() - 1);
  var from = Math.max(0, Math.min(total, parseInt(cursor, 10) || 0));
  var n = Math.min(CFG.PULL_MAX, total - from); var ops = [];
  if (n > 0 && pc > 0) {
    var vals = sh.getRange(2 + from, 1, n, sh.getLastColumn()).getValues();
    for (var i = 0; i < vals.length; i++) {
      try { var op = JSON.parse(vals[i][pc - 1]); var r = rc ? Date.parse(vals[i][rc - 1]) : NaN; if (isFinite(r)) op.recvAt = r; ops.push(op); }
      catch (err) { ops.push(null); /* hand-edited row: the app drops invalid ops; the cursor still moves */ }
    }
  }
  return { ok: true, ops: ops.filter(function (x) { return x; }), cursor: String(from + n), schema_v: SCHEMA_VERSION, bridge: CFG.VERSION };
}

/** All ops with recvAt, for the fold. */
function readAllOps_() {
  var sh = ss_().getSheetByName('ops'); var h = headers_(sh); var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var pc = h.indexOf('payload_json'); var rc = h.indexOf('received_at_utc');
  return sh.getRange(2, 1, n, h.length).getValues().map(function (row) {
    try { var op = JSON.parse(row[pc]); var r = Date.parse(row[rc]); if (isFinite(r)) op.recvAt = r; return op; } catch (e) { return null; }
  }).filter(function (x) { return x; });
}

/** Rewrites every info tab from fold(log) and appends new clashes to the hidden conflicts tab. Caller holds the lock. */
function rebuild_() {
  var S = foldState_(readAllOps_());
  var rows = renderRows_(S); var ss = ss_();
  INFO_ORDER.forEach(function (tab) { var sh = ss.getSheetByName(tab); if (sh) writeInfo_(sh, tab, rows[tab] || []); });
  var csh = ss.getSheetByName('conflicts');
  if (csh) {
    var have = {}; var last = csh.getLastRow();
    if (last > 1) csh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[r[0]] = 1; });
    var now = iso_(Date.now(), 0);
    appendObjects_(csh, S.conflicts.filter(function (c) { return !have[c.winner + '>' + c.loser + '|' + c.target + '|' + c.field]; }).map(function (c) {
      return { conflict_id: c.winner + '>' + c.loser + '|' + c.target + '|' + c.field, detected_at_utc: now, target: c.target, field: c.field, rule: c.rule,
        winner_op_id: c.winner, loser_op_id: c.loser, winner_writer: c.winner_writer, loser_writer: c.loser_writer,
        winner_recv_at_utc: c.winner_recv ? iso_(c.winner_recv, 0) : '', loser_recv_at_utc: c.loser_recv ? iso_(c.loser_recv, 0) : '' };
    }));
  }
}

/** Writes rows by id, by header name. Keeps row order, extra columns Steve added, and rows the log doesn't know. */
function writeInfo_(sh, tab, objs) {
  var h = headers_(sh); var key = INFO[tab].key; var kc = h.indexOf(key);
  if (kc < 0) return;
  var n = Math.max(0, sh.getLastRow() - 1);
  var vals = n ? sh.getRange(2, 1, n, h.length).getValues() : [];
  var at = {}; vals.forEach(function (r, i) { if (r[kc] !== '') at[String(r[kc])] = i; });
  var known = {}; infoCols_(tab).forEach(function (c) { known[c[0]] = 1; });
  objs.forEach(function (o) {
    var i = at[String(o[key])];
    if (i === undefined) { i = vals.length; vals.push(h.map(function () { return ''; })); at[String(o[key])] = i; }
    h.forEach(function (c, j) { if (known[c] && o[c] !== undefined) vals[i][j] = sanitizeCell_(o[c]); });
  });
  if (vals.length) sh.getRange(2, 1, vals.length, h.length).setValues(vals);
}

/** Q-HARM-10 hand edits: a change on an info tab becomes ops from writer `sheet`, causally after everything synced
 * (vv = the Sheet's vector, lamport = its high-water mark + 1), then the tab is rewritten from the log. A simple
 * trigger: no setup needed; script writes never fire it. Rows typed without an id get one. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet(); var tab = sh.getName();
  if (!INFO[tab] || e.range.getLastRow() < 2) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(CFG.LOCK_MS);
  try {
    var h = headers_(sh); var key = INFO[tab].key; var kc = h.indexOf(key);
    var r1 = Math.max(2, e.range.getRow()); var r2 = e.range.getLastRow();
    var edited = h.slice(e.range.getColumn() - 1, e.range.getLastColumn());
    var vals = sh.getRange(r1, 1, r2 - r1 + 1, h.length).getValues();
    var clock = clock_(); var seq = Number(props_().getProperty('SHEET_SEQ') || 0); var ops = [];
    vals.forEach(function (row, i) {
      if (row.every(function (v) { return v === '' || v === false; })) return;
      var obj = {}; h.forEach(function (c, j) { obj[c] = row[j]; });
      var cols = edited.slice();
      if (kc >= 0 && obj[key] === '') {
        obj[key] = 'sh' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
        sh.getRange(r1 + i, kc + 1).setValue(obj[key]);
        var ac = h.indexOf('active');
        if (ac >= 0) { obj.active = true; sh.getRange(r1 + i, ac + 1).setValue(true); }
        cols = h.slice(); // a new row: every column it has is new
      }
      rowToOps_(tab, obj, cols).forEach(function (d) {
        seq += 1; clock.lamport += 1;
        var vv = {}; for (var w in clock.vv) vv[w] = clock.vv[w];
        ops.push({ v: CONTRACT_VERSION, opId: CFG.SHEET_WRITER + ':' + seq, writer: CFG.SHEET_WRITER, seq: seq, lamport: clock.lamport, vv: vv, wallAt: Date.now(), kind: d.kind, body: d.body });
        clock.vv[CFG.SHEET_WRITER] = seq;
      });
    });
    props_().setProperty('SHEET_SEQ', String(seq));
    if (ops.length) { appendOps_(ops); rebuild_(); }
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var want = props_().getProperty('STALL_KEY');
    if (!want) return reply_({ ok: false, error: 'STALL_KEY not set on the script' });
    if (body.key !== want) return reply_({ ok: false, error: 'wrong stall key' });
    ensureSchema_();
    if (body.action === 'push') return reply_(push_(body.ops));
    if (body.action === 'pull') return reply_(pull_(body.cursor));
    if (body.action === 'beat') return reply_(beat_(body));
    if (body.action === 'digest') return reply_({ ok: true, digest: digest_(readAllOps_()), bridge: CFG.VERSION });
    return reply_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** Heartbeat digest freshness check (Q-SYNC-GO, Q-GO-WHEN B). */
function digest_(ops) {
  var list = ops || [];
  var total = list.length;
  var vv = {};
  var hash = 0x811c9dc5;
  for (var i = 0; i < total; i++) {
    var op = list[i];
    if (op && op.writer) {
      if ((vv[op.writer] || 0) < op.seq) vv[op.writer] = op.seq;
      var str = op.opId || '';
      for (var j = 0; j < str.length; j++) {
        hash = (hash ^ str.charCodeAt(j)) * 0x01000193;
        hash = hash >>> 0;
      }
    }
  }
  return { total: total, vv: vv, checksum: hash.toString(16) };
}

/** Compaction plan dry-run (Q-SHEET-COMPACT A, P6). */
function compactPlan_(ops, nowMs) {
  var now = nowMs || Date.now();
  var limit = now - (60 * 86400000);
  var list = ops || [];
  if (!list.length) return { compactable: 0, oldestAgeDays: 0, plan: [] };
  var oldest = list[0];
  var oldestAgeDays = Math.round((now - (oldest.wallAt || now)) / 86400000);
  if (oldest.wallAt && oldest.wallAt > limit) {
    return { compactable: 0, oldestAgeDays: oldestAgeDays, reason: 'oldest op < 60 days', plan: [] };
  }
  var oldOps = list.filter(function (op) { return (op.wallAt || 0) <= limit; });
  return { compactable: oldOps.length, oldestAgeDays: oldestAgeDays, plan: ['backup_drive', 'generate_base_ops', 'archive_old_ops'] };
}

/** s127 presence (Q-TAKE-ALIVE A): "last heard from" per device, kept in the script cache, never in the Sheet or the op
 * log. Each phone sends {deviceId, label, orderId}; the reply lists every phone heard from in the last 10 minutes with
 * its age by the server clock (so a wrong phone clock changes nothing). */
function beat_(b) {
  var cache = CacheService.getScriptCache();
  var id = String(b.deviceId || '').slice(0, 64);
  if (!id) return { ok: false, error: 'no device' };
  var now = Date.now();
  cache.put('beat:' + id, JSON.stringify({ deviceId: id, label: String(b.label || '').slice(0, 60), orderId: String(b.orderId || '').slice(0, 64), at: now }), 600);
  var index = JSON.parse(cache.get('beat:index') || '[]');
  if (index.indexOf(id) < 0) { index.push(id); index = index.slice(-50); cache.put('beat:index', JSON.stringify(index), 21600); }
  var got = cache.getAll(index.map(function (d) { return 'beat:' + d; }));
  var seen = [];
  for (var k in got) { var x = JSON.parse(got[k]); seen.push({ deviceId: x.deviceId, label: x.label, orderId: x.orderId, ageMs: Math.max(0, now - x.at) }); }
  return { ok: true, seen: seen, bridge: CFG.VERSION };
}

function doGet() { return reply_({ ok: true, app: 'stall-tokens-bridge', protocol: 2, bridge: CFG.VERSION, schema_v: SCHEMA_VERSION }); }

/** Run once from the editor after pasting (optional): sets up tabs now instead of on the first phone sync. */
function setup() { props_().deleteProperty('SCHEMA_DONE'); ensureSchema_(); var lock = LockService.getScriptLock(); lock.waitLock(CFG.LOCK_MS); try { rebuild_(); } finally { lock.releaseLock(); } }

function reply_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

if (typeof module !== 'undefined') module.exports = { TABS: TABS, INFO: INFO, INFO_ORDER: INFO_ORDER, LOG_TABS: LOG_TABS, VIEWS: VIEWS, SCHEMA_VERSION: SCHEMA_VERSION, CFG: CFG, project_: project_, iso_: iso_, foldState_: foldState_, renderRows_: renderRows_, rowToOps_: rowToOps_, gaps_: gaps_, infoCols_: infoCols_, digest_: digest_, compactPlan_: compactPlan_ };
