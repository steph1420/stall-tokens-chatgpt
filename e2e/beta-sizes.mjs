/* global document, getComputedStyle, innerWidth, innerHeight */
// Live Beta responsive pass: key screens at each size of the device matrix (WORKING_RULES.md).
// Checks horizontal scroll, off-screen content, tap targets under 44px, fixed bars overlapping. Local demo data only.
import { chromium } from '@playwright/test';
import { demoOps } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const SIZES = [['360x740', 360, 740], ['390x844', 390, 844], ['421x927', 421, 927], ['430x932', 430, 932],
  ['ipad-820x1180', 820, 1180], ['ipad-1180x820', 1180, 820], ['tab-1024x768', 1024, 768], ['tab-768x1024', 768, 1024], ['land-927x421', 927, 421]];
// P3b: tablets in day too, and 200 % text on iPad (both ways round).
const VARIANTS = [...SIZES.map((s) => [...s, 'night', '']), ['421x927', 421, 927, 'day', ''], ['421x927-text200', 421, 927, 'night', 'text200'], ['421x927-safearea', 421, 927, 'night', 'safe'],
  ['ipad-820x1180', 820, 1180, 'day', ''], ['ipad-1180x820', 1180, 820, 'day', ''], ['tab-1024x768', 1024, 768, 'day', ''], ['tab-768x1024', 768, 1024, 'day', ''],
  ['ipad-820x1180-text200', 820, 1180, 'night', 'text200'], ['ipad-1180x820-text200', 1180, 820, 'day', 'text200']];
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? undefined : '/usr/bin/google-chrome'), args: ['--no-sandbox'] });

const measure = (p) => p.evaluate(() => {
  const vw = innerWidth, vh = innerHeight, de = document.documentElement;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const name = (e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
  const small = [...document.querySelectorAll('button,[role=button],[role=tab],a,input,select')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && (r.height < 44 || r.width < 44); })
    .map((e) => { const r = e.getBoundingClientRect(); return `${name(e)}(${String(Math.round(r.width))}×${String(Math.round(r.height))})`; });
  // P3: a row that scrolls sideways on purpose (Station order tabs, Kitchen pills at normal text, Q-PILLS-1 A) is not
  // "off-screen"; its own box must still fit. Large text must wrap the Kitchen pills instead (checked as `off`).
  const inScrollRow = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { if (a.scrollWidth > a.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(a).overflowX)) { const r = a.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1; } } return false; };
  const off = [...document.querySelectorAll('body *')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
    .filter((e) => !e.closest('[aria-hidden=true]') && !inScrollRow(e)).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0].slice(0, 24)}`).slice(0, 6);
  const fixed = [...document.querySelectorAll('body *')].filter(vis).filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position)).map((e) => e.getBoundingClientRect()).filter((r) => r.height < vh * 0.6);
  let overlap = 0; for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) { const a = fixed[i], c = fixed[j]; const ix = Math.min(a.right, c.right) - Math.max(a.left, c.left), iy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (ix > 4 && iy > 4 && !(a.left >= c.left && a.right <= c.right && a.top >= c.top && a.bottom <= c.bottom) && !(c.left >= a.left && c.right <= a.right && c.top >= a.top && c.bottom <= a.bottom)) overlap++; }
  const bottomBelow = [...document.querySelectorAll('button')].filter(vis).filter((e) => e.getBoundingClientRect().bottom > vh + 1 && getComputedStyle(e.parentElement ?? e).position === 'fixed').length;
  const confirm = [...document.querySelectorAll('button')].find((e) => /^Confirm payment$/.test((e.textContent ?? '').trim()));
  const inView = confirm ? (() => { const r = confirm.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh + 1 && r.left >= 0 && r.right <= vw + 1; })() : null;
  // P3: every Kitchen pill fits without a sideways scroll (null off the Kitchen). Required at 200 % text.
  const pills = document.querySelector('[role=group][aria-label="Station filter"]');
  const pillsFit = pills ? [...pills.children].every((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1; }) : null;
  return { hscroll: de.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1, off, small, overlap, bottomBelow, confirmInView: inView, pillsFit };
});

const rows = [];
for (const [label, w, h, theme, mode] of VARIANTS.filter((v) => !process.env.ONLY || process.env.ONLY.split(',').includes(v[0]))) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w > 700 ? 2 : 3, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  await p.goto(BETA);
  await p.evaluate(async ({ theme, ops }) => {
    localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify({ deviceId: 'size0001', theme, servingName: 'Server-A', haptics: 'off' }));
    await new Promise((res) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' }); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  }, { theme, ops: demoOps() });
  let safe = 'n/a';
  if (mode === 'safe') { try { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }); safe = 'CDP insets top 59 / bottom 34'; } catch (e) { safe = `CDP unsupported: ${String(e.message).slice(0, 60)}`; } }
  await p.reload(); await p.waitForTimeout(600);
  if (mode === 'text200') await p.addStyleTag({ content: 'html{font-size:200% !important}' });
  const go = async (n, f) => { try { await f(); await p.waitForTimeout(350); const m = await measure(p); await p.screenshot({ path: `${out}/size-${label}-${theme}-${n}.png` }); rows.push({ label, theme, n, ...m, safe }); } catch (e) { rows.push({ label, theme, n, err: String(e.message).split('\n')[0] }); } };
  await go('1-launch', async () => {});
  await go('2-menu', async () => { await p.getByRole('button', { name: /counter/i }).first().click(); for (const n of ['Tea', 'Samosa', 'Coffee']) await p.getByRole('button', { name: new RegExp(`^${n}, add one`) }).first().click(); });
  await go('3-billing', async () => { await p.getByRole('button', { name: /^Bill|items/ }).last().click(); });
  await go('4-payment', async () => { await p.getByRole('button', { name: 'To kitchen' }).first().click(); await p.getByRole('button', { name: /^Pay/ }).first().click(); await p.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: /^Cash ₹/ }).click(); });
  await go('5-unpaid', async () => { await p.getByRole('tab', { name: /Unpaid/ }).click(); });
  await go('5b-orderview', async () => { await p.getByRole('button', { name: /#001/ }).first().click(); });
  await go('5c-open', async () => { await p.getByRole('tab', { name: /Open Orders/ }).click(); });
  await go('6-kitchen', async () => { await p.goto(BETA); await p.waitForTimeout(400); if (mode === 'text200') await p.addStyleTag({ content: 'html{font-size:200% !important}' }); await p.getByRole('button', { name: /^Kitchen/ }).first().click(); });
  await go('6b-station', async () => { await p.getByRole('button', { name: /Beverages/ }).first().click(); await p.getByRole('button', { name: /Open Beverages/ }).click(); });
  // PK-5: a kitchen device reopens where it was, so step back to the start screen before the Settings check.
  await go('7-settings', async () => { await p.getByRole('button', { name: 'Back', exact: true }).click(); await p.getByRole('button', { name: 'Back to start' }).click(); await p.goto(BETA); await p.waitForTimeout(400); if (mode === 'text200') await p.addStyleTag({ content: 'html{font-size:200% !important}' }); await p.getByRole('button', { name: /settings/i }).first().click(); });
  await ctx.close();
  console.log(`HB ${label} ${theme} done`);
}
await b.close();
for (const r of rows) console.log(JSON.stringify(r));
