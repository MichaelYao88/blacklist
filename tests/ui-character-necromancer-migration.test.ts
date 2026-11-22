// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { readMeta } from '../src/ui/store';

describe('Necromancer unlock migration', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
      purchases: { necronomicon: 1 },
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('unlocks The Necromancer from an existing purchase', () => {
    expect(readMeta().characters).toContain('necromancer');
    expect(root.querySelector<HTMLElement>('.unlock-overlay')?.textContent)
      .toContain('The Necromancer');
  });
});
