import { getJson, removeItem, setItem } from "./store";
import { HINT_FLAGS } from "./save";
import { canVibrate } from "./settings";
import { exportSave } from "./save";
import { canPromptInstall, needsIosHint, promptInstall } from "./install";
import { CHAPTER_BY_ID, CHAPTERS, ENDLESS } from "../core/chapters";
import { DAILY_BONUS, dailyFor, dailyStreakBonus, liveDailyStreak, timeToNextDaily, todayString } from "../core/daily";
import { BLESSING_BY_ID } from "../camp/blessings";
import { ENEMIES, enemyTraits } from "../core/enemies";
import { ACHIEVEMENTS, claimable, foeMet, foesMet, heroHasWon } from "../core/achievements";
import { canLearn, freePoints, nextSkillThreshold, SKILL_BRANCHES, SKILL_THRESHOLDS, SKILLS } from "../core/skills";
import { historySummary, weekSummary } from "../core/history";
import { weekNumber } from "../core/quests";
import { endlessTwistFor } from "../core/endlessMods";
import { activeFlair, FLAIRS } from "../core/flair";
import { DIFF_BY_ID, DIFFICULTIES, difficultyOpen, type DifficultyId } from "../core/difficulty";
import { questsReady, questViews, refreshQuests } from "../core/quests";
import { HERO_BY_ID, HEROES, type HeroId } from "../core/heroes";
import { canBuy, permOpen, chapterUnlocked, endlessMilestoneReward, nextEndlessMilestone, heroUnlocked, PERMS, permCost, totalStars, type RunReward, type SaveData } from "../core/meta";
import { CAMP_HEROES } from "../camp/meta";

