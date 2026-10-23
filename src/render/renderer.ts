import { footprint, hasFloorDecor, idx, tileHash, visibleSet, type Dimling, type FloorTheme, type Point } from "@/game/dungeon";
import { attackTiles, windupProgress } from "@/game/enemy-ai";
import { DEFAULT_SPECIES } from "@/game/enemies";
import { paintMap } from "./painted-map";
import { currentRadius, propsOf, type RunState } from "@/game/run";
import { cerberusSheet, cerberusFrame, cerberusFacing, CERBERUS_CELL_W, CERBERUS_CELL_H, CERBERUS_FOOT_X, CERBERUS_FOOT_Y, CERBERUS_TEXTURE_SCALE } from "./cerberus-sprites";
import { CreatureAnimator, restPose, type Pose } from "./creature-anim";
import type { FxArt, FxQueue } from "./fx";
import { breakingFrame, drawCell, lootIndex, lootSheet, propSheet, standingFrame } from "./prop-sheets";
import { drawHero, propCanvas, type HeroPose } from "./mob-art";
import { MOB_CELL_H, MOB_CELL_W, MOB_FOOT_X, MOB_FOOT_Y, MOB_HEIGHT, MOB_TEXTURE_SCALE, mobFrameX, mobSheet } from "./mob-sheets";
import { ICONS, drawMask, type Mask } from "./sprites";

export const TILE = 32;

export const COLORS = {
  lime: "#CCFF00",
  gold: "#FFB800",
  crystal: "#7CF7FF",
  sigil: "#FF4FD8",
  white: "#F5F5F5",
  dimling: "#B8B8CC",
};

const ITEM_COLOR = { gold: COLORS.gold, crystal: COLORS.crystal, oil: COLORS.lime, chest: COLORS.gold, vault: COLORS.sigil, hoard: "#ff7a1a" } as const;
const ITEM_SPRITES = new Map<string, HTMLCanvasElement>();

/** Hand-built pixel sprites are cached once, so item detail adds almost no frame cost. */
function itemSprite(kind: keyof typeof ITEM_COLOR, theme: FloorTheme) {
  const key = `${kind}:${theme}`;
  const cached = ITEM_SPRITES.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TILE; canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  const p = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  };
  const shadow = "#05070a";
  if (kind === "gold") {
    p(shadow, 7, 26, 19, 3); p("#7e4b0c", 6, 10, 20, 16); p("#d18a19", 5, 8, 21, 17);
    p("#ffcf45", 8, 6, 15, 18); p("#fff0a0", 10, 8, 8, 3); p("#f0a51e", 8, 21, 15, 3);
    p("#8a5413", 6, 12, 2, 10); p("#ffd75b", 23, 11, 2, 9); p("#ffe98c", 13, 13, 7, 5);
  } else if (kind === "crystal") {
    p(shadow, 5, 26, 22, 3); p("#155f72", 10, 5, 13, 19); p("#32a6b8", 7, 11, 18, 14);
    p("#7cf7ff", 11, 4, 8, 17); p("#c2fcff", 13, 6, 3, 9); p("#267f92", 9, 18, 4, 5);
    p("#4bd0dc", 18, 11, 5, 10); p("#163c50", 12, 23, 7, 2);
  } else if (kind === "oil") {
    p(shadow, 6, 26, 21, 3); p("#34451c", 11, 6, 11, 5); p("#87aa36", 13, 4, 7, 4);
    p("#526a2b", 8, 12, 17, 12); p("#99c847", 9, 11, 15, 11); p("#d5f17a", 11, 12, 4, 8);
    p("#efffa8", 13, 8, 5, 2); p("#4b5c2d", 9, 21, 14, 3); p("#647f33", 21, 14, 2, 6);
  } else if (kind === "chest") {
    const trim = theme === "cinderworks" ? "#d07842" : theme === "hollowglass" ? "#68c6d2" : theme === "mycelium" ? "#83a85d" : "#bd8a4a";
    p(shadow, 3, 26, 26, 4); p("#25151b", 5, 12, 22, 14); p("#68402b", 4, 10, 24, 8);
    p("#9d6638", 6, 8, 20, 8); p("#d09a4b", 7, 7, 17, 3); p("#472b25", 6, 17, 20, 2);
    p("#8b552f", 6, 19, 20, 6); p(trim, 5, 15, 22, 2); p(trim, 7, 20, 2, 4); p(trim, 23, 20, 2, 4);
    p("#e6c77c", 15, 15, 3, 5); p("#493328", 14, 18, 5, 3); p("#bf9a57", 15, 19, 3, 2);
  } else if (kind === "hoard") {
    // Cerberus's chest: dark iron, chained, and still glowing along the seam.
    p(shadow, 2, 27, 28, 3); p("#17102b", 3, 11, 26, 16); p("#2a1f33", 4, 12, 24, 13);
    p("#3d2a4a", 3, 6, 26, 8); p("#54396a", 5, 7, 22, 3); p("#6b6280", 8, 6, 3, 20); p("#6b6280", 21, 6, 3, 20);
    p("#ff7a1a", 5, 14, 22, 2); p("#ffd35a", 8, 14, 16, 1); p("#ffb800", 13, 15, 6, 7); p("#fff0a0", 15, 17, 2, 3);
    p("#ff5a1a", 6, 2, 3, 5); p("#ffb800", 7, 1, 1, 3); p("#ff5a1a", 23, 3, 3, 4); p("#ffb800", 24, 2, 1, 3);
  } else {
    p(shadow, 3, 27, 26, 3); p("#191820", 5, 8, 22, 18); p("#4d4b5b", 7, 10, 18, 13);
    p("#858294", 8, 7, 16, 4); p("#b3afc0", 10, 6, 12, 2); p("#302e3d", 8, 13, 16, 3);
    p("#6f6d7d", 7, 18, 18, 3); p("#b39a5f", 14, 15, 5, 7); p("#e0ca81", 15, 16, 3, 3);
    p("#c2bdcb", 8, 11, 2, 2); p("#c2bdcb", 22, 11, 2, 2); p("#252430", 11, 22, 3, 3); p("#252430", 19, 22, 3, 3);
  }
  ITEM_SPRITES.set(key, canvas);
  return canvas;
}

