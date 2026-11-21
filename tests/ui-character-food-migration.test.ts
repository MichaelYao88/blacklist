// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { readMeta } from '../src/ui/store';

describe('food unlock migration', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
      purchases: { 'double-cheeseburger': 3 },
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('unlocks The Gourmand from old purchase counts', () => {
    expect(readMeta().foodCounts['double-cheeseburger']).toBe(3);
    expect(readMeta().characters).toContain('gourmand');
    expect(root.querySelector<HTMLElement>('.unlock-overlay')?.textContent)
      .toContain('The Gourmand');
  });
});
