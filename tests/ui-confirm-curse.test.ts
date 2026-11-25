// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

function touch(target: EventTarget, type: string, x = 24, y = 24): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    clientX: { value: x },
    clientY: { value: y },
  });
  target.dispatchEvent(event);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

describe('curse draft confirm and long press', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'confirm-curse', character: 'runner' });
    state.phase = 'curse';
    state.curse = { options: ['censor', 'clock'], starting: false };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('shows a tooltip on long press and does not select or confirm', async () => {
    const card = root.querySelector<HTMLElement>('.curse-card')!;
    const before = saved()!;
    touch(card, 'pointerdown');
    await wait(600);
    expect(document.querySelector('.kw-tooltip')?.classList.contains('visible')).toBe(true);
    touch(window, 'pointerup');
    card.click();

    const after = saved()!;
    expect(after.phase).toBe(before.phase);
    expect(after.curses.length).toBe(before.curses.length);
    expect(root.querySelector('.curse-card.selected')).toBeNull();
  });  it('selects on the first tap, then commits only on confirm', () => {
    expect(saved()?.phase).toBe('curse');
    const confirm = root.querySelector<HTMLButtonElement>('[data-action="confirm-curse"]');
    expect(confirm?.disabled).toBe(true);

    const card = root.querySelector<HTMLElement>('[data-action="select-curse"][data-id="censor"]')!;
    card.click();
    expect(saved()?.phase).toBe('curse');
    expect(saved()?.curses.length).toBe(0);

    const selected = root.querySelector<HTMLElement>('[data-action="select-curse"][data-id="censor"]');
    expect(selected?.classList.contains('selected')).toBe(true);
    expect(selected?.getAttribute('aria-pressed')).toBe('true');
    const enabled = root.querySelector<HTMLButtonElement>('[data-action="confirm-curse"]');
    expect(enabled?.disabled).toBe(false);

    enabled!.click();
    expect(saved()?.phase).not.toBe('curse');
    expect(saved()?.curses.some((curse) => curse.id === 'censor')).toBe(true);
  });


});
