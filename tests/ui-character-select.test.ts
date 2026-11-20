// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('character select', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner', 'maze-runner'],
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('lists only unlocked characters and marks the selection', () => {
    const cards = [...root.querySelectorAll<HTMLElement>('.character-card')];
    expect(cards.map((card) => card.querySelector('.character-name')?.textContent))
      .toEqual(['The Runner', 'The Maze Runner']);
    expect(cards[0].classList.contains('active')).toBe(true);

    cards[1].click();
    const updated = [...root.querySelectorAll<HTMLElement>('.character-card')];
    expect(updated[1].classList.contains('active')).toBe(true);
  });

  it('starts the run as the selected character', () => {
    root.querySelector<HTMLElement>('[data-action="new-run"]')!.click();
    const saved = localStorage.getItem('blacklist.run.v1');
    expect(saved).not.toBeNull();
    expect(game.deserialize(saved!)?.character).toBe('maze-runner');
  });
});