const THEME_PALETTE: Record<FloorTheme, {
  floorLit: string; floorDim: string; speckLit: string; speckDim: string; accentLit: string; accentDim: string;
  wallLit: string; wallDim: string; seamLit: string; seamDim: string; edgeGlow: string;
}> = {
  catacombs: {
    floorLit: "#20232b", floorDim: "#101116", speckLit: "#3b3d49", speckDim: "#20222b", accentLit: "#887486", accentDim: "#493c50",
    wallLit: "#393745", wallDim: "#1c1b27", seamLit: "#555365", seamDim: "#292734", edgeGlow: "rgba(204,255,0,0.45)",
  },
  mycelium: {
    floorLit: "#1a2820", floorDim: "#0e1511", speckLit: "#2d4335", speckDim: "#19261e", accentLit: "#78a963", accentDim: "#3b5838",
    wallLit: "#344938", wallDim: "#19271e", seamLit: "#4b654c", seamDim: "#26382a", edgeGlow: "rgba(133,220,125,0.38)",
  },
  cinderworks: {
    floorLit: "#2b1d16", floorDim: "#150e0b", speckLit: "#493023", speckDim: "#261811", accentLit: "#d36e3d", accentDim: "#713c2a",
    wallLit: "#493126", wallDim: "#231810", seamLit: "#694633", seamDim: "#322116", edgeGlow: "rgba(255,146,74,0.4)",
  },
  hollowglass: {
    floorLit: "#17272d", floorDim: "#0b1419", speckLit: "#29434a", speckDim: "#15272d", accentLit: "#68d6df", accentDim: "#34727d",
    wallLit: "#2b4149", wallDim: "#142329", seamLit: "#3e5e67", seamDim: "#20353d", edgeGlow: "rgba(124,247,255,0.38)",
  },
};

export type View = { x: number; y: number; w: number; h: number };

export type DrawOptions = {
  /** UI panels transformed into world pixels by the canvas host. */
  feedbackAvoid?: { x: number; y: number; w: number; h: number }[];
  time: number;
  reducedMotion: boolean;
  /** The delver's picture this frame; it is drawn at `playerPos`. */
  hero: HeroPose;
  /** Effects of the last turns, drawn over everything else. */
  fx: FxQueue;
  /** Optional instance already fed every UI action, so batched React renders cannot lose a turn's pose. */
  creatures?: CreatureAnimator;
  playerPos: Point;
  view: View;
  /** Screen pixels per logical pixel. Whole numbers keep the pixel art sharp. */
  zoom: number;
};

/** Camera origin in tiles, centred on `focus` and clamped to the map. */
export function cameraFor(focus: Point, mapW: number, mapH: number, viewW: number, viewH: number): View {
  // A map smaller than the view is centred; a bigger one follows the focus and stops at its edges.
  const axis = (at: number, map: number, view: number) =>
    view >= map ? (map - view) / 2 : Math.max(0, Math.min(map - view, at + 0.5 - view / 2));
  return { x: axis(focus.x, mapW, viewW), y: axis(focus.y, mapH, viewH), w: viewW, h: viewH };
}

const hash = tileHash;

const ATLAS_VARIANTS = 8;
const TILE_ATLASES = new Map<string, HTMLCanvasElement>();
const MAP_ART_IMAGES = new Map<number, HTMLImageElement>();
const MAP_ART_CANVASES = new Map<string, HTMLCanvasElement>();
const THEME_ORDER: FloorTheme[] = ["catacombs", "mycelium", "cinderworks", "hollowglass"];

/** Approved map illustrations are cached as one tile-sized canvas per floor. */
function mapArtwork(depth: number, width: number, height: number) {
  if (depth < 1 || depth > 7) return null;
  const key = `${depth}:${width}:${height}`;
  const cached = MAP_ART_CANVASES.get(key);
  if (cached) return cached;

  let image = MAP_ART_IMAGES.get(depth);
  if (!image) {
    image = new Image();
    image.src = `${import.meta.env.BASE_URL}maps/depth-${String(depth).padStart(2, "0")}.webp`;
    MAP_ART_IMAGES.set(depth, image);
  }
  if (!image.complete || image.naturalWidth === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width * TILE;
  canvas.height = height * TILE;
  const ctx = canvas.getContext("2d")!;
  paintMap(ctx, image, depth, canvas.width, canvas.height);
  MAP_ART_CANVASES.set(key, canvas);
  return canvas;
}

/**
 * Cerberus: three heads on a broad body, drawn at 64x64 (2x2 tiles) from rectangles. Sleeping it is dull and still;
 * awake its eyes burn, its legs step and flames lick its back and tail.
 */
function drawCodeCerberus(ctx: CanvasRenderingContext2D, d: Dimling, time: number, still: boolean) {
  const u = 2;
  const ox = d.x * TILE, oy = d.y * TILE;
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x * u, oy + y * u, w * u, h * u);
  };
  const awake = d.awake;
  const t = still ? 0 : time;
  const fur = awake ? "#4a4368" : "#37324d", light = awake ? "#6b638f" : "#4a4468", ink = "#17102b";
  const eye = awake ? "#ff4a2a" : "#7a3a3a";
  const step = awake && !still ? Math.floor(t / 200) % 2 : 0;

  r(2, 29, 28, 2, "rgba(0,0,0,0.35)");
  // legs
  for (const [lx, lift] of [[5, 0], [11, 1], [17, 0], [23, 1]] as const) {
    const up = step && lift ? 1 : !step && !lift ? 0 : 0;
    r(lx - 1, 24 - up, 6, 7, ink); r(lx, 25 - up, 4, 4, fur); r(lx, 28 - up, 4, 2, light);
  }
  // body
  r(3, 14, 26, 12, ink); r(4, 15, 24, 10, fur); r(5, 16, 22, 3, light);
  // tail with a flame
  r(28, 17, 4, 4, ink); r(28, 18, 3, 2, fur);
  const tail = still ? 0 : Math.round(Math.sin(t / 110) * 1.5);
  if (awake) { r(29, 12 + tail, 3, 5, "#ff5a1a"); r(30, 11 + tail, 1, 3, "#ffb800"); }
  // heads: left and right lower, centre raised
  for (const [hx, hy] of [[1, 6], [12, 2], [23, 6]] as const) {
    r(hx + 2, hy + 7, 4, 9, ink); r(hx + 3, hy + 8, 2, 7, fur);      // neck
    r(hx - 1, hy - 1, 10, 10, ink); r(hx, hy, 8, 8, fur);              // head
    r(hx, hy - 3, 2, 3, ink); r(hx + 6, hy - 3, 2, 3, ink);           // ears
    r(hx + 1, hy + 2, 2, 2, eye); r(hx + 5, hy + 2, 2, 2, eye);       // eyes
    r(hx + 2, hy + 4, 4, 4, light); r(hx + 3, hy + 4, 2, 1, ink);     // muzzle and nose
    if (awake) { r(hx + 2, hy + 8, 1, 2, "#fbf7ff"); r(hx + 5, hy + 8, 1, 2, "#fbf7ff"); }
  }
  // a mane of fire along the back
  if (awake) {
    for (const [fx, base, phase] of [[9, 4, 0], [15, 6, 2], [21, 4, 4]] as const) {
      const h = base + (still ? 0 : Math.round(Math.sin(t / 100 + phase) * 1.5));
      r(fx, 14 - h, 3, h, "#ff5a1a"); r(fx + 1, 14 - h + 2, 1, h - 2, "#ffb800");
    }
  }
}

