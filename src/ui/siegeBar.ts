import { ENEMIES } from "../core/enemies";
import { drawFlyer } from "../mini/flyer";
import { cardOpen, REVERSE, WAR_CARDS, type Camp } from "../camp/sim";

/**
 * Siege Lord controls: the top strip (the castle's hall, the push counter and timer) and the bottom
 * deck — unit cards paid from the War Chest. Tap a card, then a lane (left / middle / right) to send
 * them in. A card stays selected so a lane can be tapped again for the next group.
 */
const CARD_ART: Record<string, string> = {
  footman: "enemy_footman", runner: "enemy_footman", shield: "enemy_shield", crossbow: "enemy_crossbow", brute: "enemy_brute", sapper: "enemy_sapper",
};
/** Cards drawn from in-game sprites (full paths). */
const CARD_SPRITE: Record<string, string> = { bat: "./sprites/props/bat.webp", imp: "./sprites/props/imp.webp" };
const CARD_EMOJI: Record<string, string> = { bat: "🦇", ram: "🪵", raven: "🐦‍⬛", tunneler: "⛏️", imp: "🔥" };
export const CARD_NAME: Record<string, string> = { footman: "Footmen", runner: "Runners", shield: "Shields", crossbow: "Archers", brute: "Brute", bat: "Bats", sapper: "Sapper", ram: "Ram", raven: "Ravens", tunneler: "Diggers", imp: "Imps" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class SiegeBar {
  readonly root = el("div", "lgs2");
  private top = el("div", "lgs2-top");
  private hallFill = el("i", "");
  private hallText = el("span", "lgs2-hall-t");
  private pushText = el("div", "lgs2-push");
  private deck = el("div", "lgs2-deck");
  private chestFill = el("i", "");
  private chestText = el("span", "lgs2-chest-t");
  private lanes = el("div", "lgs2-lanes");
  private cards = new Map<string, HTMLButtonElement>();
  private picked: string | null = null;
  private won = 0;

  constructor(host: HTMLElement, private onDeploy: (id: string, lane: number) => void, private onPause: () => void) {
    const hall = el("div", "lgs2-hall");
    const bar = el("div", "lgs2-bar");
    bar.append(this.hallFill);
    hall.append(el("span", "lgs2-hall-i", "🏰"), bar, this.hallText);
    const pause = el("button", "lgs2-pause", "II");
    pause.onclick = () => this.onPause();
    this.top.append(hall, this.pushText, pause);
    const chest = el("div", "lgs2-chest");
    const cbar = el("div", "lgs2-bar gold");
    cbar.append(this.chestFill);
    chest.append(el("span", "lgs2-chest-i", "💰"), cbar, this.chestText);
    for (const [i, label] of ["◀ Left", "Middle", "Right ▶"].entries()) {
      const b = el("button", "lgs2-lane", label);
      b.onclick = () => {
        if (this.picked) this.onDeploy(this.picked, i);
      };
      this.lanes.append(b);
    }
    for (const card of WAR_CARDS) {
      const b = el("button", "lgs2-card");
      const art = el("div", "lgs2-art");
      const pic = CARD_ART[card.id];
      const sprite = CARD_SPRITE[card.id];
      if (sprite) {
        // Winged flyers come as an atlas (body + one wing): assemble them on a small canvas.
        const cv = document.createElement("canvas");
        cv.width = 120;
        cv.height = 72;
        cv.className = "wide";
        const img = new Image();
        img.onload = () => drawFlyer(cv.getContext("2d")!, img, card.id === "imp" ? "imp" : "bat", 60, 38, 50, 0.4);
        img.src = sprite;
        art.append(cv);
      } else if (pic) {
        const img = document.createElement("img");
        img.src = `./sprites/portraits/${pic}.png`;
        img.alt = "";
        art.append(img);
      } else art.textContent = CARD_EMOJI[card.id] ?? "👹";
      b.append(art, el("div", "lgs2-name", `${CARD_NAME[card.id] ?? ENEMIES[card.id].name}${card.count > 1 ? ` ×${card.count}` : ""}`), el("div", "lgs2-cost", `💰${card.cost}`));
      b.onclick = () => {
        if (!cardOpen(card, this.won)) return;
        this.picked = this.picked === card.id ? null : card.id;
        this.refreshPick();
      };
      this.cards.set(card.id, b);
      this.deck.append(b);
    }
    const bottom = el("div", "lgs2-bottom");
    bottom.append(this.lanes, chest, this.deck);
    this.root.append(this.top, bottom);
    this.root.style.display = "none";
    host.append(this.root);
    this.refreshPick();
  }

  private refreshPick(): void {
    for (const [id, b] of this.cards) b.classList.toggle("on", id === this.picked);
    this.lanes.classList.toggle("show", !!this.picked);
  }

  /** Which war cards are in the deck (later ones open as sieges are won). */
  setWon(won: number): void {
    this.won = won;
    for (const card of WAR_CARDS) {
      const b = this.cards.get(card.id)!;
      const open = cardOpen(card, won);
      b.classList.toggle("locked", !open);
      b.querySelector(".lgs2-cost")!.textContent = open ? `💰${card.cost}` : `🔒 Win ${card.unlock}`;
    }
    this.deck.classList.toggle("wide", WAR_CARDS.length > 8);
  }

  show(v: boolean): void {
    this.root.style.display = v ? "flex" : "none";
    if (!v) {
      this.picked = null;
      this.refreshPick();
    }
  }

  update(c: Camp): void {
    const r = c.reverse;
    if (!r) return;
    const hall = Math.max(0, c.hallHp / c.hallMaxHp);
    this.hallFill.style.width = `${hall * 100}%`;
    this.hallText.textContent = `${Math.ceil(c.hallHp)}`;
    const left = c.phase === "wave" ? Math.max(0, Math.ceil(REVERSE.push - c.waveTime)) : 0;
    this.pushText.textContent = c.phase === "wave" ? `PUSH ${c.wave}/${REVERSE.pushes} · ${left}s` : "The castle prepares…";
    this.chestFill.style.width = `${(r.chest / REVERSE.cap) * 100}%`;
    this.chestText.textContent = `${Math.floor(r.chest)}`;
    for (const card of WAR_CARDS) this.cards.get(card.id)!.classList.toggle("poor", r.chest < card.cost || c.phase !== "wave");
    // First steps: until the first group is sent, the deck (then the lanes) pulse to show what to tap.
    const coach = r.deployed === 0 && c.phase === "wave";
    this.deck.classList.toggle("coach", coach && !this.picked);
    this.lanes.classList.toggle("coach", coach && !!this.picked);
  }
}
