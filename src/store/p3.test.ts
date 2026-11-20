// P3 Kitchen + Station store and rules (PK-2, PK-4, PK-5, PK-10; W-25/26/30/31/38/40/42/44).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { Line, Order } from '../contract';
import { DEMO_MENU } from '../mock/fixtures';
import { kitchen } from '.';
import { makeTestStore, memoryStorage, stepClock } from './testkit';

async function ready(opts: Parameters<typeof makeTestStore>[0] = {}) {
  const t = makeTestStore(opts);
  await t.store.getState().start();
  const s = () => t.store.getState();
  for (const m of DEMO_MENU) s().catalog.saveItem(null, { name: m.name, price: m.price, swatch: m.swatch, category: m.category, stationId: m.stationId, count: null });
  const idOf = (name: string) => Object.values(s().folded.items).find((i) => i.name === name)?.id ?? '';
  const send = (...names: string[]) => {
    s().counter.newOrder();
    for (const n of names) s().counter.addItem(idOf(n));
    s().counter.sendToKitchen();
    return s().ui.orderId ?? '';
  };
  const line = (id: string, i = 0) => s().folded.orders[id]?.lines[i] as Line;
  return { s, send, line, store: t.store };
}

describe('P3 safe taps (PK-4)', () => {
  it('W-30: a double tap on one line moves it once; the step toast offers Undo, which puts it back', async () => {
    const { s, send, line } = await ready(); // fixed clock: both taps fall inside the step gap
    const a = send('Tea');
    const tea = line(a).lineId;
    expect(s().kitchen.advance(a, tea)).toBe(true);
    expect(s().kitchen.advance(a, tea)).toBe(false);
    expect(line(a).status).toBe('preparing');
    const t = s().ui.toast;
    expect(t?.text).toBe('Tea #001 → Preparing');
    expect(t?.action).toMatchObject({ run: 'undoStep', status: 'waiting', from: 'preparing' });
    expect(t?.ms).toBe(CONFIG.kitchen.undoToastMs);
    expect(s().kitchen.undoStep(a, tea, 'waiting', 'preparing')).toBe(true);
    expect(line(a).status).toBe('waiting');
    expect(s().kitchen.undoStep(a, tea, 'waiting', 'preparing')).toBe(false); // already moved: no double undo
    expect(s().ui.toast?.text).toBe('Too late to undo · it has moved on');
  });
  it('W-31: hold on Done? takes it back to Preparing; the Counter can Send back too', async () => {
    const { s, send, line } = await ready({ now: stepClock() });
    const a = send('Tea', 'Samosa');
    const tea = line(a).lineId;
    s().kitchen.advance(a, tea); s().kitchen.advance(a, tea);
    expect(line(a).status).toBe('done?');
    expect(s().kitchen.toggleHold(a, tea)).toBe(true);
    expect(line(a).status).toBe('preparing');
    s().kitchen.advance(a, tea);
    expect(s().kitchen.sendBack(a)).toBe(true);
    expect(line(a).status).toBe('preparing');
    expect(s().ui.toast?.text).toBe('Sent back to the kitchen · #001');
  });
  it('W-40: Priority on and off both say so, with Undo', async () => {
    const { s, send } = await ready();
    const a = send('Tea');
    s().kitchen.togglePriority(a);
    expect(s().ui.toast).toMatchObject({ text: 'Priority on · #001', action: { run: 'undoPriority', on: false } });
    expect(s().kitchen.undoPriority(a, false)).toBe(true);
    expect(s().folded.orders[a]?.priority).toBe(false);
    expect(s().ui.toast?.text).toBe('Undone · Priority off for #001');
  });
});

describe('P3 ticket facts and leaves (PK-2, PK-10)', () => {
  const o = (lines: Partial<Line>[], extra: Partial<Order> = {}) => ({ id: 'o1', lines: lines.map((l, i) => ({ lineId: `l${String(i)}`, qty: 1, status: 'waiting', stationId: 'Momos', name: 'X', ...l })), deleted: false, cancel: null, ...extra }) as unknown as Order;
  it('W-38 age text and tone', () => {
    const t0 = 0;
    expect(kitchen.ageText(t0, 30_000)).toBe('just in');
    expect(kitchen.ageText(t0, 4 * 60_000 + 5)).toBe('4 min');
    expect(kitchen.ageTone(t0, 7 * 60_000, 8, 15)).toBe('calm');
    expect(kitchen.ageTone(t0, 8 * 60_000, 8, 15)).toBe('amber');
    expect(kitchen.ageTone(t0, 15 * 60_000, 8, 15)).toBe('red');
  });
  it('W-25 allergy / diet words are whole words, any case', () => {
    const w = CONFIG.kitchen.allergyWords;
    expect(kitchen.isWarningNote('Takeaway · NUT ALLERGY', w)).toBe(true);
    expect(kitchen.isWarningNote('no onion please', w)).toBe(true);
    expect(kitchen.isWarningNote('extra doughnut glaze', w)).toBe(false);
    expect(kitchen.isWarningNote('Takeaway', w)).toBe(false);
  });
  it('W-42 own lines first; PK-10 handed over here while other stations still work', () => {
    const x = o([{ stationId: 'Momos', name: 'A' }, { stationId: 'Beverages', name: 'B' }]);
    expect(kitchen.ownFirst(x.lines, 'Beverages').map((l) => l.name)).toEqual(['B', 'A']);
    const handed = o([{ stationId: 'Momos', status: 'waiting' }, { stationId: 'Beverages', status: 'handed' }]);
    expect(kitchen.leaveWhy(handed, 'Beverages')).toBe('handed');
    expect(kitchen.leftElsewhere(handed, 'Beverages')).toBe(1);
    expect(kitchen.leaveWhy(o([{ status: 'handed' }]), 'Momos')).toBe('completed');
    expect(kitchen.leaveWhy(undefined, null)).toBe('cancelled');
    expect(kitchen.leaveWhy(o([{ status: 'waiting' }]), null)).toBe(null);
  });
});

describe('P3 kitchen device resume (PK-5 A, W-44)', () => {
  it('a device last used as a Station reopens there; a Counter device still opens on Launch', async () => {
    const storage = memoryStorage();
    const one = await ready({ storage });
    one.s().kitchen.openStation('Momos', 'kitchen');
    expect(one.s().prefs.lastRole).toBe('station:Momos');
    const two = await ready({ storage });
    expect(two.s().ui.screen).toBe('station');
    expect(two.s().ui.station?.id).toBe('Momos');
    two.s().go('counter');
    expect(two.s().prefs.lastRole).toBe('');
    const three = await ready({ storage });
    expect(three.s().ui.screen).toBe('launch');
  });
});
