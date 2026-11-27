import { describe, expect, it } from "vitest";
import { endlessTwistFor } from "../src/core/endlessMods";
import { dailyFor } from "../src/core/daily";
import { newSave } from "../src/core/meta";
import { weekNumber, weeklyPick, dailyPicks } from "../src/core/quests";

// Phase 10 A0: every dated rotation keeps working through the coming months, and side-game quests
// never come up while side games are switched off.
describe("dated rotations (A0)", () => {
  const s = newSave();
  for (let i = 1; i <= 10; i++) s.stars[i] = 3;
  it("daily, Endless twist and weekly quest resolve for every day of the next 120 days", () => {
    for (let i = 0; i < 120; i++) {
      const d = new Date(Date.UTC(2026, 10, 20 + i)).toISOString().slice(0, 10);
      const dl = dailyFor(d);
      expect(dl.hero).toBeTruthy();
      expect(endlessTwistFor(d).id).toBeTruthy();
      const w = weeklyPick(weekNumber(d), s);
      expect(w).not.toBe("w-minis");
      for (const q of dailyPicks(d, s)) expect(q).not.toBe("d-mini");
    }
  });
  it("the Cleric enters the daily hero pool from Nov 24", () => {
    const heroes = new Set(Array.from({ length: 60 }, (_, i) => dailyFor(new Date(Date.UTC(2026, 10, 24 + i)).toISOString().slice(0, 10)).hero));
    expect(heroes.has("cleric")).toBe(true);
  });
});
