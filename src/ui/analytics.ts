/**
 * Anonymous product analytics for the itch.io demo and GitHub Pages.
 *
 * The project token is a public write-only PostHog key. Events never include
 * guesses, answers, seeds, or other typed text. Autocapture, session replay,
 * heatmaps, and exception capture stay off so a letter on the keyboard cannot
 * leave the browser. If PostHog is blocked, offline, or the player has Do Not
 * Track set, every call returns and the game continues.
 */

import type { CaptureResult } from 'posthog-js';

const POSTHOG_TOKEN = 'phc_BFzhf5CAX9wKcoGBVXnX3uPb4T2LAjeD3ZfBGiHWvFxc';
const POSTHOG_HOST = 'https://us.i.posthog.com';

/** Joins run_started with later events for the same attempt. Not a player id. */
export const RUN_REF_KEY = 'blacklist.analytics.run';

/**
 * The run is 50 floors (`MAX_LEVEL` in src/core/engine.ts).
 * Floor 50 is the boss, so a cleared run reports level 50.
 */
export const GAUNTLET_FLOORS = 50;

export const ANALYTICS_EVENTS = [
  'game_loaded',
  'run_started',
  'run_ended',
  'run_resumed',
  'run_abandoned',
  'boss_reached',
  'event_choice',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
export type AnalyticsSite = 'itch' | 'github-pages' | 'local' | 'other';
export type AnalyticsValue = string | number | boolean;
export type AnalyticsProps = Record<string, AnalyticsValue>;

const QUEUE_LIMIT = 32;
const BLOCKED_EXACT = new Set([
  'word',
  'words',
  'guess',
  'guesses',
  'answer',
  'answers',
  'text',
  'seed',
  'input',
  'phrase',
  'email',
  'ip',
]);
const BLOCKED_SUFFIXES = [
  '_word',
  '_words',
  '_guess',
  '_guesses',
  '_answer',
  '_answers',
  '_text',
  '_seed',
  '_input',
  '_phrase',
];

interface RunRef {
  id: string;
  number: number;
}

interface AnalyticsClient {
  capture: (event: string, properties?: AnalyticsProps) => void;
  register: (properties: AnalyticsProps) => void;
}

interface QueuedEvent {
  event: AnalyticsEvent;
  properties: AnalyticsProps;
}

let client: AnalyticsClient | null = null;
let starting = false;
let failed = false;
let memoryRun: RunRef | null = null;
let cachedSite: AnalyticsSite | null = null;
const queue: QueuedEvent[] = [];

export function isDoNotTrack(value: string | null | undefined): boolean {
  return value === '1' || value === 'yes';
}

export function shouldTrack(input: {
  prod: boolean;
  test: boolean;
  doNotTrack: boolean;
  failed?: boolean;
}): boolean {
  if (input.test || input.failed || input.doNotTrack) return false;
  return input.prod;
}

export function detectSite(input: {
  hostname: string;
  referrer?: string;
  ancestorHosts?: readonly string[];
}): AnalyticsSite {
  const hosts = [input.hostname, referrerHostname(input.referrer ?? ''), ...(input.ancestorHosts ?? [])];
  if (hosts.some((host) => isHostname(host, 'itch.zone') || isHostname(host, 'itch.io'))) return 'itch';
  if (isHostname(input.hostname, 'github.io')) return 'github-pages';
  const host = normalizeHost(input.hostname);
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return 'local';
  return 'other';
}

export function sanitizeProperties(
  properties: AnalyticsProps | undefined,
  site: AnalyticsSite,
): AnalyticsProps {
  const clean: AnalyticsProps = {};
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      if (isBlockedProperty(key)) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed.length > 80) continue;
        clean[key] = trimmed;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        clean[key] = value;
      } else if (typeof value === 'boolean') {
        clean[key] = value;
      }
    }
  }
  clean.site = site;
  clean.platform = site;
  return clean;
}

export function analyticsEnabled(): boolean {
  return trackingAllowed();
}

export function saveRunRef(run: RunRef): void {
  try {
    localStorage.setItem(RUN_REF_KEY, JSON.stringify({ id: run.id, number: run.number }));
  } catch {
    // Private mode or a full disk. The in-memory id still joins this page.
  }
}

