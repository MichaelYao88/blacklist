// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('spell cast pop-up', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'spell-popup' });
    state.spells = [{ instance: 's-heal', id: 'heal' }];
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows an animated pop-up for a cast spell', () => {
    root.querySelector<HTMLElement>('[data-action="cast"][data-id="s-heal"]')!.click();
    const popup = document.querySelector<HTMLElement>('#spell-root .spell-popup');
    expect(popup).not.toBeNull();
    expect(popup?.querySelector('.spell-popup-name')?.textContent).toBe('Heal');
    expect(popup?.querySelector('.spell-popup-tag')?.textContent).toBe('CAST');
  });
});
