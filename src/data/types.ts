// data/: interfaces for every outside system (06 rule 4). Only store/ calls data/. Each has a fake.
import type { Op } from '../contract';

/** The op log on this device. */
export interface OpStore {
  load(): Promise<Op[]>;
  /** Append ops; duplicates by opId are ignored. Rejects on quota or private-mode errors. */
  append(ops: readonly Op[]): Promise<void>;
  /** False when ops live in memory only (no usable IndexedDB). Absent = persistent. */
  persistent?(): boolean;
}

/** Q-HARM-10 gap-safe: the other side lists writers whose ops it is missing from `fromSeq` on. */
export interface Resend { readonly writer: string; readonly fromSeq: number }
export interface PushResult { readonly stored: string[]; readonly resend: readonly Resend[] }

/** s127 presence beat (Q-TAKE-ALIVE A): who this phone is and which order it has open ('' = none). */
export interface Beat { readonly deviceId: string; readonly label: string; readonly orderId: string }
/** A phone the bridge heard from, with its age by the bridge's clock (skew-free). Outside the op log. */
export interface Seen { readonly deviceId: string; readonly label: string; readonly orderId: string; readonly ageMs: number }

/** One way ops travel between devices (Sheet bridge now; Bluetooth / local peer later). ARCHITECTURE §4.3. */
export interface Transport {
  /** Optional presence: send this phone's beat, get every phone heard from. null = this bridge keeps no presence. */
  beat?(b: Beat): Promise<readonly Seen[] | null>;
  readonly name: string;
  /** Send ops; resolves with the opIds the other side has stored, and any seq gaps it wants resent (Q-HARM-10). */
  push(ops: readonly Op[]): Promise<PushResult>;
  /** Fetch ops after the cursor. */
  pull(cursor: string): Promise<{ ops: Op[]; cursor: string }>;
}

/** Same-device tabs. */
export interface TabChannel {
  post(ops: readonly Op[]): void;
  subscribe(listener: (ops: Op[]) => void): () => void;
}

export interface DevicePrefs {
  deviceId: string;
  theme: 'night' | 'day' | 'auto';
  servingName: string;
  rangeIndex: number;
  haptics: 'off' | 'light' | 'normal' | 'strong';
  autoPrep: boolean;
  stationLook: 'full' | 'items' | 'ticket';
  /** Q-ORDERS-5: Open Orders body look. */
  openLook: 'lines' | 'cards';
  /** D-ACCESS: 4-digit device passcode for Money, Settle up and Settings ('' = not set yet). A light gate, not a login. */
  passcode: string;
  /** D-ACCESS Developer switch: no passcode on this device. */
  passcodeOff: boolean;
  /** F-35 Sheet bridge web-app URL and stall key on this phone ('' = not set up; the app stays local). */
  syncUrl: string;
  syncKey: string;
  /** F-44 role this phone opens on ('' = launch screen): counter, kitchen, launch or station:<id>. */
  role: string;
  /** W-12 resume (2.1.0, FEATURES §0.1 "which order is on screen"): the Counter's current order and its page. '' = none. */
  orderId: string;
  page: 'menu' | 'billing' | 'payment';
  /** PK-5: the screen this device was last used as ('' = launch), so a Kitchen or Station device reopens there. */
  lastRole: string;
  /** Per-device display (FEATURES §0.1): kitchen text size and Quiet (no alert sound). */
  kitchenText: 'normal' | 'large' | 'xl';
  quiet: boolean;
  /** D-PAY5-1: Count notes drawer on Payment, remembered on this phone. Default hidden. */
  countNotesOpen: boolean;
  /** Q-KITCHEN-ALERT: Chime + flash with selectable tone (Steve locked). */
  alertTone: 'chime' | 'bell' | 'pluck' | 'harp';
  /** Switch delay in seconds (0..10) before station starts cooking next order. Default: 2. */
  nextOrderDelaySec: number;
}

export interface BackupMeta {
  readonly contractVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly deviceId: string;
  readonly opCount: number;
  readonly hash: string;
}

export interface BackupFileContent {
  readonly meta: BackupMeta;
  readonly ops: readonly Op[];
  readonly prefs?: Partial<DevicePrefs> | undefined;
}

export interface SnapshotSummary {
  readonly id: string;
  readonly createdAt: number;
  readonly reason: string;
  readonly opCount: number;
  readonly hash: string;
}

export interface SnapshotRecord extends SnapshotSummary {
  readonly ops: readonly Op[];
  readonly prefs?: Partial<DevicePrefs> | undefined;
}

export interface SnapshotsStore {
  save(reason: string, ops: readonly Op[], prefs?: Partial<DevicePrefs>): Promise<string>;
  list(): Promise<readonly SnapshotSummary[]>;
  load(id: string): Promise<SnapshotRecord | null>;
  delete(id: string): Promise<void>;
}

/** Per-device settings (not synced on purpose). */
export interface DeviceStore {
  read(): DevicePrefs;
  write(prefs: DevicePrefs): void;
}

export interface StorageEstimate {
  readonly usageBytes: number;
  readonly quotaBytes: number;
  readonly warning: boolean;
  readonly persisted: boolean;
}

export interface StorageInfoStore {
  estimate(): Promise<StorageEstimate>;
  persist(): Promise<boolean>;
}

export interface DataSource {
  readonly ops: OpStore;
  readonly device: DeviceStore;
  readonly channel: TabChannel;
  readonly transports: readonly Transport[];
  readonly snapshots?: SnapshotsStore | undefined;
  readonly storageInfo?: StorageInfoStore | undefined;
  readonly syncState?: import('./adapters/syncState').SyncStateStore | undefined;
}
