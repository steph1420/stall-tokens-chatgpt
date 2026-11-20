/* global document, getComputedStyle */
// P3b tablet layout e2e (local demo data only). Usage: node e2e/beta-tablet.mjs <outdir>  (BETA_URL for a local preview)
// Two panes on a tablet: menu beside the bill / payment, open orders list beside the card, kitchen tickets in columns; phone unchanged.
import { chromium } from '@playwright/test';
import { demoOps } from './seed-plain.mjs';

const out = process.argv[2] ?? '.';
const BETA = process.env.BETA_URL ?? 'https://steph1420.github.io/stall-tokens-beta/';
const results = [];
const rec = (name, ok, ev = '') => { results.push({ name, ok, ev }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${ev}`); };
const step = async (name, f) => { try { const ev = await f(); rec(name, ev !== false, typeof ev === 'string' ? ev : ''); } catch (e) { rec(name, false, String(e.message ?? e).split('\n')[0]); } };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function open(label, w, h, theme) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w > 700 ? 2 : 3, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BETA);
  await p.evaluate(async ({ theme, ops }) => {
    localStorage.setItem('stall-tokens-beta.v2.device', JSON.stringify({ deviceId: `tab${theme}0001`, theme, servingName: 'Server-A', haptics: 'off' }));
    await new Promise((res, rej) => { const r = indexedDB.open('stall-tokens-beta.v2.log', 1); r.onupgradeneeded = () => r.result.createObjectStore('ops', { keyPath: 'opId' });
      r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('ops', 'readwrite'); ops.forEach((o) => tx.objectStore('ops').put(o)); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  }, { theme, ops: demoOps() });
  await p.reload(); await p.waitForTimeout(600);
  return { ctx, p, errors, shot: (n) => p.screenshot({ path: `${out}/tab-${label}-${theme}-${n}.png` }) };
}
const panes = (p) => p.evaluate(() => [...document.querySelectorAll('section')].filter((e) => e.getBoundingClientRect().width > 200).length);
const cols = (p) => p.evaluate(() => { const m = [...document.querySelectorAll('main')].find((e) => getComputedStyle(e).display === 'grid'); return m ? getComputedStyle(m).gridTemplateColumns.split(' ').length : 1; });

for (const [label, w, h] of [['1180x820', 1180, 820], ['820x1180', 820, 1180]]) for (const theme of (process.env.THEMES ?? 'night,day').split(',')) {
  const { ctx, p, errors, shot } = await open(label, w, h, theme);
  const T = (n) => `[${label} ${theme}] ${n}`;
  await step(T('Counter: menu beside the bill, the bill updates as items are tapped'), async () => {
    await p.getByRole('button', { name: /counter/i }).first().click();
    for (const n of ['Tea', 'Tea', 'Samosa']) await p.getByRole('button', { name: new RegExp(`^${n}, add one`) }).first().click();
    await p.waitForTimeout(300); await shot('01-counter');
    const n = await panes(p); const billShown = await p.getByRole('button', { name: 'To kitchen' }).count();
    return n === 2 && billShown > 0 ? `${String(n)} panes; "To kitchen" in the bill pane without leaving the menu` : false;
  });
  await step(T('Payment beside the menu; number pad stays in its pane'), async () => {
    await p.getByRole('button', { name: 'To kitchen' }).first().click(); await p.getByRole('button', { name: /^Pay/ }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('group', { name: 'How to pay' }).getByRole('button', { name: 'Split' }).click(); await p.waitForTimeout(150);
    await p.getByRole('button', { name: /^Cash ₹/ }).click(); await p.waitForTimeout(200); await shot('02-payment-pad');
    const r = await p.getByRole('dialog', { name: 'Number pad' }).boundingBox(); const pane = await p.locator('section').nth(1).boundingBox();
    await p.getByRole('button', { name: 'Done', exact: true }).click();
    const menuStill = await p.getByRole('button', { name: /^Tea, add one/ }).count();
    return r && pane && r.x >= pane.x - 1 && r.x + r.width <= pane.x + pane.width + 1 && menuStill > 0 ? 'pad inside the payment pane; menu still showing' : false;
  });
  await step(T('Confirm payment works in the pane'), async () => {
    await p.getByRole('button', { name: 'Confirm payment' }).click(); await p.waitForTimeout(400);
    return (await p.getByText(/Paid ✓|Paid$/).count()) > 0 ? 'Paid shown' : false;
  });
  await step(T('Open Orders: list beside the order; tapping a row shows it'), async () => {
    await p.getByRole('button', { name: 'New order' }).last().click(); await p.getByRole('button', { name: /^Coffee, add one/ }).first().click();
    await p.getByRole('button', { name: 'To kitchen' }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('tab', { name: /Open Orders/ }).click(); await p.waitForTimeout(300);
    const rows = p.getByRole('list', { name: 'Open orders' }).getByRole('button');
    const n = await rows.count(); if (n < 2) return false;
    const tok = (await rows.nth(1).innerText()).split('\n')[0];
    await rows.nth(1).click(); await p.waitForTimeout(300); await shot('03-open');
    const cur = await rows.nth(1).getAttribute('aria-current');
    const card = await p.getByRole('article').first().getAttribute('aria-label');
    return cur === 'true' && card && tok.includes(card.replace(/\D/g, '').padStart(3, '0')) ? `${String(n)} rows; picked ${tok}, card "${card}"` : false;
  });
  await step(T('Kitchen: tickets in columns'), async () => {
    await p.goto(BETA); await p.waitForTimeout(500); await p.getByRole('button', { name: /^Kitchen/ }).first().click(); await p.waitForTimeout(400); await shot('04-kitchen');
    const c = await cols(p); return c >= 2 ? `${String(c)} columns` : false;
  });
  await step(T('no page errors'), async () => (errors.length === 0 ? 'none' : errors.join('; ')));
  await ctx.close();
}
for (const [label, w, h] of [['421x927', 421, 927], ['927x421', 927, 421]]) {
  const { ctx, p, shot } = await open(label, w, h, 'night');
  await step(`[${label}] phone unchanged: one pane, Menu tab, kitchen one column`, async () => {
    await p.getByRole('button', { name: /counter/i }).first().click(); await p.waitForTimeout(300); await shot('01-counter');
    const n = await panes(p); const menuTab = await p.getByRole('button', { name: 'Menu', exact: true }).count();
    await p.goto(BETA); await p.waitForTimeout(500); await p.getByRole('button', { name: /^Kitchen/ }).first().click(); await p.waitForTimeout(300);
    const c = await cols(p);
    return n === 0 && menuTab > 0 && c === 1 ? 'no panes, Menu tab shown, kitchen one column' : false;
  });
  await ctx.close();
}
await b.close();
const pass = results.filter((r) => r.ok).length;
console.log(`SUMMARY ${String(pass)}/${String(results.length)} pass`);
process.exit(pass === results.length ? 0 : 1);
