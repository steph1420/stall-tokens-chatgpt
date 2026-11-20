// F-43 Counter Open Orders actions (Q-ORDERS-1 rough v3, locked 16 Nov 18:21 IST). Screens only call these.
// Lines: Mark ready (store/kitchen finishLine), Ready + Confirm, Confirm all, hidden tap; Cards: tap; bar: Handover.
import { CONFIG } from '../config';
import { formatInr } from '../contract';
import type { Core, Log } from './core';
import { liveOrders } from './fold/fold';
import { makeCtx, type Ctx } from './kitchen';
import { due } from './rules/bill';
import { counterNext, openOrders } from './rules/kitchen';
import { completed } from './rules/status';
import { holding } from './rules/handling';
import type { CounterTab } from './ui';

function navActions(core: Core, { st, ui, order, log }: Ctx) {
  const list = () => openOrders(liveOrders(st().folded));
  return {
    showTab(tab: CounterTab) { ui({ counterTab: tab, sheet: null, orderView: null }); },
    showOpen(orderId: string) { ui({ openId: orderId }); },
    /** Swipe the header for the previous / next order. */
    stepOpen(dir: 1 | -1) {
      const l = list();
      const i = Math.max(0, l.findIndex((o) => o.id === st().ui.openId));
      const next = l[Math.min(l.length - 1, Math.max(0, i + dir))];
      if (next) ui({ openId: next.id });
    },
    setClient(orderId: string, name: string) {
      const o = order(orderId);
      const v = name.trim().replace(/\s+/g, ' ').slice(0, CONFIG.limits.nameMaxChars);
      if (o && v !== o.client) log.dispatch('order.client', { orderId, name: v });
    },
    /** Order sheet → Edit in Billing (Q-ORDERS-6 A). */
    editInBilling(orderId: string) {
      if (!order(orderId)) return;
      core.set((s) => ({ ui: { ...s.ui, counterTab: 'new', orderId, sheet: null, pages: { ...s.ui.pages, [orderId]: 'billing' } } }));
    },
  };
}

const tok = (n: number) => String(n).padStart(CONFIG.tokens.pad, '0');

function lineActions({ order, setLines, toast, log }: Ctx) {
  return {
    /** Hidden tap (Lines) or card tap (Cards): one step on (D-OPEN-TAP). */
    tapLine(orderId: string, lineId: string): boolean {
      const l = order(orderId)?.lines.find((x) => x.lineId === lineId);
      const to = l && l.status !== 'draft' ? counterNext(l.status) : null;
      if (!l || !to) return false;
      log.dispatch('line.status', { orderId, lineId, status: to });
      return true;
    },
    /** A station's proposed-done line ("Ready" with Confirm on the right). */
    confirmLine(orderId: string, lineId: string): boolean {
      const l = order(orderId)?.lines.find((x) => x.lineId === lineId);
      if (l?.status !== 'done?') return false;
      log.dispatch('line.status', { orderId, lineId, status: 'ready' });
      return true;
    },
    confirmAll(orderId: string): boolean { const o = order(orderId); return o ? setLines(o, (s) => s === 'done?', 'ready') > 0 : false; },
    /** Bottom bar Handover: delivers every line still not handed over, whatever its status (Q-ORDERS-1).
     * Q-HANDOVER-PAY revised: allowed while unpaid, but it does not complete the order; it stays open as Unpaid (W-05). */
    handOverAll(orderId: string): boolean {
      const o = order(orderId);
      if (!o) return false;
      const n = setLines(o, (s) => s !== 'handed', 'handed');
      const owed = due(order(orderId) ?? o);
      if (n > 0) toast(owed > 0 ? `Handed over #${tok(o.token)} · ${formatInr(owed)} still to collect` : `Handed over #${tok(o.token)}`);
      return n > 0;
    },
  };
}

/** Complete (Q-HANDOVER-PAY revised, Q-COMPLETE-2 A, Q-HOLD-RING A). */
function completeActions({ order, toast, log }: Ctx) {
  return {
    /** Complete (Q-COMPLETE-2 A). Paid: one tap completes. Unpaid: refused with 'unpaid' so the screen shows the yellow
     * button + "Order unpaid · Press and hold to complete without payment" (the hold calls completeUnpaid). */
    complete(orderId: string): 'done' | 'unpaid' | 'none' {
      const o = order(orderId);
      if (!o || o.cancel || !o.sent || completed(o)) return 'none';
      if (due(o) > 0) { toast('Order unpaid · Press and hold to complete without payment'); return 'unpaid'; }
      log.dispatch('order.complete', { orderId, unpaid: false, dueAt: 0, reason: '' });
      toast(`Completed #${tok(o.token)}`);
      return 'done';
    },
    /** The finished press-and-hold (Q-HOLD-RING A bar): complete without payment. The due amount is kept on record. */
    completeUnpaid(orderId: string, reason = ''): boolean {
      const o = order(orderId);
      if (!o || o.cancel || !o.sent || completed(o)) return false;
      const owed = Math.max(0, due(o));
      log.dispatch('order.complete', { orderId, unpaid: owed > 0, dueAt: owed, reason: reason.trim().slice(0, CONFIG.limits.noteMaxChars) });
      toast(owed > 0 ? `Completed #${tok(o.token)} · ${formatInr(owed)} not collected` : `Completed #${tok(o.token)}`);
      return true;
    },
  };
}

/** P2 Unpaid tab (s120), order view (s121/s122) and Drafts sheet (s123). */
function viewActions(core: Core, { st, ui, order, toast, log }: Ctx) {
  return {
    viewOrder(orderId: string) { ui({ orderView: orderId, sheet: null }); },
    /** s121 Take payment: the order's Payment page on New Orders. */
    takePayment(orderId: string) {
      if (!order(orderId)) return;
      core.set((s) => ({ ui: { ...s.ui, counterTab: 'new', orderView: null, orderId, sheet: null, pages: { ...s.ui.pages, [orderId]: 'payment' } } }));
    },
    /** s123 Discard (second tap): only a draft nobody paid for or sent, and not one another phone is using. */
    discardDraft(orderId: string): boolean {
      const o = order(orderId);
      if (!o || o.sent || o.payments.length > 0) return false;
      const s = st();
      const h = holding(o, s.prefs.deviceId, { heard: s.heard, since: s.syncSince }, core.env.now());
      if (h.kind === 'busy') { toast(`${h.label} is using this order`); return false; }
      log.dispatch('order.delete', { orderId });
      if (s.ui.orderId === orderId) ui({ orderId: null });
      toast(`Draft #${tok(o.token)} discarded`);
      return true;
    },
  };
}

export function openActions(core: Core, log: Log) {
  const x = makeCtx(core, log);
  return { ...navActions(core, x), ...lineActions(x), ...completeActions(x), ...viewActions(core, x) };
}
export type OpenActions = ReturnType<typeof openActions>;
