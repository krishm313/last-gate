import type { GameEvent } from "../core/events";

/**
 * Procedural sound effects with the Web Audio API (no audio files).
 * Each sound is throttled so a hundred arrows don't become white noise.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private effects: GainNode | null = null;
  musicOn = true;
  sfxOn = true;
  /** Channel volumes 0..1 (applied on top of the on/off toggles). */
  musicVol = 1;
  sfxVol = 1;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  muted = false;
  volume = 0.7;

  /** Must be called from a user gesture (iOS requirement). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return; // audio unavailable (too many contexts, blocked): play silently
      }
      // master → compressor → speakers; effects and music are separate sub-mixes into master.
      const master = this.ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      master.connect(comp).connect(this.ctx.destination);
      this.effects = this.ctx.createGain();
      this.effects.gain.value = this.sfxOn ? this.sfxVol : 0;
      this.effects.connect(master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? this.musicVol : 0;
      this.musicGain.connect(master);
      this.masterNode = master;
      this.master = this.effects;
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    // "suspended" or iOS's "interrupted" (after a call/Siri): try to resume on every user gesture.
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  private masterNode: GainNode | null = null;

  get output(): GainNode | null {
    return this.master;
  }

  /** Where the music should connect (its own sub-mix). */
  get musicOutput(): GainNode | null {
    return this.musicGain;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterNode && this.ctx) this.masterNode.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  setChannels(music: boolean, sfx: boolean, musicVol = this.musicVol, sfxVol = this.sfxVol): void {
    this.musicOn = music;
    this.sfxOn = sfx;
    this.musicVol = musicVol;
    this.sfxVol = sfxVol;
    if (!this.ctx) return;
    this.musicGain?.gain.setTargetAtTime(music ? musicVol : 0, this.ctx.currentTime, 0.05);
    this.effects?.gain.setTargetAtTime(sfx ? sfxVol : 0, this.ctx.currentTime, 0.05);
  }

  private ok(name: string, minGap: number): boolean {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < minGap) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, filter: BiquadFilterType, freq: number, q = 1, delay = 0, freqEnd?: number): void {
    const c = this.ctx;
    if (!c || !this.noiseBuf || this.muted) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.loop = true; // the 1 s buffer + random offset would otherwise cut long rumbles short
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private jitter(f: number): number {
    return f * (0.92 + Math.random() * 0.16);
  }

  play(ev: GameEvent): void {
    switch (ev.type) {
      case "shoot":
        if (ev.owner === "hero" && this.ok("bow", 0.06)) {
          this.noise(0.07, 0.25, "bandpass", this.jitter(2400), 2);
          this.tone("triangle", this.jitter(520), 180, 0.08, 0.12);
        } else if (ev.owner === "archer" && this.ok("abow", 0.09)) this.noise(0.05, 0.08, "bandpass", this.jitter(3000), 3);
        else if (ev.owner === "enemy" && this.ok("xbow", 0.15)) this.tone("square", 300, 120, 0.06, 0.05);
        break;
      case "hit":
        if (ev.crit && this.ok("crit", 0.05)) {
          this.tone("square", this.jitter(1400), 900, 0.09, 0.1);
          this.noise(0.06, 0.2, "highpass", 2500);
        } else if (this.ok("hit", 0.035)) this.noise(0.05, 0.18, "lowpass", this.jitter(1300), 1);
        break;
      case "kill":
        if (ev.enemy.boss) {
          this.noise(1.2, 0.6, "lowpass", 900, 1, 0, 60);
          this.tone("sawtooth", 160, 40, 1.0, 0.25);
        } else if (this.ok("kill", 0.04)) {
          this.tone("square", this.jitter(ev.enemy.radius > 15 ? 220 : 420), 90, 0.12, 0.09);
          this.noise(0.08, 0.15, "bandpass", this.jitter(800), 1.5);
        }
        if (ev.gold > 0 && this.ok("coin", 0.07)) this.tone("sine", this.jitter(1800), 2400, 0.08, 0.05, 0.08);
        break;
      case "gateHit":
        if (this.ok("gate", 0.08)) {
          this.tone("sine", 110, 45, 0.22, 0.4);
          this.noise(0.12, 0.25, "lowpass", 500);
        }
        break;
      case "zap":
        if (this.ok("zap", 0.06)) {
          this.tone("sawtooth", this.jitter(1600), 300, 0.12, 0.08);
          this.noise(0.1, 0.12, "highpass", 3000);
        }
        break;
      case "boom":
        if (this.ok("boom", 0.05)) {
          if (ev.kind === "shatter") {
            this.noise(0.25, 0.25, "highpass", 4000);
            this.tone("triangle", 2600, 1200, 0.15, 0.06);
          } else if (ev.kind === "plague") this.noise(0.35, 0.2, "bandpass", 600, 3, 0, 300);
          else this.noise(0.35, 0.35, "lowpass", ev.kind === "nova" ? 2000 : 1200, 1, 0, 150);
        }
        break;
      case "sapper":
        this.noise(0.6, 0.7, "lowpass", 1500, 1, 0, 60);
        this.tone("sine", 90, 30, 0.5, 0.5);
        break;
      case "tower":
        if (ev.kind === "catapult" && this.ok("cat", 0.2)) this.noise(0.15, 0.3, "lowpass", 500);
        else if (ev.kind === "ballista" && this.ok("bal", 0.2)) {
          this.tone("triangle", 180, 60, 0.15, 0.2);
          this.noise(0.1, 0.25, "bandpass", 1200, 2);
        }
        break;
      case "ability":
        this.tone("sawtooth", 220, 880, 0.35, 0.12);
        this.noise(0.5, 0.3, "bandpass", 1500, 1, 0, 300);
        if (ev.id === "shieldBash") this.tone("sine", 90, 40, 0.4, 0.5);
        break;
      case "abilityReady":
        this.tone("sine", 880, 1320, 0.15, 0.07);
        this.tone("sine", 1320, 1760, 0.15, 0.05, 0.08);
        break;
      case "immune":
        if (this.ok("immune", 0.15)) this.tone("sine", 2000, 2400, 0.05, 0.03);
        break;
      case "block":
        if (this.ok("block", 0.06)) this.tone("square", this.jitter(900), 700, 0.05, 0.06);
        break;
      case "heal":
        if (this.ok("heal", 0.3)) {
          this.tone("sine", 660, 990, 0.25, 0.06);
          this.tone("sine", 880, 1320, 0.25, 0.04, 0.05);
        }
        break;
      case "summon":
        this.tone("sawtooth", 120, 80, 0.4, 0.12);
        break;
      case "bossSpawn":
      case "enrage":
        this.tone("sawtooth", 90, 60, 1.1, 0.25);
        this.tone("sawtooth", 92, 61, 1.1, 0.2);
        this.noise(0.9, 0.2, "lowpass", 400, 1, 0, 100);
        break;
      case "waveStart":
        // Nightfall: a long, low war horn (root + fifth, sliding up a touch) over three war-drum thuds.
        this.tone("sawtooth", 110, 116, 1.5, 0.11);
        this.tone("sawtooth", 165, 173, 1.3, 0.06, 0.05);
        this.tone("triangle", 220, 232, 1.2, 0.05, 0.1);
        for (let i = 0; i < 3; i++) {
          this.tone("sine", 90, 40, 0.28, 0.25, 0.2 + i * 0.42);
          this.noise(0.12, 0.18, "lowpass", 300, 1, 0.2 + i * 0.42);
        }
        break;
      case "offers":
        for (const [i, f] of [523, 659, 784].entries()) this.tone("triangle", f, f, 0.18, 0.09, i * 0.07);
        break;
      case "upgrade":
        for (const [i, f] of [784, 988, 1175, 1568].entries()) this.tone("triangle", f, f, 0.2, 0.08, i * 0.05);
        break;
      case "won":
        for (const [i, f] of [392, 523, 659, 784, 1047].entries()) this.tone("sawtooth", f, f, 0.5, 0.08, i * 0.14);
        break;
      case "lost":
        for (const [i, f] of [392, 330, 262, 196].entries()) this.tone("sawtooth", f, f * 0.97, 0.5, 0.09, i * 0.22);
        this.noise(1.0, 0.5, "lowpass", 600, 1, 0, 50);
        break;
      default:
        break;
    }
  }

  /** Coin pickup: pitch climbs with the streak (musical steps). */
  coin(streak: number): void {
    if (!this.ok("coin2", 0.035)) return;
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 1320 * 2 ** (steps[Math.min(steps.length - 1, streak)]! / 12);
    this.tone("sine", f, f * 1.02, 0.09, 0.07);
    this.tone("triangle", f * 2, f * 2, 0.05, 0.02);
  }

  /** Paying into a plot: soft ticks that rise as the plot fills (0..1). */
  pay(progress: number): void {
    if (!this.ok("pay", 0.04)) return;
    const f = 500 + progress * 700;
    this.tone("square", f, f * 0.9, 0.04, 0.035);
  }

  /** Dawn: a bright rising arpeggio with a shimmer — the night is over. */
  dawn(): void {
    for (const [i, f] of [523, 659, 784, 1047, 1319].entries()) this.tone("sine", f, f, 0.5, 0.06, i * 0.09);
    for (let i = 0; i < 6; i++) this.tone("triangle", 2093 + i * 180, 2093 + i * 180, 0.12, 0.018, 0.5 + i * 0.05);
  }

  /** Big build-complete chord. */
  built(): void {
    for (const [i, f] of [523, 659, 784, 1047].entries()) this.tone("triangle", f, f, 0.35, 0.08, i * 0.04);
    this.noise(0.25, 0.2, "lowpass", 900);
  }

  /** Catapult release: creak + wooden thunk. */
  catapult(): void {
    if (!this.ok("catapult", 0.15)) return;
    this.tone("triangle", 140, 60, 0.18, 0.25);
    this.noise(0.12, 0.25, "lowpass", 600);
  }

  /** Treasure goblin appears: jingling coins. */
  jingle(): void {
    for (let i = 0; i < 5; i++) this.tone("sine", 1800 + i * 220, 2200 + i * 220, 0.08, 0.05, i * 0.06);
  }

  /** Siege Lord: the horde is sent in — two war-drum hits and a horn blast. */
  warDrums(): void {
    if (!this.ok("warDrums", 0.25)) return;
    for (const t of [0, 0.16]) { this.tone("sine", 95, 45, 0.22, 0.32, t); this.noise(0.1, 0.18, "lowpass", 260, 1, t); }
    this.tone("sawtooth", 196, 220, 0.35, 0.05, 0.3);
  }

  /** Allied soldier falls. */
  grunt(): void {
    if (!this.ok("grunt", 0.2)) return;
    this.tone("sawtooth", 180, 90, 0.18, 0.08);
  }

  /** Camp events added after the original set (new enemies, bosses, buildings, weather). Rate-limited. */
  event(type: string): void {
    switch (type) {
      case "frostNova":
        if (!this.ok("nova", 0.5)) return;
        this.noise(0.7, 0.35, "highpass", 2500, 1, 0, 6000);
        for (const [i, f] of [1568, 2093, 2637, 3136].entries()) this.tone("sine", f, f * 1.01, 0.5, 0.04, i * 0.05);
        this.tone("triangle", 300, 90, 0.5, 0.18);
        break;
      case "towerFrozen":
        if (!this.ok("frozen", 0.12)) return;
        this.noise(0.18, 0.25, "bandpass", 3500, 4);
        this.tone("square", 1200, 600, 0.08, 0.03);
        break;
      case "towerStunned":
        if (!this.ok("stun", 0.15)) return;
        this.tone("triangle", 220, 70, 0.2, 0.28);
        this.noise(0.15, 0.25, "lowpass", 700);
        break;
      case "ablaze":
        if (!this.ok("ablaze", 0.3)) return;
        this.noise(0.5, 0.3, "bandpass", 900, 1, 0, 2500);
        break;
      case "fireOut":
        this.noise(0.35, 0.25, "highpass", 2500, 1, 0, 800);
        break;
      case "tide":
        if (!this.ok("tide", 1)) return;
        this.noise(1.6, 0.4, "lowpass", 400, 1, 0, 1600);
        this.noise(1.2, 0.2, "bandpass", 1200, 1, 0.3, 500);
        break;
      case "eruption":
        if (!this.ok("erupt", 0.6)) return;
        this.tone("sine", 70, 28, 0.9, 0.6);
        this.noise(1.1, 0.45, "lowpass", 600, 1, 0, 90);
        this.noise(0.4, 0.25, "bandpass", 1800, 2, 0.1);
        break;
      case "bossSlam":
        if (!this.ok("slam", 0.4)) return;
        this.tone("sine", 90, 30, 0.6, 0.6);
        this.noise(0.5, 0.45, "lowpass", 400, 1, 0, 80);
        break;
      case "warcry":
        if (!this.ok("warcry", 1)) return;
        // A war horn: two low brassy notes.
        this.tone("sawtooth", 146.8, 146.8, 0.45, 0.12);
        this.tone("sawtooth", 196, 196, 0.6, 0.12, 0.4);
        this.tone("sawtooth", 98, 98, 1.0, 0.08);
        break;
      case "curse":
        if (!this.ok("curse", 1)) return;
        for (const [i, f] of [880, 830, 784, 740, 698].entries()) this.tone("triangle", f, f * 0.94, 0.3, 0.05, i * 0.08);
        this.noise(0.9, 0.12, "bandpass", 600, 3, 0, 200);
        break;
      case "boulderThrow":
        if (!this.ok("boulder", 0.3)) return;
        this.noise(0.6, 0.18, "bandpass", 300, 2, 0, 900);
        break;
      case "eliteSpawn":
        if (!this.ok("elite", 0.6)) return;
        this.tone("square", 392, 392, 0.09, 0.05);
        this.tone("square", 587, 587, 0.14, 0.05, 0.08);
        break;
      case "shieldBreak":
        if (!this.ok("shield", 0.15)) return;
        this.noise(0.3, 0.3, "highpass", 3000);
        for (let i = 0; i < 4; i++) this.tone("sine", this.jitter(2600 + i * 400), 1800, 0.12, 0.03, i * 0.03);
        break;
      case "mageZap":
        if (!this.ok("zap", 0.2)) return;
        this.tone("sawtooth", 1800, 400, 0.12, 0.05);
        this.noise(0.12, 0.15, "highpass", 4000);
        break;
      case "stormBolt":
        if (!this.ok("thunder", 0.8)) return;
        this.noise(0.08, 0.5, "highpass", 2000);
        this.noise(1.4, 0.4, "lowpass", 300, 1, 0.05, 60);
        break;
      case "spikeHit":
        if (!this.ok("spike", 0.35)) return;
        this.tone("triangle", 600, 300, 0.05, 0.04);
        break;
      case "burrow":
      case "emerge":
        if (!this.ok("dig", 0.4)) return;
        this.noise(0.3, 0.2, "lowpass", 500, 1, 0, 200);
        break;
      case "specChosen":
        for (const [i, f] of [392, 523, 659, 784].entries()) this.tone("triangle", f, f, 0.3, 0.07, i * 0.06);
        break;
    }
  }

  /**
   * Victory fanfare, flavoured per chapter: a different key and voice for each land (bright brass
   * for the Border Keep, eerie for Hollow Night, glassy bells for Frostpeak, war drums for the Caldera, a heartbeat and gong for the Moors).
   */
  fanfare(chapter: number): void {
    const KEY = [0, 0, 2, -2, -5, 3, 5, -3, 1, -4, -6]; // semitones per chapter id (index = id)
    const k = 2 ** ((KEY[chapter] ?? 0) / 12);
    const minor = chapter === 4 || chapter === 7 || chapter === 9 || chapter === 10;
    const notes = (minor ? [392, 466, 587, 698, 932] : [392, 523, 659, 784, 1047]).map((f) => f * k);
    const voice: OscillatorType = chapter === 6 ? "triangle" : chapter === 4 ? "square" : "sawtooth";
    for (const [i, f] of notes.entries()) this.tone(voice, f, f, 0.5, chapter === 6 ? 0.07 : 0.08, i * 0.14);
    // Final chord, held.
    for (const f of [notes[0]! * 2, notes[2]! * 2, notes[4]!]) this.tone("triangle", f, f, 1.4, 0.04, 0.75);
    if (chapter === 6) for (let i = 0; i < 6; i++) this.tone("sine", 2093 * k + i * 260, 2093 * k + i * 260, 0.25, 0.025, 0.8 + i * 0.07);
    if (chapter === 7) for (let i = 0; i < 4; i++) { this.tone("sine", 90, 40, 0.25, 0.35, i * 0.18); this.noise(0.15, 0.2, "lowpass", 300, 1, i * 0.18); }
    // Bloodmoon Moors: a slow double heartbeat under the chord, then a deep gong.
    if (chapter === 9) {
      for (const t of [0.75, 0.95, 1.55, 1.75]) this.tone("sine", 70, 38, 0.22, 0.3, t);
      this.tone("sine", 110, 104, 2.2, 0.12, 0.8);
    }
    // The Hollow Throne: a tolling bell under the chord.
    if (chapter === 10) for (const t of [0.8, 1.6, 2.4]) { this.tone("sine", 196, 194, 1.2, 0.07, t); this.tone("sine", 392, 389, 0.8, 0.03, t); }
    if (chapter === 99) this.noise(0.8, 0.12, "bandpass", 1200, 2, 0.7, 4000);
  }

  /** New building unlocked. */
  unlockChime(): void {
    this.noise(0.4, 0.15, "bandpass", 800, 2, 0, 3000);
    for (const [i, f] of [659, 880, 1175].entries()) this.tone("triangle", f, f, 0.25, 0.07, 0.1 + i * 0.08);
  }

  /** Kill-streak milestone: rising power chord, brighter for bigger tiers (1..4). */
  streak(tier: number): void {
    if (!this.ok("streak", 0.3)) return;
    const base = 392 * 2 ** ((tier - 1) * 2 / 12);
    for (const [i, m] of [1, 1.25, 1.5, 2].entries()) this.tone("sawtooth", base * m, base * m * 1.01, 0.28, 0.035, i * 0.05);
    this.tone("triangle", base * 4, base * 4, 0.35, 0.04, 0.2);
    this.noise(0.3, 0.12, "highpass", 3000);
  }

  /** Hall in danger: a low "lub-dub" thump; `urgency` 0..1 makes it louder. */
  heartbeat(urgency: number): void {
    if (!this.ok("heart", 0.3)) return;
    const v = 0.12 + urgency * 0.12;
    this.tone("sine", 70, 45, 0.14, v);
    this.tone("sine", 62, 40, 0.12, v * 0.75, 0.18);
  }

  /** Locked / can't afford: two short low buzzes. */
  denied(): void {
    if (!this.ok("denied", 0.15)) return;
    this.tone("square", 180, 160, 0.07, 0.05);
    this.tone("square", 150, 130, 0.09, 0.05, 0.09);
  }

  /** Bright two-note rise (hero selected in the menu). The in-run "ability ready" cue is the abilityReady event. */
  heroPick(): void {
    if (!this.ok("abReady", 0.5)) return;
    this.tone("triangle", 988, 988, 0.12, 0.06);
    this.tone("triangle", 1480, 1480, 0.2, 0.07, 0.09);
  }

  /** Side games: bow twang, target thunk, bullseye ding, wagon crash, pickup. */
  mini(kind: "twang" | "thunk" | "bull" | "crash" | "pickup" | "star" | "roar" | "clang" | "ring"): void {
    if (!this.ok(`mini_${kind}`, kind === "star" ? 0.2 : 0.05)) return;
    if (kind === "twang") {
      this.tone("triangle", 330, 180, 0.12, 0.07);
      this.noise(0.05, 0.06, "highpass", 2500);
    } else if (kind === "thunk") {
      this.tone("sine", 220, 90, 0.1, 0.18);
      this.noise(0.06, 0.12, "lowpass", 900);
    } else if (kind === "bull") {
      this.tone("sine", 220, 90, 0.1, 0.16);
      this.tone("triangle", 1568, 1568, 0.25, 0.06, 0.04);
      this.tone("triangle", 2093, 2093, 0.3, 0.05, 0.1);
    } else if (kind === "crash") {
      this.noise(0.25, 0.3, "lowpass", 700);
      this.tone("sawtooth", 140, 60, 0.2, 0.08);
    } else if (kind === "roar") {
      // The dragon draws breath: a low growl rising into a roar.
      this.tone("sawtooth", 70, 140, 0.55, 0.12);
      this.tone("square", 95, 60, 0.6, 0.05, 0.1);
      this.noise(0.6, 0.25, "lowpass", 500);
    } else if (kind === "clang") {
      // Hammer on hot steel: a bright metallic hit with inharmonic overtones.
      this.noise(0.04, 0.16, "highpass", 3000);
      this.tone("square", 880, 860, 0.09, 0.05);
      this.tone("triangle", 1245, 1230, 0.22, 0.06);
      this.tone("sine", 2350, 2330, 0.3, 0.03);
    } else if (kind === "ring") {
      // A perfect strike: the anvil rings out long and clear.
      this.noise(0.04, 0.14, "highpass", 3200);
      this.tone("triangle", 1047, 1047, 0.5, 0.07);
      this.tone("sine", 1568, 1568, 0.6, 0.05, 0.01);
      this.tone("sine", 2637, 2637, 0.45, 0.025, 0.02);
    } else if (kind === "star") {
      for (const [i, f] of [988, 1319, 1760].entries()) this.tone("triangle", f, f, 0.22, 0.06, i * 0.05);
    } else {
      this.tone("sine", 1320, 1360, 0.08, 0.06);
      this.tone("sine", 1760, 1800, 0.1, 0.05, 0.05);
    }
  }

  /** UI click. */
  click(): void {
    if (this.ok("click", 0.03)) this.tone("triangle", 700, 500, 0.05, 0.08);
  }
}
