// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Encore bargain previews', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'encore-preview' });
    state.phase = 'happening';
    state.happening = {
      id: 'the-bargain',
      options: [
        {
          id: 'draw',
          label: 'Draw one',
          description: '50%: Encore item. 50%: Without the D curse.',
          outcomes: [],
        },
        {
          id: 'leave',
          label: 'Walk away',
          description: 'Nothing happens.',
          outcomes: [],
        },
      ],
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows hoverable item and curse previews with the item icon', () => {
    const chips = [...root.querySelectorAll<HTMLElement>('.preview-chip')];
    expect(chips).toHaveLength(2);

    const item = chips.find((chip) => chip.textContent?.includes('Encore'))!;
    const curse = chips.find((chip) => chip.textContent?.includes('Without the D'))!;
    expect(item.querySelector('.preview-icon')?.textContent?.trim()).toBeTruthy();
    expect(item.dataset.tip).toContain('last solved answer');
    expect(curse.dataset.tip).toContain('Every D tile is hidden');

    item.dispatchEvent(new Event('pointermove', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('Encore');
  });
});
