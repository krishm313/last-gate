// Chapter & night weather (rain, sun shafts, crystal glints, dust, mist and wisps, lightning), split out
// of render.ts (phase 10 B3). Screen space; world-pinned bits go through env.screenAt.
import type { Weather } from "./sim";
import { MAP_H, MAP_W, VIEW_H, VIEW_W, WALL_Y } from "./world";

type V = { x: number; y: number };
/** What the weather needs from the renderer. */
export interface WeatherEnv {
  time: number;
  night: number;
  /** Chapter scenery id (1 summer, 2 marsh, 3 dry, 4/10 hollow night, 5 last stand, 99 endless…). */
  mood: number;
  weather: Weather;
  ponds: { x: number; y: number; rx: number; ry: number }[];
  crystals: { x: number; y: number; s: number }[];
  graves: { x: number; y: number }[];
  blob(key: string, stops: [number, string][]): HTMLCanvasElement;
  drawBlob(ctx: CanvasRenderingContext2D, b: HTMLCanvasElement, x: number, y: number, rx: number, ry?: number, alpha?: number): void;
  glint(): HTMLCanvasElement;
  /** World → screen (camera offset o, no shake). */
  screenAt(x: number, y: number, base: number, o: V): [number, number];
  drawFog(ctx: CanvasRenderingContext2D, o: V): void;
}

export class WeatherFx {
  private lightning = 0;
  private nextBolt = 6;
  private boltSeed = 1;
  private boltTarget: V | null = null;

  /** A sky flash (reuses the last bolt's shape). */
  flash(): void {
    this.lightning = 1;
  }
  /** A storm-weather bolt striking a real foe at (x, y). */
  strike(time: number, x: number, y: number): void {
    this.lightning = 1;
    this.boltSeed = Math.floor(time * 1000) + Math.round(x);
    this.boltTarget = { x, y };
  }
  /** New run: no flash in progress, first chapter bolt in 6 s. */
  reset(): void {
    this.lightning = 0;
    this.nextBolt = 6;
  }

