import { ENEMIES, enemyTraits } from "../core/enemies";
import { getItem, setItem } from "../ui/store";
import { Music } from "../audio/music";
import { musicIntensity } from "../audio/intensity";
import { Sfx } from "../audio/sfx";
import { CARD_NAME, SiegeBar } from "../ui/siegeBar";
import { ArcheryView, rangeReward } from "../mini/archeryView";
import { SupplyView } from "../mini/supplyView";
import { supplyReward } from "../mini/supply";
import { WallWatchView } from "../mini/wallwatchView";
import { watchReward } from "../mini/wallwatch";
import { CatapultView } from "../mini/catapultView";
import { catReward } from "../mini/catapult";
import { DragonView } from "../mini/dragonView";
import { dragonReward } from "../mini/dragon";
import { LanternsView } from "../mini/lanternsView";
import { lanternReward } from "../mini/lanterns";
import { ForgeView } from "../mini/forgeView";
import { forgeReward } from "../mini/forge";
import { BellsView } from "../mini/bellsView";
import { bellsReward } from "../mini/bells";
import { MasonView } from "../mini/masonView";
import { masonReward } from "../mini/mason";
import { fairPick, openMinis } from "../mini/fair";
import { todayString as fairDate } from "../core/daily";
import { claimGift } from "../core/gift";
import { claimDailySiege, dailySiegeFor } from "../core/dailySiege";
import type { HeroId } from "../core/heroes";
import { deploy, REVERSE, SIEGES, siegeStars, WAR_CARDS, type CampSetup } from "./sim";
import { PRE_MASTERY, chooseBlessing, chooseBuilding, chooseTowerSpec, WEATHER_INFO, NIGHT_EVENT_INFO, createCamp, drainEvents, plotCost, plotLogCost, rerollBlessings, spawnEnemy, spawnThief, step, type Camp, type CampEvent, type Vec } from "./sim";
import { CampRenderer } from "./render";
import { BLESSING_BY_ID } from "./blessings";
import { buildStrip, CampHud } from "./hud";
import { INCOME_PILE, STEP, VIEW_H, VIEW_W } from "./world";
import { RenderInterp } from "./interp";
import { atlasDebug, crispCache, crispStats, preloadAnims, preloadAnimsFor } from "./sprites";
import type { GameEvent } from "../core/events";
import type { ChapterDef } from "../core/waves";
import { CHAPTER_BY_ID } from "../core/chapters";
import { applyRun, ascend, buyPerm, canBuy, chapterUnlocked, ENDLESS_MILESTONE_STEP, endlessMilestoneReward, grantHeroXp, heroUnlocked, MAX_GOLD, newSave, nextEndlessMilestone, PERMS, starsFor } from "../core/meta";
import { buyFlair } from "../core/flair";
import { heroWins } from "../core/mastery";
import { cleanHeat, HEAT_BY_ID, heatAllowed, heatGold } from "../core/heat";
import { recordWeekly, WEEKLY, weeklyFor, weeklyReward, type Gauntlet } from "../core/weekly";
import { Hub } from "../ui/hub";
import { exportSave, importSave, loadSave, resetSave, SAVE_KEY, writeSave } from "../ui/save";
import { campSetupFromSave, LOOT_TO_GOLD } from "./meta";
import { campBotInput, campBotPick, campBotStep } from "./bot";
import { HERO_BY_ID } from "../core/heroes";
import { learnSkill, resetSkills } from "../core/skills";
import { pushEndlessTop, pushHistory, type RunRecord } from "../core/history";
import { applyEndlessTwist, endlessSceneryFor, endlessTwistFor } from "../core/endlessMods";
import { chapterOnDifficulty, DIFF_BY_ID, difficultyOpen, type DifficultyId } from "../core/difficulty";
import { claimQuest, questsReady, questViews, refreshQuests } from "../core/quests";
import { claim, claimable, foeMet } from "../core/achievements";
import { DAILY_BONUS, dailyFor, dailyStreakBonus, recordDailyWin, todayString, type DailyChallenge, type Twist } from "../core/daily";
import { applyDisplaySettings, buzz, loadSettings, saveSettings } from "../ui/settings";
import { padMove, pollPad } from "./input";
import { Tutorial } from "./tutorial";

const tutorial = new Tutorial();

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLDivElement;
const renderer = new CampRenderer(canvas);
const QKEY = "lastgate.quality";
renderer.onTier = (t) => { try { localStorage.setItem(QKEY, String(t)); } catch { /* storage blocked */ } };
/** Graphics quality from Settings. Auto: phones start one step down (2× density on a 3× screen is all
 *  fill, no visible gain over 1.5× in motion) and every device starts at the lowest tier it has needed
 *  before. Smooth / Pretty pin a tier. */
function applyQuality(fresh = false): void {
  if (settings.quality === "auto") {
    if (fresh) try { localStorage.removeItem(QKEY); } catch { /* storage blocked */ }
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    let saved = 0;
    try { saved = Number(localStorage.getItem(QKEY)) || 0; } catch { /* storage blocked */ }
    renderer.auto = true;
    renderer.setTier(Math.max(saved, coarse ? 1 : 0));
  } else {
    renderer.auto = false;
    renderer.setTier(settings.quality === "smooth" ? 2 : 0);
  }
}
const sfx = new Sfx();
const music = new Music(() => sfx.context, () => sfx.musicOutput);
const settings = loadSettings();
applyQuality();
sfx.setChannels(settings.music, settings.sfx, settings.musicVol, settings.sfxVol);
/** Screen shake / flashes / slow-mo follow the shake and reduced-motion settings. */
function applyMotion(): void {
  renderer.fx.shakeScale = settings.shake && !settings.calm ? 1 : 0;
  renderer.fx.calm = settings.calm;
}
applyMotion();
applyDisplaySettings(settings);
sfx.muted = getItem("lastgate.muted") === "1";

let camp: Camp | null = null;
/** The finished siege, kept on screen (frozen, its effects settling) behind the result panel. */
let siegeBackdrop: Camp | null = null;
/** One-time hints already checked this session (each shows once ever: lastgate.<key>). */
const tipsChecked = new Set<string>();
function oneTip(key: string, when: boolean, text: string): void {
  if (!when || tipsChecked.has(key)) return;
  tipsChecked.add(key);
  if (getItem(`lastgate.${key}`) === "1") return;
  setItem(`lastgate.${key}`, "1");
  hud.toast(text);
}
let save = loadSave();
let chapterId = save.lastChapter;
let paused = false;
let callWave = false;
/** Kills and loot at the start of the current wave, for the wave recap on the blessing screen. */
let waveStartTally = { kills: 0, gold: 0, hits: 0 };
/** Waves held without a wall/hall hit this run (end-screen stat). */
let flawlessWaves = 0;
/** A tower specialisation choice is on screen: the game waits for it. */
let specChoosing = false;
let lastCourierSfx = 0;
/** Set by finishRun: this run's best kill streak is a new lifetime record. */
let streakIsBest = false;
let abilityQueued = false;
/** Buildings unlocked by the wave just held (announced when the build phase starts). */
let unlockedLabels: string[] = [];
/** Fast-forward multiplier (1×, 2×, 3×); resets each run. */
let gameSpeed = 1;
function cycleSpeed(): number {
  gameSpeed = gameSpeed >= 3 ? 1 : gameSpeed + 1;
  setItem("lastgate.speed", String(gameSpeed));
  return gameSpeed;
}
let accumulator = 0;
/** Blends movers between the last two sim ticks when drawing (smooth motion at any refresh rate). */
const interp = new RenderInterp();
let last = performance.now();

const hud = new CampHud(uiRoot, {
  onToggleMute: () => {
    sfx.setMuted(!sfx.muted);
    setItem("lastgate.muted", sfx.muted ? "1" : "0");
    return sfx.muted;
  },
  onCallWave: () => (callWave = true),
  onPause: () => setPaused(true),
  onAbility: () => (abilityQueued = true),
  onSpeed: () => cycleSpeed(),
});
const hub = new Hub(uiRoot, {
  onClick: () => sfx.click(),
  onDenied: () => sfx.denied(),
  onDaily: () => startDaily(),
  onSiege: (i) => startSiege(i),
  onArchery: () => {
    hub.hide();
    sfx.unlock();
    archery.open((Date.now() >>> 0) ^ 0xa11);
  },
  onSupply: () => {
    hub.hide();
    sfx.unlock();
    supply.open((Date.now() >>> 0) ^ 0x5a9);
  },
  onWatch: () => {
    hub.hide();
    sfx.unlock();
    wallWatch.open((Date.now() >>> 0) ^ 0x3a7);
  },
  onCatapult: () => {
    hub.hide();
    sfx.unlock();
    catapult.open((Date.now() >>> 0) ^ 0xca7);
  },
  onDragon: () => {
    hub.hide();
    sfx.unlock();
    dragonDodge.open((Date.now() >>> 0) ^ 0xd1a);
  },
  onLanterns: () => {
    hub.hide();
    sfx.unlock();
    lanterns.open((Date.now() >>> 0) ^ 0x1a7);
  },
  onForge: () => {
    hub.hide();
    sfx.unlock();
    forge.open((Date.now() >>> 0) ^ 0xf09);
  },
  onBells: () => {
    hub.hide();
    sfx.unlock();
    bells.open((Date.now() >>> 0) ^ 0xbe11);
  },
  onMason: () => {
    hub.hide();
    sfx.unlock();
    mason.open();
  },
  onPlay: (id) => newRun(id),
  onSelectHero: (id) => {
    if (!heroUnlocked(save, id)) return;
    save.hero = id;
    writeSave(save);
    sfx.heroPick(); // a bright "ready for battle" two-note to go with the Selected! pop
    hub.showHub(save);
  },
  onBuy: (id) => {
    if (buyPerm(save, id)) {
      writeSave(save);
      sfx.play({ type: "upgrade", id });
    }
    hub.showHub(save);
  },
  onClaim: (id) => {
    if (claim(save, id) > 0) {
      writeSave(save);
      sfx.built();
    }
    hub.showHub(save, "trophies");
  },
  onGift: () => {
    const gold = claimGift(save.stats, fairDate());
    if (gold > 0) {
      save.gold = Math.min(MAX_GOLD, save.gold + gold);
      writeSave(save);
      sfx.mini("star");
      buzz(settings, 20);
    }
    return gold;
  },
  onClaimQuest: (id) => {
    if (claimQuest(save, id) > 0) {
      writeSave(save);
      sfx.built();
    }
    hub.showHub(save, "trophies");
  },
  onQuestsChanged: () => writeSave(save),
  onLearnSkill: (hero, id) => {
    if (learnSkill(save.heroes[hero], id)) {
      writeSave(save);
      sfx.play({ type: "upgrade", id });
    }
    hub.showHub(save, "heroes");
  },
  onHeroLook: (id, on) => {
    save.stats[`look_${id}`] = on ? 1 : 0;
    writeSave(save);
    hub.showHub(save, "heroes");
  },
  onDifficulty: (id) => {
    save.difficulty = id;
    writeSave(save);
    hub.showHub(save, "battle");
  },
  onHeat: () => writeSave(save),
  onWeekly: () => startWeekly(),
  onBuyFlair: (id) => {
    if (!buyFlair(save, id)) return;
    writeSave(save);
    sfx.unlockChime();
    hub.showHub(save, "heroes");
  },
  onFlair: (id) => {
    save.flair = id;
    writeSave(save);
    hub.showHub(save, "heroes");
  },
  onResetSkills: (hero) => {
    resetSkills(save.heroes[hero]);
    writeSave(save);
    hub.showHub(save, "heroes");
  },
  onSettings: () => showMenuSettings(),
  onAscend: () => {
    if (!ascend(save)) return;
    writeSave(save);
    sfx.unlockChime();
    hub.showHub(save, "armory");
    hub.celebrateAscend(save.crowns ?? 1);
  },
  onReset: () => {
    save = resetSave();
    tutorial.reset();
    hub.showHub(save, "battle");
  },
});
hub.quality = {
  get: () => settings.quality,
  set: (q) => {
    settings.quality = q;
    saveSettings(settings);
    applyQuality(true);
  },
};
hub.volume = {
  get: (k) => (k === "music" ? settings.musicVol : settings.sfxVol),
  set: (k, v) => setVolume(k === "music" ? "musicVol" : "sfxVol", v),
};

