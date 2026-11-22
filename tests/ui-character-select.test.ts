// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('character select', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner', 'pathfinder'],
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('shows all eight cards once one character is unlocked and marks locked hints', () => {
    const cards = [...root.querySelectorAll<HTMLElement>('.character-card')];
    expect(cards.map((card) => card.querySelector('.character-name')?.textContent))
      .toEqual([
        'The Soldier',
        'The Pathfinder',
        'The Purgamist',
        'The Necromancer',
        'The Gourmand',
        'The Farmer',
        'The Empty Armor',
        'The Werewolf',
      ]);
    expect(cards[0].classList.contains('active')).toBe(true);
    expect(cards.filter((card) => card.classList.contains('locked'))).toHaveLength(6);
    expect(cards[2].textContent).toContain('Purge 6 letters');
    expect(cards[3].textContent).toContain('Buy 2 Necronomicons');
    expect(cards[5].textContent).toContain('Win a run');
    expect(cards[6].textContent).toContain('Ascension 1');
    expect(cards[7].textContent).toContain('Beat the game with 2 different characters');
    expect((cards[2] as HTMLButtonElement).disabled).toBe(true);

    cards[1].click();
    const updated = [...root.querySelectorAll<HTMLElement>('.character-card')];
    expect(updated[1].classList.contains('active')).toBe(true);
  });

  it('starts the run as the selected character', () => {
    root.querySelector<HTMLElement>('[data-action="new-run"]')!.click();
    const saved = localStorage.getItem('blacklist.run.v1');
    expect(saved).not.toBeNull();
    expect(game.deserialize(saved!)?.character).toBe('pathfinder');
  });
});
