// F-44 One-tap sign-in links (Steve 16 Nov 19:33 IST): a link per person / role carries the Sheet bridge URL, the stall
// key, the role and the name in the URL fragment (#join=…), which browsers never send to a server. Opening it sets up
// this phone and opens that role's screen. Revoking: change STALL_KEY on the script; old links stop syncing.
import type { DevicePrefs, DeviceStore } from './types';

export interface JoinLink { readonly url: string; readonly key: string; readonly role: string; readonly name: string }
const ROLE = /^(counter|kitchen|launch|station:[^\s]{1,40})$/;
export const isRole = (r: string): boolean => ROLE.test(r);

const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+(\/exec)?(\?.*)?$/;
export const isAllowedJoinUrl = (u: string): boolean =>
  SCRIPT_URL_RE.test(u.trim()) || /^https?:\/\/localhost(:\d+)?\//.test(u.trim());

const toB64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

/** The link for one person: `<app>#join=<base64url JSON>`. */
export function joinUrl(appUrl: string, j: JoinLink): string {
  return `${appUrl.split('#')[0] ?? appUrl}#join=${toB64url(JSON.stringify({ v: 1, u: j.url, k: j.key, r: j.role, n: j.name }))}`;
}

/** Reads `#join=…`; null when absent or not a valid v1 link. Only whitelisted Google Script or localhost URLs are accepted (SEC-01). */
export function readJoin(hash: string): JoinLink | null {
  const m = /(?:^#|&)join=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m?.[1]) return null;
  try {
    const d = JSON.parse(fromB64url(m[1])) as Record<string, unknown>;
    if (d.v !== 1 || typeof d.u !== 'string' || typeof d.k !== 'string' || typeof d.r !== 'string' || typeof d.n !== 'string') return null;
    if (!isAllowedJoinUrl(d.u) || !isRole(d.r)) return null;
    return { url: d.u, key: d.k, role: d.r, name: d.n.slice(0, 40) };
  } catch { return null; }
}

/** Applies a join link from the address bar to this device's prefs, with overwrite confirmation gate (SEC-01). */
export function applyJoinFromLocation(device: DeviceStore, confirmOverwrite?: (incomingUrl: string) => boolean): boolean {
  if (typeof location === 'undefined') return false;
  const j = readJoin(location.hash);
  if (!j) return false;
  const cur = device.read();
  if (cur.syncUrl && cur.syncUrl.trim() !== '' && cur.syncUrl !== j.url) {
    const ok = confirmOverwrite
      ? confirmOverwrite(j.url)
      : (typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`Connect to new sync endpoint: ${j.url}?\nThis will replace your current sync configuration.`)
          : false);
    if (!ok) {
      history.replaceState(null, '', location.pathname + location.search);
      return false;
    }
  }
  const patch: Partial<DevicePrefs> = { syncUrl: j.url, syncKey: j.key, role: j.role, ...(j.name ? { servingName: j.name } : {}) };
  device.write({ ...device.read(), ...patch });
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}
