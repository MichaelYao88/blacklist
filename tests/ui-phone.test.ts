// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

describe('Phone a Friend phrase FX', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'phone-fx' });
    state.curses.push({ id: 'clock', stacks: 1 });
    state.round!.remainingMs = 300_000;
    state.round!.timerStartMs = 300_000;
    state.spells = [{ instance: 's-phone', id: 'phone-friend' }];
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('spams the friend words or shows the Pizza Pzazz callout', () => {
    const cast = root.querySelector<HTMLElement>('[data-action="cast"][data-id="s-phone"]');
    expect(cast).not.toBeNull();
    cast!.click();

    const callout = document.querySelector<HTMLElement>('#phrase-root .phrase-callout');
    if (callout) {
      expect(callout.textContent).toContain('Pizza Pzazz');
      expect(document.querySelectorAll('#phrase-root span')).toHaveLength(0);
    } else {
      const spans = [...document.querySelectorAll<HTMLElement>('#phrase-root span')];
      expect(spans).toHaveLength(20);
      for (const span of spans) {
        expect(span.textContent).toMatch(/^[A-Z]{5}$/);
      }
      expect(new Set(spans.map((span) => span.textContent)).size).toBeGreaterThan(0);
    }
    expect(document.querySelector('#phrase-root')?.textContent?.length).toBeGreaterThan(0);
  });
});
