import { getItem, setItem } from "../ui/store";
import { carryCap, type Camp } from "./sim";

/** First-run tips. Each step shows until its condition is met, then the next one appears. */
interface Step {
  text: string;
  done: (c: Camp, t: TutorialState) => boolean;
}

export interface TutorialState {
  moved: number;
  startCoins: number;
}

const FINE = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;

const STEPS: Step[] = [
  { text: FINE ? "⌨️ Walk with WASD / arrow keys (or drag)" : "👆 Drag anywhere on the screen to walk", done: (_c, t) => t.moved > 1.2 },
  { text: "🏹 Walk onto a glowing plot to build an Archer Tower", done: (c) => c.plots.some((p) => p.kind === "tower" && p.level > 0) },
  { text: "🪙 Your hall sends you coins — watch them fly to you!", done: (c, t) => c.hero.coins > t.startCoins || c.hero.coins >= carryCap(c) || c.wave > 0 },
  { text: FINE ? "🌙 Ready? Press C (or click “Start the night”) — or wait for sunset" : "🌙 Ready? Tap “Start the night” — or wait for sunset", done: (c) => c.wave > 0 },
  { text: "🎯 You shoot automatically. Grab the coins enemies drop!", done: (c) => c.goldEarned >= 4 || c.wave > 1 },
];

export class Tutorial {
  private step = 0;
  private state: TutorialState = { moved: 0, startCoins: 0 };
  active: boolean;

  constructor() {
    this.active = getItem("lastgate.tutorial") !== "done";
  }

  /** Where the current tip wants the player to go (the guide arrow follows it), if anywhere. */
  get focus(): "income" | null {
    return null; // (hall coins now fly to the King on their own: no need to point at the pile)
  }

  /** Progress reset: show the first-run tips again from the start. */
  reset(): void {
    this.step = 0;
    this.state = { moved: 0, startCoins: 0 };
    this.active = true;
  }

  /** Returns the tip to show (or null). */
  update(c: Camp, dt: number, moving: boolean): string | null {
    if (!this.active) return null;
    if (moving) this.state.moved += dt;
    if (this.step === 2 && this.state.startCoins === 0) this.state.startCoins = c.hero.coins;
    while (this.step < STEPS.length && STEPS[this.step]!.done(c, this.state)) {
      this.step++;
      if (this.step === 2) this.state.startCoins = c.hero.coins;
    }
    if (this.step >= STEPS.length) {
      this.active = false;
      setItem("lastgate.tutorial", "done");
      return null;
    }
    return STEPS[this.step]!.text;
  }
}
