// s127 take-over (Q-TAKE-1a, Q-TAKE-2a; D-TAKE-1..6). Actions plus one watcher that claims the order on screen, lets go
// of the one left behind, waits (10 s checks) for an order another phone holds, and says when it comes free.
import { CONFIG } from '../config';
import type { ToastAction } from './ui';
import type { Core, Log } from './core';
import { completed } from './rules/status';
import { devKey, holding, phoneLabel, type Holding } from './rules/handling';
import { formatToken } from './rules/tokens';
import type { CoreState } from './core';

/** The order this phone is "handling": on screen in the Counter (New Orders, or the full order view). */
export const focusOf = (s: CoreState): string | null =>
  s.ui.screen !== 'counter' ? null : (s.ui.orderView ?? (s.ui.counterTab === 'new' ? s.ui.orderId : null));

export function handlingActions(core: Core, log: Log, sync: () => Promise<void>) {
  const st = () => core.get();
  const now = () => core.env.now();
  const me = () => st().prefs.deviceId;
  const ui = (patch: Partial<CoreState['ui']>) => { core.set((s) => ({ ui: { ...s.ui, ...patch } })); };
  const toast = (text: string, action?: ToastAction) => {
    core.set((s) => ({ ui: { ...s.ui, toast: { text, id: (s.ui.toast?.id ?? 0) + 1, ...(action ? { action } : {}) } } }));
  };
  const tok = (orderId: string) => { const o = st().folded.orders[orderId]; return o ? formatToken(o.token, CONFIG.tokens.pad) : 'The order'; };
  const mineNow = (orderId: string) => { const h = st().folded.orders[orderId]?.handler; return !!h && devKey(h.deviceId) === devKey(me()); };
  const self = {
    /** Who has this order, seen from this phone. */
    of(orderId: string): Holding { return holding(st().folded.orders[orderId], me(), { heard: st().heard, since: st().syncSince }, now()); },
    /** This phone took the order earlier and another phone has it now (s127b view-only). */
    displaced(orderId: string): boolean { return st().ui.heldHere.includes(orderId) && self.of(orderId).kind === 'busy'; },
    claim(orderId: string, takeover = false): void {
      const o = st().folded.orders[orderId];
      if (!o || o.deleted || o.cancel || completed(o) || (!takeover && mineNow(orderId))) return;
      const p = st().prefs;
      log.dispatch('order.handle', { orderId, deviceId: p.deviceId, label: phoneLabel(p.rangeIndex, p.servingName), takeover });
      if (!st().ui.heldHere.includes(orderId)) ui({ heldHere: [...st().ui.heldHere, orderId] });
    },
    /** Let go (Back, another order, Cancel, Complete, hidden): written and sent at once so a waiting phone gets it. */
    release(orderId: string, reason: string): void {
      if (!mineNow(orderId)) return;
      log.dispatch('order.release', { orderId, deviceId: me(), reason });
      void sync();
    },
  };
  return { ...self, ...flowsOf(core, self, sync, { ui, toast, tok }) };
}
export type HandlingActions = ReturnType<typeof handlingActions>;

interface Bits { ui: (p: Partial<CoreState['ui']>) => void; toast: (t: string, a?: ToastAction) => void; tok: (id: string) => string }
interface Base { claim(orderId: string, takeover?: boolean): void }
function flowsOf(core: Core, base: Base, sync: () => Promise<void>, { ui, toast, tok }: Bits) {
  const st = () => core.get();
  const self = {
    /** s127a / s127b Take over: this phone has it now; the other phone goes view-only. */
    takeOver(orderId: string): void {
      base.claim(orderId, true);
      ui({ waitFor: null, waitLabel: '' });
      void sync();
      toast(`${tok(orderId)} is yours now`);
    },
    /** s127a Check now (Steve pt9u): check the other phone at once. */
    checkNow(): void { ui({ nextCheckAt: core.env.now() + CONFIG.handling.checkMs }); void sync(); },
    /** s127a Back: stop waiting and leave the order. */
    leave(): void {
      const s = st().ui;
      ui({ waitFor: null, waitLabel: '', ...(s.orderView ? { orderView: null } : { orderId: null }) });
    },
    /** Toast "Open": bring a freed order on screen. */
    open(orderId: string): void {
      const o = st().folded.orders[orderId];
      if (!o) return;
      core.set((s) => ({ ui: { ...s.ui, screen: 'counter', counterTab: 'new', orderView: null, orderId, sheet: null, pages: { ...s.ui.pages, [orderId]: s.ui.pages[orderId] ?? (o.sent ? 'billing' : 'menu') } } }));
    },
    /** The waited-for order came free: open it here (when on screen) or offer it in a toast (Steve 17 Nov 15:52). */
    freed(orderId: string, onScreen: boolean, label: string): void {
      const o = st().folded.orders[orderId]; // read before the ui change below (it re-runs the watcher, which may claim)
      const quiet = !!o?.handler && o.handler.deviceId.slice(0, 8) !== st().prefs.deviceId.slice(0, 8);
      ui({ waitFor: null, waitLabel: '' });
      if (!o || o.deleted) { toast(`${tok(orderId)} was removed`); return; }
      if (o.cancel) { toast(`${tok(orderId)} was cancelled${label ? ` on ${label}` : ''}`); return; }
      if (completed(o)) { toast(`${tok(orderId)} is complete`); return; }
      const who = label || 'The other phone';
      if (onScreen) { base.claim(orderId); toast(`${quiet ? `${who} has gone quiet` : `${who} is done`} · ${tok(orderId)} is yours now`); return; }
      toast(`${tok(orderId)} is free now`, { label: 'Open', run: 'open', orderId });
    },
  };
  return self;
}