export function loadRunRef(): RunRef | null {
  try {
    const raw = localStorage.getItem(RUN_REF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunRef>;
    if (typeof parsed.id !== 'string' || !parsed.id || parsed.id.length > 80) return null;
    if (typeof parsed.number !== 'number' || !Number.isFinite(parsed.number)) return null;
    return { id: parsed.id, number: Math.max(0, Math.round(parsed.number)) };
  } catch {
    return null;
  }
}

export function clearRunRef(): void {
  try {
    localStorage.removeItem(RUN_REF_KEY);
  } catch {
    // Ignore.
  }
}

export function trackGameLoaded(hasSave: boolean, priorRuns: number): void {
  safely(() => {
    capture('game_loaded', {
      has_save: hasSave,
      prior_runs: count(priorRuns),
    });
  });
}

export function trackRunStarted(input: {
  runNumber: number;
  character: string;
  ascension: number;
}): void {
  safely(() => {
    const run = beginRun(input.runNumber);
    capture('run_started', {
      run_id: run.id,
      run_number: run.number,
      character: label(input.character, 'runner'),
      ascension: count(input.ascension),
    });
  });
}

export function trackRunResumed(input: {
  runNumber: number;
  character: string;
  ascension: number;
  level: number;
}): void {
  safely(() => {
    const run = runContext(input.runNumber);
    capture('run_resumed', {
      run_id: run.id,
      run_number: run.number,
      character: label(input.character, 'runner'),
      ascension: count(input.ascension),
      level: count(input.level),
    });
  });
}

export function trackRunEnded(input: {
  runNumber: number;
  result: 'won' | 'lost';
  endedBy: 'cleared' | 'timeout' | 'hp';
  level: number;
  durationMs: number;
  character: string;
  ascension: number;
}): void {
  safely(() => {
    const run = runContext(input.runNumber);
    capture('run_ended', {
      run_id: run.id,
      run_number: run.number,
      result: input.result,
      ended_by: input.endedBy,
      level: count(input.level),
      gauntlet_floors: GAUNTLET_FLOORS,
      duration_ms: count(input.durationMs),
      character: label(input.character, 'runner'),
      ascension: count(input.ascension),
    });
    endRun();
  });
}

export function trackRunAbandoned(input: {
  runNumber: number;
  reason: 'abandon' | 'replaced';
  level: number;
  character: string;
  ascension: number;
}): void {
  safely(() => {
    const run = runContext(input.runNumber);
    capture('run_abandoned', {
      run_id: run.id,
      run_number: run.number,
      reason: input.reason,
      level: count(input.level),
      character: label(input.character, 'runner'),
      ascension: count(input.ascension),
    });
    endRun();
  });
}

export function trackBossReached(input: {
  runNumber: number;
  boss: string;
  level: number;
  character: string;
  ascension: number;
}): void {
  safely(() => {
    const run = runContext(input.runNumber);
    capture('boss_reached', {
      run_id: run.id,
      run_number: run.number,
      boss: label(input.boss, 'unknown'),
      level: count(input.level),
      character: label(input.character, 'runner'),
      ascension: count(input.ascension),
    });
  });
}

export function trackEventChoice(input: {
  runNumber: number;
  happening: string;
  option: string;
  success: boolean;
  level: number;
}): void {
  safely(() => {
    const run = runContext(input.runNumber);
    capture('event_choice', {
      run_id: run.id,
      run_number: run.number,
      happening: label(input.happening, 'unknown'),
      option: label(input.option, 'unknown'),
      success: input.success,
      level: count(input.level),
    });
  });
}

function capture(event: AnalyticsEvent, properties: AnalyticsProps): void {
  if (!trackingAllowed()) return;
  const payload = sanitizeProperties(properties, readSite());
  if (!client) {
    if (queue.length < QUEUE_LIMIT) queue.push({ event, properties: payload });
    void startAnalytics();
    return;
  }
  client.capture(event, payload);
}

async function startAnalytics(): Promise<void> {
  if (starting || client || failed || !trackingAllowed()) return;
  starting = true;
  const site = readSite();
  try {
    const posthog = (await import('posthog-js')).default;
    posthog.init(POSTHOG_TOKEN, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      rageclick: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_heatmaps: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      disable_scroll_properties: true,
      advanced_disable_feature_flags: true,
      respect_dnt: true,
      person_profiles: 'identified_only',
      persistence: 'localStorage',
      persistence_name: 'blacklist_posthog',
      cross_subdomain_cookie: false,
      secure_cookie: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: scrubSentEvent,
      loaded(instance) {
        try {
          instance.register({ site, platform: site });
          client = instance;
          const pending = queue.splice(0, queue.length);
          for (const item of pending) {
            try {
              instance.capture(item.event, item.properties);
            } catch {
              // One rejected event cannot stop the rest, or the game.
            }
          }
        } catch {
          failed = true;
          queue.length = 0;
        }
      },
    });
  } catch {
    failed = true;
    queue.length = 0;
  }
}

