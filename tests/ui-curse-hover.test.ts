// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('curse HUD tooltips', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'curse-hover' });
    state.curses.push({ id: 'clock', stacks: 2 });
    state.curses.push({ id: 'censor', stacks: 1 });
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('renders one hoverable chip per curse', () => {
    const chips = [...root.querySelectorAll<HTMLElement>('.curse-chip')];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.dataset.tip).toBeTruthy();
      expect(chip.getAttribute('tabindex')).toBe('0');
    }
    const clock = chips.find((chip) => chip.textContent?.includes('The Clock'));
    expect(clock?.dataset.tip).toContain('5:00');
    expect(clock?.textContent).toContain('×2');
  });

  it('shows the rules on hover and hides them off-target', () => {
    const clock = [...root.querySelectorAll<HTMLElement>('.curse-chip')]
      .find((chip) => chip.textContent?.includes('The Clock'))!;
    clock.dispatchEvent(new Event('pointermove', { bubbles: true }));

    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('Each further stack');
    expect(tip?.textContent).toContain('Minimum limit');

    document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
    expect(tip?.classList.contains('visible')).toBe(false);
  });

  it('shows the same tip on keyboard focus', () => {
    const censor = [...root.querySelectorAll<HTMLElement>('.curse-chip')]
      .find((chip) => chip.textContent?.includes('The Censor'))!;
    censor.dispatchEvent(new Event('focusin', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('first tile');

    censor.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(tip?.classList.contains('visible')).toBe(false);
  });
});
