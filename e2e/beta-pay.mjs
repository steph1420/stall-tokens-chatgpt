// Payment balance hotfix e2e (local demo data only). Usage: node e2e/beta-pay.mjs <outdir>  (BETA_URL to point at a local preview)
// pay2 (locked 17 Nov): Cash + UPI always equal the amount due; + Tip / − Waive (quick chips, Undo) are the only way to change it;
// pay3: padlock on Cash / UPI (unlocked side absorbs tip/waive, clamp toast, slider rests) and the calculator sheet.
import { chromium } from '@playwright/test';
import { demoOps } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const results = [];
const rec = (name, ok, ev = '') => { results.push({ name, ok, ev }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${ev}`); };
const step = async (name, f) => { try { const ev = await f(); rec(name, ev !== false, typeof ev === 'string' ? ev : ''); } catch (e) { rec(name, false, String(e.message ?? e).split('\n')[0]); } };
const rupees = (t) => Number(String(t).replace(/[^0-9.]/g, '') || 'NaN');
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? undefined : '/usr/bin/google-chrome'), args: ['--no-sandbox'] });

async function seed(p, theme) {
  await p.evaluate(async ({ theme, ops }) => {
    localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify({ deviceId: `pay${theme}0001`, theme, servingName: 'Server-A', haptics: 'off' }));
    await new Promise((res, rej) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' });
      r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  }, { theme, ops: demoOps() });
}

for (const theme of (process.env.THEMES ?? 'night,day').split(',')) {
  const ctx = await b.newContext({ viewport: { width: 421, height: 927 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const T = (n) => `[${theme}] ${n}`;
  const shot = (n) => p.screenshot({ path: `${out}/pay-${n}-${theme}.png` });
  const box = async (n) => rupees(await p.getByRole('button', { name: new RegExp(`^${n} ₹`) }).innerText());
  const total = async () => rupees(await p.evaluate(() => [...globalThis.document.querySelectorAll('div')].find((d) => d.textContent === 'To collect')?.nextElementSibling?.textContent ?? ''));
  const type = async (n, digits) => {
    await p.getByRole('button', { name: new RegExp(`^${n} ₹`) }).click();
    for (const k of digits.split('')) await p.getByRole('button', { name: k, exact: true }).click();
    await p.getByRole('button', { name: 'Done', exact: true }).click(); await p.waitForTimeout(150);
  };
  const clear = async (n) => {
    await p.getByRole('button', { name: new RegExp(`^${n} ₹`) }).click();
    for (let i = 0; i < 6; i++) await p.getByRole('button', { name: 'Delete', exact: true }).click();
    await p.getByRole('button', { name: 'Done', exact: true }).click(); await p.waitForTimeout(150);
  };
  const slideTo = async (f) => { const r = await p.getByRole('slider').boundingBox(); await p.mouse.click(r.x + r.width * f, r.y + r.height / 2); await p.waitForTimeout(150); };
  const waivedShown = async () => /₹/.test(await p.getByRole('button', { name: /^− Waive/ }).innerText());
  const state = async () => { const [c, u, t] = [await box('Cash'), await box('UPI'), await total()]; return { c, u, t, ok: c + u === t && !(await waivedShown()) }; };
  const ev = (x) => `₹${String(x.c)} cash + ₹${String(x.u)} UPI = ₹${String(x.t)}, no waive`;

  await p.goto(BETA); await seed(p, theme); await p.reload(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: /counter/i }).first().click();
  for (const [n, k] of [['Tea', 4], ['Samosa', 3]]) for (let i = 0; i < k; i++) await p.getByRole('button', { name: new RegExp(`^${n}, add one`) }).first().click();
  await p.getByRole('button', { name: /^Bill|items/ }).last().click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /^Pay/ }).first().click(); await p.waitForTimeout(300);
  const t0 = await total();
  await step(T('pay5: opens with Cash | UPI | Split, nothing selected'), async () => {
    const g = p.getByRole('group', { name: 'How to pay' });
    const pressed = await Promise.all(['Cash ₹', 'UPI ₹', 'Split'].map(async (n) => g.getByRole('button', { name: n === 'Split' ? 'Split' : new RegExp(`^${n}`) }).getAttribute('aria-pressed')));
    const confirm = await p.getByRole('button', { name: 'Confirm payment' }).count();
    await shot('10-pay5-open');
    return pressed.every((v) => v === 'false') && confirm === 0 ? 'none selected' : false;
  });
  await step(T('pay5: Cash takes the whole amount; Count notes starts hidden'), async () => {
    await p.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: /^Cash ₹/ }).click(); await p.waitForTimeout(150);
    const confirm = await p.getByRole('button', { name: 'Confirm payment' }).count();
    const qr = await p.locator('[data-qr]').count();
    const expanded = await p.getByRole('button', { name: 'Count notes' }).getAttribute('aria-expanded');
    await shot('11-pay5-cash');
    return confirm === 1 && qr === 0 && expanded === 'false' ? 'all cash, notes hidden' : false;
  });
  await step(T('pay5: UPI shows the QR with the ID and amount straight away'), async () => {
    await p.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: 'UPI', exact: true }).click(); await p.waitForTimeout(200);
    const facts = await p.getByRole('group', { name: 'UPI ID and amount on this QR' }).innerText();
    const qr = await p.locator('[data-qr]').count();
    await shot('12-pay5-upi');
    return qr === 1 && /stallone@okbank/.test(facts) ? facts.replace(/\s+/g, ' ') : false;
  });
  await p.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: 'Split', exact: true }).click(); await p.waitForTimeout(200);
  await shot('13-pay5-split');
  await step(T('pay4: + Tip looks and works like − Waive (₹10, ₹20, Other)'), async () => {
    const tipP = p.getByRole('button', { name: /^\+ Tip/ }), waiveP = p.getByRole('button', { name: /^− Waive/ });
    const [a, w] = [await tipP.boundingBox(), await waiveP.boundingBox()];
    await tipP.click(); await p.waitForTimeout(150); await shot('00-tip-chips');
    const tipChips = (await p.getByRole('group', { name: 'Tip' }).getByRole('button').allInnerTexts()).map((x) => x.replace(/\s+/g, ''));
    const extra = await p.getByRole('button', { name: /No tip|Edit tip/ }).count();
    await tipP.click(); await waiveP.click(); await p.waitForTimeout(150);
    const wChips = (await p.getByRole('group', { name: 'Waive' }).getByRole('button').allInnerTexts()).map((x) => x.replace(/\s+/g, ''));
    await waiveP.click();
    const same = Math.abs(a.height - w.height) < 1 && Math.abs(a.width - w.width) < 1 && Math.abs(a.y - w.y) < 1;
    return same && extra === 0 && tipChips.join() === '₹10,₹20,Other' && wChips.join() === tipChips.join() ? `side by side, both ${String(Math.round(a.width))}×${String(Math.round(a.height))}px; Tip: ${tipChips.join(' ')}; Waive: ${wChips.join(' ')}` : false;
  });
  await step(T('waive Other keeps the picker open; Allowed by is a note, not on the chips'), async () => {
    await p.getByRole('button', { name: /^− Waive/ }).click(); await p.waitForTimeout(150);
    const who = await p.getByRole('button', { name: /Who/ }).count();
    await p.getByRole('button', { name: 'Other', exact: true }).click(); await p.waitForTimeout(150);
    const openPad = await p.getByRole('group', { name: 'Waive' }).count() && await p.getByRole('dialog', { name: 'Number pad' }).count();
    await p.getByRole('button', { name: '3', exact: true }).click();
    await p.getByRole('button', { name: '0', exact: true }).click();
    const still = await p.getByRole('group', { name: 'Waive' }).count();
    await shot('02-waive-other');
    await p.getByRole('button', { name: 'Done' }).click(); await p.waitForTimeout(200);
    const note = p.getByRole('button', { name: /₹30 waived · Allowed by Choose/ });
    await note.waitFor();
    await shot('03-waive-note');
    const label = await note.getAttribute('aria-label');
    // clear the waive so later cash/UPI steps still use the original total
    await p.getByRole('button', { name: '₹30', exact: true }).click(); await p.waitForTimeout(150);
    return who === 0 && openPad && still === 1 && label === '₹30 waived · Allowed by Choose' ? label : false;
  });

  await step(T('type Cash: UPI becomes the balance'), async () => { await type('Cash', '50'); const x = await state(); return x.ok && x.c === 50 && x.u === t0 - 50 ? ev(x) : false; });
  await step(T('type UPI: Cash becomes the balance'), async () => { await type('UPI', '40'); const x = await state(); return x.ok && x.u === 40 && x.c === t0 - 40 ? ev(x) : false; });
  await step(T('slider then type Cash (Steve\'s case): UPI follows, no "Waived"'), async () => {
    await slideTo(0.85); const s0 = await state(); await type('Cash', '30'); const x = await state(); await shot('01-slider-then-type');
    return s0.ok && x.ok && x.c === 30 && x.u === t0 - 30 ? `after slider ${ev(s0)}; then ${ev(x)}` : false;
  });
  await step(T('type then slider: still adds up'), async () => { await type('UPI', '20'); await slideTo(0.3); const x = await state(); return x.ok ? ev(x) : false; });
  await step(T('Cash over the total is clamped to it (pay3: no change-due box)'), async () => {
    await type('Cash', String(t0 + 100)); const x = await state();
    const gone = (await p.getByText(/Give back|given/).count()) === 0;
    return x.ok && x.c === t0 && x.u === 0 && gone ? `${ev(x)}; no Cash given row` : false;
  });
  await step(T('UPI over the total is clamped to the total'), async () => { await type('UPI', String(t0 + 500)); const x = await state(); return x.ok && x.u === t0 && x.c === 0 ? ev(x) : false; });
  await step(T('clear a field: the other takes the whole amount'), async () => { await clear('UPI'); const x = await state(); return x.ok && x.c === t0 && x.u === 0 ? ev(x) : false; });
  await step(T('− Waive ₹10: amount due drops, boxes still add up; Undo puts it back'), async () => {
    await type('UPI', '30'); await p.getByRole('button', { name: /^− Waive/ }).click();
    await p.getByRole('group', { name: 'Waive' }).getByRole('button').first().click(); await p.waitForTimeout(150); await shot('03-waive');
    const t1 = await total(); const [c1, u1] = [await box('Cash'), await box('UPI')];
    await p.getByRole('status').getByRole('button', { name: 'Undo' }).click(); await p.waitForTimeout(150);
    const t2 = await total();
    return t1 === t0 - 10 && c1 + u1 === t1 && u1 === 30 && t2 === t0 ? `due ₹${String(t0)} → ₹${String(t1)} (₹${String(c1)} + ₹${String(u1)}) → Undo ₹${String(t2)}` : false;
  });
  const locked = async (n) => (await p.getByRole('button', { name: `Unlock ${n}` }).count()) > 0;
  const sum = async () => { const [c, u, t] = [await box('Cash'), await box('UPI'), await total()]; return { c, u, t, ok: c + u === t }; };
  const say = (x) => `₹${String(x.c)} + ₹${String(x.u)} = ₹${String(x.t)}`;
  await step(T('lock UPI at ₹30, + Tip ₹10: UPI stays, Cash absorbs it'), async () => {
    await type('UPI', '30'); await p.getByRole('button', { name: 'Lock UPI' }).click();
    await p.getByRole('button', { name: /^\+ Tip/ }).click();
    await p.getByRole('group', { name: 'Tip' }).getByRole('button').first().click(); await p.waitForTimeout(150); await shot('04-lock-tip');
    const x = await sum();
    return x.ok && x.u === 30 && x.t === t0 + 10 && (await locked('UPI')) ? say(x) : false;
  });
  await step(T('the slider rests while a side is locked'), async () => {
    const x0 = await sum(); const dis = await p.getByRole('slider').getAttribute('aria-disabled'); await slideTo(0.2); const x = await sum();
    return dis === 'true' && x.c === x0.c && x.u === x0.u ? `aria-disabled; still ${say(x)}` : false;
  });
  await step(T('lock Cash at the full amount, − Waive ₹20: Cash lowered to fit with a calm toast'), async () => {
    await p.getByRole('button', { name: 'Lock Cash' }).click();
    const lockSwap = !(await locked('UPI'));
    await type('Cash', String(t0 + 10));
    await p.getByRole('button', { name: /^− Waive/ }).click();
    await p.getByRole('group', { name: 'Waive' }).getByRole('button').nth(1).click(); await p.waitForTimeout(150);
    const toast = await p.getByRole('status').innerText(); await shot('05-lock-clamp');
    const x = await sum();
    return lockSwap && x.ok && x.t === t0 - 10 && x.c === x.t && x.u === 0 && /lowered to fit/.test(toast) ? `${say(x)}; "${toast.replace(/\s+/g, ' ')}"` : false;
  });
  await step(T('calculator: 12 ÷ 0 is safe, 30 × 2 = 60, order untouched; Use as UPI puts it in and locks it'), async () => {
    const x0 = await sum();
    await p.getByRole('button', { name: 'Calculator' }).click(); await p.waitForTimeout(250);
    const keys = async (...k) => { for (const n of k) await p.getByRole('button', { name: n, exact: true }).click(); };
    await keys('1', '2', 'Divide', '0', 'Equals');
    const z = (await p.getByText("Can't divide by 0").count()) > 0;
    await keys('3', '0', 'Times', '2', 'Equals'); await shot('06-calc');
    const r = await p.getByLabel('Result').innerText();
    const x1 = await sum();
    await p.getByRole('button', { name: 'Use as UPI' }).click(); await p.waitForTimeout(200);
    const x = await sum();
    return z && r === '60' && x1.c === x0.c && x.ok && x.u === Math.min(60, x.t) && (await locked('UPI')) ? `÷0 message; 30×2 = ${r}; Use as UPI → ${say(x)}` : false;
  });
  await step(T('Confirm payment records it'), async () => {
    await p.getByRole('button', { name: 'Confirm payment' }).click(); await p.waitForTimeout(400);
    return (await p.getByText(/Paid ✓|Paid$/).count()) > 0 ? 'Paid shown' : false;
  });
  await step(T('no page errors'), async () => (errors.length === 0 ? 'none' : errors.join('; ')));
  await ctx.close();
}
await b.close();
const pass = results.filter((r) => r.ok).length;
console.log(`SUMMARY ${String(pass)}/${String(results.length)} pass`);
process.exit(pass === results.length ? 0 : 1);
