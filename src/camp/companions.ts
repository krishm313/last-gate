// The hero's companion pet and hero-weapon projectiles (phase 9 C9/C10), split out of render.ts (phase 10 B3).
import type { Fx } from "../render/fx";
import { buildingSprite } from "./buildings";
import type { Camp } from "./sim";
import { INK, softShadow } from "./art";

/** What these draws need from the renderer. */
export interface CompanionEnv {
  time: number;
  fx: Fx;
  blob(key: string, stops: [number, string][]): HTMLCanvasElement;
  drawBlob(ctx: CanvasRenderingContext2D, b: HTMLCanvasElement, x: number, y: number, rx: number, ry?: number, alpha?: number): void;
}

export class Companions {
  /** Companion pet: the hound lopes along at the King's heel (bounding hop, flips to face where it
   *  runs); the falcon glides overhead, wingbeats while it flies, banks into turns and stoops on a dive. */
  petPrev = { x: 0, y: 0, flip: false, ph: 0, bank: 0 };
  drawPet(env: CompanionEnv, ctx: CanvasRenderingContext2D, p: NonNullable<Camp["pet"]>): void {
    const pv = this.petPrev;
    const dx = p.x - pv.x, dy = p.y - pv.y;
    const sp = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.2) pv.flip = dx < 0;
    pv.ph += sp * 0.16;
    pv.x = p.x;
    pv.y = p.y;
    if (p.kind === "hound") {
      const hop = p.moving ? Math.abs(Math.sin(pv.ph)) : 0;
      const breathe = p.moving ? 0 : Math.sin(env.time * 3) * 0.02;
      softShadow(ctx, p.x, p.y + 2, 19 - hop * 4, 5.5, 0.32);
      ctx.save();
      ctx.translate(p.x, p.y + 2 - hop * 5);
      // Squash on landing, stretch at the top of the bound.
      const st = p.moving ? 1 + (hop - 0.5) * 0.12 : 1 + breathe;
      ctx.scale((pv.flip ? -1 : 1) / st, st);
      ctx.rotate(p.moving ? Math.cos(pv.ph) * 0.08 : 0);
      if (!buildingSprite(ctx, "hound", 0, 0, 1.35)) {
        ctx.fillStyle = "#b8844a"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, -9, 13, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    // Falcon: altitude above its ground spot, shadow below.
    const diving = p.state === "dive";
    const alt = diving ? 18 : 46 + Math.sin(env.time * 1.8) * 4;
    softShadow(ctx, p.x, p.y + 4, 9, 3, diving ? 0.3 : 0.18);
    pv.bank += ((Math.max(-1, Math.min(1, dx * 0.25))) - pv.bank) * 0.15;
    ctx.save();
    ctx.translate(p.x, p.y - alt);
    ctx.rotate(diving ? Math.atan2(dy, Math.abs(dx) + 0.01) * 0.6 * (pv.flip ? -1 : 1) : pv.bank * 0.35);
    // Wingbeat: a quick vertical squash of the spread wings (glides when it's just hovering).
    const beat = p.moving && !diving ? 0.72 + 0.28 * Math.abs(Math.cos(env.time * 13)) : diving ? 0.62 : 0.9 + 0.1 * Math.cos(env.time * 4);
    ctx.scale(pv.flip ? -1 : 1, beat);
    if (!buildingSprite(ctx, "falcon", 0, 22, 1.6)) {
      ctx.fillStyle = "#4a5468"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    if (diving && env.fx.particles.length < 400 && Math.floor(env.time * 30) % 2 === 0) env.fx.burst(p.x, p.y - alt, "rgba(255,255,255,0.7)", 1, 10, { max: 0.2, size: 2.2, gravity: 0, shape: "dot" });
  }

  /** Hero weapons in flight: a heavy crossbow bolt with a white streak, or a crackling arcane orb. */
  drawWeaponShot(env: CompanionEnv, ctx: CanvasRenderingContext2D, a: { x: number; y: number; angle: number; id: number; weapon?: string }): void {
    ctx.save();
    ctx.translate(a.x, a.y - 8);
    ctx.rotate(a.angle);
    if (a.weapon === "crossbow") {
      // Motion streak, then a short thick bolt: dark shaft, iron head, red vanes.
      const sg = ctx.createLinearGradient(-34, 0, 0, 0);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(1, "rgba(255,255,255,0.75)");
      ctx.strokeStyle = sg;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.4;
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.strokeStyle = "#6a4a2a";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = "#c8ccd4";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -3.6); ctx.lineTo(5, 3.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c8302a";
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-7, -4); ctx.lineTo(-5, 0); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
    } else {
      // Arcane orb: a violet comet tail, a bright core and a crackle of sparks.
      ctx.globalCompositeOperation = "lighter";
      for (let i = 4; i >= 1; i--) env.drawBlob(ctx, env.blob("orbglow", [[0, "rgba(200,150,255,0.95)"], [1, "rgba(120,60,255,0)"]]), -i * 6, 0, 9 - i, 8 - i, 0.22 * (5 - i));
      env.drawBlob(ctx, env.blob("orbglow", [[0, "rgba(200,150,255,0.95)"], [1, "rgba(120,60,255,0)"]]), 0, 0, 16, 16, 0.8);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#f4ecff";
      ctx.strokeStyle = "#5a2ab0";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (env.fx.particles.length < 400 && Math.floor(env.time * 30 + a.id) % 3 === 0) {
        ctx.restore();
        env.fx.burst(a.x, a.y - 8, "#c8a0ff", 1, 40, { max: 0.3, size: 2, gravity: 0, shape: "dot" });
        return;
      }
    }
    ctx.restore();
  }
}
