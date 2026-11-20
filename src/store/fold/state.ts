// F-02 Folded state: everything shared is derived from the op log; nothing here is written by screens.
import type { Conflict, Day, DayLock, DeviceInfo, Entry, InfoRecord, Item, Order, Payee, Person, RecordTable, Settlement, SnapshotNote, VV } from '../../contract';

export interface LastWrite { readonly writer: string; readonly seq: number; readonly opId: string }
export interface Folded {
  readonly items: Readonly<Record<string, Item>>;
  readonly orders: Readonly<Record<string, Order>>;
  readonly orderIds: readonly string[]; // creation order
  readonly days: readonly Day[];
  readonly payees: Readonly<Record<string, Payee>>;
  readonly settings: Readonly<Record<string, string>>;
  readonly people: Readonly<Record<string, Person>>;
  readonly entries: readonly Entry[];
  readonly settlements: readonly Settlement[];
  readonly locks: Readonly<Record<string, DayLock>>;
  /** F-48 info records per table (business, event, source, …). */
  readonly records: Readonly<Partial<Record<RecordTable, Readonly<Record<string, InfoRecord>>>>>;
  readonly conflicts: readonly Conflict[];
  /** Q-SYNC-ALL device registry (deviceId → label, token range, role). */
  readonly devices: Readonly<Record<string, DeviceInfo>>;
  /** Q-SYNC-ALL snapshot metadata, oldest first, one per snapshotId. */
  readonly snapshots: readonly SnapshotNote[];
  readonly seen: VV; // highest seq per writer (the local version vector)
  readonly gaps: Readonly<Record<string, number>>; // writer -> count of missing seqs
  readonly lamport: number;
  readonly applied: ReadonlySet<string>;
  readonly lastWrite: Readonly<Record<string, LastWrite>>;
}

export const emptyFolded = (): Folded => ({
  items: {}, orders: {}, orderIds: [], days: [], payees: {}, settings: {}, people: {}, entries: [], settlements: [], locks: {}, records: {}, conflicts: [], devices: {}, snapshots: [],
  seen: {}, gaps: {}, lamport: 0, applied: new Set(), lastWrite: {},
});
