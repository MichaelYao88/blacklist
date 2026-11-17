// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';

describe('ascension title UI', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem(
      'blacklist.meta.v1',
      JSON.stringify({ runs: 2, wins: 1, bestAct: 5, ascension: 2 }),
    );
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
  });

  it('offers every unlocked ascension level', () => {
    const buttons = [...root.querySelectorAll<HTMLElement>('[data-action="ascension"]')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'OFF', '1', '2',
    ]);
    expect(root.textContent).toContain('Ascension 2 unlocked');
  });

  it('starts the next run at the selected ascension', () => {
    root.querySelector<HTMLElement>('[data-action="ascension"][data-level="2"]')!.click();
    expect(root.querySelector('.ascension-btn.active')?.textContent?.trim()).toBe('2');

    root.querySelector<HTMLElement>('[data-action="new-run"]')!.click();
    expect(root.querySelector('.chip-stat.ascension')?.textContent?.trim()).toBe('A2');
    expect(localStorage.getItem('blacklist.run.v1')).toContain('"ascension":2');
  });
});
