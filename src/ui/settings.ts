export interface Settings {
  music: boolean;
  sfx: boolean;
  shake: boolean;
  haptics: boolean;
  /** Reduced motion: no screen shake, flashes or slow-motion beats. */
  calm: boolean;
  /** Larger text in menus and the HUD. */
  bigText: boolean;
  /** 0..1 */
  musicVol: number;
  /** 0..1 */
  sfxVol: number;
  /** Battle graphics: auto (steps down when frames lag) · smooth (cheap effects, fixed) · pretty (full, fixed). */
  quality: Quality;
  /** Small frames-per-second readout in battle. */
  fps: boolean;
}

export type Quality = "auto" | "smooth" | "pretty";
export const QUALITIES: readonly Quality[] = ["auto", "smooth", "pretty"];

const KEY = "lastgate.settings";
/** Players who ask their OS for reduced motion start with screen shake off (still toggleable). */
const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEFAULTS: Settings = { music: true, sfx: true, shake: !reducedMotion, haptics: true, calm: reducedMotion, bigText: false, musicVol: 0.8, sfxVol: 1, quality: "auto", fps: false };

export function loadSettings(): Settings {
  try {
    const s = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
    const vol = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : d);
    s.musicVol = vol(s.musicVol, DEFAULTS.musicVol);
    s.sfxVol = vol(s.sfxVol, DEFAULTS.sfxVol);
    if (!QUALITIES.includes(s.quality)) s.quality = DEFAULTS.quality;
    for (const k of ["music", "sfx", "shake", "haptics", "calm", "bigText", "fps"] as const) if (typeof s[k] !== "boolean") s[k] = DEFAULTS[k];
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Short vibration where supported (Android); silently ignored elsewhere (iOS Safari has no vibrate). */
export function buzz(s: Settings, ms: number): void {
  if (s.haptics && "vibrate" in navigator) navigator.vibrate(ms);
}

/** Whether this device can vibrate at all (iPhones can't from a web page). */
export const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

/** Apply the display settings that live outside the canvas (large text, reduced motion for the menus). */
export function applyDisplaySettings(s: Settings): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("lg-big", s.bigText);
  document.documentElement.classList.toggle("lg-calm", s.calm);
}
