// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

const originalMatchMedia = window.matchMedia;

function setDesktopMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
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

describe('battle facts no longer duplicate the free guess count', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    setDesktopMatchMedia();
    localStorage.clear();
    const { state } = game.newRun({ seed: 'free-fact-ui', character: 'runner' });
    state.round!.answer = 'crane';
    state.round!.freeLeft = 1;
    state.round!.elapsedMs = 1000;
    state.round!.immuneUntilMs = 6000;
    state.hp = 100;
    state.maxHp = 100;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('removes the FREE N chip while keeping the damage value and other chips', () => {
    const facts = [...root.querySelectorAll<HTMLElement>('.mini-facts .fact')]
      .map((fact) => fact.textContent ?? '');
    expect(facts.some((text) => /^FREE \d/.test(text))).toBe(false);
    expect(root.querySelector('.mini-facts')?.textContent).not.toContain('FREE 1');

    const damage = root.querySelector<HTMLElement>('.battle-rail .guess-damage-value');
    expect(damage?.textContent).toContain('FREE');
    expect(facts.some((text) => text.startsWith('IMMUNE'))).toBe(true);
  });
});
