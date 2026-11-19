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

describe("endless milestones", async () => {
  const { applyRun, newSave: fresh, nextEndlessMilestone } = await import("../src/core/meta");
  it("pays each 5-night mark once", () => {
    const s = fresh();
    s.stars[1] = 1;
    const r1 = applyRun(s, { chapter: 99, won: false, wave: 12, gateFrac: 0, goldFromKills: 0 }); // held 11
    expect(r1.milestones).toEqual([5, 10]);
    expect(r1.milestoneBonus).toBe(150 + 300);
    expect(nextEndlessMilestone(s)).toBe(15);
    const r2 = applyRun(s, { chapter: 99, won: false, wave: 14, gateFrac: 0, goldFromKills: 0 });
    expect(r2.milestoneBonus).toBe(0);
    const r3 = applyRun(s, { chapter: 99, won: false, wave: 16, gateFrac: 0, goldFromKills: 0 });
    expect(r3.milestones).toEqual([15]);
    // Campaign runs never pay milestones.
    expect(applyRun(s, { chapter: 2, won: true, wave: 10, gateFrac: 1, goldFromKills: 0 }).milestoneBonus).toBe(0);
  });
});

describe("run history", async () => {
  const { pushHistory, sanitizeHistory, HISTORY_MAX } = await import("../src/core/history");
  it("keeps the newest runs, capped, and sanitizes", () => {
    const list: import("../src/core/history").RunRecord[] = [];
    for (let i = 0; i < 25; i++) pushHistory(list, { date: "2026-11-19", chapter: 1, hero: "ranger", won: i % 2 === 0, nights: i, kills: 10, gold: 5, minutes: 3 });
    expect(list.length).toBe(HISTORY_MAX);
    expect(list[0]!.nights).toBe(24);
    const clean = sanitizeHistory([...list, { hero: "nobody", chapter: 1 }, null, { hero: "pyro", chapter: 2, kills: -5, gold: "x" }]);
    expect(clean.length).toBe(HISTORY_MAX);
    expect(sanitizeHistory([{ hero: "pyro", chapter: 2, kills: -5, gold: "x", daily: true }])[0]).toMatchObject({ kills: 0, gold: 0, daily: true, won: false });
    expect(sanitizeHistory("junk")).toEqual([]);
  });
});

describe("difficulty modes", async () => {
  const { applyRun, newSave: fresh, sanitizeSave: clean } = await import("../src/core/meta");
  const { difficultyOpen, chapterOnDifficulty } = await import("../src/core/difficulty");
  const { CHAPTER_BY_ID } = await import("../src/core/chapters");
  it("unlocks Hard after Normal and Nightmare after Hard", () => {
    expect(difficultyOpen("hard", false, 0)).toBe(false);
    expect(difficultyOpen("hard", true, 0)).toBe(true);
    expect(difficultyOpen("nightmare", true, 0)).toBe(false);
    expect(difficultyOpen("nightmare", true, 1)).toBe(true);
  });
  it("pays more, records the clear, and leaves stars alone", () => {
    const a = fresh(), b = fresh();
    a.stars[2] = 3; b.stars[2] = 3;
    const run = { chapter: 2, won: true, wave: 10, gateFrac: 1, goldFromKills: 100 };
    const normal = applyRun(a, run);
    const hard = applyRun(b, { ...run, difficulty: "hard" });
    expect(hard.gold).toBeGreaterThan(normal.gold * 1.4);
    expect(hard.hardClear).toBe(1);
    expect(b.diffCleared[2]).toBe(1);
    expect(b.stars[2]).toBe(3);
    expect(applyRun(b, { ...run, difficulty: "hard" }).hardClear).toBe(0); // only the first time
    // Endless ignores difficulty.
    expect(applyRun(b, { chapter: 99, won: false, wave: 5, gateFrac: 0, goldFromKills: 0, difficulty: "nightmare" }).hardClear).toBeUndefined();
  });
  it("scales the chapter and sanitizes the save", () => {
    const ch = CHAPTER_BY_ID[1]!;
    expect(chapterOnDifficulty(ch, "nightmare").speedMult).toBeCloseTo(ch.speedMult * 1.2);
    expect(chapterOnDifficulty(ch, "normal")).toBe(ch);
    const s = clean({ difficulty: "insane", diffCleared: { 1: 9, 77: 1 } });
    expect(s.difficulty).toBe("normal");
    expect(s.diffCleared).toEqual({ 1: 2 });
  });
});

