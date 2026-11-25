// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function tagTexts(element: Element | null): string[] {
  return [...(element?.querySelectorAll('.item-tag') ?? [])]
    .map((tag) => tag.textContent?.trim() ?? '');
}

describe('multi-tag item card from an old save', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'item-tags-old-save', character: 'runner' });
    state.items.push({ instance: 'i-x', id: 'x-marks', data: {}, equipped: true });
    const json = game.serialize(state);
    const parsed = JSON.parse(json) as { items: Array<Record<string, unknown>> };
    expect(parsed.items.every((item) => !('tags' in item))).toBe(true);
    localStorage.setItem('blacklist.run.v1', json);

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('loads an old save without tag fields and renders every tag', () => {
    const card = [...root.querySelectorAll<HTMLElement>('.item-card')]
      .find((entry) => entry.textContent?.includes('X Marks'));
    expect(card).not.toBeNull();
    expect(tagTexts(card!)).toEqual(['GUESS', 'GOLD', 'ARMOR']);
    expect(card?.textContent).toContain('1 ITEM SLOT');
  });
});
