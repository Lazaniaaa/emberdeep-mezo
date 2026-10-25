import type { Point } from "@/game/dungeon";

/** The production lantern overlay, shared with the dev art gallery. Coordinates are logical world pixels. */
export function drawLanternLight(ctx: CanvasRenderingContext2D, center: Point, radius: number,
  rect: { x: number; y: number; w: number; h: number }, time: number, still: boolean, nightVision = false) {
  const { x: cx, y: cy } = center, tile = 32;
  const flicker = still ? 0 : Math.sin(time / 90) * 3 + Math.sin(time / 37) * 2;
  const outer = Math.max(tile, (radius + 0.6) * tile + flicker);
  const g = ctx.createRadialGradient(cx, cy, tile * 0.8, cx, cy, outer);
  if (nightVision) {
    g.addColorStop(0, "rgba(0,40,10,0)");
    g.addColorStop(1, "rgba(0,12,4,0.88)");
  } else {
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0.8)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (!nightVision) {
    const warm = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    warm.addColorStop(0, "rgba(204,255,0,0.07)");
    warm.addColorStop(1, "rgba(204,255,0,0)");
    ctx.fillStyle = warm;
  } else ctx.fillStyle = "rgba(60,255,120,0.10)";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}
