// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Bargain random previews', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'bargain-preview' });
    state.phase = 'happening';
    state.happening = {
      id: 'the-bargain',
      options: [
        {
          id: 'draw',
          label: 'Draw one',
          description: '50%: random item. 50%: random curse.',
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

  it('shows hoverable random item and random curse previews', () => {
    const chips = [...root.querySelectorAll<HTMLElement>('.preview-chip')];
    expect(chips).toHaveLength(2);

    const item = chips.find((chip) => chip.textContent?.includes('Random item'))!;
    const curse = chips.find((chip) => chip.textContent?.includes('Random curse'))!;
    expect(item.querySelector('.preview-icon')?.textContent?.trim()).toBeTruthy();
    expect(item.dataset.tip).toContain('random available item');
    expect(curse.dataset.tip).toContain('random eligible curse');

    item.dispatchEvent(new Event('pointermove', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('random available item');
  });
});
