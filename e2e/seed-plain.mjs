// Plain-JS twin of seed.ts demo ops for the screenshot script (keep in step with src/mock/fixtures.ts).
const menu = [['tea','Tea',2000,0,'Tea','Beverages',24],['coffee','Coffee',3000,1,'Tea','Beverages',null],['samosa','Samosa',1500,2,'Snacks','Cutlets',null],
  ['vadapav','Vada Pav',2500,3,'Snacks','Sandwiches',null],['colddrink','Cold Drink',4000,4,'Drinks','Beverages',3],['sandwich','Sandwich',5000,5,'Snacks','Sandwiches',0]];
export function demoOps() {
  let seq = 0; const mk = (kind, body) => { seq += 1; return { v: 2, opId: `seed0000.p:${seq}`, writer: 'seed0000.p', seq, lamport: seq, vv: {}, wallAt: 1700000000000 + seq, kind, body }; };
  return [...menu.map(([itemId, name, price, swatch, category, stationId, count], i) => mk('item.set', { itemId, fields: { name, price, swatch, category, stationId, count, order: i + 1, lowAt: 5, soldOut: false, removed: false } })),
    mk('payee.set', { payeeId: 'p1', name: 'Stall One', upiId: 'stallone@okbank', removed: false }), mk('setting.set', { key: 'stallName', value: 'Fair stall' })];
}
/** P4 (F-64..F-68): today's day with a ₹500 float, five orders (paid cash, unpaid, paid then refunded, paid UPI then cancelled,
 * written off) and both Extras switches on. Tokens #001-#005. */
export function p4Ops(now = Date.now()) {
  const label = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  const dayId = `${label}-p4d1`;
  let seq = 0; const mk = (kind, body) => { seq += 1; return { v: 2, opId: `seedp400.p:${seq}`, writer: 'seedp400.p', seq, lamport: 100 + seq, vv: {}, wallAt: now - 3_600_000 + seq * 60_000, kind, body }; };
  const price = Object.fromEntries(menu.map(([id, name, p, , cat, st]) => [id, { name, p, cat, st }]));
  const ops = [mk('day.start', { dayId, label }), mk('setting.set', { key: `float:${dayId}`, value: '50000' }),
    mk('setting.set', { key: 'extra:closeDay', value: '1' }), mk('setting.set', { key: 'extra:historySearch', value: '1' })];
  const order = (n, items, pay) => {
    const orderId = `p4o${String(n)}`;
    ops.push(mk('order.create', { orderId, dayId, token: n, servedBy: 'Ravi' }));
    let total = 0;
    items.forEach(([id, qty], i) => { const it = price[id]; total += it.p * qty; ops.push(mk('line.add', { orderId, lineId: `${orderId}l${String(i)}`, itemId: id, name: it.name, price: it.p, category: it.cat, stationId: it.st, qty })); });
    ops.push(mk('order.send', { orderId }));
    if (pay) ops.push(mk('payment.add', { paymentId: `${orderId}p`, orderId, cash: pay === 'cash' ? total : 0, upi: pay === 'upi' ? total : 0, upiPayeeId: null, tip: 0, waived: 0, waivedBy: '', waivedNote: '', cashGiven: 0, notes: {} }));
    return { orderId, total };
  };
  order(1, [['tea', 2]], 'cash');
  order(2, [['vadapav', 1]], null);
  const r = order(3, [['samosa', 1]], 'cash');
  ops.push(mk('refund.add', { refundId: 'p4r3', orderId: r.orderId, amount: r.total, source: 'cash', reason: 'Not happy', lines: [], restock: false }));
  const c = order(4, [['tea', 1]], 'upi');
  ops.push(mk('order.cancel', { orderId: c.orderId, reason: 'Changed mind' }));
  const w = order(5, [['coffee', 1]], null);
  ops.push(mk('order.complete', { orderId: w.orderId, unpaid: true, dueAt: w.total, reason: '' }));
  return ops;
}