describe("endless weekly twists", async () => {
  const { endlessTwistFor, applyEndlessTwist, ENDLESS_TWISTS } = await import("../src/core/endlessMods");
  const { baseMods } = await import("../src/camp/blessings");
  it("is the same all week and changes week to week", () => {
    const mon = endlessTwistFor("2026-11-16"), sun = endlessTwistFor("2026-11-22"), next = endlessTwistFor("2026-11-23");
    expect(sun.id).toBe(mon.id);
    expect(next.id).not.toBe(mon.id);
    const seen = new Set<string>();
    for (let d = 0; d < 7 * 7; d += 7) seen.add(endlessTwistFor(new Date(Date.UTC(2026, 10, 23 + d)).toISOString().slice(0, 10)).id);
    expect(seen.size).toBe(ENDLESS_TWISTS.length); // every twist comes round in 7 weeks
    expect(endlessTwistFor("2026-11-19").id).toBe("elite"); // the week in progress keeps its twist
  });
  it("applies its rules to the run", () => {
    const glass = ENDLESS_TWISTS.find((t) => t.id === "glass")!;
    const setup = { mods: baseMods() };
    applyEndlessTwist(glass, setup, {});
    expect(setup.mods.wallHp).toBeCloseTo(0.7);
    expect(setup.mods.towerDamage).toBeCloseTo(1.25);
    const storm = ENDLESS_TWISTS.find((t) => t.id === "storm")!;
    expect(applyEndlessTwist(storm, { mods: baseMods() }, {} as { weatherOdds?: { rain: number; fog: number; storm: number } }).weatherOdds?.storm).toBeGreaterThan(0.5);
  });
});

describe("daily variety", async () => {
  const { dailyFor } = await import("../src/core/daily");
  it("keeps past days stable and brings the new twists in from the 20th", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 60; d++) seen.add(dailyFor(new Date(Date.UTC(2026, 10, 20 + d)).toISOString().slice(0, 10)).twist.id);
    expect(seen.has("elite-rush") || seen.has("fog-war") || seen.has("storm-day") || seen.has("iron-walls")).toBe(true);
    const before = new Set<string>();
    for (let d = 1; d <= 60; d++) before.add(dailyFor(new Date(Date.UTC(2026, 8, d)).toISOString().slice(0, 10)).twist.id);
    expect([...before].every((id) => ["gold-rush", "lone-hero", "engineers", "horde", "glass"].includes(id))).toBe(true);
  });
});

describe("week summary", async () => {
  const { weekSummary } = await import("../src/core/history");
  const { weekNumber } = await import("../src/core/quests");
  it("counts only this week's runs", () => {
    const r = (date: string, won: boolean, nights: number, chapter = 2) => ({ date, chapter, hero: "ranger" as const, won, nights, kills: 1, gold: 1, minutes: 1 });
    const s = weekSummary([r("2026-11-19", true, 10), r("2026-11-17", false, 4, 99), r("2026-11-15", true, 10)], "2026-11-19", weekNumber);
    expect(s).toEqual({ runs: 2, wins: 1, nights: 14, bestEndless: 4 });
  });
});

describe("endless top sieges", async () => {
  const { pushEndlessTop, sanitizeEndlessTop } = await import("../src/core/history");
  it("keeps the five best, ranked", () => {
    const list: import("../src/core/history").EndlessBest[] = [];
    for (const n of [5, 12, 3, 20, 8, 9, 1]) pushEndlessTop(list, { nights: n, hero: "ranger", date: "2026-11-19" });
    expect(list.map((r) => r.nights)).toEqual([20, 12, 9, 8, 5]);
    expect(pushEndlessTop(list, { nights: 15, hero: "knight", date: "" })).toBe(2);
    expect(pushEndlessTop(list, { nights: 2, hero: "knight", date: "" })).toBe(0);
    expect(sanitizeEndlessTop([{ nights: "x" }, { nights: 4, hero: "pyro" }, { nights: 9, hero: "bad" }])).toEqual([{ nights: 4, hero: "pyro", date: "" }]);
  });
});

describe("best night per difficulty", async () => {
  const { applyRun, newSave: fresh, sanitizeSave: clean } = await import("../src/core/meta");
  it("records the furthest night on Hard / Nightmare", () => {
    const s = fresh();
    s.stars[2] = 3;
    applyRun(s, { chapter: 2, won: false, wave: 6, gateFrac: 0, goldFromKills: 0, difficulty: "hard" });
    applyRun(s, { chapter: 2, won: false, wave: 4, gateFrac: 0, goldFromKills: 0, difficulty: "hard" });
    expect(s.diffBest["2:1"]).toBe(6);
    expect(clean(JSON.parse(JSON.stringify(s))).diffBest).toEqual({ "2:1": 6 });
    expect(clean({ diffBest: { "2:3": 5, "x": 1, "77:1": 2 } }).diffBest).toEqual({});
  });
});

describe("quest pool expansion", () => {
  it("keeps past days' picks and adds new-content quests from the 20th", async () => {
    const { dailyPicks } = await import("../src/core/quests");
    const fresh = ["d-elites", "d-fires", "d-hard"];
    for (let d = 1; d <= 19; d++) expect(dailyPicks(`2026-11-${String(d).padStart(2, "0")}`).some((id) => fresh.includes(id))).toBe(false);
    const later = new Set<string>();
    for (let d = 20; d <= 30; d++) for (const id of dailyPicks(`2026-11-${d}`)) later.add(id);
    expect(fresh.some((id) => later.has(id))).toBe(true);
  });
});
