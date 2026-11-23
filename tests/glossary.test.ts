import { describe, expect, it } from 'vitest';
import { glossaryText } from '../src/ui/glossary';

describe('glossary tooltips', () => {
  it('wraps the most specific phrase once', () => {
    const html = glossaryText('Gain a random spell and 5 max HP.');
    expect(html.match(/data-tip=/g)).toHaveLength(2);
    expect(html).toContain('>random spell</span>');
    expect(html).toContain('>max HP</span>');
  });

  it('escapes content while still annotating keywords', () => {
    const html = glossaryText('5 < 6 gold');
    expect(html).toContain('&lt;');
    expect(html).toContain('>gold</span>');
    expect(html).not.toContain('<span class="kw" data-tip="Gold');
  });

  it('never nests one keyword inside another', () => {
    const html = glossaryText('A guess with 4+ revealed letters: random spell.');
    expect(html.match(/<span class="kw"/g)).toHaveLength(2);
    expect(html).toContain('>revealed letters</span>');
    expect(html).toContain('>random spell</span>');
  });

  it('leaves empty text alone', () => {
    expect(glossaryText('')).toBe('');
  });

  it('distinguishes HP hits, purged letters, and armor from the clock', () => {
    const hit = glossaryText('A Hit (HP damage).');
    expect(hit).toContain('not your armor');

    const purged = glossaryText('The letter is purged.');
    expect(purged).toContain('no puzzle answer will ever contain it');

    const armor = glossaryText('armor');
    expect(armor).toContain('soaks damage before HP');
    expect(armor).not.toContain('Running out of time');
  });

  it('links the word hit in item text', () => {
    const html = glossaryText('Solve without taking a hit: Restore.');
    expect(html).toContain('>hit</span>');
    expect(html).toContain('>Restore</span>');
  });
});
