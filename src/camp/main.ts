import { getItem, setItem } from "../ui/store";
import { Music } from "../audio/music";
import { musicIntensity } from "../audio/intensity";
import { Sfx } from "../audio/sfx";
import { SiegeBar } from "../ui/siegeBar";
import { ArcheryView, rangeReward } from "../mini/archeryView";
import { SupplyView } from "../mini/supplyView";
import { supplyReward } from "../mini/supply";
import { WallWatchView } from "../mini/wallwatchView";
import { watchReward } from "../mini/wallwatch";
import { deploy, SIEGES, siegeStars, type CampSetup } from "./sim";
import { chooseBlessing, chooseTowerSpec, WEATHER_INFO, createCamp, drainEvents, plotCost, plotLogCost, rerollBlessings, spawnEnemy, spawnThief, step, type Camp, type CampEvent, type Vec } from "./sim";
import { CampRenderer } from "./render";
import { BLESSING_BY_ID } from "./blessings";
import { buildStrip, CampHud } from "./hud";
import { INCOME_PILE, STEP, VIEW_H, VIEW_W } from "./world";
import { RenderInterp } from "./interp";
import { crispCache, crispStats } from "./sprites";
import type { GameEvent } from "../core/events";
import { CHAPTER_BY_ID } from "../core/chapters";
import { applyRun, buyPerm, canBuy, chapterUnlocked, ENDLESS_MILESTONE_STEP, endlessMilestoneReward, grantHeroXp, heroUnlocked, MAX_GOLD, newSave, nextEndlessMilestone, PERMS } from "../core/meta";
import { Hub } from "../ui/hub";
import { exportSave, importSave, loadSave, resetSave, SAVE_KEY, writeSave } from "../ui/save";
import { campSetupFromSave, LOOT_TO_GOLD } from "./meta";
import { campBotInput, campBotPick, campBotStep } from "./bot";
import { HERO_BY_ID } from "../core/heroes";
import { learnSkill, resetSkills } from "../core/skills";
import { pushEndlessTop, pushHistory, type RunRecord } from "../core/history";
import { applyEndlessTwist, endlessTwistFor } from "../core/endlessMods";
import { chapterOnDifficulty, DIFF_BY_ID, difficultyOpen, type DifficultyId } from "../core/difficulty";
import { claimQuest, questsReady, questViews, refreshQuests } from "../core/quests";
import { claim, claimable, foeMet } from "../core/achievements";
import { DAILY_BONUS, dailyFor, dailyStreakBonus, recordDailyWin, todayString, type DailyChallenge } from "../core/daily";
import { applyDisplaySettings, buzz, loadSettings, saveSettings } from "../ui/settings";
import { padMove, pollPad } from "./input";
import { Tutorial } from "./tutorial";

const tutorial = new Tutorial();

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLDivElement;
const renderer = new CampRenderer(canvas);
const sfx = new Sfx();
const music = new Music(() => sfx.context, () => sfx.musicOutput);
const settings = loadSettings();
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
  onDifficulty: (id) => {
    save.difficulty = id;
    writeSave(save);
    hub.showHub(save, "battle");
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
  onReset: () => {
    save = resetSave();
    tutorial.reset();
    hub.showHub(save, "battle");
  },
});
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
let joyId: number | null = null;
let joyOrigin: Vec = { x: 0, y: 0 };
let joyVec: Vec = { x: 0, y: 0 };
const keys = new Set<string>();

