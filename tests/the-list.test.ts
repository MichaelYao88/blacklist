import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { CHARACTERS, ITEM_BY_ID } from '../src/content';

describe('The List glossary item', () => {
  it('is a free, slotless, no-spawn, unique tool with no activation', () => {
    const def = ITEM_BY_ID.get('the-list-glossary');
    expect(def?.name).toBe('The List');
    expect(def?.price).toBe(0);
    expect(def?.slots).toBe(0);
    expect(def?.noSpawn).toBe(true);
    expect(def?.unique).toBe(true);
    expect(def?.useOnlyInRound).toBeFalsy();
    expect(def?.onUse).toBeUndefined();
    expect(def?.on?.onTimerTick).toBeUndefined();
    expect(def?.useLabel).toBeUndefined();
  });

  it('starts equipped for the Purgamist and replaces their parrot', () => {
    const purgamist = game.newRun({ seed: 'list-purgamist', character: 'purgamist' }).state;
    expect(purgamist.items.some((item) => item.id === 'the-list-glossary' && item.equipped)).toBe(true);
    expect(purgamist.items.some((item) => item.id === 'evil-parrot')).toBe(false);
    expect(purgamist.items.find((item) => item.id === 'the-list-glossary')?.data).toEqual({});
  });

  it('is only in the Purgamist kit', () => {
    for (const character of CHARACTERS) {
      const { state } = game.newRun({ seed: `list-kit-${character.id}`, character: character.id });
      const owns = state.items.some((item) => item.id === 'the-list-glossary');
      expect(owns, character.id).toBe(character.id === 'purgamist');
    }
  });

  it('is present outside a round and has no sell value', () => {
    const { state } = game.newRun({ seed: 'list-shop', character: 'purgamist' });
    state.phase = 'shop';
    state.shop = {
      offers: [],
      rerollCost: 2,
      rerolls: 0,
      purchases: 0,
      visit: 0,
      foodOffers: 0,
      foodsBought: 0,
    };
    const view = game.view(state);
    const item = view.items.find((entry) => entry.id === 'the-list-glossary');
    expect(item).toBeDefined();
    expect(item?.sellValue).toBe(0);
    expect(item?.slots).toBe(0);
  });
});