hud.setMuted(sfx.muted);

function layout() {
  const scale = renderer.fit();
  uiRoot.style.width = `${VIEW_W * scale}px`;
  uiRoot.style.height = `${VIEW_H * scale}px`;
  uiRoot.style.setProperty("--s", String(scale));
}
window.addEventListener("resize", layout);
layout();
window.addEventListener("pointerdown", () => sfx.unlock(), { capture: true });

// ---- Virtual joystick: touch anywhere, drag to move. Keyboard WASD/arrows also work. ----
const JOY_R = 48;
/** Thumb stick response: a small dead zone (a resting thumb's jitter doesn't walk the hero) and full
 *  speed a little before the rim, with a gentle ease in between for precise short steps. */
function joyCurve(x: number, y: number): Vec {
  const m = Math.hypot(x, y);
  const DEAD = 0.1, FULL = 0.85;
  if (m <= DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, (m - DEAD) / (FULL - DEAD)) ** 0.85;
  return { x: (x / m) * k, y: (y / m) * k };
}
let joyId: number | null = null;
let joyOrigin: Vec = { x: 0, y: 0 };
let joyVec: Vec = { x: 0, y: 0 };
const keys = new Set<string>();

/** Canvas box, measured once per touch: reading it on every pointermove forces a layout whenever
 *  the HUD changed that frame, which made dragging stutter on busy nights. */
let canvasRect: DOMRect | null = null;
window.addEventListener("resize", () => (canvasRect = null));
function toView(ev: PointerEvent, fresh = false): Vec {
  if (fresh || !canvasRect) canvasRect = canvas.getBoundingClientRect();
  const r = canvasRect;
  return { x: ((ev.clientX - r.left) / r.width) * VIEW_W, y: ((ev.clientY - r.top) / r.height) * VIEW_H };
}
canvas.addEventListener("pointerdown", (ev) => {
  // Siege Lord: tapping the battlefield sends the picked card down the lane under the finger.
  if (camp?.reverse && !paused) {
    const v = toView(ev, true);
    siegeBar.tapField(renderer.laneAt(v.x));
    return;
  }
  if (joyId !== null) return;
  joyId = ev.pointerId;
  canvas.setPointerCapture(ev.pointerId);
  joyOrigin = toView(ev, true);
  joyVec = { x: 0, y: 0 };
});
canvas.addEventListener("pointermove", (ev) => {
  if (ev.pointerId !== joyId) return;
  const p = toView(ev);
  let dx = p.x - joyOrigin.x;
  let dy = p.y - joyOrigin.y;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) {
    // Drag the base along so the stick never "runs out".
    joyOrigin.x += (dx / d) * (d - JOY_R);
    joyOrigin.y += (dy / d) * (d - JOY_R);
    dx = p.x - joyOrigin.x;
    dy = p.y - joyOrigin.y;
  }
  joyVec = joyCurve(dx / JOY_R, dy / JOY_R);
});
const endJoy = (ev: PointerEvent) => {
  if (ev.pointerId !== joyId) return;
  joyId = null;
  joyVec = { x: 0, y: 0 };
};
canvas.addEventListener("pointerup", endJoy);
canvas.addEventListener("pointercancel", endJoy);
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));
canvas.addEventListener("lostpointercapture", endJoy);
// Losing focus (alt-tab, notification, app switch) eats keyup/pointerup: drop held input so the hero
// doesn't keep walking on its own when you come back.
window.addEventListener("blur", () => {
  keys.clear();
  joyId = null;
  joyVec = { x: 0, y: 0 };
});

function moveInput(): Vec {
  let x = joyVec.x;
  let y = joyVec.y;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  const pad = padMove();
  x += pad.x;
  y += pad.y;
  const d = Math.hypot(x, y);
  return d > 1 ? { x: x / d, y: y / d } : { x, y };
}

/** Heat gold multiplier of the run in progress (1 = no heat). */
let runHeatMult = 1;

function newRun(id = chapterId, setup = campSetupFromSave(save), seed = (Date.now() >>> 0) ^ 0xca4b, diff: DifficultyId = save.difficulty, weatherOdds?: { rain: number; fog: number; storm: number }, heatOverride?: string[]) {
  sfx.unlock();
  dailyRun = null;
  weeklyRun = null;
  chapterId = id;
  const chapter = CHAPTER_BY_ID[id]!;
  // Campaign difficulty (Endless and the daily always play Normal; a locked pick falls back too).
  runDifficulty = !chapter.endless && difficultyOpen(diff, (save.stars[id] ?? 0) > 0, save.diffCleared[id] ?? 0) ? diff : "normal";
  const dd = DIFF_BY_ID[runDifficulty];
  if (dd.rank > 0) setup = { ...setup, enemyHpMult: (setup.enemyHpMult ?? 1) * dd.hp, eliteChance: dd.elite };
  let played = chapterOnDifficulty(chapter, runDifficulty);
  // Endless: this week's twist.
  const twist = chapter.endless ? endlessTwistFor() : null;
  if (twist) {
    setup = { ...setup, mods: { ...setup.mods! } };
    played = applyEndlessTwist(twist, setup, played);
    window.setTimeout(() => hud.toast(`${twist.icon} This week: ${twist.name} — ${twist.desc}`), 500);
  }
  if (weatherOdds) played = { ...played, weatherOdds };
  // Heat: the challenge modifiers switched on in the chapter sheet.
  const heat = heatOverride ? cleanHeat(heatOverride) : heatAllowed(id) && !setup.classicBlessings ? cleanHeat(save.heat) : [];
  runHeatMult = heatGold(heat);
  if (heat.length) {
    setup = { ...setup, mods: { ...setup.mods! } };
    for (const hid of heat) {
      const h = HEAT_BY_ID[hid]!;
      if (h.hp) setup.enemyHpMult = (setup.enemyHpMult ?? 1) * h.hp;
      if (h.elite) setup.eliteChance = (setup.eliteChance ?? 0) + h.elite;
      if (h.speed) played = { ...played, speedMult: played.speedMult * h.speed };
      if (h.wall) setup.mods!.wallHp *= h.wall;
      if (h.income) setup.mods!.income *= h.income;
      if (h.noRerolls) setup.mods!.rerolls = 0;
    }
    window.setTimeout(() => hud.toast(`🔥 Heat ${heat.map((x) => HEAT_BY_ID[x]!.icon).join("")} · gold ×${runHeatMult.toFixed(2)}`), 700);
  }
  camp = createCamp(seed, played, setup);
  preloadChapterArt(played);
  if (dd.rank > 0) window.setTimeout(() => hud.toast(`${dd.icon} ${dd.name}: ${dd.desc}`), 400);
  // Endless is fought on a different cleared chapter's ground each week (scenery only).
  const scene = chapter.endless ? CHAPTER_BY_ID[endlessSceneryFor(todayString(), clearedChapters())]! : chapter;
  renderer.setGround(scene.ground, scene.id);
  lastMood = scene.id;
  hud.endlessBest = chapter.endless ? (save.best[id] ?? 0) : 0;
  hud.twistIcon = chapter.endless ? endlessTwistFor().icon : "";
  knownTrophies = new Set(claimable(save).map((a) => a.id));
  refreshQuests(save);
  nightsThisRun = 0;
  earnedThisRun = [];
  heldNews = [];
  knownQuests = new Set(questViews(save).filter((v) => v.done).map((v) => v.slot.id));
  flawlessWaves = 0;
  specChoosing = false;
  unlockedLabels = [];
  accumulator = 0;
  paused = false;
  // Keep the speed the player last chose (1×/2×/3×) instead of resetting every run.
  gameSpeed = Math.min(3, Math.max(1, Number(getItem("lastgate.speed")) || 1));
  hud.setSpeed(gameSpeed);
  hud.hideOverlay();
  hub.hide();
  hud.setVisible(true);
  music.start();
}

let dailyRun: DailyChallenge | null = null;

/** "New enemy: Goblin Thief — runs off with coins": the name plus what it does (its first two traits). */
function introLine(name: string): string {
  const d = Object.values(ENEMIES).find((e) => e.name === name);
  const t = d ? enemyTraits(d).filter((x) => x !== "boss").slice(0, 2) : [];
  return `New enemy: ${name}${t.length ? ` — ${t.join(", ")}` : ""}`;
}

/** Starts loading the animation sheets this run can meet (its waves' foes and bosses) during the build phase. */
function preloadChapterArt(ch: ChapterDef) {
  if (ch.endless || !ch.waves?.length) return preloadAnims(true); // (waves made up as it goes)
  // Plus what the sim spawns outside the wave lists: the goblin thief, split-offs and summoned minions.
  const ids = new Set<string>(["thief"]);
  for (const w of ch.waves) {
    for (const id of Object.keys(w.mix ?? {})) ids.add(id);
    if (w.boss) ids.add(w.boss);
  }
  for (const id of [...ids]) {
    const d = ENEMIES[id as keyof typeof ENEMIES];
    if (!d) continue;
    if (d.splitsInto) ids.add(d.splitsInto.enemy);
    if (d.summon) { ids.add(d.summon.enemy); if (d.summon.enraged) ids.add(d.summon.enraged); }
  }
  preloadAnimsFor(ids);
}