function toView(ev: PointerEvent): Vec {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * VIEW_W, y: ((ev.clientY - r.top) / r.height) * VIEW_H };
}
canvas.addEventListener("pointerdown", (ev) => {
  if (joyId !== null) return;
  joyId = ev.pointerId;
  canvas.setPointerCapture(ev.pointerId);
  joyOrigin = toView(ev);
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
  joyVec = { x: dx / JOY_R, y: dy / JOY_R };
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

function newRun(id = chapterId, setup = campSetupFromSave(save), seed = (Date.now() >>> 0) ^ 0xca4b, diff: DifficultyId = save.difficulty, weatherOdds?: { rain: number; fog: number; storm: number }) {
  sfx.unlock();
  dailyRun = null;
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
  camp = createCamp(seed, played, setup);
  if (dd.rank > 0) window.setTimeout(() => hud.toast(`${dd.icon} ${dd.name}: ${dd.desc}`), 400);
  renderer.setGround(chapter.ground, chapter.id);
  lastMood = chapter.id;
  hud.endlessBest = chapter.endless ? (save.best[id] ?? 0) : 0;
  hud.twistIcon = chapter.endless ? endlessTwistFor().icon : "";
  knownTrophies = new Set(claimable(save).map((a) => a.id));
  refreshQuests(save);
  nightsThisRun = 0;
  earnedThisRun = [];
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

function startDaily() {
  const d = dailyFor(todayString());
  const setup = campSetupFromSave(save, d.hero);
  setup.mods!.drops *= d.twist.drops;
  setup.mods!.heroDamage *= d.twist.heroDamage;
  setup.mods!.towerDamage *= d.twist.towerDamage;
  setup.enemyHpMult = d.twist.enemyHp;
  if (d.twist.eliteChance) setup.eliteChance = d.twist.eliteChance;
  if (d.twist.wallHp) setup.mods!.wallHp *= d.twist.wallHp;
  if (d.twist.tideEvery) setup.tideEvery = d.twist.tideEvery;
  setup.startBlessings = [d.blessing];
  setup.classicBlessings = true;
  newRun(d.chapterId, setup, d.seed, "normal", d.twist.weatherOdds);
  dailyRun = d;
  // Remind the player what makes today's run different.
  hud.banner(`Daily: ${d.twist.name}`, d.twist.desc);
}

type ToggleKey = "music" | "sfx" | "shake" | "haptics" | "calm" | "bigText";

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

// ---- Archery Range (side stop on the map). ----
const archery = new ArcheryView(
  uiRoot,
  (score) => {
    const prev = save.mini.archery ?? { best: 0, stars: 0 };
    const r = rangeReward(score, prev.stars);
    save.mini.archery = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, r.stars) };
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars };
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
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars };
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
    save.gold = Math.min(MAX_GOLD, save.gold + r.gold);
    save.stats.goldEarned = (save.stats.goldEarned ?? 0) + r.gold;
    writeSave(save);
    return { score, stars: r.stars, gold: r.gold, newStars: r.newStars };
  },
  () => hub.showHub(save, "battle"),
  (kind) => sfx.mini(kind),
);

// ---- Siege Lord (reverse mode): the player sends the horde; the campaign bot defends the castle. ----
const siegeBar = new SiegeBar(
  uiRoot,
  (id, lane) => {
    if (camp?.reverse && deploy(camp, id as never, lane)) sfx.warDrums();
  },
  () => setPaused(true),
);
let siegeIdx = 0;

function startSiege(i: number) {
  const s = SIEGES[i];
  if (!s) return;
  sfx.unlock();
  dailyRun = null;
  siegeIdx = i;
  // The defenders: a castle with this siege's upgrades and hero, played by the bot.
  const def = newSave();
  for (const p of PERMS) if (!p.capstone) def.perms[p.id] = Math.min(p.max, s.perm);
  const won = SIEGES.filter((_, k) => (save.mini[`siege${k + 1}`]?.stars ?? 0) > 0).length;
  const setup: CampSetup = { ...campSetupFromSave(def, s.hero), reverse: true, siegesWon: won };
  const chapter = CHAPTER_BY_ID[s.chapter]!;
  camp = createCamp((Date.now() >>> 0) ^ 0x5e9e, chapter, setup);
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
  music.start();
  window.setTimeout(() => hud.toast("⚔️ Tap a unit card, then a lane to send them in. Take the hall!"), 600);
}

function finishSiege(c: Camp, retreat = false) {
  const r = c.reverse!;
  const won = !retreat && r.result === "win";
  const stars = won ? siegeStars(c.wave) : 0;
  const key = `siege${siegeIdx + 1}`;
  const prev = save.mini[key] ?? { best: 0, stars: 0 };
  const bonus = [0, 60, 120, 200].slice(prev.stars + 1, stars + 1).reduce((a, b) => a + b, 0);
  const gold = (won ? 100 * (siegeIdx + 1) : 20) + r.broken * 5 + bonus;
  save.mini[key] = { best: Math.max(prev.best, stars), stars: Math.max(prev.stars, stars) };
  save.gold = Math.min(MAX_GOLD, save.gold + gold);
  save.stats.goldEarned = (save.stats.goldEarned ?? 0) + gold;
  writeSave(save);
  camp = null;
  paused = false;
  siegeBar.show(false);
  hud.showMessage(
    won ? `🏴 The hall has fallen!` : retreat ? "You withdrew" : "The castle held",
    won ? `Taken on push ${c.wave} · ${"★".repeat(stars)}${"☆".repeat(3 - stars)} · +${gold} gold` : `${r.broken} wall section${r.broken === 1 ? "" : "s"} broken · +${gold} gold`,
    "Back to the map",
    () => {
      hud.hideOverlay();
      goHub();
    },
    won ? "title" : "title",
  );
}

