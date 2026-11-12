/**
 * Platform-agnostic core entry point.
 *
 * Nothing in this folder may import browser APIs, the DOM, or content.
 * Feed `createCore` a Content object and drive it with Commands.
 */
export * from './types';
export { createCore } from './engine';
export { CoreHost, MemoryStore } from './host';
export type { SaveStore, CoreHostOptions } from './host';
export { hashSeed, rngNext, rngInt, rngPick, rngChance, rngShuffle } from './rng';
export { scoreGuess, truthCounts, isAllAbsent, sharedLetters, presentTruth } from './score';
