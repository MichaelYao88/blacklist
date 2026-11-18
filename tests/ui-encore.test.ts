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
      previewItem: 'encore',
      previewCurse: 'without-d',
      options: [
        {
          id: 'draw',
          label: 'Draw one',
          description: '60%: random item. 40%: random curse.',
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

  it('shows the previewed item and curse with odds', () => {
    const chips = [...root.querySelectorAll<HTMLElement>('.preview-chip')];
    expect(chips).toHaveLength(2);

    const item = chips.find((chip) => chip.textContent?.includes('Encore'))!;
    const curse = chips.find((chip) => chip.textContent?.includes('Without the D'))!;
    expect(item.textContent).toContain('60%');
    expect(curse.textContent).toContain('40%');
    expect(item.querySelector('.preview-icon')?.textContent?.trim()).toBeTruthy();
    expect(item.dataset.tip).toContain('last solved answer');
    expect(curse.dataset.tip).toContain('Every D tile is hidden');

    item.dispatchEvent(new Event('pointermove', { bubbles: true }));
    const tip = document.querySelector<HTMLElement>('.kw-tooltip');
    expect(tip?.classList.contains('visible')).toBe(true);
    expect(tip?.textContent).toContain('Encore');
  });
});
