/* global document, getComputedStyle, innerWidth, innerHeight, window */
// P4 live check on Beta (local demo data only, no sync), night and day at 421×927 (Steve's phone):
// History tags + search + sheet (F-64), Unpaid count after a refund (D-P4-REFUND-DUE), Money tiles (F-65), Close the day
// (refund due, cash count, notes, leave for later, hold to lock, summary; F-66 / F-67), Stock All rail, chips, count-only paste
// (F-68), Settings Extras, phone Back. Then a size pass of the P4 screens (phones, iPad both ways, phone on its side, 200 % text).
// Usage: BETA_URL=<url> node e2e/beta-p4.mjs <outdir>
import { chromium } from '@playwright/test';
import { demoOps, p4Ops } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const results = [];
const rec = (name, ok, ev = '') => { results.push({ name, ok, ev }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${ev}`); };
const step = async (name, f) => { try { const ev = await f(); rec(name, ev !== false, typeof ev === 'string' ? ev : ''); } catch (e) { rec(name, false, String(e.message ?? e).split('\n')[0]); } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function open(w, h, theme, id) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w > 700 ? 2 : 3, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BETA);
  await p.evaluate(async ({ prefs, ops }) => {
    localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify(prefs));
    await new Promise((res, rej) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' });
      r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  }, { prefs: { theme, haptics: 'off', deviceId: id, servingName: 'Ravi', passcodeOff: true }, ops: [...demoOps(), ...p4Ops()] });
  await p.reload(); await p.waitForTimeout(600);
  return { ctx, p, errors };
}
const stall = async (p, name) => { await p.goto(BETA); await p.waitForTimeout(400); await p.getByRole('button', { name: new RegExp(`^${name}`) }).first().click(); await p.waitForTimeout(300); };
const hold = async (loc, ms = 900) => { const bb = await loc.boundingBox(); await loc.page().mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await loc.page().mouse.down(); await loc.page().waitForTimeout(ms); await loc.page().mouse.up(); };

for (const theme of (process.env.THEMES ?? 'night,day').split(',')) {
  const T = (n) => `[${theme}] ${n}`;
  const { ctx, p, errors } = await open(421, 927, theme, `p4live${theme}01`);
  const shot = (n) => p.screenshot({ path: `${out}/p4-${n}-${theme}.png` });
  await step(T('History lists all 5 sent orders with one plain tag each (W-08, W-18, W-21)'), async () => {
    await stall(p, 'History');
    const want = ['Paid cash', 'Unpaid ₹25', 'Refunded ₹15 cash', 'Cancelled · Refund due ₹20', 'Written off ₹30'];
    const got = await Promise.all(want.map((t) => p.getByText(t, { exact: true }).count()));
    const tokens = await p.getByText(/^#00[1-5]$/).count();
    await shot('01-history');
    return got.every((n) => n === 1) && tokens === 5 ? `${String(tokens)} rows, tags: ${want.join(' | ')}` : false;
  });
  await step(T('History search: "vada" finds #002 only, "#3" finds #003'), async () => {
    const box = p.getByRole('searchbox', { name: 'Search orders' });
    await box.fill('vada'); await p.waitForTimeout(200);
    const a = await p.getByText(/^#00[1-5]$/).allInnerTexts();
    await shot('02-search');
    await box.fill('#3'); await p.waitForTimeout(200);
    const c = await p.getByText(/^#00[1-5]$/).allInnerTexts();
    await box.fill('');
    return a.join() === '#002' && c.join() === '#003' ? `vada → ${a.join()}, #3 → ${c.join()}` : false;
  });
  await step(T('unpaid row sheet: Take payment · ₹25; refunded row has Refund off (nothing held)'), async () => {
    await p.getByText('#002', { exact: true }).click(); await p.waitForTimeout(250);
    const take = await p.getByRole('button', { name: 'Take payment · ₹25' }).count();
    await shot('03-sheet-unpaid');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.getByText('#003', { exact: true }).click(); await p.waitForTimeout(250);
    const refundOff = await p.getByRole('button', { name: 'Refund', exact: true }).isDisabled();
    await p.keyboard.press('Escape');
    return take === 1 && refundOff ? 'Take payment shown; Refund disabled on the refunded order' : false;
  });
  await step(T('Day notes from the History day header: chip + text saved, header shows Notes ✓'), async () => {
    await p.getByRole('button', { name: 'Notes for Today' }).click();
    await p.getByRole('button', { name: 'Crowd' }).click();
    await p.getByRole('textbox', { name: 'Notes' }).fill('Rush at 7, ran out of cups');
    await shot('04-notes');
    await p.getByRole('button', { name: 'Save notes' }).click(); await p.waitForTimeout(250);
    return (await p.getByRole('button', { name: 'Notes for Today' }).innerText()).includes('✓') ? 'Notes ✓ ›' : false;
  });
  await step(T('Money segment lists entries; phone Back leaves History for the start screen, not the app'), async () => {
    await p.getByRole('tab', { name: 'Money' }).click(); await p.waitForTimeout(200);
    const empty = await p.getByText('Nothing spent or received yet.').count();
    await p.goBack(); await p.waitForTimeout(300);
    const launch = await p.getByRole('button', { name: /^History/ }).count();
    return empty === 1 && launch > 0 && p.url().startsWith(BETA) ? 'Back → start screen' : false;
  });
  await step(T('Unpaid tab counts 1, not 2: a refunded order is not owed again (D-P4-REFUND-DUE)'), async () => {
    await p.getByRole('button', { name: /counter/i }).first().click(); await p.waitForTimeout(300);
    const tab = (await p.getByRole('tab', { name: /Unpaid/ }).innerText()).replace(/\s+/g, ' ');
    await p.getByRole('tab', { name: /Unpaid/ }).click(); await p.waitForTimeout(250);
    const rows = await p.getByText(/^#00[1-5]$/).allInnerTexts();
    await shot('05-unpaid-tab');
    return /1/.test(tab) && !/2/.test(tab) && rows.join() === '#002' ? `tab "${tab}", rows ${rows.join()}` : false;
  });
  await step(T('Money tiles: Unpaid · 1 ₹25, Refunds −₹15, Written off · 1 ₹30; the Unpaid tile opens the Unpaid tab'), async () => {
    await stall(p, 'Money');
    const txt = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
    await shot('06-money');
    const ok = /Unpaid · 1 › ₹25/.test(txt) && /Refunds −₹15/.test(txt) && /Written off · 1 ₹30/.test(txt);
    await p.getByRole('button', { name: /^Unpaid · 1/ }).click(); await p.waitForTimeout(300);
    const sel = await p.getByRole('tab', { name: /Unpaid/ }).getAttribute('aria-selected');
    return ok && sel === 'true' ? 'tiles right; tile → Unpaid tab' : `tiles: ${txt.slice(0, 160)} / tab ${String(sel)}`;
  });
  await step(T('Close the day: UPI back clears step 2; counting ₹540 matches the book; Leave for later on step 1'), async () => {
    await stall(p, 'Close the day');
    await shot('07-close-top');
    const s2 = p.getByRole('region', { name: 'Step 2: Refunds due' });
    await s2.getByRole('button', { name: 'UPI back' }).click(); await p.waitForTimeout(250);
    const done2 = await s2.getByText('Done').count();
    await p.getByRole('region', { name: 'Step 1: Unpaid orders' }).getByRole('button', { name: 'Leave for later' }).click();
    for (const [d, n] of [[500, 1], [20, 2]]) for (let i = 0; i < n; i++) await p.getByRole('button', { name: i === 0 ? `Add a ₹${String(d)} note` : `One more ₹${String(d)}` }).click();
    const diff = await p.getByRole('status').filter({ hasText: /book|short|over/ }).first().innerText();
    await p.getByRole('region', { name: 'Step 3: Cash in the box' }).scrollIntoViewIfNeeded();
    await shot('08-close-cash');
    await p.getByRole('button', { name: 'Save count · ₹540' }).click(); await p.waitForTimeout(250);
    const left = await p.getByRole('region', { name: 'Step 1: Unpaid orders' }).getByText('Left for later').count();
    return done2 === 1 && diff === 'Matches the book' && left === 1 ? `step 2 Done, "${diff}", step 1 left for later` : `done2 ${String(done2)}, "${diff}", left ${String(left)}`;
  });
  await step(T('hold to lock the day; the summary lists takings, top sellers and what was left'), async () => {
    const btn = p.getByRole('button', { name: 'Hold to lock the day' });
    await btn.scrollIntoViewIfNeeded(); await hold(btn); await p.waitForTimeout(300);
    const locked = await p.getByText('Day locked. Reopen it in Settle up to change money.').count();
    const sum = p.getByRole('region', { name: 'Day summary' }).or(p.locator('section').filter({ hasText: 'Day summary' })).last();
    await sum.scrollIntoViewIfNeeded();
    const txt = (await sum.innerText()).replace(/\s+/g, ' ');
    await shot('09-close-summary');
    const ok = /Left for later: unpaid orders/.test(txt) && /Tea/.test(txt) && /Cash in the box: ₹540 · Matches the book/.test(txt);
    return locked === 1 && ok ? txt.slice(0, 140) : `locked ${String(locked)} / ${txt.slice(0, 200)}`;
  });
  await step(T('Stock: All is selected, Sold out · 1 chip; "Tea 20pcs" reads as Count only · no Spent'), async () => {
    await stall(p, 'Stock');
    const all = await p.getByRole('tab', { name: /All/ }).getAttribute('aria-selected');
    await p.getByRole('button', { name: /Sold out · 1/ }).click(); await p.waitForTimeout(200);
    const sand = await p.getByText('Sandwich').count();
    await shot('10-stock');
    await p.getByRole('button', { name: /Paste/ }).first().click();
    await p.getByRole('textbox', { name: 'Pasted stock' }).fill('Tea 20pcs');
    const line = await p.getByText('Count only · no Spent').count();
    const add = await p.getByRole('button', { name: 'Add 1', exact: true }).count();
    await shot('11-paste-count-only');
    return all === 'true' && sand > 0 && line === 1 && add === 1 ? 'All on; chip filters; count-only line, "Add 1" (no Spent)' : false;
  });
  await step(T('Settings › Extras shows both switches on'), async () => {
    await stall(p, 'Settings');
    const sw = p.getByRole('switch', { name: /Close the day|History search/ });
    const on = await sw.evaluateAll((es) => es.map((e) => e.getAttribute('aria-checked')));
    await p.getByText('Extras · every phone').scrollIntoViewIfNeeded(); await shot('12-extras');
    return on.length === 2 && on.every((v) => v === 'true') ? 'both on' : false;
  });
  await step(T('no page errors'), async () => (errors.length === 0 ? '0 errors' : errors.join(' | ').slice(0, 200)));
  await ctx.close();
}

