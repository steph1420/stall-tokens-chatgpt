// Derived state shapes (the fold's output). Screens read these through the store.
import type { ClearReason, ItemFields, LineStatus, MoneyPart, MoneySource, PaySource, RefundLine } from './op';
import type { Paise } from './money';

export interface Item extends ItemFields { readonly id: string; readonly sold: number; readonly oversold: boolean }
export interface Line {
  readonly lineId: string; readonly itemId: string; readonly name: string; readonly price: Paise;
  readonly category: string; readonly stationId: string; readonly qty: number; readonly note: string; readonly status: LineStatus;
  readonly committed: number; // qty already taken out of stock (sent or paid)
  readonly byCounter: boolean; // Q-COUNTER-FINISH: Ready because the Counter marked it, not the station
  readonly restocked: number; // Q-REFUND-1 A: qty of this line put back to stock by live (not voided) refunds
}
export interface Discount { readonly kind: 'amount' | 'pct'; readonly value: number; readonly allowedBy: string; readonly note: string }
export interface Payment {
  readonly paymentId: string; readonly cash: Paise; readonly upi: Paise; readonly upiPayeeId: string | null; readonly tip: Paise;
  readonly waived: Paise; readonly waivedBy: string; readonly waivedNote: string; readonly cashGiven: Paise;
  readonly notes: Readonly<Record<string, number>>; readonly at: number; readonly writer: string;
}
/** Q-CANCEL-1 A: a cancelled order keeps its record; `refundDue` is what was paid at cancel time (Money settles it later). */
export interface Cancel { readonly reason: string; readonly at: number; readonly by: string; readonly refundDue: Paise }
export interface Refund {
  readonly refundId: string; readonly amount: Paise; readonly source: PaySource; readonly at: number;
  /** Q-REFUND-1 A (2.1.0): reason chip, refunded lines, back-to-stock lines actually applied (once, capped by committed qty). */
  readonly reason: string; readonly lines: readonly RefundLine[]; readonly restocked: readonly RefundLine[];
  /** Q-REFUND-INSTANT: set by `refund.void` (Undo). The refund stays on record, struck through; it no longer counts. */
  readonly voided: string | null;
  /** D-P4-REFUND-DUE (derived in the fold, not in the op): the part of this refund that gave back an overpayment (an edited-down
   * bill, F-18) at the moment it was applied. The rest is a refund of goods, which never makes the customer owe again. */
  readonly settled: Paise;
}
/** Q-HANDOVER-PAY revised / Q-COMPLETE-2 A: an explicit Complete. Written off = `unpaid` and money still due. */
export interface Completion { readonly unpaid: boolean; readonly dueAt: Paise; readonly reason: string; readonly at: number; readonly by: string }
/** Q-SYNC-ALL device registry row. */
export interface DeviceInfo { readonly id: string; readonly label: string; readonly rangeIndex: number; readonly role: string; readonly at: number }
/** Q-SYNC-ALL snapshot metadata (the content is the op log itself). */
export interface SnapshotNote { readonly id: string; readonly at: number; readonly reason: string; readonly opCount: number; readonly hash: string; readonly by: string }
export interface Order {
  readonly id: string; readonly dayId: string; readonly token: number; readonly servedBy: string; readonly createdAt: number;
  readonly lines: readonly Line[]; readonly note: string; readonly discount: Discount | null;
  readonly roundOff: { readonly amount: Paise; readonly forTotal: Paise } | null;
  readonly sent: boolean; readonly deleted: boolean; readonly priority: boolean; readonly client: string; readonly cancel: Cancel | null; readonly payments: readonly Payment[]; readonly refunds: readonly Refund[];
  readonly revision: number;
  /** 2.1.0: explicit Complete (null = not completed by the op; may still be complete by handover + paid). */
  readonly complete: Completion | null;
  /** Q-DRAFT-SYNC: label of the device that made the order ('' on older ops). */
  readonly device: string;
  /** s127 handling lease: the device that has this order open now (null = nobody). Liveness is checked against
   * presence (store/rules/handling.ts), never against wall clocks. */
  readonly handler: Handler | null;
}
export interface Handler { readonly deviceId: string; readonly label: string; readonly at: number; readonly takeover: boolean }
export interface Payee { readonly id: string; readonly name: string; readonly upiId: string }
export interface Day { readonly id: string; readonly label: string; readonly startedAt: number }
/** Q-HARM-10: a true clash (neither op had seen the other). `rule` says why the winner won: the later op in causal
 * (Lamport) order, or a Sheet hand edit (sheet wins). Shown under Settings > Sync > Review; tapping flips with a new op. */
export interface Conflict { readonly target: string; readonly field: string; readonly winner: string; readonly loser: string; readonly at: number; readonly rule: 'causal' | 'sheet-wins' | 'range-clash' }
/** F-48 one info record (business, event, source, …); fields keyed by Sheet column name. */
export interface InfoRecord { readonly id: string; readonly fields: Readonly<Record<string, string | number | boolean>>; readonly removed: boolean }
/** F-23 Spent / Received entry (Q-MONEY-V8, Q-RECV). `voided` keeps the record (History hold to cancel). */
export interface Entry {
  readonly id: string; readonly dayId: string; readonly dir: 'spent' | 'received'; readonly amount: Paise; readonly label: string;
  readonly kind: 'normal' | 'donation'; readonly parts: readonly MoneyPart[]; readonly note: string; readonly personId: string | null; readonly at: number; readonly by: string;
  readonly voided: string | null;
}
/** F-27 A person in the money book; partners carry a share per fair (Q-SETTLE-GAPS). Names are typed in the app only. */
export interface Person { readonly id: string; readonly name: string; readonly isPartner: boolean; readonly sharePct: number }
/** F-26..F-28 A repayment (Pay, partial allowed) or a Mark cleared; `undone` keeps the record (reversal, Q-SETTLE-GAPS). */
export interface Settlement {
  readonly id: string; readonly kind: 'pay' | 'clear'; readonly dayId: string; readonly personId: string; readonly amount: Paise;
  readonly via: MoneySource | null; readonly byPersonId: string | null; readonly reason: ClearReason | null; readonly note: string;
  readonly at: number; readonly undone: boolean;
}
/** F-29 Lock day after the partner split; reopen to edit. */
export interface DayLock { readonly locked: boolean; readonly split: Readonly<Record<string, Paise>>; readonly at: number }
