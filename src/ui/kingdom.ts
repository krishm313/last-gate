// Kingdom view (C11): a small painted scene at the top of the Battle tab that grows with progress.
// Every chapter cleared raises a landmark (3D-rendered, the same art as the battlefield), stars level
// them up, Crowns grow the castle, and the next landmark waits as a faint build site.
import { BUILDING_ATLAS, DECOR_ATLAS, TOWER_ATLAS } from "../camp/propAtlas";
import { CHAPTERS } from "../core/chapters";
import { CH11_ENABLED } from "../core/features";
import { totalStars, type SaveData } from "../core/meta";
import { CONQUEST_BANNERS, conquestDone, conquestEntry } from "../core/conquest";
import { getItem, setItem } from "./store";

type Atlas = Record<string, [number, number, number, number, number, number]>;
interface Landmark {
  /** Chapter whose clear raises it (0 = always there). */
  ch: number;
  name: string;
  /** Sprite name for a given level (1..), and which atlas. */
  sprite: (lv: number) => string;
  atlas: "bld" | "tower" | "decor";
  x: number;
  y: number;
  scale: number;
  /** Highest level it shows. */
  max: number;
}

const W = 340, H = 176;
const LANDMARKS: Landmark[] = [
  { ch: 0, name: "Archer Tower", sprite: (l) => `tower${l}`, atlas: "tower", x: 70, y: 70, scale: 0.42, max: 4 },
  { ch: 0, name: "Archer Tower", sprite: (l) => `tower${l}`, atlas: "tower", x: 270, y: 70, scale: 0.42, max: 4 },
  { ch: 1, name: "Lumber Camp", sprite: (l) => `cabin${l}`, atlas: "bld", x: 44, y: 114, scale: 0.4, max: 3 },
  { ch: 2, name: "Barracks", sprite: (l) => `tent${l}`, atlas: "bld", x: 296, y: 116, scale: 0.42, max: 4 },
  { ch: 3, name: "Forge", sprite: (l) => `forge${l}`, atlas: "bld", x: 104, y: 92, scale: 0.36, max: 2 },
  { ch: 4, name: "Mage Tower", sprite: (l) => `mage${l}`, atlas: "bld", x: 22, y: 78, scale: 0.4, max: 4 },
  { ch: 5, name: "Healer's Tent", sprite: (l) => `healer${l}`, atlas: "bld", x: 240, y: 98, scale: 0.38, max: 4 },
  { ch: 6, name: "Watchtower", sprite: (l) => `watch${l}`, atlas: "bld", x: 322, y: 80, scale: 0.36, max: 3 },
  { ch: 7, name: "Catapult", sprite: (l) => `catapult${l}`, atlas: "bld", x: 118, y: 140, scale: 0.5, max: 4 },
  { ch: 8, name: "Merchant", sprite: () => "cart", atlas: "bld", x: 236, y: 142, scale: 0.4, max: 1 },
  { ch: 9, name: "Old Shrine", sprite: () => "shrine", atlas: "bld", x: 206, y: 62, scale: 0.34, max: 1 },
  { ch: 10, name: "Royal Banners", sprite: () => "banner1", atlas: "decor", x: 134, y: 126, scale: 0.6, max: 1 },
  { ch: 10, name: "Royal Banners", sprite: () => "banner1", atlas: "decor", x: 206, y: 126, scale: 0.6, max: 1 },
  ...(CH11_ENABLED ? [{ ch: 11, name: "Storm Lighthouse", sprite: () => "lighthouse", atlas: "bld" as const, x: 300, y: 52, scale: 0.3, max: 1 }] : []),
];
/** Distinct landmarks (the paired banners and the starting towers count once). */
const NAMES = [...new Set(LANDMARKS.map((l) => l.name))];

const imgs: Record<string, HTMLImageElement> = {};
function img(src: string): HTMLImageElement {
  if (!imgs[src]) {
    const i = new Image();
    i.src = src;
    imgs[src] = i;
  }
  return imgs[src]!;
}

