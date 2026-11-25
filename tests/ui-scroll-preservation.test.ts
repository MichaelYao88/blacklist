// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('same-phase scroll preservation', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'scroll-preserve', character: 'runner' });
    state.items.push(
      { instance: 'i-a', id: 'early-bird', data: {}, equipped: true },
      { instance: 'i-b', id: 'bloom', data: {}, equipped: true },
      { instance: 'i-c', id: 'brace', data: {}, equipped: true },
      { instance: 'i-d', id: 'bookend', data: {}, equipped: false },
      { instance: 'i-e', id: 'piggy-bank', data: { held: 1 }, equipped: false },
      { instance: 'i-f', id: 'field-kit', data: {}, equipped: false },
    );
    state.slots = 8;
    state.round!.answer = 'crane';
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('keeps the item list offset when the same phase re-renders', () => {
    const list = root.querySelector<HTMLElement>('.item-list.scrollable');
    expect(list).not.toBeNull();
    list!.scrollTop = 120;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
    expect(root.querySelector<HTMLElement>('.item-list.scrollable')?.scrollTop).toBe(120);

    root.querySelector<HTMLElement>('.item-list.scrollable')!.scrollTop = 80;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace' }));
    expect(root.querySelector<HTMLElement>('.item-list.scrollable')?.scrollTop).toBe(80);
  });

  it('keeps the window offset when the same phase re-renders', () => {
    window.scrollTo(0, 240);
    expect(window.scrollY).toBe(240);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
    expect(window.scrollY).toBe(240);
  });

  it('resets the item list on a real phase change', () => {
    const list = root.querySelector<HTMLElement>('.item-list.scrollable');
    expect(list).not.toBeNull();
    list!.scrollTop = 130;

    for (let index = 0; index < 6; index++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace' }));
    }
    for (const letter of 'crane') {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: letter,
        code: `Key${letter.toUpperCase()}`,
      }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));

    expect(saved()?.phase).toBe('summary');
    expect(root.querySelector('.summary')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.item-list')?.scrollTop).toBe(0);
  });
});
