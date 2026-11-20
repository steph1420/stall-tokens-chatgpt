// F-69 Settings regrouped (P5): General, Display, Menu, Kitchen, Money, Sync, Extras, Data, Account, Passcode, Developer, About.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreProvider } from '../../store';
import { makeTestStore } from '../../store/testkit';
import { SettingsScreen } from './SettingsScreen';

afterEach(cleanup);

describe('SettingsScreen (F-69)', () => {
  it('renders all regrouped sections in order', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    render(<StoreProvider store={store}><SettingsScreen /></StoreProvider>);

    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Display')).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.getByText('Kitchen')).toBeTruthy();
    expect(screen.getByText('Money')).toBeTruthy();
    expect(screen.getByText('Sync')).toBeTruthy();
    expect(screen.getByText('Extras · every phone')).toBeTruthy();
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Passcode')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('cycles Appearance theme through night, day, auto', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    render(<StoreProvider store={store}><SettingsScreen /></StoreProvider>);

    expect(store.getState().prefs.theme).toBe('night');
    const themeRow = screen.getByRole('button', { name: /Appearance/ });
    fireEvent.click(themeRow);
    expect(store.getState().prefs.theme).toBe('day');
    fireEvent.click(themeRow);
    expect(store.getState().prefs.theme).toBe('auto');
    fireEvent.click(themeRow);
    expect(store.getState().prefs.theme).toBe('night');
  });

  it('toggles Quiet mode and updates alertTone via tone sheet', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    render(<StoreProvider store={store}><SettingsScreen /></StoreProvider>);

    const quietSwitch = screen.getByRole('switch', { name: /Quiet mode/ });
    expect(quietSwitch.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(quietSwitch);
    expect(store.getState().prefs.quiet).toBe(true);

    const toneBtn = screen.getByRole('button', { name: /Kitchen alert tone/ });
    fireEvent.click(toneBtn);
    expect(screen.getByRole('dialog', { name: /Kitchen Alert Tone/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Harp' }));
    expect(store.getState().prefs.alertTone).toBe('harp');
  });

  it('opens Categories and Stations sheets under Menu', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    render(<StoreProvider store={store}><SettingsScreen /></StoreProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Categories/ }));
    expect(screen.getByRole('dialog', { name: 'Categories' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /Stations/ }));
    expect(screen.getByRole('dialog', { name: 'Kitchen Stations' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('triggers Backup and opens Snapshots / Reset sheets under Data', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    render(<StoreProvider store={store}><SettingsScreen /></StoreProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Back up now/ }));

    fireEvent.click(screen.getByRole('button', { name: /Snapshots/ }));
    expect(screen.getByRole('dialog', { name: 'Safety Snapshots' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /Reset app/ }));
    expect(screen.getByRole('dialog', { name: 'Reset Stall Tokens' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hold to reset app/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('unlocks Developer options after 7 taps on Version (Q-DEV-7TAP)', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    store.getState().setPrefs({ passcodeOff: true });
    render(<StoreProvider store={store}><SettingsScreen /></StoreProvider>);

    expect(screen.queryByText('Developer')).toBeNull();

    const versionBtn = screen.getByRole('button', { name: /Version/ });
    for (let i = 0; i < 7; i++) {
      fireEvent.click(versionBtn);
    }

    await waitFor(() => {
      expect(screen.getByText('Developer')).toBeTruthy();
      expect(screen.getByText('Passcode lock')).toBeTruthy();
    });
  });

  it('shows Round-off steps with placeholder 5, 10 (W-20)', async () => {
    const { store } = makeTestStore();
    await store.getState().start();
    render(<StoreProvider store={store}><SettingsScreen /></StoreProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Round-off to nearest/ }));
    const input = screen.getByPlaceholderText('5, 10');
    expect(input).toBeTruthy();
  });
});
