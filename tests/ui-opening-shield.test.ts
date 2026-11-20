// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Opening shield banner', () => {
  let bannerRoot: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'head-start-banner' });
    state.items.push({ instance: 'i-head-start', id: 'head-start', data: {}, equipped: true });
    state.round!.elapsedMs = 0;
    state.round!.immuneUntilMs = 8_000;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    const root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
    bannerRoot = document.getElementById('opening-root') as HTMLElement;
  });

  it('shows Head Start with a numeric timer and draining bar', () => {
    expect(bannerRoot.textContent).toContain('Head Start!');
    expect(bannerRoot.textContent).toContain('8s');

    const bar = bannerRoot.querySelector<HTMLElement>('.opening-banner .immunity-timer i');
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('100.0%');
  });
});