function drawCerberusMarks(ctx: CanvasRenderingContext2D, d: Dimling, pose: Pose) {
  const ox = pose.x*TILE, oy = pose.y*TILE - 12;
  // Keep the bar above the taller new artwork, and above the hero.
  const w = 60;
  ctx.fillStyle = "#000"; ctx.fillRect(ox + 1, oy - 11, w + 2, 6);
  ctx.fillStyle = "#333"; ctx.fillRect(ox + 2, oy - 10, w, 4);
  ctx.fillStyle = "#ff5a1a"; ctx.fillRect(ox + 2, oy - 10, Math.max(1, Math.round(w * d.hp / d.maxHp)), 4);
  ctx.font = "8px Silkscreen, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#000"; ctx.fillText("CERBERUS", ox + 33, oy - 13);
  ctx.fillStyle = "#ffd35a"; ctx.fillText("CERBERUS", ox + 32, oy - 14);
}


function drawCerberus(ctx: CanvasRenderingContext2D, d: Dimling, pose: Pose, player: Point, time: number, still: boolean) {
  const sheet = cerberusSheet();
  if (!sheet) { drawCodeCerberus(ctx, d, time, still); return; }
  const source = cerberusFrame(cerberusFacing(d, player), pose.frame), size = d.size ?? 2;
  const x = Math.round((pose.x + size/2)*TILE - CERBERUS_FOOT_X + pose.offX);
  const y = Math.round((pose.y + size)*TILE - 2 - CERBERUS_FOOT_Y - pose.lift + pose.offY);
  ctx.save(); ctx.imageSmoothingEnabled=false;
  ctx.fillStyle="rgba(0,0,0,0.35)"; ctx.beginPath();
  ctx.ellipse((pose.x+size/2)*TILE,(pose.y+size)*TILE-3,27,5,0,0,Math.PI*2);ctx.fill();
  if (!d.awake) ctx.globalAlpha=0.65;
  ctx.drawImage(sheet.image,source.x,source.y,CERBERUS_CELL_W*CERBERUS_TEXTURE_SCALE,CERBERUS_CELL_H*CERBERUS_TEXTURE_SCALE,
    x,y,CERBERUS_CELL_W,CERBERUS_CELL_H);
  if (pose.flash) ctx.drawImage(sheet.tint("#ffffff"),source.x,source.y,CERBERUS_CELL_W*CERBERUS_TEXTURE_SCALE,CERBERUS_CELL_H*CERBERUS_TEXTURE_SCALE,
    x,y,CERBERUS_CELL_W,CERBERUS_CELL_H);
  ctx.restore();
}

const animator = new CreatureAnimator();

/**
 * A creature's picture on its tile in the frame of its pose (walk, wind-up, blow), with its shadow and the flash of a
 * hit. It stands with its feet just above the tile's bottom edge; facing left it is mirrored around its feet.
 */
function drawCreature(ctx: CanvasRenderingContext2D, d: Dimling, pose: Pose) {
  const species = d.species ?? DEFAULT_SPECIES;
  const phase = d.phase ?? "idle";
  const tileX = pose.x * TILE, tileY = pose.y * TILE;
  const cx = Math.round(tileX + pose.offX) + TILE / 2;

  // The shadow stays on the floor and shrinks as the creature leaves it.
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, Math.round(tileY) + TILE - 3, TILE * 0.3 * (1 - Math.min(0.35, pose.lift / 24)), 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const sheet = mobSheet(species);
  if (!sheet) return;
  const sx = mobFrameX(pose.frame);
  ctx.save();
  ctx.translate(cx, Math.round(tileY + TILE - 3 - pose.lift + pose.offY));
  if (pose.flip) ctx.scale(-1, 1);
  if (!d.awake) ctx.globalAlpha = 0.72;
  else if (phase === "recovery" && !pose.striking) ctx.globalAlpha = 0.6;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet.image, sx, 0, MOB_CELL_W*MOB_TEXTURE_SCALE, MOB_CELL_H*MOB_TEXTURE_SCALE, -MOB_FOOT_X, -MOB_FOOT_Y, MOB_CELL_W, MOB_CELL_H);
  if (pose.flash) {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sheet.tint("#ffffff"), sx, 0, MOB_CELL_W*MOB_TEXTURE_SCALE, MOB_CELL_H*MOB_TEXTURE_SCALE, -MOB_FOOT_X, -MOB_FOOT_Y, MOB_CELL_W, MOB_CELL_H);
  }
  ctx.restore();
}

