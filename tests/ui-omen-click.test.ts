// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Omen click handling', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'omen-click' });
    state.spells = [{ instance: 's-omen', id: 'omen' }];
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('keeps the CAST button alive through a render during a press', async () => {
    const cast = root.querySelector<HTMLElement>('[data-action="cast"][data-id="s-omen"]');
    expect(cast).not.toBeNull();
    cast!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    // The 1s tick re-renders the app. The pressed button must survive it.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(document.body.contains(cast)).toBe(true);

    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    cast!.click();

    const saved = JSON.parse(localStorage.getItem('blacklist.run.v1') ?? '{}');
    expect(saved.spells).toHaveLength(0);
    expect(root.querySelectorAll('.key.hinted').length).toBeGreaterThan(0);
  });
});
