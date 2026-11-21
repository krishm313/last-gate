import { describe, expect, it } from "vitest";
import { nextGoals } from "../src/core/goals";
import { newSave } from "../src/core/meta";
import { ACHIEVEMENTS } from "../src/core/achievements";

describe("next goals", () => {
  it("a fresh save is pointed at chapter 1 first", () => {
    const g = nextGoals(newSave());
    expect(g[0]!.key).toBe("clear-1");
    expect(g[0]!.action).toEqual({ kind: "chapter", id: 1 });
    expect(g.length).toBeLessThanOrEqual(3);
  });

  it("a finished campaign still gets goals: missing stars and unearned trophies", () => {
    const s = newSave();
    for (let i = 1; i <= 10; i++) s.stars[i] = 3;
    s.stars[7] = 2;
    const g = nextGoals(s);
    expect(g[0]!.key).toBe("stars-7");
    expect(g.length).toBe(3);
    expect(g.filter((x) => x.key.startsWith("ach-")).length).toBeLessThanOrEqual(2);
  });

  it("never lists claimed or already-complete trophies, and every goal's progress is 0..1", () => {
    const s = newSave();
    for (let i = 1; i <= 10; i++) s.stars[i] = 3;
    s.claimed = ACHIEVEMENTS.slice(0, 20).map((a) => a.id);
    s.stats.kills = 1e9;
    for (const g of nextGoals(s, 50)) {
      expect(g.progress).toBeGreaterThanOrEqual(0);
      expect(g.progress).toBeLessThan(1.0001);
      if (g.key.startsWith("ach-")) {
        const id = g.key.slice(4);
        expect(s.claimed).not.toContain(id);
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        expect(a.progress(s)).toBeLessThan(a.goal);
      }
    }
  });
});
