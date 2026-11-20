// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('end screen loadout', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'over-loadout' });
    state.items = [
      { instance: 'i-bloom', id: 'bloom', data: {}, equipped: true },
      { instance: 'i-quick', id: 'quickdraw', data: {}, equipped: true },
    ];
    state.phase = 'over';
    state.over = undefined;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows equipped items as hoverable tooltips', () => {
    const chips = [...root.querySelectorAll<HTMLElement>('.over-loadout span[data-tip]')];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['Bloom', 'Quickdraw']);
    for (const chip of chips) {
      expect(chip.getAttribute('tabindex')).toBe('0');
      expect(chip.dataset.tip).toContain('\n');
      expect(chip.dataset.tip?.length).toBeGreaterThan(10);
    }
  });
});
