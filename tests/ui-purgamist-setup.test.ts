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
    expect(root.querySelector('.countdown-overlay')).toBeNull();
    expect(root.textContent).toContain('3 purges pending');
  });

  it('starts the countdown after all three letters are purged', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const letter of letters) {
      if (!root.querySelector('.modal')) break;
      const key = root.querySelector<HTMLButtonElement>(
        `[data-action="purge"][data-letter="${letter}"]`,
      );
      if (key && !key.disabled) key.click();
    }
    expect(root.querySelector('.modal')).toBeNull();
    expect(root.querySelector('.countdown-overlay')).not.toBeNull();
  });
});