/** A daily / weekly twist applied to a run setup. */
function applyTwist(setup: CampSetup, t: Twist): void {
  setup.mods!.drops *= t.drops;
  setup.mods!.heroDamage *= t.heroDamage;
  setup.mods!.towerDamage *= t.towerDamage;
  setup.enemyHpMult = (setup.enemyHpMult ?? 1) * t.enemyHp;
  if (t.eliteChance) setup.eliteChance = t.eliteChance;
  if (t.wallHp) setup.mods!.wallHp *= t.wallHp;
  if (t.tideEvery) setup.tideEvery = t.tideEvery;
  const mods = setup.mods as unknown as Record<string, number>;
  for (const [k, v] of Object.entries(t.mods ?? {})) if (typeof mods[k] === "number") mods[k] *= v as number;
}

/** The Weekly Gauntlet in progress (null otherwise). */
let weeklyRun: Gauntlet | null = null;

function startWeekly() {
  const g = weeklyFor(todayString(), clearedChapters());
  const setup = campSetupFromSave(save);
  applyTwist(setup, g.twist);
  newRun(g.chapterId, setup, g.seed, "normal", g.twist.weatherOdds, g.heats);
  weeklyRun = g;
  hud.banner(`🗓️ Weekly Gauntlet: ${g.twist.name}`, `${g.twist.desc} · 🔥 ${g.heats.map((h) => HEAT_BY_ID[h]!.icon).join("")}`);
}

function finishWeekly(c: Camp, won: boolean, abandoned: boolean, g: Gauntlet, rec: { date: string; hero: HeroId; won: boolean; nights: number; kills: number; minutes: number }) {
  const firstWin = won && !(save.weekly?.week === g.week && save.weekly.won);
  const loot = Math.round(c.goldEarned * LOOT_TO_GOLD * runHeatMult);
  const r = weeklyReward(loot, rec.nights, won, firstWin, g.heats.length);
  const stars = won ? starsFor(true, c.hallHp / c.hallMaxHp) : 0;
  save.weekly = recordWeekly(save.weekly, g.week, rec.nights, won, stars);
  save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
  save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
  pushHistory(save.history, { ...rec, chapter: g.chapterId, gold: r.gold });
  save.runs += 1;
  if (won) save.wins += 1;
  writeSave(save);
  weeklyRun = null;
  if (abandoned) {
    goHub("battle");
    if (r.gold > 0) hud.toast(`🪙 +${r.gold} gold banked from the run`);
    return;
  }
  hud.setVisible(false);
  const reward = { gold: r.gold, waveBonus: rec.nights * WEEKLY.night, winBonus: r.prize, stars: 0, newStars: 0, firstClear: firstWin, unlockedHeroes: [] };
  hub.showEnd(
    { won, chapterName: `Weekly: ${c.chapter.name}`, chapterId: c.chapter.id, wave: c.wave, kills: c.kills, coins: loot, minutes: c.time / 60, heroLevel: c.heroLevel, bosses: c.runStats.bosses, streak: renderer.bestStreak, streakIsBest, flawless: flawlessWaves, tip: lossTip(c), dmg: c.runStats.dmg, earned: earnedThisRun.slice(), questsReady: questsReady(save), skillPoints: newSkillPoints ?? undefined },
    reward,
    () => startWeekly(),
    () => goHub("battle"),
  );
}

function startDaily() {
  const d = dailyFor(todayString());
  const setup = campSetupFromSave(save, d.hero);
  applyTwist(setup, d.twist);
  setup.startBlessings = [d.blessing];
  setup.classicBlessings = true;
  newRun(d.chapterId, setup, d.seed, "normal", d.twist.weatherOdds);
  dailyRun = d;
  // Remind the player what makes today's run different.
  hud.banner(`Daily: ${d.twist.name}`, d.twist.desc);
}

type ToggleKey = "music" | "sfx" | "shake" | "haptics" | "calm" | "bigText" | "fps";

function toggleSetting(k: string) {
  const key = k as ToggleKey;
  settings[key] = !settings[key];
  saveSettings(settings);
  sfx.setChannels(settings.music, settings.sfx, settings.musicVol, settings.sfxVol);
  applyMotion();
  applyDisplaySettings(settings);
  if (key === "haptics") buzz(settings, 30);
}

/** Volume slider moved (0..1): apply live, persist. */
function setVolume(k: "musicVol" | "sfxVol", v: number) {
  settings[k] = Math.max(0, Math.min(1, v));
  saveSettings(settings);
  sfx.setChannels(settings.music, settings.sfx, settings.musicVol, settings.sfxVol);
}

function showMenuSettings() {
  hub.showSettings(
    settings as unknown as Record<string, boolean>,
    toggleSetting,
    () => {
      hub.hide();
      hud.showTitle(() => {
        hud.hideOverlay();
        hub.showHub(save, "battle");
      }, true);
    },
    () => hub.showHub(save),
    {
      onExport: () => hub.showSaveCode("export", showMenuSettings, { code: exportSave(save) }),
      onImport: () =>
        hub.showSaveCode("import", showMenuSettings, {
          current: save,
          onLoad: (code) => {
            const loaded = importSave(code);
            if (!loaded) return false;
            save = loaded;
            writeSave(save);
            hub.showHub(save, "battle");
            return true;
          },
        }),
    },
  );
}

/** Fair day: today's featured mini-game pays double gold. */
function isFair(key: string): boolean {
  return fairPick(fairDate(), openMinis(save.stars)) === key;
}
/** New stars on a mini-game end panel: a rising chime as each one pops in. */
function starChimes(n: number): void {
  for (let i = 0; i < n; i++) window.setTimeout(() => sfx.mini("star"), 350 + i * 300);
}

