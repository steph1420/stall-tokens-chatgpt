// F-49 P0 edge cases: Beta by path and by env, Beta always wins, and every storage name (op log, receipts, device
// prefs, tab channel) is Beta's own, with no baked sync link or key. Modules are re-imported per channel.
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  const cfg = await import('./index');
  const idb = await import('../data/adapters/localIdb');
  const rec = await import('../data/adapters/receipts');
  const dev = await import('../data/adapters/deviceStore');
  return { CONFIG: cfg.CONFIG, DB_NAME: idb.DB_NAME, RECEIPTS: rec.DB, PREFS_KEY: dev.PREFS_KEY, defaults: dev.defaultPrefs(() => 'id-00000001') };
}
const channelName = async () => {
  const names: string[] = [];
  const Real = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = class { constructor(n: string) { names.push(n); } postMessage() { /* noop */ } addEventListener() { /* noop */ } removeEventListener() { /* noop */ } close() { /* noop */ } } as unknown as typeof BroadcastChannel;
  try { (await import('../data/adapters/tabChannel')).createTabChannel(); } finally { globalThis.BroadcastChannel = Real; }
  return names[0];
};

afterEach(() => { vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });

describe('channel isolation (F-49)', () => {
  it('a page under /stall-tokens-beta/ is Beta even without VITE_CHANNEL: every name is Beta\'s', async () => {
    vi.stubEnv('VITE_CHANNEL', '');
    vi.stubEnv('VITE_SYNC_URL', 'https://example.invalid/should-not-bake');
    vi.stubEnv('VITE_SYNC_KEY', 'not-a-real-key');
    window.history.replaceState(null, '', '/stall-tokens-beta/');
    const x = await load();
    expect(x.CONFIG.app.channel).toBe('beta');
    expect(x.DB_NAME).toBe('stall-tokens-beta.v2.log');
    expect(x.RECEIPTS).toBe('stall-tokens-beta.v2.receipts');
    expect(x.PREFS_KEY).toBe('stall-tokens-beta.v2.device');
    expect(await channelName()).toBe('stall-tokens-beta.v2.ops');
    expect(x.CONFIG.sync.bakedUrl).toBe('');
    expect(x.CONFIG.sync.bakedKey).toBe('');
    expect(x.defaults.syncUrl).toBe('');
    expect(x.defaults.syncKey).toBe('');
  });
  it('VITE_CHANNEL=beta wins at any path (Beta always wins)', async () => {
    vi.stubEnv('VITE_CHANNEL', 'beta');
    window.history.replaceState(null, '', '/stall-tokens/');
    const x = await load();
    expect(x.CONFIG.app.channel).toBe('beta');
    expect(x.DB_NAME.startsWith('stall-tokens-beta.v2')).toBe(true);
  });
  it('Stable keeps its names and may carry a baked sync link (F-44); a look-alike path is not Beta', async () => {
    vi.stubEnv('VITE_CHANNEL', '');
    vi.stubEnv('VITE_SYNC_URL', 'https://example.invalid/stable');
    window.history.replaceState(null, '', '/stall-tokens-betaX/');
    const x = await load();
    expect(x.CONFIG.app.channel).toBe('stable');
    expect(x.DB_NAME).toBe('stall-tokens.v2.log');
    expect(x.RECEIPTS).toBe('stall-tokens.v2.receipts');
    expect(x.PREFS_KEY).toBe('stall-tokens.v2.device');
    expect(await channelName()).toBe('stall-tokens.v2.ops');
    expect(x.CONFIG.sync.bakedUrl).toBe('https://example.invalid/stable');
  });
});
