// The store core: owns the in-memory op log and the folded state; the only caller of data/ (ARCHITECTURE §2, §4).
import { CONTRACT_VERSION, compareOps, type Bodies, type Op, type OpKind } from '../contract';
import type { DataSource, DevicePrefs, SyncEngine, SyncStatus } from '../data';
import { applyOp, fold } from './fold/fold';
import { emptyFolded, type Folded } from './fold/state';
import { initialUi, type UiState } from './ui';

export interface CoreState {
  readonly ready: boolean;
  readonly folded: Folded;
  readonly prefs: DevicePrefs;
  readonly ui: UiState;
  readonly saveError: string | null;
  readonly unsaved: readonly Op[];
  readonly sync: SyncStatus;
  /** No usable IndexedDB: orders live in this tab only (calm banner). */
  readonly memoryOnly: boolean;
  /** s127: when this phone last heard from each other device (by devKey), on this phone's clock. Not synced. */
  readonly heard: Readonly<Record<string, number>>;
  /** s127: when sync started this session (null = no sync set up on this phone). */
  readonly syncSince: number | null;
}

export interface Env {
  readonly ds: DataSource;
  readonly engine: SyncEngine;
  readonly makeId: () => string;
  readonly now: () => number;
}

export interface Core {
  get(): CoreState;
  set(patch: Partial<CoreState> | ((s: CoreState) => Partial<CoreState>)): void;
  env: Env;
}

/** F-44: a phone set up by a sign-in link opens on its role's screen. */
function uiForRole(role: string): CoreState['ui'] {
  if (role === 'counter' || role === 'kitchen') return { ...initialUi, screen: role };
  if (role.startsWith('station:')) return { ...initialUi, screen: 'station', station: { id: role.slice(8), from: 'launch', orderId: null } };
  return initialUi;
}

/** PK-5 A (W-44): a device last used as the Kitchen or a Station reopens there; Counter devices still see Launch. */
const kitchenResume = (last: string): string => (last === 'kitchen' || last.startsWith('station:') ? last : '');

export const initialCore = (prefs: DevicePrefs): CoreState => ({
  ready: false, folded: emptyFolded(), prefs, ui: uiForRole(prefs.role || kitchenResume(prefs.lastRole)), saveError: null, unsaved: [],
  sync: { pending: 0, lastOkAt: null, error: null, online: false }, memoryOnly: false, heard: {}, syncSince: null,
});

/** s127: note other devices' ops as "heard from now" (writer = first 8 of the device id + '.' + load id). */
function heardFrom(core: Core, ops: readonly Op[], self: string) {
  const mine = self.split('.')[0] ?? '';
  const keys = [...new Set(ops.map((o) => o.writer.split('.')[0] ?? '').filter((k) => k && k !== mine && o0(k)))];
  if (!keys.length) return;
  const t = core.env.now();
  core.set((s) => ({ heard: { ...s.heard, ...Object.fromEntries(keys.map((k) => [k, t])) } }));
}
const o0 = (k: string) => k !== 'sheet';

/** Save ops; a failure keeps them in `unsaved` and shows the banner (never silent). */
function makePersist(core: Core) {
  return (ops: readonly Op[]) => {
    core.env.ds.ops.append(ops).then(
      () => {
        core.set((s) => {
          const unsaved = s.unsaved.filter((u) => !ops.some((o) => o.opId === u.opId));
          return { unsaved, saveError: unsaved.length ? s.saveError : null };
        });
      },
      (e: unknown) => {
        const msg = e instanceof DOMException && e.name === 'QuotaExceededError' ? 'This phone is out of storage space.' : 'This phone could not save the last change.';
        core.set((s) => ({ saveError: msg, unsaved: [...s.unsaved, ...ops.filter((o) => !s.unsaved.some((u) => u.opId === o.opId))] }));
      },
    );
  };
}

/** Ops whose result can change which stations a Priority order needs (Q-PAUSE-1 A). */
const FOLLOW_KINDS: ReadonlySet<OpKind> = new Set<OpKind>(['line.status', 'line.finish', 'line.qty', 'order.priority', 'order.send', 'order.delete', 'order.cancel', 'payment.add']);
/** Derived status ops to write after a local op (pure; see store/rules/kitchen.ts pauseMoves). */
export type Follow = (f: Folded) => readonly Bodies['line.status'][];

export function createLog(core: Core, writer: string, follow: Follow | null = null) {
  let log: Op[] = [];
  let seq = 0;

  const persist = makePersist(core);
  const put = <K extends OpKind>(kind: K, body: Bodies[K]): Op => {
    const f = core.get().folded;
    seq += 1;
    const op = { v: CONTRACT_VERSION, opId: `${writer}:${String(seq)}`, writer, seq, lamport: f.lamport + 1, vv: f.seen, wallAt: core.env.now(), kind, body } as Op;
    log.push(op);
    core.set({ folded: applyOp(f, op) });
    persist([op]);
    core.env.ds.channel.post([op]);
    core.env.engine.enqueue([op]);
    return op;
  };

  return {
    load(ops: Op[]) {
      log = [...ops].sort(compareOps);
      core.set({ folded: fold(log), ready: true, memoryOnly: core.env.ds.ops.persistent?.() === false });
    },
    /** Make, apply and save one local op, then any derived pause / resume ops it causes (written as real ops, so
     * every device folds the same log; repeats from two devices set the same status and change nothing). */
    dispatch<K extends OpKind>(kind: K, body: Bodies[K]): Op {
      const op = put(kind, body);
      if (follow && FOLLOW_KINDS.has(kind)) for (const m of follow(core.get().folded)) put('line.status', m);
      return op;
    },
    /** Ops from other tabs or devices. Re-folds when they land in the past. */
    intake(ops: readonly Op[], save: boolean) {
      const f = core.get().folded;
      const fresh = ops.filter((o) => !f.applied.has(o.opId));
      if (!fresh.length) return;
      const last = log[log.length - 1];
      log = [...log, ...fresh].sort(compareOps);
      const inOrder = !last || fresh.every((o) => compareOps(o, last) > 0);
      core.set({ folded: inOrder ? fresh.sort(compareOps).reduce(applyOp, f) : fold(log) });
      if (save) persist(fresh);
      heardFrom(core, fresh, writer);
    },
    retrySave() { persist(core.get().unsaved); },
    all: () => log,
  };
}
export type Log = ReturnType<typeof createLog>;
