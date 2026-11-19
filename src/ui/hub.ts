import { getJson, setItem } from "./store";
import { exportSave } from "./save";
import { canPromptInstall, needsIosHint, promptInstall } from "./install";
import { CHAPTER_BY_ID, CHAPTERS, ENDLESS } from "../core/chapters";
import { DAILY_BONUS, dailyFor, liveDailyStreak, timeToNextDaily, todayString } from "../core/daily";
import { BLESSING_BY_ID } from "../camp/blessings";
import { ENEMIES } from "../core/enemies";
import { ACHIEVEMENTS, claimable } from "../core/achievements";
import { questsReady, questViews, refreshQuests } from "../core/quests";
import { HERO_BY_ID, HEROES, type HeroId } from "../core/heroes";
import { canBuy, chapterUnlocked, endlessMilestoneReward, nextEndlessMilestone, heroUnlocked, PERMS, permCost, totalStars, type RunReward, type SaveData } from "../core/meta";
import { CAMP_HEROES } from "../camp/meta";

/** Painted portraits cut from the owner's character sheet. */
const HERO_PORTRAIT: Record<string, string> = {
  ranger: "./sprites/portraits/king.png",
  knight: "./sprites/portraits/knight.png",
  pyro: "./sprites/portraits/pyro.png",
  engineer: "./sprites/portraits/engineer.png",
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface HubCallbacks {
  onClick: () => void;
  onDaily: () => void;
  onPlay: (chapter: number) => void;
  onSelectHero: (id: HeroId) => void;
  onBuy: (permId: string) => void;
  onReset: () => void;
  onClaim: (id: string) => void;
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
    res.append(el("span", `res-gold${this.justBought || this.justClaimed ? " spent" : ""}`, `● ${fmtGold(save.gold)}`), el("span", "res-stars", `★ ${totalStars(save)}/${CHAPTERS.length * 3}`));
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
      t.setAttribute("aria-label", `${names[id]}${extra}${id === "armory" && affordable ? `, ${affordable} affordable` : ""}`);
      tabs.append(t);
    }
    wrap.append(tabs);
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
    if ((save.stars[1] ?? 0) > 0) body.append(this.dailyCard(save));
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
      const card = el("button", `chapter${unlocked ? "" : " locked"}${isNext ? " next" : ""}`);
      card.style.setProperty("--i", String(ch.id)); // entrance stagger (daily card is 0)
      if (unlocked && !seen.has(ch.id)) {
        card.classList.add("fresh");
        card.append(el("div", "ch-fresh", "🔓 NEW!"));
      } else if (isNext) card.append(el("div", "ch-next", "NEXT"));
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
        else boss.append(img);
        boss.append(el("span", "", `Boss: ${ENEMIES[bossId].name}`));
        left.append(boss);
      }
      const right = el("div", "ch-right");
      right.append(el("div", "ch-stars", unlocked ? "★".repeat(stars) + "☆".repeat(3 - stars) : "🔒"));
      if (save.best[ch.id]) right.append(el("div", "ch-best", stars ? "Cleared" : `Best: night ${save.best[ch.id]}`));
      if (unlocked && !stars && save.best[ch.id]) {
        // How close you've come to clearing it.
        const bar = el("div", "ch-prog");
        const fill = el("i", "");
        fill.style.width = `${Math.min(100, (save.best[ch.id]! / ch.waves.length) * 100)}%`;
        bar.append(fill);
        right.append(bar);
      }
      if (unlocked) right.append(el("div", "ch-play", "PLAY ▶"));
      card.append(left, right);
      if (unlocked)
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
    right.append(el("div", "ch-best", today.won ? `New twist in ${timeToNextDaily()}` : today.best ? `Best: night ${today.best}` : `+${DAILY_BONUS} gold`));
    const streak = liveDailyStreak(save.stats, d.date);
    if (streak >= 2) right.append(el("div", "daily-streak", `🔥 ${streak}-day streak`));
    right.append(el("div", "ch-play", today.won ? "REPLAY ↻" : "PLAY ▶"));
    card.append(left, right);
    card.onclick = () => {
      this.cb.onClick();
      this.cb.onDaily();
    };
    return card;
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
      info.append(el("div", "hero-name", `${h.name}${selected ? " ✓" : ""}`), el("div", "hero-title", h.title), el("div", "hero-line", CAMP_HEROES[h.id].passive), el("div", "hero-line ability-line", `${ABILITY_ICON[h.ability] ?? "✦"} ${h.abilityName}: ${h.abilityDesc}`));
      if (!unlocked) {
        const have = totalStars(save);
        const bar = el("div", "hero-lock-bar");
        const fill = el("i", "");
        fill.style.width = `${Math.min(100, (have / h.starsToUnlock) * 100)}%`;
        bar.append(fill);
        info.append(el("div", "hero-lock", `🔒 ${have} / ${h.starsToUnlock} ★ to unlock`), bar);
      }
      card.append(portrait, info);
      if (unlocked && !selected)
        card.onclick = () => {
          this.cb.onClick();
          this.justPicked = h.id;
          this.cb.onSelectHero(h.id);
        };
      else if (!unlocked) card.onclick = () => this.denied(card);
      body.append(card);
    }
    this.justPicked = null;
  }

  private armoryTab(body: HTMLElement, save: SaveData): void {
    body.append(el("div", "hub-hint", "Permanent upgrades. Every run earns gold — even the ones you lose."));
    const grid = el("div", "perm-grid");
    for (const p of PERMS) {
      const lvl = save.perms[p.id] ?? 0;
      const maxed = lvl >= p.max;
      const text = p.desc;
      const buyable = !maxed && canBuy(save, p.id);
      const card = el("button", `perm${maxed ? " maxed" : buyable ? " buyable" : " poor"}`);
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
        el("div", "perm-cost", maxed ? "MAX" : `● ${permCost(p, lvl)}`),
      );
      if (!maxed)
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
    if (reward.milestoneBonus) row(`Milestone${reward.milestones!.length > 1 ? "s" : ""}: night ${reward.milestones!.join(", ")}`, `● ${reward.milestoneBonus}`, "best");
    const total = row("Gold earned", `● 0`, "total");
    // Rows deal in one by one (CSS, 70 ms apart); the total starts counting once it has landed.
    const nRows = rows.childElementCount;
    countUp(total, reward.gold, (r.won ? 2000 : 900) + 350 + nRows * 70);
    box.append(rows);
    if (!r.won && r.tip) {
      // The bulb lights up after the stats deal in, so the advice reads as the takeaway.
      const tip = el("div", "end-tip lose-tip");
      tip.append(el("span", "tip-bulb", "💡"), document.createTextNode(` ${r.tip}`));
      box.append(tip);
    }
    if (r.dailyStreak && r.dailyStreak >= 2) box.append(el("div", "end-unlock end-record", `🔥 ${r.dailyStreak}-day streak!`));
    if (reward.firstClear && r.chapterId < CHAPTERS.length) box.append(el("div", "end-unlock", `🔓 Chapter ${r.chapterId + 1} unlocked!`));
    for (const h of reward.unlockedHeroes) box.append(el("div", "end-unlock", `🔓 New hero: ${HERO_BY_ID[h].name}!`));
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
      if (r.won || (r.endless && r.record)) this.overlay.append(confetti());
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
    const labels: Record<string, string> = { music: "🎵 Music", sfx: "🔔 Sound effects", shake: "📳 Screen shake", haptics: "📱 Vibration" };
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
      const labels: Record<string, string> = { music: "🎵 Music", sfx: "🔔 Sound effects", shake: "📳 Screen shake", haptics: "📱 Vibration" };
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
function confetti(): HTMLElement {
  const layer = el("div", "confetti");
  const colors = ["#ffd84a", "#ff7a2a", "#5ec43a", "#4a9cff", "#ff5a8a", "#ffffff"];
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

/** Same icons as the in-run ability button, so the Heroes tab and the battle match. */
const ABILITY_ICON: Record<string, string> = { arrowRain: "☔", shieldBash: "🛡️", fireNova: "🔥", overclock: "⚙️" };