/** Painted portraits cut from the owner's character sheet. */
const HERO_PORTRAIT: Record<string, string> = {
  ranger: "./sprites/portraits/king.png",
  knight: "./sprites/portraits/knight.png",
  pyro: "./sprites/portraits/pyro.png",
  engineer: "./sprites/portraits/engineer.png",
  warden: "./sprites/portraits/huntress.png",
  lancer: "./sprites/portraits/lancer.png",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const DMG_LABEL: Record<string, [string, string]> = {
  towers: ["🏹", "Archer towers"], hero: ["🗡️", "Your hero"], catapults: ["🪨", "Catapults"], soldiers: ["⚔️", "Soldiers"],
  mage: ["🔮", "Mage Tower"], fire: ["🔥", "Burning"], spikes: ["🪤", "Spike trap"], storm: ["⚡", "Lightning"], lava: ["🌋", "Lava"],
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
  return l;
}

export interface HubCallbacks {
  onClick: () => void;
  onDaily: () => void;
  onPlay: (chapter: number) => void;
  onSelectHero: (id: HeroId) => void;
  onBuy: (permId: string) => void;
  onReset: () => void;
  onClaim: (id: string) => void;
  /** Learn / reset a hero skill (Heroes tab). */
  onLearnSkill?: (hero: HeroId, id: string) => void;
  onResetSkills?: (hero: HeroId) => void;
  /** Picked a cosmetic hero flair. */
  onFlair?: (id: string) => void;
  /** Picked a campaign difficulty. */
  onDifficulty?: (id: DifficultyId) => void;
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
  private justClaimed: { id: string; reward: number } | null = null;
  /** Hero just picked, celebrated on the next render. */
  private justPicked: string | null = null;
  /** Live volume control for the settings screens (set by the game). */
  volume: { get: (k: "music" | "sfx") => number; set: (k: "music" | "sfx", v: number) => void } | null = null;

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
    this.tab = tab;
    if (refreshQuests(save)) this.cb.onQuestsChanged?.();
    const wrap = el("div", "hub");
    const head = el("div", "hub-head");
    const titleRow = el("div", "hub-title-row");
    titleRow.append(el("h1", "title", "Last Gate"), Object.assign(this.button("⚙", "gear-btn", () => this.cb.onSettings()), { title: "Settings", ariaLabel: "Settings" }));
    head.append(titleRow);
    const res = el("div", "hub-res");
    res.append(el("span", `res-gold${this.justBought || this.justClaimed ? " spent" : ""}`, `● ${fmtGold(save.gold)}`), el("span", "res-stars", `★ ${totalStars(save)}/${CHAPTERS.length * 3} · 🏆 ${save.claimed.length}/${ACHIEVEMENTS.length}`));
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
      if (id === "heroes" && freshHeroes(save).length) t.append(el("span", "tab-badge", "NEW"));
      else if (id === "heroes" && HEROES.some((h) => heroUnlocked(save, h.id) && freePoints(save.heroes[h.id]) > 0)) t.append(el("span", "tab-badge", "⭐"));
      t.setAttribute("aria-label", `${names[id]}${extra}${id === "armory" && affordable ? `, ${affordable} affordable` : ""}`);
      tabs.append(t);
    }
    wrap.append(tabs);
    this.coachmark(wrap, tabs, save, tab);
    const claimedNow = !!this.justClaimed, boughtNow = !!this.justBought;
    // Slide the content in only when the tab actually changes (not on re-renders after a purchase).
    const body = el("div", `hub-body${tab !== this.renderedTab ? " tab-in" : ""}`);
    this.renderedTab = tab;
    if (tab === "battle") this.battleTab(body, save);
    else if (tab === "heroes") this.heroesTab(body, save);
    else if (tab === "trophies") this.trophiesTab(body, save);
    else this.armoryTab(body, save);
    // Entrance stagger for the other tabs' cards (the chapter list sets its own --i).
    body.querySelectorAll<HTMLElement>(".hero, .perm, .trophy").forEach((e, i) => e.style.setProperty("--i", String(Math.min(i, 10))));
    wrap.append(body);
    this.show(wrap);
    if (claimedNow) requestAnimationFrame(() => flyCoins(wrap, ".trophy.just", ".res-gold", true));
    else if (boughtNow) requestAnimationFrame(() => flyCoins(wrap, ".res-gold", ".perm.just", false));
  }

  private battleTab(body: HTMLElement, save: SaveData): void {
    body.append(el("div", "hub-hint", `Hero: ${HERO_BY_ID[save.hero].name} — pick a battlefield`));
    const news = this.newsCard(save);
    if (news) body.append(news);
    if ((save.stars[1] ?? 0) > 0) body.append(this.dailyCard(save));
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
    const nowOpen: number[] = [];
    for (const ch of CHAPTERS) {
      const unlocked = chapterUnlocked(save, ch.id);
      if (unlocked) nowOpen.push(ch.id);
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
      body.append(card);
    }
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
    setItem(seenKey, JSON.stringify(nowOpen));
    card.style.setProperty("--g1", "#5a2a6a");
    card.style.setProperty("--g2", "#3a1a4a");
    const left = el("div", "ch-left");
    left.append(el("div", "ch-num", "Endless"), el("div", "ch-name", ENDLESS.name), el("div", "ch-blurb", open ? ENDLESS.blurb : "Clear chapter 1 to unlock"));
    if (open) left.append(el("div", "ch-affix", ENDLESS.affixes.join(" · ")));
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
    body.append(card);
    body.append(el("div", "hub-foot", `Runs: ${save.runs} · Victories: ${save.wins}`));
  }

  /** One-time "What's new" card after a big update (returning players only; dismissed for good). */
  private newsCard(save: SaveData): HTMLElement | null {
    const NEWS = "2026-11-19c";
    const seen = getJson<string>("lastgate.seenNews", "");
    if (save.runs === 0 || seen === NEWS) return null;
    const card = el("div", "lgn-card");
    card.append(el("div", "lgn-title", "✨ What's new"));
    const list = el("ul", "lgn-list");
    // Saw an earlier card today: just the newest bits. Otherwise the whole update.
    const lines = seen.startsWith("2026-11-19")
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
    for (const a of [...ACHIEVEMENTS].sort((x, y) => rank(x) - rank(y))) {
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
      body.append(row);
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
    for (const h of HEROES) {
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
      if (selected) body.append(this.skillPanel(save, h.id));
    }
    this.justPicked = null;
    body.append(this.flairPanel(save));
  }

  /** Cosmetic hero flair: a trail or halo worn by whichever hero you play. */
  private flairPanel(save: SaveData): HTMLElement {
    const panel = el("div", "lgs-panel lgf-panel");
    const head = el("div", "lgs-head");
    const owned = FLAIRS.filter((f) => f.unlocked(save)).length;
    head.append(el("div", "lgs-title", "Hero flair"), el("div", "lgs-pts", `${owned - 1} / ${FLAIRS.length - 1}`));
    panel.append(head);
    const grid = el("div", "lgf-grid");
    const active = activeFlair(save);
    for (const f of FLAIRS) {
      const open = f.unlocked(save);
      const on = active === f.id;
      const chip = el("button", `lgf-chip${on ? " on" : ""}${open ? "" : " locked"}`);
      chip.append(el("div", "lgf-icon", open ? f.icon : "🔒"), el("div", "lgf-name", f.name), el("div", "lgf-how", on ? "Wearing" : open ? "Tap to wear" : f.how));
      if (open && !on)
        chip.onclick = () => {
          this.cb.onClick();
          this.cb.onFlair?.(f.id);
        };
      else if (!open) chip.onclick = () => this.denied(chip);
      grid.append(chip);
    }
    panel.append(grid);
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

  private armoryTab(body: HTMLElement, save: SaveData): void {
    body.append(el("div", "hub-hint", "Permanent upgrades. Every run earns gold — even the ones you lose."));
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
        el("div", "perm-cost", maxed ? "MAX" : open ? `● ${permCost(p, lvl)}` : "🔒 Max all others"),
      );
      if (!maxed && open)
        card.onclick = () => {
          if (!canBuy(save, p.id)) {
            // Not enough gold: a quick "no" shake instead of a silent re-render.
            this.denied(card);
            return;
          }
          this.cb.onClick();
          this.justBought = { id: p.id, cost: permCost(p, lvl) };
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
  showSaveCode(mode: "export" | "import", onBack: () => void, opts: { code?: string; onLoad?: (code: string) => boolean }): void {
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
        this.button("📥 Load", "btn", () => {
          const code = area.value.trim();
          if (!code) return;
          if (!opts.onLoad?.(code)) {
            status.textContent = "That doesn't look like a Last Gate save code.";
            status.classList.add("bad");
          }
        }),
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

  showPause(onResume: () => void, onQuit: () => void, settings?: { values: Record<string, boolean>; onToggle: (k: string) => void }, build?: HTMLElement | null, note?: string, status?: string[]): void {
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
    const quit = this.button("Abandon run", "btn btn-ghost btn-quit", () => {
      if (armed) return onQuit();
      armed = true;
      quit.textContent = "Tap again to abandon";
      quit.classList.add("confirm");
      setTimeout(() => {
        armed = false;
        quit.textContent = "Abandon run";
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

/** Bestiary art: painted portraits where they exist, emoji for the rest. */
const FOE_PORTRAIT: Record<string, string> = {
  footman: "enemy_footman", runner: "enemy_footman", banner: "enemy_footman", shield: "enemy_shield", brute: "enemy_brute",
  crossbow: "enemy_crossbow", knight: "enemy_knight", shaman: "enemy_shaman", wraith: "enemy_wraith", sapper: "enemy_sapper",
  tunneler: "enemy_sapper", goblin: "enemy_goblin", mob: "enemy_mob", thief: "enemy_thief", hag: "elite_mage",
};
const FOE_EMOJI: Record<string, string> = {
  bat: "🦇", raven: "🐦‍⬛", imp: "👺", ram: "🪵", ogre: "👹", troll: "🧌", golem: "🗿", dragon: "🐉", colossus: "🛡️",
  frostwyrm: "❄️", magma: "🌋", drowned: "🔱", warlord: "⚔️", bloodlord: "🌕",
};

/** Same icons as the in-run ability button, so the Heroes tab and the battle match. */
const ABILITY_ICON: Record<string, string> = { arrowRain: "☔", shieldBash: "🛡️", fireNova: "🔥", overclock: "⚙️", snare: "🕸️", lance: "🔱" };
