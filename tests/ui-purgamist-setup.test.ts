// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';

describe('Purgamist setup', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    localStorage.setItem('blacklist.meta.v1', JSON.stringify({
      characters: ['runner', 'purgamist'],
    }));
    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="character"][data-id="purgamist"]')!.click();
    root.querySelector<HTMLElement>('[data-action="new-run"]')!.click();
  });

  it('shows the purge modal before the round countdown starts', () => {
    expect(root.querySelector('.modal')).not.toBeNull();
    expect(document.querySelector('.countdown-overlay')).toBeNull();
    expect(root.textContent).toContain('4 purges pending');
    expect(root.querySelector('.rail-level-value')?.textContent).toBe('0/50');
  });

  it('starts the countdown after all four letters are purged', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const letter of letters) {
      if (!root.querySelector('.modal')) break;
      const key = root.querySelector<HTMLButtonElement>(
        `[data-action="select-purge"][data-letter="${letter}"]`,
      );
      if (key && !key.disabled) {
        key.click();
        root.querySelector<HTMLButtonElement>('[data-action="confirm-purge"]')!.click();
      }
    }
    expect(root.querySelector('.modal')).toBeNull();
    expect(document.querySelector('.countdown-overlay')).not.toBeNull();
    expect(root.querySelector('.purged[data-tip]')?.getAttribute('data-tip')).toContain('no puzzle answer');
  });
});
