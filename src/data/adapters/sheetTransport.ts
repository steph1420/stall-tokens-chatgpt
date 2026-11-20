// F-35 Sheet bridge transport (D-SYNC): talks to the Apps Script web app in `apps-script/Code.gs` that keeps the op log
// in a Google Sheet. Plain-text JSON POSTs (no CORS preflight, which Apps Script cannot answer). The stall key is a
// shared word typed on each phone and checked by the script; it keeps strangers from writing, it is not a login.
import { CONFIG } from '../../config';
import type { Op } from '../../contract';
import type { Seen, Transport } from '../types';

export interface SheetConfig { readonly url: string; readonly key: string }
type Fetch = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: 'follow' }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/** A web-app URL we are willing to call: https only (the script's /exec URL in practice). */
export const isSheetUrl = (u: string): boolean => /^https:\/\/[^\s/]+\/\S+$/.test(u.trim());

function toSeen(x: unknown): Seen[] {
  const r = x as Partial<Record<keyof Seen, unknown>>;
  return typeof r.deviceId === 'string' && typeof r.ageMs === 'number'
    ? [{ deviceId: r.deviceId, label: typeof r.label === 'string' ? r.label : '', orderId: typeof r.orderId === 'string' ? r.orderId : '', ageMs: Math.max(0, r.ageMs) }]
    : [];
}

function toGap(r: unknown): { writer: string; fromSeq: number }[] {
  const x = r as { writer?: unknown; fromSeq?: unknown };
  return typeof x.writer === 'string' && typeof x.fromSeq === 'number' ? [{ writer: x.writer, fromSeq: x.fromSeq }] : [];
}

export function createSheetTransport(cfg: SheetConfig, doFetch: Fetch = (i, init) => fetch(i, init), name = 'sheet'): Transport {
  async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ac = new AbortController();
    const timer = setTimeout(() => { ac.abort(); }, CONFIG.sync.timeoutMs);
    try {
      const res = await doFetch(cfg.url.trim(), { method: 'POST', redirect: 'follow', signal: ac.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, key: cfg.key }) });
      if (!res.ok) throw new Error(`sheet: HTTP ${String(res.status)}`);
      const data: unknown = JSON.parse(await res.text());
      if (typeof data !== 'object' || data === null) throw new Error('sheet: bad reply');
      const d = data as Record<string, unknown>;
      if (d.ok !== true) throw new Error(`sheet: ${typeof d.error === 'string' ? d.error : 'refused'}`);
      return d;
    } finally { clearTimeout(timer); }
  }
  return {
    name,
    async push(ops: readonly Op[]) {
      if (!ops.length) return { stored: [], resend: [] };
      const d = await call({ action: 'push', ops });
      const stored = Array.isArray(d.stored) ? d.stored.filter((x): x is string => typeof x === 'string') : [];
      const resend = Array.isArray(d.resend) ? (d.resend as unknown[]).flatMap(toGap) : [];
      return { stored, resend };
    },
    /** s127 presence. A 2.0 bridge answers "unknown action": no presence there (null), the app falls back to ops. */
    async beat(b) {
      try {
        const d = await call({ action: 'beat', deviceId: b.deviceId, label: b.label, orderId: b.orderId });
        return Array.isArray(d.seen) ? (d.seen as unknown[]).flatMap(toSeen) : [];
      } catch (e) {
        if (e instanceof Error && e.message.includes('unknown action')) return null;
        throw e;
      }
    },
    async pull(cursor: string) {
      const d = await call({ action: 'pull', cursor });
      const ops = Array.isArray(d.ops) ? (d.ops as Op[]) : []; // the engine drops anything that is not a valid op
      return { ops, cursor: typeof d.cursor === 'string' ? d.cursor : cursor };
    },
  };
}
