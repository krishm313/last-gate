/**
 * Tiny procedural music loop: a march-like drum pattern and a minor-key bass/lead ostinato.
 * Intensity (0..1) adds layers as waves get harder; `boss` switches to a darker pattern.
 */
export class Music {
  private timer = 0;
  private nextTime = 0;
  private stepIdx = 0;
  private out: GainNode | null = null;
  intensity = 0;
  boss = false;
  playing = false;

  constructor(private getCtx: () => AudioContext | null, private getDest: () => AudioNode | null) {}

  start(): void {
    const ctx = this.getCtx();
    const dest = this.getDest();
    if (!ctx || !dest || this.playing) return;
    this.out = ctx.createGain();
    this.out.gain.value = 0.32;
    this.out.connect(dest);
    this.playing = true;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop(): void {
    this.playing = false;
    clearInterval(this.timer);
    this.out?.disconnect();
    this.out = null;
  }

  private schedule(): void {
    const ctx = this.getCtx();
    if (!ctx || !this.out) return;
    const bpm = this.boss ? 132 : 112 + this.intensity * 12;
    const sixteenth = 60 / bpm / 4;
    // Fell behind (throttled background tab): skip ahead instead of firing every missed note at once.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.2) {
      this.playStep(ctx, this.stepIdx, this.nextTime);
      this.nextTime += sixteenth;
      this.stepIdx = (this.stepIdx + 1) % 64;
    }
  }

  private note(ctx: AudioContext, type: OscillatorType, freq: number, t: number, dur: number, gain: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private drum(ctx: AudioContext, t: number, f0: number, f1: number, dur: number, gain: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private playStep(ctx: AudioContext, i: number, t: number): void {
    const s = i % 16;
    const bar = Math.floor(i / 16);
    // Drums: march pattern.
    if (s === 0 || s === 8 || (this.intensity > 0.4 && s === 10)) this.drum(ctx, t, 120, 40, 0.25, 0.7);
    if (s === 4 || s === 12) this.drum(ctx, t, 220, 120, 0.12, 0.35);
    if (this.intensity > 0.6 && s % 2 === 1) this.drum(ctx, t, 900, 600, 0.03, 0.06);

    // A-minor-ish progression: Am, F, G, E (boss: Am, Bb, Am, E — darker).
    const roots = this.boss ? [110, 116.5, 110, 82.4] : [110, 87.3, 98, 82.4];
    const root = roots[bar % 4]!;
    if (s % 4 === 0) this.note(ctx, "triangle", root / 2, t, 0.28, 0.35);
    if (this.intensity > 0.25 && s % 4 === 2) this.note(ctx, "triangle", root, t, 0.12, 0.18);
    // Lead motif on top once things heat up.
    if (this.intensity > 0.5) {
      const motif = [0, -1, 7, -1, 5, -1, 3, 2, 0, -1, 3, -1, 5, 7, -1, -1];
      const st = motif[s]!;
      if (st >= 0) this.note(ctx, "square", root * 2 * 2 ** (st / 12), t, 0.14, 0.035);
    }
  }
}
