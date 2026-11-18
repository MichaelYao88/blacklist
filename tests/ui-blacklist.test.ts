// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('blacklist HUD and Hat Trick', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'list-hud' });
    state.curses.push({ id: 'the-list', stacks: 1 });
    state.blacklist = ['slate', 'pious'];
    state.firstGuesses = ['slate', 'pious'];
    state.items.push({ instance: 'i-hat', id: 'hat-trick', data: { gold: 9 }, equipped: true });
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows the blacklist only with The List, seeded from earlier rounds', () => {
    const list = root.querySelector<HTMLElement>('.blacklist');
    expect(list).not.toBeNull();
    expect(list?.textContent).toContain('slate');
    expect(list?.textContent).toContain('pious');
    expect(root.querySelector('.path')).toBeNull();
  });

  it('explains the blacklist on hover', () => {
    const panel = root.querySelector<HTMLElement>('.blacklist-panel');
    expect(panel).not.toBeNull();
    expect(panel?.dataset.tip).toContain('never be guessed again');
    expect(panel?.getAttribute('tabindex')).toBe('0');
  });

  it('shows the live Hat Trick payout', () => {
    const card = [...root.querySelectorAll<HTMLElement>('.item-card')]
      .find((item) => item.textContent?.includes('Hat Trick'));
    expect(card).toBeDefined();
    expect(card?.textContent).toContain('gain 9 gold');
  });
});
