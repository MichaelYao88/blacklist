const SOUND_KEY = 'blacklist.sound.v1';

export type SoundName =
  | 'hit'
  | 'armor'
  | 'block'
  | 'hurt'
  | 'tick'
  | 'solve'
  | 'buy'
  | 'coin'
  | 'error'
  | 'death'
  | 'win';

type AudioCtor = new () => AudioContext;

/** Tiny synthesized SFX. No audio files, no network requests. */
class Sfx {
  private ctx: AudioContext | null = null;
  private enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      this.enabled = true;
    }
  }

  get muted(): boolean {
    return !this.enabled;
  }

  setMuted(muted: boolean): void {
    this.enabled = !muted;
    try {
      localStorage.setItem(SOUND_KEY, muted ? 'off' : 'on');
    } catch {
      // Ignore private mode.
    }
  }

  toggle(): boolean {
    this.setMuted(this.enabled);
    if (this.enabled) this.play('coin');
    return this.muted;
  }

  /** Browsers require a gesture before audio can start. */
  unlock(): void {
    if (!this.enabled) return;
    const ctx = this.audio();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    const ctx = this.audio();
    if (!ctx || ctx.state === 'suspended') return;

    switch (name) {
      case 'hit':
        this.thud(ctx, 130, 44, 0.24, 'sawtooth', 0.16);
        this.thud(ctx, 320, 90, 0.1, 'square', 0.05);
        break;
      case 'hurt':
        this.thud(ctx, 90, 40, 0.16, 'triangle', 0.09);
        break;
      case 'armor':
        this.tone(ctx, 1180, 760, 0.14, 'triangle', 0.08);
        this.tone(ctx, 520, 480, 0.2, 'sine', 0.04);
        break;
      case 'block':
        this.tone(ctx, 480, 430, 0.1, 'sine', 0.05);
        break;
      case 'tick':
        this.tone(ctx, 980, 900, 0.045, 'square', 0.035);
        break;
      case 'solve':
        this.arp(ctx, [523, 659, 784, 1047], 0.085, 'sine', 0.06);
        break;
      case 'buy':
        this.tone(ctx, 640, 880, 0.09, 'triangle', 0.06);
        this.tone(ctx, 880, 1180, 0.1, 'triangle', 0.045, 0.07);
        break;
      case 'coin':
        this.tone(ctx, 1040, 1320, 0.07, 'triangle', 0.04);
        break;
      case 'error':
        this.tone(ctx, 170, 120, 0.14, 'square', 0.045);
        break;
      case 'death':
        this.thud(ctx, 220, 55, 0.7, 'sawtooth', 0.13);
        this.tone(ctx, 160, 70, 0.8, 'triangle', 0.07);
        break;
      case 'win':
        this.arp(ctx, [523, 659, 784, 1047, 1319], 0.12, 'sine', 0.07);
        break;
      default:
        break;
    }
  }

  private audio(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor =
      (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private tone(
    ctx: AudioContext,
    from: number,
    to: number,
    seconds: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  private thud(
    ctx: AudioContext,
    from: number,
    to: number,
    seconds: number,
    type: OscillatorType,
    volume: number,
  ): void {
    this.tone(ctx, from, to, seconds, type, volume);
  }

  private arp(
    ctx: AudioContext,
    notes: number[],
    step: number,
    type: OscillatorType,
    volume: number,
  ): void {
    notes.forEach((note, index) => {
      this.tone(ctx, note, note * 1.01, step * 1.5, type, volume, index * step);
    });
  }
}

export const sfx = new Sfx();
