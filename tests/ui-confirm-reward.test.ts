// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('reward copy and confirm', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'confirm-reward', character: 'runner' });
    state.phase = 'reward';
    state.reward = {
      options: [
        {
          id: 'item:x-marks',
          kind: 'item',
          def: 'x-marks',
          label: 'X Marks',
          description: 'A player guess with X: +1 gold and +1 max armor.',
        },
        {
          id: 'eat:snack',
          kind: 'eat',
          def: 'snack',
          label: 'Snack',
          description: 'Recover 5 HP. No slot.',
        },
        {
          id: 'gold',
          kind: 'gold',
          amount: 5,
          label: '5 gold',
          description: 'A handful of coins. Always useful.',
        },
      ],
      boss: false,
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('uses choice wording and slot labels', () => {
    expect(root.textContent).toContain('Choose one');
    expect(root.textContent).toContain('Choose one: coins, a spell, or a meal');
    expect(root.textContent).not.toContain('Coins plus');
    expect(root.textContent).not.toMatch(/RELIC|relic/);
    const item = [...root.querySelectorAll<HTMLElement>('.reward-card')]
      .find((card) => card.textContent?.includes('X Marks'))!;
    expect(item.textContent).toContain('1 ITEM SLOT');
    const food = [...root.querySelectorAll<HTMLElement>('.reward-card')]
      .find((card) => card.textContent?.includes('Snack'))!;
    expect(food.textContent).toContain('NO ITEM SLOT');
  });

  it('selects on the first tap and claims only on confirm', () => {
    const confirm = root.querySelector<HTMLButtonElement>('[data-action="confirm-reward"]');
    expect(confirm?.disabled).toBe(true);

    root.querySelector<HTMLElement>('[data-action="select-reward"][data-id="item:x-marks"]')!.click();
    expect(saved()?.phase).toBe('reward');
    expect(saved()?.items.some((item) => item.id === 'x-marks')).toBe(false);
    expect(root.querySelector('[data-action="select-reward"][data-id="item:x-marks"]')?.classList.contains('selected'))
      .toBe(true);

    root.querySelector<HTMLButtonElement>('[data-action="confirm-reward"]')!.click();
    expect(saved()?.phase).not.toBe('reward');
    expect(saved()?.items.some((item) => item.id === 'x-marks')).toBe(true);
  });
});
