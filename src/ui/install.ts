// "Install the app" support. Chromium browsers fire `beforeinstallprompt`, which we stash and replay
// from a button; iOS Safari has no prompt, so there we show the manual Share → Add to Home Screen hint.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => (deferred = null));
}

/** Already running as an installed app (home-screen / standalone window)? */
export function isInstalled(): boolean {
  return (
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function canPromptInstall(): boolean {
  return !!deferred && !isInstalled();
}

/** iPhone/iPad Safari, not yet installed: needs the manual Add to Home Screen steps. */
export function needsIosHint(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && !isInstalled();
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  try {
    await e.prompt();
    return (await e.userChoice).outcome === "accepted";
  } catch {
    return false; // prompt refused (no user activation / already used): just fall back to the settings screen
  }
}
