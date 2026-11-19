import { describe, expect, it } from "vitest";
import { newSave, sanitizeSave } from "../src/core/meta";
import { claimQuest, dailyPicks, questsReady, questViews, refreshQuests, weekNumber, weeklyPick } from "../src/core/quests";

const day = (s: string) => new Date(`${s}T12:00:00`);

describe("quests", () => {
  it("picks 3 distinct daily quests per date, deterministically", () => {
    const a = dailyPicks("2026-11-19");
    expect(new Set(a).size).toBe(3);
    expect(dailyPicks("2026-11-19")).toEqual(a);
    const days = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"].map((d) => dailyPicks(d).join());
    expect(new Set([a.join(), ...days]).size).toBeGreaterThan(2);
  });

  it("weeks start on Monday", () => {
    expect(weekNumber("2026-11-16")).toBe(weekNumber("2026-11-22")); // Mon..Sun
    expect(weekNumber("2026-11-23")).toBe(weekNumber("2026-11-22") + 1);
    expect(typeof weeklyPick(1)).toBe("string");
  });

  it("tracks progress from when the quest was handed out, then pays once", () => {
    const s = newSave();
    s.stats.kills = 500;
    s.stats.wavesHeld = 40;
    expect(refreshQuests(s, day("2026-11-19"))).toBe(true);
    expect(refreshQuests(s, day("2026-11-19"))).toBe(false);
    for (const v of questViews(s)) expect(v.progress).toBe(0);
    // Do far more than any quest asks.
    for (const k of ["kills", "wavesHeld", "bosses", "towersBuilt", "logs", "bows", "flawlessWaves", "goldEarned"]) s.stats[k] = (s.stats[k] ?? 0) + 5000;
    s.wins += 10;
    expect(questsReady(s)).toBe(4);
    const first = questViews(s)[0]!;
    const gold = s.gold;
    const paid = claimQuest(s, first.slot.id);
    expect(paid).toBeGreaterThan(0);
    expect(s.gold).toBe(gold + paid);
    expect(claimQuest(s, first.slot.id)).toBe(0);
    expect(questsReady(s)).toBe(3);
  });

  it("rotates daily quests at midnight but keeps the weekly one", () => {
    const s = newSave();
    refreshQuests(s, day("2026-11-17"));
    const weekly = s.quests.weekly!.id;
    refreshQuests(s, day("2026-11-18"));
    expect(s.quests.day).toBe("2026-11-18");
    expect(s.quests.weekly!.id).toBe(weekly);
  });

  it("survives old and corrupted saves", () => {
    const old = sanitizeSave({ gold: 10, stars: {} });
    expect(old.quests.daily).toEqual([]);
    refreshQuests(old, day("2026-11-19"));
    expect(old.quests.daily.length).toBe(3);
    const bad = sanitizeSave({ quests: { day: 5, daily: [{ id: "nope" }, { id: "d-kills", start: -3, claimed: "yes" }], weekly: "x" } });
    expect(bad.quests.daily).toEqual([{ id: "d-kills", start: 0, claimed: false }]);
    expect(bad.quests.weekly).toBeNull();
    // A round trip keeps the state.
    expect(sanitizeSave(JSON.parse(JSON.stringify(old))).quests).toEqual(old.quests);
  });
});