// Size pass of the P4 screens: horizontal scroll, off-screen boxes and tap targets under 44 px in view.
const measure = (p) => p.evaluate(() => {
  const vw = innerWidth, vh = innerHeight, de = document.documentElement;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const small = [...document.querySelectorAll('button,[role=tab],input')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && (r.height < 44 || r.width < 44); }).map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 20));
  const off = [...document.querySelectorAll('body *')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; }).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0].slice(0, 20)}`).slice(0, 5);
  return { hscroll: de.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1, off, small, w: window.innerWidth };
});
const SIZES = [['360x740', 360, 740, 'night', ''], ['390x844', 390, 844, 'day', ''], ['430x932', 430, 932, 'night', ''], ['ipad-820x1180', 820, 1180, 'day', ''],
  ['ipad-1180x820', 1180, 820, 'night', ''], ['land-927x421', 927, 421, 'day', ''], ['421x927-text200', 421, 927, 'night', 'text200'], ['ipad-820x1180-text200', 820, 1180, 'day', 'text200']];
for (const [label, w, h, theme, mode] of SIZES.filter((v) => !process.env.ONLY || process.env.ONLY.split(',').includes(v[0]))) {
  const { ctx, p } = await open(w, h, theme, `p4size${label.slice(0, 6)}`);
  for (const [n, screen] of [['history', 'History'], ['money', 'Money'], ['close', 'Close the day'], ['stock', 'Stock']]) {
    await step(`[size ${label} ${theme}] ${n} fits (no sideways scroll, nothing off-screen, targets ≥ 44 px)`, async () => {
      await stall(p, screen);
      if (mode === 'text200') { await p.addStyleTag({ content: 'html{font-size:200% !important}' }); await p.waitForTimeout(250); }
      const m = await measure(p);
      await p.screenshot({ path: `${out}/p4-size-${label}-${theme}-${n}.png` });
      const detail = `hscroll ${String(m.hscroll)} off [${m.off.join(', ')}] small [${m.small.join(', ')}]`;
      if (m.hscroll || m.off.length || m.small.length) throw new Error(detail);
      return 'ok';
    });
  }
  await ctx.close();
  console.log(`HB size ${label} done`);
}
await b.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`SUMMARY ${String(results.length - fail)}/${String(results.length)} pass`);
