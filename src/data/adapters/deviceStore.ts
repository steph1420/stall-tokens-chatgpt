// Device prefs in localStorage under the storage prefix. Bad or missing data falls back to defaults.
import { CONFIG } from '../../config';
import type { DevicePrefs, DeviceStore } from '../types';

export const PREFS_KEY = `${CONFIG.storage.prefix}.device`;
/** This tab's own place (sessionStorage): a reload keeps the tab where it was, even when another tab on the same device is the Kitchen. */
export const TAB_ROLE_KEY = `${CONFIG.storage.prefix}.tabRole`;
const ROLE_RE = /^(counter|kitchen|station:\S{1,40})$/;

function readTabRole(tab: Storage | null): string | null {
  try {
    const v = tab?.getItem(TAB_ROLE_KEY) ?? null;
    return v !== null && (v === '' || ROLE_RE.test(v)) ? v : null;
  } catch { return null; } // Blocked sessionStorage: fall back to the device's last place.
}

export const defaultPrefs = (makeId: () => string): DevicePrefs => ({
  deviceId: makeId(), theme: 'night', servingName: '', rangeIndex: 0, haptics: 'normal', autoPrep: true, stationLook: 'full', openLook: 'lines', passcode: '', passcodeOff: true, syncUrl: CONFIG.sync.bakedUrl, syncKey: CONFIG.sync.bakedKey, role: '',
  orderId: '', page: 'menu', lastRole: '', kitchenText: 'normal', quiet: false, countNotesOpen: false, alertTone: 'chime', nextOrderDelaySec: 2,
});

function merge(base: DevicePrefs, raw: unknown): DevicePrefs {
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<Record<keyof DevicePrefs, unknown>>;
  const pick = <K extends keyof DevicePrefs>(k: K, ok: (v: unknown) => boolean): DevicePrefs[K] => (ok(r[k]) ? r[k] as DevicePrefs[K] : base[k]);
  return {
    deviceId: pick('deviceId', (v) => typeof v === 'string' && v.length >= 8),
    theme: pick('theme', (v) => v === 'night' || v === 'day' || v === 'auto'),
    servingName: pick('servingName', (v) => typeof v === 'string'),
    rangeIndex: pick('rangeIndex', (v) => typeof v === 'number' && v >= 0 && v < CONFIG.tokens.ranges.length),
    haptics: pick('haptics', (v) => v === 'off' || v === 'light' || v === 'normal' || v === 'strong'),
    autoPrep: pick('autoPrep', (v) => typeof v === 'boolean'),
    stationLook: pick('stationLook', (v) => v === 'full' || v === 'items' || v === 'ticket'),
    openLook: pick('openLook', (v) => v === 'lines' || v === 'cards'),
    passcode: pick('passcode', (v) => typeof v === 'string' && /^(\d{4})?$/.test(v)),
    passcodeOff: pick('passcodeOff', (v) => typeof v === 'boolean'),
    syncUrl: pick('syncUrl', (v) => typeof v === 'string'),
    syncKey: pick('syncKey', (v) => typeof v === 'string'),
    role: pick('role', (v) => typeof v === 'string' && (v === '' || /^(counter|kitchen|launch|station:\S{1,40})$/.test(v))),
    orderId: pick('orderId', (v) => typeof v === 'string' && v.length <= 80),
    page: pick('page', (v) => v === 'menu' || v === 'billing' || v === 'payment'),
    lastRole: pick('lastRole', (v) => typeof v === 'string' && (v === '' || ROLE_RE.test(v))),
    kitchenText: pick('kitchenText', (v) => v === 'normal' || v === 'large' || v === 'xl'),
    quiet: pick('quiet', (v) => typeof v === 'boolean'),
    countNotesOpen: pick('countNotesOpen', (v) => typeof v === 'boolean'),
    alertTone: pick('alertTone', (v) => v === 'chime' || v === 'bell' || v === 'pluck' || v === 'harp'),
    nextOrderDelaySec: pick('nextOrderDelaySec', (v) => typeof v === 'number' && v >= 0 && v <= 10),
  };
}

export function createDeviceStore(storage: Storage | null, makeId: () => string, tab: Storage | null = null): DeviceStore {
  let memory: DevicePrefs | null = null;
  const saveDevice = (prefs: DevicePrefs) => {
    try { storage?.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {
      // Private mode or full storage: prefs live in memory for this session; the op log is unaffected.
      console.warn('device prefs not saved', e);
    }
  };
  return {
    read() {
      if (memory) return memory;
      let raw: unknown;
      try { raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null'); } catch (e) {
        // Corrupt prefs: start from defaults rather than block the counter.
        console.warn('device prefs unreadable, using defaults', e);
        raw = null;
      }
      memory = merge(defaultPrefs(makeId), raw);
      const own = readTabRole(tab);
      if (own === null) this.write(memory);
      else {
        saveDevice(memory); // the device's place stays as read; this tab keeps its own
        memory = { ...memory, lastRole: own };
      }
      return memory;
    },
    write(prefs) {
      memory = prefs;
      saveDevice(prefs);
      try { tab?.setItem(TAB_ROLE_KEY, prefs.lastRole); } catch (e) {
        console.warn('tab place not saved; the device place still works', e);
      }
    },
  };
}
