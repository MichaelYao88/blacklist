// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Quickdraw banner', () => {
  let bannerRoot: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'quickdraw-banner' });
    state.items.push({ instance: 'i-quickdraw', id: 'quickdraw', data: {}, equipped: true });
    state.round!.elapsedMs = 0;
    state.round!.immuneUntilMs = 12_000;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    const root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
    bannerRoot = document.getElementById('opening-root') as HTMLElement;
  });

  it('shows Quickdraw with its 12 second timer', () => {
    expect(bannerRoot.textContent).toContain('Quickdraw!');
    expect(bannerRoot.textContent).toContain('12s');
    const bar = bannerRoot.querySelector<HTMLElement>('.opening-banner .immunity-timer i');
    expect(bar?.style.width).toBe('100.0%');
  });
});
