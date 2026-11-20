// Unit tests for StorageInfo adapter (F-70).
import { describe, expect, it } from 'vitest';
import { createBrowserStorageInfo, createMemoryStorageInfo } from './storageInfo';

describe('createMemoryStorageInfo', () => {
  it('returns default mock estimates and handles persist()', async () => {
    const store = createMemoryStorageInfo({ usageBytes: 500, quotaBytes: 1000, warning: false, persisted: false });
    const est1 = await store.estimate();
    expect(est1.usageBytes).toBe(500);
    expect(est1.quotaBytes).toBe(1000);
    expect(est1.warning).toBe(false);
    expect(est1.persisted).toBe(false);

    const ok = await store.persist();
    expect(ok).toBe(true);
    const est2 = await store.estimate();
    expect(est2.persisted).toBe(true);
  });

  it('reports warning when warning is set to true', async () => {
    const store = createMemoryStorageInfo({ warning: true });
    const est = await store.estimate();
    expect(est.warning).toBe(true);
  });
});

describe('createBrowserStorageInfo', () => {
  it('falls back gracefully in headless / node environment', async () => {
    const store = createBrowserStorageInfo();
    const est = await store.estimate();
    expect(est.usageBytes).toBe(0);
    expect(est.quotaBytes).toBe(0);
    expect(est.warning).toBe(false);
    const persisted = await store.persist();
    expect(persisted).toBe(false);
  });
});
