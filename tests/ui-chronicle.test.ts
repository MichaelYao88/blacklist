// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('chronicle setting', () => {
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

  it('shows the run path below the battle rail when enabled', () => {
    expect(root.querySelector('.chronicle')).toBeNull();
    root.querySelector<HTMLElement>('[data-action="pause"]')!.click();
    const toggle = root.querySelector<HTMLElement>('[data-action="toggle-chronicle"]');
    expect(toggle?.textContent).toContain('HIDDEN');
    toggle!.click();
    expect(root.querySelector('.rail-column .chronicle')).not.toBeNull();
    expect(localStorage.getItem('blacklist.chronicle.v1')).toBe('1');
  });
});
