import { ART_DOORWAYS, ART_PATCHES } from "@/game/map-art";

/** The renderer and tracing tool use exactly the same registration and minimal doorway touch-ups. */
export function paintMap(ctx: CanvasRenderingContext2D, image: HTMLImageElement, depth: number, width: number, height: number) {
  ctx.imageSmoothingEnabled = false;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = Math.round(image.naturalWidth * scale), h = Math.round(image.naturalHeight * scale);
  const ox = Math.floor((width - w) / 2), oy = Math.floor((height - h) / 2);
  ctx.drawImage(image, ox, oy, w, h);
  for (const p of ART_PATCHES[depth] ?? []) {
    const at = (v: number) => Math.round(v * scale);
    ctx.drawImage(ctx.canvas, ox+at(p.from.x), oy+at(p.from.y), at(p.w), at(p.h), ox+at(p.x), oy+at(p.y), at(p.w), at(p.h));
  }
  for (const p of ART_DOORWAYS[depth] ?? []) for (let y=p.y;y<p.y+p.h;y++) for (let x=p.x;x<p.x+p.w;x++) {
    ctx.drawImage(ctx.canvas,p.sample.x*32,p.sample.y*32,32,32,x*32,y*32,32,32);
  }
  if (depth === 6) {
    // The central orange well is a sealed furnace, not a second descent. Metal bars close its mouth and treads.
    // Retain the painted masonry, torches and glow; never paste a floor rectangle over them.
    ctx.fillStyle = "#111926"; ctx.fillRect(405, 296, 53, 24);
    for (const y of [249, 262, 275, 298, 308]) {
      ctx.fillStyle = "#101621"; ctx.fillRect(403, y, 57, 6);
      ctx.fillStyle = "#506075"; ctx.fillRect(404, y+1, 55, 2);
      ctx.fillStyle = "#293347"; ctx.fillRect(404, y+3, 55, 2);
    }
    ctx.fillStyle = "#9a764a";
    for (const x of [406,454]) for(const y of [251,264,277,300,310])ctx.fillRect(x,y,2,2);
  }
}