function scrubSentEvent(event: CaptureResult): CaptureResult | null {
  try {
    if (!isAnalyticsEvent(event.event)) return null;
    const properties = event.properties ?? {};
    for (const key of Object.keys(properties)) {
      if (isBlockedProperty(key)) delete properties[key];
    }
    const site = readSite();
    properties.site = site;
    properties.platform = site;
    event.properties = properties;
    return event;
  } catch {
    return null;
  }
}

function beginRun(runNumber: number): RunRef {
  const run = { id: createRunId(), number: count(runNumber) };
  if (!trackingAllowed()) return run;
  memoryRun = run;
  saveRunRef(run);
  return run;
}

function runContext(fallbackNumber: number): RunRef {
  if (memoryRun) return memoryRun;
  if (trackingAllowed()) {
    const stored = loadRunRef();
    if (stored) {
      memoryRun = stored;
      return stored;
    }
  }
  return beginRun(fallbackNumber);
}

function endRun(): void {
  memoryRun = null;
  if (trackingAllowed()) clearRunRef();
}

function trackingAllowed(): boolean {
  const env = readEnv();
  return shouldTrack({
    prod: env.prod,
    test: env.test,
    doNotTrack: env.test || !env.prod ? false : readDoNotTrack(),
    failed,
  });
}

function readEnv(): { prod: boolean; test: boolean } {
  try {
    const env = import.meta.env;
    if (!env) return { prod: false, test: true };
    return {
      prod: Boolean(env.PROD),
      test: Boolean(env.VITEST) || env.MODE === 'test',
    };
  } catch {
    return { prod: false, test: true };
  }
}

function readDoNotTrack(): boolean {
  try {
    const nav = navigator as Navigator & { msDoNotTrack?: string };
    const win = window as Window & { doNotTrack?: string };
    return isDoNotTrack(nav.doNotTrack) || isDoNotTrack(win.doNotTrack) || isDoNotTrack(nav.msDoNotTrack);
  } catch {
    return false;
  }
}

function readSite(): AnalyticsSite {
  if (cachedSite) return cachedSite;
  try {
    cachedSite = detectSite({
      hostname: window.location.hostname,
      referrer: document.referrer,
      ancestorHosts: readAncestorHosts(),
    });
  } catch {
    cachedSite = 'other';
  }
  return cachedSite;
}

function readAncestorHosts(): string[] {
  try {
    const withAncestors = location as Location & { ancestorOrigins?: ArrayLike<string> };
    const origins = withAncestors.ancestorOrigins;
    if (!origins) return [];
    const hosts: string[] = [];
    for (let index = 0; index < origins.length; index += 1) {
      const origin = origins[index];
      if (!origin) continue;
      try {
        hosts.push(new URL(origin).hostname);
      } catch {
        // Skip a malformed ancestor origin.
      }
    }
    return hosts;
  } catch {
    return [];
  }
}

function isAnalyticsEvent(event: string): event is AnalyticsEvent {
  return (ANALYTICS_EVENTS as readonly string[]).includes(event);
}

function isBlockedProperty(key: string): boolean {
  const lower = key.toLowerCase();
  if (BLOCKED_EXACT.has(lower)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function isHostname(hostname: string, root: string): boolean {
  const host = normalizeHost(hostname);
  return host === root || host.endsWith(`.${root}`);
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

function referrerHostname(referrer: string): string {
  if (!referrer) return '';
  try {
    return new URL(referrer).hostname;
  } catch {
    return '';
  }
}

function createRunId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to a non-cryptographic id. It only joins events.
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function count(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function label(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return fallback;
  return trimmed;
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Analytics must never break the game.
  }
}