type Full = CoreState & { readonly handling: HandlingActions };
export interface WatchApi {
  getState(): Full;
  subscribe(f: (s: Full, p: Full) => void): () => void;
  setUi(patch: Partial<CoreState['ui']>): void;
}

/** One watcher (store-owned): claim on focus, release when left (after a short grace, so tab flips cost nothing), wait
 * and poll for a busy order, notice when it frees, and let go when the app is hidden for 30 s (Q-TAKE-WHEN A). */
export function watchHandling(api: WatchApi): void {
  const later = new Map<string, ReturnType<typeof setTimeout>>();
  let poll: ReturnType<typeof setInterval> | null = null;
  const cancel = (id: string) => { const t = later.get(id); if (t) clearTimeout(t); later.delete(id); };
  const releaseLater = (id: string, ms: number, why: string) => {
    cancel(id);
    later.set(id, setTimeout(() => { later.delete(id); if (why === 'hidden' || focusOf(api.getState()) !== id) api.getState().handling.release(id, why); }, ms));
  };
  const startPoll = () => {
    if (poll) return;
    poll = setInterval(() => {
      if (api.getState().ui.waitFor) { api.getState().handling.checkNow(); return; }
      if (poll) clearInterval(poll);
      poll = null;
    }, CONFIG.handling.checkMs);
  };
  const onFocus = focusHandler(api, cancel);
  const sent = new Set<string>();
  const evaluate = (s: Full, prev: Full) => {
    const cur = focusOf(s);
    const was = focusOf(prev);
    for (const id of [was, cur]) if (id && !sent.has(id) && finished(s, id)) { sent.add(id); s.handling.release(id, 'finished'); } // cancel/complete: send at once
    // Back-out (left the Counter, or a different order now): send at once. A tab flip on the same order: short grace.
    if (was && was !== cur && s.ui.screen === 'counter' && s.ui.orderId === was) releaseLater(was, CONFIG.handling.switchGraceMs, 'switch');
    else if (was && was !== cur) { cancel(was); s.handling.release(was, 'back'); }
    if (cur) onFocus(cur);
    const now2 = api.getState();
    const w = now2.ui.waitFor;
    if (w && now2.handling.of(w).kind !== 'busy') now2.handling.freed(w, focusOf(now2) === w, now2.ui.waitLabel);
    if (api.getState().ui.waitFor) startPoll();
  };
  api.subscribe((s, prev) => { if (s.ready) evaluate(s, prev); });
  onHidden(api, releaseLater, cancel);
}

/** This phone still holds an order that was just cancelled or completed. */
function finished(s: Full, id: string): boolean {
  const o = s.folded.orders[id];
  return !!o?.handler && !o.deleted && devKey(o.handler.deviceId) === devKey(s.prefs.deviceId) && (!!o.cancel || completed(o));
}

/** On screen: claim a free order; wait for a busy one; when a waited-for or taken-away order comes free, bring it in. */
function focusHandler(api: WatchApi, cancel: (id: string) => void) {
  const ousted = new Map<string, string>(); // orders taken from this phone (s127b), by who took them
  return (cur: string) => {
    cancel(cur);
    const s = api.getState();
    const k = s.handling.of(cur);
    const was = s.ui.waitFor === cur ? s.ui.waitLabel : ousted.get(cur);
    if (k.kind === 'free' && was !== undefined) { ousted.delete(cur); s.handling.freed(cur, true, was); return; }
    if (k.kind === 'free') { s.handling.claim(cur); return; }
    if (k.kind === 'busy' && s.handling.displaced(cur)) { ousted.set(cur, k.label); return; }
    if (k.kind === 'busy' && s.ui.waitFor !== cur) {
      api.setUi({ waitFor: cur, waitLabel: k.label });
      s.handling.checkNow();
    }
  };
}

/** Q-TAKE-WHEN A: an app hidden for 30 s lets go of its order; back on screen it checks again at once. */
function onHidden(api: WatchApi, releaseLater: (id: string, ms: number, why: string) => void, cancel: (id: string) => void) {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    const id = focusOf(api.getState());
    if (!id) return;
    if (document.visibilityState === 'hidden') releaseLater(id, CONFIG.handling.hiddenReleaseMs, 'hidden');
    else { cancel(id); api.getState().handling.checkNow(); }
  });
}
