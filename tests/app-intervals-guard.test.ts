// @vitest-environment happy-dom
import { afterAll, describe, expect, it, vi } from 'vitest';
import { game } from '../src/game';
import { restoreAppIntervals, stopAppIntervals } from './helpers/appIntervals';

// Regression for the flaky "stale tab buttons" CI failures: an app instance left
// over from an earlier boot must not keep ticking and overwrite the run save that
// the next test just seeded.
describe('stale app instances', () => {
  afterAll(() => restoreAppIntervals());

  it('stop ticking and overwriting the next test save once stopAppIntervals runs', async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'stale-a', character: 'runner' });
    state.round!.answer = 'crane';
    localStorage.setItem('blacklist.run.v1', game.serialize(state));
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    await import('../src/ui/app');
    document.querySelector<HTMLElement>('[data-action="resume"]')!.click();

    // The next test boots: silence the old instance, then seed a different save.
    stopAppIntervals();
    const seeded = game.serialize(game.newRun({ seed: 'stale-b', character: 'runner' }).state);
    localStorage.setItem('blacklist.run.v1', seeded);

    // Give a leaked 1s tick time to fire (a slow CI import easily takes this long).
    await new Promise((resolve) => setTimeout(resolve, 1_300));
    expect(localStorage.getItem('blacklist.run.v1')).toBe(seeded);
  });
});
