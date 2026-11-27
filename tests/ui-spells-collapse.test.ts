// @vitest-environment happy-dom
import { afterAll, describe, expect, it, vi } from 'vitest';
import { game } from '../src/game';

const originalMatchMedia = window.matchMedia;
const liveIntervals = new Set<number>();
const realSetInterval = window.setInterval;
window.setInterval = ((handler: () => void, timeout?: number) => {
  const id = realSetInterval(handler, timeout);
  liveIntervals.add(id);
  return id;
}) as typeof window.setInterval;

function stopAppIntervals(): void {
  for (const id of liveIntervals) window.clearInterval(id);
  liveIntervals.clear();
}

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

const SPELL_IDS = ['omen', 'heal', 'immunity', 'restore'] as const;

async function boot(
  mobile: boolean,
  seed: string,
  spellCount: number,
): Promise<HTMLElement> {
  stopAppIntervals();
  setMobileMatchMedia(mobile);
  localStorage.clear();
  const { state } = game.newRun({ seed, character: 'runner' });
  state.spells = SPELL_IDS.slice(0, spellCount)
    .map((id, index) => ({ instance: `s-${index}`, id }));
  localStorage.setItem('blacklist.run.v1', game.serialize(state));

  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
  await import('../src/ui/app');
  const root = document.getElementById('app') as HTMLElement;
  root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  return root;
}

describe('desktop spell section collapse', () => {
  it('collapses into a hoverable header at four spells', async () => {
    const root = await boot(false, 'spells-collapse-four', 4);
    const section = root.querySelector<HTMLElement>('.spells-section')!;
    expect(section.classList.contains('collapsed')).toBe(true);
    expect(section.getAttribute('tabindex')).toBe('0');
    expect(section.getAttribute('title')).toContain('expand');
    expect(section.querySelector('.count')?.textContent).toContain('4');
    expect(section.querySelectorAll('.spell-card')).toHaveLength(4);
  });

  it('stays open below four spells', async () => {
    const root = await boot(false, 'spells-collapse-three', 3);
    const section = root.querySelector<HTMLElement>('.spells-section')!;
    expect(section.classList.contains('collapsed')).toBe(false);
    expect(section.hasAttribute('tabindex')).toBe(false);
  });

  it('does not collapse on mobile', async () => {
    const root = await boot(true, 'spells-collapse-mobile', 4);
    const section = root.querySelector<HTMLElement>('.spells-section')!;
    expect(section.classList.contains('collapsed')).toBe(false);
  });
});

afterAll(() => {
  stopAppIntervals();
  window.setInterval = realSetInterval;
  window.matchMedia = originalMatchMedia;
});
