// F-44 sign-in links: round-trip through the #fragment, and a forged / non-https link is ignored.
import { describe, expect, it } from 'vitest';
import { joinUrl, readJoin } from './join';

describe('sign-in links (F-44)', () => {
  it('carries URL, key, role and name in the fragment, not the query', () => {
    const j = { url: 'https://script.google.com/macros/s/x/exec', key: 'k-1', role: 'station:grill', name: 'Asha · ಅ' };
    const link = joinUrl('https://stall.example/app/?a=1#old', j);
    expect(link.split('#')[0]).toBe('https://stall.example/app/?a=1');
    expect(readJoin(`#${link.split('#')[1] ?? ''}`)).toEqual(j);
  });
  it('ignores bad links', () => {
    expect(readJoin('#join=bm9wZQ')).toBeNull();
    const http = joinUrl('https://a/', { url: 'http://x/exec', key: 'k', role: 'counter', name: '' });
    expect(readJoin(`#${http.split('#')[1] ?? ''}`)).toBeNull();
    // Rejects non-whitelisted domains (SEC-01)
    const attacker = joinUrl('https://a/', { url: 'https://attacker.com/malicious/exec', key: 'k', role: 'counter', name: '' });
    expect(readJoin(`#${attacker.split('#')[1] ?? ''}`)).toBeNull();
  });
});
