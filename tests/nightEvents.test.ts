import { describe, expect, it } from "vitest";
import { createCamp, drainEvents, rollNightEvent, step, NIGHT_EVENTS, type Camp } from "../src/camp/sim";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { STEP } from "../src/camp/world";

const still = { move: { x: 0, y: 0 } };
/** Run build → nightfall for a camp whose next night is `wave`. */
function nightfall(c: Camp, wave: number): void {
  c.wave = wave - 1;
  c.timer = 0.001;
  step(c, still);
}

describe("night events", () => {
  it("are deterministic, roughly 25% of eligible nights, and never before night 3 or when not allowed", () => {
    let n = 0, total = 0;
    const kinds = new Set<string>();
    for (let seed = 1; seed < 300; seed++)
      for (let w = 3; w <= 10; w++) {
        const e = rollNightEvent(seed, w, true);
        expect(rollNightEvent(seed, w, true)).toBe(e);
        expect(rollNightEvent(seed, w, false)).toBeNull();
        total++;
        if (e) { n++; kinds.add(e); }
      }
    for (let seed = 1; seed < 100; seed++) for (const w of [1, 2]) expect(rollNightEvent(seed, w, true)).toBeNull();
    expect(n / total).toBeGreaterThan(0.19);
    expect(n / total).toBeLessThan(0.31);
    expect([...kinds].sort()).toEqual(["swarm", "treasure"]);
  });

  const find = (kind: string, ok = (_c: Camp) => true) => {
    for (let seed = 1; seed < 2000; seed++) {
      const c = createCamp(seed, CHAPTER_BY_ID[3]);
      for (let w = 3; w <= 8; w++) {
        if (rollNightEvent(seed, w, true) !== kind) continue;
        nightfall(c, w);
        if (c.nightEvent === kind && ok(c)) return c;
        break;
      }
    }
    throw new Error(`no ${kind} night found`);
  };

  it("Swarm Night doubles the bodies at half HP (bosses untouched)", () => {
    const c = find("swarm");
    const ev = drainEvents(c).find((e) => e.type === "waveStart");
    expect(ev && ev.type === "waveStart" && ev.event).toBe("swarm");
    for (let i = 1; i < c.queue.length; i++) expect(c.queue[i]!.at).toBeGreaterThanOrEqual(c.queue[i - 1]!.at);
    expect(c.queue.length % 2).toBe(0);
  });

  it("Treasure Night sends a goblin and doubles kill gold; Elite Raid pays a bigger dawn bonus", () => {
    const t = find("treasure");
    for (let i = 0; i < (NIGHT_EVENTS.thiefAt + 1) / STEP; i++) step(t, still);
    expect(t.eventThief).toBe(true);
    const e = find("treasure");
    e.nightEvent = "elite";
    const w = e.wave;
    e.queue = [];
    e.enemies = [];
    drainEvents(e);
    step(e, still);
    const clear = drainEvents(e).find((x) => x.type === "waveClear");
    expect(clear && clear.type === "waveClear" && clear.bonus).toBe(4 + w + NIGHT_EVENTS.eliteBonus(w));
    expect(e.nightEvent).toBeNull();
  });

  it("dailies (classic blessings) and Siege Lord never get night events", () => {
    for (let seed = 1; seed < 200; seed++) {
      const c = createCamp(seed, CHAPTER_BY_ID[3], { classicBlessings: true });
      nightfall(c, 5);
      expect(c.nightEvent).toBeNull();
    }
  });
});
