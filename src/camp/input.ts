import type { Vec } from "./sim";

// Gamepad: left stick / d-pad walk; buttons are translated into keyboard codes and fed to the
// game's keyboard handler, so every context (menus, blessing pick, play) works the same way.

/** Standard-mapping button index → the key it acts like. A = ability/confirm, B = back, X = call wave, Y/RB = speed, Start = pause. */
const PAD_KEYS: Record<number, string> = { 0: "PadA", 1: "Escape", 2: "KeyC", 3: "KeyF", 5: "KeyF", 9: "Escape" };
/** D-pad left / up / right pick blessing cards 1 / 2 / 3. */
// Blessing pick: d-pad left/up/right choose a card, LB rerolls.
const PICK_BUTTONS = [[14, "Digit1"], [12, "Digit2"], [15, "Digit3"], [4, "KeyR"]] as const;

/** True when a controller is connected (the pick screen then shows d-pad hints). */
export function padConnected(): boolean {
  try {
    return typeof navigator.getGamepads === "function" && [...navigator.getGamepads()].some((p) => !!p?.connected);
  } catch {
    return false;
  }
}
const held = new Set<number>();

function firstPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) if (p && p.connected) return p;
  return null;
}

/** Movement from the first connected gamepad (stick with a dead zone, plus d-pad). */
export function padMove(): Vec {
  const p = firstPad();
  if (!p) return { x: 0, y: 0 };
  let x = Math.abs(p.axes[0] ?? 0) > 0.25 ? p.axes[0]! : 0;
  let y = Math.abs(p.axes[1] ?? 0) > 0.25 ? p.axes[1]! : 0;
  if (p.buttons[14]?.pressed) x -= 1;
  if (p.buttons[15]?.pressed) x += 1;
  if (p.buttons[12]?.pressed) y -= 1;
  if (p.buttons[13]?.pressed) y += 1;
  return { x, y };
}

/**
 * Edge-detects gamepad buttons once per frame and sends them through `onKey`.
 * A acts as Space while `inPlay()` and as Enter elsewhere; the d-pad picks blessings while `picking`.
 */
export function pollPad(onKey: (e: KeyboardEvent) => void, inPlay: () => boolean, picking: boolean): void {
  const p = firstPad();
  if (!p) return held.clear();
  const press = (id: number, pressed: boolean, code: () => string) => {
    if (pressed && !held.has(id)) {
      held.add(id);
      onKey({ code: code(), repeat: false } as KeyboardEvent);
    } else if (!pressed) held.delete(id);
  };
  p.buttons.forEach((b, i) => {
    const key = PAD_KEYS[i];
    if (key) press(i, b.pressed, () => (key === "PadA" ? (inPlay() ? "Space" : "Enter") : key));
  });
  if (picking) for (const [btn, code] of PICK_BUTTONS) press(100 + btn, !!p.buttons[btn]?.pressed, () => code);
  // Released after the pick screen closed? Forget it, or the next pick screen ignores the first press.
  else for (const [btn] of PICK_BUTTONS) held.delete(100 + btn);
}
