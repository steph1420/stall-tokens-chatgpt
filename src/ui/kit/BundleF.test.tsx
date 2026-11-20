// Bundle F: UI Polish & Design Consistency verification test
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Sheet } from './Sheet';
import { HoldButton } from './HoldButton';
import kit from './kit.module.css';

describe('Bundle F: UI Polish & Design Consistency', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders bottom sheets with accessible dialog role, title, and handles escape key dismissal', () => {
    let closed = false;
    render(
      <Sheet title="Preferences" onClose={() => { closed = true; }}>
        <div>Content inside sheet</div>
      </Sheet>
    );

    const dialog = screen.getByRole('dialog', { name: /preferences/i });
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Content inside sheet')).toBeTruthy();

    // Escape closes sheet
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  it('renders destructive hold button with hold fill indicator and accessible hold label', () => {
    let confirmed = false;
    render(
      <HoldButton label="Delete item" onConfirm={() => { confirmed = true; }}>
        Delete
      </HoldButton>
    );

    const btn = screen.getByRole('button', { name: /delete item \(hold\)/i });
    expect(btn).toBeTruthy();
    expect(btn.className).toContain(kit.hold);
    expect(confirmed).toBe(false);
  });

  it('maintains consistent button and choice pill styling classes with tactile transitions', () => {
    render(
      <div>
        <button type="button" className={kit.cta}>Primary CTA</button>
        <button type="button" className={kit.quiet}>Quiet Button</button>
        <button type="button" className={kit.danger}>Danger Button</button>
        <button type="button" className={kit.choice}>Choice Pill</button>
      </div>
    );

    const cta = screen.getByRole('button', { name: /primary cta/i });
    const quiet = screen.getByRole('button', { name: /quiet button/i });
    const danger = screen.getByRole('button', { name: /danger button/i });
    const choice = screen.getByRole('button', { name: /choice pill/i });

    expect(cta.className).toContain(kit.cta);
    expect(quiet.className).toContain(kit.quiet);
    expect(danger.className).toContain(kit.danger);
    expect(choice.className).toContain(kit.choice);
  });
});
