import { ENEMIES, enemyTraits, type EnemyId } from "../core/enemies";
import { padConnected } from "./input";
import { planWave } from "../core/waves";
import { drawBat, LOOKS, unitSprite } from "./art";
import { BLESSING_BY_ID, comboParts } from "./blessings";
import { CAMP, CATAPULT_LEVELS, carryCap, HEALER_LEVELS, MAGE_LEVELS, plotMaxed, rerollsLeft, SPIKES, TOWER_LEVELS, TOWER_SPECS, WATCH_LEVELS, WEATHER_INFO, xpToNext, type Camp, type Plot, type TowerSpec } from "./sim";

/** Icons for buildings named in blessing requirements. */
const BUILDING_ICON: Record<string, string> = { watch: "🗼", mage: "🔮", healer: "⛺", spikes: "🪤", barracks: "⚔️", catapult: "🪨", lumber: "🪵", forge: "⚒️" };

/** "Now → next" lines for the building the hero is standing on. */
function plotInfo(c: Camp, p: Plot): { title: string; lines: string[] } {
  const next = plotMaxed(p) ? null : p.level + 1;
  const arrow = (a: string | number, b: string | number | null) => (b === null ? `${a}` : `${a} → ${b}`);
  switch (p.kind) {
    case "tower": {
      const cur = TOWER_LEVELS[p.level - 1];
      const nx = next ? TOWER_LEVELS[next - 1]! : null;
      if (!cur) return { title: "Build: Archer Tower", lines: [`Damage ${nx!.damage} · Range ${nx!.range}`, `${nx!.archers} archer — shoots anything in range`] };
      const sp = p.spec ? TOWER_SPECS[p.spec] : null;
      return {
        title: sp ? `${sp.icon} ${sp.name} · Lv ${p.level}` : `Archer Tower · Lv ${p.level}`,
        lines: [
          `Damage ${arrow(cur.damage, nx?.damage ?? null)}`,
          `Archers ${arrow(cur.archers, nx?.archers ?? null)} · Range ${arrow(cur.range, nx?.range ?? null)}`,
          ...(sp ? [sp.desc] : p.level === 2 ? ["At Lv 3: choose Fire, Frost or Volley"] : []),
          p.bows ? `Bows ${p.bows}/10 (+${p.bows * 6}% dmg)` : "Bring bows from the forge for +6% each",
        ],
      };
    }
    case "catapult": {
      const cur = CATAPULT_LEVELS[p.level - 1];
      const nx = next ? CATAPULT_LEVELS[next - 1]! : null;
      if (!cur) return { title: "Build: Catapult", lines: [`Splash ${nx!.damage} in a ${nx!.radius} radius`, "Aims at the biggest crowd"] };
      return { title: `Catapult · Lv ${p.level}`, lines: [`Splash damage ${arrow(cur.damage, nx?.damage ?? null)}`, `Radius ${arrow(cur.radius, nx?.radius ?? null)}`] };
    }
    case "barracks":
      return { title: p.level ? `Barracks · Lv ${p.level}` : "Build: Barracks", lines: [`Soldiers ${arrow(p.level, next)}`, "They guard the gate and fight anything that breaks in"] };
    case "lumber":
      if (!p.level) return { title: "Build: Lumber Camp", lines: ["A woodcutter chops logs into a pile here", "Logs unlock tower Lv 3–4, catapults and stone walls"] };
      return { title: `Lumber Camp · Lv ${p.level}`, lines: [`Woodcutters ${arrow(p.level, next)}`, `Log pile ${c.lumberPile}/${CAMP.lumberCap}`] };
    case "forge":
      if (!p.level) return { title: "Build: Forge", lines: ["Drop logs in, collect bows out (one every 3s)", "Carry bows to towers: +6% damage each"] };
      return { title: `Forge · Lv ${p.level}`, lines: [`One bow every ${arrow(p.level >= 2 ? "1.8s" : p.level ? "3s" : "—", next ? (next >= 2 ? "1.8s" : "3s") : null)}`, `Logs in: ${c.forgeLogs} · Bows ready: ${c.forgeBows}`] };
    case "hall":
      return { title: `Town Hall · Lv ${p.level + 1}`, lines: ["+450 hall HP, +35% income, stronger hall archers", p.level === 0 ? "Unlocks 2 more tower slots" : "Max level next"] };
    case "fortify":
      return { title: ["Palisade", "Banded Wall", "Stone Wall", "Battlements"][p.level]!, lines: [next ? `Next: wall max HP +${Math.round((CAMP.fortifyMult - 1) * 100)}% and full repair` : "Fully fortified"] };
    case "mage": {
      const cur = MAGE_LEVELS[p.level - 1];
      const nx = next ? MAGE_LEVELS[next - 1]! : null;
      if (!cur) return { title: "Build: Mage Tower", lines: [`Chain lightning: ${nx!.damage} dmg, jumps to ${nx!.chains} more foes`, "Ignores armour · range " + nx!.range] };
      return {
        title: `Mage Tower · Lv ${p.level}`,
        lines: [`Damage ${arrow(cur.damage, nx?.damage ?? null)} · ignores armour`, `Jumps ${arrow(cur.chains, nx?.chains ?? null)} · every ${arrow(`${cur.every}s`, nx ? `${nx.every}s` : null)}`],
      };
    }
    case "healer": {
      const cur = HEALER_LEVELS[p.level - 1];
      const nx = next ? HEALER_LEVELS[next - 1]! : null;
      const wall = (v: number) => `${(v * 100).toFixed(1)}%/s`;
      if (!cur) return { title: "Build: Healer's Tent", lines: [`Heals the King and soldiers nearby: ${nx!.heal} HP/s`, `Mends the whole wall: ${wall(nx!.wall)}`] };
      return {
        title: `Healer's Tent · Lv ${p.level}`,
        lines: [`Heal ${arrow(`${cur.heal}/s`, nx ? `${nx.heal}/s` : null)} · radius ${arrow(cur.radius, nx?.radius ?? null)}`, `Wall mending ${arrow(wall(cur.wall), nx ? wall(nx.wall) : null)}`],
      };
    }
    case "watch": {
      const pct = (v: number) => `+${Math.round(v * 100)}%`;
      const cur = WATCH_LEVELS[p.level - 1];
      const nx = next ? WATCH_LEVELS[next - 1]! : null;
      if (!cur) return { title: "Build: Watchtower", lines: [`Archer towers within ${nx!.radius}: range ${pct(nx!.range)}, fire rate ${pct(nx!.rate)}`, "Their aim isn't dulled by fog or rain"] };
      return {
        title: `Watchtower · Lv ${p.level}`,
        lines: [`Reach ${arrow(cur.radius, nx?.radius ?? null)} · tower range ${arrow(pct(cur.range), nx ? pct(nx.range) : null)}`, `Fire rate ${arrow(pct(cur.rate), nx ? pct(nx.rate) : null)} · sees through fog`],
      };
    }
    case "spikes": {
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      if (p.level === 0) return { title: "Build: Spike Trap", lines: [`Stakes before the gate: ${SPIKES.dps[0]} dmg/s to foes crossing`, `Slows them ${pct(SPIKES.slow[0]!)} while they wade through`] };
      return {
        title: `Spike Trap · Lv ${p.level}`,
        lines: [`Damage ${arrow(`${SPIKES.dps[p.level - 1]}/s`, next ? `${SPIKES.dps[next - 1]}/s` : null)}`, `Slow ${arrow(pct(SPIKES.slow[p.level - 1]!), next ? pct(SPIKES.slow[next - 1]!) : null)}`],
      };
    }
    case "repair": {
      const hurt = c.segments.reduce((a, s) => a + (s.maxHp - s.hp), 0);
      return { title: "Repair Wall", lines: [hurt > 0 ? `Restores ${Math.round(hurt)} wall HP` : "The wall is at full health", `Broken sections: ${c.segments.filter((s) => s.hp <= 0).length}`] };
    }
  }
}

