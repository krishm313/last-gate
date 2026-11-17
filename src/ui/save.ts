import { newSave, sanitizeSave, type SaveData } from "../core/meta";
import { removeItem } from "./store";

export const SAVE_KEY = "lastgate.save.v1";
const KEY = SAVE_KEY;

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeSave(JSON.parse(raw)) : newSave();
  } catch {
    return newSave();
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or disabled (private mode): the game still works, progress just isn't kept.
  }
}

/** Portable backup code (base64 of the JSON save, with a prefix so pasted junk is rejected). */
export function exportSave(s: SaveData): string {
  return "LG1:" + btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

/** Parse a backup code; returns null if it isn't one. */
export function importSave(code: string): SaveData | null {
  const t = code.trim();
  if (!t.startsWith("LG1:")) return null;
  try {
    return sanitizeSave(JSON.parse(decodeURIComponent(escape(atob(t.slice(4))))));
  } catch {
    return null;
  }
}

/** One-time "seen it" flags that belong to a playthrough (settings and mute are kept on reset). */
const PROGRESS_FLAGS = ["lastgate.tutorial", "lastgate.tipPreview", "lastgate.seenChapters", "lastgate.seenTitle"];

export function resetSave(): SaveData {
  // A reset is a fresh start: the tutorial, hints and chapter reveals should play again.
  for (const k of PROGRESS_FLAGS) removeItem(k);
  const s = newSave();
  writeSave(s);
  return s;
}
