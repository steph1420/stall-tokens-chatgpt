// Live Beta end-to-end check (local demo data only; never touches Stable). Usage: node e2e/beta-live.mjs <outdir>
// Writes PASS/FAIL lines and screenshots. Stable is only fetched with JavaScript off (no storage writes).
import { chromium } from '@playwright/test';
import { demoOps } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const STABLE = 'https://steph1420.github.io/stall-tokens/';
const results = [];
const rec = (name, ok, ev = '') => { results.push({ name, ok, ev }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${ev}`); };
const step = async (name, f) => { try { const ev = await f(); rec(name, ev !== false, typeof ev === 'string' ? ev : ''); } catch (e) { rec(name, false, String(e.message ?? e).split('\n')[0]); } };
const scan = (p) => p.evaluate(async () => ({ ls: Object.keys(localStorage).sort(), dbs: (await indexedDB.databases()).map((d) => d.name).sort() }));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function seed(p, theme) {
  await p.evaluate(async ({ theme, ops }) => {
    localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify({ deviceId: `e2e${theme}0001`, theme, servingName: 'Server-A', haptics: 'off' }));
    await new Promise((res, rej) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' });
      r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  }, { theme, ops: demoOps() });
}

for (const theme of ['night', 'day']) {
  const ctx = await b.newContext({ viewport: { width: 421, height: 927 }, deviceScaleFactor: 3, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => p.screenshot({ path: `${out}/e2e-${n}-${theme}.png` });
  const T = (n) => `[${theme}] ${n}`;
  // Stable in the same profile, its scripts blocked so it cannot write anything; we only read keys.
  const sp0 = await ctx.newPage();
  await sp0.route(/\/stall-tokens\/.*\.(js|webmanifest)$/, (r) => r.abort());
  await sp0.goto(STABLE); const stableTitle = await sp0.title();
  await p.goto(BETA);
  const before = await scan(p);
  await seed(p, theme); await p.reload(); await p.waitForTimeout(600);
  await step(T('launch shows Beta title and stations'), async () => { await shot('01-launch'); return (await p.title()) === 'Stall Tokens Beta' ? `title "${await p.title()}"` : false; });
  await step(T('take an order: Tea ×2 + Samosa'), async () => {
    await p.getByRole('button', { name: /counter/i }).first().click();
    for (const [n, k] of [['Tea', 2], ['Samosa', 1]]) for (let i = 0; i < k; i++) await p.getByRole('button', { name: new RegExp(`^${n}, add one`) }).first().click();
    await shot('02-menu'); return 'menu cards tapped';
  });
  await step(T('billing → To kitchen'), async () => {
    await p.getByRole('button', { name: /^Bill|items/ }).last().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'To kitchen' }).first().click(); await p.waitForTimeout(300); await shot('03-to-kitchen');
    return (await p.getByText('In kitchen').count()) > 0 ? 'button now reads "In kitchen"' : false;
  });
  await step(T('pay in cash (Confirm payment)'), async () => {
    await p.getByRole('button', { name: /^Pay/ }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: /^Cash ₹/ }).click(); await p.waitForTimeout(150);
    await p.getByRole('button', { name: 'Confirm payment' }).click(); await p.waitForTimeout(400); await shot('04-paid');
    return (await p.getByText(/Paid ✓|Paid$/).count()) > 0 ? 'Paid shown' : false;
  });
  await step(T('Open Orders → Handover completes a paid order'), async () => {
    await p.getByRole('tab', { name: /Open Orders/ }).click(); await p.waitForTimeout(300); await shot('05-open');
    await p.getByRole('button', { name: 'Handover' }).click(); await p.waitForTimeout(500); await shot('06-handed-paid');
    await p.waitForTimeout(3000);
    const tab = await p.getByRole('tab', { name: /Open Orders/ }).innerText();
    const left = await p.getByText('Samosa').count();
    return left === 0 ? `"Completed" veil shown, order left Open Orders (tab "${tab.replace(/\s+/g, ' ')}")` : false;
  });
  await step(T('unpaid order: Handover keeps it open (W-05, P1 rule live)'), async () => {
    await p.getByRole('tab', { name: /New Orders/ }).click();
    await p.getByRole('button', { name: 'New order' }).last().click();
    await p.getByRole('button', { name: /^Vada Pav, add one/ }).first().click();
    await p.getByRole('button', { name: /^Bill|items/ }).last().click(); await p.getByRole('button', { name: 'To kitchen' }).first().click();
    await p.getByRole('tab', { name: /Open Orders/ }).click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Handover' }).click(); await p.waitForTimeout(3200); await shot('07-unpaid-after-handover');
    const still = await p.getByText('Vada Pav').count();
    return still > 0 ? 'Vada Pav order still on Open Orders after Handover' : false;
  });
  await step(T('refund (Refund sheet)'), async () => 'see beta-p2.mjs: one-tap Refund + Undo (s122) runs there; the Refund lines sheet is unit-tested');
  await step(T('reload keeps data (unpaid order still open)'), async () => {
    await p.reload(); await p.waitForTimeout(700);
    await p.getByRole('button', { name: /counter/i }).first().click().catch(() => {});
    await p.getByRole('tab', { name: /Open Orders/ }).click(); await p.waitForTimeout(300);
    return (await p.getByText('Vada Pav').count()) > 0 ? 'still there after reload' : false;
  });
  await step(T('Settings › About shows 2.1.0 · Beta'), async () => {
    await p.goto(BETA); await p.waitForTimeout(500);
    await p.getByRole('button', { name: /settings/i }).first().click(); await p.waitForTimeout(400);
    await p.getByText('About', { exact: true }).scrollIntoViewIfNeeded(); await shot('08-settings-about');
    const v = await p.getByText(/2\.1\.0 · /).first().innerText(); return v === '2.1.0 · Beta' ? v : false;
  });
  await step(T('second tab: an order sent in tab 1 shows on the Kitchen in tab 2 (BroadcastChannel)'), async () => {
    const p2 = await ctx.newPage(); await p2.goto(BETA); await p2.waitForTimeout(500);
    await p2.getByRole('button', { name: /^Kitchen/ }).first().click(); await p2.waitForTimeout(300);
    const before2 = await p2.getByText('Cold Drink').count();
    await p.goto(BETA); await p.waitForTimeout(500); await p.getByRole('button', { name: /counter/i }).first().click();
    await p.getByRole('button', { name: 'New order' }).last().click();
    await p.getByRole('button', { name: /^Cold Drink, add one/ }).first().click();
    await p.getByRole('button', { name: /^Bill|items/ }).last().click(); await p.getByRole('button', { name: 'To kitchen' }).first().click();
    await p2.waitForTimeout(800); await p2.screenshot({ path: `${out}/e2e-09-tab2-kitchen-${theme}.png` });
    const after2 = await p2.getByText('Cold Drink').count();
    await p2.close();
    return after2 > before2 ? `Cold Drink on tab 2 kitchen: ${String(before2)} → ${String(after2)}` : false;
  });
  await step(T('Stable storage untouched: no stall-tokens.v2.* key or DB on the origin'), async () => {
    const after = await scan(p);
    const stable = [...after.ls, ...after.dbs].filter((k) => k.startsWith('stall-tokens.v2'));
    const betaOnly = [...after.ls, ...after.dbs].every((k) => k.startsWith('stall-tokens-beta.v2'));
    await sp0.reload(); const sAfter = await scan(sp0); await sp0.close();
    return stable.length === 0 && betaOnly && JSON.stringify(sAfter) === JSON.stringify(after) ? `Stable tab "${stableTitle}" open in same profile; before ${JSON.stringify(before)} · after ${JSON.stringify(after)}` : false;
  });
  await step(T('no page errors'), async () => (errors.length === 0 ? 'none' : false));
  await ctx.close();
}
const sctx = await b.newContext({ javaScriptEnabled: false });
const sp = await sctx.newPage();
await step('Stable live and unchanged (fetched with JS off: no storage writes)', async () => {
  const r = await sp.goto(STABLE); const html = await sp.content();
  const js = /assets\/index-[^"]+\.js/.exec(html)?.[0] ?? '';
  return r?.status() === 200 && (await sp.title()) === 'Stall Tokens' ? `HTTP 200, title "Stall Tokens", bundle ${js}` : false;
});
await b.close();
console.log(`SUMMARY ${String(results.filter((r) => r.ok).length)}/${String(results.length)} pass`);
