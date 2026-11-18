// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Immunity banner', () => {
  let root: HTMLElement;
  let bannerRoot: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'immunity-banner' });
    state.round!.elapsedMs = 0;
    state.round!.guessImmuneUntilMs = 4_000;
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
    bannerRoot = document.getElementById('immunity-root') as HTMLElement;
  });

  it('shows shields on both sides and a draining timer', () => {
    expect(bannerRoot.textContent).toContain('Immunity!');
    expect(bannerRoot.querySelectorAll('.immunity-shield')).toHaveLength(2);

    const bar = bannerRoot.querySelector<HTMLElement>('.immunity-timer i');
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('100.0%');
  });
});
