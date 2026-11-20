// pay3 (F-63): lock + calculator sheet fit at phone, iPad (pane) and 200 % text, night and day. Local demo data only.
// Usage: node e2e/beta-calc-sizes.mjs <outdir>  (BETA_URL to point at a local preview)
import { chromium } from '@playwright/test';
import { demoOps } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const V = [['421x927', 421, 927, ''], ['421x927-text200', 421, 927, 't'], ['ipad-820x1180', 820, 1180, ''], ['ipad-1180x820', 1180, 820, ''], ['ipad-820x1180-text200', 820, 1180, 't'], ['ipad-1180x820-text200', 1180, 820, 't']];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
async function one(theme, [label, w, h, t]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  try {
    await p.goto(BETA);
    await p.evaluate(async ({ theme, ops }) => {
      localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify({ deviceId: `calc${theme}0001`, theme, servingName: 'Server-A', haptics: 'off' }));
      await new Promise((res, rej) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' });
        r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
    }, { theme, ops: demoOps() });
    await p.reload(); await p.waitForTimeout(600);
    if (t) await p.addStyleTag({ content: 'html{font-size:200% !important}' });
    await p.getByRole('button', { name: /counter/i }).first().click();
    for (let i = 0; i < 3; i++) await p.getByRole('button', { name: /^Tea, add one/ }).first().click();
    const bill = p.getByRole('button', { name: /^Bill|items/ });
    if (await bill.count()) await bill.last().click().catch(() => undefined);
    await p.waitForTimeout(300);
    await p.getByRole('button', { name: /^Pay/ }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Lock UPI' }).click(); await p.waitForTimeout(150);
    const lockBox = await p.getByRole('button', { name: 'Unlock UPI' }).boundingBox();
    await p.screenshot({ path: `${out}/lock-${label}-${theme}.png` });
    await p.getByRole('button', { name: 'Calculator' }).click(); await p.waitForTimeout(300);
    for (const k of ['7', 'Times', '8', 'Equals']) await p.getByRole('button', { name: k, exact: true }).click();
    const res = await p.getByLabel('Result').innerText();
    // every key and both Use buttons are reachable (scroll inside the sheet allowed) and no sideways scroll
    const keys = ['Clear', 'Delete', 'Divide', 'Times', '7', '0', 'Point', 'Equals', 'Use as Cash', 'Use as UPI'];
    const boxes = []; for (const k of keys) boxes.push(await p.getByRole('button', { name: k, exact: true }).boundingBox());
    const small = boxes.filter((bb) => !bb || bb.height < 44 || bb.width < 44).length;
    // sideways scroll on the page or inside the calculator sheet (clipped text inside overflow:hidden cards doesn't scroll)
    const hs = await p.evaluate(() => { const d = globalThis.document; const sheet = d.querySelector('[role="dialog"]');
      return d.documentElement.scrollWidth > d.documentElement.clientWidth + 1 || (!!sheet && [sheet, ...sheet.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 1 && globalThis.getComputedStyle(e).overflowX !== 'visible' && globalThis.getComputedStyle(e).overflowX !== 'hidden')); });
    await p.screenshot({ path: `${out}/calc-${label}-${theme}.png` });
    const ok = res === '56' && small === 0 && !hs && lockBox && lockBox.width >= 44 && lockBox.height >= 44 && errors.length === 0;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} ${theme} | 7×8=${res} small=${String(small)} hscroll=${String(hs)} lock=${String(Math.round(lockBox?.width ?? 0))}x${String(Math.round(lockBox?.height ?? 0))} errors=${String(errors.length)}`);
  } catch (e) { fails++; console.log(`FAIL | ${label} ${theme} | ${String(e.message ?? e).split('\n')[0]}`); }
  await ctx.close();
}
for (const theme of ['night', 'day']) for (const v of V) await one(theme, v);
await b.close();
console.log(`SUMMARY ${String(V.length * 2 - fails)}/${String(V.length * 2)} pass`);
process.exit(fails ? 1 : 0);
