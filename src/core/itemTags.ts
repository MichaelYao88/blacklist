import type { ItemDef, ItemTag } from './types';

/**
 * Gameplay families an item can belong to. Tags are static content, never
 * saved on an ItemInstance, so old saves inherit the current tags by item id.
 */
export function itemTags(def: ItemDef | undefined): ItemTag[] {
  return def?.tags ? def.tags.slice() : [];
}

export function itemHasTag(def: ItemDef | undefined, tag: ItemTag): boolean {
  return def?.tags?.includes(tag) ?? false;
}
