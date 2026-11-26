// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function listItem() {
  return {
    instance: 'i-list-morph',
    id: 'the-list-glossary',
    data: {},
    equipped: true,
  };
}

async function boot(
  mobile: boolean,
  seed: string,
  seedRun: (state: ReturnType<typeof game.newRun>['state']) => void,
): Promise<HTMLElement> {
  setMobileMatchMedia(mobile);
  localStorage.clear();
  const { state } = game.newRun({ seed, character: 'runner' });
  state.round!.answer = 'crane';
  state.round!.remainingMs = null;
  state.round!.timerStartMs = null;
  seedRun(state);
  localStorage.setItem('blacklist.run.v1', game.serialize(state));
  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
  await import('../src/ui/app');
  const root = document.getElementById('app') as HTMLElement;
  root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  return root;
}

function tick(ms = 1_000): void {
  vi.advanceTimersByTime(ms);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

describe('overlay nodes survive the once-per-second tick', () => {
  it('keeps the Purgamanual input node, focus, value and caret', async () => {
    const root = await boot(false, 'morph-list-input', (state) => {
      state.items.push(listItem());
      state.round!.hints = { q: 'absent' };
      state.round!.remainingMs = 300_000;
      state.round!.timerStartMs = 300_000;
    });

    root.querySelector<HTMLElement>('[data-action="open-list"]')!.click();
    const modal = root.querySelector<HTMLElement>('.list-modal')!;
    const card = modal.querySelector<HTMLElement>('.modal-card')!;
    const input = modal.querySelector<HTMLInputElement>('[data-list-input]')!;
    input.focus();
    input.value = 'QXZA';
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const sameInput = root.querySelector<HTMLInputElement>('[data-list-input]')!;
    sameInput.focus();
    sameInput.setSelectionRange(2, 2);
    const observer = new MutationObserver(() => undefined);
    observer.observe(modal, { subtree: true, attributes: true, childList: true, characterData: true });

    tick();

    const afterInput = root.querySelector<HTMLInputElement>('[data-list-input]')!;
    expect(afterInput).toBe(sameInput);
    expect(root.querySelector('.list-modal')).toBe(modal);
    expect(modal.querySelector('.modal-card')).toBe(card);
    expect(document.activeElement).toBe(afterInput);
    expect(afterInput.value).toBe('QXZA');
    expect(afterInput.selectionStart).toBe(2);
    expect(afterInput.selectionEnd).toBe(2);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('resets the Purgamanual input property when RESET is clicked', async () => {
    const root = await boot(false, 'morph-list-reset', (state) => {
      state.items.push(listItem());
      state.round!.hints = { q: 'absent' };
      state.round!.remainingMs = 300_000;
      state.round!.timerStartMs = 300_000;
    });

    root.querySelector<HTMLElement>('[data-action="open-list"]')!.click();
    const input = root.querySelector<HTMLInputElement>('[data-list-input]')!;
    const defaultLetters = input.value;
    input.focus();
    input.value = 'ABCQXZ';
    input.setSelectionRange(6, 6);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    tick();

    expect(root.querySelector<HTMLInputElement>('[data-list-input]')).toBe(input);
    expect(input.value).toBe('ABCQXZ');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(6);
    expect(input.selectionEnd).toBe(6);

    const reset = root.querySelector<HTMLButtonElement>('[data-action="list-reset"]')!;
    reset.focus();
    input.value = 'ABCQXZ';
    reset.click();

    const afterReset = root.querySelector<HTMLInputElement>('[data-list-input]')!;
    expect(afterReset).toBe(input);
    expect(afterReset.value).toBe(defaultLetters);
    expect(afterReset.getAttribute('value')).toBe(defaultLetters);
  });

  it('does not replace an unchanged modal or its card', async () => {
    const root = await boot(false, 'morph-modal-identity', (state) => {
      state.items.push(listItem());
      state.round!.remainingMs = 300_000;
      state.round!.timerStartMs = 300_000;
    });

    root.querySelector<HTMLElement>('[data-action="open-list"]')!.click();
    const modal = root.querySelector<HTMLElement>('.list-modal')!;
    const card = modal.querySelector<HTMLElement>('.modal-card')!;
    const observer = new MutationObserver(() => undefined);
    observer.observe(modal, { subtree: true, childList: true, attributes: true, characterData: true });

    tick();

    expect(root.querySelector('.list-modal')).toBe(modal);
    expect(root.querySelector('.list-modal .modal-card')).toBe(card);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('keeps every mobile drawer node open across a tick', async () => {
    const root = await boot(true, 'morph-mobile-drawers', (state) => {
      state.spells = [{ instance: 's-omen', id: 'omen' }];
      state.round!.remainingMs = 300_000;
      state.round!.timerStartMs = 300_000;
      state.items = [
        { instance: 'i-necro', id: 'necronomicon', data: { fed: 0, _uses: 0 }, equipped: true },
        { instance: 'i-parrot', id: 'evil-parrot', data: { readyAt: 0, _suggestions: 0, _freeUsed: 0 }, equipped: true },
        listItem(),
      ];
    });

    const cases = [
      { action: 'toggle-spells', selector: '.mobile-spells', drawer: '.mobile-spells-drawer' },
      { action: 'toggle-necro', selector: '.mobile-item[data-mobile-item="necro"]', drawer: '.mobile-item[data-mobile-item="necro"] .mobile-item-drawer' },
      { action: 'toggle-parrot', selector: '.mobile-item[data-mobile-item="parrot"]', drawer: '.mobile-item[data-mobile-item="parrot"] .mobile-item-drawer' },
      { action: 'toggle-list', selector: '.mobile-item[data-mobile-item="list"]', drawer: '.mobile-item[data-mobile-item="list"] .mobile-item-drawer' },
    ];

    for (const entry of cases) {
      root.querySelector<HTMLElement>(`[data-action="${entry.action}"]`)!.click();
      const container = root.querySelector<HTMLElement>(entry.selector)!;
      const drawer = root.querySelector<HTMLElement>(entry.drawer)!;
      expect(container.classList.contains('open')).toBe(true);
      expect(drawer.getAttribute('aria-hidden')).toBe('false');

      tick();

      expect(root.querySelector(entry.selector)).toBe(container);
      expect(root.querySelector(entry.drawer)).toBe(drawer);
      expect(container.classList.contains('open')).toBe(true);
      expect(drawer.getAttribute('aria-hidden')).toBe('false');
      root.querySelector<HTMLElement>(`[data-action="${entry.action}"]`)!.click();
    }
  });

  it('still applies real timer changes to the same nodes', async () => {
    const root = await boot(true, 'morph-timer-update', (state) => {
      state.curses.push({ id: 'clock', stacks: 1 });
      state.round!.remainingMs = 300_000;
      state.round!.timerStartMs = 300_000;
    });

    const timer = root.querySelector<HTMLElement>('.battle-rail .timer b')!;
    const timerText = timer.textContent;
    const mobileTimerRoot = document.getElementById('mobile-timer-root') as HTMLElement;
    const mobileText = mobileTimerRoot.textContent;
    const observer = new MutationObserver(() => undefined);
    observer.observe(timer, { characterData: true, childList: true, subtree: true });

    tick();

    expect(root.querySelector('.battle-rail .timer b')).toBe(timer);
    expect(timer.textContent).not.toBe(timerText);
    expect(mobileTimerRoot.textContent).not.toBe(mobileText);
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
  });
});
