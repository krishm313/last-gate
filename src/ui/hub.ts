import { GIFT_GOLD, giftView } from "../core/gift";
import { DAILY_SIEGE_PRIZE, dailySiegeFor, dailySiegeOpen } from "../core/dailySiege";
import { fairPick, openMinis } from "../mini/fair";
import { SIDE_GAMES_ENABLED } from "../core/features";
import { getJson, removeItem, setItem } from "./store";
import { HINT_FLAGS } from "./save";
import { canVibrate, QUALITIES, type Quality } from "./settings";
import { nextGoals } from "../core/goals";
import { mastered, masteryGoals, masteryPerk } from "../core/mastery";
import { cleanHeat, HEAT_BY_ID, HEATS, heatGold } from "../core/heat";
import { WEEKLY, weeklyFor } from "../core/weekly";
import { exportSave, importSave } from "./save";
import { canPromptInstall, needsIosHint, promptInstall } from "./install";
import { CHAPTER_BY_ID, CHAPTERS, ENDLESS, BOSS_RUSH } from "../core/chapters";
import { DAILY_BONUS, dailyFor, dailyStreakBonus, liveDailyStreak, timeToNextDaily, todayString } from "../core/daily";
import { BLESSING_BY_ID } from "../camp/blessings";
import { ENEMIES, enemyTraits } from "../core/enemies";
import { SIEGES, WAR_CARDS } from "../camp/sim";
import { CARD_NAME } from "./siegeBar";
import { ACHIEVEMENTS, claimable, foeMet, foesMet, heroHasWon } from "../core/achievements";
import { canLearn, freePoints, nextSkillThreshold, SKILL_BRANCHES, SKILL_THRESHOLDS, SKILLS } from "../core/skills";
import { historySummary, weekSummary } from "../core/history";
import { weekNumber } from "../core/quests";
import { endlessSceneryFor, endlessTwistFor } from "../core/endlessMods";
import { activeFlair, FLAIRS } from "../core/flair";
import { DIFF_BY_ID, DIFFICULTIES, difficultyOpen, type DifficultyId } from "../core/difficulty";
import { questsReady, questViews, refreshQuests } from "../core/quests";
import { HERO_BY_ID, HEROES, VET_NIGHTS, vetLookOn, vetLookOpen, type HeroId } from "../core/heroes";
import { ASCEND, canAscend, canBuy, permOpen, chapterUnlocked, endlessMilestoneReward, nextEndlessMilestone, heroUnlocked, PERMS, permCost, totalStars, type RunReward, type SaveData } from "../core/meta";
import { CAMP_HEROES } from "../camp/meta";

