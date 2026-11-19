// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { newSave } from "../src/core/meta";
import { fmtGold, Hub, type HubCallbacks, upgradeText } from "../src/ui/hub";

const noop = () => {};
const callbacks = (over: Partial<HubCallbacks> = {}): HubCallbacks => ({
  onClick: noop,
  onDaily: noop,
  onPlay: noop,
  onSelectHero: noop,
  onBuy: noop,
  onReset: noop,
  onClaim: noop,
  onClaimQuest: noop,
  onSettings: noop,
  ...over,
});

function trophyRow(root: HTMLElement, name: string): HTMLElement {
  const row = [...root.querySelectorAll<HTMLElement>(".trophy")].find((r) => r.querySelector(".trophy-name")?.textContent === name);
  if (!row) throw new Error(`no trophy row ${name}`);
  return row;
}

describe("hub trophies tab", () => {
  it("shows exactly one right-hand element per state (regression: duplicate reward text)", () => {
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    const save = newSave();
    save.stats.wavesHeld = 1; // First Stand: ready to claim
    save.stats.kills = 2000; // Horde Breaker: ready
    save.claimed = ["horde"]; // …but already claimed
    hub.showHub(save, "trophies");

    const ready = trophyRow(root, "First Stand").querySelector(".trophy-right")!;
    expect(ready.querySelectorAll(".btn-claim").length).toBe(1);
    expect(ready.querySelectorAll(".trophy-reward").length).toBe(0);

    const claimed = trophyRow(root, "Horde Breaker").querySelector(".trophy-right")!;
    expect(claimed.querySelectorAll(".trophy-done").length).toBe(1);
    expect(claimed.querySelectorAll(".trophy-reward").length).toBe(0);

    const pending = trophyRow(root, "Veteran").querySelector(".trophy-right")!;
    expect(pending.children.length).toBe(1);
    expect(pending.querySelector(".trophy-reward")?.textContent).toContain("250");
  });

  it("summary bar counts claimed trophies", () => {
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    const save = newSave();
    save.claimed = ["first-wave", "horde"];
    hub.showHub(save, "trophies");
    expect(root.querySelector(".trophy-summary .trophy-num")?.textContent).toMatch(/^2 \/ \d+ earned$/);
  });
});

describe("hub armory tab", () => {
  it("marks affordable perms buyable and shakes instead of buying when poor", () => {
    const root = document.createElement("div");
    const bought: string[] = [];
    const hub = new Hub(root, callbacks({ onBuy: (id) => bought.push(id) }));
    const save = newSave();
    save.gold = 45; // Stone Walls costs 40; Fletching 50
    hub.showHub(save, "armory");
    const cards = [...root.querySelectorAll<HTMLElement>(".perm")];
    const walls = cards.find((c) => c.querySelector(".perm-name")?.textContent === "Stone Walls")!;
    const fletch = cards.find((c) => c.querySelector(".perm-name")?.textContent === "Fletching")!;
    expect(walls.classList.contains("buyable")).toBe(true);
    expect(fletch.classList.contains("poor")).toBe(true);
    fletch.click();
    expect(bought).toEqual([]);
    expect(fletch.classList.contains("nope")).toBe(true);
    walls.click();
    expect(bought).toEqual(["walls"]);
  });
});

describe("hub end screen", () => {
  const reward = { gold: 120, waveBonus: 40, winBonus: 80, stars: 3, newStars: 3, firstClear: true, unlockedHeroes: [] };
  const summary = { won: true, chapterName: "The Border Keep", chapterId: 1, wave: 10, kills: 50, coins: 0, minutes: 5, flawless: 2, upgradesReady: 3 };

  it("leads with the next chapter, badges ready upgrades, lists flawless waves", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    let went = false;
    hub.showEnd(summary, reward, noop, noop, { name: "Goblin Marsh", go: () => (went = true) });
    vi.advanceTimersByTime(2500);
    const btns = [...root.querySelectorAll<HTMLElement>(".btn-col .btn")];
    expect(btns[0]!.textContent).toBe("Next: Goblin Marsh ▶");
    expect(btns.find((b) => b.classList.contains("has-badge"))?.querySelector(".btn-badge")?.textContent).toBe("3 ready");
    expect(root.textContent).toContain("Flawless nights");
    btns[0]!.click();
    expect(went).toBe(true);
    vi.useRealTimers();
  });

  it("tells you what the next star needs", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    hub.showEnd({ ...summary, hallPct: 63 }, { ...reward, stars: 2 }, noop, noop);
    vi.advanceTimersByTime(2500);
    expect(root.querySelector(".end-nextstar")?.textContent).toBe("★★★ needs the hall at 80%+ — yours ended at 63%");
    hub.showEnd({ ...summary, hallPct: 95 }, reward, noop, noop);
    vi.advanceTimersByTime(2500);
    expect(root.querySelector(".end-nextstar")).toBeNull();
    vi.useRealTimers();
  });

  it("daily win shows the streak it extended", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    hub.showEnd({ ...summary, daily: true, dailyStreak: 3 }, { ...reward, firstClear: false }, noop, noop);
    vi.advanceTimersByTime(2500);
    expect(root.querySelector(".end-record")?.textContent).toBe("🔥 3-day streak!");
    vi.useRealTimers();
  });

  it("endless defeat offers a new siege", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    hub.showEnd({ ...summary, won: false, endless: true, chapterName: "Endless Siege", chapterId: 99 }, { ...reward, winBonus: 0, firstClear: false }, noop, noop);
    vi.advanceTimersByTime(2500);
    expect(root.querySelector(".btn-col .btn")?.textContent).toBe("New siege ▶");
    expect(root.querySelector(".confetti")).toBeNull();
    vi.useRealTimers();
  });

  it("confetti for a victory and for a new endless record, not for a loss", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    hub.showEnd(summary, reward, noop, noop);
    vi.advanceTimersByTime(2500);
    expect(root.querySelector(".confetti")).not.toBeNull();
    hub.showEnd({ ...summary, won: false, endless: true, record: true, chapterName: "Endless Siege", chapterId: 99 }, { ...reward, winBonus: 0, firstClear: false }, noop, noop);
    vi.advanceTimersByTime(2500);
    expect(root.querySelector(".confetti")).not.toBeNull();
    hub.showEnd({ ...summary, won: false }, { ...reward, winBonus: 0, firstClear: false }, noop, noop);
    vi.advanceTimersByTime(2500);
    expect(root.querySelector(".confetti")).toBeNull();
    vi.useRealTimers();
  });
});

