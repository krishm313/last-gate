/**
 * How intense the music should be right now (0 calm … 1 desperate), from the run's state.
 * Day (building) stays calm; at nightfall the drums come in; it rises as the campaign goes on,
 * as the night wears on (fewer foes left to come is NOT calmer — the end of a night is the push),
 * and sharply when the hall is in danger.
 */
export interface MusicState {
  /** "build" by day, "wave" at night (anything else: calm). */
  phase: string;
  wave: number;
  waves: number;
  /** 0..1 share of the night's foes already spawned. */
  nightProgress: number;
  /** 0..1 hall health. */
  hallFrac: number;
}

export function musicIntensity(s: MusicState): number {
  if (s.phase !== "wave") return 0.1;
  const campaign = s.waves > 0 ? Math.min(1, s.wave / s.waves) : 0.5;
  const danger = s.hallFrac < 0.5 ? (0.5 - s.hallFrac) * 1.2 : 0;
  const v = 0.35 + campaign * 0.25 + Math.min(1, Math.max(0, s.nightProgress)) * 0.15 + danger;
  return Math.max(0, Math.min(1, v));
}
