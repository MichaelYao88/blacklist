// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { game } from '../src/game';

function saved(): ReturnType<typeof game.deserialize> {
  const json = localStorage.getItem('blacklist.run.v1');
  return json ? game.deserialize(json) : null;
}

describe('happening option choice', () => {
  let root: HTMLElement;

  beforeAll(async () => {
    localStorage.clear();
    const { state } = game.newRun({ seed: 'confirm-happening', character: 'runner' });
    state.phase = 'happening';
    state.happening = {
      id: 'scavenger',
      options: [{
        id: 'leave',
        label: 'Decline',
        description: 'Nothing happens.',
        outcomes: [{ chancePct: 100, text: 'The Scavenger shrugs.' }],
      }],
    };
    localStorage.setItem('blacklist.run.v1', game.serialize(state));

    document.body.innerHTML = '<div id="app"></div>';
    await import('../src/ui/app');
    root = document.getElementById('app') as HTMLElement;
    root.querySelector<HTMLElement>('[data-action="resume"]')!.click();
  });

  it('resolves the option on a single click', () => {
    const choose = root.querySelector<HTMLElement>('[data-action="choose"][data-id="leave"]');
    expect(choose?.textContent?.trim()).toBe('CHOOSE');
    choose!.click();
    expect(saved()?.happening?.resolved?.option).toBe('leave');
  });
});
