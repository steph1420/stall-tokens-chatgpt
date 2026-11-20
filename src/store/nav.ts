// F-56 W-13 / W-24 one navigation owner (06 rule 2): the phone's Back closes the top sheet, then steps back through the
// Counter, then the screen, and never leaves the app mid-order. Pure step + the history trap the App arms.
import type { CoreState } from './core';
import type { UiState } from './ui';

/** What one Back press changes (null = nothing left to close: the launch screen, where Back may leave the app). */
export function backStep(s: CoreState): Partial<UiState> | null {
  const u = s.ui;
  if (u.sheet) return { sheet: null };
  if (u.screen === 'counter') {
    if (u.waitFor && (u.orderView ?? u.orderId) === u.waitFor) return u.orderView ? { orderView: null, waitFor: null, waitLabel: '' } : { orderId: null, waitFor: null, waitLabel: '' };
    if (u.orderView) return { orderView: null };
    if (u.counterTab !== 'new') return { counterTab: 'new' };
    const page = u.orderId ? u.pages[u.orderId] : undefined;
    if (u.orderId && page === 'payment') return { pages: { ...u.pages, [u.orderId]: 'billing' } };
    if (u.orderId && page === 'billing') return { pages: { ...u.pages, [u.orderId]: 'menu' } };
    return { screen: 'launch' };
  }
  if (u.screen === 'station') return { screen: u.station?.from ?? 'launch' };
  if (u.screen === 'kitchen') return { screen: 'launch' };
  if (u.screen !== 'launch') return { screen: u.stallFrom, unlocked: false };
  return null;
}