function goHub(tab: "battle" | "armory" = "battle") {
  siegeBar.show(false);
  camp = null;
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
    }, buildStrip(camp!.owned), dailyRun ? `🎯 Daily: ${dailyRun.twist.name} — ${dailyRun.twist.desc}` : undefined, pauseStatus(camp!));
  else hub.hide();
}

/** Where the run stands, for the pause panel: chapter, wave, kills, time. */
function pauseStatus(c: Camp): string[] {
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
  if ((s.flares ?? 0) >= 2) return "The blood moon flared and the horde ran wild. When the field turns red, fall back near the hall (its archers hit harder) and save your ability for the rush.";
  if ((s.burnTime ?? 0) > 25) return "Fire Imps kept your buildings burning. Walk onto a burning building to stamp the fire out — and shoot imps down early.";
  if ((s.stuns ?? 0) >= 6) return "War Ravens stunned your towers again and again. Upgrade towers so they shoot ravens down first, or build a Mage Tower.";
  if ((s.tunnelers ?? 0) >= 5 && !built("barracks")) return "Tunnelers dug under the wall. A Barracks (and the King) inside the camp catch them as they surface.";
  if (s.flyerHallDamage > c.hallMaxHp * 0.3) return "Bats fly over the wall. Upgrade the Hall (stronger hall archers) and fight near it when flyers come.";
  if (s.breaches >= 3 && !built("fortify")) return "The wall kept breaking. Fortify it into stone, and stand on Repair Wall during the day.";
  if (s.breaches >= 3 && !built("barracks")) return "Build a Barracks — its soldiers hold breaches while you repair.";
  if (s.heroDeaths >= 2) return "Your hero fell often. Fight from behind the wall, or take Vigor / the Knight Captain.";
  // Barely touched the hero's ability (it recharges every ~20 s, so a night has room for 2–3).
  if (c.wave >= 3 && (s.casts ?? 0) < c.wave) {
    const ab = Object.values(HERO_BY_ID).find((h) => h.ability === c.ability);
    if (ab) return `${ab.abilityName} recharges fast — tap it whenever foes bunch up. You used it ${s.casts ?? 0} time${s.casts === 1 ? "" : "s"} in ${c.wave} nights.`;
  }
  if (!built("lumber")) return "Build the Lumber Camp early: logs unlock tower levels 3–4 and stone walls.";
  if (c.plots.filter((p) => p.kind === "tower" && p.level >= 3).length < 2) return "Push a couple of towers to level 3+ — they're your main damage.";
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
  if (won) save.stats[`won_${heroId}`] = 1;
  nightsThisRun = 0;
  if (dailyRun) return finishDaily(c, won, abandoned, dailyRun, rec);
  const prevBest = save.best[c.chapter.id] ?? 0;
  // Abandoned between waves (build phase): wave N is held, so it counts like falling on wave N+1.
  const waveReached = !won && c.phase === "build" ? c.wave + 1 : c.wave;
  const reward = applyRun(save, { chapter: c.chapter.id, won, wave: waveReached, gateFrac: c.hallHp / c.hallMaxHp, goldFromKills: Math.round(c.goldEarned * LOOT_TO_GOLD), difficulty: runDifficulty });
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
  if (c.phase !== "wave" || frac >= 0.3 || frac <= 0) {
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
function announceTrophies(): void {
  for (const v of questViews(save)) {
    if (!v.done || knownQuests.has(v.slot.id)) continue;
    knownQuests.add(v.slot.id);
    earnedThisRun.push(`📜 ${v.def.desc}`);
    hud.toast(`📜 Quest complete: ${v.def.desc}`);
    sfx.unlockChime();
  }
  for (const a of claimable(save)) {
    if (knownTrophies.has(a.id)) continue;
    knownTrophies.add(a.id);
    earnedThisRun.push(`🏆 ${a.name}`);
    hud.toast(`🏆 Trophy unlocked: ${a.name}`);
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
  } else if (ev.type === "boom" && ev.kind === "snare" && ev.n) add("snared", ev.n);
  else if (ev.type === "lance" && ev.n) add("lanced", ev.n);
  else if (ev.type === "sanctuary") add("sanctified", ev.healed);
  else if (ev.type === "fireOut") add("firesOut");
}

function playSfx(ev: CampEvent, c: Camp) {
  // Newer event types: synthesised in sfx.event (rate-limited there), plus a buzz for the big hits.
  switch (ev.type) {
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
    case "lost":
      if (ev.type === "won") sfx.fanfare(c.chapter.id);
      else sfx.play(ev as unknown as GameEvent);
      if (ev.type === "bossSpawn") buzz(settings, 80);
      if (ev.type === "won") buzz(settings, 150);
      break;

    default:
      break;
  }
}

function frame(now: number) {
  pollPad(onKey, () => (camp?.phase === "build" || camp?.phase === "wave") && !paused, camp?.phase === "pick");
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (document.visibilityState === "visible" && !paused) renderer.perfSample(realDt);
  const dt = (renderer.fx.slowmo > 0 && !settings.calm ? realDt * 0.3 : realDt) * gameSpeed;
  const c = camp;
  if (c && !paused && !specChoosing) {
    accumulator += dt;
    // Debug autoplay (window.__autoplay = true): the bot drives the hero, for visual QA runs.
    const auto = (window as unknown as { __autoplay?: boolean }).__autoplay;
    const move = auto ? campBotInput(c).move : moveInput();
    if (auto && c.phase === "pick" && !(window as unknown as { __noAutoPick?: boolean }).__noAutoPick) {
      chooseBlessing(c, campBotPick(c));
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
        if (ev.type === "wallBreak") hud.toast("🧱 Wall breached! +10 gold to the War Chest");
        continue;
      }
      // First kill of a foe kind: it joins the Bestiary (bosses get their own banner already).
      const newFoe = ev.type === "kill" && !ev.enemy.boss && !foeMet(save, ev.enemy.id) ? ev.enemy.name : null;
      trackStats(ev);
      if (newFoe) hud.toast(`📖 New in the Bestiary: ${newFoe}`);
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
        window.setTimeout(() => hud.toast(`${w.icon} ${w.name} tonight — ${w.desc}`), 1600);
      }
      if (ev.type === "waveStart")
        hud.banner(
          !c.chapter.endless && ev.wave === c.chapter.waves.length ? "🌙 FINAL NIGHT" : ev.boss ? `🌙 Night ${ev.wave} — Boss!` : `🌙 Night ${ev.wave}`,
          ev.boss ?? (ev.intro ? `New enemy: ${ev.intro}` : "The horde comes in the dark"),
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
        );
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
    if (renderer.takeFlawless()) sfx.unlockChime();
    const streakTier = renderer.takeStreakCall();
    if (streakTier) {
      sfx.streak(streakTier);
      buzz(settings, 20 + streakTier * 10);
    }
    renderer.joystick = joyId !== null ? { origin: joyOrigin, knob: { x: joyOrigin.x + joyVec.x * JOY_R, y: joyOrigin.y + joyVec.y * JOY_R } } : null;
    hud.noStars = !!dailyRun;
    if (c.reverse) siegeBar.update(c);
    else hud.update(c);
    heartbeatTick(c, realDt);
    hud.setTip(c.phase === "build" || c.phase === "wave" ? tutorial.update(c, realDt, Math.hypot(move.x, move.y) > 0.2) : null);
    renderer.guideOverride = tutorial.focus === "income" && c.phase === "build" ? INCOME_PILE : null;
    interp.apply(c, accumulator / STEP);
    renderer.draw(c, realDt);
    interp.restore(c);
  } else if (c) renderer.draw(c, 0);
  else {
    // Attract mode: the bot defends a camp behind the menus.
    attractAcc += realDt;
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
    renderer.draw(attract, realDt);
    renderer.ambient = false;
  }
  requestAnimationFrame(frame);
}

let attract = createCamp(1);
let attractAcc = 0;
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
  __renderer: renderer,
  __crisp: crispCache,
  __crispStats: crispStats,
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
