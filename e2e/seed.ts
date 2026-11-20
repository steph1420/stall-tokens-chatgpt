// Test seeding: writes device prefs and ops into the real browser stores, then reloads (no test code in the app).
import type { Page } from '@playwright/test';
import { CONFIG } from '../src/config';
import type { Op } from '../src/contract';
import { demoMenuOps, opMaker } from '../src/mock/fixtures';

export const PREFIX = CONFIG.storage.prefix;

export function demoOps(): Op[] {
  const mk = opMaker('seed0000.p', 100);
  return [...demoMenuOps(), mk('payee.set', { payeeId: 'p1', name: 'Stall One', upiId: 'stallone@okbank', removed: false }),
    mk('setting.set', { key: 'stallName', value: 'Fair stall' })];
}

export async function seed(page: Page, o: { theme?: 'night' | 'day'; ops?: Op[]; serving?: string } = {}) {
  await page.goto('./');
  await page.evaluate(async ({ prefix, ver, theme, ops, serving }) => {
    localStorage.setItem(`${prefix}.device`, JSON.stringify({ deviceId: 'e2edevice0001', theme, servingName: serving, rangeIndex: 0, haptics: 'off', autoPrep: false, stationLook: 'full' }));
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open(`${prefix}.log`, ver);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('ops')) r.result.createObjectStore('ops', { keyPath: 'opId' }); };
      r.onerror = () => { rej(r.error ?? new Error('open')); };
      r.onsuccess = () => {
        const tx = r.result.transaction('ops', 'readwrite');
        for (const op of ops) tx.objectStore('ops').put(op);
        tx.oncomplete = () => { r.result.close(); res(); };
        tx.onerror = () => { rej(tx.error ?? new Error('tx')); };
      };
    });
  }, { prefix: PREFIX, ver: CONFIG.storage.dbVersion, theme: o.theme ?? 'night', ops: o.ops ?? demoOps(), serving: o.serving ?? 'Server-A' });
  await page.reload();
}

export const themeOf = (projectName: string): 'night' | 'day' => (projectName.includes('day') ? 'day' : 'night');
