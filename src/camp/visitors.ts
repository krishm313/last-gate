import { FONT } from "../ui/font";
import { INK, softShadow } from "./art";
import { BLESSING_BY_ID } from "./blessings";
import { VISITOR, type Camp, type VisitorKind } from "./sim";

/** Presentation state for today's visitor (outlives the sim's visitor so it can leave on screen). */
export interface VisitorAnim {
  kind: VisitorKind;
  x: number;
  y: number;
  offer: string | null;
  price: number;
  arriveAt: number;
  leaveAt: number | null;
  doneAt: number | null;
}

const easeOutBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/** Seconds the leave animation takes (after which the anim can be dropped). */
export const VISITOR_LEAVE = 1.2;

/** Pill-shaped speech label above the visitor; returns its height. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], accent: string, scale: number, progress?: number): void {
  if (scale <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = `900 11px ${FONT}`;
  const w = Math.max(...lines.map((l, i) => { ctx.font = i === 0 ? `900 11px ${FONT}` : `800 9px ${FONT}`; return ctx.measureText(l).width; })) + 18;
  const h = 8 + lines.length * 13 + (progress !== undefined ? 7 : 0);
  ctx.fillStyle = "rgba(14,22,44,0.92)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h, w, h, 8);
  ctx.moveTo(-5, 0); ctx.lineTo(0, 6); ctx.lineTo(5, 0);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.font = i === 0 ? `900 11px ${FONT}` : `800 9px ${FONT}`;
    ctx.fillStyle = i === 0 ? "#fff" : "#cfd8f0";
    ctx.fillText(l, 0, -h + 10 + i * 13);
  });
  if (progress !== undefined) {
    const bw = w - 18;
    ctx.fillStyle = "#0008";
    ctx.beginPath(); ctx.roundRect(-bw / 2, -9, bw, 5, 2.5); ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(-bw / 2, -9, Math.max(5, bw * clamp01(progress)), 5, 2.5); ctx.fill();
  }
  ctx.restore();
}

/** The Wandering Merchant: a cart that rolls in, a hooded trader who waves you over, and the wares on a sign. */
function drawMerchant(ctx: CanvasRenderingContext2D, c: Camp, a: VisitorAnim, t: number): void {
  const v = c.visitor;
  const since = t - a.arriveAt;
  // Rolls in from the left with a little overshoot; rolls off to the right at nightfall.
  let dx = (1 - easeOutBack(clamp01(since / 1.1))) * -260;
  if (a.leaveAt !== null) dx = ((t - a.leaveAt) / VISITOR_LEAVE) ** 2 * 320;
  const rolling = since < 1.1 || a.leaveAt !== null;
  const x = a.x + dx, y = a.y;
  const near = !!v && (c.hero.x - a.x) ** 2 + (c.hero.y - a.y) ** 2 < (VISITOR.radius + 30) ** 2;
  softShadow(ctx, x + 4, y + 14, 44, 9, 0.3);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  // Settling bounce once the cart stops; a gentle rock while it rolls.
  const bob = rolling ? Math.sin(t * 18) * 1.2 : Math.max(0, 1 - (since - 1.1) / 0.5) * Math.sin((since - 1.1) * 20) * 2;
  // Trader (behind the cart): hooded, head bobbing; waves when the hero comes close.
  const hb = Math.sin(t * 3) * 1.2;
  ctx.lineWidth = 2;
  ctx.fillStyle = "#5a3a8a";
  ctx.beginPath(); ctx.ellipse(-26, -30 + hb, 11, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#f0c8a0";
  ctx.beginPath(); ctx.arc(-26, -44 + hb, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#4a2e74";
  ctx.beginPath(); ctx.arc(-26, -46 + hb, 8, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(-19, -40 + hb); ctx.lineTo(-33, -40 + hb); ctx.closePath(); ctx.fill(); ctx.stroke();
  const wave = near && a.doneAt === null ? Math.sin(t * 10) * 0.6 : a.doneAt !== null && t - a.doneAt < 1.5 ? Math.sin((t - a.doneAt) * 14) * 0.7 : 0;
  ctx.save();
  ctx.translate(-18, -36 + hb);
  ctx.rotate(-0.9 + wave);
  ctx.fillStyle = "#5a3a8a";
  ctx.beginPath(); ctx.roundRect(-2.5, -14, 5, 14, 2.5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#f0c8a0";
  ctx.beginPath(); ctx.arc(0, -15, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.translate(0, bob);
  // Cart body.
  const body = ctx.createLinearGradient(0, -22, 0, 4);
  body.addColorStop(0, "#c08a50");
  body.addColorStop(1, "#7a4e28");
  ctx.fillStyle = body;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.roundRect(-30, -22, 60, 24, 4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#5a3818";
  ctx.lineWidth = 1.2;
  for (const k of [-15, 0, 15]) { ctx.beginPath(); ctx.moveTo(k, -20); ctx.lineTo(k, 0); ctx.stroke(); }
  ctx.strokeStyle = INK;
  // Wares peeking out: a sack, a crate, a glinting bottle.
  ctx.fillStyle = "#d8c08a"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(-14, -25, 9, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#6ac0e8";
  ctx.beginPath(); ctx.roundRect(8, -34, 7, 12, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
  ctx.fillRect(10, -32, 2, 5);
  ctx.globalAlpha = 1;
  // Awning on two poles: red/cream stripes with a scalloped hem that sways.
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-27, -22); ctx.lineTo(-27, -52); ctx.moveTo(27, -22); ctx.lineTo(27, -52); ctx.stroke();
  const sway = Math.sin(t * 2.2) * 1.5;
  for (let i = 0; i < 6; i++) {
    const x0 = -32 + i * (64 / 6), x1 = x0 + 64 / 6;
    ctx.fillStyle = i % 2 ? "#f4ecd8" : "#d8443a";
    ctx.beginPath();
    ctx.moveTo(x0 + 3, -60); ctx.lineTo(x1 + 3, -60); ctx.lineTo(x1 + sway, -50);
    ctx.quadraticCurveTo((x0 + x1) / 2 + sway, -44, x0 + sway, -50);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // Wheels, turning with the distance rolled.
  const ang = dx / 9;
  for (const wx of [-19, 19]) {
    ctx.save();
    ctx.translate(wx, 3 - bob);
    ctx.rotate(ang);
    ctx.fillStyle = "#6a4422";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 1.4;
    for (let s = 0; s < 4; s++) { ctx.beginPath(); ctx.moveTo(Math.cos((s * Math.PI) / 4) * -8, Math.sin((s * Math.PI) / 4) * -8); ctx.lineTo(Math.cos((s * Math.PI) / 4) * 8, Math.sin((s * Math.PI) / 4) * 8); ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
  // The sign: what's for sale and the price (with the paid bar while you stand there).
  const b = a.offer ? BLESSING_BY_ID[a.offer] : null;
  if (b && a.leaveAt === null) {
    const pop = easeOutBack(clamp01((since - 0.9) / 0.45));
    if (a.doneAt === null) bubble(ctx, x, y - 70 + Math.sin(t * 2.4) * 1.5, [`${b.icon} ${b.name} · ● ${a.price}`, b.desc], "#ffd84a", pop, v && v.paid > 0 ? v.paid / v.price : undefined);
    else {
      const k = clamp01((t - a.doneAt) / 0.35);
      bubble(ctx, x, y - 70, ["✔ SOLD! Pleasure doing business"], "#5cc23c", easeOutBack(k) * (t - a.doneAt < 2.5 ? 1 : Math.max(0, 1 - (t - a.doneAt - 2.5) / 0.3)));
    }
  }
}

/** The Cursed Shrine: a rune-carved stone that rises from the earth, with wisps circling it. */
function drawShrine(ctx: CanvasRenderingContext2D, c: Camp, a: VisitorAnim, t: number): void {
  const v = c.visitor;
  const since = t - a.arriveAt;
  let rise = easeOutBack(clamp01(since / 0.8));
  if (a.leaveAt !== null) rise = 1 - easeOutCubic(clamp01((t - a.leaveAt) / VISITOR_LEAVE));
  if (rise <= 0.01) return;
  const { x, y } = a;
  const accepted = a.doneAt !== null;
  const glowCol = accepted ? "255,70,70" : "190,120,255";
  const pulse = 0.6 + 0.4 * Math.sin(t * (accepted ? 7 : 3));
  // Standing on it: a ring fills around the base.
  const hold = v && !v.done ? clamp01(v.stand / VISITOR.shrineHold) : 0;
  softShadow(ctx, x + 5, y + 12, 26 * rise, 7, 0.32);
  if (hold > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(${glowCol},0.9)`;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.ellipse(x, y + 10, 36, 13, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hold); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, y + 10);
  ctx.scale(1, rise);
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  // Base slab and obelisk.
  ctx.fillStyle = "#6a6a78";
  ctx.beginPath(); ctx.roundRect(-20, -8, 40, 10, 3); ctx.fill(); ctx.stroke();
  const stone = ctx.createLinearGradient(-14, 0, 14, 0);
  stone.addColorStop(0, "#9a9aaa");
  stone.addColorStop(1, "#55556a");
  ctx.fillStyle = stone;
  ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-8, -58); ctx.lineTo(0, -66); ctx.lineTo(8, -58); ctx.lineTo(12, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Runes: a glowing eye and two marks, pulsing.
  ctx.fillStyle = `rgba(${glowCol},${0.55 + 0.45 * pulse})`;
  ctx.beginPath(); ctx.ellipse(0, -40, 5.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1a0a2a";
  ctx.beginPath(); ctx.arc(0, -40, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(${glowCol},${0.4 + 0.4 * pulse})`;
  ctx.fillRect(-1.5, -28, 3, 9);
  ctx.fillRect(-4.5, -24, 9, 2.5);
  ctx.restore();
  // Two wisps orbit the stone (in front when below it, behind when above — a cheap depth cue).
  for (let i = 0; i < 2; i++) {
    const ang = t * (accepted ? 3.2 : 1.6) + i * Math.PI;
    const wx = x + Math.cos(ang) * 22, wy = y - 34 * rise + Math.sin(ang) * 8;
    ctx.fillStyle = `rgba(${glowCol},0.28)`;
    ctx.beginPath(); ctx.arc(wx, wy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,240,255,0.9)`;
    ctx.beginPath(); ctx.arc(wx, wy, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  if (a.leaveAt === null) {
    const pop = easeOutBack(clamp01((since - 0.6) / 0.45));
    if (!accepted) bubble(ctx, x, y - 74 + Math.sin(t * 2.4) * 1.5, ["⛩️ Cursed Shrine · stand to accept", "Elite Raid tonight → bonus + ✨ rule card"], "#b88aff", pop, hold > 0 ? hold : undefined);
    else bubble(ctx, x, y - 74, ["💀 The raid is coming…", "Hold the night for your reward"], "#ff6a5a", easeOutBack(clamp01((t - (a.doneAt ?? t)) / 0.35)));
  }
}

export function drawVisitor(ctx: CanvasRenderingContext2D, c: Camp, a: VisitorAnim, t: number): void {
  if (a.kind === "merchant") drawMerchant(ctx, c, a, t);
  else drawShrine(ctx, c, a, t);
}
