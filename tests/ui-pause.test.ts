// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('pause overlay copy', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'pause-copy' });
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('does not talk about a stopped clock before The Clock exists', () => {
    root.querySelector<HTMLElement>('[data-action="pause"]')!.click();
    expect(root.querySelector('.pause-card h2')?.textContent).toBe('Nothing is moving');
    expect(root.querySelector('.pause-card .muted')?.textContent).toContain('The list can wait');
    expect(root.textContent).not.toContain('The clock is stopped');
  });
});