  /**
   * Chapter weather: the marsh (2) has slanting rain with ground splashes; the blood-red last
   * stand (5) gets lightning — a forked bolt and a white sky flash every 6-14 s. Screen space.
   */
  draw(env: WeatherEnv, ctx: CanvasRenderingContext2D, dt: number, o: V = { x: 0, y: 0 }): void {
    const t = env.time;
    // Night weather (gameplay): fog rolls in as drifting banks; rain/storm reuse the marsh rain.
    if (env.weather === "fog") env.drawFog(ctx, o);
    const raining = env.weather === "rain" || env.weather === "storm";
    if (env.mood === 2 || raining) {
      ctx.save();
      // Three depths of rain: far drops are thin, faint, short and slow; near ones long, bright and
      // fast. Each streak leans exactly along its own fall direction (wind / speed).
      const layers = [
        { n: 60, sp: 420, wind: 70, len: 0.018, w: 0.8, a: 0.18 },
        { n: 45, sp: 600, wind: 100, len: 0.022, w: 1.1, a: 0.3 },
        { n: 22, sp: 820, wind: 140, len: 0.028, w: 1.7, a: 0.42 },
      ];
      layers.forEach((L, li) => {
        ctx.strokeStyle = `rgba(205,222,255,${L.a})`;
        ctx.lineWidth = L.w;
        ctx.beginPath();
        for (let i = 0; i < L.n; i++) {
          const sp = L.sp * (0.9 + ((i * 37 + li * 11) % 10) / 50);
          const x = ((i * 89.7 + li * 41 + t * L.wind) % (VIEW_W + 80)) - 40;
          const y = ((i * 131.3 + li * 77 + t * sp) % (VIEW_H + 60)) - 30;
          ctx.moveTo(x, y);
          ctx.lineTo(x - L.wind * L.len, y - sp * L.len);
        }
        ctx.stroke();
      });
      // Rain rings spreading on the ponds (world-pinned).
      ctx.strokeStyle = "rgba(220,235,255,0.55)";
      ctx.lineWidth = 1;
      for (const pd of env.ponds) {
        const [px, py] = env.screenAt(pd.x, pd.y, pd.y, o);
        if (px < -60 || px > VIEW_W + 60 || py < -40 || py > VIEW_H + 40) continue;
        for (let i = 0; i < 6; i++) {
          const u = (t * 1.6 + i / 6) % 1;
          const cyc = Math.floor(t * 1.6 + i / 6);
          const h1 = ((cyc * 7919 + i * 131 + Math.round(pd.x)) % 1000) / 1000, h2 = ((cyc * 104729 + i * 71) % 1000) / 1000;
          const a = h1 * Math.PI * 2, d = Math.sqrt(h2) * 0.75;
          const rx = px + Math.cos(a) * pd.rx * d, ry = py + Math.sin(a) * pd.ry * d;
          ctx.globalAlpha = (1 - u) * 0.9;
          ctx.beginPath();
          ctx.ellipse(rx, ry, 1 + u * 7, 0.5 + u * 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // Splashes: tiny expanding rings where drops land.
      ctx.strokeStyle = "rgba(210,230,255,0.4)";
      for (let i = 0; i < 18; i++) {
        const k = (t * 2.2 + i * 0.37) % 1;
        const x = (i * 211.7) % VIEW_W, y = (i * 157.9 + Math.floor(t * 2.2 + i * 0.37) * 97) % VIEW_H;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + k * 6, 1 + k * 2.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (env.mood === 1 && env.night < 0.95) {
      // Summer: soft shafts of sunlight slant down from the top-left and drift slowly, with motes of
      // pollen glittering inside them (fade out as night falls).
      const day = 1 - env.night;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 190 + t * 6) % (VIEW_W + 420)) - 380; // beams lean right as they fall (sun top-left)
        const w = 46 + (i % 3) * 22;
        const a = (0.16 + 0.05 * Math.sin(t * 0.5 + i * 1.7)) * day;
        const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
        g.addColorStop(0, "rgba(255,240,190,0)");
        g.addColorStop(0.3, `rgba(255,240,190,${(a * 0.6).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(255,240,190,${a.toFixed(3)})`);
        g.addColorStop(0.7, `rgba(255,240,190,${(a * 0.6).toFixed(3)})`);
        g.addColorStop(1, "rgba(255,240,190,0)");
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(cx, 0);
        ctx.transform(1, 0, 0.45, 1, 0, 0);
        ctx.translate(-cx, 0);
        ctx.fillRect(cx - w, -20, w * 2, VIEW_H + 40);
        ctx.restore();
        for (let j = 0; j < 5; j++) {
          const u = (t * 0.06 + j / 5 + i * 0.13) % 1;
          const my = u * VIEW_H;
          const mx = cx + 0.45 * my + Math.sin(t * 0.9 + j * 2 + i) * w * 0.5; // inside the slanted beam
          env.drawBlob(ctx, env.glint(), mx, my, 2, 2, day * 0.7 * Math.sin(u * Math.PI) * (0.5 + 0.5 * Math.sin(t * 3 + j)));
        }
      }
      ctx.restore();
    } else if (env.mood === 99) {
      // Endless: the crystals catch the light — a soft glow and a four-point star that flares on
      // each in turn, with motes drifting up off them.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = env.blob("crys", [[0, "rgba(190,220,255,0.9)"], [0.5, "rgba(150,190,255,0.3)"], [1, "rgba(120,160,255,0)"]]);
      env.crystals.forEach((cr, i) => {
        const [px, py] = env.screenAt(cr.x, cr.y, cr.y, o);
        if (px < -30 || px > VIEW_W + 30 || py < -30 || py > VIEW_H + 30) return;
        const ph = (t * 0.35 + i * 0.618) % 1;
        const flare = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0;
        env.drawBlob(ctx, glow, px, py + 4, 9 * cr.s, 9 * cr.s, 0.35 + 0.15 * Math.sin(t * 2 + i) + flare * 0.6);
        if (flare > 0) {
          const L = (5 + flare * 9) * cr.s;
          ctx.strokeStyle = `rgba(255,255,255,${(flare * 0.95).toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px - L, py); ctx.lineTo(px + L, py);
          ctx.moveTo(px, py - L); ctx.lineTo(px, py + L);
          ctx.stroke();
        }
        const u = (t * 0.5 + i * 0.37) % 1;
        env.drawBlob(ctx, env.glint(), px + Math.sin(u * 7 + i) * 6, py - u * 30, 2.4, 2.4, (1 - u) * 0.7);
      });
      ctx.restore();
    } else if (env.mood === 3) {
      // Dry plains: wind-blown grit skims the ground in streaks, and now and then a dust devil
      // spins across the field (pinned to the world, scrolling with the camera).
      ctx.save();
      for (let i = 0; i < 40; i++) {
        const span = VIEW_W + 120;
        const x = ((((i * 97.3 + t * (60 + (i % 5) * 18)) % span) + span) % span) - 60;
        const y = ((i * 151.7) % VIEW_H) + Math.sin(t * 2 + i) * 4;
        const a = 0.22 + 0.18 * Math.sin(t * 1.3 + i * 2.1);
        ctx.strokeStyle = `rgba(252,240,205,${Math.max(0, a * 1.5).toFixed(3)})`;
        ctx.lineWidth = 1.2 + (i % 3) * 0.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 12 - (i % 4) * 5, y + 0.8);
        ctx.stroke();
      }
      const grit = env.blob("grit", [[0, "rgba(236,214,166,0.9)"], [0.6, "rgba(220,196,150,0.4)"], [1, "rgba(210,186,140,0)"]]);
      for (let d = 0; d < 2; d++) {
        const cyc = 14 + d * 5, u = ((t + d * 7) % cyc) / cyc;
        if (u > 0.6) continue;
        const k = u / 0.6, fade = Math.sin(k * Math.PI);
        const wx = -60 + k * (MAP_W + 120), wy = 300 + d * 420 + Math.sin(k * 6) * 30;
        const [sx, sy] = env.screenAt(wx, wy, wy, o);
        for (let j = 0; j < 10; j++) {
          const h = j / 9, ang = t * 9 + j * 1.3;
          const rr = 9 + h * 28;
          env.drawBlob(ctx, grit, sx + Math.cos(ang) * rr * 0.55 + h * 10, sy - h * 85, rr, rr * 0.45, fade * (0.95 - h * 0.45));
        }
      }
      ctx.restore();
    } else if ((env.mood === 4 || env.mood === 10)) {
      // Hollow Night: banks of low mist creep across the field in layers (pinned to the world,
      // drifting at different speeds), thickest out on the battlefield.
      const mist = env.blob("mist2", [[0, "rgba(170,190,225,1)"], [0.5, "rgba(150,170,210,0.55)"], [1, "rgba(130,150,190,0)"]]);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      // Will-o'-wisps: pale blue-green lights that rise from the graves, bob, and fade.
      const wisp = env.blob("gwisp", [[0, "rgba(210,255,240,1)"], [0.35, "rgba(120,230,210,0.55)"], [1, "rgba(80,200,190,0)"]]);
      env.graves.forEach((g, i) => {
        const [px, py] = env.screenAt(g.x, g.y, g.y, o);
        if (px < -40 || px > VIEW_W + 40 || py < -80 || py > VIEW_H + 20) return;
        const u = (t * 0.22 + i * 0.37) % 1;
        if (u > 0.7) return;
        const k = u / 0.7, a = Math.sin(k * Math.PI);
        const wx = px + Math.sin(t * 1.3 + i * 2) * 8, wy = py - 6 - k * 34 + Math.sin(t * 3 + i) * 3;
        env.drawBlob(ctx, wisp, wx, wy, 7, 7, a * 0.9);
        env.drawBlob(ctx, wisp, wx - Math.sin(t * 1.3 + i * 2) * 3, wy + 6, 3.5, 3.5, a * 0.4);
      });
      for (let i = 0; i < 16; i++) {
        const layer = i % 3;
        const span = MAP_W + 400;
        const wx = ((((i * 173.3 + t * (7 + layer * 5)) % span) + span) % span) - 200;
        const wy = 120 + ((i * 97.7) % (MAP_H - 200)) + Math.sin(t * 0.3 + i) * 10;
        const [sx, sy] = env.screenAt(wx, wy, wy, o);
        const rw = 110 + layer * 40, rh = 26 + layer * 8;
        if (sx < -rw || sx > VIEW_W + rw || sy < -rh || sy > VIEW_H + rh) continue;
        const field = wy < WALL_Y ? 0.7 : 0.5;
        env.drawBlob(ctx, mist, sx, sy, rw, rh, (0.8 + 0.2 * Math.sin(t * 0.4 + i * 1.3)) * field);
      }
      ctx.restore();
    }
    if ((env.mood === 5 || this.lightning > 0) && dt > 0) {
      this.nextBolt -= dt;
      if (env.mood === 5 && this.nextBolt <= 0) {
        this.boltTarget = null;
        this.lightning = 1;
        this.nextBolt = 6 + ((t * 7.31) % 8);
        this.boltSeed = Math.floor(t * 1000);
      }
      if (this.lightning > 0) {
        const k = this.lightning;
        // Double-flicker flash.
        const flick = k > 0.75 || (k > 0.45 && k < 0.6) ? 1 : 0.4;
        ctx.fillStyle = `rgba(235,225,255,${0.35 * k * flick})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        // Forked bolt from the sky down to a strike point on the field: jagged by midpoint
        // displacement, drawn as a wide soft glow under a white-hot core, with a ground flash.
        let seed = this.boltSeed;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        let sx = 60 + rnd() * (VIEW_W - 120), ex = sx + (rnd() - 0.5) * 140, ey = VIEW_H * (0.45 + rnd() * 0.25);
        // A storm-weather bolt strikes a real foe.
        if (this.boltTarget) { [ex, ey] = env.screenAt(this.boltTarget.x, this.boltTarget.y, this.boltTarget.y, o); ey -= 10; sx = ex + (rnd() - 0.5) * 120; }
        const bolt = (x0: number, y0: number, x1: number, y1: number, d: number, out: [number, number][]): void => {
          if (d <= 0) { out.push([x1, y1]); return; }
          const mx = (x0 + x1) / 2 + (rnd() - 0.5) * Math.hypot(x1 - x0, y1 - y0) * 0.35, my = (y0 + y1) / 2;
          bolt(x0, y0, mx, my, d - 1, out);
          bolt(mx, my, x1, y1, d - 1, out);
        };
        const main: [number, number][] = [[sx, -10]];
        bolt(sx, -10, ex, ey, 5, main);
        const fi = 8 + Math.floor(rnd() * 10);
        const [fx0, fy0] = main[fi]!;
        const fork: [number, number][] = [[fx0, fy0]];
        bolt(fx0, fy0, fx0 + (rnd() > 0.5 ? 1 : -1) * (50 + rnd() * 60), fy0 + 60 + rnd() * 60, 3, fork);
        const stroke = (pts: [number, number][], w: number, col: string): void => {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        };
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.globalCompositeOperation = "lighter";
        stroke(main, 14, `rgba(150,130,255,${0.18 * k})`);
        stroke(main, 6, `rgba(200,190,255,${0.4 * k})`);
        stroke(main, 2.2, `rgba(255,255,255,${k})`);
        stroke(fork, 6, `rgba(170,150,255,${0.25 * k})`);
        stroke(fork, 1.4, `rgba(255,250,255,${0.85 * k})`);
        // Where it strikes, the ground flares.
        env.drawBlob(ctx, env.blob("strike", [[0, "rgba(255,250,255,1)"], [0.3, "rgba(200,180,255,0.6)"], [1, "rgba(150,120,255,0)"]]), ex, ey, 46 * k, 18 * k, k);
        ctx.restore();
        this.lightning = Math.max(0, k - dt * 2.4);
      }
    }
  }
}
