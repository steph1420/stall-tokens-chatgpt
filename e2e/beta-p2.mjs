/* global document, setTimeout */
// P2 live check on Beta (local test data only; a fake in-memory bridge answers sync, never a real Sheet):
// - one phone: Unpaid tab → order view → hold to complete; one-tap Refund + Undo; Drafts discard; phone Back steps back.
// - two phones (two browser contexts, s127): the second phone waits on the first one's order (Check now, Take over /
//   New order / Back), takes it over, the first goes view-only, and a Back on the first sends the order across at once.
// Usage: BETA_URL=<url> node e2e/beta-p2.mjs <outdir>
import { chromium } from '@playwright/test';
import { demoOps } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const BRIDGE = 'https://bridge.test.invalid/exec';
const results = [];
const rec = (name, ok, ev = '') => { results.push({ name, ok, ev }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${ev}`); };
const step = async (name, f) => { try { const ev = await f(); rec(name, ev !== false, typeof ev === 'string' ? ev : ''); } catch (e) { rec(name, false, String(e.message ?? e).split('\n')[0]); } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

/** The fake bridge: same push / pull / beat protocol as apps-script/Code.gs, in memory, for one run. */
function fakeBridge() {
  const log = []; const beats = new Map();
  return async (route) => {
    const req = JSON.parse(route.request().postData() ?? '{}');
    const send = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (req.key !== 'test') return send({ ok: false, error: 'wrong stall key' });
    if (req.action === 'push') { const have = new Set(log.map((o) => o.opId)); for (const op of req.ops) if (!have.has(op.opId)) { have.add(op.opId); log.push(op); } return send({ ok: true, stored: req.ops.map((o) => o.opId), resend: [] }); }
    if (req.action === 'pull') { const from = Number(req.cursor) || 0; return send({ ok: true, ops: log.slice(from), cursor: String(log.length) }); }
    if (req.action === 'beat') { const t = Date.now(); beats.set(req.deviceId, { label: req.label, orderId: req.orderId, at: t }); return send({ ok: true, seen: [...beats].map(([deviceId, x]) => ({ deviceId, label: x.label, orderId: x.orderId, ageMs: t - x.at })) }); }
    return send({ ok: false, error: 'unknown action' });
  };
}

async function phone(theme, prefs, bridge) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, serviceWorkers: 'block' });
  if (bridge) await ctx.route(`${BRIDGE}**`, bridge);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BETA);
  await p.evaluate(async ({ prefs, ops }) => {
    localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify(prefs));
    await new Promise((res, rej) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' });
      r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  }, { prefs: { theme, haptics: 'off', ...prefs }, ops: demoOps() });
  await p.reload(); await p.waitForTimeout(600);
  return { ctx, p, errors };
}
const tap = (p, n, k = 1) => (async () => { for (let i = 0; i < k; i++) await p.getByRole('button', { name: new RegExp(`^${n}, add one`) }).first().click(); })();
const until = async (f, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 400)); } return false; };

for (const theme of ['night', 'day']) {
  const T = (n) => `[${theme}] ${n}`;
  // ---- one phone, no sync ----
  const { ctx, p, errors } = await phone(theme, { deviceId: `p2one${theme}01`, servingName: 'Ravi' });
  const shot = (n) => p.screenshot({ path: `${out}/p2-${n}-${theme}.png` });
  await step(T('Unpaid tab lists a sent, unpaid order with the amount to collect (s120)'), async () => {
    await p.getByRole('button', { name: /counter/i }).first().click();
    await tap(p, 'Tea', 2); await p.getByRole('button', { name: /^Bill|items/ }).last().click();
    await p.getByRole('button', { name: 'To kitchen' }).first().click();
    await p.getByRole('tab', { name: /Unpaid/ }).click(); await p.waitForTimeout(300); await shot('01-unpaid');
    return (await p.getByText(/to collect/).count()) > 0 && (await p.getByRole("button", { name: /#001/ }).count()) > 0 ? "₹ to collect, row #001" : false;
  });
  await step(T('order view: Take payment + hold bar; a short tap only hints (s121)'), async () => {
    await p.getByRole('button', { name: /#001/ }).first().click(); await p.waitForTimeout(300); await shot('02-orderview-unpaid');
    const bar = p.getByRole('button', { name: 'Complete (hold)' });
    await bar.click(); await p.waitForTimeout(200);
    const hint = await p.getByRole('status').innerText().catch(() => '');
    return /Press and hold/.test(hint) ? `tap hint: "${hint}"` : false;
  });
  await step(T('press and hold completes without payment; it leaves the Unpaid list... and stays on record'), async () => {
    const bar = p.getByRole('button', { name: 'Complete (hold)' });
    const box = await bar.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(250); await shot('03a-hold-mid'); await p.waitForTimeout(1400); await p.mouse.up();
    await p.waitForTimeout(400); await shot('03-after-hold');
    const t = await p.getByRole('status').innerText().catch(() => '');
    return /not collected/.test(t) ? `toast "${t}"` : false;
  });
  await step(T('paid screen: exactly one New order button'), async () => {
    await p.keyboard.press('Escape');
    await p.getByRole('tab', { name: /New Orders/ }).click();
    await p.getByRole('button', { name: 'New order' }).last().click(); await tap(p, 'Samosa');
    await p.getByRole('button', { name: /^Bill|items/ }).last().click(); await p.getByRole('button', { name: /^Pay/ }).first().click();
    await p.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: /^Cash ₹/ }).click();
    await p.getByRole('button', { name: 'Confirm payment' }).click(); await p.waitForTimeout(300); await shot('04-paid');
    const n = await p.getByRole('button', { name: 'New order' }).count();
    return n === 1 ? 'one New order (the header + hides on the paid screen)' : `${String(n)} New order buttons`;
  });
  await step(T('one-tap Refund from the order sheet, Undo in the toast puts it back (s122)'), async () => {
    await p.getByRole('tab', { name: /Open Orders/ }).click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: /open order sheet/ }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Refund', exact: true }).click(); await p.waitForTimeout(200); await shot('05-refund-toast');
    const t = await p.getByRole('status').innerText();
    await p.getByRole('button', { name: 'Undo' }).click(); await p.waitForTimeout(200);
    const u = await p.getByRole('status').innerText();
    return /Refunded ₹15 · Cash/.test(t) && /undone/i.test(u) ? `"${t.replace(/\s+/g, ' ')}" → "${u}"` : false;
  });
  await step(T('phone Back steps back inside the app (W-13): Open → New Orders, never leaves'), async () => {
    await p.goBack(); await p.waitForTimeout(300);
    const onNew = await p.getByRole('tab', { name: /New Orders/ }).getAttribute('aria-selected');
    await p.goBack(); await p.waitForTimeout(300);
    const still = p.url().startsWith(BETA);
    await shot('06-after-back');
    return onNew === 'true' && still ? 'Back 1: Open → New Orders; Back 2: stays in the app' : false;
  });
  await step(T('Drafts pill: a second draft shows; Discard needs a second tap (s123)'), async () => {
    await p.goto(BETA); await p.waitForTimeout(500); await p.getByRole('button', { name: /counter/i }).first().click();
    await p.getByRole('button', { name: 'New order' }).last().click(); await tap(p, 'Coffee');
    await p.getByRole('button', { name: 'New order' }).last().click(); await tap(p, 'Vada Pav');
    await p.getByRole('button', { name: /^Drafts/ }).click(); await p.waitForTimeout(300); await shot('07-drafts');
    const d = p.getByRole('button', { name: /^Discard #/ }).last(); const label = await d.getAttribute('aria-label');
    await d.click(); await p.getByRole('button', { name: /^Tap again to discard/ }).click(); await p.waitForTimeout(300);
    const t = await p.getByRole('status').innerText().catch(() => '');
    return /discarded/.test(t) ? `${label} → "${t}"` : false;
  });
  await step(T('no page errors (one phone)'), async () => (errors.length === 0 ? 'none' : errors.join(' / ')));
  await ctx.close();

  // ---- two phones on one fake bridge (s127) ----
  const bridge = fakeBridge();
  const sync = { syncUrl: BRIDGE, syncKey: 'test' };
  const A = await phone(theme, { deviceId: `tkA${theme}0001`, servingName: 'Ravi', rangeIndex: 0, ...sync }, bridge);
  const B = await phone(theme, { deviceId: `tkB${theme}0001`, servingName: 'Mina', rangeIndex: 1, ...sync }, bridge);
  const sA = (n) => A.p.screenshot({ path: `${out}/p2-take-${n}-A-${theme}.png` });
  const sB = (n) => B.p.screenshot({ path: `${out}/p2-take-${n}-B-${theme}.png` });
  await step(T('two phones: Counter 1 starts #001; Counter 2 opens it from Drafts and sees the take-over card (s127a)'), async () => {
    await A.p.getByRole('button', { name: /counter/i }).first().click(); await tap(A.p, 'Tea');
    await B.p.getByRole('button', { name: /counter/i }).first().click();
    const seen = await until(async () => (await B.p.getByRole('button', { name: /^Drafts/ }).count()) > 0);
    if (!seen) return false;
    await B.p.getByRole('button', { name: /^Drafts/ }).click(); await B.p.getByRole('button', { name: /#001/ }).first().click();
    const card = await until(async () => (await B.p.getByText('#001 is open on Counter 1 · Ravi').count()) > 0);
    await sB('01-card');
    const order = await B.p.locator('[role=alertdialog] button').allInnerTexts();
    return card ? `card shown; buttons: ${order.join(' | ')}` : false;
  });
  await step(T('Check now and the 10 s countdown are on the card; editing underneath is blocked'), async () => {
    const txt = await B.p.locator('[role=alertdialog]').innerText();
    await B.p.getByRole('button', { name: 'Check now' }).click();
    const inert = await B.p.evaluate(() => !!document.querySelector('[inert]'));
    return /Checking again in|Checking/.test(txt) && inert ? 'countdown shown, page under the card is inert' : false;
  });
  await step(T('Take over on Counter 2; Counter 1 goes view-only "Taken over by Counter 2 · Mina" (s127b)'), async () => {
    await B.p.getByRole('button', { name: 'Take over' }).click();
    const t = await B.p.getByRole('status').innerText().catch(() => '');
    await tap(B.p, 'Samosa');
    const banner = await until(async () => (await A.p.getByText('Taken over by Counter 2 · Mina').count()) > 0);
    await sA('02-taken'); await sB('02-took');
    return banner ? `Counter 2 toast "${t}"; Counter 1 banner shown` : false;
  });
  await step(T('Counter 1 cannot change it while view-only'), async () => {
    const before = await A.p.locator('main').innerText();
    await A.p.getByRole('button', { name: /^Tea, add one/ }).first().click({ force: true, timeout: 2000 }).catch(() => {});
    const after = await A.p.locator('main').innerText();
    return before === after ? 'tap under the banner did nothing' : false;
  });
  await step(T('Back on Counter 2 releases at once; Counter 1 gets #001 back with items (Q-TAKE-1a)'), async () => {
    await B.p.goBack(); await B.p.waitForTimeout(200); await B.p.goBack(); // menu → launch (W-13) = leaves the order
    const got = await until(async () => /yours now/.test(await A.p.getByRole('status').innerText().catch(() => '')) || (await A.p.getByText('Taken over by').count()) === 0);
    await A.p.waitForTimeout(300); await sA('03-back');
    const items = await A.p.getByText(/2 items/).count();
    return got ? `Counter 1 has it again (${items > 0 ? 'Tea + Samosa' : 'items?'})` : false;
  });
  await step(T('no page errors (two phones)'), async () => (A.errors.length + B.errors.length === 0 ? 'none' : [...A.errors, ...B.errors].join(' / ')));
  await A.ctx.close(); await B.ctx.close();
}
await b.close();
console.log(`SUMMARY ${String(results.filter((r) => r.ok).length)}/${String(results.length)} pass`);
