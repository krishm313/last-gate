import { getItem, setItem } from "../ui/store";
import { carryCap, type Camp, type Vec } from "./sim";
import { WALL_Y } from "./world";

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

  /** First run, before walking and building the first tower: the first day's clock shouldn't run
   *  out on a new player who is still reading (sunset waits until they've built). */
  get holdsClock(): boolean {
    return this.active && this.step < 2;
  }

  /** Progress reset: show the first-run tips again from the start. */
  reset(): void {
    this.step = 0;
    this.state = { moved: 0, startCoins: 0 };
    this.active = true;
  }

  /** New players don't know the King fights by walking up to foes: while foes batter the wall far
   *  from an idle King for a few seconds, nudge them over (tip + guide arrow). Retires itself once the
   *  player has answered it twice. */
  private idleFar = 0;
  private answered = getItem("lastgate.tipFight") === "done" ? 2 : 0;
  private nudging = false;
  fightNudge(c: Camp, dt: number): { text: string; at: Vec } | null {
    if (this.answered >= 2 || c.phase !== "wave" || c.hero.dead || c.reverse) { this.idleFar = 0; this.nudging = false; return null; }
    const h = c.hero;
    let near: Vec | null = null, nd = Infinity;
    for (const e of c.enemies) {
      if (!e.attacking || e.inside || e.y > WALL_Y || e.def.flying) continue;
      const d = Math.hypot(e.x - h.x, e.y - h.y);
      if (d < nd) { nd = d; near = { x: e.x, y: e.y + 30 }; }
    }
    if (!near) { this.idleFar = 0; this.nudging = false; return null; }
    if (nd < 150) {
      // Got there: that counts as answering the nudge.
      if (this.nudging && ++this.answered >= 2) setItem("lastgate.tipFight", "done");
      this.idleFar = 0;
      this.nudging = false;
      return null;
    }
    this.idleFar += dt;
    if (this.idleFar < 4) return null;
    this.nudging = true;
    return { text: "⚔️ Foes are hitting the wall — walk over, you fight automatically", at: near };
  }

  /** A player who skipped building (started the night straight away) and is back at dawn with coins
   *  and no tower gets the build tip again (the guide arrow already points at the cheapest plot). */
  private noTower = 0;
  buildNudge(c: Camp, dt: number): string | null {
    if (c.phase !== "build" || c.wave === 0 || c.reverse || c.plots.some((p) => p.kind === "tower" && p.level > 0)) { this.noTower = 0; return null; }
    const cheapest = Math.min(...c.plots.filter((p) => p.kind === "tower" && !p.locked).map((p) => p.costs[0]! - p.paid));
    if (c.hero.coins < cheapest) { this.noTower = 0; return null; }
    this.noTower += dt;
    return this.noTower > 2 ? "🏹 Walk onto a glowing plot to build an Archer Tower" : null;
  }

  /** Returns the tip to show (or null). */
  update(c: Camp, dt: number, moving: boolean): string | null {
    if (!this.active) return null;
    if (moving) this.state.moved += dt;
    if (this.step === 2 && this.state.startCoins === 0) this.state.startCoins = c.hero.coins;
    // A player who starts the night before finishing the day's tips: those tips no longer apply.
    if (c.wave > 0 && this.step < 4) this.step = 4;
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
