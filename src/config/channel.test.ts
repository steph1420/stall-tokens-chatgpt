// F-49 Beta / Stable channel (Q-CHANNEL A, Q-BETA-PATH B): detection, storage prefix, no baked sync on Beta.
import { describe, expect, it } from 'vitest';
import { CHANNELS, CONFIG, detectChannel } from './index';

describe('channel', () => {
  it('is Beta under the Beta path or with VITE_CHANNEL=beta, else Stable', () => {
    expect(detectChannel('', '/stall-tokens-beta/')).toBe('beta');
    expect(detectChannel('', '/stall-tokens-beta/index.html')).toBe('beta');
    expect(detectChannel('beta', '/stall-tokens/')).toBe('beta');
    expect(detectChannel('beta', undefined)).toBe('beta');
    expect(detectChannel('', '/stall-tokens/')).toBe('stable');
    expect(detectChannel('stable', '/')).toBe('stable');
    expect(detectChannel('', undefined)).toBe('stable');
    expect(detectChannel('', '/stall-tokens-betaX/')).toBe('stable');
  });

  it('keeps Stable storage unchanged and gives Beta its own prefix', () => {
    expect(CHANNELS.stable.prefix).toBe('stall-tokens.v2');
    expect(CHANNELS.beta.prefix).toBe('stall-tokens-beta.v2');
    expect(CHANNELS.beta.prefix.startsWith(CHANNELS.stable.prefix)).toBe(false);
    // The running config follows its channel (Stable locally, Beta in the stall-tokens-beta CI with VITE_CHANNEL=beta).
    expect(CONFIG.storage.prefix).toBe(CHANNELS[CONFIG.app.channel].prefix);
    expect(CONFIG.app.channelLabel).toBe(CHANNELS[CONFIG.app.channel].label);
  });

  it('never bakes a sync link or key into Beta', () => {
    if (CONFIG.app.channel === 'beta') {
      expect(CONFIG.sync.bakedUrl).toBe('');
      expect(CONFIG.sync.bakedKey).toBe('');
    } else {
      expect(CONFIG.app.channel).toBe('stable');
    }
  });
});