/**
 * What a creature shows over the scene, so nothing standing in front hides it: "z" while it sleeps, "!" while it winds up,
 * a health bar, and a bar for its attack. The attack bar is empty while it is idle, fills red as it winds up, and shows
 * blue while it recovers.
 */
function drawCreatureMarks(ctx: CanvasRenderingContext2D, d: Dimling, pose: Pose, time: number, still: boolean) {
  const phase = d.phase ?? "idle";
  const tileX = pose.x * TILE, tileY = pose.y * TILE;
  // The top of the creature's head: marks float just above it.
  const top = Math.round(tileY + TILE - 3 - MOB_HEIGHT[d.species ?? DEFAULT_SPECIES] - pose.lift + pose.offY);
  const cx = Math.round(tileX + pose.offX) + TILE / 2;

  if (!d.awake) {
    ctx.font = "8px Silkscreen, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#9aa0c8";
    ctx.fillText("z", cx + 8, top + 4 + (still ? 0 : Math.round(Math.sin(time / 500 + d.id) * 2)));
  }
  if (phase === "windup") {
    ctx.font = "14px Silkscreen, monospace";
    ctx.textAlign = "center";
    const y = top - 1;
    ctx.fillStyle = "#000"; ctx.fillText("!", cx + 1, y + 1);
    ctx.fillStyle = "#ff4a2a"; ctx.fillText("!", cx, y);
  }

  const w = 28;
  const barX = Math.round(tileX) + TILE / 2 - w / 2, by = Math.round(tileY) + TILE + 1;
  ctx.fillStyle = "#000"; ctx.fillRect(barX - 1, by - 1, w + 2, 5);
  ctx.fillStyle = "#333"; ctx.fillRect(barX, by, w, 3);
  ctx.fillStyle = COLORS.sigil; ctx.fillRect(barX, by, Math.max(1, Math.round(w * d.hp / d.maxHp)), 3);
  if (d.awake) {
    const ay = by + 5;
    ctx.fillStyle = "#000"; ctx.fillRect(barX - 1, ay - 1, w + 2, 5);
    ctx.fillStyle = "#333"; ctx.fillRect(barX, ay, w, 3);
    const progress = windupProgress(d);
    if (progress !== null) {
      ctx.fillStyle = "#ff4a2a"; ctx.fillRect(barX, ay, Math.max(1, Math.round(w * progress)), 3);
    } else if (phase === "recovery") {
      ctx.fillStyle = "#5cc8ff"; ctx.fillRect(barX, ay, w, 3);
    }
  }
}

/**
 * The floor under a blow about to land. The map pictures have their own slabs, which are not the size of a game tile, so
 * the marks are soft glows with a closing ring instead of hard squares: they read as danger on any floor, and the ring
 * sits on the tile centre so it is clear which tile is hit.
 */
function drawDanger(ctx: CanvasRenderingContext2D, tiles: Point[], progress: number, time: number, still: boolean) {
  const pulse = still ? 0 : Math.sin(time / 90) * 0.5 + 0.5;
  const strength = 0.45 + 0.55 * progress;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const t of tiles) {
    const cx = t.x * TILE + TILE / 2, cy = t.y * TILE + TILE / 2;
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, TILE * 0.78);
    glow.addColorStop(0, `rgba(255,70,40,${0.55 * strength})`);
    glow.addColorStop(0.65, `rgba(230,40,30,${0.3 * strength})`);
    glow.addColorStop(1, "rgba(200,20,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - TILE, cy - TILE, TILE * 2, TILE * 2);
  }
  ctx.globalCompositeOperation = "source-over";
  for (const t of tiles) {
    const cx = t.x * TILE + TILE / 2, cy = t.y * TILE + TILE / 2;
    // The ring closes on the tile centre as the blow gets closer.
    const r = TILE * (0.44 - 0.18 * progress) + pulse * 1.5;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,${120 + Math.round(80 * pulse)},90,${0.7 + 0.3 * progress})`;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,230,200,${0.5 + 0.4 * progress})`;
    ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Small pre-rendered pixel tiles keep the detailed map cheap to redraw during movement. */
