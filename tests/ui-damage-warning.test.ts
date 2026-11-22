// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('damage multiplier warning', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'damage-warning-ui', character: 'runner' });
    state.round!.answer = 'crane';
    state.round!.freeLeft = 0;
    state.round!.baseDamage = 3;
    state.armor = 0;
    state.maxArmor = 0;
    state.hp = 200;
    state.maxHp = 200;

    let current = state;
    for (const word of ['slate', 'brick', 'plumb', 'chunk']) {
      current = game.step(current, { type: 'guess', word }).state;
    }

    localStorage.setItem('blacklist.run.v1', game.serialize(current));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows a large WATCH OUT multiplier banner', () => {
    for (const letter of 'jumpy') {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: letter,
        code: `Key${letter.toUpperCase()}`,
      }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));

    const warning = document.querySelector<HTMLElement>('.damage-warning');
    expect(warning).not.toBeNull();
    expect(warning?.querySelector('.damage-warning-kicker')?.textContent).toContain('WATCH OUT!');
    expect(warning?.querySelector('.damage-warning-mult')?.textContent).toContain('3 × 2 = 6');
    expect(warning?.querySelector('.damage-warning-label')?.textContent).toContain('DAMAGE');
  });
});
