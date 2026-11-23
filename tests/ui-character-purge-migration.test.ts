// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { readMeta } from '../src/ui/store';

describe('purge unlock migration', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner'],
      purgedCount: 6,
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('unlocks The Purgamist from lifetime purge counts', () => {
    expect(readMeta().characters).toContain('purgamist');
    expect(root.querySelector<HTMLElement>('.unlock-overlay')?.textContent)
      .toContain('The Purgamist');
  });
});
