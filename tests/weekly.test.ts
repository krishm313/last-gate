import { describe, expect, it } from "vitest";
import { recordWeekly, WEEKLY, weeklyFor, weeklyReward } from "../src/core/weekly";
import { HEAT_BY_ID } from "../src/core/heat";
import { newSave, sanitizeSave } from "../src/core/meta";

describe("Weekly Gauntlet", () => {
  it("is the same all week, changes week to week, and uses a cleared chapter with 3 distinct heats", () => {
    const cleared = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = weeklyFor("2026-11-23", cleared), b = weeklyFor("2026-11-26", cleared), next = weeklyFor("2026-11-30", cleared);
    expect(b).toEqual(a);
    expect(next.seed).not.toBe(a.seed);
    expect(cleared).toContain(a.chapterId);
    expect(a.chapterId).toBeGreaterThanOrEqual(3);
    expect(new Set(a.heats).size).toBe(3);
    for (const h of a.heats) expect(HEAT_BY_ID[h]).toBeTruthy();
    expect([1, 2]).toContain(weeklyFor("2026-11-23", [1, 2]).chapterId);
  });
  it("pays the prize only for the week's first win", () => {
    expect(weeklyReward(100, 10, true, true, 3)).toEqual({ gold: 100 + 10 * WEEKLY.night + WEEKLY.win + 3 * WEEKLY.perHeat, prize: WEEKLY.win + 3 * WEEKLY.perHeat });
    expect(weeklyReward(100, 10, true, false, 3).prize).toBe(0);
    expect(weeklyReward(50, 4, false, true, 3).prize).toBe(0);
  });
  it("keeps the best per week and starts fresh next week; survives save round-trip", () => {
    let r = recordWeekly(undefined, 100, 6, false, 0);
    r = recordWeekly(r, 100, 10, true, 2);
    r = recordWeekly(r, 100, 4, false, 0);
    expect(r).toEqual({ week: 100, best: 10, stars: 2, won: true });
    expect(recordWeekly(r, 101, 3, false, 0)).toEqual({ week: 101, best: 3, stars: 0, won: false });
    const s = newSave();
    s.weekly = r;
    expect(sanitizeSave(JSON.parse(JSON.stringify(s))).weekly).toEqual(r);
  });
});
