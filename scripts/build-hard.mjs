/**
 * Offline difficulty ranking for The Censor boss.
 * This is a deterministic letter-frequency / duplicate-letter heuristic.
 * It is intentionally a build script, not runtime code.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const answers = JSON.parse(fs.readFileSync(path.join(root, 'src/data/answers.json'), 'utf8'));
const valid = JSON.parse(fs.readFileSync(path.join(root, 'src/data/valid.json'), 'utf8'));

const freq = Object.create(null);
let total = 0;
for (const word of answers) {
  for (const ch of word) {
    freq[ch] = (freq[ch] ?? 0) + 1;
    total++;
  }
}

const score = (word) => {
  let value = 0;
  const seen = new Set();
  let duplicates = 0;
  let vowels = 0;
  for (const ch of word) {
    const f = (freq[ch] ?? 1) / total;
    value += -Math.log(f);
    if (seen.has(ch)) duplicates++;
    seen.add(ch);
    if ('aeiou'.includes(ch)) vowels++;
  }
  // Rare letters, repeated letters, and few vowels tend to be harder.
  value += duplicates * 0.6;
  value += (2 - vowels) * 0.25;
  if (word.includes('q') || word.includes('x') || word.includes('z') || word.includes('j')) value += 0.5;
  return value;
};

const ranked = answers
  .map((word) => ({ word, score: Number(score(word).toFixed(4)) }))
  .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));

const hard = ranked.slice(0, 420).map((x) => x.word);
fs.writeFileSync(path.join(root, 'src/data/hard.json'), JSON.stringify(hard));
console.log(`hard=${hard.length} from answers=${answers.length} valid=${valid.length}`);
console.log(`top 10: ${hard.slice(0, 10).join(', ')}`);
