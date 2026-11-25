// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { game } from '../src/game';

const originalMatchMedia = window.matchMedia;

function setMobileMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function mockRect(element: HTMLElement, top: number, bottom: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top,
      bottom,
      height: bottom - top,
      width: 120,
      left: 0,
      right: 120,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }),
  });
}

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('mobile floating timer and spell tab', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    setMobileMatchMedia(true);
    localStorage.clear();
    const { state } = game.newRun({ seed: 'mobile-ui', character: 'runner' });
    state.curses.push({ id: 'clock', stacks: 1 });
    state.round!.remainingMs = 300_000;
    state.round!.timerStartMs = 300_000;
    state.round!.answer = 'crane';
    state.hp = 1;
    state.spells = [
      { instance: 's-omen', id: 'omen' },
      { instance: 's-heal', id: 'heal' },
    ];
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('floats the timer only after the original timer scrolls out of view', () => {
    const timer = root.querySelector<HTMLElement>('.battle-rail .timer');
    const floatRoot = document.getElementById('mobile-timer-root') as HTMLElement;
    expect(timer).not.toBeNull();
    expect(floatRoot).not.toBeNull();

    mockRect(timer!, 30, 110);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(false);

    mockRect(timer!, -120, -20);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(true);
    expect(floatRoot.querySelector('.mobile-timer')?.textContent).toContain('RUN ENDS IN');
    expect(floatRoot.querySelector('.mobile-timer b')?.textContent).toContain(':');

    mockRect(timer!, 40, 120);
    window.dispatchEvent(new Event('scroll'));
    expect(floatRoot.classList.contains('is-visible')).toBe(false);
  });

  it('opens the spell drawer, shows counts, casts, and closes on scrim or tab', () => {
    const tab = root.querySelector<HTMLElement>('.mobile-spells-tab');
    expect(tab).not.toBeNull();
    expect(tab?.textContent).toContain('SPELLS');
    expect(tab?.querySelector('b')?.textContent).toBe('2');
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(false);

    tab!.click();
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(true);
    expect(root.querySelector('.mobile-spells-drawer')?.getAttribute('aria-hidden')).toBe('false');
    expect(root.querySelectorAll('.mobile-spells-drawer .spell-card')).toHaveLength(2);

    const cast = root.querySelector<HTMLElement>('[data-action="cast"][data-id="s-heal"]');
    expect(cast).not.toBeNull();
    cast!.click();
    expect(saved()?.hp).toBeGreaterThan(1);
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(true);

    root.querySelector<HTMLElement>('[data-action="close-spells"]')!.click();
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(false);

    root.querySelector<HTMLElement>('[data-action="toggle-spells"]')!.click();
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(true);
    root.querySelector<HTMLElement>('[data-action="toggle-spells"]')!.click();
    expect(root.querySelector('.mobile-spells')?.classList.contains('open')).toBe(false);
  });
});

describe('desktop layout stays free of mobile-only UI', () => {
  it('does not render the spell tab at the desktop breakpoint', async () => {
    setMobileMatchMedia(false);
    localStorage.clear();
    const { state } = game.newRun({ seed: 'desktop-ui', character: 'runner' });
    state.curses.push({ id: 'clock', stacks: 1 });
    state.round!.remainingMs = 300_000;
    state.round!.timerStartMs = 300_000;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    await import('../src/ui/app');
    const root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();

    expect(root.querySelector('.mobile-spells')).toBeNull();
    expect(document.querySelector('#mobile-timer-root .mobile-timer')).toBeNull();
    expect(root.querySelector('.side-panel .spells-section')).not.toBeNull();
  });
});
