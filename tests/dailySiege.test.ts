import { describe, expect, it } from "vitest";
import { claimDailySiege, DAILY_SIEGE_PRIZE, dailySiegeFor, dailySiegeOpen } from "../src/core/dailySiege";

describe("daily siege", () => {
  it("is the same all day, changes by day, and only uses cleared grounds", () => {
    const a = dailySiegeFor("2026-11-20", [1, 2, 3]);
    expect(dailySiegeFor("2026-11-20", [1, 2, 3])).toEqual(a);
    const days = Array.from({ length: 30 }, (_, i) => dailySiegeFor(`2026-12-${String(i + 1).padStart(2, "0")}`, [1, 2, 3]));
    expect(new Set(days.map((d) => `${d.chapter}${d.hero}`)).size).toBeGreaterThan(5);
    for (const d of days) {
      expect([1, 2, 3]).toContain(d.chapter);
      expect(d.perm).toBeGreaterThanOrEqual(0);
      expect(d.perm).toBeLessThanOrEqual(10);
    }
    expect(dailySiegeFor("2026-11-20", []).chapter).toBe(1);
  });
  it("pays its prize once a day", () => {
    const s: Record<string, number> = {};
    expect(dailySiegeOpen(s, "2026-11-20")).toBe(true);
    expect(claimDailySiege(s, "2026-11-20")).toBe(DAILY_SIEGE_PRIZE);
    expect(claimDailySiege(s, "2026-11-20")).toBe(0);
    expect(dailySiegeOpen(s, "2026-11-21")).toBe(true);
    expect(s.dsiegeWins).toBe(1);
  });
});
