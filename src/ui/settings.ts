export interface Settings {
  music: boolean;
  sfx: boolean;
  shake: boolean;
  haptics: boolean;
  /** 0..1 */
  musicVol: number;
  /** 0..1 */
  sfxVol: number;
}

const KEY = "lastgate.settings";
/** Players who ask their OS for reduced motion start with screen shake off (still toggleable). */
const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEFAULTS: Settings = { music: true, sfx: true, shake: !reducedMotion, haptics: true, musicVol: 0.8, sfxVol: 1 };

export function loadSettings(): Settings {
  try {
    const s = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
    const vol = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : d);
    s.musicVol = vol(s.musicVol, DEFAULTS.musicVol);
    s.sfxVol = vol(s.sfxVol, DEFAULTS.sfxVol);
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
