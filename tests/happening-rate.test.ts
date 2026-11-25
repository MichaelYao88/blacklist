import { describe, expect, it } from 'vitest';
import { game } from '../src/game';
import { HAPPENING_CHANCE, MAX_LEVEL } from '../src/core/engine';

describe('happening rate', () => {
  it('uses the named 42 percent constant', () => {
    expect(HAPPENING_CHANCE).toBe(42);
    expect(MAX_LEVEL).toBe(40);
  });

  it('produces a happening share near 42 percent after fights over many seeds', () => {
    let rounds = 0;
    let happenings = 0;
    for (let index = 0; index < 300; index++) {
      const { state } = game.newRun({ seed: `happening-rate-${index}` });
      rounds += state.nodes.filter((node) => node.kind === 'round').length;
      happenings += state.nodes.filter((node) => node.kind === 'happening').length;
    }
    const share = happenings / rounds;
    expect(rounds).toBe(300 * 18);
    expect(share).toBeGreaterThan(0.36);
    expect(share).toBeLessThan(0.48);
  });
});
