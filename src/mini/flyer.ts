import { BAT_ATLAS, DRAGON_ATLAS } from "../camp/propAtlas";

/**
 * Draw a winged flyer sprite (bat / imp / dragon atlases: one body + one wing, mirrored for the
 * other side) at (x, y) with the body `size` px tall. `flap` in [-1, 1] tilts the wings up/down.
 * Used outside the main renderer (mini-games, card art).
 */
export function drawFlyer(ctx: CanvasRenderingContext2D, img: HTMLImageElement, kind: "bat" | "imp" | "dragon", x: number, y: number, size: number, flap = 0): void {
  if (!img.complete || !img.naturalWidth) return;
  const A = kind === "dragon" ? DRAGON_ATLAS : BAT_ATLAS;
  const [bsx, bsy, bw, bh] = A.body!;
  const [wsx, wsy, ww, wh, wpx, wpy] = A.wing!;
  const [px, py] = A.pivot!;
  const k = size / bh!;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-px!, -py!);
  for (const side of [1, -1]) {
    ctx.save();
    ctx.translate(px!, py!);
    ctx.scale(side, 1);
    ctx.rotate(-flap * 0.42);
    ctx.scale(1, 0.7 + 0.3 * Math.abs(flap));
    ctx.drawImage(img, wsx!, wsy!, ww!, wh!, -wpx!, -wpy!, ww!, wh!);
    ctx.restore();
  }
  ctx.drawImage(img, bsx!, bsy!, bw!, bh!, 0, 0, bw!, bh!);
  ctx.restore();
}