describe("hub pause", () => {
  it("abandon needs a second tap", () => {
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    let quit = 0;
    hub.showPause(noop, () => quit++);
    const btn = [...root.querySelectorAll<HTMLElement>(".btn")].find((b) => b.textContent === "Abandon run")!;
    btn.click();
    expect(quit).toBe(0);
    expect(btn.textContent).toBe("Tap again to abandon");
    btn.click();
    expect(quit).toBe(1);
  });

  it("setting toggles expose their on/off state to assistive tech", () => {
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    const values: Record<string, boolean> = { music: true, sfx: false, shake: true, haptics: true };
    hub.showPause(noop, noop, { values, onToggle: (k) => (values[k] = !values[k]) });
    const sfx = [...root.querySelectorAll<HTMLElement>(".setting")].find((r) => r.textContent?.includes("Sound effects"))!;
    expect(sfx.getAttribute("aria-pressed")).toBe("false");
    sfx.click();
    expect(sfx.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("hub battle tab", () => {
  it("marks the frontier chapter NEXT, reveals new unlocks once, and shows best-wave progress", () => {
    localStorage.setItem("lastgate.seenChapters", "[1]");
    const root = document.createElement("div");
    const hub = new Hub(root, callbacks());
    const save = newSave();
    save.stars = { 1: 3 };
    save.best = { 2: 6 };
    hub.showHub(save, "battle");
    // The campaign map: chapter 2 is the frontier stop, newly revealed; chapter 3 is hidden in fog.
    const stops = [...root.querySelectorAll<HTMLElement>(".lgm-stop")];
    const ch2 = stops.find((c) => c.querySelector(".lgm-name")?.textContent === "Goblin Marsh")!;
    expect(ch2.classList.contains("fresh")).toBe(true);
    expect(ch2.querySelector(".lgm-flag")?.textContent).toBe("NEW!");
    expect(stops[2]!.classList.contains("locked")).toBe(true);
    expect(stops[2]!.querySelector(".lgm-name")?.textContent).toBe("???");
    expect(root.querySelector(".cal-day")?.textContent).toBe(String(new Date().getDate()));
    // Tapping the stop opens its card, with best-wave progress.
    ch2.click();
    expect((root.querySelector(".lgm-sheet .ch-prog i") as HTMLElement).style.width).toBe("60%");
    // Second visit: no reveal, NEXT flag instead.
    hub.showHub(save, "battle");
    const again = [...root.querySelectorAll<HTMLElement>(".lgm-stop")].find((c) => c.querySelector(".lgm-name")?.textContent === "Goblin Marsh")!;
    expect(again.classList.contains("fresh")).toBe(false);
    expect(again.querySelector(".lgm-flag")?.textContent).toBe("NEXT");
  });
});

describe("upgradeText", () => {
  it("shows the one number the next level changes, in place", () => {
    expect(upgradeText("Wall HP +30%", "Wall HP +40%")).toBe("Wall HP +30→40%");
    expect(upgradeText("+1 reroll per run", "+2 rerolls per run")).toBe("Next: +2 rerolls per run");
    expect(upgradeText("Start with a tower built", "Start with 2 towers built")).toBe("Next: Start with 2 towers built");
  });
});

describe("locked cards", () => {
  it("shake instead of starting a run or picking a hero", () => {
    const root = document.createElement("div");
    const onPlay = vi.fn();
    const onSelectHero = vi.fn();
    const onDenied = vi.fn();
    const hub = new Hub(root, callbacks({ onPlay, onSelectHero, onDenied }));
    const save = newSave();
    hub.showHub(save, "battle");
    const locked = root.querySelector<HTMLElement>(".chapter.locked")!;
    locked.click();
    expect(locked.classList.contains("nope")).toBe(true);
    expect(onPlay).not.toHaveBeenCalled();
    hub.showHub(save, "heroes");
    const lockedHero = root.querySelector<HTMLElement>(".hero.locked")!;
    lockedHero.click();
    expect(lockedHero.classList.contains("nope")).toBe(true);
    expect(onSelectHero).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledTimes(2);
  });
});

describe("fmtGold", () => {
  it("stays short in the header", () => {
    expect(fmtGold(340)).toBe("340");
    expect(fmtGold(12345)).toBe("12,345");
    expect(fmtGold(124_999)).toBe("124k");
    expect(fmtGold(9_999_999)).toBe("9.9M");
  });
});
