import { describe, expect, it } from "vitest";
import { claimGift, GIFT_GOLD, giftView } from "../src/core/gift";

describe("royal gift", () => {
  it("opens once a day and walks the 7-day ladder", () => {
    const s: Record<string, number> = {};
    expect(giftView(s, "2026-11-20")).toMatchObject({ ready: true, day: 1, gold: GIFT_GOLD[0] });
    expect(claimGift(s, "2026-11-20")).toBe(GIFT_GOLD[0]);
    expect(claimGift(s, "2026-11-20")).toBe(0);
    expect(giftView(s, "2026-11-20")).toMatchObject({ ready: false, day: 1 });
    const days = ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
    const got = days.map((d) => claimGift(s, d));
    expect(got).toEqual([...GIFT_GOLD.slice(1), GIFT_GOLD[0]]);
    expect(s.giftStreak).toBe(8);
    expect(s.giftBest).toBe(8);
    expect(s.gifts).toBe(8);
  });
  it("a missed day restarts the ladder (across month ends too)", () => {
    const s: Record<string, number> = {};
    claimGift(s, "2026-11-29");
    claimGift(s, "2026-11-30");
    expect(giftView(s, "2026-12-01")).toMatchObject({ day: 3, streak: 3 });
    expect(giftView(s, "2026-12-02")).toMatchObject({ ready: true, day: 1, streak: 1 });
    claimGift(s, "2026-12-02");
    expect(s.giftStreak).toBe(1);
    expect(s.giftBest).toBe(2);
  });
});
