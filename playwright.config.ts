// E2E on the built app (vite preview). Phone viewports from ARCHITECTURE §6. System Chrome on the box.
import { defineConfig } from '@playwright/test';
import { CONFIG } from './src/config';

// Read through globalThis so the app tsconfig needs no Node types; PW_CHROME overrides the box's Chrome.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const chrome = { executablePath: env.PW_CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] };
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(CONFIG.ports.preview)}/`, launchOptions: chrome, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' },
  projects: [
    { name: 'p390-night', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    { name: 'p360-day', use: { viewport: { width: 360, height: 780 }, colorScheme: 'light' }, metadata: { theme: 'day' } },
  ],
  webServer: { command: 'npm run build && npm run preview', port: CONFIG.ports.preview, reuseExistingServer: true, timeout: 120_000 },
});