/** Mouse/keyboard device: show hotkey hints. */
const FINE_POINTER = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;
/** How long the picked blessing card celebrates before play resumes. */
const CHOOSE_BEAT_MS = 340;

/** Deeper rules shown when "How to play" is opened from Settings. */
const HOW_MORE: [string, string][] = [
  ["🪵", "Build the Lumber Camp — logs unlock tower Lv 3–4, catapults and stone walls"],
  ["🎯", "At Lv 3 each archer tower picks a path: Fire, Frost or Volley"],
  ["🔮", "Later plots: Mage Tower, Healer's Tent, Spike Trap, Watchtower — each changes how you defend"],
  ["⛈️", "Nights can bring rain, fog or storms — check the icon next to NIGHT"],
  ["🔥", "A burning building stops working — walk onto it to stamp the fire out"],
  ["🌙", "Start the night early for bonus coins · tap NEXT to see who's coming"],
  ["✨", "After each night, pick 1 of 3 blessings — some combine into combos"],
  ["✦", "Your hero's ability charges up — tap it when the horde is thick"],
  ["👑", "Bosses enrage at half health and gain a new move — the warning text tells you what's coming"],
  ["🏛️", "Every run earns gold for the Armory; heroes learn skills; quests pay extra"],
];

/** Row of owned blessing icons with level badges ("Your build"), or null if none yet. */
export function buildStrip(owned: Record<string, number>): HTMLElement | null {
  const ids = Object.keys(owned).filter((id) => BLESSING_BY_ID[id]);
  if (!ids.length) return null;
  const wrap = el("div", "build-strip");
  wrap.append(el("div", "build-title", "Your build"));
  const row = el("div", "build-row");
  for (const id of ids) {
    const b = BLESSING_BY_ID[id]!;
    const cell = el("div", `build-cell r-${b.rarity}`, b.icon);
    cell.title = `${b.name} — ${b.desc}`;
    if (owned[id]! > 1) cell.append(el("span", "build-lv", String(owned[id])));
    // Tap (phones can't hover): show what this blessing does under the row.
    cell.onclick = (ev) => {
      ev.stopPropagation();
      for (const c of row.children) c.classList.toggle("sel", c === cell);
      desc.textContent = `${b.name}${owned[id]! > 1 ? ` (Lv ${owned[id]})` : ""} — ${b.desc}`;
    };
    row.append(cell);
  }
  const desc = el("div", "build-desc", ids.length ? "Tap an icon for details" : "");
  wrap.append(row, desc);
  return wrap;
}

