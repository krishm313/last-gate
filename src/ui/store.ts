// localStorage can throw (blocked cookies, old Safari private mode, full quota). These wrappers
// never throw: reads fall back to null, writes are dropped — the game keeps working either way.

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Parse a JSON value from storage, or return `fallback` if missing or corrupt. */
export function getJson<T>(key: string, fallback: T): T {
  const raw = getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