function tileAtlas(theme: FloorTheme, palette: typeof THEME_PALETTE[FloorTheme], lit: boolean) {
  const key = `${theme}:${lit ? "lit" : "dim"}`;
  const cached = TILE_ATLASES.get(key);
  if (cached) return cached;

  const atlas = document.createElement("canvas");
  atlas.width = TILE * ATLAS_VARIANTS;
  atlas.height = TILE * 4;
  const ctx = atlas.getContext("2d")!;
  const floor = lit ? palette.floorLit : palette.floorDim;
  const speck = lit ? palette.speckLit : palette.speckDim;
  const wall = lit ? palette.wallLit : palette.wallDim;
  const seam = lit ? palette.seamLit : palette.seamDim;
  const accent = lit ? palette.accentLit : palette.accentDim;
  const themeIndex = THEME_ORDER.indexOf(theme);
  const rect = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  for (let variant = 0; variant < ATLAS_VARIANTS; variant++) {
    let noise = hash(variant + themeIndex * 29, 47 + themeIndex * 13);
    const random = (max: number) => {
      noise = Math.imul(noise ^ (noise >>> 15), 2246822519) >>> 0;
      return noise % max;
    };
    const ox = variant * TILE;

    // Broad worn stone slabs: keep grout subtle so the room reads as a place, not a chessboard.
    rect(floor, ox, 0, TILE, TILE);
    ctx.globalAlpha = 0.42;
    rect(speck, ox + 3 + random(5), 4 + random(4), 9 + random(7), 2 + random(3));
    rect(speck, ox + 19 + random(4), 21 + random(3), 5 + random(5), 2);
    ctx.globalAlpha = 1;
    rect(speck, ox + 4 + random(20), 5 + random(19), 2 + random(3), 1);
    rect(speck, ox + 5 + random(19), 7 + random(18), 1, 2 + random(3));
    if (variant % 3 === 0) {
      rect(accent, ox + 7 + random(10), 10 + random(8), 2, 2);
      rect(speck, ox + 8 + random(12), 21 + random(6), 2, 1);
    }
    if (variant % 4 === 1) {
      ctx.globalAlpha = 0.7;
      rect(seam, ox + 11 + random(7), 13 + random(5), 1, 5);
      rect(seam, ox + 8 + random(12), 16 + random(4), 4, 1);
      ctx.globalAlpha = 1;
      rect(speck, ox + 10 + random(10), 12 + random(8), 2, 2);
    }
    if (theme === "mycelium" && variant % 3 === 2) {
      rect(accent, ox + 4, 24, 4, 2);
      rect(accent, ox + 6, 22, 2, 2);
      rect(seam, ox + 3, 26, 6, 1);
    } else if (theme === "cinderworks" && variant % 3 === 2) {
      rect(accent, ox + 20, 8, 1, 5);
      rect(accent, ox + 18, 12, 3, 1);
      rect(seam, ox + 19, 9, 1, 3);
    } else if (theme === "hollowglass" && variant % 3 === 2) {
      rect(accent, ox + 23, 20, 2, 5);
      rect(seam, ox + 22, 22, 1, 3);
      rect(accent, ox + 25, 22, 1, 2);
    } else if (theme === "catacombs" && variant % 3 === 2) {
      rect(accent, ox + 22, 21, 3, 1);
      rect(accent, ox + 23, 22, 1, 2);
      rect(seam, ox + 21, 24, 3, 1);
    }

    // Chunky masonry blocks with a lit top edge, dark lower face, and alternating joints.
    const wy = TILE;
    rect(lit ? "#101018" : "#090a0e", ox, wy, TILE, TILE);
    rect(wall, ox + 1, wy + 1, 30, 29);
    rect(seam, ox + 2, wy + 2, 28, 2);
    rect(lit ? palette.floorDim : palette.floorLit, ox + 2, wy + 28, 29, 2);
    rect(seam, ox + 2, wy + 15, 28, 2);
    const shift = variant % 2 ? 8 : 0;
    rect(lit ? palette.floorDim : palette.floorLit, ox + 10 + shift, wy + 4, 2, 11);
    rect(lit ? palette.floorDim : palette.floorLit, ox + 22 - shift, wy + 17, 2, 11);
    rect(lit ? palette.speckLit : palette.speckDim, ox + 4, wy + 5, 3 + variant % 3, 1);
    rect(lit ? palette.speckLit : palette.speckDim, ox + 15, wy + 19, 4, 1);
    if (variant % 3 === 1) rect(accent, ox + 25, wy + 7, 2, 2);
    if (variant % 4 === 2) rect(lit ? palette.floorDim : palette.floorLit, ox + 3, wy + 11, 3, 2);

    // Sparse, non-blocking set dressing: tiny readable props in the same pixel language as the tiles.
    const dy = TILE * 2;
    rect("rgba(0,0,0,0)", ox, dy, TILE, TILE);
    const shadow = lit ? "#08090d" : "#050608";
    if (theme === "catacombs") {
      rect(shadow, ox + 6, dy + 24, 21, 4);
      if (variant % 3 === 0) {
        rect(seam, ox + 9, dy + 8, 15, 16); rect(wall, ox + 11, dy + 5, 11, 17);
        rect(accent, ox + 13, dy + 8, 7, 2); rect(seam, ox + 9, dy + 22, 15, 2);
        rect(lit ? "#a9909d" : "#534451", ox + 12, dy + 12, 2, 2);
      } else if (variant % 3 === 1) {
        rect(wall, ox + 9, dy + 8, 15, 16); rect(seam, ox + 11, dy + 7, 11, 2);
        rect(lit ? "#676171" : "#38343f", ox + 11, dy + 10, 3, 12); rect(seam, ox + 8, dy + 22, 17, 2);
        rect(accent, ox + 18, dy + 12, 2, 2); rect(shadow, ox + 16, dy + 17, 7, 2);
      } else {
        rect(seam, ox + 8, dy + 20, 16, 3); rect(lit ? "#b9a88a" : "#62594d", ox + 10, dy + 17, 4, 2);
        rect(lit ? "#d2c6a5" : "#746b5a", ox + 15, dy + 19, 7, 2); rect(accent, ox + 12, dy + 16, 2, 1);
        rect(shadow, ox + 9, dy + 13, 2, 4); rect(seam, ox + 21, dy + 15, 2, 3);
      }
    } else if (theme === "mycelium") {
      rect(seam, ox + 8, dy + 23, 18, 3);
      if (variant % 3 === 0) {
        rect(seam, ox + 14, dy + 15, 3, 11); rect(accent, ox + 8, dy + 11, 8, 5);
        rect(seam, ox + 10, dy + 9, 4, 2); rect(lit ? "#c6a3cb" : "#5c4967", ox + 18, dy + 15, 7, 4);
        rect(accent, ox + 20, dy + 13, 3, 2); rect(seam, ox + 8, dy + 17, 3, 2); rect(accent, ox + 24, dy + 21, 2, 2);
      } else if (variant % 3 === 1) {
        rect(seam, ox + 12, dy + 12, 4, 14); rect(accent, ox + 7, dy + 17, 8, 4);
        rect(accent, ox + 18, dy + 14, 8, 3); rect(lit ? "#d09adb" : "#654b72", ox + 20, dy + 11, 4, 3);
        rect(seam, ox + 5, dy + 22, 7, 2); rect(accent, ox + 9, dy + 15, 4, 2);
      } else {
        rect(seam, ox + 15, dy + 15, 3, 11); rect(accent, ox + 10, dy + 9, 12, 6);
        rect(lit ? "#d6b3df" : "#695378", ox + 12, dy + 7, 8, 3); rect(lit ? "#f0d7f0" : "#8a6c8f", ox + 14, dy + 8, 3, 2);
        rect(accent, ox + 7, dy + 22, 6, 2); rect(seam, ox + 19, dy + 20, 7, 2);
      }
    } else if (theme === "cinderworks") {
      rect(shadow, ox + 5, dy + 24, 22, 4);
      if (variant % 3 === 0) {
        rect(wall, ox + 7, dy + 11, 18, 13); rect(seam, ox + 9, dy + 13, 14, 2);
        rect(accent, ox + 11, dy + 8, 2, 5); rect(accent, ox + 17, dy + 6, 3, 7);
        rect(lit ? "#ffc06b" : "#8c4f36", ox + 13, dy + 10, 3, 3); rect(seam, ox + 9, dy + 20, 14, 2);
      } else if (variant % 3 === 1) {
        rect(wall, ox + 8, dy + 11, 16, 13); rect(seam, ox + 8, dy + 10, 16, 3);
        rect(accent, ox + 6, dy + 12, 4, 3); rect(accent, ox + 20, dy + 18, 5, 3);
        rect(lit ? "#f5aa54" : "#804b32", ox + 12, dy + 14, 7, 5); rect(shadow, ox + 14, dy + 15, 4, 3);
      } else {
        rect(seam, ox + 8, dy + 21, 17, 4); rect(wall, ox + 9, dy + 16, 7, 6);
        rect(accent, ox + 8, dy + 14, 8, 3); rect(lit ? "#d5a16b" : "#70503b", ox + 17, dy + 18, 7, 5);
        rect(accent, ox + 18, dy + 16, 4, 2); rect(shadow, ox + 11, dy + 17, 3, 2);
      }
    } else {
      rect(shadow, ox + 6, dy + 25, 20, 3);
      if (variant % 3 === 0) {
        rect(seam, ox + 9, dy + 18, 15, 7); rect(accent, ox + 11, dy + 9, 5, 11);
        rect(lit ? "#c1fbff" : "#5c9ba5", ox + 12, dy + 7, 3, 4); rect(seam, ox + 17, dy + 13, 5, 10);
        rect(accent, ox + 18, dy + 11, 3, 4); rect(lit ? "#d4fcff" : "#669da7", ox + 12, dy + 16, 2, 3);
      } else if (variant % 3 === 1) {
        rect(seam, ox + 8, dy + 20, 17, 5); rect(accent, ox + 9, dy + 14, 3, 8);
        rect(lit ? "#c1fbff" : "#5c9ba5", ox + 10, dy + 10, 3, 5); rect(accent, ox + 16, dy + 9, 5, 12);
        rect(lit ? "#d4fcff" : "#669da7", ox + 17, dy + 7, 3, 4); rect(seam, ox + 21, dy + 15, 4, 4);
      } else {
        rect(seam, ox + 8, dy + 21, 17, 4); rect(accent, ox + 10, dy + 14, 5, 9);
        rect(lit ? "#d4fcff" : "#669da7", ox + 11, dy + 11, 3, 5); rect(seam, ox + 16, dy + 17, 4, 5);
        rect(accent, ox + 21, dy + 12, 4, 10); rect(lit ? "#c1fbff" : "#5c9ba5", ox + 22, dy + 9, 2, 4);
      }
    }

    // Biome sconces mounted into wall blocks; these are decorative and drawn only in lit cells.
    const ty = TILE * 3;
    rect(shadow, ox + 12, ty + 22, 10, 4);
    if (theme === "catacombs") {
      rect(seam, ox + 14, ty + 15, 7, 8); rect(lit ? "#d4a45b" : "#715331", ox + 15, ty + 17, 5, 5);
      rect(lit ? "#ffb55e" : "#744a32", ox + 16, ty + 8, 4, 8); rect(lit ? "#ffe08a" : "#98633c", ox + 17, ty + 6, 2, 3);
      rect(lit ? "#fff1ae" : "#ba8050", ox + 17, ty + 10, 2, 4);
    } else if (theme === "mycelium") {
      rect(seam, ox + 14, ty + 14, 7, 9); rect(accent, ox + 13, ty + 8, 9, 8);
      rect(lit ? "#e8b6e7" : "#705575", ox + 15, ty + 6, 5, 4); rect(lit ? "#f5d5eb" : "#957399", ox + 16, ty + 7, 2, 2);
      rect(lit ? "#98da7a" : "#4e784a", ox + 12, ty + 12, 2, 3);
    } else if (theme === "cinderworks") {
      rect(seam, ox + 14, ty + 14, 7, 9); rect(lit ? "#e87a3a" : "#7f452d", ox + 14, ty + 9, 7, 8);
      rect(lit ? "#ffce70" : "#aa633c", ox + 16, ty + 6, 4, 7); rect(lit ? "#fff0a0" : "#c98a4d", ox + 17, ty + 8, 2, 4);
      rect(seam, ox + 12, ty + 21, 11, 2);
    } else {
      rect(seam, ox + 14, ty + 15, 7, 8); rect(accent, ox + 14, ty + 8, 7, 10);
      rect(lit ? "#d6fcff" : "#689ca5", ox + 16, ty + 6, 3, 9); rect(lit ? "#e9fdff" : "#83b3ba", ox + 17, ty + 8, 1, 5);
      rect(seam, ox + 12, ty + 22, 11, 2);
    }
  }

  TILE_ATLASES.set(key, atlas);
  return atlas;
}