/** Painted portraits cut from the owner's character sheet. */
const HERO_PORTRAIT: Record<string, string> = {
  ranger: "./sprites/portraits/king.png",
  knight: "./sprites/portraits/knight.png",
  pyro: "./sprites/portraits/pyro.png",
  engineer: "./sprites/portraits/engineer.png",
  warden: "./sprites/portraits/huntress.png",
  lancer: "./sprites/portraits/lancer.png",
  cleric: "./sprites/portraits/cleric.png",
  marshal: "./sprites/portraits/marshal.png",
  alchemist: "./sprites/portraits/alchemist.png",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const DMG_LABEL: Record<string, [string, string]> = {
  towers: ["🏹", "Archer towers"], hero: ["🗡️", "Your hero"], catapults: ["🪨", "Catapults"], soldiers: ["⚔️", "Soldiers"],
  mage: ["🔮", "Mage Tower"], fire: ["🔥", "Burning"], spikes: ["🪤", "Spike trap"], storm: ["⚡", "Lightning"], lava: ["🌋", "Lava"], thorns: ["🌵", "Thorn walls"],
};
/** "Who did the work": the top three damage sources of a run with their share. */
function damageBreakdown(dmg?: Record<string, number>): HTMLElement | null {
  if (!dmg) return null;
  const total = Object.values(dmg).reduce((a, b) => a + b, 0);
  if (total < 50) return null;
  const top = Object.entries(dmg).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const box = el("div", "lgm-box");
  box.append(el("div", "lgm-title", "Damage dealt"));
  for (const [k, v] of top) {
    const [icon, name] = DMG_LABEL[k] ?? ["•", k];
    const pct = Math.round((v / total) * 100);
    const row = el("div", "lgm-row");
    const bar = el("div", "lgm-bar");
    const fill = el("i", "");
    fill.style.width = `${pct}%`;
    bar.append(fill);
    row.append(el("span", "lgm-name", `${icon} ${name}`), bar, el("span", "lgm-pct", `${pct}%`));
    box.append(row);
  }
  return box;
}

/** Settings rows (Vibration only where the device supports it — not on iPhone). */
function settingLabels(): Record<string, string> {
  const l: Record<string, string> = { music: "🎵 Music", sfx: "🔔 Sound effects", shake: "📳 Screen shake", calm: "🌙 Reduced motion", bigText: "🔠 Large text" };
  if (canVibrate) l.haptics = "📱 Vibration";
  l.fps = "📈 Show FPS";
  return l;
}

export interface HubCallbacks {
  onClick: () => void;
  onDaily: () => void;
  /** Open the Archery Range side stop. */
  onArchery?: () => void;
  /** Open the Supply Run side stop. */
  onSupply?: () => void;
  /** Open the Wall Watch side stop. */
  onWatch?: () => void;
  /** Open the Catapult Toss side stop. */
  onCatapult?: () => void;
  /** Open the Dragon Dodge side stop. */
  onDragon?: () => void;
  /** Open the Ghost Lanterns side stop. */
  onLanterns?: () => void;
  /** Open the Royal Forge side stop. */
  onForge?: () => void;
  /** Open the Bell Tower side stop. */
  onBells?: () => void;
  /** Open the Mason's Tower side stop. */
  onMason?: () => void;
  /** Siege Lord: start siege i (0-based). */
  onSiege?: (i: number) => void;
  onPlay: (chapter: number) => void;
  onSelectHero: (id: HeroId) => void;
  onBuy: (permId: string) => void;
  /** Ascend: reset the maxed Armory for a Crown. */
  onAscend?: () => void;
  onReset: () => void;
  onClaim: (id: string) => void;
  /** Learn / reset a hero skill (Heroes tab). */
  onLearnSkill?: (hero: HeroId, id: string) => void;
  onResetSkills?: (hero: HeroId) => void;
  /** Toggled a hero's Veteran look. */
  onHeroLook?: (hero: HeroId, on: boolean) => void;
  /** Start this week's Weekly Gauntlet. */
  onWeekly?: () => void;
  /** Heat toggles changed (save.heat already updated; persist it). */
  onHeat?: () => void;
  /** Bought a Royal Bazaar flair. */
  onBuyFlair?: (id: string) => void;
  /** Picked a cosmetic hero flair. */
  onFlair?: (id: string) => void;
  /** Picked a campaign difficulty. */
  onDifficulty?: (id: DifficultyId) => void;
  /** Opened today's Royal Gift chest (Battle tab); returns the gold it held. */
  onGift?: () => number;
  /** Claimed a finished daily / weekly quest. */
  onClaimQuest: (id: string) => void;
  /** New quests were handed out (the save should be written). */
  onQuestsChanged?: () => void;
  onSettings: () => void;
  /** Tapped something locked or unaffordable (plays a soft "nope"). */
  onDenied?: () => void;
}

export interface RunSummary {
  won: boolean;
  /** Armory upgrades affordable right after this run (badge on the Upgrades button). */
  upgradesReady?: number;
  /** Finished quests waiting on the Trophies tab. */
  questsReady?: number;
  /** Damage dealt per source this run (towers, hero, mage…) for the breakdown. */
  dmg?: Record<string, number>;
  /** Trophies unlocked / quests completed during the run. */
  earned?: string[];
  /** Skill points the run's hero just earned. */
  skillPoints?: { hero: string; n: number };
  /** Hall HP left at the end, 0..100 (for the "next star" hint). */
  hallPct?: number;
  chapterName: string;
  chapterId: number;
  wave: number;
  kills: number;
  coins: number;
  minutes: number;
  endless?: boolean;
  record?: boolean;
  daily?: boolean;
  heroLevel?: number;
  bosses?: number;
  streak?: number;
  /** The streak above is a new lifetime best. */
  streakIsBest?: boolean;
  flawless?: number;
  /** Daily streak reached by this (first) daily clear. */
  dailyStreak?: number;
  tip?: string;
}

type Tab = "battle" | "heroes" | "armory" | "trophies";

/** Menu screens: hub (Battle / Heroes / Armory), end-of-run rewards, pause. */
export class Hub {
  readonly overlay = el("div", "overlay hub-overlay");
  private tab: Tab = "battle";
  private justLearned: string | null = null;
  private renderedTab: Tab | null = null;
  /** Perm just bought (and what it cost), celebrated on the next render. */
  private justBought: { id: string; cost: number } | null = null;
  /** Trophy just claimed (and its reward), celebrated on the next render. */
  /** Trophies tab: whether the claimed section is open. */
  private showClaimed = false;
  /** Set while a side game opened from the Fair sheet is running. */
  private backToFair = false;
  private justClaimed: { id: string; reward: number } | null = null;
  /** Hero just picked, celebrated on the next render. */
  private justPicked: string | null = null;
  /** Live volume control for the settings screens (set by the game). */
  volume: { get: (k: "music" | "sfx") => number; set: (k: "music" | "sfx", v: number) => void } | null = null;
  /** Graphics quality row (Settings + pause): current value and a setter. */
  quality: { get: () => Quality; set: (q: Quality) => void } | null = null;

  constructor(root: HTMLElement, private cb: HubCallbacks) {
    root.append(this.overlay);
  }

  private button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = el("button", cls, text);
    b.onclick = () => {
      this.cb.onClick();
      onClick();
    };
    return b;
  }

  private denied(node: HTMLElement): void {
    this.cb.onDenied?.();
    nope(node);
  }

  private show(content: HTMLElement): void {
    this.overlay.replaceChildren(content);
    this.overlay.style.display = "flex";
    // Panels (pause, end, settings) sit where toasts drop in: the CSS moves toasts to the bottom meanwhile.
    document.body.classList.toggle("panel-open", content.classList.contains("panel"));
  }

  hide(): void {
    this.overlay.style.display = "none";
    document.body.classList.remove("panel-open");
  }

  get visible(): boolean {
    return this.overlay.style.display === "flex";
  }

  /** True while the main map/tabs screen (not a sub-panel) is showing. */
  get onHubScreen(): boolean {
    return this.visible && !!this.overlay.querySelector(".hub");
  }

  showHub(save: SaveData, tab: Tab = this.tab): void {
    // A side game started from the Fair sheet goes back to the sheet when it's left.
    if (this.backToFair && tab === "battle") {
      this.backToFair = false;
      this.tab = tab;
      return this.fairSheet(save);
    }
    this.tab = tab;
    if (refreshQuests(save)) this.cb.onQuestsChanged?.();
    const wrap = el("div", "hub");
    const head = el("div", "hub-head");
    const titleRow = el("div", "hub-title-row");
    titleRow.append(el("h1", "title", "Last Gate"), Object.assign(this.button("⚙", "gear-btn", () => this.cb.onSettings()), { title: "Settings", ariaLabel: "Settings" }));
    head.append(titleRow);
    const res = el("div", "hub-res");
    res.append(el("span", `res-gold${this.justBought || this.justClaimed ? " spent" : ""}`, `● ${fmtGold(save.gold)}`), el("span", "res-stars", `${save.crowns ? `👑 ${save.crowns} · ` : ""}★ ${totalStars(save)}/${CHAPTERS.length * 3} · 🏆 ${save.claimed.length}/${ACHIEVEMENTS.length}`));
    head.append(res);
    wrap.append(head);
    const tabs = el("div", "tabs");
    const ready = claimable(save).length + questsReady(save);
    for (const [id, label] of [["battle", "⚔️"], ["heroes", "🛡️"], ["armory", "🔨"], ["trophies", "🏆"]] as const) {
      const names = { battle: "Battle", heroes: "Heroes", armory: "Armory", trophies: "Trophies" };
      const t = this.button(`${label} ${names[id]}`, `tab${id === tab ? " active" : ""}`, () => this.showHub(save, id));
      if (id === tab) t.setAttribute("aria-current", "page");
      // Badges read as "Trophies, 2 ready" rather than a bare number.
      const extra = id === "trophies" && ready ? `, ${ready} to claim` : "";
      if (id === "trophies" && ready) t.append(el("span", "tab-badge", String(ready)));
      const affordable = PERMS.filter((p) => canBuy(save, p.id)).length;
      if (id === "armory" && affordable) t.append(el("span", "tab-badge", String(affordable)));
      if (id === "battle" && tab !== "battle" && (save.stars[1] ?? 0) > 0 && giftView(save.stats, todayString()).ready) t.append(el("span", "tab-badge", "🎁"));
      if (id === "heroes" && freshHeroes(save).length) t.append(el("span", "tab-badge", "NEW"));
      else if (id === "heroes" && HEROES.some((h) => heroUnlocked(save, h.id) && freePoints(save.heroes[h.id]) > 0)) t.append(el("span", "tab-badge", "⭐"));
      t.setAttribute("aria-label", `${names[id]}${extra}${id === "armory" && affordable ? `, ${affordable} affordable` : ""}`);
      tabs.append(t);
    }
    wrap.append(tabs);
    this.coachmark(wrap, tabs, save, tab);
    const claimedNow = !!this.justClaimed, boughtNow = !!this.justBought;
    // Slide the content in only when the tab actually changes (not on re-renders after a purchase).
    const tabChanged = tab !== this.renderedTab;
    const body = el("div", `hub-body${tabChanged ? " tab-in" : ""}`);
    this.renderedTab = tab;
    if (tab === "battle") this.battleTab(body, save);
    else if (tab === "heroes") this.heroesTab(body, save);
    else if (tab === "trophies") this.trophiesTab(body, save);
    else this.armoryTab(body, save);
    // Entrance stagger for the other tabs' cards (the chapter list sets its own --i).
    body.querySelectorAll<HTMLElement>(".hero, .perm, .trophy").forEach((e, i) => e.style.setProperty("--i", String(Math.min(i, 10))));
    wrap.append(body);
    this.show(wrap);
    // Opening Heroes with a later hero picked: bring their card (and skill tree) into view.
    const picked = tabChanged && tab === "heroes" ? body.querySelector<HTMLElement>(".hero.selected") : null;
    if (picked && picked !== body.querySelector(".hero")) requestAnimationFrame(() => scrollToLayout(picked));
    // A gift opened on the Battle tab: keep it in view (the map would otherwise jump to the next stop).
    const giftEl = wrap.querySelector<HTMLElement>(".lgift.opened");
    if (giftEl) requestAnimationFrame(() => scrollToLayout(wrap));
    if (claimedNow) requestAnimationFrame(() => flyCoins(wrap, ".trophy.just, .lgift.opened", ".res-gold", true));
    else if (boughtNow) requestAnimationFrame(() => flyCoins(wrap, ".res-gold", ".perm.just", false));
  }

  /** "Next goals": the three nearest concrete targets (stars, trophies, skill point, Endless), tap to go. */
  private goalsCard(save: SaveData): HTMLElement {
    const box = el("div", "lgg-card");
    box.append(el("div", "lgg-head", "🎯 Next goals"));
    const goals = nextGoals(save);
    if (!goals.length) box.append(el("div", "lgg-done", "Every goal complete — legendary!"));
    for (const g of goals) {
      const row = el("button", "lgg-row");
      const bar = el("div", "lgg-bar");
      const fill = el("i", "");
      fill.style.width = `${Math.round(g.progress * 100)}%`;
      bar.append(fill);
      const mid = el("div", "lgg-mid");
      mid.append(el("div", "lgg-text", g.text), bar);
      const right = el("div", "lgg-right");
      right.append(el("div", "lgg-label", g.label));
      if (g.reward) right.append(el("div", "lgg-reward", `● ${g.reward}`));
      row.append(el("div", "lgg-icon", g.icon), mid, right);
      row.onclick = () => {
        this.cb.onClick();
        if (g.action.kind === "chapter") this.cb.onPlay(g.action.id);
        else this.showHub(save, g.action.tab);
      };
      box.append(row);
    }
    return box;
  }

  private battleTab(body: HTMLElement, save: SaveData): void {
    body.append(el("div", "hub-hint", `Hero: ${HERO_BY_ID[save.hero].name} — pick a battlefield`));
    const news = this.newsCard(save);
    if (news) body.append(news);
    if ((save.stars[1] ?? 0) > 0) {
      const gift = this.giftCard(save);
      if (gift) body.append(gift);
      body.append(this.dailyCard(save));
      if ((save.stars[3] ?? 0) > 0) body.append(this.weeklyCard(save));
      body.append(this.goalsCard(save));
    }
    // Campaign difficulty, once a chapter has been cleared.
    const diff = DIFF_BY_ID[save.difficulty];
    if ((save.stars[1] ?? 0) > 0) {
      const seg = el("div", "lgd-seg");
      for (const d of DIFFICULTIES) {
        const any = CHAPTERS.some((ch) => difficultyOpen(d.id, (save.stars[ch.id] ?? 0) > 0, save.diffCleared[ch.id] ?? 0));
        const b = this.button(`${d.icon} ${d.name}`, `lgd-opt lgd-${d.id}${d.id === diff.id ? " on" : ""}${any ? "" : " locked"}`, () => {
          if (!any) return this.denied(b);
          if (d.id !== diff.id) this.cb.onDifficulty?.(d.id);
        });
        seg.append(b);
      }
      body.append(seg, el("div", "lgd-desc", diff.desc));
    }
    // Chapters unlocked since the player last saw this list get a one-time reveal.
    const seenKey = "lastgate.seenChapters";
    // No record yet (fresh install or an older save): treat what's open now as already seen.
    const stored = getJson<unknown>(seenKey, null);
    const seen = new Set<number>(Array.isArray(stored) ? (stored as number[]) : [...CHAPTERS, ENDLESS].filter((ch) => chapterUnlocked(save, ch.id)).map((ch) => ch.id));
    const nowOpen: number[] = CHAPTERS.filter((ch) => chapterUnlocked(save, ch.id)).map((ch) => ch.id);
    const map = this.campaignMap(save, diff, seen);
    body.append(map);
    // Endless mode card.
    const open = chapterUnlocked(save, ENDLESS.id);
    const card = el("button", `chapter endless${open ? "" : " locked"}`);
    if (open) {
      nowOpen.push(ENDLESS.id);
      if (!seen.has(ENDLESS.id)) {
        card.classList.add("fresh");
        card.append(el("div", "ch-fresh", "🔓 NEW!"));
      }
    }
    const rushOpen = chapterUnlocked(save, BOSS_RUSH.id);
    const rushFresh = rushOpen && !seen.has(BOSS_RUSH.id);
    if (rushOpen) nowOpen.push(BOSS_RUSH.id);
    setItem(seenKey, JSON.stringify(nowOpen));
    card.style.setProperty("--g1", "#5a2a6a");
    card.style.setProperty("--g2", "#3a1a4a");
    const left = el("div", "ch-left");
    left.append(el("div", "ch-num", "Endless"), el("div", "ch-name", ENDLESS.name), el("div", "ch-blurb", open ? ENDLESS.blurb : "Clear chapter 1 to unlock"));
    if (open) left.append(el("div", "ch-affix", ENDLESS.affixes.join(" · ")));
    if (open) {
      const sc = CHAPTER_BY_ID[endlessSceneryFor(todayString(), Object.keys(save.stars).map(Number).filter((k) => k <= 10 && (save.stars[k] ?? 0) > 0))];
      if (sc) left.append(el("div", "ch-affix", `🗺️ This week's battlefield: ${sc.name}`));
    }
    if (open) {
      const t = endlessTwistFor();
      left.append(el("div", "ch-boss lge-twist", `${t.icon} This week: ${t.name} — ${t.desc}`));
    }
    const right = el("div", "ch-right");
    right.append(el("div", "ch-stars", open ? "♾️" : "🔒"));
    if (save.best[ENDLESS.id]) right.append(el("div", "ch-best", `Record: night ${save.best[ENDLESS.id]}`));
    if (open) {
      const m = nextEndlessMilestone(save);
      left.append(el("div", "ch-boss lge-next", `🎯 Next milestone: night ${m} · ● ${endlessMilestoneReward(m)}`));
    }
    if (open) right.append(el("div", "ch-play", "PLAY ▶"));
    card.append(left, right);
    if (open)
      card.onclick = () => {
        this.cb.onClick();
        this.cb.onPlay(ENDLESS.id);
      };
    else card.onclick = () => this.denied(card);
    // The extra modes sit above the map as one compact row of tiles (each opens its full card), so
    // the campaign map is reached quickly even on a small phone.
    const rushCard = this.bossRushCard(save, rushFresh);
    const siegeOpen = (save.stars[1] ?? 0) > 0;
    const siegeTotal = SIEGES.reduce((a, _, i) => a + (save.mini[`siege${i + 1}`]?.stars ?? 0), 0);
    const rushStars = save.stars[BOSS_RUSH.id] ?? 0;
    const tiles: { cls: string; icon: string; name: string; sub: string; open: boolean; fresh: boolean; go: () => void }[] = [
      { cls: "siege", icon: "⚔️", name: "Siege Lord", sub: !siegeOpen ? "Clear ch. 1" : (save.mini.siege1?.stars ?? 0) > 0 && dailySiegeOpen(save.stats, todayString()) ? "🗓️ Daily open" : `★ ${siegeTotal}/${SIEGES.length * 3}`, open: siegeOpen, fresh: false, go: () => this.siegeSheet(save) },
      { cls: "endless", icon: "♾️", name: "Endless", sub: open ? (save.best[ENDLESS.id] ? `Night ${save.best[ENDLESS.id]} · ${endlessTwistFor().icon}` : `${endlessTwistFor().icon} This week`) : "Clear ch. 1", open, fresh: open && !seen.has(ENDLESS.id), go: () => this.modeSheet(save, card, true) },
...(SIDE_GAMES_ENABLED ? [{ cls: "fair", icon: "🎪", name: "Fair", sub: `${openMinis(save.stars).length ? `★ ${Object.entries(save.mini).reduce((a, [k, m]) => a + (k.startsWith("siege") ? 0 : m.stars), 0)}/${this.sideGames().length * 3}` : "Clear ch. 1"}`, open: openMinis(save.stars).length > 0, fresh: false, go: () => this.fairSheet(save) }] : []),
      { cls: "rush", icon: "👑", name: "Boss Rush", sub: rushOpen ? (rushStars ? "★".repeat(rushStars) + "☆".repeat(3 - rushStars) : "10 bosses") : "Clear ch. 5", open: rushOpen, fresh: rushFresh, go: () => this.modeSheet(save, rushCard) },
    ];
    const row = el("div", "lgmodes");
    row.style.gridTemplateColumns = `repeat(${tiles.length}, 1fr)`;
    for (const t of tiles) {
      const b = el("button", `lgmode lgmode-${t.cls}${t.open ? "" : " locked"}`);
      b.append(el("div", "lgmode-icon", t.open ? t.icon : "🔒"), el("div", "lgmode-name", t.name), el("div", "lgmode-sub", t.sub));
      if (t.fresh) b.append(el("div", "lgmode-new", "NEW!"));
      b.onclick = () => {
        if (!t.open) return this.denied(b);
        this.cb.onClick();
        t.go();
      };
      row.append(b);
    }
    body.insertBefore(row, map);
    body.append(el("div", "hub-foot", `Runs: ${save.runs} · Victories: ${save.wins}`));
  }

  /**
   * Campaign map: a winding road from chapter 1 (bottom) to the final chapter (top). Cleared stops
   * fly a flag with their stars, the next one glows, and the road beyond lies under fog — names,
   * bosses and details stay hidden until the chapter before is cleared. Tap a stop for its card.
   */
  private campaignMap(save: SaveData, diff: (typeof DIFFICULTIES)[number], seen: Set<number>): HTMLElement {
    const n = CHAPTERS.length;
    const map = el("div", "lgm-map");
    map.style.setProperty("--n", String(n));
    // Zig-zag stops (x in % of the width), bottom (chapter 1) to top (final chapter).
    const xs = CHAPTERS.map((_, i) => (i === n - 1 ? 50 : [50, 24, 70, 32, 74, 28, 68, 36, 64][i % 9]!));
    // Ground bands per chapter, so the land changes as the road climbs.
    const bands = el("div", "lgm-bands");
    for (const ch of [...CHAPTERS].reverse()) {
      const b = el("div", `lgm-band${chapterUnlocked(save, ch.id) ? "" : " fog"}`);
      b.style.setProperty("--g1", ch.ground[0]);
      b.style.setProperty("--g2", ch.ground[1]);
      bands.append(b);
    }
    map.append(bands);
    // The road: a smooth curve through every stop (drawn in a 100 × n*10 box, stretched to fit).
    const H = n * 10;
    const pt = (i: number) => [xs[i]!, H - (i * 10 + 5)] as const;
    let d = `M ${pt(0)[0]} ${H}`;
    d += ` L ${pt(0)[0]} ${pt(0)[1]}`;
    for (let i = 1; i < n; i++) {
      const [x0, y0] = pt(i - 1);
      const [x1, y1] = pt(i);
      d += ` C ${x0} ${y0 - 5}, ${x1} ${y1 + 5}, ${x1} ${y1}`;
    }
    const cleared = CHAPTERS.filter((ch) => (save.stars[ch.id] ?? 0) > 0).length;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 100 ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("lgm-road");
    for (const cls of ["lgm-road-edge", "lgm-road-fill"]) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", cls);
      p.setAttribute("vector-effect", "non-scaling-stroke");
      svg.append(p);
    }
    const track = el("div", "lgm-track");
    track.append(svg);
    map.append(track);
    let current: HTMLElement | null = null;
    CHAPTERS.forEach((ch, i) => {
      const unlocked = chapterUnlocked(save, ch.id);
      const stars = save.stars[ch.id] ?? 0;
      const final = i === n - 1;
      const isNext = unlocked && stars === 0;
      const diffOpen = unlocked && difficultyOpen(diff.id, stars > 0, save.diffCleared[ch.id] ?? 0);
      const stop = el("button", `lgm-stop${unlocked ? "" : " locked"}${stars ? " done" : ""}${isNext ? " next" : ""}${final ? " final" : ""}${unlocked && !seen.has(ch.id) ? " fresh" : ""}${diff.rank > 0 && unlocked && !diffOpen ? " shut" : ""}`);
      stop.style.left = `${xs[i]}%`;
      stop.style.bottom = `${((i * 10 + 5) / H) * 100}%`;
      const bossId = ch.waves[ch.waves.length - 1]!.boss;
      const icon = !unlocked ? (final ? "🏯" : "?") : final ? (BOSS_ICON[bossId ?? ""] ?? "👑") : stars ? "🚩" : String(ch.id);
      stop.append(el("div", "lgm-pin", icon));
      const label = el("div", "lgm-label");
      label.append(el("div", "lgm-name", unlocked ? ch.name : final ? "The last road" : "???"));
      if (unlocked) {
        const dc = save.diffCleared[ch.id] ?? 0;
        label.append(el("div", "lgm-stars", "★".repeat(stars) + "☆".repeat(3 - stars) + (dc >= 2 ? " ☠️" : dc >= 1 ? " 💀" : "")));
      }
      stop.append(label);
      if (isNext) {
        stop.append(el("div", "lgm-flag", unlocked && !seen.has(ch.id) ? "NEW!" : "NEXT"));
        current = stop;
      }
      stop.onclick = () => {
        if (!unlocked) return this.denied(stop);
        this.cb.onClick();
        this.chapterSheet(save, ch, diff, seen);
      };
      track.append(stop);
    });
    // Side stops off the road: mini-games that open after a chapter is cleared.
    const sides = this.sideGames();
    const fair = fairPick(todayString(), openMinis(save.stars));
    for (const sd of sides) {
      const open = (save.stars[sd.after] ?? 0) > 0;
      const side = el("button", `lgm-side${open ? "" : " locked"}`);
      side.style.left = `${sd.left}%`;
      side.style.bottom = `${((sd.at * 10 + 5) / H) * 100}%`;
      side.append(el("div", "lgm-pin", open ? sd.icon : "?"));
      const lab = el("div", "lgm-label");
      const rec = save.mini[sd.key];
      const st = rec?.stars ?? 0;
      lab.append(el("div", "lgm-name", open ? sd.name : "???"));
      if (open) lab.append(el("div", "lgm-stars", "★".repeat(st) + "☆".repeat(3 - st)));
      if (open && rec?.best) lab.append(el("div", "lgm-best", `best ${rec.best}`));
      side.append(lab);
      if (open && fair === sd.key) side.append(el("div", "lgm-flag lgm-fair", "2× GOLD"));
      side.onclick = () => {
        if (!open) return this.denied(side);
        this.cb.onClick();
        sd.go();
      };
      track.append(side);
    }
    // Bring the current stop into view once the tab is laid out.
    const target = current ?? map.querySelector<HTMLElement>(".lgm-stop.done:last-of-type");
    // The counter doubles as a jump back to the next stop (handy after scrolling up the road).
    const progress = el("button", "lgm-progress", `${cleared} / ${n} chapters cleared${target ? " · ⬇ next" : ""}`);
    progress.onclick = () => {
      if (!target) return;
      this.cb.onClick();
      (target as HTMLElement).scrollIntoView({ block: "center", behavior: "smooth" });
    };
    map.append(progress);
    if (target) requestAnimationFrame(() => (target as HTMLElement).scrollIntoView({ block: "center" }));
    return map;
  }

  /** A mode's full card in a sheet (from the modes row), with a way back to the map. */
  private modeSheet(save: SaveData, card: HTMLElement, heat = false): void {
    const box = el("div", "panel pop-in lgm-sheet");
    box.append(card);
    if (heat) box.append(this.heatPanel(save));
    box.append(this.button("Back to the map", "btn btn-ghost", () => this.showHub(save, "battle")));
    this.show(box);
  }

  /** Boss Rush: every boss in a row (opens after chapter 5). */
  private bossRushCard(save: SaveData, fresh = false): HTMLElement {
    const open = chapterUnlocked(save, BOSS_RUSH.id);
    const card = el("button", `chapter lgbr${open ? "" : " locked"}${fresh ? " fresh" : ""}`);
    if (fresh) card.append(el("div", "ch-fresh", "🔓 NEW!"));
    card.style.setProperty("--g1", "#6a3a1a");
    card.style.setProperty("--g2", "#2a1408");
    const left = el("div", "ch-left");
    left.append(el("div", "ch-num", "Challenge"), el("div", "ch-name", `👑 ${BOSS_RUSH.name}`), el("div", "ch-blurb", open ? BOSS_RUSH.blurb : "Clear chapter 5 to unlock"));
    if (open) left.append(el("div", "ch-affix", "Ten nights · a boss every night · the Hollow King last"));
    // Boss Rush follows the campaign difficulty picker (Hard after a Normal clear, Nightmare after Hard).
    const diff = DIFF_BY_ID[save.difficulty];
    const rank = save.diffCleared[BOSS_RUSH.id] ?? 0;
    if (open && diff.rank > 0) left.append(el("div", "ch-affix", difficultyOpen(diff.id, (save.stars[BOSS_RUSH.id] ?? 0) > 0, rank) ? `${diff.icon} Plays on ${diff.name}` : `🔒 ${diff.name}: clear Boss Rush on ${diff.rank === 2 ? "Hard" : "Normal"} first`));
    if (open && rank > 0) left.append(el("div", "ch-affix", rank >= 2 ? "☠️ Cleared on Nightmare" : "💀 Cleared on Hard"));
    const right = el("div", "ch-right");
    const st = save.stars[BOSS_RUSH.id] ?? 0;
    right.append(el("div", "ch-stars", open ? "★".repeat(st) + "☆".repeat(3 - st) : "🔒"));
    const best = save.best[BOSS_RUSH.id] ?? 0;
    if (open && best) right.append(el("div", "ch-best", st ? "Cleared!" : `Record: boss ${best}/10`));
    if (open) right.append(el("div", "ch-play", "FIGHT ▶"));
    card.append(left, right);
    card.onclick = () => {
      if (!open) return this.denied(card);
      this.cb.onClick();
      this.cb.onPlay(BOSS_RUSH.id);
    };
    return card;
  }

  /** The side-stop mini-games: where they sit on the map and the chapter that opens each. */
  private sideGames(): { key: string; icon: string; name: string; after: number; left: number; at: number; go: () => void }[] {
    if (!SIDE_GAMES_ENABLED) return [];
    return [
      { key: "archery", icon: "🎯", name: "Archery Range", after: 1, left: 84, at: 0.5, go: () => this.cb.onArchery?.() },
      { key: "supply", icon: "🛒", name: "Supply Run", after: 2, left: 12, at: 1.5, go: () => this.cb.onSupply?.() },
      { key: "forge", icon: "⚒️", name: "Royal Forge", after: 3, left: 86, at: 2.5, go: () => this.cb.onForge?.() },
      { key: "watch", icon: "🛡️", name: "Wall Watch", after: 4, left: 11, at: 3.6, go: () => this.cb.onWatch?.() },
      { key: "bells", icon: "🔔", name: "Bell Tower", after: 5, left: 85, at: 4.68, go: () => this.cb.onBells?.() },
      { key: "catapult", icon: "🪨", name: "Catapult Toss", after: 6, left: 88, at: 5.4, go: () => this.cb.onCatapult?.() },
      { key: "mason", icon: "🧱", name: "Mason's Tower", after: 7, left: 13, at: 6.2, go: () => this.cb.onMason?.() },
      { key: "dragon", icon: "🐉", name: "Dragon Dodge", after: 8, left: 84, at: 7.5, go: () => this.cb.onDragon?.() },
      { key: "lanterns", icon: "🏮", name: "Ghost Lanterns", after: 10, left: 16, at: 9.1, go: () => this.cb.onLanterns?.() },
    ];
  }

  /** Every side game in one list (open ones playable, with stars, best and today's 2× gold). */
  private fairSheet(save: SaveData): void {
    const box = el("div", "panel pop-in lgm-sheet");
    const fair = fairPick(todayString(), openMinis(save.stars));
    box.append(el("h1", "title", "🎪 The Fair"), el("p", "sub", "Every side game in one place. One of them pays double gold each day."));
    const games = [...this.sideGames()].sort((x, y) => x.after - y.after || x.at - y.at);
    for (const g of games) {
      const open = (save.stars[g.after] ?? 0) > 0;
      const rec = save.mini[g.key];
      const st = rec?.stars ?? 0;
      const row = el("button", `chapter lgfair-row${open ? "" : " locked"}`);
      row.style.setProperty("--g1", open ? "#4a2a6a" : "#3a3440");
      row.style.setProperty("--g2", "#1a1020");
      const left = el("div", "ch-left lgfair-left");
      left.append(el("div", "lgfair-icon", open ? g.icon : "🔒"));
      const txt = el("div", "");
      txt.append(el("div", "ch-name", open ? g.name : "???"), el("div", "ch-blurb", open ? (rec?.best ? `Best ${rec.best}` : "Not played yet") : `Clear chapter ${g.after} to open`));
      left.append(txt);
      const right = el("div", "ch-right");
      if (open && fair === g.key) right.append(el("div", "lgm-flag lgm-fair lgfair-flag", "2× GOLD"));
      right.append(el("div", "ch-stars", open ? "★".repeat(st) + "☆".repeat(3 - st) : ""));
      if (open) right.append(el("div", "ch-play", "PLAY ▶"));
      row.append(left, right);
      row.onclick = () => {
        if (!open) return this.denied(row);
        this.cb.onClick();
        this.backToFair = true;
        g.go();
      };
      box.append(row);
    }
    box.append(this.button("Back", "btn btn-ghost", () => {
      this.backToFair = false;
      this.showHub(save, "battle");
    }));
    this.show(box);
  }

  private siegeSheet(save: SaveData): void {
    const box = el("div", "panel pop-in lgm-sheet");
    box.append(el("h1", "title", "⚔️ Siege Lord"), el("p", "sub", "Drag a unit card onto a lane of the field to send it. Break the walls (a breach stays open till the next push), take the hall — before the castle holds 8 pushes."));
    // Today's Daily Siege (once the first siege is taken): a fresh castle every day, with a prize for the first win.
    if ((save.mini.siege1?.stars ?? 0) > 0) {
      const today = todayString();
      const d = dailySiegeFor(today, Object.keys(save.stars).map(Number).filter((k) => (save.stars[k] ?? 0) > 0));
      const open = dailySiegeOpen(save.stats, today);
      const row = el("button", "chapter lgsl-row lgsl-daily");
      row.style.setProperty("--g1", "#b8781e");
      row.style.setProperty("--g2", "#3a1a08");
      const left = el("div", "ch-left");
      left.append(el("div", "ch-num", "🗓️ Daily Siege"), el("div", "ch-name", d.name), el("div", "ch-blurb", `Walls level ${d.perm} · ${open ? `first win: +${DAILY_SIEGE_PRIZE} gold` : `taken today ✓ · new siege in ${timeToNextDaily()}`}`));
      const right = el("div", "ch-right");
      right.append(el("div", "ch-stars", open ? "🏰" : "✅"), el("div", "ch-play", "ATTACK ▶"));
      row.append(left, right);
      row.onclick = () => {
        this.cb.onClick();
        this.cb.onSiege?.(-1);
      };
      box.append(row);
    }
    SIEGES.forEach((s, i) => {
      const rec = save.mini[`siege${i + 1}`];
      const needCh = s.needs && (save.stars[s.needs] ?? 0) === 0;
      const open = (i === 0 || (save.mini[`siege${i}`]?.stars ?? 0) > 0) && !needCh;
      const row = el("button", `chapter lgsl-row${open ? "" : " locked"}`);
      row.style.setProperty("--g1", ["#7a3a1a", "#6a2a2a", "#5a1a3a", "#2a4a6a", "#3a2a5a", "#2a5a2a"][i] ?? "#5a1a3a");
      row.style.setProperty("--g2", "#2a1010");
      const left = el("div", "ch-left");
      left.append(el("div", "ch-num", `Siege ${i + 1}`), el("div", "ch-name", s.name), el("div", "ch-blurb", open ? `Defenders: ${["fresh recruits", "seasoned guards", "veterans under the Knight Captain", "the mountain garrison, blessed by the Cleric", "the Marshal's last levy, behind walls of black stone", "the Alchemist and his acid, on the red heath"][i] ?? "the castle's best"}` : needCh ? `Clear chapter ${s.needs} first` : "Take the previous siege first"));
      // The war card a first win here opens (sieges are won in order, so siege N opens unlock N).
      const prize = WAR_CARDS.find((k) => k.unlock === i + 1);
      if (open && prize && !(rec?.stars ?? 0)) left.append(el("div", "ch-affix", `🃏 Win to unlock: ${CARD_NAME[prize.id] ?? ENEMIES[prize.id].name}`));
      const right = el("div", "ch-right");
      const st = rec?.stars ?? 0;
      right.append(el("div", "ch-stars", open ? "★".repeat(st) + "☆".repeat(3 - st) : "🔒"));
      if (open) right.append(el("div", "ch-play", "ATTACK ▶"));
      row.append(left, right);
      row.onclick = () => {
        if (!open) return this.denied(row);
        this.cb.onClick();
        this.cb.onSiege?.(i);
      };
      box.append(row);
    });
    box.append(this.button("Back", "btn btn-ghost", () => this.showHub(save, "battle")));
    this.show(box);
  }

  /** A chapter's details, opened from the map. */
  /** Heat: challenge toggles for a run (saved), with the gold multiplier they add up to. */
  private heatPanel(save: SaveData): HTMLElement {
    const box = el("div", "lgh-panel");
    const head = el("div", "lgh-head");
    const grid = el("div", "lgh-grid");
    const paint = () => {
      const on = cleanHeat(save.heat);
      const k = heatGold(on);
      head.replaceChildren(el("span", "", "🔥 Heat"), el("span", `lgh-mult${on.length ? " hot" : ""}`, on.length ? `gold ×${k.toFixed(2)}` : "off — tap to raise the stakes"));
      box.classList.toggle("hot", on.length > 0);
      for (const chip of grid.children) chip.classList.toggle("on", on.includes((chip as HTMLElement).dataset.id!));
    };
    for (const h of HEATS) {
      const chip = el("button", "lgh-chip");
      chip.dataset.id = h.id;
      chip.append(el("div", "lgh-icon", h.icon), el("div", "lgh-name", h.name), el("div", "lgh-desc", h.desc), el("div", "lgh-gold", `+${Math.round(h.gold * 100)}% gold`));
      chip.onclick = () => {
        this.cb.onClick();
        const on = cleanHeat(save.heat);
        save.heat = on.includes(h.id) ? on.filter((x) => x !== h.id) : [...on, h.id];
        this.cb.onHeat?.();
        paint();
        chip.classList.remove("pulse");
        void chip.offsetWidth;
        chip.classList.add("pulse");
      };
      grid.append(chip);
    }
    box.append(head, grid);
    paint();
    return box;
  }

  private chapterSheet(save: SaveData, ch: (typeof CHAPTERS)[number], diff: (typeof DIFFICULTIES)[number], seen: Set<number>): void {
    const box = el("div", "panel pop-in lgm-sheet");
    box.append(this.chapterCard(save, ch, diff, seen));
    // Heat opens once the chapter has been cleared (a veteran's dial, not a new player's trap).
    if ((save.stars[ch.id] ?? 0) > 0) box.append(this.heatPanel(save));
    box.append(this.button("Back to the map", "btn btn-ghost", () => this.showHub(save, "battle")));
    this.show(box);
  }

  /** One chapter's full card (used in the map's detail sheet). */
  private chapterCard(save: SaveData, ch: (typeof CHAPTERS)[number], diff: (typeof DIFFICULTIES)[number], seen: Set<number>): HTMLButtonElement {
    const unlocked = chapterUnlocked(save, ch.id);
    const stars = save.stars[ch.id] ?? 0;
    const isNext = unlocked && stars === 0 && !CHAPTERS.some((o) => o.id < ch.id && chapterUnlocked(save, o.id) && !(save.stars[o.id] ?? 0));
    const diffOpen = unlocked && difficultyOpen(diff.id, stars > 0, save.diffCleared[ch.id] ?? 0);
    const card = el("button", `chapter${unlocked ? "" : " locked"}${isNext && diff.rank === 0 ? " next" : ""}${diff.rank > 0 && unlocked ? ` lgd-card lgd-${diff.id}${diffOpen ? "" : " lgd-shut"}` : ""}`);
    card.style.setProperty("--i", String(ch.id)); // entrance stagger (daily card is 0)
    if (unlocked && !seen.has(ch.id)) {
      card.classList.add("fresh");
      card.append(el("div", "ch-fresh", "🔓 NEW!"));
    } else if (isNext && diff.rank === 0) card.append(el("div", "ch-next", "NEXT"));
    card.style.setProperty("--g1", ch.ground[0]);
    card.style.setProperty("--g2", ch.ground[1]);
    const left = el("div", "ch-left");
    left.append(el("div", "ch-num", `Chapter ${ch.id}`), el("div", "ch-name", ch.name), el("div", "ch-blurb", unlocked ? ch.blurb : `Clear chapter ${ch.id - 1} to unlock`));
    if (unlocked && ch.affixes.length) left.append(el("div", "ch-affix", ch.affixes.join(" · ")));
    const bossId = ch.waves[ch.waves.length - 1]!.boss;
    if (unlocked && bossId) {
      const boss = el("div", "ch-boss");
      const img = document.createElement("img");
      img.src = bossId === "dragon" ? "" : bossId === "hag" ? "./sprites/portraits/elite_mage.png" : "./sprites/portraits/boss.png";
      img.className = "painted";
      if (bossId === "dragon") boss.append(el("span", "ch-boss-emoji", "🐉"));
      else if (bossId === "frostwyrm") boss.append(el("span", "ch-boss-emoji", "❄️"));
      else if (bossId === "magma") boss.append(el("span", "ch-boss-emoji", "🌋"));
      else if (bossId === "drowned") boss.append(el("span", "ch-boss-emoji", "🔱"));
      else if (bossId === "bloodlord") boss.append(el("span", "ch-boss-emoji", "🌕"));
      else if (bossId === "hollowking") boss.append(el("span", "ch-boss-emoji", "💀"));
      else boss.append(img);
      boss.append(el("span", "", `Boss: ${ENEMIES[bossId].name}`));
      left.append(boss);
    }
    const right = el("div", "ch-right");
    right.append(el("div", "ch-stars", unlocked ? "★".repeat(stars) + "☆".repeat(3 - stars) : "🔒"));
    const dBest = diff.rank > 0 ? save.diffBest[`${ch.id}:${diff.rank}`] ?? 0 : 0;
    if (diff.rank > 0 && diffOpen) {
      // On Hard / Nightmare, the card speaks for that difficulty.
      const cleared = (save.diffCleared[ch.id] ?? 0) >= diff.rank;
      if (cleared || dBest) right.append(el("div", "ch-best", cleared ? `${diff.icon} Cleared` : `${diff.icon} Best: night ${dBest}`));
    } else if (save.best[ch.id]) right.append(el("div", "ch-best", stars ? "Cleared" : `Best: night ${save.best[ch.id]}`));
    const dc = save.diffCleared[ch.id] ?? 0;
    if (dc > 0 && diff.rank === 0) right.append(el("div", "lgd-skulls", dc >= 2 ? "💀 ☠️" : "💀"));
    if (unlocked && !stars && save.best[ch.id]) {
      // How close you've come to clearing it.
      const bar = el("div", "ch-prog");
      const fill = el("i", "");
      fill.style.width = `${Math.min(100, (save.best[ch.id]! / ch.waves.length) * 100)}%`;
      bar.append(fill);
      right.append(bar);
    }
    if (unlocked && diff.rank > 0 && !diffOpen) right.append(el("div", "lgd-need", diff.rank === 1 ? "Clear on Normal first" : "Clear on Hard first"));
    else if (unlocked) right.append(el("div", "ch-play", diff.rank > 0 ? `${diff.icon} PLAY` : "PLAY ▶"));
    card.append(left, right);
    if (unlocked && diff.rank > 0 && !diffOpen) card.onclick = () => this.denied(card);
    else if (unlocked)
      card.onclick = () => {
        this.cb.onClick();
        this.cb.onPlay(ch.id);
      };
    else card.onclick = () => this.denied(card);
    return card;
  }

  /** One-time "What's new" card after a big update (returning players only; dismissed for good). */
  private newsCard(save: SaveData): HTMLElement | null {
    // The 2026-11-20 card waits until that day (the 19th already had a card).
    const NEWS = Date.now() >= Date.UTC(2026, 10, 21) ? "2026-11-21" : Date.now() >= Date.UTC(2026, 10, 20) ? "2026-11-20" : "2026-11-19c";
    const seen = getJson<string>("lastgate.seenNews", "");
    if (save.runs === 0 || seen === NEWS) return null;
    const card = el("div", "lgn-card");
    card.append(el("div", "lgn-title", "✨ What's new"));
    const list = el("ul", "lgn-list");
    // Saw an earlier card today: just the newest bits. Otherwise the whole update.
    const lines = NEWS === "2026-11-21" && seen === "2026-11-20"
      ? [
          "💀 Chapter 10: The Hollow Throne · 👑 Boss Rush — every boss, one per night",
          "📯 The Marshal (25★) & 🧪 The Alchemist (28★): two new heroes · 🎖️ Veteran looks after 25 nights",
          "⚔️ Siege Lord rebuilt: the view flips so you attack up the field — drag a unit card onto a lane (or tap the field) to send your horde",
          "🛠️ Polish everywhere: lighter loading, smoother long nights, clearer hints, easier-to-tap buttons on small phones",
          "⚔️ Siege Lord: three new sieges up to the Alchemist's Tower, new war cards, and a 🗓️ Daily Siege",
          "🌑 Shadowstalker: a new foe in chapters 7–10 that blinks forward through your fire",
          "🎁 A Royal Gift every day on the Battle tab — 7 days in a row for the big one",
        ]
      : NEWS === "2026-11-20" || NEWS === "2026-11-21"
      ? [
          "🗺️ The campaign is now a map — follow the road to the final boss (no spoilers past your next stop)",
          "⚔️ Siege Lord: play the horde! The view flips — drag unit cards onto a lane to take the castle · 6 sieges, new war cards and a 🗓️ Daily Siege",
          "⚡ Smoother and lighter on phones: faster loading, less memory, easier-to-tap buttons, clearer hints",
          "🎁 A Royal Gift every day on the Battle tab — 7 days in a row for the big one",
          "✝️ The Cleric (new hero) heals the hall and walls with Sanctuary · 📖 a Bestiary of every foe you've met",
          ...(NEWS === "2026-11-21" ? ["💀 Chapter 10 · 👑 Boss Rush · 📯 the Marshal & 🧪 the Alchemist (new heroes) · 🎖️ Veteran looks"] : []),
        ]
      : seen.startsWith("2026-11-19")
      ? [
          "🌕 Chapter 9: Bloodmoon Moors — and the Blood Moon Warlord, whose moon makes the horde run wild",
          "🔱 The Lancer (new hero, 18★) hurls a lance through a whole line of foes",
          "🫧 New flairs for clearing chapters 8 and 9 · ⚔️ new blessings: Kingslayer, Stone Hall",
          "🔥 Daily streaks pay bonus gold · new daily twists and weekly quests soon",
        ]
      : [
          "🗺️ Four new chapters: Frostpeak Pass, Ashen Caldera, Sunken Citadel, Bloodmoon Moors — with new bosses",
          "🏹 New heroes: The Warden and The Lancer · skill trees for every hero · hero flair",
          "💀 Hard & Nightmare modes · elite foes · bosses with a second phase",
          "📜 Daily & weekly quests · daily streak bonus · Endless milestones and weekly twists",
          "🔮 New buildings: Mage Tower, Healer's Tent, Spike Trap, Watchtower",
        ];
    for (const t of lines) list.append(el("li", "", t));
    card.append(list);
    const ok = this.button("Let's go!", "btn btn-mini lgn-ok", () => {
      setItem("lastgate.seenNews", JSON.stringify(NEWS));
      card.remove();
    });
    card.append(ok);
    return card;
  }

  /** The Royal Gift: a chest that opens once a day, on a 7-day ladder. Hidden once opened (after the reveal). */
  private giftCard(save: SaveData): HTMLElement | null {
    const v = giftView(save.stats, todayString());
    const opened = this.justClaimed?.id === "gift" ? this.justClaimed : null;
    if (opened) this.justClaimed = null;
    if (!v.ready && !opened) return null;
    const card = el("button", `lgift${opened ? " opened" : ""}`);
    card.append(el("div", "lgift-chest", opened ? "💰" : "🎁"));
    const mid = el("div", "lgift-mid");
    mid.append(el("div", "lgift-title", opened ? `Day ${v.day} gift opened!` : `Royal Gift · Day ${v.day}`));
    const pips = el("div", "lgift-pips");
    GIFT_GOLD.forEach((g, i) => {
      const d = i + 1;
      const pip = el("div", `lgift-pip${d < v.day || (opened && d === v.day) ? " got" : d === v.day ? " now" : ""}${d === GIFT_GOLD.length ? " big" : ""}`);
      pip.append(el("b", "", d === GIFT_GOLD.length ? "👑" : String(d)), el("i", "", String(g)));
      pips.append(pip);
    });
    const nextDay = (v.day % GIFT_GOLD.length) + 1;
    mid.append(pips, el("div", "lgift-sub", opened ? `Come back tomorrow for day ${nextDay} (+${GIFT_GOLD[nextDay - 1]})` : v.streak > 1 ? `🔥 ${v.streak} days in a row — tap to open` : "Open one every day — miss a day and it starts over"));
    card.append(mid, el("div", "lgift-gold", `+${opened ? opened.reward : v.gold}`));
    if (!opened)
      card.onclick = () => {
        const gold = this.cb.onGift?.() ?? 0;
        if (gold > 0) this.justClaimed = { id: "gift", reward: gold };
        this.showHub(save, "battle");
      };
    return card;
  }

  /** The Weekly Gauntlet: one fixed run all week (chapter, twist, three forced Heats), a prize for the first win. */
  private weeklyCard(save: SaveData): HTMLElement {
    const cleared = Object.keys(save.stars).map(Number).filter((k) => k <= 10 && (save.stars[k] ?? 0) > 0);
    const g = weeklyFor(todayString(), cleared);
    const rec = save.weekly?.week === g.week ? save.weekly : null;
    const card = el("button", "chapter lgw-week");
    card.style.setProperty("--g1", "#2a5a8a");
    card.style.setProperty("--g2", "#122a4a");
    const left = el("div", "ch-left");
    left.append(
      el("div", "ch-num", "Weekly Gauntlet"),
      el("div", "ch-name", g.twist.name),
      el("div", "ch-blurb", g.twist.desc),
      el("div", "ch-affix", `${CHAPTER_BY_ID[g.chapterId]!.name} · same run all week`),
      el("div", "ch-boss lgw-heat", `🔥 ${g.heats.map((h) => `${HEAT_BY_ID[h]!.icon} ${HEAT_BY_ID[h]!.name}`).join(" · ")}`),
    );
    const right = el("div", "ch-right");
    right.append(el("div", "ch-stars", rec?.won ? "★".repeat(rec.stars) + "☆".repeat(3 - rec.stars) : "🗓️"));
    right.append(el("div", "ch-best", rec?.won ? "Beaten! Go for ★★★" : rec?.best ? `Best: night ${rec.best}` : `+${WEEKLY.win + WEEKLY.perHeat * g.heats.length} gold`));
    right.append(el("div", "ch-play", rec?.won ? "REPLAY ↻" : "PLAY ▶"));
    card.append(left, right);
    card.onclick = () => {
      this.cb.onClick();
      this.cb.onWeekly?.();
    };
    return card;
  }

  private dailyCard(save: SaveData): HTMLElement {
    const d = dailyFor(todayString());
    const today = save.daily.date === d.date ? save.daily : { best: 0, won: false };
    const card = el("button", "chapter daily");
    card.style.setProperty("--g1", "#b8781e");
    card.style.setProperty("--g2", "#7a4a10");
    const left = el("div", "ch-left");
    left.append(
      el("div", "ch-num", "Daily challenge"),
      el("div", "ch-name", d.twist.name),
      el("div", "ch-blurb", d.twist.desc),
      el("div", "ch-affix", `${CHAPTER_BY_ID[d.chapterId]!.name} · ${HERO_BY_ID[d.hero].name} · starts with ${BLESSING_BY_ID[d.blessing]?.name ?? d.blessing}`),
    );
    const right = el("div", "ch-right");
    if (today.won) right.append(el("div", "ch-stars", "✅"));
    else {
      const now = new Date();
      const cal = el("div", "cal");
      cal.append(el("div", "cal-mon", now.toLocaleString("en", { month: "short" })), el("div", "cal-day", String(now.getDate())));
      right.append(cal);
    }
    const streak = liveDailyStreak(save.stats, d.date);
    // Today's prize includes the streak bonus a win would earn (the streak grows by one).
    const prize = DAILY_BONUS + dailyStreakBonus(streak + 1);
    right.append(el("div", "ch-best", today.won ? `New twist in ${timeToNextDaily()}` : today.best ? `Best: night ${today.best}` : `+${prize} gold`));
    if (streak >= 2) right.append(el("div", "daily-streak", `🔥 ${streak}-day streak`));
    right.append(el("div", "ch-play", today.won ? "REPLAY ↻" : "PLAY ▶"));
    card.append(left, right);
    card.onclick = () => {
      this.cb.onClick();
      this.cb.onDaily();
    };
    return card;
  }

  /**
   * One-time pointers to systems the player hasn't met yet: a bubble under the tab that holds them.
   * One at a time; it goes away for good once that tab is opened (or the bubble is tapped).
   */
  private coachmark(wrap: HTMLElement, tabs: HTMLElement, save: SaveData, tab: Tab): void {
    const seen = new Set(getJson<string[]>("lastgate.hints", []) ?? []);
    const mark = (id: string) => {
      seen.add(id);
      setItem("lastgate.hints", JSON.stringify([...seen]));
    };
    const hints: { id: string; tab: Tab; text: string; when: boolean }[] = [
      { id: "quests", tab: "trophies", text: "📜 Daily quests! Finish them for gold.", when: questViews(save).length > 0 && (save.stars[1] ?? 0) > 0 },
      { id: "skills", tab: "heroes", text: "★ Skill point earned — make your hero stronger.", when: HEROES.some((h) => heroUnlocked(save, h.id) && freePoints(save.heroes[h.id]) > 0) },
      { id: "flair", tab: "heroes", text: "✨ New hero flair unlocked — wear it!", when: FLAIRS.some((f) => f.id !== "none" && f.unlocked(save)) },
      { id: "bestiary", tab: "trophies", text: "📖 New foes in your Bestiary!", when: foesMet(save) >= 5 },
    ];
    for (const h of hints) if (h.when && h.tab === tab && !seen.has(h.id)) mark(h.id); // opening the tab counts
    const h = hints.find((x) => x.when && !seen.has(x.id));
    if (!h) return;
    const idx = (["battle", "heroes", "armory", "trophies"] as Tab[]).indexOf(h.tab);
    const bubble = el("button", "lgo-bubble", h.text);
    bubble.style.setProperty("--col", String(idx));
    bubble.onclick = () => {
      mark(h.id);
      bubble.remove();
    };
    tabs.style.position = "relative";
    tabs.append(bubble);
    void wrap;
    // Centre it under its tab once laid out (kept inside the row), with the arrow on the tab.
    requestAnimationFrame(() => {
      const t = tabs.children[idx] as HTMLElement | undefined;
      if (!t) return;
      const centre = t.offsetLeft + t.offsetWidth / 2;
      const left = Math.max(0, Math.min(tabs.clientWidth - bubble.offsetWidth, centre - bubble.offsetWidth / 2));
      bubble.style.left = `${left}px`;
      bubble.style.setProperty("--ax", `${centre - left - 8}px`);
    });
  }

  /** Daily and weekly quests (top of the Trophies tab). */
  private questsSection(body: HTMLElement, save: SaveData): void {
    const views = questViews(save);
    if (!views.length) return;
    const head = el("div", "hub-hint lgq-head");
    head.append(el("span", "", "Quests"), el("span", "lgq-reset", `New daily quests in ${timeToNextDaily()}`));
    body.append(head);
    for (const v of views) {
      const row = el("div", `trophy lgq${v.weekly ? " lgq-weekly" : ""}${v.slot.claimed ? " claimed" : v.done ? " ready" : ""}`);
      const info = el("div", "trophy-info");
      const bar = el("div", "trophy-bar");
      const fill = el("div", "trophy-fill");
      fill.style.width = `${(v.progress / v.def.goal) * 100}%`;
      bar.append(fill, el("div", "trophy-num", `${v.progress.toLocaleString()} / ${v.def.goal.toLocaleString()}`));
      info.append(el("div", "trophy-name", v.weekly ? "Weekly quest" : "Daily quest"), el("div", "trophy-desc", v.def.desc), bar);
      const right = el("div", "trophy-right");
      if (v.slot.claimed) right.append(el("div", "trophy-done", "✔"));
      else if (v.done)
        right.append(
          this.button(`● ${v.reward}`, "btn btn-claim", () => {
            this.justClaimed = { id: `q:${v.slot.id}`, reward: v.reward };
            this.cb.onClaimQuest(v.slot.id);
          }),
        );
      else right.append(el("div", "trophy-reward", `● ${v.reward}`));
      if (this.justClaimed?.id === `q:${v.slot.id}`) {
        row.classList.add("just");
        row.append(el("div", "trophy-gain", `+${this.justClaimed.reward}`));
      }
      row.append(el("div", "trophy-icon", v.def.icon), info, right);
      body.append(row);
    }
  }

  private trophiesTab(body: HTMLElement, save: SaveData): void {
    const earned = save.claimed.length;
    const summary = el("div", "trophy-summary");
    const bar = el("div", "trophy-bar");
    const fill = el("div", "trophy-fill");
    fill.style.width = `${(earned / ACHIEVEMENTS.length) * 100}%`;
    bar.append(fill, el("div", "trophy-num", `${earned} / ${ACHIEVEMENTS.length} earned`));
    summary.append(el("div", "trophy-summary-icon", "🏆"), bar);
    body.append(summary);
    this.questsSection(body, save);
    body.append(el("div", "hub-hint", "Achievements — claim them for gold."));
    const rank = (a: (typeof ACHIEVEMENTS)[number]) => {
      const f = Math.min(1, a.progress(save) / a.goal);
      // The row just claimed stays at the top for this render so the celebration is visible.
      if (this.justClaimed?.id === a.id) return -2;
      return save.claimed.includes(a.id) ? 2 : f >= 1 ? -1 : -f;
    };
    // Claimed trophies fold into a "Claimed (n)" section at the end (tap to open), so the list
    // leads with what's still in play.
    let claimedBox: HTMLElement | null = null;
    const claimedCount = ACHIEVEMENTS.filter((a) => save.claimed.includes(a.id) && this.justClaimed?.id !== a.id).length;
    for (const a of [...ACHIEVEMENTS].sort((x, y) => rank(x) - rank(y))) {
      const isFolded = save.claimed.includes(a.id) && this.justClaimed?.id !== a.id;
      if (isFolded && !claimedBox) {
        const toggle = el("button", "trophy-fold", `${this.showClaimed ? "▾" : "▸"} ✔ Claimed (${claimedCount})`);
        claimedBox = el("div", "trophy-folded");
        claimedBox.style.display = this.showClaimed ? "" : "none";
        toggle.onclick = () => {
          this.showClaimed = !this.showClaimed;
          claimedBox!.style.display = this.showClaimed ? "" : "none";
          toggle.textContent = `${this.showClaimed ? "▾" : "▸"} ✔ Claimed (${claimedCount})`;
          this.cb.onClick();
        };
        body.append(toggle, claimedBox);
      }
      const p = Math.min(a.goal, a.progress(save));
      const done = p >= a.goal;
      const claimed = save.claimed.includes(a.id);
      const row = el("div", `trophy${claimed ? " claimed" : done ? " ready" : ""}`);
      const info = el("div", "trophy-info");
      const bar = el("div", "trophy-bar");
      const fill = el("div", "trophy-fill");
      fill.style.width = `${(p / a.goal) * 100}%`;
      bar.append(fill, el("div", "trophy-num", `${p.toLocaleString()} / ${a.goal.toLocaleString()}`));
      info.append(el("div", "trophy-name", a.name), el("div", "trophy-desc", a.desc), bar);
      const right = el("div", "trophy-right");
      if (claimed) right.append(el("div", "trophy-done", "✔"));
      else if (done)
        right.append(
          this.button(`● ${a.reward}`, "btn btn-claim", () => {
            this.justClaimed = { id: a.id, reward: a.reward };
            this.cb.onClaim(a.id);
          }),
        );
      else right.append(el("div", "trophy-reward", `● ${a.reward}`));
      if (this.justClaimed?.id === a.id) {
        row.classList.add("just");
        row.append(el("div", "trophy-gain", `+${this.justClaimed.reward}`));
      }
      row.append(el("div", "trophy-icon", a.icon), info, right);
      (isFolded && claimedBox ? claimedBox : body).append(row);
    }
    this.justClaimed = null;
    // Lifetime records from the same stats the trophies use.
    const st = save.stats;
    const records: [string, string, number][] = [
      ["💀", "Enemies slain", st.kills ?? 0],
      ["🛡️", "Nights survived", st.wavesHeld ?? 0],
      ["👑", "Bosses slain", st.bosses ?? 0],
      ["✨", "Flawless nights", st.flawlessWaves ?? 0],
      ["♾️", "Best Endless night", save.best[99] ?? 0],
      ["🔥", "Best daily streak", st.dailyBestStreak ?? 0],
      ["⚡", "Best kill streak", st.bestStreak ?? 0],
      ["🏅", "Daily wins", st.dailyWins ?? 0],
      ["⚔️", "Runs played", save.runs],
    ];
    const grid = el("div", "records");
    for (const [icon, label, value] of records) {
      const cell = el("div", "record");
      cell.append(el("div", "record-icon", icon), el("div", "record-val", value.toLocaleString()), el("div", "record-label", label));
      grid.append(cell);
    }
    body.append(el("div", "hub-hint records-title", "Records"), grid);
    // Side games: best score and stars for each mini-game, plus Siege Lord stars.
    const minis: [string, string, string][] = !SIDE_GAMES_ENABLED ? [] : [["archery", "🎯", "Archery"], ["supply", "🛒", "Supply Run"], ["forge", "⚒️", "Royal Forge"], ["watch", "🛡️", "Wall Watch"], ["bells", "🔔", "Bell Tower"], ["catapult", "🪨", "Catapult"], ["mason", "🧱", "Mason's Tower"], ["dragon", "🐉", "Dragon Dodge"], ["lanterns", "🏮", "Lanterns"]];
    const fun = el("div", "records");
    const opened = openMinis(save.stars);
    for (const [key, icon, label] of minis) {
      const rec = save.mini[key];
      const known = opened.includes(key);
      const cell = el("div", `record${rec ? "" : " empty"}`);
      cell.append(el("div", "record-icon", known ? icon : "❔"), el("div", "record-val", rec ? rec.best.toLocaleString() : "—"), el("div", "record-label", rec ? `${label} ${"★".repeat(rec.stars)}${"☆".repeat(3 - rec.stars)}` : known ? label : "???"));
      fun.append(cell);
    }
    const siegeStars = SIEGES.reduce((a, _, i) => a + (save.mini[`siege${i + 1}`]?.stars ?? 0), 0);
    const sc = el("div", "record");
    sc.append(el("div", "record-icon", "⚔️"), el("div", "record-val", `${siegeStars}/${SIEGES.length * 3}`), el("div", "record-label", "Siege Lord stars"));
    fun.append(sc);
    // Boss Rush: the furthest boss reached (or cleared).
    if (chapterUnlocked(save, BOSS_RUSH.id)) {
      const br = el("div", "record");
      const best = save.best[BOSS_RUSH.id] ?? 0;
      br.append(el("div", "record-icon", "👑"), el("div", "record-val", (save.stars[BOSS_RUSH.id] ?? 0) > 0 ? "10/10" : best ? `${Math.max(0, best - 1)}/10` : "—"), el("div", "record-label", "Boss Rush bosses"));
      fun.append(br);
    }
    body.append(el("div", "hub-hint records-title", SIDE_GAMES_ENABLED ? "Side games — best scores" : "Modes"), fun);
    this.bestiarySection(body, save);
    this.historySection(body, save);
    this.endlessTopSection(body, save);
  }

  /** A slain foe's full entry: stats, traits and where it marches. */
  private foeSheet(save: SaveData, id: keyof typeof ENEMIES): void {
    const d = ENEMIES[id];
    const box = el("div", "panel pop-in lgb-sheet");
    const art = el("div", "lgb-sheet-art");
    const pic = FOE_PORTRAIT[id];
    if (pic) {
      const img = document.createElement("img");
      img.src = `./sprites/portraits/${pic}.png`;
      img.alt = "";
      art.append(img);
    } else art.textContent = FOE_EMOJI[id] ?? "👹";
    box.append(art, el("h1", "title lgb-sheet-name", d.name));
    const traits = enemyTraits(d);
    if (traits.length) box.append(el("p", "sub", traits.join(" · ")));
    const stats = el("div", "lgb-stats");
    for (const [icon, label, v] of [["❤️", "Health", String(d.hp)], ["👣", "Speed", String(d.speed)], ["💥", "Hits for", String(d.gateDamage)], ["🪙", "Coins", String(d.gold)]] as const) {
      const c = el("div", "lgb-stat");
      c.append(el("div", "lgb-stat-v", `${icon} ${v}`), el("div", "lgb-stat-l", label));
      stats.append(c);
    }
    box.append(stats);
    const where = CHAPTERS.filter((ch) => ch.waves.some((w) => (w.mix as Record<string, number>)[id] || w.boss === id || w.intro === id)).map((ch) => ch.name);
    box.append(el("p", "sub lgb-where", where.length ? `Marches in: ${where.join(", ")}` : "Turns up anywhere"));
    const back = this.button("Back", "btn", () => {
      this.showHub(save, "trophies");
      this.overlay.querySelector(".lgb-grid")?.scrollIntoView({ block: "center" });
    });
    box.append(back);
    this.show(box);
  }

  /** Bestiary: every kind of foe, revealed once you've slain one. */
  private bestiarySection(body: HTMLElement, save: SaveData): void {
    const ids = Object.keys(ENEMIES) as (keyof typeof ENEMIES)[];
    body.append(el("div", "hub-hint records-title", `📖 Bestiary · ${foesMet(save)} / ${ids.length}`));
    const grid = el("div", "lgb-grid");
    for (const id of ids) {
      const d = ENEMIES[id];
      const met = foeMet(save, id);
      const tile = el("div", `lgb-tile${met ? "" : " lgb-unmet"}${d.boss ? " lgb-boss" : ""}`);
      const art = el("div", "lgb-art");
      const pic = FOE_PORTRAIT[id];
      if (met && pic) {
        const img = document.createElement("img");
        img.src = `./sprites/portraits/${pic}.png`;
        img.alt = "";
        art.append(img);
      } else art.textContent = met ? FOE_EMOJI[id] ?? "👹" : "❔";
      tile.append(art, el("div", "lgb-name", met ? d.name.replace(/^The /, "") : "???"));
      if (met) {
        tile.append(el("div", "lgb-traits", enemyTraits(d).slice(0, 2).join(" · ")));
        tile.classList.add("lgb-tap");
        tile.onclick = () => {
          this.cb.onClick();
          this.foeSheet(save, id);
        };
      }
      grid.append(tile);
    }
    body.append(grid);
  }

  /** Best Endless sieges ever. */
  private endlessTopSection(body: HTMLElement, save: SaveData): void {
    if (!save.endlessTop.length) return;
    body.append(el("div", "hub-hint records-title", "♾️ Best Endless sieges"));
    const box = el("div", "lgh-list");
    save.endlessTop.forEach((r, i) => {
      const row = el("div", `lgh-row lgt-row${i === 0 ? " lgt-first" : ""}`);
      const left = el("div", "lgh-left");
      left.append(el("div", "lgh-where", `${["🥇", "🥈", "🥉", "4.", "5."][i]} Night ${r.nights}`), el("div", "lgh-sub", `${HERO_BY_ID[r.hero].name}${r.date ? ` · ${r.date}` : ""}`));
      row.append(left);
      box.append(row);
    });
    body.append(box);
  }

  /** The last few runs, newest first, with a win-rate line. */
  private historySection(body: HTMLElement, save: SaveData): void {
    const list = save.history;
    if (!list.length) return;
    const sum = historySummary(list);
    const head = el("div", "hub-hint lgq-head");
    head.append(el("span", "", "Recent runs"), el("span", "lgq-reset", `${sum.wins} won of the last ${sum.runs} · ${Math.round((sum.wins / sum.runs) * 100)}%`));
    body.append(head);
    const wk = weekSummary(list, todayString(), weekNumber);
    if (wk.runs) {
      const strip = el("div", "lgh-week");
      strip.append(el("span", "lgh-week-t", "This week"), el("span", "", `⚔️ ${wk.runs} run${wk.runs === 1 ? "" : "s"}`), el("span", "", `🏆 ${wk.wins} won`), el("span", "", `🌙 ${wk.nights} nights`));
      if (wk.bestEndless) strip.append(el("span", "", `♾️ best ${wk.bestEndless}`));
      body.append(strip);
    }
    const box = el("div", "lgh-list");
    for (const r of list) {
      const row = el("div", `lgh-row${r.won ? " won" : ""}`);
      const ch = CHAPTER_BY_ID[r.chapter];
      const where = r.daily ? `📅 Daily · ${ch?.name ?? "?"}` : r.chapter === ENDLESS.id ? "♾️ Endless" : `Ch ${r.chapter} · ${ch?.name ?? "?"}`;
      const left = el("div", "lgh-left");
      left.append(el("div", "lgh-where", where), el("div", "lgh-sub", `${HERO_BY_ID[r.hero].name} · ${r.nights} night${r.nights === 1 ? "" : "s"} · ${r.kills.toLocaleString()} slain`));
      const right = el("div", "lgh-right");
      right.append(el("div", "lgh-result", r.won ? "✔ Won" : r.chapter === ENDLESS.id ? `Night ${r.nights}` : "✖ Fell"), el("div", "lgh-gold", `+${r.gold.toLocaleString()} ●`));
      row.append(left, right);
      box.append(row);
    }
    body.append(box);
  }

  private heroesTab(body: HTMLElement, save: SaveData): void {
    // Heroes unlocked since the player last opened this tab get a one-time reveal.
    const fresh = new Set(freshHeroes(save));
    setItem(HERO_SEEN_KEY, JSON.stringify(HEROES.filter((h) => heroUnlocked(save, h.id)).map((h) => h.id)));
    // Order: the hero you play (and their look + skill tree), but any hero unlocked since your last
    // visit comes right under them — the tab's NEW badge used to lead to a hero buried below the whole
    // skill tree. Everyone else follows in the usual order.
    const order = [...HEROES].sort((a, b) => rank(a.id) - rank(b.id));
    function rank(id: HeroId): number {
      return save.hero === id ? 0 : fresh.has(id) ? 1 : 2;
    }
    const lastFresh = order.filter((h) => fresh.has(h.id) && h.id !== save.hero).pop()?.id;
    let skills: HTMLElement | null = null;
    for (const h of order) {
      const unlocked = heroUnlocked(save, h.id);
      const selected = save.hero === h.id;
      const card = el("button", `hero${unlocked ? "" : " locked"}${selected ? " selected" : ""}${fresh.has(h.id) ? " fresh" : ""}`);
      if (fresh.has(h.id)) card.append(el("div", "ch-fresh", "🔓 NEW!"));
      if (this.justPicked === h.id) {
        card.classList.add("just");
        card.append(el("div", "hero-picked", "Selected!"));
      }
      const portrait = el("div", "hero-portrait");
      portrait.style.background = h.color;
      const img = document.createElement("img");
      img.src = HERO_PORTRAIT[h.id];
      img.className = "painted";
      img.alt = h.name;
      portrait.append(img);
      const info = el("div", "hero-info");
      const name = el("div", "hero-name", `${h.name}${selected ? " ✓" : ""}`);
      // Band of Heroes progress: heroes that have won a run wear a small trophy chip.
      if (unlocked && heroHasWon(save, h.id)) name.append(el("span", "lgw-won", "🏆 Won"));
      info.append(name, el("div", "hero-title", h.title), el("div", "hero-line", CAMP_HEROES[h.id].passive), el("div", "hero-line ability-line", `${ABILITY_ICON[h.ability] ?? "✦"} ${h.abilityName}: ${h.abilityDesc}`));
      if (!unlocked) {
        const have = totalStars(save);
        const bar = el("div", "hero-lock-bar");
        const fill = el("i", "");
        fill.style.width = `${Math.min(100, (have / h.starsToUnlock) * 100)}%`;
        bar.append(fill);
        info.append(el("div", "hero-lock", `🔒 ${have} / ${h.starsToUnlock} ★ to unlock`), bar);
      }
      const pts = unlocked ? freePoints(save.heroes[h.id]) : 0;
      if (unlocked && !selected) {
        // Skill progress at a glance for the heroes you're not playing.
        const xp = save.heroes[h.id].xp;
        const nx = nextSkillThreshold(xp);
        const prev = [0, ...SKILL_THRESHOLDS].filter((t) => t <= xp).pop() ?? 0;
        const bar = el("div", "lgs-mini");
        const fill = el("i", "");
        fill.style.width = nx ? `${((xp - prev) / (nx - prev)) * 100}%` : "100%";
        bar.append(fill);
        info.append(el("div", "lgs-mini-label", `${save.heroes[h.id].skills.length} skill${save.heroes[h.id].skills.length === 1 ? "" : "s"} · ${nx ? `${xp}/${nx} nights to the next point` : "tree complete"}`), bar);
      }
      if (pts > 0) info.append(el("div", "lgs-pts-chip", `★ ${pts} skill point${pts > 1 ? "s" : ""} to spend`));
      card.append(portrait, info);
      if (unlocked && !selected)
        card.onclick = () => {
          this.cb.onClick();
          this.justPicked = h.id;
          this.cb.onSelectHero(h.id);
        };
      else if (!unlocked) card.onclick = () => this.denied(card);
      body.append(card);
      if (selected) body.append(this.vetLookRow(save, h.id));
      if (selected) body.append(this.masteryPanel(save, h.id));
      if (selected) skills = this.skillPanel(save, h.id);
      // The skill tree goes after the selected hero, or after the newly unlocked ones if any.
      if (skills && (lastFresh ? h.id === lastFresh : selected)) { body.append(skills); skills = null; }
    }
    if (skills) body.append(skills);
    this.justPicked = null;
    body.append(this.flairPanel(save));
  }

  /** The Veteran look toggle under the picked hero (opens after VET_NIGHTS nights with them). */
  private vetLookRow(save: SaveData, id: HeroId): HTMLElement {
    const open = vetLookOpen(save, id), on = vetLookOn(save, id);
    const xp = save.heroes[id]?.xp ?? 0;
    const name = id === "cleric" ? "Golden robes" : id === "ranger" ? "Crimson King" : "Veteran look";
    const b = el("button", `lgv-row${open ? "" : " locked"}${on ? " on" : ""}`);
    const sw = el("div", "lgv-swatch");
    b.append(sw, el("div", "lgv-text", open ? `🎖️ ${name}` : `🔒 ${name}`), el("div", "lgv-state", open ? (on ? "Wearing ✓" : "Tap to wear") : `${Math.min(xp, VET_NIGHTS)} / ${VET_NIGHTS} nights`));
    b.onclick = () => {
      if (!open) return this.denied(b);
      this.cb.onClick();
      this.cb.onHeroLook?.(id, !on);
    };
    return b;
  }

  /** Hero mastery: three goals, then the capstone (an empowered ability). */
  private masteryPanel(save: SaveData, hero: HeroId): HTMLElement {
    const done = mastered(save, hero);
    const box = el("div", `lgs-panel lgy-panel${done ? " done" : ""}`);
    const goals = masteryGoals(save, hero);
    const n = goals.filter((g) => g.cur >= g.goal).length;
    const head = el("div", "lgs-head");
    head.append(el("div", "lgs-title", done ? "🏅 Mastered!" : "🏅 Mastery"), el("div", `lgs-pts${done ? " has" : ""}`, `${n} / 3`));
    box.append(head);
    for (const g of goals) {
      const ok = g.cur >= g.goal;
      const row = el("div", `lgy-row${ok ? " ok" : ""}`);
      const bar = el("div", "lgg-bar");
      const fill = el("i", "");
      fill.style.width = `${Math.min(100, (g.cur / g.goal) * 100)}%`;
      bar.append(fill);
      const mid = el("div", "lgg-mid");
      mid.append(el("div", "lgg-text", `${g.icon} ${g.text}`), bar);
      row.append(mid, el("div", "lgy-num", ok ? "✔" : `${Math.min(g.cur, g.goal)} / ${g.goal}`));
      box.append(row);
    }
    box.append(el("div", "lgy-perk", `${done ? "⚡ Active:" : "🔒 Reward:"} ${masteryPerk(hero)}`));
    return box;
  }

  /** Cosmetic hero flair: a trail or halo worn by whichever hero you play. */
  private flairPanel(save: SaveData): HTMLElement {
    const panel = el("div", "lgs-panel lgf-panel");
    const head = el("div", "lgs-head");
    const owned = FLAIRS.filter((f) => f.unlocked(save)).length;
    head.append(el("div", "lgs-title", "Hero flair"), el("div", "lgs-pts", `${owned - 1} / ${FLAIRS.length - 1}`));
    panel.append(head);
    const active = activeFlair(save);
    const chipFor = (f: (typeof FLAIRS)[number]) => {
      const open = f.unlocked(save);
      const on = active === f.id;
      const shop = !!f.price && !open;
      const chip = el("button", `lgf-chip${on ? " on" : ""}${open ? "" : " locked"}${shop ? " shop" : ""}${shop && save.gold >= f.price! ? " afford" : ""}`);
      chip.append(el("div", "lgf-icon", open || shop ? f.icon : "🔒"), el("div", "lgf-name", f.name), el("div", "lgf-how", on ? "Wearing" : open ? "Tap to wear" : shop ? `● ${f.price}` : f.how));
      if (open && !on)
        chip.onclick = () => {
          this.cb.onClick();
          this.cb.onFlair?.(f.id);
        };
      else if (shop) {
        let armed = false;
        chip.onclick = () => {
          if (save.gold < f.price!) return this.denied(chip);
          if (!armed) {
            armed = true;
            chip.classList.add("confirm");
            chip.querySelector(".lgf-how")!.textContent = "Tap again to buy";
            window.setTimeout(() => { armed = false; chip.classList.remove("confirm"); chip.querySelector(".lgf-how")!.textContent = `● ${f.price}`; }, 2600);
            return;
          }
          this.cb.onBuyFlair?.(f.id);
        };
      } else if (!open) chip.onclick = () => this.denied(chip);
      return chip;
    };
    const grid = el("div", "lgf-grid");
    for (const f of FLAIRS) if (!f.price) grid.append(chipFor(f));
    panel.append(grid);
    // Royal Bazaar: flairs for gold.
    panel.append(el("div", "lgf-bazaar", "🛒 Royal Bazaar — flairs for gold"));
    const shop = el("div", "lgf-grid");
    for (const f of FLAIRS) if (f.price) shop.append(chipFor(f));
    panel.append(shop);
    return panel;
  }

  /** The selected hero's skill tree: XP toward the next point, then three branches of three. */
  private skillPanel(save: SaveData, hero: HeroId): HTMLElement {
    const p = save.heroes[hero];
    const panel = el("div", "lgs-panel");
    const head = el("div", "lgs-head");
    const next = nextSkillThreshold(p.xp);
    const pts = freePoints(p);
    head.append(el("div", "lgs-title", `${HERO_BY_ID[hero].name}'s skills`), el("div", `lgs-pts${pts ? " has" : ""}`, `★ ${pts}`));
    panel.append(head);
    const bar = el("div", "trophy-bar lgs-xp");
    const fill = el("div", "trophy-fill");
    const prev = [0, ...SKILL_THRESHOLDS].filter((t) => t <= p.xp).pop() ?? 0;
    fill.style.width = next ? `${((p.xp - prev) / (next - prev)) * 100}%` : "100%";
    bar.append(fill, el("div", "trophy-num", next ? `${p.xp} / ${next} nights · next skill point` : `${p.xp} nights · all points earned`));
    panel.append(bar);
    const grid = el("div", "lgs-grid");
    for (const b of SKILL_BRANCHES) {
      const col = el("div", "lgs-col");
      col.append(el("div", "lgs-branch", `${b.icon} ${b.name}`));
      for (const sk of SKILLS.filter((x) => x.branch === b.id).sort((x, y) => x.tier - y.tier)) {
        const learned = p.skills.includes(sk.id);
        const can = canLearn(p, sk.id);
        const node = el("button", `lgs-node${learned ? " learned" : can ? " can" : ""}${this.justLearned === sk.id ? " just" : ""}`);
        node.append(el("div", "lgs-icon", sk.icon), el("div", "lgs-name", sk.name), el("div", "lgs-desc", sk.desc));
        node.setAttribute("aria-label", `${sk.name}: ${sk.desc}${learned ? ", learned" : can ? ", tap to learn" : ""}`);
        if (can)
          node.onclick = () => {
            this.cb.onClick();
            this.justLearned = sk.id;
            this.cb.onLearnSkill?.(hero, sk.id);
          };
        else if (!learned) node.onclick = () => this.denied(node);
        col.append(node);
      }
      grid.append(col);
    }
    panel.append(grid);
    const foot = el("div", "lgs-foot");
    foot.append(el("span", "", "Earn skill points by surviving nights with this hero."));
    if (p.skills.length) foot.append(this.button("Reset", "btn btn-ghost btn-mini lgs-reset", () => this.cb.onResetSkills?.(hero)));
    panel.append(foot);
    this.justLearned = null;
    return panel;
  }

  /** Ascension card: ready (every upgrade maxed), the Crowns earned so far, or a teaser. */
  private ascendCard(save: SaveData): HTMLElement {
    const cr = save.crowns ?? 0;
    const bonus = (n: number) => `+${Math.round(ASCEND.power * n * 100)}% damage & wall HP · +${Math.round(ASCEND.gold * n * 100)}% gold`;
    if (canAscend(save)) {
      const box = el("div", "lga-card ready");
      box.append(el("div", "lga-crown", "👑"), el("div", "lga-title", `Ascend — earn Crown ${cr + 1}`));
      box.append(el("div", "lga-desc", `Every upgrade resets to 0 and you buy them back. Forever after: ${bonus(cr + 1)}. Upgrades cost +${Math.round(ASCEND.cost * 100)}% per Crown.`));
      let armed = false;
      const go = this.button("👑 Ascend", "btn lga-btn", () => {
        if (!armed) {
          armed = true;
          go.textContent = "Tap again to Ascend";
          go.classList.add("confirm");
          window.setTimeout(() => { armed = false; go.textContent = "👑 Ascend"; go.classList.remove("confirm"); }, 2600);
          return;
        }
        this.cb.onAscend?.();
      });
      box.append(go);
      return box;
    }
    if (cr > 0) {
      const box = el("div", "lga-card");
      box.append(el("div", "lga-title", `${"👑".repeat(Math.min(cr, 5))}${cr > 5 ? ` ×${cr}` : ""} Crown${cr > 1 ? "s" : ""}: ${bonus(cr)}`));
      if (cr < ASCEND.maxCrowns) box.append(el("div", "lga-desc", "Max every upgrade again to earn the next Crown."));
      return box;
    }
    return el("div", "lga-tease", "👑 Max every upgrade to unlock Ascension");
  }

  /** Full-screen crown drop after ascending. */
  celebrateAscend(crowns: number): void {
    const fx = el("div", "lga-celebrate");
    fx.append(el("div", "lga-rays"), el("div", "lga-big", "👑"), el("div", "lga-big-text", `Crown ${crowns}!`), el("div", "lga-big-sub", "The Armory is yours to rebuild"));
    document.body.append(fx);
    window.setTimeout(() => fx.classList.add("out"), 2300);
    window.setTimeout(() => fx.remove(), 2800);
  }

  private armoryTab(body: HTMLElement, save: SaveData): void {
    body.append(el("div", "hub-hint", "Permanent upgrades. Every run earns gold — even the ones you lose."));
    body.append(this.ascendCard(save));
    const grid = el("div", "perm-grid");
    for (const p of PERMS) {
      const lvl = save.perms[p.id] ?? 0;
      const maxed = lvl >= p.max;
      const text = p.desc;
      const buyable = !maxed && canBuy(save, p.id);
      const open = permOpen(save, p);
      const card = el("button", `perm${maxed ? " maxed" : buyable ? " buyable" : " poor"}${open ? "" : " lgl-locked"}`);
      const just = this.justBought?.id === p.id;
      if (just) card.classList.add("just");
      const pips = el("div", "perm-pips");
      for (let i = 0; i < p.max; i++) pips.append(el("i", i < lvl ? (just && i === lvl - 1 ? "on new" : "on") : ""));
      if (just) card.append(el("div", "perm-spent", `−${this.justBought!.cost}`));
      card.append(
        el("div", "perm-icon", p.icon),
        el("div", "perm-name", p.name),
        el("div", "perm-desc", lvl === 0 ? `Next: ${text(1)}` : maxed ? text(lvl) : upgradeText(text(lvl), text(lvl + 1))),
        pips,
        el("div", "perm-cost", maxed ? "MAX" : open ? `● ${permCost(p, lvl, save.crowns ?? 0)}` : "🔒 Max all others"),
      );
      if (!maxed && open)
        card.onclick = () => {
          if (!canBuy(save, p.id)) {
            // Not enough gold: a quick "no" shake instead of a silent re-render.
            this.denied(card);
            return;
          }
          this.cb.onClick();
          this.justBought = { id: p.id, cost: permCost(p, lvl, save.crowns ?? 0) };
          this.cb.onBuy(p.id);
        };
      grid.append(card);
    }
    body.append(grid);
    this.justBought = null;
    body.append(
      this.button("Reset progress", "link-btn", () => this.confirmReset(save)),
    );
  }

  /**
   * Save-code panel. Export: shows the code with a Copy button. Import: paste box; `onLoad` returns
   * false for an invalid code, which is reported inline.
   */
  showSaveCode(mode: "export" | "import", onBack: () => void, opts: { code?: string; onLoad?: (code: string) => boolean; current?: SaveData }): void {
    const box = el("div", "panel pop-in");
    box.append(el("h1", "title", mode === "export" ? "Save code" : "Load save"));
    box.append(el("p", "sub", mode === "export" ? "Keep this code somewhere safe — paste it on any device to restore your progress." : "Paste a save code. This replaces your current progress."));
    const area = document.createElement("textarea");
    area.className = "code-box";
    area.spellcheck = false;
    if (mode === "export") {
      area.readOnly = true;
      area.value = opts.code ?? "";
    } else area.placeholder = "LG1:…";
    const status = el("div", "code-status");
    box.append(area, status);
    const col = el("div", "btn-col");
    if (mode === "export")
      col.append(
        this.button("📋 Copy", "btn", () => {
          area.select();
          const ok = () => ((status.textContent = "Copied! ✔"), status.classList.remove("bad"));
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(area.value).then(ok, () => (status.textContent = "Select the text above and copy it."));
          else status.textContent = "Select the text above and copy it.";
        }),
      );
    else
      col.append(
        // Two steps: the first tap shows what's in the code next to your current progress (loading
        // an older backup by mistake would wipe newer progress for good); the second replaces it.
        (() => {
          let armed = "";
          const load = this.button("📥 Load", "btn", () => {
            const code = area.value.trim();
            if (!code) return;
            const parsed = importSave(code);
            if (!parsed) {
              armed = "";
              load.textContent = "📥 Load";
              status.textContent = "That doesn't look like a Last Gate save code.";
              status.classList.add("bad");
              return;
            }
            if (armed !== code) {
              armed = code;
              const sum = (sv: SaveData) => `★ ${totalStars(sv)} · ${sv.gold.toLocaleString()} gold · ${sv.runs} runs`;
              status.classList.remove("bad");
              status.textContent = `This code: ${sum(parsed)}${opts.current ? `\nYours now: ${sum(opts.current)}` : ""}`;
              load.textContent = "⚠️ Replace my progress";
              return;
            }
            if (!opts.onLoad?.(code)) {
              status.textContent = "That doesn't look like a Last Gate save code.";
              status.classList.add("bad");
            }
          });
          area.addEventListener("input", () => { armed = ""; load.textContent = "📥 Load"; });
          return load;
        })(),
      );
    col.append(this.button("Back", "btn btn-ghost", onBack));
    box.append(col);
    this.show(box);
    if (mode === "export") area.select();
    else area.focus();
  }

  /** Themed "are you sure" panel for wiping the save. */
  private confirmReset(save: SaveData): void {
    const box = el("div", "panel pop-in");
    box.append(
      el("h1", "title", "Erase progress?"),
      el("p", "sub", "Gold, stars, upgrades, heroes and trophies will be wiped. This cannot be undone."),
    );
    const col = el("div", "btn-col");
    col.append(
      this.button("Keep my progress", "btn", () => this.showHub(save, "armory")),
      // One-tap backup before wiping (Back returns here).
      this.button("📋 Copy save code first", "btn btn-ghost btn-small2", () => this.showSaveCode("export", () => this.confirmReset(save), { code: exportSave(save) })),
      this.button("Erase everything", "btn btn-ghost confirm", () => this.cb.onReset()),
    );
    box.append(col);
    this.show(box);
  }

  showEnd(r: RunSummary, reward: RunReward, onAgain: () => void, onMenu: () => void, next?: { name: string; go: () => void }): void {
    const box = el("div", "panel end pop-in");
    // The King himself reacts: standing tall in a burst of light on a win, fallen on a loss.
    const hero = el("div", `end-hero ${r.won || r.endless ? "won" : "lost"}`);
    const fig = document.createElement("img");
    fig.src = r.won || r.endless ? "./sprites/units/king.png" : "./sprites/portraits/king_fallen.png";
    fig.alt = "";
    hero.append(el("div", "end-rays"), fig);
    box.append(hero);
    if (r.daily) {
      box.append(el("h1", r.won ? "title win" : "title lose", r.won ? "Daily cleared!" : "Daily failed"), el("p", "sub", r.won ? "Come back tomorrow for a new twist." : `You reached night ${Math.max(1, r.wave)}. Try again!`));
    } else if (r.endless) {
      const held = Math.max(0, r.wave - 1);
      box.append(el("h1", "title", "Siege over"), el("p", "sub", `The camp held ${held} night${held === 1 ? "" : "s"}.`));
      if (r.record) box.append(el("div", "end-unlock end-record", "🏆 New record!"));
    } else if (r.chapterId === BOSS_RUSH.id) {
      // Boss Rush: count the bosses beaten (losing on night N means N-1 fell).
      const slain = r.won ? BOSS_RUSH.waves.length : Math.max(0, r.wave - 1);
      box.append(
        el("h1", r.won ? "title win" : "title lose", r.won ? "Kingslayer!" : "The hall has fallen"),
        el("p", "sub", r.won ? `Every boss of the realm has fallen — ${slain}/${slain}!` : `Bosses slain: ${slain}/${BOSS_RUSH.waves.length}`),
      );
    } else box.append(
      el("h1", r.won ? "title win" : "title lose", r.won ? "Victory!" : "The hall has fallen"),
      el("p", "sub", r.won ? `${r.chapterName} holds!` : `${r.chapterName} · fell on night ${Math.max(1, r.wave)}`),
    );
    if (r.won && !r.daily) {
      const stars = el("div", "end-stars");
      for (let i = 0; i < 3; i++) {
        const s = el("span", i < reward.stars ? "star on" : "star", "★");
        s.style.animationDelay = `${0.3 + i * 0.25}s`;
        s.style.setProperty("--d", `${0.3 + i * 0.25 + 0.2}s`);
        stars.append(s);
      }
      box.append(stars);
      // How to get the next star (the rule isn't shown anywhere else).
      if (reward.stars < 3 && r.hallPct !== undefined) {
        const need = reward.stars === 1 ? 50 : 80;
        box.append(el("div", "end-nextstar", `${"★".repeat(reward.stars + 1)} needs the hall at ${need}%+ — yours ended at ${r.hallPct}%`));
      }
    }
    const rows = el("div", "end-rows");
    const row = (k: string, v: string, cls = "") => {
      const x = el("div", `end-row ${cls}`);
      const val = el("span", "");
      if (v.startsWith("● ")) val.append(el("i", "coin-dot"), v.slice(2));
      else val.textContent = v;
      x.append(el("span", "", k), val);
      x.style.setProperty("--i", String(rows.childElementCount));
      rows.append(x);
      return val;
    };
    row("Nights survived", `${r.won ? r.wave : Math.max(0, r.wave - 1)}`);
    row("Enemies slain", String(r.kills));
    if (r.bosses) row("Bosses slain", String(r.bosses));
    if (r.heroLevel) row("Hero level reached", String(r.heroLevel));
    if (r.streak && r.streak >= 5) row("Best kill streak", `x${r.streak}${r.streakIsBest ? " · new best!" : ""}`, r.streakIsBest ? "best" : "");
    if (r.flawless) row("Flawless nights", `✨ ${r.flawless}`);
    const secs = Math.round(r.minutes * 60);
    row("Time", `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
    row("Battle loot", `● ${r.coins}`);
    if (reward.waveBonus) row("Nights bonus", `● ${reward.waveBonus}`);
    if (reward.winBonus) row(reward.firstClear ? "First victory bonus" : "Victory bonus", `● ${reward.winBonus}`);
    if (reward.streakBonus) row(`🔥 Streak bonus (${r.dailyStreak ?? 0} days)`, `● ${reward.streakBonus}`, "best");
    if (reward.milestoneBonus) row(`Milestone${reward.milestones!.length > 1 ? "s" : ""}: night ${reward.milestones!.join(", ")}`, `● ${reward.milestoneBonus}`, "best");
    if (reward.heatBonus) row("🔥 Heat bonus", `● ${reward.heatBonus}`, "best");
    const total = row("Gold earned", `● 0`, "total");
    // Rows deal in one by one (CSS, 70 ms apart); the total starts counting once it has landed.
    const nRows = rows.childElementCount;
    countUp(total, reward.gold, (r.won ? 2000 : 900) + 350 + nRows * 70);
    box.append(rows);
    const dmgBox = damageBreakdown(r.dmg);
    if (dmgBox) box.append(dmgBox);
    if (!r.won && r.tip) {
      // The bulb lights up after the stats deal in, so the advice reads as the takeaway.
      const tip = el("div", "end-tip lose-tip");
      tip.append(el("span", "tip-bulb", "💡"), document.createTextNode(` ${r.tip}`));
      box.append(tip);
    }
    if (r.dailyStreak && r.dailyStreak >= 2) box.append(el("div", "end-unlock end-record", `🔥 ${r.dailyStreak}-day streak!`));
    if (reward.hardClear) box.append(el("div", "end-unlock end-record", reward.hardClear >= 2 ? "☠️ Nightmare cleared!" : "💀 Hard cleared! Nightmare unlocked"));
    if (reward.firstClear && r.chapterId < CHAPTERS.length) box.append(el("div", "end-unlock", `🔓 Chapter ${r.chapterId + 1} unlocked!`));
    for (const h of reward.unlockedHeroes) box.append(el("div", "end-unlock", `🔓 New hero: ${HERO_BY_ID[h].name}!`));
    if (r.skillPoints) box.append(el("div", "end-unlock end-record", `⭐ ${r.skillPoints.hero}: +${r.skillPoints.n} skill point${r.skillPoints.n > 1 ? "s" : ""} — spend it in Heroes`));
    if (r.earned?.length) {
      const chips = el("div", "lge-earned");
      chips.append(el("div", "lgm-title", "Earned this run"));
      const row = el("div", "lge-chips");
      for (const t of r.earned.slice(0, 6)) row.append(el("span", "lge-chip", t));
      if (r.earned.length > 6) row.append(el("span", "lge-chip", `+${r.earned.length - 6} more`));
      chips.append(row);
      box.append(chips);
    }
    if (r.questsReady) box.append(el("div", "end-unlock lgq-end", `📜 ${r.questsReady} quest${r.questsReady === 1 ? "" : "s"} ready to claim in Trophies`));
    box.querySelectorAll<HTMLElement>(".end-unlock").forEach((u, i) => u.style.setProperty("--d", `${0.45 + nRows * 0.07 + i * 0.15}s`));
    const btns = el("div", "btn-col");
    const upLabel = "Upgrades & map";
    if (next) btns.append(this.button(`Next: ${next.name} ▶`, "btn btn-next", next.go), this.button("Upgrades & map", "btn btn-ghost", onMenu), this.button("Play again", "btn btn-ghost btn-mini", onAgain));
    else btns.append(this.button(r.endless ? "New siege ▶" : r.won ? "Play again" : "Try again", "btn btn-again", onAgain), this.button("Upgrades & map", "btn btn-ghost", onMenu));
    if (r.upgradesReady) {
      const up = [...btns.querySelectorAll(".btn")].find((b) => b.textContent === upLabel);
      up?.classList.add("has-badge");
      up?.append(el("span", "btn-badge", `${r.upgradesReady} ready`));
    }
    box.append(btns);
    // Let the final moment (fireworks on a win) play before the panel covers it.
    setTimeout(() => {
      this.show(box);
      if (r.won || (r.endless && r.record)) this.overlay.append(confetti(r.chapterId));
    }, r.won ? 2000 : 900);
  }

  /** Settings from the menu: the same switches as the pause menu, plus how-to-play. */
  /** Volume slider under the Music / Sound effects toggles. */
  /** Graphics row: tap cycles Auto → Smooth → Pretty (shown before the toggles). */
  private appendQuality(grid: HTMLElement): void {
    const q = this.quality;
    if (!q) return;
    const NAMES: Record<Quality, string> = { auto: "Auto", smooth: "Smooth", pretty: "Pretty" };
    const HINT: Record<Quality, string> = { auto: "adjusts to your device", smooth: "fastest, simpler effects", pretty: "every effect, sharpest" };
    const row = el("button", "setting lgq-row");
    const val = el("span", "lgq-val");
    const hint = el("span", "lgq-hint");
    const paint = () => {
      val.textContent = NAMES[q.get()];
      hint.textContent = HINT[q.get()];
    };
    const left = el("span", "lgq-left");
    left.append(el("span", "", "✨ Graphics"), hint);
    row.append(left, val);
    paint();
    row.onclick = () => {
      this.cb.onClick();
      q.set(QUALITIES[(QUALITIES.indexOf(q.get()) + 1) % QUALITIES.length]!);
      paint();
    };
    grid.append(row);
  }

  private appendVolume(grid: HTMLElement, k: string): void {
    if (!this.volume || (k !== "music" && k !== "sfx")) return;
    const ch = k;
    const wrap = el("label", "vol-row");
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = String(Math.round(this.volume.get(ch) * 100));
    input.className = "vol";
    input.setAttribute("aria-label", ch === "music" ? "Music volume" : "Sound effects volume");
    const pct = el("span", "vol-pct", `${input.value}%`);
    input.oninput = () => {
      pct.textContent = `${input.value}%`;
      this.volume?.set(ch, Number(input.value) / 100);
    };
    // Let go of the effects slider: play a sample so you can hear the new level.
    if (ch === "sfx") input.onchange = () => this.cb.onClick();
    wrap.append(el("span", "vol-label", "Volume"), input, pct);
    grid.append(wrap);
  }

  showSettings(values: Record<string, boolean>, onToggle: (k: string) => void, onHowTo: () => void, onBack: () => void, backup?: { onExport: () => void; onImport: () => void }): void {
    const box = el("div", "panel pop-in");
    box.append(el("h1", "title", "Settings"));
    const grid = el("div", "settings");
    const labels: Record<string, string> = settingLabels();
    this.appendQuality(grid);
    for (const k of Object.keys(labels)) {
      const row = el("button", `setting${values[k] ? " on" : ""}`);
      row.setAttribute("aria-pressed", String(!!values[k]));
      row.append(el("span", "", labels[k]!), el("span", "switch"));
      row.onclick = () => {
        this.cb.onClick();
        onToggle(k);
        row.classList.toggle("on", values[k]);
        row.setAttribute("aria-pressed", String(!!values[k]));
      };
      grid.append(row);
      this.appendVolume(grid, k);
    }
    box.append(grid);
    const col = el("div", "btn-col");
    col.append(this.button("How to play", "btn btn-ghost", onHowTo));
    const replay = this.button("↺ Replay tutorial & hints", "btn btn-ghost btn-small2", () => {
      for (const k of HINT_FLAGS) removeItem(k);
      replay.textContent = "✔ They'll show again";
      replay.disabled = true;
    });
    col.append(replay);
    if (canPromptInstall())
      col.append(
        this.button("📲 Install app", "btn btn-ghost", () => {
          void promptInstall().then(() => onBack());
        }),
      );
    else if (needsIosHint()) col.append(el("div", "end-tip", "📲 Play full-screen: tap Share, then “Add to Home Screen”."));
    if (backup) {
      const row = el("div", "backup-row");
      row.append(this.button("📋 Copy save code", "btn btn-ghost btn-small2", backup.onExport), this.button("📥 Load save code", "btn btn-ghost btn-small2", backup.onImport));
      col.append(row);
    }
    col.append(this.button("Back", "btn", onBack));
    box.append(col, el("div", "settings-foot", "Progress is saved on this device — use a save code to move it. · v1.0"));
    this.show(box);
  }

  showPause(onResume: () => void, onQuit: () => void, settings?: { values: Record<string, boolean>; onToggle: (k: string) => void }, build?: HTMLElement | null, note?: string, status?: string[], quitLabel = "Abandon run"): void {
    const box = el("div", "panel pop-in");
    box.append(el("h1", "title", "Paused"));
    if (status?.length) {
      const strip = el("div", "pick-recap pause-status");
      for (const s of status) strip.append(el("span", "", s));
      box.append(strip);
    }
    if (note) box.append(el("div", "end-tip", note));
    if (build) box.append(build);
    if (settings) {
      const grid = el("div", "settings");
      const labels: Record<string, string> = settingLabels();
      this.appendQuality(grid);
      for (const k of Object.keys(labels)) {
        const row = el("button", `setting${settings.values[k] ? " on" : ""}`);
        row.setAttribute("aria-pressed", String(!!settings.values[k]));
        row.append(el("span", "", labels[k]!), el("span", "switch"));
        row.onclick = () => {
          this.cb.onClick();
          settings.onToggle(k);
          row.classList.toggle("on", settings.values[k]);
          row.setAttribute("aria-pressed", String(!!settings.values[k]));
        };
        grid.append(row);
        this.appendVolume(grid, k);
      }
      box.append(grid);
    }
    const col = el("div", "btn-col");
    // Abandoning ends the run, so it takes a second tap to confirm.
    let armed = false;
    const quit = this.button(quitLabel, "btn btn-ghost btn-quit", () => {
      if (armed) return onQuit();
      armed = true;
      quit.textContent = `Tap again to ${quitLabel.split(" ")[0]!.toLowerCase()}`;
      quit.classList.add("confirm");
      setTimeout(() => {
        armed = false;
        quit.textContent = quitLabel;
        quit.classList.remove("confirm");
      }, 2500);
    });
    col.append(this.button("Resume", "btn", onResume), quit);
    box.append(col);
    this.show(box);
  }
}

/** Ticks the last text node of `host` from 0 to `to` after `delayMs`, then pops it. */
const HERO_SEEN_KEY = "lastgate.seenHeroes";
/** Unlocked heroes the player hasn't seen on the Heroes tab yet (none on a save with no record). */
function freshHeroes(save: SaveData): string[] {
  const stored = getJson<unknown>(HERO_SEEN_KEY, null);
  const open = HEROES.filter((h) => heroUnlocked(save, h.id)).map((h) => h.id);
  if (!Array.isArray(stored)) {
    setItem(HERO_SEEN_KEY, JSON.stringify(open));
    return [];
  }
  return open.filter((id) => !(stored as string[]).includes(id));
}

/** Trophy claimed: a burst of coins arcs from the claimed row up into the gold counter, which bumps as they land. */
/** Coins arc between two elements: trophy → gold counter on a claim, gold counter → upgrade on a
 *  purchase. `bumpTarget` bumps the gold counter as the coins land. */
function flyCoins(root: HTMLElement, fromSel: string, toSel: string, bumpTarget: boolean): void {
  const from = root.querySelector<HTMLElement>(fromSel);
  const to = root.querySelector<HTMLElement>(toSel);
  if (!from || !to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const host = root.getBoundingClientRect();
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const sx = (bumpTarget ? a.right - a.width * 0.2 : a.left + 8) - host.left, sy = a.top + a.height / 2 - host.top;
  const ex = (bumpTarget ? b.left + 8 : b.left + b.width / 2) - host.left, ey = b.top + b.height / 2 - host.top;
  const n = bumpTarget ? 10 : 7;
  for (let i = 0; i < n; i++) {
    const c = el("i", "fly-coin");
    root.append(c);
    const jx = ((i * 37) % 23) - 11, jy = ((i * 53) % 19) - 9;
    const mx = (sx + ex) / 2 + jx * 3, my = Math.min(sy, ey) - 40 - ((i * 17) % 30);
    const anim = c.animate(
      [
        { transform: `translate(${sx + jx}px, ${sy + jy}px) scale(0.4)`, opacity: 0 },
        { transform: `translate(${sx + jx * 2}px, ${sy + jy - 10}px) scale(1.1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${ex}px, ${ey}px) scale(0.6)`, opacity: 0.9 },
      ],
      { duration: 650 + i * 45, delay: i * 35, easing: "cubic-bezier(.45,0,.55,1)", fill: "both" },
    );
    anim.onfinish = () => {
      c.remove();
      if (bumpTarget && (i === n - 1 || i === Math.floor(n / 2))) {
        to.classList.remove("spent");
        void to.offsetWidth;
        to.classList.add("spent");
      }
    };
  }
}

function countUp(host: HTMLElement, to: number, delayMs: number): void {
  const text = host.lastChild as Text;
  const dur = Math.min(1200, 300 + to * 4);
  setTimeout(() => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      text.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(tick);
      else host.classList.add("pop");
    };
    requestAnimationFrame(tick);
  }, delayMs);
}

/** "Wall HP +30%" + "Wall HP +40%" → "Wall HP +30→40%": what the next purchase changes, in place. */
export function upgradeText(now: string, next: string): string {
  const a = now.split(/(\d+)/);
  const b = next.split(/(\d+)/);
  if (a.length === b.length && a.every((part, i) => i % 2 === 1 || part === b[i])) {
    const diffs = a.filter((part, i) => i % 2 === 1 && part !== b[i]).length;
    if (diffs === 1) return a.map((part, i) => (i % 2 === 1 && part !== b[i] ? `${part}→${b[i]}` : part)).join("");
  }
  return `Next: ${next}`;
}

/** A one-shot confetti shower behind the victory panel (CSS-only; hidden under reduced motion). */
/** Confetti colours per chapter, so each victory feels like that land (gold + white in every mix). */
const CONFETTI_COLORS: Record<number, string[]> = {
  1: ["#ffd84a", "#5ec43a", "#9be36a", "#4a9cff", "#ff7a2a", "#ffffff"], // Border Keep: meadow
  2: ["#ffd84a", "#7bbf3a", "#3f9a6a", "#b8d86a", "#c9a24a", "#ffffff"], // Goblin Marsh: bog greens
  3: ["#ffd84a", "#c0c6cf", "#8a96a6", "#ff7a2a", "#5a7cb8", "#ffffff"], // Iron Road: steel + sparks
  4: ["#ffd84a", "#9a6cff", "#5a4ab8", "#ff5a8a", "#6ad0ff", "#ffffff"], // Hollow Night: violet
  5: ["#ffd84a", "#ff4a3a", "#ffb02a", "#c9a24a", "#ff7a2a", "#ffffff"], // The Last Gate: royal fire
  6: ["#ffd84a", "#bfe8ff", "#6ad0ff", "#4a9cff", "#e8f6ff", "#ffffff"], // Frostpeak: ice
  7: ["#ffd84a", "#ff5a2a", "#ff9a2a", "#ffcf4a", "#b03a2a", "#ffffff"], // Ashen Caldera: embers
  8: ["#ffd84a", "#3ac9b8", "#2a8ac9", "#7be3d0", "#5a6cff", "#ffffff"], // Sunken Citadel: tide
  9: ["#ffd84a", "#d83a4a", "#8a2a5a", "#ff8a7a", "#5a1a3a", "#ffffff"], // Bloodmoon Moors: crimson + plum
  10: ["#ffd84a", "#b89aff", "#6a5aaa", "#e8e0ff", "#3a2a5a", "#ffffff"], // The Hollow Throne: violet + bone
};
const CONFETTI_DEFAULT = ["#ffd84a", "#ff7a2a", "#5ec43a", "#4a9cff", "#ff5a8a", "#ffffff"];

function confetti(chapterId = 0): HTMLElement {
  const layer = el("div", "confetti");
  const colors = CONFETTI_COLORS[chapterId] ?? CONFETTI_DEFAULT;
  for (let i = 0; i < 42; i++) {
    // Golden-ratio spread: even coverage without randomness.
    const f = (i * 0.618034) % 1;
    const bit = el("i", "");
    bit.style.left = `${(f * 100).toFixed(1)}%`;
    bit.style.background = colors[i % colors.length]!;
    bit.style.animationDelay = `${((i * 0.37) % 1.4).toFixed(2)}s`;
    bit.style.animationDuration = `${(2.2 + ((i * 0.53) % 1.3)).toFixed(2)}s`;
    bit.style.setProperty("--drift", `${Math.round(((i * 0.29) % 1) * 80 - 40)}`);
    layer.append(bit);
  }
  return layer;
}

/** Tapped something that isn't available yet: a quick sideways "no" shake instead of silence. */
function nope(node: HTMLElement): void {
  node.classList.remove("nope");
  void node.offsetWidth;
  node.classList.add("nope");
}

/** Gold for the header: thousands separators up to 99,999, then compact ("124k", "1.2M"). */
export function fmtGold(n: number): string {
  if (n < 100_000) return n.toLocaleString("en-US");
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${(Math.floor(n / 100_000) / 10).toFixed(1)}M`;
}

/** Final-boss icons for the map's last stop. */
const BOSS_ICON: Record<string, string> = { warlord: "⚔️", hag: "🧙", golem: "🗿", dragon: "🐉", colossus: "🛡️", frostwyrm: "❄️", magma: "🌋", drowned: "🔱", bloodlord: "🌕", hollowking: "💀" };

/** Bestiary art: painted portraits where they exist, emoji for the rest. */
const FOE_PORTRAIT: Record<string, string> = {
  footman: "enemy_footman", runner: "enemy_footman", banner: "enemy_footman", shield: "enemy_shield", brute: "enemy_brute",
  crossbow: "enemy_crossbow", knight: "enemy_knight", shaman: "enemy_shaman", wraith: "enemy_wraith", stalker: "enemy_stalker", sapper: "enemy_sapper",
  tunneler: "enemy_sapper", phalanx: "enemy_shield", climber: "enemy_goblin", goblin: "enemy_goblin", mob: "enemy_mob", thief: "enemy_thief", hag: "elite_mage", hollowking: "hollowking",
};
const FOE_EMOJI: Record<string, string> = {
  bat: "🦇", raven: "🐦‍⬛", imp: "👺", bomber: "🎈", ram: "🪵", ogre: "👹", troll: "🧌", golem: "🗿", dragon: "🐉", colossus: "🛡️",
  frostwyrm: "❄️", magma: "🌋", drowned: "🔱", warlord: "⚔️", bloodlord: "🌕", hollowking: "💀",
};

/** Same icons as the in-run ability button, so the Heroes tab and the battle match. */
const ABILITY_ICON: Record<string, string> = { arrowRain: "☔", shieldBash: "🛡️", fireNova: "🔥", overclock: "⚙️", snare: "🕸️", lance: "🔱", sanctuary: "✨", callToArms: "📯", acidFlask: "🧪" };

/** Scroll `node` near the top of its scrolling ancestor by layout position (ignores entrance-animation transforms). */
function scrollToLayout(node: HTMLElement): void {
  let box = node.parentElement;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (!box) return;
  let top = 0;
  for (let e: HTMLElement | null = node; e && e !== box; e = e.offsetParent as HTMLElement | null) top += e.offsetTop;
  box.scrollTop = Math.max(0, top - 12);
}