function cleared(save: SaveData, ch: number): boolean {
  return ch === 0 || (save.stars[ch] ?? 0) > 0;
}
/** Landmarks raised so far (distinct names) and the next one to earn. */
export function kingdomProgress(save: SaveData): { raised: number; total: number; next: { name: string; chapter: string } | null } {
  const raised = NAMES.filter((n) => LANDMARKS.some((l) => l.name === n && cleared(save, l.ch))).length;
  const nx = LANDMARKS.filter((l) => !cleared(save, l.ch)).sort((a, b) => a.ch - b.ch)[0];
  const chName = nx ? CHAPTERS.find((c) => c.id === nx.ch)?.name ?? `chapter ${nx.ch}` : "";
  return { raised, total: NAMES.length, next: nx ? { name: nx.name, chapter: chName } : null };
}

function draw(cv: HTMLCanvasElement, save: SaveData, fresh: Set<string>, t = 0): boolean {
  const ctx = cv.getContext("2d");
  if (!ctx) return true;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = cv.clientWidth || W;
  const k = cw / W;
  const pw = Math.round(W * k * dpr), ph = Math.round(H * k * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // Ground: a summer meadow under an evening sky band, a stone plaza round the castle and the road.
  const sky = ctx.createLinearGradient(0, 0, 0, 40);
  sky.addColorStop(0, "#f6c98a");
  sky.addColorStop(1, "#cfe4a0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 40);
  // Slow clouds drifting across the sky band, and now and then a pair of birds.
  for (let i = 0; i < 3; i++) {
    const cx = ((t * (4 + i * 1.5) + i * 130) % (W + 120)) - 60, cy = 10 + i * 7;
    ctx.fillStyle = "rgba(255,250,240,0.55)";
    ctx.beginPath(); ctx.ellipse(cx, cy, 22 - i * 3, 5, 0, 0, Math.PI * 2); ctx.ellipse(cx + 10, cy - 3, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  const bt = (t % 24) / 24;
  if (bt < 0.5) {
    const bx = -20 + bt * 2 * (W + 40), by = 16 + Math.sin(bt * 9) * 3;
    ctx.strokeStyle = "rgba(60,50,40,0.6)";
    ctx.lineWidth = 0.9;
    for (const [dx, dy] of [[0, 0], [9, 3]] as const) {
      const f = Math.sin(t * 9 + dx) * 1.4;
      ctx.beginPath(); ctx.moveTo(bx + dx - 3, by + dy - f); ctx.lineTo(bx + dx, by + dy); ctx.lineTo(bx + dx + 3, by + dy - f); ctx.stroke();
    }
  }
  const g = ctx.createLinearGradient(0, 30, 0, H);
  g.addColorStop(0, "#8fbf5a");
  g.addColorStop(1, "#5f9a3e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 34);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 30 + Math.sin(x * 0.05) * 4);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  // Far woods along the horizon.
  for (let i = 0; i < 18; i++) {
    const x = i * 20 + ((i * 37) % 9), y = 34 + Math.sin(i * 1.7) * 3;
    ctx.fillStyle = i % 2 ? "#4f8a3a" : "#5e9a42";
    ctx.beginPath(); ctx.arc(x, y, 9 + (i % 3) * 2, Math.PI, 0); ctx.fill();
  }
  ctx.fillStyle = "rgba(196,170,120,0.9)";
  ctx.beginPath(); ctx.moveTo(150, H); ctx.quadraticCurveTo(170, 120, 166, 100); ctx.lineTo(176, 100); ctx.quadraticCurveTo(178, 122, 196, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#b8b0a0";
  ctx.beginPath(); ctx.ellipse(171, 106, 52, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a49c8c";
  ctx.beginPath(); ctx.ellipse(171, 107, 44, 9, 0, 0, Math.PI * 2); ctx.fill();
  const bld = img("./sprites/props/buildings.webp"), tow = img("./sprites/props/tower.webp"), dec = img("./sprites/props/decor.webp"), castle = img("./sprites/units/castle.png");
  const ready = [bld, tow, dec, castle].every((i) => i.complete && i.naturalWidth > 0);
  if (!ready) return false;
  const stars = totalStars(save);
  const towerLv = Math.min(4, 1 + Math.floor(stars / 8));
  const items: { y: number; draw: () => void }[] = [];
  const sprite = (atlas: Atlas, im: HTMLImageElement, name: string, x: number, y: number, s: number, alpha: number) => {
    const e = atlas[name];
    if (!e) return;
    const [sx, sy, sw, sh, fx, fy] = e;
    const kk = 0.5 * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Soft contact shadow so each piece sits on the meadow.
    ctx.fillStyle = "rgba(20,30,10,0.22)";
    ctx.beginPath(); ctx.ellipse(x, y, sw * kk * 0.42, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (alpha < 1) ctx.filter = "grayscale(1) brightness(1.6)";
    ctx.drawImage(im, sx, sy, sw, sh, x - fx * kk, y - fy * kk, sw * kk, sh * kk);
    ctx.restore();
  };
  for (const l of LANDMARKS) {
    const open = cleared(save, l.ch);
    const lv = l.atlas === "tower" ? towerLv : Math.max(1, Math.min(l.max, save.stars[l.ch] ?? 1));
    const atlas = l.atlas === "tower" ? TOWER_ATLAS : l.atlas === "decor" ? DECOR_ATLAS : BUILDING_ATLAS;
    const im = l.atlas === "tower" ? tow : l.atlas === "decor" ? dec : bld;
    const isNext = !open && kingdomProgress(save).next?.name === l.name;
    if (!open && !isNext) continue;
    items.push({ y: l.y, draw: () => {
      sprite(atlas, im, l.sprite(lv), l.x, l.y, l.scale, open ? 1 : 0.28);
      // The catapult's throwing arm is a separate piece (the game swings it): set it at rest.
      const arm = DECOR_ATLAS.cat_arm1;
      if (l.name === "Catapult" && arm) {
        const [ax, ay, aw, ah, afx, afy] = arm;
        ctx.save();
        ctx.globalAlpha = open ? 1 : 0.28;
        ctx.translate(l.x, l.y - 28 * l.scale);
        ctx.rotate(-0.5);
        ctx.scale(l.scale, l.scale);
        ctx.drawImage(dec, ax, ay, aw, ah, -afx * 0.5, 6 - afy * 0.5, aw * 0.5, ah * 0.5);
        ctx.restore();
      }
      if (open && fresh.has(l.name)) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const r = ctx.createRadialGradient(l.x, l.y - 18, 2, l.x, l.y - 18, 34);
        r.addColorStop(0, "rgba(255,230,140,0.75)");
        r.addColorStop(1, "rgba(255,200,80,0)");
        ctx.fillStyle = r;
        ctx.fillRect(l.x - 40, l.y - 60, 80, 70);
        ctx.restore();
      }
    } });
  }
  // Conquest: every War Banner with a milestone flies its flag along the horizon.
  const flown = CONQUEST_BANNERS.filter((b) => conquestDone(conquestEntry(save.conquest, b.id)) > 0);
  const flagX = [36, 92, 132, 210, 250, 306];
  flown.forEach((b, i) => {
    const x = flagX[i]!, y = 50;
    items.push({ y, draw: () => {
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(1, 0, Math.sin(t * 2.2 + i) * 0.06, 1, 0, 0);
      ctx.translate(-x, -y);
      sprite(DECOR_ATLAS, dec, "banner1", x, y, 0.42, 1);
      ctx.restore();
      const full = conquestDone(conquestEntry(save.conquest, b.id)) === 3;
      ctx.save();
      ctx.fillStyle = full ? "#ffd84a" : "#f2c443";
      ctx.strokeStyle = "#5a3a10";
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(x + 4.5, y - 11.5, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = "4.8px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.icon, x + 4.5, y - 11.2);
      ctx.restore();
    } });
  });
  // The castle grows a little with each Crown.
  const crowns = save.crowns ?? 0;
  items.push({ y: 106, draw: () => {
    const h = 62 * (1 + Math.min(5, crowns) * 0.06);
    const w = (castle.naturalWidth / castle.naturalHeight) * h;
    ctx.drawImage(castle, 171 - w / 2, 108 - h, w, h);
  } });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  // Chimney smoke from the Lumber Camp and the Forge, curling up and fading.
  const smoke = (x: number, y: number, seed: number) => {
    for (let i = 0; i < 4; i++) {
      const u = ((t * 0.35 + i / 4 + seed) % 1);
      ctx.fillStyle = `rgba(200,196,190,${(0.5 * (1 - u)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x + Math.sin(u * 5 + seed * 7) * 3 + u * 6, y - u * 22, 1.6 + u * 4, 0, Math.PI * 2); ctx.fill();
    }
  };
  if (cleared(save, 1)) smoke(40, 91, 0.1);
  if (cleared(save, 3)) smoke(109, 73, 0.6);
  // The Storm Lighthouse's lamp pulses.
  if (CH11_ENABLED && cleared(save, 11)) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(299, 38, 0, 299, 38, 10);
    const a = 0.45 + 0.35 * Math.sin(t * 2.4);
    g.addColorStop(0, `rgba(255,230,150,${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(255,200,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(289, 28, 20, 20);
    ctx.restore();
  }
  return true;
}

/** The kingdom card: the scene, "N / M landmarks", and what the next chapter will raise. */
export function kingdomCard(save: SaveData): HTMLElement {
  const card = document.createElement("div");
  card.className = "lgk-card";
  const cv = document.createElement("canvas");
  cv.className = "lgk-scene";
  const prog = kingdomProgress(save);
  // Landmarks raised since the player last looked glow once.
  const key = "lastgate.kingdomSeen";
  const seen = new Set<string>((getItem(key) ?? "").split("|").filter(Boolean));
  const raisedNow = NAMES.filter((n) => LANDMARKS.some((l) => l.name === n && cleared(save, l.ch)));
  const fresh = new Set(getItem(key) === null ? [] : raisedNow.filter((n) => !seen.has(n)));
  setItem(key, raisedNow.join("|"));
  const cap = document.createElement("div");
  cap.className = "lgk-cap";
  const title = document.createElement("div");
  title.className = "lgk-title";
  title.textContent = `🏰 Your kingdom · ${prog.raised} / ${prog.total} landmarks`;
  const sub = document.createElement("div");
  sub.className = "lgk-sub";
  sub.textContent = fresh.size ? `✨ New: ${[...fresh].join(", ")}!` : prog.next ? `Clear ${prog.next.chapter} to raise the ${prog.next.name}` : "Every landmark raised — long live the King!";
  if (fresh.size) card.classList.add("lgk-fresh");
  cap.append(title, sub);
  card.append(cv, cap);
  // Draw once laid out; retry until the sprite sheets have loaded.
  // Then keep it alive (~30 fps) while it's on screen; it stops once the card leaves the page.
  let tries = 0, last = 0, started = false;
  const t0 = performance.now();
  const go = (now = performance.now()) => {
    if (!cv.isConnected) {
      if (started || tries++ > 40) return;
      return void requestAnimationFrame(go);
    }
    started = true;
    // Hidden (the hub is display:none during a run): don't redraw — check back now and then.
    if (cv.offsetParent === null || document.hidden) return void window.setTimeout(() => requestAnimationFrame(go), 500);
    if (now - last >= 33) {
      last = now;
      if (!draw(cv, save, fresh, (now - t0) / 1000) && tries++ < 120) return void window.setTimeout(() => go(), 100);
    }
    requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
  return card;
}
