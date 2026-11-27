// Effects for the phase-9 foes (Shield Wall, Wall Climber, Balloon Bomber), split out of render.ts (phase 10 B3).
import type { Fx } from "../render/fx";
import { buildingSprite } from "./buildings";
import type { Camp, Enemy } from "./sim";
import { drawAnim, animFrame } from "./sprites";
import { HALL, WALL_THICK, WALL_Y } from "./world";
import { INK, softShadow } from "./art";

/** What these effects need from the renderer. */
export interface FoeFxEnv {
  time: number;
  night: number;
  fx: Fx;
  blob(key: string, stops: [number, string][]): HTMLCanvasElement;
  drawBlob(ctx: CanvasRenderingContext2D, b: HTMLCanvasElement, x: number, y: number, rx: number, ry?: number, alpha?: number): void;
  bankFor(id: number, x: number, max: number): number;
}

export class FoeFx {
  /** Shield Wall: a faint steel-blue lane behind it marks where foes shelter from arrows. */
  drawShieldLane(env: FoeFxEnv, ctx: CanvasRenderingContext2D, e: Enemy): void {
    const g = e.def.guard!;
    const top = e.y - g.depth, w = g.width;
    const grad = ctx.createLinearGradient(0, e.y, 0, top);
    const a = 0.16 + env.night * 0.12;
    grad.addColorStop(0, `rgba(140,180,255,${a.toFixed(3)})`);
    grad.addColorStop(1, "rgba(140,180,255,0)");
    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(e.x - w, e.y - 4);
    ctx.lineTo(e.x + w, e.y - 4);
    ctx.lineTo(e.x + w * 0.8, top);
    ctx.lineTo(e.x - w * 0.8, top);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** A small blue shield over a foe sheltering behind a Shield Wall (it takes half damage). */
  drawGuardPip(_env: FoeFxEnv, ctx: CanvasRenderingContext2D, e: Enemy): void {
    const x = e.x, y = e.y - e.def.radius * 2.6;
    ctx.save();
    ctx.fillStyle = "#6a9aff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y - 4);
    ctx.lineTo(x + 4.5, y - 4);
    ctx.lineTo(x + 4.5, y + 0.5);
    ctx.quadraticCurveTo(x + 4, y + 4.5, x, y + 6);
    ctx.quadraticCurveTo(x - 4, y + 4.5, x - 4.5, y + 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Wall Climber's grapnel and rope, from the top of the palisade down to its hands. */
  drawClimbRope(_env: FoeFxEnv, ctx: CanvasRenderingContext2D, e: Enemy, lift: number): void {
    const hookY = WALL_Y - WALL_THICK / 2 - 14;
    const hands = e.y - lift - e.def.radius * 1.4;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(e.x + 2, hookY);
    ctx.quadraticCurveTo(e.x + 5, (hookY + hands) / 2, e.x + 1, hands);
    ctx.stroke();
    ctx.strokeStyle = "#d8b070";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.x + 2, hookY);
    ctx.quadraticCurveTo(e.x + 5, (hookY + hands) / 2, e.x + 1, hands);
    ctx.stroke();
    // Three-pronged iron grapnel hooked over the stakes.
    ctx.strokeStyle = "#c8ccd4";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    for (const dx of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(e.x + 2, hookY);
      ctx.quadraticCurveTo(e.x + 2 + dx * 1.2, hookY - 6, e.x + 2 + dx * 1.6, hookY - 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Balloon Bomber bombs in flight: a lit fuse tumbling down onto the hall, then a burst of fire. */
  bombs: { x: number; y: number; tx: number; ty: number; t: number }[] = [];
  drawBombs(env: FoeFxEnv, ctx: CanvasRenderingContext2D): void {
    if (!this.bombs.length) return;
    const DUR = 0.45;
    for (const b of this.bombs) {
      const u = (env.time - b.t) / DUR;
      if (u >= 1) {
        const fx = env.fx;
        fx.burst(b.tx, b.ty, "#ffb040", 22, 210, { max: 0.5, size: 3.6, gravity: 120, shape: "dot" });
        fx.burst(b.tx, b.ty, "#ff5a1a", 10, 140, { max: 0.4, size: 4.5, gravity: 60, shape: "dot" });
        fx.burst(b.tx, b.ty, "#8a7a6a", 6, 160, { max: 0.6, size: 3, gravity: 420, shape: "chunk" });
        fx.burst(b.tx, b.ty - 6, "rgba(60,50,45,0.75)", 10, 80, { max: 1.1, size: 9, gravity: -40, drag: 2 });
        fx.rings.push({ x: b.tx, y: b.ty, r: 48, color: "#ffcf60", life: 0.32, max: 0.32, width: 5 });
        if (fx.trauma < 0.3) fx.shake(0.14);
        continue;
      }
      // Falls with gravity (slow off the basket, fast at the end), spinning; the fuse spits sparks.
      const k = u * u;
      const bx = b.x + (b.tx - b.x) * u, by = b.y + (b.ty - b.y) * k;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(u * 7);
      ctx.fillStyle = "#24242a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(-2, -2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(3, -8, 2, -10); ctx.stroke();
      ctx.restore();
      if (env.fx.particles.length < 400) env.fx.burst(bx + 2, by - 10, Math.sin(env.time * 40) > 0 ? "#ffe080" : "#ff8a20", 1, 40, { max: 0.25, size: 2, gravity: 60, shape: "dot" });
    }
    this.bombs = this.bombs.filter((b) => env.time - b.t < DUR);
  }

  /** Popped Balloon Bombers: the wicker basket drops (accelerating, tumbling) and thuds into the dirt. */
  fallingBaskets: { x: number; y: number; gy: number; t: number; spin: number }[] = [];
  drawFallingBaskets(env: FoeFxEnv, ctx: CanvasRenderingContext2D): void {
    if (!this.fallingBaskets.length) return;
    const FALL = 0.45, LIE = 1.4;
    for (const b of this.fallingBaskets) {
      const age = env.time - b.t;
      const u = Math.min(1, age / FALL);
      const y = b.y + (b.gy - b.y) * u * u;
      const rot = b.spin * u * 1.9;
      if (age >= FALL && age - FALL < 0.05 && !(b as { thud?: boolean }).thud) {
        (b as { thud?: boolean }).thud = true;
        env.fx.burst(b.x, b.gy + 4, "rgba(206,190,160,0.85)", 8, 70, { max: 0.6, size: 6, gravity: -12, drag: 3 });
        env.fx.burst(b.x, b.gy, "#8a6030", 5, 110, { max: 0.45, size: 2.6, gravity: 320, shape: "chunk" });
      }
      const fade = age > FALL + LIE - 0.4 ? Math.max(0, (FALL + LIE - age) / 0.4) : 1;
      ctx.save();
      ctx.globalAlpha *= fade;
      softShadow(ctx, b.x, b.gy + 4, 10 * (0.5 + 0.5 * u), 3.5, 0.3 * u);
      ctx.translate(b.x, y);
      ctx.rotate(rot);
      if (!buildingSprite(ctx, "basket", 0, 8, 1.8)) {
        ctx.fillStyle = "#b88a4a"; ctx.fillRect(-7, -4, 14, 10);
      }
      ctx.restore();
    }
    this.fallingBaskets = this.fallingBaskets.filter((b) => env.time - b.t < FALL + LIE);
  }

  /** Balloon Bomber: a striped 3D balloon with a goblin bombardier leaning out of its basket. */
  drawBomber(env: FoeFxEnv, ctx: CanvasRenderingContext2D, c: Camp, e: Enemy, flash: boolean): void {
    const r = e.def.radius;
    const bob = Math.sin(c.time * 1.7 + e.sway) * 3;
    const tilt = env.bankFor(e.id, e.x, 0.3) * 0.25;
    const bx = e.x, by = e.y - 22 + bob; // basket rim
    const dropping = e.attackTimer < 0.35 && Math.hypot(HALL.x - e.x, HALL.y - e.def.bomber!.hover - e.y) < 120;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(tilt);
    const ok = buildingSprite(ctx, "balloon", 0, 7, 1.8);
    if (ok) {
      // The goblin bombardier: leans over the rim (and winds up when a bomb is about to go).
      drawAnim(ctx, "goblin_anim", dropping ? "attack" : "idle", dropping ? 2 : animFrame("idle", c.time + e.sway, 5), 0, 6 - (dropping ? 2 : 0), 30, { flip: e.x > HALL.x, flash: flash ? 0.6 : 0, key: `b${e.id}` });
      buildingSprite(ctx, "basket", 0, 13, 1.8);
    } else {
      ctx.fillStyle = "#c8402e"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -28, r * 1.3, r * 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#b88a4a"; ctx.fillRect(-7, -2, 14, 10); ctx.strokeRect(-7, -2, 14, 10);
    }
    if (flash) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath(); ctx.ellipse(0, -26, r * 1.5, r * 1.9, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // The burner breathes: a soft orange glow at the neck after dark.
    if (env.night > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      env.drawBlob(ctx, env.blob("lavaglow", [[0, "rgba(255,120,40,0.9)"], [1, "rgba(255,60,10,0)"]]), bx, by - 10, 14, 10, 0.4 * env.night * (0.8 + 0.2 * Math.sin(c.time * 9 + e.id)));
      ctx.restore();
    }
  }

  /** Siege Tower: a tall 3D timber tower that rocks on its wheels as it rolls; once it reaches the wall
   *  its ramp lies down onto the palisade (the climbers it carried pour over). */
  drawSiegeTower(env: FoeFxEnv, ctx: CanvasRenderingContext2D, e: Enemy, flash: boolean): void {
    const r = e.def.radius;
    const moving = !e.unloaded && !e.attacking;
    const rock = moving ? Math.sin(env.time * 3.2 + e.sway) * 0.025 : 0;
    const baseY = e.y + r * 0.9;
    softShadow(ctx, e.x, baseY, r * 1.5, r * 0.5, 0.36);
    if (e.unloaded) {
      // Ramp down: from the tower's front (toward the wall/camera) onto the palisade.
      if (!buildingSprite(ctx, "siege_ramp", e.x, baseY + 10, 1.9)) {
        ctx.fillStyle = "#8a5a30"; ctx.fillRect(e.x - 12, baseY - 2, 24, 18);
      }
    }
    ctx.save();
    ctx.translate(e.x, baseY);
    ctx.rotate(rock);
    const ok = buildingSprite(ctx, "siegetower", 0, 0, 1);
    if (!ok) {
      ctx.fillStyle = "#8a5a30"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.fillRect(-r * 0.8, -r * 3.6, r * 1.6, r * 3.6); ctx.strokeRect(-r * 0.8, -r * 3.6, r * 1.6, r * 3.6);
    }
    if (flash) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(-r * 0.9, -r * 3.8, r * 1.8, r * 3.8);
    }
    ctx.restore();
    // Rolling dust from the wheels.
    if (moving && Math.floor(env.time * 6 + e.id) % 3 === 0 && env.fx.particles.length < 400) env.fx.burst(e.x + (Math.sin(env.time * 7 + e.id) > 0 ? r : -r), baseY, "rgba(200,184,150,0.6)", 1, 30, { max: 0.5, size: 4, gravity: -10, drag: 4 });
  }
}
