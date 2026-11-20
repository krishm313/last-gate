import { ENEMIES } from "../core/enemies";
import { drawFlyer } from "../mini/flyer";
import { cardOpen, REVERSE, WAR_CARDS, type Camp } from "../camp/sim";

/**
 * Siege Lord controls: the top strip (the castle's hall, the push counter and timer) and the bottom
 * deck — unit cards paid from the War Chest. Tap a card, then a lane (left / middle / right) to send
 * them in. A card stays selected so a lane can be tapped again for the next group.
 */
const CARD_ART: Record<string, string> = {
  footman: "enemy_footman", runner: "enemy_footman", shield: "enemy_shield", crossbow: "enemy_crossbow", brute: "enemy_brute", sapper: "enemy_sapper", shaman: "enemy_shaman", knight: "enemy_knight", stalker: "enemy_stalker",
};
/** Cards drawn from in-game sprites (full paths). */
const CARD_SPRITE: Record<string, string> = { bat: "./sprites/props/bat.webp", imp: "./sprites/props/imp.webp" };
const CARD_EMOJI: Record<string, string> = { bat: "🦇", ram: "🪵", raven: "🐦‍⬛", tunneler: "⛏️", imp: "🔥" };
export const CARD_NAME: Record<string, string> = { footman: "Footmen", runner: "Runners", shield: "Shields", crossbow: "Archers", brute: "Brute", bat: "Bats", sapper: "Sapper", ram: "Ram", raven: "Ravens", tunneler: "Diggers", imp: "Imps", shaman: "Shaman", knight: "Knights", stalker: "Stalkers" };

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

  /** Drag-and-drop: maps a screen point to a lane (null over the deck/off the field), and reports the hovered lane. */
  laneAtClient: (x: number, y: number) => number | null = () => null;
  onHover: (lane: number | null, card: string | null) => void = () => {};
  private drag: { id: string; card: HTMLElement; ghost: HTMLElement; x0: number; y0: number; moved: boolean; pointer: number } | null = null;

  constructor(host: HTMLElement, private onDeploy: (id: string, lane: number) => boolean, private onPause: () => void) {
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
      b.onclick = () => this.send(i);
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
      // Drag a card onto the field to drop that group in the lane under your finger; a plain tap
      // picks it instead (it stays picked, so taps on the field keep sending it).
      b.addEventListener("pointerdown", (ev) => this.dragStart(ev, card.id, b));
      b.addEventListener("pointermove", (ev) => this.dragMove(ev));
      b.addEventListener("pointerup", (ev) => this.dragEnd(ev, false));
      b.addEventListener("pointercancel", (ev) => this.dragEnd(ev, true));
      this.cards.set(card.id, b);
      this.deck.append(b);
    }
    const bottom = el("div", "lgs2-bottom");
    // (Lanes are picked by tapping the battlefield itself — see tapField; no buttons over the field.)
    bottom.append(chest, this.deck);
    this.root.append(this.top, bottom);
    this.root.style.display = "none";
    host.append(this.root);
    this.refreshPick();
  }

  private refreshPick(): void {
    for (const [id, b] of this.cards) b.classList.toggle("on", id === this.picked);
  }

  /** The card currently picked (null if none). */
  get pickedCard(): string | null {
    return this.picked;
  }

  /** The battlefield was tapped over lane 0–2: send the picked card there. */
  tapField(lane: number): boolean {
    return this.send(lane);
  }

  private send(lane: number): boolean {
    if (!this.picked) {
      this.deck.classList.remove("hint");
      void this.deck.offsetWidth;
      this.deck.classList.add("hint");
      return false;
    }
    const ok = this.onDeploy(this.picked, lane);
    const b = this.cards.get(this.picked);
    if (!ok && b) this.nope(b);
    return ok;
  }

  private dragStart(ev: PointerEvent, id: string, b: HTMLElement): void {
    const card = WAR_CARDS.find((k) => k.id === id)!;
    if (!cardOpen(card, this.won)) return this.nope(b);
    if (this.drag) return;
    ev.preventDefault();
    b.setPointerCapture(ev.pointerId);
    const ghost = el("div", "lgs2-ghost");
    ghost.append(b.querySelector(".lgs2-art")!.cloneNode(true));
    ghost.style.display = "none";
    this.root.append(ghost);
    this.drag = { id, card: b, ghost, x0: ev.clientX, y0: ev.clientY, moved: false, pointer: ev.pointerId };
    this.picked = id;
    this.refreshPick();
  }

  private dragMove(ev: PointerEvent): void {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointer) return;
    if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 10) {
      d.moved = true;
      d.ghost.style.display = "flex";
      d.card.classList.add("dragging");
    }
    if (!d.moved) return;
    d.ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    const lane = this.laneAtClient(ev.clientX, ev.clientY);
    d.ghost.classList.toggle("over", lane !== null);
    this.onHover(lane, d.id);
  }

  private dragEnd(ev: PointerEvent, cancel: boolean): void {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointer) return;
    this.drag = null;
    d.ghost.remove();
    d.card.classList.remove("dragging");
    this.onHover(null, null);
    if (cancel || !d.moved) return; // a tap just picks the card
    const lane = this.laneAtClient(ev.clientX, ev.clientY);
    if (lane !== null) this.send(lane);
  }

  /** Can't afford / locked: a short shake. */
  private nope(b: HTMLElement): void {
    b.classList.remove("nope");
    void b.offsetWidth;
    b.classList.add("nope");
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
    // Always two even rows once the deck is big (13 cards would leave one alone on a third row).
    this.deck.style.gridTemplateColumns = WAR_CARDS.length > 8 ? `repeat(${Math.ceil(WAR_CARDS.length / 2)}, 1fr)` : "";
  }

  show(v: boolean): void {
    this.root.style.display = v ? "flex" : "none";
    // A new siege starts with Footmen picked, so the first tap on the field already sends a group.
    this.picked = v ? WAR_CARDS[0]!.id : null;
    this.refreshPick();
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
    // (First steps are coached on the battlefield itself: the lane markers pulse until the first send.)
  }
}
