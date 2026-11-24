import type { ProcChange } from '../core/types';

export interface ProcFlyGroup {
  kind: 'gold' | 'hp' | 'armor' | 'spell';
  icon: string;
  amount: number;
}

/** Folds proc deltas into one flying icon per resource family. */
export function groupProcChanges(changes: ProcChange[]): ProcFlyGroup[] {
  let gold = 0;
  let hearts = 0;
  let shields = 0;
  const spells: ProcFlyGroup[] = [];
  for (const change of changes) {
    switch (change.kind) {
      case 'gold':
        gold += change.amount;
        break;
      case 'hp':
      case 'maxHp':
        hearts += change.amount;
        break;
      case 'armor':
      case 'maxArmor':
        shields += change.amount;
        break;
      case 'spell':
        if (change.count > 0) {
          spells.push({ kind: 'spell', icon: '✦', amount: change.count });
        }
        break;
      default:
        break;
    }
  }
  const groups: ProcFlyGroup[] = [];
  if (gold > 0) groups.push({ kind: 'gold', icon: '🪙', amount: gold });
  if (hearts > 0) groups.push({ kind: 'hp', icon: '❤️', amount: hearts });
  if (shields > 0) groups.push({ kind: 'armor', icon: '🛡️', amount: shields });
  groups.push(...spells);
  return groups;
}
