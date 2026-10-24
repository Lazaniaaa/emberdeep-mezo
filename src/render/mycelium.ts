import { tileHash, type Floor } from "@/game/dungeon";
import { catacombsDecorAt, catacombsRow } from "./catacombs";
import { loadSheet } from "./sheets";

const SIZE = 32;
export const usesMyceliumTiles = (depth: number) => depth === 3 || depth === 4;

/** Root crosses occur on one tenth of cells; the remaining earth textures share the rest. No game RNG. */
export function myceliumFloorVariant(x: number, y: number, depth: number) {
  const h = tileHash(x + depth * 137, y);
  return h % 10 === 0 ? 1 : [0, 2, 3][(h >>> 8) % 3];
}

let spores: HTMLCanvasElement | undefined;
/** Cache a genuinely translucent glow instead of hard-cutting the source puff against magenta. */
function sporeGlow() {
  if (spores) return spores;
  spores = document.createElement("canvas"); spores.width = spores.height = SIZE;
  const c = spores.getContext("2d")!;
  for (const [x, y, r] of [[11,13,10],[21,19,9],[19,8,7]]) {
    const g = c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,"rgba(128,246,255,0.65)");
    g.addColorStop(0.28,"rgba(61,153,255,0.30)");
    g.addColorStop(0.6,"rgba(144,82,255,0.14)");
    g.addColorStop(1,"rgba(144,82,255,0)");
    c.fillStyle = g; c.fillRect(0,0,SIZE,SIZE);
  }
  return spores;
}

export function drawMyceliumCell(ctx: CanvasRenderingContext2D, floor: Floor, x: number, y: number,
  lit: boolean, reserved: ReadonlySet<number> | null, occupied: ReadonlySet<number>, time: number, reducedMotion: boolean) {
  const sheet = loadSheet("tiles/mycelium.png"), row = catacombsRow(floor,x,y);
  const variant = row === 0 ? myceliumFloorVariant(x,y,floor.depth) : tileHash(x+floor.depth*137,y)%4;
  const px = x*SIZE, py = y*SIZE;
  if (sheet) {
    ctx.drawImage(sheet.image,variant*SIZE,row*SIZE,SIZE,SIZE,px,py,SIZE,SIZE);
    const decor = catacombsDecorAt(floor,x,y,reserved,occupied);
    if (decor === 1) {
      ctx.save();ctx.globalAlpha = reducedMotion ? 0.85 : 0.7+0.2*Math.sin(time/700+tileHash(x,y));
      ctx.drawImage(sporeGlow(),px,py);ctx.restore();
    } else if (decor !== null) ctx.drawImage(sheet.image,decor*SIZE,3*SIZE,SIZE,SIZE,px,py,SIZE,SIZE);
    // Both the mushroom lamp and rooted arch attach only to a solid wall face, never a doorway.
    if (row === 2 && tileHash(x,y+179)%5 === 0) {
      const attachment = tileHash(x+53,y)%5 === 0 ? 1 : 0;
      ctx.drawImage(sheet.image,attachment*SIZE,4*SIZE,SIZE,SIZE,px,py,SIZE,SIZE);
    }
  } else {
    ctx.fillStyle = row === 0 ? "#21443c" : row === 2 ? "#152d2b" : "#0b1425";
    ctx.fillRect(px,py,SIZE,SIZE);
  }
  if (!lit) { ctx.fillStyle = "rgba(0,0,0,0.48)";ctx.fillRect(px,py,SIZE,SIZE); }
}
