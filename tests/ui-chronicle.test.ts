// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('chronicle', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'chronicle-ui' });
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('appears inside the pause menu, never in the player view', () => {
    expect(root.querySelector('.chronicle')).toBeNull();
    expect(root.querySelector('.rail-column .chronicle')).toBeNull();
    root.querySelector<HTMLElement>('[data-action="pause"]')!.click();
    expect(root.querySelector('.pause-card .chronicle')).not.toBeNull();
    expect(root.querySelector('.rail-column .chronicle')).toBeNull();
    const entry = root.querySelector<HTMLElement>('.pause-card .chronicle-entry');
    expect(entry).not.toBeNull();
    expect(entry?.className).toContain('info');
    expect(entry?.textContent).toContain('Run resumed');
  });
});
