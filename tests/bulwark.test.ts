import { describe, expect, it } from 'vitest';
import { game, type HookPayloads, type ItemInstance, type RunState } from '../src/game';
import { ITEM_BY_ID } from '../src/content';

function run(): RunState {
  return game.newRun({ seed: 'bulwark-11' }).state;
}

function bulwarkEffects(
  state: RunState,
  blocked: number,
  armorUsed: number,
) {
  const def = ITEM_BY_ID.get('bulwark');
  if (!def?.on?.onDamageTaken) throw new Error('Bulwark hook missing');
  const self: ItemInstance = {
    instance: 'i-bulwark',
    id: 'bulwark',
    data: { blocked },
    equipped: true,
  };
  const payload: HookPayloads['onDamageTaken'] = {
    incoming: armorUsed,
    dealt: 0,
    armorUsed,
    blocked: armorUsed,
    source: { kind: 'rules' },
  };
  return def.on.onDamageTaken({ state, self }, payload);
}

function casts(effects: ReturnType<typeof bulwarkEffects>): number {
  return effects.filter((effect) => effect.type === 'castSpell').length;
}

function remainder(effects: ReturnType<typeof bulwarkEffects>): number | undefined {
  const set = effects.find((effect) => effect.type === 'setItemData');
  return set?.type === 'setItemData' ? set.value : undefined;
}

describe('Bulwark at 11 blocked damage', () => {
  it('does not trigger at 10 and carries the remainder', () => {
    const effects = bulwarkEffects(run(), 0, 10);
    expect(casts(effects)).toBe(0);
    expect(remainder(effects)).toBe(10);
  });

  it('triggers exactly one spell at 11', () => {
    const effects = bulwarkEffects(run(), 0, 11);
    expect(casts(effects)).toBe(1);
    expect(remainder(effects)).toBe(0);
  });

  it('triggers twice at 22 and carries a saved remainder', () => {
    const effects = bulwarkEffects(run(), 0, 22);
    expect(casts(effects)).toBe(2);
    expect(remainder(effects)).toBe(0);

    const carried = bulwarkEffects(run(), 10, 12);
    expect(casts(carried)).toBe(2);
    expect(remainder(carried)).toBe(0);
  });

  it('carries remainder into the next trigger', () => {
    const first = bulwarkEffects(run(), 0, 12);
    expect(casts(first)).toBe(1);
    expect(remainder(first)).toBe(1);

    const next = bulwarkEffects(run(), 1, 10);
    expect(casts(next)).toBe(1);
    expect(remainder(next)).toBe(0);
  });

  it('does not crash when an old save holds a value at or above the threshold', () => {
    const effects = bulwarkEffects(run(), 22, 1);
    expect(casts(effects)).toBe(2);
    expect(remainder(effects)).toBe(1);
  });
});