const portraits = new Map<string, string>();
/** Small enemy portrait (data URL) rendered from the same art as the battlefield. */
/** Painted portraits cut from the owner's character art (enemies that have one). */
const PAINTED: Partial<Record<string, string>> = {
  footman: "enemy_footman", runner: "enemy_footman", brute: "enemy_brute", crossbow: "enemy_crossbow",
  shield: "enemy_shield", goblin: "enemy_goblin", mob: "enemy_mob", thief: "enemy_thief", wraith: "enemy_wraith", sapper: "enemy_sapper", knight: "enemy_knight", shaman: "enemy_shaman", hag: "elite_mage",
  ogre: "boss", troll: "boss", warlord: "boss", golem: "boss", colossus: "boss", magma: "boss", drowned: "boss",
};
function portrait(id: EnemyId): string {
  const painted = PAINTED[id];
  if (painted) return `./sprites/portraits/${painted}.png`;
  let url = portraits.get(id);
  if (url) return url;
  // No 2D canvas (blocked / test DOM): no portrait, same as unitPortrait in art.ts.
  if (!document.createElement("canvas").getContext("2d")) return "";
  let cv: HTMLCanvasElement;
  if (id === "bat") {
    cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const ctx = cv.getContext("2d")!;
    ctx.scale(2, 2);
    drawBat(ctx, 16, 16, 7, 0.3, false);
  } else {
    // Crop the padded sprite to the figure itself.
    const src = unitSprite(LOOKS[id] ? id : "footman", 12, 0, false, 0, Math.PI / 2 - 0.4);
    const w = src.width;
    const box = w * 0.56;
    cv = document.createElement("canvas");
    cv.width = cv.height = 72;
    cv.getContext("2d")!.drawImage(src, (w - box) / 2, w * 0.58 - box * 0.6, box, box, 0, 0, 72, 72);
  }
  url = cv.toDataURL();
  portraits.set(id, url);
  return url;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** In-run HUD for the camp mode: chunky pills, wave tracker, countdown, banners. */
export class CampHud {
  private top = el("div", "chud");
  private hallPill = el("div", "pill hall-pill");
  private hallFill = el("div", "hall-fill");
  /** Star thresholds on the hall bar (≥50% ★★, ≥80% ★★★) — hidden where stars don't apply. */
  private hallTicks = el("div", "hall-ticks");
  /** Set by the game for runs that award no stars (daily challenge). */
  noStars = false;
  private hallChip = el("div", "hall-chip");
  private hallText = el("div", "hall-text");
  private wavePill = el("div", "pill wave-pill");
  private waveLabel = el("div", "wave-label");
  private waveDots = el("div", "wave-dots");
  private waveBest = el("div", "wave-best");
  /** Previous best wave for the current endless run (0 = none / not endless). */
  endlessBest = 0;
  /** This week's Endless twist icon (shown on the night label in Endless; "" otherwise). */
  twistIcon = "";
  private coinPill = el("div", "pill coin-pill");
  private coinText = el("span", "coin-text");
  private logPill = el("div", "pill log-pill");
  private logText = el("span", "coin-text");
  private lastLogs = -1;
  private lastLevel = -1;
  private lastHall = -1;
  private hallFlashAt = -Infinity;
  private xpPill = el("div", "pill xp-pill");
  private xpFill = el("div", "xp-fill");
  private xpText = el("div", "xp-text");
  private bowPill = el("div", "pill log-pill");
  private bowText = el("span", "coin-text");
  private mute = el("button", "hud-btn round-btn");
  private pauseBtn = el("button", "hud-btn round-btn pause-btn", "II");
  private speedBtn = el("button", "hud-btn round-btn speed-btn", "▶");
  private status = el("div", "status-chip");
  private lastLeft = 9999;
  private callBtn = el("button", "call-wave");
  private countdown = el("div", "countdown");
  private tip = el("div", "tip");
  private info = el("div", "info-card");
  private toastHost = el("div", "toast-host");
  private infoKey = "";
  private preview = el("div", "wave-preview");
  private previewKey = "";
  private ability = el("button", "ability");
  private abilityFill = el("div", "ability-fill");
  private abilityIcon = el("div", "ability-icon");
  private abilityLabel = el("div", "ability-label");
  private lastTip = "";
  private bannerEl = el("div", "banner");
  private overlay = el("div", "overlay");
  private boss = el("div", "boss");
  private bossName = el("div", "boss-name");
  private bossFill = el("div", "boss-fill");
  private bossChip = el("div", "boss-chip");
  private bossBar = el("div", "boss-bar");
  private bossPct = el("div", "boss-pct");
  private bossImg = document.createElement("img");
  private bossHitId = -1;
  private bossLastFrac = 1;
  private bossId = "";
  private bannerTimer = 0;
  private lastKey = "";
  private lastCall = "";
  private lastCoins = -1;
  private lastCount = -1;

  constructor(root: HTMLElement, cb: { onToggleMute: () => boolean; onCallWave: () => void; onPause: () => void; onAbility: () => void; onSpeed: () => number }) {
    this.speedBtn.onclick = () => this.setSpeed(cb.onSpeed());
    this.ability.append(this.abilityFill, this.abilityIcon, this.abilityLabel);
    if (FINE_POINTER) this.ability.append(el("div", "ability-key", "Space"));
    this.ability.onpointerdown = (ev) => {
      ev.stopPropagation();
      cb.onAbility();
    };
    const hallIcon = el("div", "pill-icon", "🏰");
    const hallBar = el("div", "hall-bar");
    for (const pct of [50, 80]) {
      const t = el("i", "");
      t.style.left = `${pct}%`;
      this.hallTicks.append(t);
    }
    hallBar.append(this.hallChip, this.hallFill, this.hallTicks, this.hallText);
    this.hallPill.append(hallIcon, hallBar);
    this.wavePill.append(this.waveLabel, this.waveDots, this.waveBest);
    const coinIcon = el("div", "coin-icon");
    this.coinPill.append(coinIcon, this.coinText);
    this.mute.onclick = () => this.setMuted(cb.onToggleMute());
    // Hover hints (desktop) name each round button and its key.
    this.mute.title = "Mute (M)";
    this.pauseBtn.title = "Pause (P / Esc)";
    this.speedBtn.title = "Game speed (F)";
    this.mute.setAttribute("aria-label", "Mute");
    this.pauseBtn.setAttribute("aria-label", "Pause");
    this.speedBtn.setAttribute("aria-label", "Game speed");
    this.ability.setAttribute("aria-label", "Hero ability");
    this.hallPill.title = "Town hall health — if it falls, the run ends. Finish above the marks for ★★ (50%) or ★★★ (80%)";
    this.wavePill.title = "Nights survived (◆ = boss night)";
    this.coinPill.title = "Coins you carry — stand on a plot to spend them";
    this.logPill.title = "Logs — from the Lumber Camp; needed for higher upgrades";
    this.bowPill.title = "Bows — from the Forge; carry to towers for +6% damage each";
    this.xpPill.title = "Hero level — kills give XP; each level adds damage and health";
    this.pauseBtn.onclick = () => cb.onPause();
    this.logPill.append(el("div", "log-icon"), this.logText);
    this.bowPill.append(el("div", "bow-icon", "🏹"), this.bowText);
    // Row 1: hall + wave + buttons. Row 2: carried resources (so the hall bar never gets squeezed).
    const row1 = el("div", "chud-row");
    row1.append(this.hallPill, this.wavePill, this.speedBtn, this.pauseBtn, this.mute);
    const row2 = el("div", "chud-row res-row");
    const xpBar = el("div", "xp-bar");
    xpBar.append(this.xpFill, this.xpText);
    this.xpPill.append(xpBar);
    row2.append(this.coinPill, this.logPill, this.bowPill, this.xpPill, this.status, this.preview);
    this.top.append(row1, row2);
    const bossBar = this.bossBar;
    bossBar.append(this.bossChip, this.bossFill, this.bossPct);
    this.bossImg.className = "boss-img";
    const bossRow = el("div", "boss-row");
    bossRow.append(this.bossImg, bossBar);
    this.boss.append(this.bossName, bossRow);
    this.callBtn.onpointerdown = (ev) => {
      ev.stopPropagation();
      cb.onCallWave();
    };
    root.append(this.info, this.toastHost, this.ability, this.tip, this.top, this.boss, this.callBtn, this.countdown, this.bannerEl, this.overlay);
  }

  setSpeed(x: number): void {
    this.speedBtn.textContent = x === 1 ? "▶" : x === 2 ? "▶▶" : "▶▶▶";
    this.speedBtn.classList.toggle("fast", x > 1);
  }

  /** Same as tapping the mute button (used by the M hotkey). */
  toggleMute(): void {
    this.mute.click();
  }

  setMuted(m: boolean): void {
    this.mute.textContent = m ? "🔇" : "🔊";
  }

  showMessage(title: string, sub: string, button: string, onClick: () => void, cls = "title"): void {
    const box = el("div", "panel pop-in");
    const p = el("p", "sub", sub);
    p.style.whiteSpace = "pre-line"; // multi-line summaries (e.g. Siege Lord results)
    box.append(el("h1", cls, title), p);
    const b = el("button", "btn", button);
    b.onclick = onClick;
    box.append(b);
    this.overlay.replaceChildren(box);
    this.overlay.style.display = "flex";
  }

  showTitle(onPlay: () => void, full = false): void {
    const box = el("div", `title-screen${full ? " lg-guide" : ""}`);
    const king = document.createElement("img");
    king.className = "title-king";
    king.src = "./sprites/units/king.png";
    king.alt = "";
    const kingWrap = el("div", "title-king-wrap");
    // Embers drifting up behind the King (each its own lane, speed and delay; pure CSS motion).
    const embers = el("div", "title-embers");
    for (let i = 0; i < 14; i++) {
      const e = el("i", "");
      e.style.setProperty("--x", `${((i * 37) % 100) - 50}`);
      e.style.setProperty("--d", `${(i * 0.53) % 4}`);
      e.style.setProperty("--s", `${3.2 + ((i * 7) % 5) * 0.45}`);
      e.style.setProperty("--w", `${((i * 13) % 7) - 3}`);
      embers.append(e);
    }
    kingWrap.append(el("div", "end-rays"), embers, king);
    box.append(
      kingWrap,
      el("h1", "logo", "Last Gate"),
      el("div", "logo-sub", "Build. Defend. Hold the wall."),
    );
    const how = el("div", "how");
    for (const [i, t] of [["🕹️", matchMedia("(pointer: fine)").matches ? "WASD / arrows or drag to walk" : "Drag anywhere to walk"], ["🪙", "Grab coins from fallen foes — the hall's income flies to you"], ["🏹", "Stand on a plot to build & upgrade"], ["🏰", full ? "Keep the hall standing for 10 nights — end above the bar marks (50% / 80%) for ★★ / ★★★" : "Keep the hall standing for 10 nights"], ...(full ? HOW_MORE : [])] as const) {
      const row = el("div", "how-row");
      row.style.setProperty("--i", String(how.childElementCount));
      row.append(el("span", "how-icon", i), el("span", "", t));
      how.append(row);
    }
    box.append(how);
    const b = el("button", "btn big-btn title-play", full ? "Got it" : "Defend the camp");
    b.style.setProperty("--i", String(how.childElementCount));
    b.onclick = onPlay;
    box.append(b);
    this.overlay.replaceChildren(box);
    this.overlay.style.display = "flex";
  }

  /** Pick-1-of-3 blessing cards between waves. */
  showOffers(c: Camp, recap: { kills: number; loot: number; hall: number; flawless?: boolean }, onChoose: (id: string) => void, onReroll: () => void): void {
    const wrap = el("div", "pick");
    const tally = el("div", "pick-recap");
    tally.append(
      el("span", "", `⚔️ ${recap.kills} slain`),
      el("span", "", `🪙 +${recap.loot}`),
      el("span", recap.hall < 50 ? "hurt" : "", `🏰 ${recap.hall}%`),
    );
    if (recap.flawless) tally.append(el("span", "flawless", "✨ Flawless"));
    if (c.chapter.endless && c.wave % 5 === 0) tally.append(el("span", "flawless milestone", "🏁 Milestone"));
    wrap.append(el("h2", "pick-title", `Night ${c.wave} survived!`), tally, el("p", "pick-sub", "Choose a blessing"));
    const cards = el("div", "cards");
    const left = rerollsLeft(c);
    const pad = padConnected();
    const rr = el("button", "btn btn-small", `↻ Reroll (${left})${pad ? "  · LB" : FINE_POINTER ? "  · R" : ""}`);
    rr.disabled = left <= 0;
    rr.onclick = onReroll;
    const armedAt = performance.now() + 450;
    c.offers.forEach((b, i) => {
      const card = el("button", `card r-${b.rarity}`);
      card.style.animationDelay = `${i * 0.08}s`;
      const owned = c.owned[b.id] ?? 0;
      card.append(
        el("div", "card-rarity", b.rarity),
        el("div", "card-icon", b.icon),
        el("div", "card-name", b.name),
        el("div", "card-desc", b.desc),
        el("div", `card-tag${owned ? "" : " new"}`, owned ? `Lv ${owned} → ${owned + 1}` : "New"),
        b.max > 1 ? levelPips(owned, b.max) : el("div", "card-lvl", "Unique"),
      );
      if (b.requires) {
        // Parts: the blessings it combines, plus the building it needs (if any).
        const parts = comboParts(b).map((id) => BLESSING_BY_ID[id]?.icon ?? "");
        if (b.needsBuilding) parts.push(BUILDING_ICON[b.needsBuilding] ?? "🏗️");
        card.insertBefore(el("div", "card-combo", `COMBO ${parts.join(" + ")}`), card.children[1] ?? null);
      }
      if (pad) card.append(el("div", "card-key", ["◀", "▲", "▶"][i]!));
      else if (FINE_POINTER) card.append(el("div", "card-key", String(i + 1)));
      // Ignore taps right after the screen appears so a walking thumb doesn't pick by accident.
      card.onclick = () => {
        if (performance.now() < armedAt || wrap.classList.contains("chosen-one")) return;
        // A short "yours!" beat — the pick pops and glows, the others fall away — before play resumes.
        wrap.classList.add("chosen-one");
        card.classList.add("chosen");
        for (const other of cards.querySelectorAll(".card")) if (other !== card) other.classList.add("passed");
        rr.disabled = true;
        window.setTimeout(() => onChoose(b.id), CHOOSE_BEAT_MS);
      };
      cards.append(card);
    });
    wrap.append(cards);
    const build = buildStrip(c.owned);
    if (build) wrap.append(build);
    wrap.append(rr);
    this.overlay.replaceChildren(wrap);
    this.overlay.style.display = "flex";
  }

  private tipDoneTimer = 0;
  setTip(text: string | null): void {
    const t = text ?? "";
    if (t === this.lastTip) return;
    const prev = this.lastTip;
    this.lastTip = t;
    window.clearTimeout(this.tipDoneTimer);
    // A step just completed (one tutorial tip replaced by the next): the old tip turns green with a
    // tick for a beat, then the next one pops in, so progress is felt rather than just swapped.
    if (prev && t && !this.tip.classList.contains("tip-done")) {
      this.tip.classList.add("tip-done");
      this.tip.replaceChildren(el("span", "tip-ico tip-tick", "✔"), document.createTextNode(` ${prev.slice(prev.indexOf(" ") + 1)}`));
      this.tipDoneTimer = window.setTimeout(() => {
        this.tip.classList.remove("tip-done");
        this.lastTip = "";
        this.setTip(t);
      }, 550);
      return;
    }
    this.tip.classList.remove("tip-done");
    // The leading emoji gets its own element so it can move: the 👆 of "drag to walk" swipes
    // across like a finger demonstrating the gesture; other tip icons bob gently.
    const sp = t.indexOf(" ");
    const ico = sp > 0 && sp <= 4 ? t.slice(0, sp) : "";
    if (ico && /\p{Extended_Pictographic}/u.test(ico)) {
      this.tip.replaceChildren(el("span", `tip-ico${ico.startsWith("👆") ? " swipe" : ""}`, ico), document.createTextNode(t.slice(sp)));
    } else this.tip.textContent = t;
    this.tip.classList.toggle("show", !!t);
    if (t) {
      this.tip.classList.remove("tip-pop");
      void this.tip.offsetWidth;
      this.tip.classList.add("tip-pop");
    }
  }

  setVisible(v: boolean): void {
    for (const n of [this.top, this.status, this.callBtn, this.boss, this.countdown, this.ability, this.preview, this.info, this.tip]) n.style.visibility = v ? "visible" : "hidden";
    if (!v) document.body.classList.remove("hero-dead");
    else {
      // A new run: forget the last run's values so nothing "changes" on its first frame.
      this.lastHall = -1;
      this.lastLevel = -1;
      this.lastCoins = -1;
      this.lastLogs = -1;
      this.lastKey = "";
      this.previewKey = "";
    }
  }

  /** A tower reached level 3: pick its specialisation (the game waits). */
  showSpecChoice(onChoose: (spec: TowerSpec) => void): void {
    const wrap = el("div", "pick spec-pick");
    wrap.append(el("h2", "pick-title", "Specialise your tower"), el("p", "pick-sub", "Your archers master a new art — choose one"));
    const cards = el("div", "cards");
    const armedAt = performance.now() + 450;
    (Object.keys(TOWER_SPECS) as TowerSpec[]).forEach((id, i) => {
      const sp = TOWER_SPECS[id];
      const card = el("button", `card spec-card spec-${id}`);
      card.style.animationDelay = `${i * 0.08}s`;
      card.append(el("div", "card-rarity", "Tower"), el("div", "card-icon", sp.icon), el("div", "card-name", sp.name), el("div", "card-desc", sp.desc));
      card.onclick = () => {
        if (performance.now() < armedAt || wrap.classList.contains("chosen-one")) return;
        wrap.classList.add("chosen-one");
        card.classList.add("chosen");
        for (const other of cards.querySelectorAll(".card")) if (other !== card) other.classList.add("passed");
        window.setTimeout(() => onChoose(id), CHOOSE_BEAT_MS);
      };
      cards.append(card);
    });
    wrap.append(cards);
    this.overlay.replaceChildren(wrap);
    this.overlay.style.display = "flex";
  }

  hideOverlay(): void {
    this.overlay.style.display = "none";
  }

  banner(text: string, sub?: string, tone: "gold" | "red" = "gold"): void {
    this.bannerEl.replaceChildren(document.createTextNode(text));
    if (sub) this.bannerEl.append(el("div", "banner-sub", sub));
    this.bannerEl.classList.toggle("red", tone === "red");
    this.bannerEl.classList.remove("show");
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.remove("show"), 1700);
  }

  /** Small toast that slides in under the HUD (e.g. a trophy unlocked mid-run). */
  /** A toast with custom content; `key` stops a second copy stacking while one is on screen. */
  toastNode(node: HTMLElement, key: string): void {
    if ([...this.toastHost.children].some((n) => (n as HTMLElement).dataset.key === key && !n.classList.contains("out"))) return;
    node.dataset.key = key;
    this.toastHost.append(node);
    window.setTimeout(() => node.classList.add("out"), 3600);
    window.setTimeout(() => node.remove(), 4100);
  }

  toast(text: string): void {
    // The same message already on screen (e.g. tapping the wave preview twice): don't stack a copy.
    if ([...this.toastHost.children].some((n) => n.textContent === text && !n.classList.contains("out"))) return;
    const t = el("div", "toast", text);
    this.toastHost.append(t);
    window.setTimeout(() => t.classList.add("out"), 2600);
    window.setTimeout(() => t.remove(), 3100);
  }

  /** Card describing the building under the hero (now → next level). */
  private updateInfo(c: Camp): void {
    const h = c.hero;
    const p = h.dead ? undefined : c.plots.find((q) => !q.locked && Math.abs(q.x - h.x) < CAMP.plotHalf && Math.abs(q.y - h.y) < CAMP.plotHalf);
    if (!p) {
      if (this.infoKey) {
        this.infoKey = "";
        this.info.classList.remove("show");
      }
      return;
    }
    const { title, lines } = plotInfo(c, p);
    const key = `${p.id}|${title}|${lines.join("|")}`;
    if (key === this.infoKey) return;
    this.infoKey = key;
    this.info.replaceChildren(el("div", "info-title", title), ...lines.map((l) => el("div", "info-line", l)));
    this.info.classList.add("show");
  }

  /** During the build phase: who's coming next wave. */
  private updatePreview(c: Camp): void {
    const show = c.phase === "build" && (c.chapter.endless || c.wave < c.chapter.waves.length);
    this.preview.style.display = show ? "flex" : "none";
    if (!show) return;
    const key = `${c.chapter.id}|${c.wave}|${c.seed}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    const plan = planWave(c.chapter, c.wave + 1, c.seed);
    const counts = new Map<EnemyId, number>();
    for (const sp of plan.spawns) counts.set(sp.enemy, (counts.get(sp.enemy) ?? 0) + 1);
    const items = [...counts.entries()].sort((a, b) => Number(!!ENEMIES[b[0]].boss) - Number(!!ENEMIES[a[0]].boss) || b[1] - a[1]);
    this.preview.replaceChildren(el("div", "wp-title", plan.boss ? "BOSS" : "NEXT"));
    const row = el("div", "wp-row");
    for (const [id, n] of items.slice(0, 3)) {
      const def = ENEMIES[id];
      const cell = el("div", `wp-cell${def.boss ? " boss" : ""}${plan.intro === id ? " new" : ""}`);
      const img = document.createElement("img");
      img.src = portrait(id);
      img.alt = def.name;
      cell.append(img, el("div", "wp-n", def.boss ? "👑" : `×${n}`));
      if (plan.intro === id) cell.append(el("div", "wp-new", "NEW"));
      cell.title = def.name;
      row.append(cell);
    }
    if (items.length > 3) row.append(el("div", "wp-more", `+${items.length - 3}`));
    this.preview.append(row);
    // Tap / click: who exactly is coming, and what each one does.
    this.preview.onclick = () => {
      // A little scouting report: portrait, count, name and what each one does, one row per kind.
      const card = el("div", "toast scout");
      card.append(el("div", "scout-title", plan.boss ? "👑 Boss night" : `Night ${c.wave + 1} — scouts report`));
      items.forEach(([id, n], i) => {
        const def = ENEMIES[id];
        const traits = enemyTraits(def).filter((x) => x !== "boss");
        const rowEl = el("div", `scout-row${def.boss ? " scout-boss" : ""}`);
        rowEl.style.setProperty("--i", String(i));
        const img = document.createElement("img");
        img.src = portrait(id);
        img.alt = def.name;
        const txt = el("div", "scout-txt");
        txt.append(el("b", "", `${def.boss ? "" : `${n}× `}${def.name}`), el("span", "", traits.join(" · ") || (def.boss ? "boss" : "")));
        rowEl.append(img, txt);
        if (plan.intro === id) rowEl.append(el("i", "scout-new", "NEW"));
        card.append(rowEl);
      });
      this.toastNode(card, `scout|${key}`);
    };
    this.preview.title = "Tap for details";
  }

  private tickAt = 0;
  private shownCoins = 0;
  private shownLogs = 0;
  /** Ease a displayed count toward its target, writing the text only when the shown number changes. */
  private roll(shown: number, target: number, k: number, node: HTMLElement): number {
    let v = shown + (target - shown) * k;
    if (Math.abs(target - v) < 0.5) v = target;
    const txt = `${Math.round(v)}`;
    if (node.textContent !== txt) node.textContent = txt;
    return v;
  }

  private bump(node: HTMLElement): void {
    node.classList.remove("bump");
    void node.offsetWidth;
    node.classList.add("bump");
  }

  private abilityId = "";

  update(c: Camp): void {
    if (c.ability !== this.abilityId) {
      this.abilityId = c.ability;
      this.abilityIcon.textContent = { arrowRain: "☔", shieldBash: "🛡️", fireNova: "🔥", overclock: "⚙️", snare: "🕸️", lance: "🔱", sanctuary: "✨" }[c.ability];
      this.abilityLabel.textContent = { arrowRain: "Arrow Rain", shieldBash: "Shield Bash", fireNova: "Fire Nova", overclock: "Overclock", snare: "Snare Field", lance: "Piercing Lance", sanctuary: "Sanctuary" }[c.ability];
    }
    this.ability.style.display = c.phase === "wave" ? "flex" : "none";
    // Hero down: the battlefield goes grey until they're back (the corner pill alone is easy to miss).
    document.body.classList.toggle("hero-dead", c.hero.dead && (c.phase === "wave" || c.phase === "build"));
    this.updatePreview(c);
    this.updateInfo(c);
    this.status.style.display = c.phase === "build" && !c.hero.dead ? "none" : "block";
    this.abilityFill.style.height = `${c.abilityCharge * 100}%`;
    const ready = c.abilityCharge >= 1 && !c.hero.dead;
    if (ready && !this.ability.classList.contains("ready")) {
      this.ability.classList.add("charged");
      window.setTimeout(() => this.ability.classList.remove("charged"), 600);
    }
    this.ability.classList.toggle("ready", ready);
    const boss = c.enemies.find((e) => e.def.boss);
    this.boss.style.display = boss ? "block" : "none";
    if (boss) {
      this.bossName.textContent = boss.enraged ? `${boss.def.name} — ENRAGED` : boss.def.name;
      const frac = Math.max(0, boss.hp / boss.maxHp);
      this.bossFill.style.width = `${frac * 100}%`;
      // The white chip trails behind (slower CSS transition) so each hit visibly bites off a piece.
      this.bossChip.style.width = `${frac * 100}%`;
      this.bossPct.textContent = `${Math.ceil(frac * 100)}%`;
      // A heavy blow (over 2% in one go) jolts the bar with a short shake and flash.
      if (boss.id === this.bossHitId && this.bossLastFrac - frac > 0.02) {
        this.bossBar.classList.remove("hurt");
        void this.bossBar.offsetWidth;
        this.bossBar.classList.add("hurt");
      }
      this.bossHitId = boss.id;
      this.bossLastFrac = frac;
      this.boss.classList.toggle("enraged", !!boss.enraged);
      if (boss.def.id !== this.bossId) {
        this.bossId = boss.def.id;
        // The dragon has no unit sprite to crop a portrait from.
        this.bossImg.style.display = boss.def.id === "dragon" || boss.def.id === "frostwyrm" ? "none" : "";
        if (boss.def.id !== "dragon" && boss.def.id !== "frostwyrm") this.bossImg.src = portrait(boss.def.id);
      }
    }
    const building = c.phase === "build";
    this.callBtn.style.display = building && c.timer > 3 ? "flex" : "none";
    // Last 10 s of daylight: the button turns urgent (deeper red, pulsing) — the bonus is shrinking.
    this.callBtn.classList.toggle("soon", building && c.timer <= 10);
    if (building) {
      const key = FINE_POINTER ? `<i class="call-key">C</i>` : "";
      const html = `<span>🌙 Start the night${key}</span><small>+${Math.floor(c.timer / 2)} coins · ${Math.ceil(c.timer)}s</small>`;
      if (html !== this.lastCall) {
        this.lastCall = html;
        this.callBtn.innerHTML = html;
      }
    }
    const count = building && c.timer <= 3 && c.timer > 0 ? Math.ceil(c.timer) : 0;
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.countdown.textContent = count ? String(count) : "";
      if (count) this.bump(this.countdown);
    }

    // Counters roll toward their new value (fast exponential ease) instead of snapping.
    const now = performance.now() / 1000;
    const k = 1 - Math.exp(-Math.min(0.1, now - this.tickAt) * 14);
    this.tickAt = now;
    if (c.hero.coins !== this.lastCoins) {
      if (c.hero.coins > this.lastCoins && this.lastCoins >= 0) this.bump(this.coinPill);
      if (this.lastCoins < 0) this.shownCoins = c.hero.coins;
      this.lastCoins = c.hero.coins;
      this.coinPill.classList.toggle("full", c.hero.coins >= carryCap(c));
    }
    this.shownCoins = this.roll(this.shownCoins, c.hero.coins, k, this.coinText);

    const showLogs = c.hero.logs > 0 || c.plots.some((p) => p.kind === "lumber" && p.level > 0);
    this.logPill.style.display = showLogs ? "flex" : "none";
    if (c.hero.logs !== this.lastLogs) {
      if (c.hero.logs > this.lastLogs && this.lastLogs >= 0) this.bump(this.logPill);
      if (this.lastLogs < 0) this.shownLogs = c.hero.logs;
      this.lastLogs = c.hero.logs;
    }
    this.shownLogs = this.roll(this.shownLogs, c.hero.logs, k, this.logText);
    this.bowPill.style.display = c.hero.bows > 0 ? "flex" : "none";
    this.xpFill.style.width = `${(c.heroXp / xpToNext(c.heroLevel)) * 100}%`;
    if (c.heroLevel !== this.lastLevel) {
      // Level up: the pill pops and glows green, matching the on-map "LEVEL N!" burst.
      if (c.heroLevel > this.lastLevel && this.lastLevel > 0) {
        this.bump(this.xpPill);
        this.xpPill.classList.remove("lvl-up");
        void this.xpPill.offsetWidth;
        this.xpPill.classList.add("lvl-up");
      }
      this.lastLevel = c.heroLevel;
    }
    this.xpText.textContent = `Lv ${c.heroLevel}`;
    this.bowText.textContent = `${c.hero.bows}`;
    const left = c.queue.length + c.enemies.length;
    const key = `${c.wave}|${c.phase}|${Math.ceil(c.hallHp)}|${left}|${c.hero.dead ? Math.ceil(c.hero.respawn) : -1}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const total = c.chapter.waves.length;
    const cur = c.phase === "wave" ? c.wave : Math.min(total, c.wave + 1);
    const wIcon = c.phase === "wave" && c.weather !== "clear" ? ` ${WEATHER_INFO[c.weather].icon}` : "";
    this.waveLabel.textContent = (c.chapter.endless ? `NIGHT ${cur} · ENDLESS${this.twistIcon ? ` ${this.twistIcon}` : ""}` : `NIGHT ${cur}/${total}`) + wIcon;
    this.waveDots.style.display = c.chapter.endless ? "none" : "flex";
    const showBest = !!c.chapter.endless && this.endlessBest > 0;
    this.waveBest.style.display = showBest ? "block" : "none";
    if (showBest) {
      const beat = cur > this.endlessBest;
      this.waveBest.textContent = beat ? "🏆 NEW RECORD" : `BEST ${this.endlessBest}`;
      this.waveBest.classList.toggle("beat", beat);
    }
    if (this.waveDots.childElementCount !== total) {
      this.waveDots.replaceChildren(...c.chapter.waves.map((w) => el("i", w.boss ? "dot boss-dot" : "dot")));
    }
    [...this.waveDots.children].forEach((d, i) => {
      d.classList.toggle("done", i < c.wave - (c.phase === "wave" ? 1 : 0));
      d.classList.toggle("cur", i === cur - 1);
    });
    const frac = Math.max(0, c.hallHp / c.hallMaxHp);
    this.hallFill.style.width = `${frac * 100}%`;
    this.hallTicks.style.display = c.chapter.endless || this.noStars ? "none" : "block";
    this.hallChip.style.width = `${frac * 100}%`;
    this.hallFill.style.background = frac > 0.5 ? "linear-gradient(#8ef06a,#4cb83a)" : frac > 0.25 ? "linear-gradient(#ffd060,#e09020)" : "linear-gradient(#ff7a5a,#c8301a)";
    this.hallText.textContent = `${Math.ceil(c.hallHp)}`;
    this.hallPill.classList.toggle("danger", frac < 0.3);
    // Hall took damage: a quick red flash + nudge on the pill (at most every 0.3 s).
    if (this.lastHall >= 0 && c.hallHp < this.lastHall && performance.now() - this.hallFlashAt > 300) {
      this.hallFlashAt = performance.now();
      this.hallPill.classList.remove("hit");
      void this.hallPill.offsetWidth;
      this.hallPill.classList.add("hit");
      // Drop the class after the flash so it can't keep overriding the low-HP "danger" pulse.
      window.setTimeout(() => this.hallPill.classList.remove("hit"), 320);
    }
    this.lastHall = c.hallHp;
    if (c.hero.dead) this.status.textContent = `💀 Respawning in ${Math.ceil(c.hero.respawn)}…`;
    else if (c.phase === "wave") {
      this.status.textContent = `⚔ ${left} ${left === 1 ? "foe" : "foes"} left`;
      // Each kill bumps the counter; the last few foes make it pulse (the night is almost won).
      if (left < this.lastLeft) this.bump(this.status);
      this.status.classList.toggle("last-few", left > 0 && left <= 3);
    }
    else if (c.phase === "pick") this.status.textContent = "🌅 Dawn breaks…";
    else this.status.textContent = "☀ Day — build & upgrade";
    if (c.phase !== "wave") this.status.classList.remove("last-few");
    this.lastLeft = c.phase === "wave" ? left : 9999;
    this.status.classList.toggle("red", c.hero.dead);
  }
}

/** Owned levels filled, the level this pick grants glows. */
function levelPips(owned: number, max: number): HTMLElement {
  const row = el("div", "card-pips");
  for (let i = 0; i < max; i++) row.append(el("i", i < owned ? "on" : i === owned ? "next" : ""));
  return row;
}
