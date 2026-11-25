import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/style.css', 'utf8');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

describe('mobile floating boxes share the top row', () => {
  it('pins the timer to the left and the damage box to the right at the same top', () => {
    const timer = ruleBody('#mobile-timer-root');
    const damage = ruleBody('#mobile-damage-root');

    expect(timer).toMatch(/top:\s*max\(8px, env\(safe-area-inset-top\)\)/);
    expect(damage).toMatch(/top:\s*max\(8px, env\(safe-area-inset-top\)\)/);

    expect(timer).toMatch(/left:\s*max\(8px, env\(safe-area-inset-left\)\)/);
    expect(timer).not.toMatch(/translateX/);

    expect(damage).toMatch(/right:\s*max\(8px, env\(safe-area-inset-right\)\)/);
    expect(damage).toMatch(/left:\s*auto/);
    expect(damage).toMatch(/transform:\s*none/);

    expect(timer).not.toMatch(/56px/);
    expect(damage).not.toMatch(/56px/);
  });
});

describe('mobile drawer cards wrap at word boundaries', () => {
  it('does not break words with anywhere or break-all', () => {
    const card = ruleBody('.mobile-item-drawer .item-card');

    expect(card).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(card).not.toMatch(/word-break:\s*break-all/);
    expect(card).toMatch(/overflow-wrap:\s*break-word/);
    expect(card).toMatch(/word-break:\s*normal/);
  });

  it('keeps the unrelated chronicle wrapping untouched', () => {
    expect(css).toMatch(/\.chronicle-text\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
