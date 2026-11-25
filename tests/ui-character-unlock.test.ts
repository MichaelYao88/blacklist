// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { readMeta } from '../src/ui/store';

describe('character unlock popup', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'character-unlock', character: 'runner' });
    state.phase = 'curse';
    state.curse = { options: ['censor'], starting: false };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('unlocks The Pathfinder on reaching the first curse and shows a large popup', () => {
    root.querySelector<HTMLElement>('[data-action="select-curse"][data-id="censor"]')!.click();
    expect(readMeta().characters).toContain('pathfinder');

    const overlay = root.querySelector<HTMLElement>('.unlock-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('CHARACTER UNLOCKED');
    expect(overlay?.textContent).toContain('The Pathfinder');
    expect(overlay?.textContent).toContain('Spam first, solve later.');

    root.querySelector<HTMLElement>('[data-action="dismiss-unlock"]')!.click();
    expect(root.querySelector('.unlock-overlay')).toBeNull();
  });
});
