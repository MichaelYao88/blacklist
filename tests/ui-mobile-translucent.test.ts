import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/style.css', 'utf8');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

function backgroundAlpha(selector: string): number {
  const match = /background:\s*rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/.exec(
    ruleBody(selector),
  );
  if (!match) throw new Error(`Missing rgba background for ${selector}`);
  return Number(match[1]);
}

describe('mobile floating boxes are somewhat translucent', () => {
  it('uses a background alpha between 0.70 and 0.80', () => {
    for (const selector of [
      '.mobile-timer',
      '.mobile-timer.urgent',
      '#mobile-damage-root .guess-damage',
    ]) {
      const alpha = backgroundAlpha(selector);
      expect(alpha, selector).toBeGreaterThanOrEqual(0.7);
      expect(alpha, selector).toBeLessThanOrEqual(0.8);
    }
  });

  it('leaves the desktop rail damage chip background alone', () => {
    expect(backgroundAlpha('.guess-damage')).toBeCloseTo(0.07, 2);
  });
});
