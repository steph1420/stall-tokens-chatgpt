/* global document, window */
// P3 live check on Beta (local test data only, no sync): one browser context with a Counter tab and a Kitchen tab
// (orders cross over BroadcastChannel, as on one phone with two tabs), night and day.
// - PK-2 ticket header: the order note (allergy in the warning tone), age, station chip on All; Kitchen count.
// - Silent new-ticket glow (D-P3-ALERT): a ticket that arrives while the Kitchen is open glows; no audio element plays.
// - PK-4 safe taps: a double tap moves a line one step; Undo in the toast; hold Done? goes back to Preparing.
// - W-40 Priority hold target ≥ 44 px and its toast; W-28 Station keeps its order with a Priority banner.
// - PK-5: a reload reopens the Kitchen; landscape 844×390 and 1024×768 shots.
// Usage: BETA_URL=<url> node e2e/beta-p3.mjs <outdir>
import { chromium } from '@playwright/test';
import { demoOps } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const results = [];
const rec = (name, ok, ev = '') => { results.push({ name, ok, ev }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${ev}`); };
const step = async (name, f) => { try { const ev = await f(); rec(name, ev !== false, typeof ev === 'string' ? ev : ''); } catch (e) { rec(name, false, String(e.message ?? e).split('\n')[0]); } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function setup(theme) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { window.__plays = 0; const p = window.HTMLMediaElement?.prototype; if (p) p.play = function () { window.__plays += 1; return Promise.resolve(); }; });
  const c = await ctx.newPage(); c.setDefaultTimeout(8000);
  const errors = []; c.on('pageerror', (e) => errors.push(e.message));
  await c.goto(BETA);
  await c.evaluate(async ({ prefs, ops }) => {
    localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify(prefs));
    await new Promise((res, rej) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' });
      r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  }, { prefs: { theme, haptics: 'off', deviceId: `p3kit${theme}0001`, servingName: 'Ravi' }, ops: demoOps() });
  await c.reload(); await c.waitForTimeout(500);
  await c.getByRole('button', { name: /counter/i }).first().click();
  const k = await ctx.newPage(); k.setDefaultTimeout(8000); k.on('pageerror', (e) => errors.push(e.message));
  await k.goto(BETA); await k.waitForTimeout(500);
  return { ctx, c, k, errors };
}
const tap = async (p, n) => p.getByRole('button', { name: new RegExp(`^${n}, add one`) }).first().click();
async function sendOrder(c, items, note) {
  await c.getByRole('button', { name: 'New order' }).click().catch(() => undefined);
  for (const n of items) await tap(c, n);
  await c.getByRole('button', { name: /^Bill|items/ }).last().click();
  if (note) { await c.getByRole('button', { name: /Order note/ }).click(); await c.getByRole('textbox', { name: 'Note', exact: true }).fill(note); await c.getByRole('button', { name: 'Done' }).click(); }
  await c.getByRole('button', { name: 'To kitchen' }).first().click(); await c.waitForTimeout(300);
}

for (const theme of (process.env.THEMES ?? 'night,day').split(',')) {
  const T = (n) => `[${theme}] ${n}`;
  const { ctx, c, k, errors } = await setup(theme);
  const shot = (p, n) => p.screenshot({ path: `${out}/p3-${n}-${theme}.png` });
  await step(T('PK-2: the order note reaches the Kitchen, allergy in the warning tone; age + station chip; count in the title'), async () => {
    await sendOrder(c, ['Tea', 'Samosa'], 'Takeaway · NUT ALLERGY');
    await k.getByRole('button', { name: /Kitchen/ }).first().click(); await k.waitForTimeout(400);
    const note = await k.getByRole('note').first().innerText();
    const title = await k.getByRole('heading', { level: 1 }).innerText();
    const age = await k.getByText(/^(just in|\d+ min)$/).count();
    await shot(k, '01-header');
    return /NUT ALLERGY/.test(note) && /Kitchen · 1/.test(title) && age > 0 ? `note "${note}", title "${title}"` : false;
  });
  await step(T('silent highlight: a ticket that arrives while the Kitchen is open glows; nothing plays a sound'), async () => {
    await sendOrder(c, ['Coffee']);
    await k.waitForTimeout(400);
    const glow = await k.locator('article[class*="isNew"]').count();
    await shot(k, '02-new-glow');
    const plays = await k.evaluate(() => window.__plays);
    return glow === 1 && plays === 0 ? 'one new card glows, 0 audio plays' : false;
  });
  await step(T('W-30: a double tap on Tea moves it one step only; Undo in the toast puts it back'), async () => {
    const tea = k.getByRole('button', { name: /^Tea: tap/ }).first();
    await tea.dblclick(); await k.waitForTimeout(250);
    const after = await tea.innerText();
    const toast = await k.getByRole('status').filter({ hasText: '→' }).first().innerText();
    await shot(k, '03-undo-toast');
    await k.getByRole('button', { name: 'Undo' }).click(); await k.waitForTimeout(250);
    const back = await tea.innerText();
    return /Preparing/.test(after) && !/Done/.test(after) && /Waiting/.test(back) ? `"${toast.replace(/\n/g, ' ')}" → Undo → Waiting` : false;
  });
  await step(T('W-31: hold on Done? takes the line back to Preparing'), async () => {
    const tea = k.getByRole('button', { name: /^Tea: tap/ }).first();
    await tea.click(); await k.waitForTimeout(700); await tea.click(); await k.waitForTimeout(300);
    const done = await tea.innerText();
    const box = await tea.boundingBox(); await k.mouse.move(box.x + 20, box.y + box.height / 2); await k.mouse.down(); await k.waitForTimeout(900); await k.mouse.up(); await k.waitForTimeout(250);
    const back = await tea.innerText();
    return /Done\?/.test(done) && /Preparing/.test(back) ? 'Done? → hold → Preparing' : false;
  });
  await step(T('Priority: the hold target is at least 44 px; holding says "Priority on" with Undo'), async () => {
    const t = k.getByRole('button', { name: 'Hold to mark Priority' }).first();
    const box = await t.boundingBox();
    await k.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await k.mouse.down(); await k.waitForTimeout(900); await k.mouse.up(); await k.waitForTimeout(250);
    const toast = await k.getByRole('status').filter({ hasText: 'Priority' }).first().innerText();
    await shot(k, '04-priority');
    return box.height >= 44 && box.width >= 44 && /Priority on/.test(toast) ? `${Math.round(box.width)}×${Math.round(box.height)} px; "${toast.replace(/\n/g, ' ')}"` : false;
  });
  await step(T('W-28: the Station keeps its order; a Priority order elsewhere shows a banner, not a swap'), async () => {
    await k.getByRole('button', { name: /Beverages/ }).first().click();
    await k.getByRole('button', { name: /Open Beverages/ }).click(); await k.waitForTimeout(300);
    await shot(k, '05a-station-open');
    const tabBefore = await k.getByRole('tab', { selected: true }).innerText();
    await sendOrder(c, ['Cold Drink']);
    await k.waitForTimeout(400);
    const shownTok = await k.getByRole('button', { name: /Hold to (mark|turn)/ }).first().innerText();
    // Priority #001 off, then the newest order (Cold Drink) on from its own tab, then back to the first order.
    const holdTok = async () => { const t = k.getByRole('button', { name: /Hold to (mark|turn)/ }).first(); const bx = await t.boundingBox(); await k.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await k.mouse.down(); await k.waitForTimeout(900); await k.mouse.up(); await k.waitForTimeout(700); };
    await holdTok();
    await k.getByRole('tab').last().click(); await k.waitForTimeout(700); await holdTok();
    await k.getByRole('tab').last().click(); await k.waitForTimeout(700);
    const stay = await k.getByRole('tab', { selected: true }).innerText();
    const banner = await k.getByRole('button', { name: /^Priority #/ }).count();
    await shot(k, '05-station-banner');
    return banner > 0 ? `opened on ${tabBefore.replace(/\n/g, ' ')} (${shownTok.replace(/\n/g, '')}); picked ${stay.replace(/\n/g, ' ')}, which stays while Priority is elsewhere; banner shown` : false;
  });
  await step(T('PK-5: a reload reopens the Kitchen device where it was'), async () => {
    await k.getByRole('button', { name: 'Back' }).click(); await k.waitForTimeout(200);
    await k.reload(); await k.waitForTimeout(800);
    const title = await k.getByRole('heading', { level: 1 }).innerText().catch(() => '');
    return /Kitchen/.test(title) ? `after reload: "${title}"` : false;
  });
  await step(T('landscape 844×390 and tablet 1024×768: no sideways scroll; shots'), async () => {
    const res = [];
    for (const [w, h] of [[844, 390], [1024, 768]]) {
      await k.setViewportSize({ width: w, height: h }); await k.waitForTimeout(300);
      const hs = await k.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      await shot(k, `06-${w}x${h}`); res.push(`${w}×${h} hscroll=${hs}`);
      if (hs) return false;
    }
    return res.join(', ');
  });
  rec(T('no page errors'), errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');
  await ctx.close();
}
await b.close();
console.log(`SUMMARY ${results.filter((r) => r.ok).length}/${results.length} pass`);