export function drawRun(ctx: CanvasRenderingContext2D, state: RunState, opts: DrawOptions) {
  const { floor } = state;
  const palette = THEME_PALETTE[floor.theme];
  const { view } = opts;
  const W = view.w * TILE, H = view.h * TILE;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W * opts.zoom, H * opts.zoom);
  // Everything below is drawn in logical pixels; the zoom makes them whole screen pixels.
  ctx.setTransform(opts.zoom, 0, 0, opts.zoom, -Math.round(view.x * TILE) * opts.zoom, -Math.round(view.y * TILE) * opts.zoom);

  const radius = currentRadius(state);
  const visible = visibleSet(floor, state.player, radius);
  const nightVision = state.light <= 0 && state.nightVision > 0;
  const artwork = mapArtwork(floor.depth, floor.w, floor.h);
  // The masks trace the painted ground at cell centres. Feet belong there, not on the next row's wall cap.
  const actorLift = artwork ? 12 : 0;
  const litAtlas = tileAtlas(floor.theme, palette, true);
  const dimAtlas = tileAtlas(floor.theme, palette, false);
  const occupied = new Set<number>([
    idx(floor, floor.spawn.x, floor.spawn.y), idx(floor, floor.stairs.x, floor.stairs.y),
    ...floor.items.map(p => idx(floor, p.x, p.y)), ...floor.dimlings.flatMap(d => footprint(d).map(p => idx(floor, p.x, p.y))),
    idx(floor, Math.round(opts.playerPos.x), Math.round(opts.playerPos.y)),
  ]);
  const floorAt = (x: number, y: number) => x >= 0 && y >= 0 && x < floor.w && y < floor.h && floor.tiles[idx(floor, x, y)] === 1;

  const x0 = Math.max(0, Math.floor(view.x)), y0 = Math.max(0, Math.floor(view.y));
  const x1 = Math.min(floor.w - 1, Math.ceil(view.x + view.w)), y1 = Math.min(floor.h - 1, Math.ceil(view.y + view.h));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = idx(floor, x, y);
      if (!floor.seen[k]) continue;
      const lit = visible.has(k);
      const px = x * TILE, py = y * TILE;
      const atlas = lit ? litAtlas : dimAtlas;
      const variant = hash(x, y) % ATLAS_VARIANTS;
      if (artwork) {
        ctx.drawImage(artwork, px, py, TILE, TILE, px, py, TILE, TILE);
        if (!lit) {
          ctx.fillStyle = "rgba(0,0,0,0.48)";
          ctx.fillRect(px, py, TILE, TILE);
        }
      } else if (floor.tiles[k] === 1) {
        ctx.drawImage(atlas, variant * TILE, 0, TILE, TILE, px, py, TILE, TILE);
        if (lit && !occupied.has(k) && hasFloorDecor(x, y)) {
          const prop = hash(x + 41, y + 73) % ATLAS_VARIANTS;
          ctx.drawImage(litAtlas, prop * TILE, TILE * 2, TILE, TILE, px, py, TILE, TILE);
        }
      } else {
        const edge = floorAt(x + 1, y) || floorAt(x - 1, y) || floorAt(x, y + 1) || floorAt(x, y - 1)
          || floorAt(x + 1, y + 1) || floorAt(x - 1, y - 1) || floorAt(x + 1, y - 1) || floorAt(x - 1, y + 1);
        if (!edge) continue;
        ctx.drawImage(atlas, variant * TILE, TILE, TILE, TILE, px, py, TILE, TILE);
        if (lit && hash(x + 179, y + 43) % 13 === 0) {
          ctx.drawImage(litAtlas, variant * TILE, TILE * 3, TILE, TILE, px, py, TILE, TILE);
        }
        if (lit && floorAt(x, y + 1)) {
          ctx.fillStyle = palette.edgeGlow;
          ctx.fillRect(px, py + TILE - 3, TILE, 3);
        }
      }
    }
  }

  const showAt = (p: Point) => floor.seen[idx(floor, p.x, p.y)] && (visible.has(idx(floor, p.x, p.y)) || floor.revealed);
  const iconAt = (p: Point, mask: Mask, color: string) =>
    drawMask(ctx, mask, p.x * TILE + 4, p.y * TILE + 4, 3, color, false, "#000");

  if (floor.seen[idx(floor, floor.spawn.x, floor.spawn.y)]) {
    const pulse = opts.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(opts.time / 300);
    ctx.globalAlpha = pulse;
    iconAt(floor.spawn, ICONS.rift, COLORS.lime);
    ctx.globalAlpha = 1;
  }
  if (floor.seen[idx(floor, floor.stairs.x, floor.stairs.y)]) iconAt(floor.stairs, ICONS.stairs, COLORS.white);

  ctx.save(); ctx.translate(0, -actorLift);
  for (const item of floor.items) {
    if (!showAt(item)) continue;
    const bob = opts.reducedMotion ? 0 : Math.round(Math.sin(opts.time / 250 + item.id) * 1.5);
    if (drawCell(ctx, lootSheet(), lootIndex(item.kind), item.x * TILE + TILE / 2, item.y * TILE + TILE - 3 + bob)) continue;
    ctx.drawImage(itemSprite(item.kind, floor.theme), item.x * TILE, item.y * TILE + bob, TILE, TILE);
  }

  // Things to smash stand on their tiles; one that has taken a blow is cracked and shows what is left of it.
  for (const prop of propsOf(floor)) {
    if (!showAt(prop)) continue;
    const left = prop.x * TILE, top = prop.y * TILE;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(left + TILE / 2, top + TILE - 3, TILE * 0.36, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    const painted = propSheet(prop.kind);
    if (!drawCell(ctx, painted, painted && standingFrame(painted, prop.hp, prop.maxHp), left + TILE / 2, top + TILE - 2)) {
      ctx.drawImage(propCanvas(prop.kind, prop.hp < prop.maxHp ? "b" : "a"), left, top, TILE, TILE);
    }
    if (prop.hp < prop.maxHp) {
      ctx.fillStyle = "#000"; ctx.fillRect(left + 5, top + TILE + 1, TILE - 10, 4);
      ctx.fillStyle = "#333"; ctx.fillRect(left + 6, top + TILE + 2, TILE - 12, 2);
      ctx.fillStyle = "#e8c070"; ctx.fillRect(left + 6, top + TILE + 2, Math.max(1, Math.round((TILE - 12) * prop.hp / prop.maxHp)), 2);
    }
  }

  ctx.restore();
  // Each creature's picture follows its pose. Reduced motion skips the animation and shows them standing on their tiles.
  const creatures = opts.creatures ?? animator;
  if (!opts.creatures) creatures.updateRun(state, opts.time);
  const poseOf = (d: Dimling) => (opts.reducedMotion ? restPose(d) : creatures.pose(d, opts.time));

  // The tiles a creature is about to hit are marked in red, stronger the closer the blow.
  const heroTile = { x: Math.round(opts.playerPos.x), y: Math.round(opts.playerPos.y) };
  let heroThreat: number | null = null;
  for (const d of floor.dimlings) {
    if (d.boss || d.phase !== "windup") continue;
    const creatureSeen = visible.has(idx(floor, d.x, d.y));
    const tiles = attackTiles(floor, d).filter(t => creatureSeen || visible.has(idx(floor, t.x, t.y)));
    const progress = windupProgress(d) ?? 0;
    drawDanger(ctx, tiles, progress, opts.time, opts.reducedMotion);
    if (tiles.some(t => t.x === heroTile.x && t.y === heroTile.y)) heroThreat = Math.max(heroThreat ?? 0, progress);
  }

  // Back to front: what stands lower on the screen is drawn later, so the delver's head, which rises into the tile
  // above, goes over a creature there, and a creature below goes over the delver's blade.
  const pp = opts.playerPos;
  const shown = floor.dimlings
    .filter(d => footprint(d).some(c => visible.has(idx(floor, c.x, c.y))))
    .map(d => ({ d, pose: poseOf(d) }));
  const drawOne = ({ d, pose }: (typeof shown)[number]) => {
    if (d.boss) drawCerberus(ctx, d, pose, state.player, opts.time, opts.reducedMotion);
    else drawCreature(ctx, d, pose);
  };
  const behind = (s: (typeof shown)[number]) => s.pose.y + (s.d.size ?? 1) - 1 <= pp.y;
  ctx.save(); ctx.translate(0, -actorLift);
  shown.filter(behind).forEach(drawOne);
  drawHero(ctx, opts.hero, pp.x * TILE, pp.y * TILE, TILE, "rgba(0,0,0,0.4)");
  // The hero hides the mark under their feet, so the mark is drawn again over them, half seen so the hero still reads.
  if (heroThreat !== null) {
    ctx.save();
    ctx.translate(0, actorLift); // The warning stays on the ground beneath the actor.
    ctx.globalAlpha = 0.5;
    drawDanger(ctx, [heroTile], heroThreat, opts.time, opts.reducedMotion);
    ctx.restore();
  }
  shown.filter(s => !behind(s)).forEach(drawOne);
  // Bars and warnings go over everyone, so a creature behind the hero's head still shows its health and its blow.
  for (const s of shown) {
    if (s.d.boss) drawCerberusMarks(ctx, s.d, s.pose);
    else drawCreatureMarks(ctx, s.d, s.pose, opts.time, opts.reducedMotion);
  }
  ctx.restore();

  const cx = pp.x * TILE + TILE / 2, cy = pp.y * TILE + TILE / 2;
  const flicker = opts.reducedMotion ? 0 : Math.sin(opts.time / 90) * 3 + Math.sin(opts.time / 37) * 2;
  const outer = (radius + 0.6) * TILE + flicker;
  const g = ctx.createRadialGradient(cx, cy, TILE * 0.8, cx, cy, Math.max(TILE, outer));
  if (nightVision) {
    g.addColorStop(0, "rgba(0,40,10,0)");
    g.addColorStop(1, "rgba(0,12,4,0.88)");
  } else {
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0.8)");
  }
  const vx = view.x * TILE, vy = view.y * TILE;
  ctx.fillStyle = g;
  ctx.fillRect(vx, vy, W, H);

  if (!nightVision) {
    const warm = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(TILE, outer));
    warm.addColorStop(0, "rgba(204,255,0,0.07)");
    warm.addColorStop(1, "rgba(204,255,0,0)");
    ctx.fillStyle = warm;
    ctx.fillRect(vx, vy, W, H);
  } else {
    ctx.fillStyle = "rgba(60,255,120,0.10)";
    ctx.fillRect(vx, vy, W, H);
  }

  if (state.ward > 0) {
    ctx.strokeStyle = "rgba(124,247,255,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Blows, numbers and puffs go over the darkness, so they read even at the edge of the light.
  const art: FxArt = {
    // Loot that hops out: the painted loot at its own size, or the code sprite at half a tile.
    loot: (c, item, x, y) => {
      const sheet = lootSheet();
      if (drawCell(c, sheet, lootIndex(item), x, y + 8)) return true;
      c.imageSmoothingEnabled = false;
      c.drawImage(itemSprite(item, floor.theme), x - 8, y - 8, 16, 16);
      return true;
    },
    shatter: (c, prop, x, baseY, k, hp, maxHp) => {
      const sheet = propSheet(prop);
      return drawCell(c, sheet, sheet && breakingFrame(sheet, k, hp, maxHp), x, baseY);
    },
  };
  const reserved = [...(opts.feedbackAvoid ?? []).map(r=>({...r,y:r.y+actorLift})), ...shown.filter(s => s.d.boss).map(s => ({ x: s.pose.x * TILE - 3, y: s.pose.y * TILE - 38, w: 70, h: 24 }))];
  ctx.save(); ctx.translate(0, -actorLift);
  opts.fx.draw(ctx, opts.time, opts.reducedMotion, art, { x: vx, y: vy + actorLift, w: W, h: H }, reserved);
  ctx.restore();
}