// ---- Archery Range (side stop on the map). ----
const archery = new ArcheryView(
  uiRoot,
  (score) => {
    const prev = save.mini.archery ?? { best: 0, stars: 0 };
    const r = rangeReward(score, prev.stars);
    save.mini.archery = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("archery");
    if (fair) r.gold += rangeReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Supply Run (side stop on the map). ----
const supply = new SupplyView(
  uiRoot,
  (score) => {
    const prev = save.mini.supply ?? { best: 0, stars: 0 };
    const r = supplyReward(score, prev.stars);
    save.mini.supply = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("supply");
    if (fair) r.gold += supplyReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Wall Watch (side stop on the map). ----
const wallWatch = new WallWatchView(
  uiRoot,
  (score) => {
    const prev = save.mini.watch ?? { best: 0, stars: 0 };
    const r = watchReward(score, prev.stars);
    save.mini.watch = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("watch");
    if (fair) r.gold += watchReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Catapult Toss (side stop on the map). ----
const catapult = new CatapultView(
  uiRoot,
  (score) => {
    const prev = save.mini.catapult ?? { best: 0, stars: 0 };
    const r = catReward(score, prev.stars);
    save.mini.catapult = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("catapult");
    if (fair) r.gold += catReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Dragon Dodge (side stop on the map). ----
const dragonDodge = new DragonView(
  uiRoot,
  (score) => {
    const prev = save.mini.dragon ?? { best: 0, stars: 0 };
    const r = dragonReward(score, prev.stars);
    save.mini.dragon = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("dragon");
    if (fair) r.gold += dragonReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Ghost Lanterns (side stop on the map). ----
const lanterns = new LanternsView(
  uiRoot,
  (score) => {
    const prev = save.mini.lanterns ?? { best: 0, stars: 0 };
    const r = lanternReward(score, prev.stars);
    save.mini.lanterns = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("lanterns");
    if (fair) r.gold += lanternReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Royal Forge (side stop on the map). ----
const forge = new ForgeView(
  uiRoot,
  (score) => {
    const prev = save.mini.forge ?? { best: 0, stars: 0 };
    const r = forgeReward(score, prev.stars);
    save.mini.forge = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("forge");
    if (fair) r.gold += forgeReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Mason's Tower (side stop on the map). ----
const mason = new MasonView(
  uiRoot,
  (score) => {
    const prev = save.mini.mason ?? { best: 0, stars: 0 };
    const r = masonReward(score, prev.stars);
    save.mini.mason = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("mason");
    if (fair) r.gold += masonReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Bell Tower (side stop on the map). ----
const bells = new BellsView(
  uiRoot,
  (score) => {
    const prev = save.mini.bells ?? { best: 0, stars: 0 };
    const r = bellsReward(score, prev.stars);
    save.mini.bells = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    const fair = isFair("bells");
    if (fair) r.gold += bellsReward(score, 3).gold; // Fair day: the score gold again (not the one-time star bonuses)
    starChimes(r.newStars);
    save.stats.miniPlays = (save.stats.miniPlays ?? 0) + 1;
    save.stats.miniStars = (save.stats.miniStars ?? 0) + r.newStars;
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars, fair };
  },
  () => hub.showHub(save, "battle"),
  (i) => sfx.bell(i),
  (kind) => sfx.mini(kind),
);

// ---- Siege Lord (reverse mode): the player sends the horde; the campaign bot defends the castle. ----
const siegeBar = new SiegeBar(
  uiRoot,
  (id, lane) => {
    if (camp?.reverse && deploy(camp, id as never, lane)) {
      sfx.warDrums();
      buzz(settings, 12);
      save.stats.deployed = (save.stats.deployed ?? 0) + (WAR_CARDS.find((k) => k.id === id)?.count ?? 1);
      renderer.laneFlash(lane);
      return true;
    }
    if (camp?.reverse) sfx.denied();
    return false;
  },
  () => setPaused(true),
);
// Drag-and-drop: a screen point over the battlefield (not the card deck) maps to a lane.
siegeBar.laneAtClient = (x, y) => {
  const r = canvas.getBoundingClientRect();
  const deckTop = (siegeBar.root.querySelector(".lgs2-bottom") as HTMLElement | null)?.getBoundingClientRect().top ?? r.bottom;
  if (y >= deckTop || y < r.top || x < r.left || x > r.right) return null;
  return renderer.laneAt(((x - r.left) / r.width) * VIEW_W);
};
siegeBar.onHover = (lane, card) => {
  renderer.dragging = card !== null;
  renderer.dragLane = lane;
};
let siegeIdx = 0;

/** Campaign chapters with at least one star. */
function clearedChapters(): number[] {
  return Object.keys(save.stars).map(Number).filter((k) => k <= 10 && (save.stars[k] ?? 0) > 0);
}

/** The siege to play: one of the ladder's, or (i = -1) today's Daily Siege. */
function siegeDef(i: number): { name: string; chapter: number; perm: number; hero: HeroId; hordeHp?: number } | undefined {
  if (i === -1) return dailySiegeFor(fairDate(), Object.keys(save.stars).map(Number).filter((k) => (save.stars[k] ?? 0) > 0));
  return SIEGES[i];
}

function startSiege(i: number) {
  const s = siegeDef(i);
  if (!s) return;
  sfx.unlock();
  dailyRun = null;
  siegeBackdrop = null;
  siegeFullTime = 0;
  siegeIdx = i;
  // The defenders: a castle with this siege's upgrades and hero, played by the bot.
  const def = newSave();
  for (const p of PERMS) if (!p.capstone) def.perms[p.id] = Math.min(p.max, s.perm);
  const won = SIEGES.filter((_, k) => (save.mini[`siege${k + 1}`]?.stars ?? 0) > 0).length;
  const setup: CampSetup = { ...campSetupFromSave(def, s.hero), reverse: true, siegesWon: won, hordeHp: s.hordeHp };
  const chapter = CHAPTER_BY_ID[s.chapter]!;
  camp = createCamp((Date.now() >>> 0) ^ 0x5e9e, chapter, setup);
  // The castle's opening build time (~20 s) used to be dead time for the attacker — nothing to do but
  // watch a countdown. Fast-forward the defenders through it (same bot, same steps, so the same
  // castle and balance) and leave a short countdown to get your bearings.
  for (let n = 0; camp.phase === "build" && camp.timer > SIEGE_COUNTDOWN && n < 60 * 120; n++) campBotStep(camp);
  drainEvents(camp);
  preloadAnimsFor(WAR_CARDS.map((k) => k.id)); // (your horde: every card's look)
  renderer.setGround(chapter.ground, chapter.id);
  lastMood = chapter.id;
  accumulator = 0;
  paused = false;
  specChoosing = false;
  gameSpeed = 1;
  hud.setSpeed(1);
  hud.hideOverlay();
  hub.hide();
  hud.setVisible(false);
  siegeBar.setWon(won);
  siegeBar.show(true);
  // Trophies already waiting to be claimed aren't news (without this, every unclaimed one toasted at the start).
  knownTrophies = new Set(claimable(save).map((a) => a.id));
  music.start();
  window.setTimeout(() => hud.toast("⚔️ Drag a unit card onto a lane of the field — or tap the field to send the picked card. Take the hall!"), 600);
}

/** Seconds of countdown the attacker sees before the first push (the rest is fast-forwarded). */
const SIEGE_COUNTDOWN = 5;

/** Seconds the War Chest sat full during this siege's pushes (income going to waste). */
let siegeFullTime = 0;

/** One line of advice for a lost siege, from what happened. */
function siegeTip(c: Camp): string {
  const r = c.reverse!;
  const hallLeft = c.hallHp / c.hallMaxHp;
  if (siegeFullTime > 25) return `💡 Your chest sat full for ${Math.round(siegeFullTime)}s — gold past ${REVERSE.cap} is wasted. Keep sending.`;
  if (r.broken === 0) return "💡 Rams and Sappers break walls fast — send them behind a screen of Shields.";
  if (hallLeft > 0.5) return "💡 A breach stays open till the next push — pour your horde through it before the castle repairs.";
  return "💡 So close! Flyers (Bats, Imps) skip the wall, and Diggers come up inside — mix them in for the last push.";
}

function finishSiege(c: Camp, retreat = false) {
  const r = c.reverse!;
  const won = !retreat && r.result === "win";
  if (siegeIdx === -1) return finishDailySiege(c, won, retreat);
  const stars = won ? siegeStars(c.wave) : 0;
  const idx = siegeIdx;
  const key = `siege${siegeIdx + 1}`;
  const prev = save.mini[key] ?? { best: 0, stars: 0 };
  const wonBefore = SIEGES.filter((_, k) => (save.mini[`siege${k + 1}`]?.stars ?? 0) > 0).length;
  const bonus = [0, 60, 120, 200].slice(prev.stars + 1, stars + 1).reduce((a, b) => a + b, 0);
  const gold = (won ? 100 * (siegeIdx + 1) : 20) + r.broken * 5 + bonus;
  save.mini[key] = { best: Math.max(prev.best, stars), stars: Math.max(prev.stars, stars) };
  save.gold = Math.min(MAX_GOLD, save.gold + gold);
  save.stats.goldEarned = (save.stats.goldEarned ?? 0) + gold;
  writeSave(save);
  const wonAfter = SIEGES.filter((_, k) => (save.mini[`siege${k + 1}`]?.stars ?? 0) > 0).length;
  const hallLeft = Math.max(0, Math.round((c.hallHp / c.hallMaxHp) * 100));
  camp = null;
  siegeBackdrop = c;
  paused = false;
  siegeBar.show(false);
  // The story of the siege, then what it opened up.
  const lines = [`⚔️ ${r.deployed} sent · 🧱 ${r.broken} wall${r.broken === 1 ? "" : "s"} broken${won ? ` · taken on push ${c.wave}` : ` · hall at ${hallLeft}%`}`];
  if (won) lines.push(`${"★".repeat(stars)}${"☆".repeat(3 - stars)}${stars > prev.stars ? " — new best!" : ""}`);
  lines.push(`+${gold} gold`);
  if (!won && !retreat) lines.push(siegeTip(c));
  const newCards = WAR_CARDS.filter((k) => k.unlock !== undefined && k.unlock > wonBefore && k.unlock <= wonAfter);
  if (newCards.length) lines.push(`🃏 New war card${newCards.length > 1 ? "s" : ""}: ${newCards.map((k) => CARD_NAME[k.id] ?? ENEMIES[k.id].name).join(", ")}`);
  const next = SIEGES[siegeIdx + 1];
  if (won && prev.stars === 0 && next) lines.push(next.needs && !(save.stars[next.needs] ?? 0) ? `🔒 Next: ${next.name} — clear chapter ${next.needs} to open it` : `🔓 Next siege open: ${next.name}`);
  if (won && stars > prev.stars) for (let i = 0; i < stars - prev.stars; i++) window.setTimeout(() => sfx.mini("star"), 400 + i * 300);
  hud.showMessage(
    won ? `🏴 The hall has fallen!` : retreat ? "You withdrew" : "The castle held",
    lines.join("\n"),
    "Back to the map",
    () => {
      hud.hideOverlay();
      goHub();
    },
    "title",
    { label: won ? "Attack again" : "Try again", onClick: () => { hud.hideOverlay(); startSiege(idx); } },
  );
}

/** Daily Siege result: the day's prize on the first win, a little gold otherwise; no stars or cards. */
function finishDailySiege(c: Camp, won: boolean, retreat: boolean) {
  const r = c.reverse!;
  const prize = won ? claimDailySiege(save.stats, fairDate()) : 0;
  const gold = (won ? 40 : 20) + r.broken * 5 + prize;
  save.gold = Math.min(MAX_GOLD, save.gold + gold);
  save.stats.goldEarned = (save.stats.goldEarned ?? 0) + gold;
  writeSave(save);
  const hallLeft = Math.max(0, Math.round((c.hallHp / c.hallMaxHp) * 100));
  camp = null;
  siegeBackdrop = c;
  paused = false;
  siegeBar.show(false);
  const lines = [`⚔️ ${r.deployed} sent · 🧱 ${r.broken} wall${r.broken === 1 ? "" : "s"} broken${won ? ` · taken on push ${c.wave}` : ` · hall at ${hallLeft}%`}`];
  if (prize) lines.push(`🗓️ Daily Siege taken! +${prize} gold prize`);
  else if (won) lines.push("Today's prize was already won — a new siege tomorrow");
  lines.push(`+${gold} gold`);
  if (!won && !retreat) lines.push(siegeTip(c));
  if (prize) window.setTimeout(() => sfx.mini("star"), 400);
  hud.showMessage(
    won ? "🏴 The hall has fallen!" : retreat ? "You withdrew" : "The castle held",
    lines.join("\n"),
    "Back to the map",
    () => {
      hud.hideOverlay();
      goHub();
    },
    "title",
    { label: won ? "Attack again" : "Try again", onClick: () => { hud.hideOverlay(); startSiege(-1); } },
  );
}

function goHub(tab: "battle" | "armory" = "battle") {
  siegeBar.show(false);
  camp = null;
  siegeBackdrop = null;
  hud.setTip(null);
  paused = false;
  hud.setVisible(false);
  hud.hideOverlay();
  hub.showHub(save, tab);
}

function setPaused(p: boolean) {
  if (!camp || camp.phase === "won" || camp.phase === "lost" || camp.phase === "pick" || specChoosing) return;
  paused = p;
  if (p)
    hub.showPause(() => setPaused(false), () => (camp!.reverse ? finishSiege(camp!, true) : finishRun(camp!, false, true)), {
      values: settings as unknown as Record<string, boolean>,
      onToggle: toggleSetting,
    }, buildStrip(camp!.owned), dailyRun ? `🎯 Daily: ${dailyRun.twist.name} — ${dailyRun.twist.desc}` : undefined, pauseStatus(camp!), camp!.reverse ? "Withdraw" : undefined);
  else hub.hide();
}

/** Where the run stands, for the pause panel: chapter, wave, kills, time. */
function pauseStatus(c: Camp): string[] {
  if (c.reverse) {
    // Siege Lord: the attacker's view of the siege — which castle, which push, what you've sent.
    const r = c.reverse, s = siegeDef(siegeIdx);
    return [`🏰 ${s?.name ?? "Siege"}`, `⚔️ Push ${c.wave}/${REVERSE.pushes}`, `🪖 ${r.deployed} sent`, `🧱 ${r.broken} broken`, `🏛️ Hall ${Math.max(0, Math.round((c.hallHp / c.hallMaxHp) * 100))}%`];
  }
  // Same numbering as the HUD: between waves it shows the wave coming up.
  const total = c.chapter.waves.length;
  const cur = c.phase === "wave" ? c.wave : c.chapter.endless ? c.wave + 1 : Math.min(total, c.wave + 1);
  const wave = c.chapter.endless ? `🌙 Night ${cur}` : `🌙 Night ${cur}/${total}`;
  const t = Math.floor(c.time);
  const out = [`📜 ${c.chapter.name}`, wave, `⚔️ ${c.kills} slain`, `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`];
  const dd = DIFF_BY_ID[runDifficulty];
  if (dd.rank > 0) out.push(`${dd.icon} ${dd.name}`);
  if (c.phase === "wave" && c.weather !== "clear") out.push(`${WEATHER_INFO[c.weather].icon} ${WEATHER_INFO[c.weather].name}`);
  if (c.chapter.endless && !dailyRun) { const tw = endlessTwistFor(); out.push(`${tw.icon} ${tw.name}`); }
  return out;
}

/** One actionable tip for the end screen, based on how the run went. */
function lossTip(c: Camp): string {
  const s = c.runStats;
  const built = (kind: string) => c.plots.some((p) => p.kind === kind && p.level > 0);
  // Only suggest a building the player could actually have built (not one still locked this run).
  const open = (kind: string) => c.plots.some((p) => p.kind === kind && !p.locked);
  if ((s.flares ?? 0) >= 2) return "The blood moon flared and the horde ran wild. When the field turns red, fall back near the hall (its archers hit harder) and save your ability for the rush.";
  if ((s.burnTime ?? 0) > 25) return "Fire Imps kept your buildings burning. Walk onto a burning building to stamp the fire out — and shoot imps down early.";
  if ((s.stuns ?? 0) >= 6) return "War Ravens stunned your towers again and again. Upgrade towers so they shoot ravens down first, or build a Mage Tower.";
  if ((s.tunnelers ?? 0) >= 5 && !built("barracks") && open("barracks")) return "Tunnelers dug under the wall. A Barracks (and the King) inside the camp catch them as they surface.";
  if (s.flyerHallDamage > c.hallMaxHp * 0.3) return "Bats fly over the wall. Upgrade the Hall (stronger hall archers) and fight near it when flyers come.";
  if (s.breaches >= 3 && !built("fortify") && open("fortify")) return "The wall kept breaking. Fortify it into stone, and stand on Repair Wall during the day.";
  if (s.breaches >= 3 && !built("barracks") && open("barracks")) return "Build a Barracks — its soldiers hold breaches while you repair.";
  if (s.heroDeaths >= 2) return "Your hero fell often. Fight from behind the wall, or take Vigor / the Knight Captain.";
  // Barely touched the hero's ability (it recharges every ~20 s, so a night has room for 2–3).
  if (c.wave >= 3 && (s.casts ?? 0) < c.wave) {
    const ab = Object.values(HERO_BY_ID).find((h) => h.ability === c.ability);
    if (ab) return `${ab.abilityName} recharges fast — tap it whenever foes bunch up. You used it ${s.casts ?? 0} time${s.casts === 1 ? "" : "s"} in ${c.wave} nights.`;
  }
  // Fell in the first nights: the basics, before any advice about buildings that aren't open yet.
  if (c.wave <= 2 && c.plots.filter((p) => p.kind === "tower" && p.level > 0).length < 2) return "Build Archer Towers by the wall before nightfall — walk onto a glowing plot — and grab the coins foes drop.";
  if (!built("lumber") && open("lumber")) return "Build the Lumber Camp early: logs unlock tower levels 3–4 and stone walls.";
  if (open("lumber") && c.plots.filter((p) => p.kind === "tower" && p.level >= 3).length < 2) return "Push a couple of towers to level 3+ — they're your main damage.";
  if (c.plots.filter((p) => p.kind === "tower" && p.level >= 2).length < 2) return "Upgrade your Archer Towers — stand on a built tower to level it up. They're your main damage.";
  return "Spend your gold in the Armory, then try again — every run makes you stronger.";
}

function finishRun(c: Camp, won: boolean, abandoned = false) {
  // Record whether this run beat the lifetime best streak (shown on the end screen).
  streakIsBest = renderer.bestStreak >= 10 && renderer.bestStreak > (save.stats.bestStreak ?? 0);
  save.stats.bestStreak = Math.max(save.stats.bestStreak ?? 0, renderer.bestStreak);
  // Nights held go to the hero as skill-tree XP.
  const heroId = dailyRun ? dailyRun.hero : save.hero;
  const pts = grantHeroXp(save, heroId, nightsThisRun);
  const rec = { date: todayString(), hero: heroId, won, nights: nightsThisRun, kills: c.kills, minutes: Math.round((c.time / 60) * 10) / 10 };
  newSkillPoints = pts > 0 ? { hero: HERO_BY_ID[heroId].name, n: pts } : null;
  if (won) {
    save.stats[`won_${heroId}`] = 1;
    save.stats[`wins_${heroId}`] = heroWins(save, heroId) + 1;
  }
  nightsThisRun = 0;
  if (dailyRun) return finishDaily(c, won, abandoned, dailyRun, rec);
  if (weeklyRun) return finishWeekly(c, won, abandoned, weeklyRun, rec);
  const prevBest = save.best[c.chapter.id] ?? 0;
  // Abandoned between waves (build phase): wave N is held, so it counts like falling on wave N+1.
  const waveReached = !won && c.phase === "build" ? c.wave + 1 : c.wave;
  const reward = applyRun(save, { chapter: c.chapter.id, won, wave: waveReached, gateFrac: c.hallHp / c.hallMaxHp, goldFromKills: Math.round(c.goldEarned * LOOT_TO_GOLD), difficulty: runDifficulty, heatMult: dailyRun ? 1 : runHeatMult });
  pushHistory(save.history, { ...rec, chapter: c.chapter.id, gold: reward.gold });
  if (c.chapter.endless) pushEndlessTop(save.endlessTop, { nights: rec.nights, hero: rec.hero, date: rec.date });
  writeSave(save);
  if (abandoned) {
    goHub("battle");
    // Abandoned runs still pay out: say so, or the gold just silently appears.
    if (reward.gold > 0) hud.toast(`🪙 +${reward.gold} gold banked from the run`);
    return;
  }
  hud.setVisible(false);
  hub.showEnd(
    { won, chapterName: c.chapter.name, chapterId: c.chapter.id, wave: c.wave, kills: c.kills, coins: Math.round(c.goldEarned * LOOT_TO_GOLD), minutes: c.time / 60, endless: !!c.chapter.endless, record: c.wave > prevBest && prevBest > 0, heroLevel: c.heroLevel, bosses: c.runStats.bosses, streak: renderer.bestStreak, streakIsBest, flawless: flawlessWaves, tip: lossTip(c), dmg: c.runStats.dmg, earned: earnedThisRun.slice(), upgradesReady: PERMS.filter((p) => canBuy(save, p.id)).length, questsReady: questsReady(save), skillPoints: newSkillPoints ?? undefined, hallPct: Math.floor((c.hallHp / c.hallMaxHp) * 100) },
    reward,
    () => newRun(chapterId),
    () => goHub("armory"),
    nextChapter(won, c.chapter.id),
  );
}

/** After a campaign win, offer the next chapter (if there is one and it's open) as the main action. */
function nextChapter(won: boolean, id: number): { name: string; go: () => void } | undefined {
  const nxt = CHAPTER_BY_ID[id + 1];
  if (!won || !nxt || nxt.endless || !chapterUnlocked(save, nxt.id)) return undefined;
  return { name: nxt.name, go: () => newRun(nxt.id) };
}
/** Daily runs pay gold (plus a once-a-day victory bonus) but don't touch campaign stars or records. */
function finishDaily(c: Camp, won: boolean, abandoned: boolean, d: DailyChallenge, rec: Omit<RunRecord, "chapter" | "gold">) {
  // A run started on yesterday's daily that ends after midnight still pays, but can't touch today's record.
  const stale = save.daily.date > d.date;
  if (!stale && save.daily.date !== d.date) save.daily = { date: d.date, best: 0, won: false };
  const firstWin = won && !stale && !save.daily.won;
  // Abandoned between waves (build phase): wave N is held, like the campaign's waveReached.
  const reached = !won && c.phase === "build" ? c.wave + 1 : c.wave;
  if (!stale) save.daily.best = Math.max(save.daily.best, reached);
  const streak = firstWin ? recordDailyWin(save.stats, d.date) : 0;
  if (firstWin) save.stats.dailyWins = (save.stats.dailyWins ?? 0) + 1;
  if (!stale) save.daily.won ||= won;
  const waveBonus = Math.max(0, reached - (won ? 0 : 1)) * 4 * d.chapterId;
  const winBonus = firstWin ? DAILY_BONUS : 0;
  const streakBonus = firstWin ? dailyStreakBonus(streak) : 0;
  const loot = Math.round(c.goldEarned * LOOT_TO_GOLD);
  const reward = { gold: loot + waveBonus + winBonus + streakBonus, waveBonus, winBonus, streakBonus, stars: 0, newStars: 0, firstClear: false, unlockedHeroes: [] };
  save.gold += reward.gold;
  save.stats.goldEarned = (save.stats.goldEarned ?? 0) + reward.gold;
  pushHistory(save.history, { ...rec, chapter: d.chapterId, gold: reward.gold, daily: true });
  save.runs += 1;
  if (won) save.wins += 1;
  writeSave(save);
  dailyRun = null;
  if (abandoned) {
    goHub("battle");
    // Abandoned runs still pay out: say so, or the gold just silently appears.
    if (reward.gold > 0) hud.toast(`🪙 +${reward.gold} gold banked from the run`);
    return;
  }
  hud.setVisible(false);
  hub.showEnd(
    { won, chapterName: c.chapter.name, chapterId: c.chapter.id, wave: c.wave, kills: c.kills, coins: loot, minutes: c.time / 60, daily: true, dailyStreak: streak, heroLevel: c.heroLevel, bosses: c.runStats.bosses, streak: renderer.bestStreak, streakIsBest, flawless: flawlessWaves, tip: lossTip(c), dmg: c.runStats.dmg, earned: earnedThisRun.slice(), questsReady: questsReady(save), skillPoints: newSkillPoints ?? undefined },
    reward,
    () => startDaily(),
    () => goHub("battle"),
  );
}

/** Keyboard: one handler, branching by context (title card → menus → blessing pick → in-run). */
function onKey(e: KeyboardEvent): void {
  // Keyboard (and, where the browser allows it, gamepad) presses can start audio too, not just taps.
  sfx.unlock();
  // Typing in a text box (save-code import): letters like "m" aren't shortcuts there.
  const t = (e as Partial<KeyboardEvent>).target as HTMLElement | null | undefined;
  if (e.code !== "Escape" && t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type === "text"))) return;
  const enter = e.code === "Enter" || e.code === "NumpadEnter";
  // M mutes / unmutes anywhere.
  if (e.code === "KeyM" && !e.repeat) return hud.toggleMute();
  const inRun = !!camp && camp.phase !== "won" && camp.phase !== "lost";
  // A button focused with Tab: Enter/Space press *it* (native behaviour) in menus; in a run Space/Enter
  // are game keys, so stop the browser from also "clicking" whatever button has focus.
  const focusedBtn = document.activeElement instanceof HTMLButtonElement;
  if (focusedBtn && (enter || e.code === "Space")) {
    // Menus and the pause panel: let the browser press the focused button.
    if (!inRun || paused) return;
    // Gamepad presses arrive as plain { code, repeat } objects without preventDefault.
    e.preventDefault?.();
  }

  // Title / How-to card: Enter presses its big button.
  const big = document.querySelector<HTMLElement>(".title-screen .big-btn");
  if (big?.offsetParent) {
    if (enter && !e.repeat) big.click();
    return;
  }

  // Menus (map, settings, end screen…): Esc backs out to the map, Enter takes the primary action.
  if (!inRun) {
    if (!hub.visible || e.repeat) return;
    if (e.code === "Escape" && !hub.onHubScreen) goHub("battle");
    if (enter) {
      const target = hub.onHubScreen
        ? (document.querySelector<HTMLElement>(".chapter.next") ?? [...document.querySelectorAll<HTMLElement>(".chapter:not(.locked):not(.endless):not(.daily)")].pop())
        : document.querySelector<HTMLElement>(".btn-col .btn:not(.btn-ghost)");
      target?.click();
    }
    return;
  }

  // Blessing pick: 1/2/3 choose a card, R rerolls (clicks go through the cards' own tap guard).
  if (camp!.phase === "pick") {
    if (e.repeat) return;
    const idx = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
    if (idx >= 0) document.querySelectorAll<HTMLButtonElement>(".pick .card")[idx]?.click();
    if (e.code === "KeyR") document.querySelector<HTMLButtonElement>(".pick .btn-small")?.click();
    return;
  }

  // In a run.
  if (e.code === "Escape" || e.code === "KeyP") return e.repeat ? undefined : setPaused(!paused);
  if (paused || e.repeat) return;
  if (e.code === "Space") abilityQueued = true;
  if (e.code === "KeyC" || enter) callWave = true;
  if (e.code === "KeyF") hud.setSpeed(cycleSpeed());
}
window.addEventListener("keydown", onKey);
// Plugging in a controller: say it's recognised and how to start (no manual needed).
window.addEventListener("gamepadconnected", () => hud.toast("🎮 Controller connected — A to play, Start to pause"));
// Mouse/touch clicks shouldn't leave a button focused (a later Space would "click" it again — e.g. the
// speed button changing speed when you meant the hero ability). Keyboard-made clicks have detail 0.
document.addEventListener("click", (e) => {
  if (e.detail > 0) (e.target as Element | null)?.closest?.("button")?.blur();
}, true);
document.addEventListener("visibilitychange", () => {
  // Silence (and stop scheduling) audio while the tab is hidden; pick it back up when it returns.
  const ac = sfx.context;
  if (document.hidden) void ac?.suspend().catch(() => {});
  else if (ac && ac.state !== "running") void ac.resume().catch(() => {});
  if (!document.hidden) return;
  setPaused(true);
  // Keep lifetime stats (trophy progress) earned mid-run if the tab is closed.
  writeSave(save);
});
window.addEventListener("pagehide", () => writeSave(save));
// The game open in two tabs: adopt what the other tab saves, or this tab's save-on-hide would later
// overwrite it with stale data (undoing progress, an erase, or an imported save code).
window.addEventListener("storage", (e) => {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  const theirs = loadSave();
  // On the menus, take whatever the other tab wrote (including an erase or an imported code);
  // mid-run, only adopt progress that isn't behind ours.
  if (camp && theirs.runs < save.runs) return;
  // Mid-run, this tab's stats (kills, waves held…) may not be written yet: keep the higher value of each.
  // (Daily streak fields belong together — keep the other tab's set as-is.)
  if (camp) for (const [k, v] of Object.entries(save.stats)) if (!k.startsWith("daily")) theirs.stats[k] = Math.max(theirs.stats[k] ?? 0, v ?? 0);
  save = theirs;
  if (!camp && hub.onHubScreen) hub.showHub(save);
});
// Phone turned sideways (rotate hint showing): pause the run so nothing happens unseen.
const sideways = matchMedia("(orientation: landscape) and (max-height: 500px) and (pointer: coarse)");
sideways.addEventListener("change", (e) => {
  if (e.matches) setPaused(true);
});

/** Matches the red danger vignette: under 30% hall HP during a wave, a heartbeat that quickens as it drops. */
let heartTimer = 0;
function heartbeatTick(c: Camp, dt: number): void {
  const frac = c.hallHp / c.hallMaxHp;
  // (Siege Lord: a low hall is the attacker's good news — no danger heartbeat.)
  if (c.reverse || c.phase !== "wave" || frac >= 0.3 || frac <= 0) {
    heartTimer = 0;
    return;
  }
  const urgency = 1 - frac / 0.3;
  heartTimer -= dt;
  if (heartTimer <= 0) {
    sfx.heartbeat(urgency);
    heartTimer = 1.1 - urgency * 0.55;
  }
}

let coinStreak = 0;
let lastCoinAt = 0;

/** Map camp events onto the shared SFX vocabulary. */
/** Lifetime stats for achievements (saved with the next run result). */
/** Trophies already claimable/claimed when we last looked, so new ones can be announced in-run. */
let knownTrophies = new Set<string>();
/** Nights held this run (hero skill XP) and skill points the last run earned (end screen). */
let nightsThisRun = 0;
let runDifficulty: DifficultyId = "normal";
let newSkillPoints: { hero: string; n: number } | null = null;
/** Quests already finished when we last looked (a newly finished one gets a toast mid-run). */
let knownQuests = new Set<string>();
/** Trophies and quests finished during this run (listed on the end screen). */
let earnedThisRun: string[] = [];
/** Trophy / quest / bestiary news earned mid-night: held until the night is cleared so fights stay free
 *  of text, then shown as one combined toast (owner: "too much to read mid game"). */
let heldNews: { full: string; short: string }[] = [];
function newsToast(full: string, short = full): void {
  if (camp && (camp.phase === "wave" || camp.phase === "pick")) heldNews.push({ full, short });
  else hud.toast(full);
}
function flushNews(): void {
  if (!heldNews.length) return;
  const items = heldNews;
  heldNews = [];
  hud.toast(items.length === 1 ? items[0]!.full : items.slice(0, 4).map((n) => n.short).join("  ·  ") + (items.length > 4 ? `  ·  +${items.length - 4}` : ""));
}
function announceTrophies(): void {
  for (const v of questViews(save)) {
    if (!v.done || knownQuests.has(v.slot.id)) continue;
    knownQuests.add(v.slot.id);
    earnedThisRun.push(`📜 ${v.def.desc}`);
    newsToast(`📜 Quest complete: ${v.def.desc}`, "📜 Quest done");
    sfx.unlockChime();
  }
  for (const a of claimable(save)) {
    if (knownTrophies.has(a.id)) continue;
    knownTrophies.add(a.id);
    earnedThisRun.push(`🏆 ${a.name}`);
    newsToast(`🏆 Trophy unlocked: ${a.name}`, `🏆 ${a.name}`);
    sfx.unlockChime();
  }
}

function trackStats(ev: CampEvent) {
  const add = (k: string, n = 1) => (save.stats[k] = (save.stats[k] ?? 0) + n);
  if (ev.type === "waveClear") {
    add("wavesHeld");
    nightsThisRun += 1;
  }
  else if (ev.type === "build" && ev.kind === "tower" && ev.level === 1) add("towersBuilt");
  else if (ev.type === "logsDelivered") add("logs", ev.n);
  else if (ev.type === "forged") add("bows");
  else if (ev.type === "kill") {
    add("kills");
    save.stats[`met_${ev.enemy.id}`] = 1; // Bestiary: this kind of foe has been slain at least once
    if (ev.enemy.boss) add("bosses");
    if (ev.elite) add("elites");
    if (ev.enemy.id === "frostwyrm") add("frostwyrm");
    if (ev.enemy.id === "magma") add("magma");
    if (ev.enemy.id === "drowned") add("drowned");
    if (ev.enemy.id === "bloodlord") add("bloodlord");
    if (ev.enemy.id === "hollowking") add("hollowking");
  } else if (ev.type === "boom" && ev.kind === "snare" && ev.n) add("snared", ev.n);
  else if (ev.type === "lance" && ev.n) add("lanced", ev.n);
  else if (ev.type === "sanctuary") add("sanctified", ev.healed);
  else if (ev.type === "callToArms") add("levied", ev.n);
  else if (ev.type === "ability") add(`ab_${ev.id}`);
  else if (ev.type === "acidSplash") add("acidHits", ev.n);
  else if (ev.type === "fireOut") add("firesOut");
}

/** Siege Lord: the castle's own feel-good sounds (its coins, builds, level-ups, ability chime) would
 *  sound like YOUR progress — the attacker doesn't hear them (their popups are hidden too). */
const SIEGE_SILENT = new Set<CampEvent["type"]>(["coinPickup", "logPickup", "coinSpend", "logSpend", "build", "blessing", "offers", "levelUp", "earlyBonus", "heroRespawn", "plotUnlocked", "specChosen", "abilityReady", "courier", "heroDown"]);

function playSfx(ev: CampEvent, c: Camp) {
  if (c.reverse && SIEGE_SILENT.has(ev.type)) return;
  // Newer event types: synthesised in sfx.event (rate-limited there), plus a buzz for the big hits.
  switch (ev.type) {
    case "callToArms":
      sfx.warDrums();
      buzz(settings, 40);
      return;
    case "frostNova":
    case "eruption":
    case "tide":
    case "bossSlam":
      sfx.event(ev.type);
      buzz(settings, 60);
      return;
    case "towerStunned":
      sfx.event(ev.frozen ? "towerFrozen" : "towerStunned");
      buzz(settings, 25);
      return;
    case "warcry":
    case "bloodmoon":
    case "curse":
    case "boulderThrow":
    case "eliteSpawn":
    case "shieldBreak":
    case "mageZap":
    case "stormBolt":
    case "spikeHit":
    case "burrow":
    case "emerge":
    case "blink":
    case "flask":
    case "acidSplash":
    case "specChosen":
    case "ablaze":
    case "fireOut":
      sfx.event(ev.type);
      return;
  }
  switch (ev.type) {
    case "courier": {
      // The hall's steady trickle shouldn't chime every second all day: a soft coin now and then.
      const now = performance.now();
      if (now - lastCourierSfx > 2200) {
        lastCourierSfx = now;
        sfx.coin(0);
      }
      break;
    }
    case "coinPickup":
    case "logPickup": {
      const now = performance.now();
      coinStreak = now - lastCoinAt < 600 ? coinStreak + 1 : 0;
      lastCoinAt = now;
      sfx.coin(coinStreak);
      break;
    }
    case "coinSpend":
    case "logSpend": {
      const p = c.plots.find((q) => q.x === ev.to.x && q.y === ev.to.y);
      sfx.pay(p ? (p.paid + p.paidLogs) / Math.max(1, plotCost(p) + plotLogCost(p)) : 0.5);
      break;
    }
    case "build":
      sfx.built();
      buzz(settings, 25);
      break;
    case "blessing":
      sfx.play({ type: "upgrade", id: "x" });
      break;
    case "offers":
      sfx.play({ type: "offers" });
      break;
    case "boom":
      sfx.play({ type: "boom", x: ev.x, y: ev.y, r: ev.r, kind: ev.kind === "nova" ? "nova" : "boulder" });
      break;
    case "lance":
      sfx.play({ type: "boom", x: ev.x, y: ev.y, r: 120, kind: "boulder" });
      break;
    case "wallHit":
    case "hallHit":
      sfx.play({ type: "gateHit", x: ev.x, damage: ev.damage, source: "" });
      break;
    case "wallBreak":
      sfx.play({ type: "sapper", x: ev.x, y: ev.y });
      buzz(settings, 90);
      break;
    case "heroHit":
      buzz(settings, 15);
      break;
    case "heroDown":
      sfx.play({ type: "lost" });
      buzz(settings, 120);
      break;
    case "levelUp":
      sfx.play({ type: "upgrade", id: "lvl" });
      break;
    case "earlyBonus":
      sfx.coin(6);
      break;
    case "heroRespawn":
      sfx.play({ type: "upgrade", id: "respawn" });
      break;
    case "thief":
      sfx.jingle();
      break;
    case "allyDown":
      sfx.grunt();
      break;
    case "plotUnlocked":
      sfx.unlockChime();
      break;
    case "shoot":
      if (ev.owner === "catapult") sfx.catapult();
      else sfx.play(ev as unknown as GameEvent);
      break;
    case "ability":
    case "abilityReady":
    case "hit":
    case "kill":
    case "heal":
    case "summon":
    case "enrage":
    case "bossSpawn":
    case "sapper":
    case "waveStart":
    case "won":
    case "lost": {
      if (ev.type !== "won" && ev.type !== "lost") {
        sfx.play(ev as unknown as GameEvent);
        if (ev.type === "bossSpawn") buzz(settings, 80);
        break;
      }
      // (Siege Lord is the other side: the castle falling — "lost" — is YOUR victory, and vice versa.)
      const victory = c.reverse ? ev.type === "lost" : ev.type === "won";
      if (victory) sfx.fanfare(c.chapter.id);
      else sfx.play({ type: "lost" } as unknown as GameEvent);
      if (victory) buzz(settings, 150);
      break;
    }

    default:
      break;
  }
}

/** Settings → Show FPS: a small readout of real frame rate and graphics tier during battles. */
const fpsEl = document.createElement("div");
fpsEl.className = "lg-fps";
uiRoot.append(fpsEl);
let fpsAcc = 0, fpsN = 0;
function updateFps(realDt: number): void {
  const on = settings.fps && !!camp && document.visibilityState === "visible";
  fpsEl.style.display = on ? "" : "none";
  if (!on) return;
  fpsAcc += realDt;
  fpsN++;
  if (fpsAcc < 0.5) return;
  const QN = ["Pretty", "High", "Smooth", "Smoothest"];
  fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps · ${QN[renderer.qualityTier] ?? ""}${renderer.auto ? " (auto)" : ""}`;
  fpsAcc = 0;
  fpsN = 0;
}

function frame(now: number) {
  pollPad(onKey, () => (camp?.phase === "build" || camp?.phase === "wave") && !paused, camp?.phase === "pick");
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Only real play tunes the battle's pixel density (a slow menu backdrop shouldn't blur the game).
  if (document.visibilityState === "visible" && !paused && camp) renderer.perfSample(realDt);
  updateFps(realDt);
  // Slow-motion beats, and the near-freeze of a hitstop on heavy hits (sim only; effects keep moving).
  const dt = (renderer.fx.hitstop > 0 ? realDt * 0.06 : renderer.fx.slowmo > 0 && !settings.calm ? realDt * 0.3 : realDt) * gameSpeed;
  const c = camp;
  if (c && !paused && !specChoosing) {
    accumulator += dt;
    // Debug autoplay (window.__autoplay = true): the bot drives the hero, for visual QA runs.
    const auto = (window as unknown as { __autoplay?: boolean }).__autoplay;
    const move = auto ? campBotInput(c).move : moveInput();
    if (auto && c.phase === "pick" && !(window as unknown as { __noAutoPick?: boolean }).__noAutoPick) {
      if (c.buildChoice) chooseBuilding(c, c.buildChoice[0]!);
      if (c.phase === "pick") chooseBlessing(c, campBotPick(c));
      hud.hideOverlay();
    }
    while (accumulator >= STEP) {
      interp.snapshot(c);
      if (c.reverse) campBotStep(c);
      else step(c, { move, callWave, ability: abilityQueued });
      callWave = false;
      abilityQueued = false;
      accumulator -= STEP;
    }
    const events = drainEvents(c);
    // Let the renderer count this frame's kills first: finishRun reads the kill streak, and the
    // winning (or last) kill arrives in the same batch as "won"/"lost".
    renderer.consume(events);
    for (const ev of events) {
      playSfx(ev, c);
      // Siege Lord: the defenders' kills are of your own horde — no stats, quests or campaign banners.
      if (c.reverse) {
        if (ev.type === "won" || ev.type === "lost") finishSiege(c);
        if (ev.type === "waveStart" && ev.wave > 1) hud.banner(`⚔️ Push ${ev.wave}`, "The castle grows stronger");
        // (Wall breaks get their call-out and coin flight on the battlefield itself.)
        continue;
      }
      // First kill of a foe kind: it joins the Bestiary (bosses get their own banner already).
      const newFoe = ev.type === "kill" && !ev.enemy.boss && !foeMet(save, ev.enemy.id) ? ev.enemy.name : null;
      trackStats(ev);
      if (newFoe) newsToast(`📖 New in the Bestiary: ${newFoe}`, `📖 ${newFoe}`);
      if (ev.type === "waveStart") waveStartTally = { kills: c.kills, gold: c.goldEarned, hits: 0 };
      if (ev.type === "wallHit" || ev.type === "hallHit") waveStartTally.hits += 1;
      // Endless: the moment you pass your best wave, celebrate it in-run (once).
      const endlessBest = save.best[c.chapter.id] ?? 0;
      if (ev.type === "waveStart" && c.chapter.endless && !dailyRun && endlessBest > 0 && ev.wave === endlessBest + 1) {
        hud.banner(`Night ${ev.wave}`, "🏆 New record!");
        renderer.celebrate();
        continue;
      }
      // Endless milestone reached (paid when the run ends).
      if (ev.type === "waveClear" && c.chapter.endless && !dailyRun && c.wave % ENDLESS_MILESTONE_STEP === 0 && c.wave >= nextEndlessMilestone(save)) {
        hud.toast(`🎯 Night ${c.wave} milestone! +${endlessMilestoneReward(c.wave)} gold`);
        sfx.unlockChime();
      }
      if (ev.type === "waveStart" && ev.weather !== "clear") {
        const w = WEATHER_INFO[ev.weather];
        window.setTimeout(() => hud.toast(`${w.icon} ${w.name} tonight — ${w.desc}`), ev.event ? 3000 : 1600);
      }
      if (ev.type === "waveStart")
        hud.banner(
          c.chapter.id === 98 ? (ev.wave === c.chapter.waves.length ? "👑 THE LAST BOSS" : `👑 Boss ${ev.wave}/${c.chapter.waves.length}`) : !c.chapter.endless && ev.wave === c.chapter.waves.length ? "🌙 FINAL NIGHT" : ev.boss ? `🌙 Night ${ev.wave} — Boss!` : `🌙 Night ${ev.wave}`,
          ev.boss ?? (ev.event ? `${NIGHT_EVENT_INFO[ev.event].icon} ${NIGHT_EVENT_INFO[ev.event].name} — ${NIGHT_EVENT_INFO[ev.event].desc}` : ev.intro ? introLine(ev.intro) : "The horde comes in the dark"),
          !c.chapter.endless && ev.wave === c.chapter.waves.length ? "red" : undefined,
        );
      // Wave-end unlocks are announced after the blessing pick; a hall upgrade mid-build is announced now.
      if (ev.type === "plotUnlocked") {
        if (c.phase === "build") hud.banner("New building!", `${ev.label} unlocked`);
        else unlockedLabels.push(ev.label);
      }
      if (ev.type === "kill" && ev.enemy.boss) hud.banner(`${ev.enemy.name} defeated!`, "👑 Boss slain");
      if (ev.type === "kill" && ev.enemy.id === "thief") hud.banner("Goblin caught!", `🪙 +${ev.gold} coins`);
      if (ev.type === "thief") hud.banner("Treasure goblin!", "Catch it before it escapes!");
      if (ev.type === "thiefEscaped") hud.banner("It got away…", undefined, "red");
      // Endless: every 5th wave held is a milestone worth a moment (banner + fireworks).
      // (When a blessing pick follows, its screen already says "Wave N held!" + a Milestone chip.)
      if (ev.type === "waveClear" && c.chapter.endless && ev.wave % 5 === 0) {
        if (c.phase !== "pick") hud.banner(`Night ${ev.wave} survived!`, "The siege rages on…");
        renderer.celebrate();
      }
      if (ev.type === "waveClear" && waveStartTally.hits === 0) {
        flawlessWaves += 1;
        save.stats.flawlessWaves = (save.stats.flawlessWaves ?? 0) + 1;
      }
      if (ev.type === "specChoice" && !specChoosing) {
        specChoosing = true;
        const plotId = ev.plot;
        hud.showSpecChoice((spec) => {
          if (camp === c) chooseTowerSpec(c, plotId, spec);
          hud.hideOverlay();
          specChoosing = false;
          accumulator = 0;
          last = performance.now();
        });
      }
      if (ev.type === "offers")
        hud.showOffers(
          c,
          {
            kills: c.kills - waveStartTally.kills,
            loot: Math.round(c.goldEarned - waveStartTally.gold),
            hall: Math.round((c.hallHp / c.hallMaxHp) * 100),
            flawless: waveStartTally.hits === 0,
          },
          (id) => {
            if (chooseBlessing(c, id)) {
              hud.hideOverlay();
              const bl = BLESSING_BY_ID[id];
              if (bl) renderer.blessed(c, bl.icon, bl.name, !!bl.requires);
              sfx.dawn();
              if (bl?.requires) hud.banner("COMBO!", `${bl.icon} ${bl.name}`);
              else if (unlockedLabels.length) hud.banner("New building!", `${[...new Set(unlockedLabels)].join(" & ")} unlocked`);
              else hud.banner("☀ Dawn", "Build and upgrade before nightfall");
              unlockedLabels = [];
              // One-time hint (phones never see the desktop notes): the wave preview is tappable.
              if (getItem("lastgate.tipPreview") !== "1") {
                window.setTimeout(() => {
                  if (camp !== c || paused || c.phase !== "build") return; // left the run: try again next time
                  setItem("lastgate.tipPreview", "1");
                  hud.toast("💡 Tap NEXT (top right) to see who's coming");
                }, 1800);
              }
            }
          },
          () => rerollBlessings(c),
          (kind) => {
            if (!chooseBuilding(c, kind)) return false;
            sfx.unlockChime();
            if (c.phase !== "pick") {
              hud.hideOverlay();
              hud.banner("New building!", `${[...new Set(unlockedLabels)].join(" & ")} unlocked`);
              unlockedLabels = [];
            }
            return true;
          },
        );
      if (ev.type === "build" && ev.kind !== "repair") {
        const pm = PRE_MASTERY[ev.kind];
        if (pm !== undefined && ev.level === pm + 1) {
          const NAMES: Record<string, string> = { tower: "Spec Mastery", catapult: "Firestorm", mage: "Storm", spikes: "Iron Maw", barracks: "Veterans", healer: "Sanctum", watch: "Eagle Eye" };
          hud.banner("★ MASTERED!", NAMES[ev.kind] ?? "Mastery");
          sfx.unlockChime();
        }
      }
      if (ev.type === "bloodmoon" && !c.bossNight) hud.banner("🌕 Blood Moon!", "Foes run and strike faster — hold the line", "red");
      if (ev.type === "wallBreak") hud.banner("Breach!", "Enemies are pouring in — repair the wall", "red");
      if (ev.type === "heroDown") hud.banner("You fell!", "You'll rise again at the hall…", "red"); // (the corner chip counts the seconds)
      if ((ev.type === "won" || ev.type === "lost") && c.reverse) finishSiege(c);
      else if (ev.type === "won") finishRun(c, true);
      else if (ev.type === "lost") finishRun(c, false);
    }
    music.intensity = musicIntensity({
      phase: c.phase, wave: c.wave, waves: c.chapter.endless ? 20 : c.chapter.waves.length,
      nightProgress: c.phase === "wave" ? (c.queue.length === 0 ? 1 : Math.min(1, c.waveTime / 60)) : 0,
      hallFrac: c.hallHp / c.hallMaxHp,
    });
    music.boss = c.enemies.some((e) => e.def.boss);
    if (events.length) announceTrophies();
    // Held news comes out once the night is over (at the dawn build phase; the end screen lists it on a loss/win).
    if (heldNews.length && c.phase !== "wave") {
      if (c.phase === "build") flushNews();
      else if (c.phase !== "pick") heldNews = [];
    }
    if (renderer.takeFlawless()) sfx.unlockChime();
    const streakTier = renderer.takeStreakCall();
    if (streakTier) {
      sfx.streak(streakTier);
      buzz(settings, 20 + streakTier * 10);
    }
    renderer.joystick = joyId !== null ? { origin: joyOrigin, knob: { x: joyOrigin.x + joyVec.x * JOY_R, y: joyOrigin.y + joyVec.y * JOY_R } } : null;
    hud.noStars = !!dailyRun;
    if (c.reverse) {
      if (c.phase === "wave" && c.reverse.chest >= REVERSE.cap - 0.01) siegeFullTime += realDt;
      siegeBar.update(c);
      renderer.siegePicked = !!siegeBar.pickedCard && c.phase === "wave";
      renderer.siegeCoach = c.reverse.deployed === 0 && c.phase === "wave";
    }
    else hud.update(c);
    heartbeatTick(c, realDt);
    // One-time hints for the carry chain nobody explains otherwise: log pile → forge → bows → towers.
    if (!c.reverse && (c.phase === "build" || c.phase === "wave")) {
      const forge = c.plots.find((p) => p.kind === "forge" && p.level > 0);
      oneTip("tipLogs", c.lumberPile >= 3 && c.hero.logs === 0, "🪵 Logs are piling up at the Lumber Camp — walk over to pick them up");
      oneTip("tipForgeIn", !!forge && c.hero.logs > 0 && c.forgeLogs === 0 && c.forgeBows === 0, "⚒️ Walk your logs past the Forge to feed it — it turns them into bows");
      oneTip("tipBows", !!forge && c.forgeBows > 0 && c.hero.bows === 0, "🏹 Bows are ready at the Forge — pick them up and walk past your towers (+6% damage each)");
    }
    // (No tutorial tip while the hero is down: "drag to walk" means nothing until he rises.)
    hud.setTip((c.phase === "build" || c.phase === "wave") && !c.hero.dead ? tutorial.update(c, realDt, Math.hypot(move.x, move.y) > 0.2) : null);
    // First run: the first day's sunset waits while the walk / build-a-tower tips are still up.
    if (tutorial.holdsClock && c.phase === "build" && c.wave === 0 && !dailyRun && !c.reverse) c.timer = Math.max(c.timer, 12);
    renderer.guideOverride = tutorial.focus === "income" && c.phase === "build" ? INCOME_PILE : null;
    interp.apply(c, accumulator / STEP);
    renderer.draw(c, realDt);
    interp.restore(c);
  } else if (c) renderer.draw(c, 0);
  else if (siegeBackdrop) renderer.draw(siegeBackdrop, realDt);
  else if (uiRoot.querySelector(".lga, .lgr, .lgw, .lgc, .lgd2, .lgl, .lgf2, .lgb2, .lgm2")) {
    // A full-screen mini-game covers everything: skip the attract camp (it would only cost frames).
  } else {
    // Attract mode: the bot defends a camp behind the menus. On a slow device it updates less often
    // (every 2nd or 4th frame) — it's only a backdrop, and the menus on top should stay smooth.
    attractAcc += realDt;
    // Pacing from the backdrop's own work time (sim + draw), not the frame interval: a 60 Hz screen
    // caps intervals at 16.7 ms, so only the work says whether the device is struggling.
    if (attractWork > 0.02) attractSkip = 4;
    else if (attractWork > 0.01) attractSkip = Math.max(attractSkip, 2);
    else if (attractWork < 0.005) attractSkip = 1;
    attractDt += realDt;
    attractFrame = (attractFrame + 1) % attractSkip;
    if (attractFrame !== 0) {
      requestAnimationFrame(frame);
      return;
    }
    // Catch up at most a short burst of steps (the backdrop doesn't need to be exact); on a slow
    // device the backdrop battle simply plays a little slower rather than stalling the menus.
    attractAcc = Math.min(attractAcc, STEP * (attractSkip > 1 ? 3 : 8));
    const workStart = performance.now();
    while (attractAcc >= STEP) {
      campBotStep(attract);
      attractAcc -= STEP;
    }
    drainEvents(attract);
    if (attract.phase === "won" || attract.phase === "lost") attract = createCamp((Date.now() >>> 0) ^ 0xa77, CHAPTER_BY_ID[1]!);
    if (lastMood !== 1) {
      renderer.setGround(CHAPTER_BY_ID[1]!.ground, 1);
      lastMood = 1;
    }
    renderer.ambient = true;
    renderer.draw(attract, Math.min(0.1, attractDt));
    renderer.ambient = false;
    attractDt = 0;
    attractWork += ((performance.now() - workStart) / 1000 - attractWork) * 0.1;
  }
  requestAnimationFrame(frame);
}

let attract = createCamp(1);
let attractAcc = 0;
/** Attract backdrop pacing: smoothed work time (s) per drawn frame, and draw every Nth frame. */
let attractWork = 0;
let attractSkip = 1;
let attractFrame = 0;
let attractDt = 0;
let lastMood = 1;
hud.setVisible(false);
// The how-to-play title screen is for first launches; returning players go straight to the menu.
if (getItem("lastgate.seenTitle") === "1") hub.showHub(save, "battle");
else
  hud.showTitle(() => {
    setItem("lastgate.seenTitle", "1");
    sfx.unlock();
    hud.hideOverlay();
    // A brand-new player goes straight into chapter 1; the menu can wait until after the first run.
    if (save.runs === 0) newRun(1);
    else hub.showHub(save, "battle");
  });
requestAnimationFrame(frame);

// Offline support when installed to the home screen (production builds only).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
}

// A home-screen app can stay open (suspended) for days, so a new deploy never reached it. When the app
// comes back to the front — or every few minutes while it sits on the menu — check for a newer build
// and reload into it, but only from the menu, never in the middle of a run.
async function checkForUpdate(): Promise<void> {
  if (!import.meta.env.PROD || camp || document.visibilityState !== "visible" || !navigator.onLine) return;
  try {
    const r = await fetch("./version.json", { cache: "no-store" });
    if (!r.ok) return;
    const { id } = (await r.json()) as { id?: string };
    if (!id || id === __BUILD_ID__ || camp) return;
    writeSave(save);
    await navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
    location.reload();
  } catch {
    /* offline or blocked: try again later */
  }
}
document.addEventListener("visibilitychange", () => void checkForUpdate());
window.setInterval(() => void checkForUpdate(), 5 * 60 * 1000);

Object.assign(window, {
  __camp: () => camp,
  __archery: () => archery,
  __supply: () => supply,
  __watch: () => wallWatch,
  __catapult: () => catapult,
  __dragon: () => dragonDodge,
  __lanterns: () => lanterns,
  __forge: () => forge,
  __bells: () => bells,
  __mason: () => mason,
  __renderer: renderer,
  __crisp: crispCache,
  __crispStats: crispStats,
  __atlases: atlasDebug,
  __spawnThief: () => camp && spawnThief(camp),
  // Visual QA: drop an enemy (e.g. a boss) onto the field.
  __spawn: (enemy: string, x?: number, y?: number) => camp && spawnEnemy(camp, { at: 0, enemy: enemy as never, hpMult: 1, lane: 0.5 }, x !== undefined && y !== undefined ? { x, y } : undefined),
  __save: () => save,
  __setSave: (patch: Partial<typeof save>) => {
    Object.assign(save, patch);
    writeSave(save);
    hub.showHub(save);
  },
});
