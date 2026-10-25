// Turns the AI-made sprite sheets (magenta background) into game sheets: transparent, every frame shrunk to the game's
// pixel size and put in a cell with its feet on the same spot, so frames swap without the figure jumping.
//   heroes: art/heroes/raw/*.webp, 5 frames x 4 directions  -> public/heroes/*.png
//   mobs:   art/mobs/raw/*.webp,   4 frames facing right     -> public/mobs/*.png
//
// Usage: node scripts/sprite-sheets.mjs              (everything)
//        node scripts/sprite-sheets.mjs heroes       (one kind)
//        node scripts/sprite-sheets.mjs mobs sootplate
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { writeTiles } from "./tile-sheets.mjs";

const COLS = 5, ROWS = 4;
export const CELL_W = 64, CELL_H = 56;
/** Texture pixels per logical game pixel: enough to retain the source eyes at desktop zoom. */
export const HERO_TEXTURE_SCALE = 2;
/** Where the feet stand inside a cell. */
const FOOT_X = 32, FOOT_Y = 54;
/** Height of the standing figure (front view, first frame), ears to boots, in game pixels. */
const FIGURE_H = 42;

const isBg = (r, g, b) => Math.min(r, b) > 80 && g < 0.45 * Math.min(r, b);

const SHEET_W = CELL_W * COLS;
const at = (out, x, y) => (y * SHEET_W + x) * 4;

/** Copies one frame over another: row and column count from 0 (rows: down, left, right, up). */
function copyCell(out, from, to) {
  for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
    const s = at(out, from.col * CELL_W + x, from.row * CELL_H + y), d = at(out, to.col * CELL_W + x, to.row * CELL_H + y);
    out.copy(out, d, s, s + 4);
  }
}

/**
 * Recolours the cream tip of a tail so it reads as fur, not as a third paw. In each row of frames the tail sits in one
 * area (`areas[row]`, cell coordinates). Inside it, cream patches of at least 5 pixels that do not touch the steel of
 * the sword are painted in the tail's fur colours, banded like the rest of the tail.
 */
function recolorTips(out, areas, fur, stripe, density = 1) {
  const CELL_W = 64 * density, CELL_H = 56 * density;
  const at = (_out, x, y) => (y * CELL_W * COLS + x) * 4;
  areas = areas.map(a => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v * density])));
  const cream = (r, g, b) => r > 225 && g > 195 && b > 140;
  const steel = (r, g, b) => b > r && r + g + b > 300;
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    const a = areas[row];
    const ox = col * CELL_W, oy = row * CELL_H;
    const seen = new Set();
    for (let y = a.y0; y < a.y1; y++) for (let x = a.x0; x < a.x1; x++) {
      const key = y * CELL_W + x;
      const i = at(out, ox + x, oy + y);
      if (seen.has(key) || !out[i + 3] || !cream(out[i], out[i + 1], out[i + 2])) continue;
      const patch = [], queue = [[x, y]];
      let touchesSteel = false;
      seen.add(key);
      while (queue.length) {
        const [px, py] = queue.pop();
        patch.push([px, py]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= CELL_W || ny >= CELL_H) continue;
          const j = at(out, ox + nx, oy + ny);
          if (!out[j + 3]) continue;
          if (steel(out[j], out[j + 1], out[j + 2])) touchesSteel = true;
          const k = ny * CELL_W + nx;
          if (!seen.has(k) && cream(out[j], out[j + 1], out[j + 2]) && nx >= a.x0 && nx < a.x1 && ny >= a.y0 && ny < a.y1) { seen.add(k); queue.push([nx, ny]); }
        }
      }
      if (patch.length < 5 * density ** 2 || touchesSteel) continue;
      for (const [px, py] of patch) {
        const j = at(out, ox + px, oy + py);
        const c = Math.floor(py / density) % 3 === 0 ? stripe : fur;
        out[j] = c[0]; out[j + 1] = c[1]; out[j + 2] = c[2];
      }
    }
  }
}

const OUTLINE = [27, 19, 32];

/**
 * Seen from behind, a cat's tail is a short round tuft in the middle of its back, under the coat. The AI drew it off
 * to one side in some frames and not others. This takes the side tail away and draws the tuft in the middle.
 *
 * Every part of these sprites has its own dark outline, so with the outline left out, the side tail is a patch of its
 * own: a patch of at least 20 pixels, not teal (the coat), beside the coat rather than over it, between the coat's
 * top and bottom. The outline that only bordered it goes with it.
 */
function backTail(out, cols, fur, { rx = 3.6, ry = 3.4, stripe = false } = {}) {
  const row = 3;
  for (const col of cols) {
    const ox = col * CELL_W, oy = row * CELL_H;
    const idx = (x, y) => at(out, ox + x, oy + y);
    const inside = (x, y) => x >= 0 && y >= 0 && x < CELL_W && y < CELL_H;
    const opaque = (x, y) => inside(x, y) && out[idx(x, y) + 3] > 0;
    const rgb = (x, y) => { const i = idx(x, y); return [out[i], out[i + 1], out[i + 2]]; };
    const dark = (x, y) => opaque(x, y) && rgb(x, y).reduce((a, b) => a + b) < 120;
    const teal = (x, y) => { const [r, g, b] = rgb(x, y); return opaque(x, y) && g > r + 15 && b > r - 10; };

    let tx0 = CELL_W, tx1 = -1, ty0 = CELL_H, ty1 = -1;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) if (teal(x, y)) { tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y); }
    // The middle of the coat is measured at its hem, where no raised sleeve widens it.
    let hx0 = CELL_W, hx1 = -1;
    for (let y = ty1 - 3; y <= ty1; y++) for (let x = 0; x < CELL_W; x++) if (teal(x, y)) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
    const near = (c, f) => Math.abs(c[0] - f[0]) + Math.abs(c[1] - f[1]) + Math.abs(c[2] - f[2]) < 70;

    const seen = new Uint8Array(CELL_W * CELL_H);
    const removed = [];
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      if (seen[y * CELL_W + x] || !opaque(x, y) || dark(x, y)) continue;
      const patch = [], queue = [[x, y]];
      seen[y * CELL_W + x] = 1;
      let tealCount = 0, sx = 0, sy = 0;
      const sum = [0, 0, 0];
      while (queue.length) {
        const [px, py] = queue.pop();
        patch.push([px, py]); sx += px; sy += py;
        const c = rgb(px, py); sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
        if (teal(px, py)) tealCount++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          if (opaque(nx, ny) && !dark(nx, ny) && !seen[ny * CELL_W + nx]) { seen[ny * CELL_W + nx] = 1; queue.push([nx, ny]); }
        }
      }
      const cx = sx / patch.length, cy = sy / patch.length;
      const beside = cx < tx0 + 1 || cx > tx1 - 1;
      // Only fur: the lantern beside the coat is another colour and stays.
      const furry = near(sum.map(v => v / patch.length), fur.base);
      if (process.env.DEBUG_TAIL && patch.length >= 10) console.log("    patch", col + 1, patch.length, sum.map(v => Math.round(v / patch.length)).join(","), "at", cx.toFixed(1), cy.toFixed(1), { furry, beside });
      if (patch.length >= 20 && tealCount === 0 && furry && beside && cy > ty0 - 2 && cy < ty1 + 0.5) removed.push(...patch);
    }
    for (const [x, y] of removed) out[idx(x, y) + 3] = 0;
    // The tail's own outline: dark pixels that bordered it and hold on to nothing else side by side.
    const gone = new Set(removed.map(([x, y]) => y * CELL_W + x));
    const own = [];
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      if (!dark(x, y)) continue;
      let byTail = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (gone.has((y + dy) * CELL_W + x + dx)) byTail = true;
      const held = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => opaque(x + dx, y + dy) && !dark(x + dx, y + dy));
      if (byTail && !held) own.push([x, y]);
    }
    for (const [x, y] of own) out[idx(x, y) + 3] = 0;
    // Outline left hanging once the patch it bordered is gone.
    for (let pass = 0; pass < 2; pass++) {
      const drop = [];
      for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
        if (!dark(x, y)) continue;
        let solid = false;
        for (let dy = -1; dy <= 1 && !solid; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opaque(x + dx, y + dy) && !dark(x + dx, y + dy)) { solid = true; break; }
        if (!solid) drop.push([x, y]);
      }
      for (const [x, y] of drop) out[idx(x, y) + 3] = 0;
    }

    // The tuft: an outlined ball over the bottom of the coat, lit from the top left.
    // Bits left floating once the tail is gone (a stroke of its outline on the ground).
    const lone = new Uint8Array(CELL_W * CELL_H);
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      if (lone[y * CELL_W + x] || !opaque(x, y)) continue;
      const bit = [[x, y]], queue = [[x, y]];
      lone[y * CELL_W + x] = 1;
      while (queue.length) {
        const [px, py] = queue.pop();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy;
          if (opaque(nx, ny) && !lone[ny * CELL_W + nx]) { lone[ny * CELL_W + nx] = 1; queue.push([nx, ny]); bit.push([nx, ny]); }
        }
      }
      if (bit.length < 12) for (const [bx, by] of bit) out[idx(bx, by) + 3] = 0;
    }

    const cx = (hx0 + hx1) / 2 + 0.5, cy = ty1 - 0.5;
    const ball = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
    const paint = (x, y, c) => { if (!inside(x, y)) return; const i = idx(x, y); out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255; };
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      if (!ball(x, y) && (ball(x - 1, y) || ball(x + 1, y) || ball(x, y - 1) || ball(x, y + 1))) paint(x, y, OUTLINE);
    }
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) {
      if (!ball(x, y)) continue;
      const rim = !ball(x - 1, y - 1) || !ball(x - 1, y);
      const shade = !ball(x + 1, y + 1) || !ball(x + 2, y + 1);
      paint(x, y, shade ? fur.dark : rim ? fur.light : stripe && y % 3 === 0 ? fur.dark : fur.base);
    }
    console.log("  back tail", col + 1, "removed", removed.length, "coat", tx0, tx1, ty0, ty1);
  }
}

/**
 * Gives back a leg the side tail used to hide: below the coat, the right half (the leg that shows) is mirrored onto the
 * left half around the middle of the coat's hem.
 */
function mirrorLegs(out, cols) {
  const row = 3;
  for (const col of cols) {
    const ox = col * CELL_W, oy = row * CELL_H;
    const idx = (x, y) => at(out, ox + x, oy + y);
    const teal = (x, y) => { const i = idx(x, y); return out[i + 3] > 0 && out[i + 1] > out[i] + 15 && out[i + 2] > out[i] - 10; };
    let ty1 = -1;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) if (teal(x, y)) ty1 = Math.max(ty1, y);
    let hx0 = CELL_W, hx1 = -1;
    for (let y = ty1 - 3; y <= ty1; y++) for (let x = 0; x < CELL_W; x++) if (teal(x, y)) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
    const mid = (hx0 + hx1) / 2;
    for (let y = ty1 + 2; y < CELL_H; y++) {
      for (let x = Math.max(0, Math.floor(mid) - 13); x <= Math.floor(mid); x++) out[idx(x, y) + 3] = 0;
      for (let x = Math.ceil(mid); x < Math.min(CELL_W, Math.ceil(mid) + 10); x++) {
        const s = idx(x, y), d = idx(Math.round(2 * mid - x), y);
        out.copy(out, d, s, s + 4);
      }
    }
  }
}

/** Approved body corrections. Faces and eyes are always sampled from the original artwork, never repainted. */
const FIXES = {
  "cat-ginger-tabby": out => {
    recolorTips(out, [
      { x0: 42, x1: 60, y0: 22, y1: 40 },
      { x0: 40, x1: 62, y0: 20, y1: 46 },
      { x0: 2, x1: 21, y0: 26, y1: 46 },
      { x0: 4, x1: 25, y0: 22, y1: 38 },
    ], [236, 140, 48], [196, 98, 30]);
    backTail(out, [0, 1, 2, 3, 4], { base: [236, 140, 48], light: [250, 182, 92], dark: [196, 98, 30] }, { stripe: true });
  },
  "cat-maine-coon": out => {
    mirrorLegs(out, [0, 1, 2, 3, 4]);
    backTail(out, [0, 1, 2, 3, 4], { base: [184, 120, 66], light: [214, 160, 104], dark: [128, 80, 44] }, { rx: 4.6, ry: 4 });
  },
  "cat-siamese": out => backTail(out, [0, 1, 2, 3, 4], { base: [96, 60, 44], light: [132, 92, 66], dark: [68, 42, 32] }, { rx: 3.2, ry: 3 }),
  "cat-scottish-fold": out => backTail(out, [1, 2, 3, 4], { base: [150, 150, 156], light: [186, 186, 192], dark: [112, 112, 120] }),
};

/**
 * Logical heights: small bodies fill roughly a 32px tile along their longer side, keeping their source proportions.
 * The already-large golem is unchanged. All sheets retain source details at 2x texture density.
 */
export const MOB_HEIGHT = {
  wickgnaw: 30, snaretoad: 22, "cinder-hound": 28, chaincoil: 29, "needle-wraith": 26,
  sootplate: 36, "hollow-burrower": 22, "fourfold-bell": 32, "rift-leaper": 28,
};

/**
 * Game sizes of the things to smash and of the loot on the floor, in pixels (the hero is 42, the smallest creature 20).
 * Each stands on one 32-pixel tile.
 */
export const PROP_HEIGHT = { urn: 28, crate: 27, barrel: 30, sack: 26 };
/**
 * Frames in each prop's picture when it is not one per square (the AI drew the 6-frame urn on a 3:1 canvas). Without an
 * entry the count is the picture's width over its height, rounded.
 */
export const PROP_FRAMES = { urn: 6, crate: 6, barrel: 6, sack: 6 };
/** The loot row, left to right, as art/props/raw/loot.webp shows it. */
export const LOOT_ORDER = ["gold", "crystal", "oil", "chest", "vault", "hoard"];
export const LOOT_HEIGHT = { gold: 12, crystal: 16, oil: 16, chest: 18, vault: 19, hoard: 26 };

/** The camp's buildings, left to right as art/lobby/sprites/buildings.webp shows them, and each one's height in the game. */
export const BUILDING_ORDER = ["gate", "hall", "altar", "armory", "ledger", "board", "guide"];
// Altar/Vault bases fit the 144px interior of a five-tile pad (160px less its two 8px curbs).
export const BUILDING_HEIGHT = { gate: 168, hall: 151, altar: 136, armory: 151, ledger: 147, board: 129, guide: 84 };
/** The camp's furniture, as art/lobby/sprites/furniture.webp shows it, and each piece's height in the game. */
export const FURNITURE_ORDER = ["fire", "bench", "crate", "crates", "barrel", "chair", "tent"];
export const FURNITURE_HEIGHT = { fire: 90, bench: 34, crate: 30, crates: 46, barrel: 34, chair: 38, tent: 104 };
/** Axis-aligned benches and the inward-facing vault, generated as separate replacement rows. */
export const BENCH_ORDER = ["bench-h", "bench-v"];
export const BENCH_HEIGHT = { "bench-h": 26, "bench-v": 72 };
export const VAULT_ORDER = ["vault-west"];
export const VAULT_HEIGHT = { "vault-west": 144 };
/** The camp's lights and cave details, as art/lobby/sprites/decor.webp shows them, and each one's height in the game. */
export const DECOR_ORDER = ["banner", "lamp", "brazier", "crystal", "mushrooms", "boulder", "stalagmite"];
export const DECOR_HEIGHT = { banner: 64, lamp: 72, brazier: 46, crystal: 42, mushrooms: 24, boulder: 38, stalagmite: 60 };
/** L2: one uniform stone scale; joining lengths are normalized by copying/cropping, never stretching the stone. */
export const CURB_ORDER = ["curb-h", "curb-v", "curb-outer", "curb-inner", "curb-end-h", "curb-end-v"];
export const CURB_HEIGHT = { "curb-h": 8, "curb-v": 32, "curb-outer": 32, "curb-inner": 32, "curb-end-h": 8, "curb-end-v": 32 };

const KINDS = {
  perks:{raw:'art/perks/raw/',out:'public/perks/'},
  tiles: { raw: "art/tiles/raw/", out: "public/tiles/" },
  // Cerberus: down/left/right/up, idle/step/wind-up/attack, retaining the source eyes at 2x density.
  bosses: { raw: "art/bosses/raw/", out: "public/bosses/", cols: 4, rows: 4, cellW: 128, cellH: 112, footX: 64, footY: 104, main: true, height: () => 72, textureScale: 2, fixes: {} },
  heroes: { raw: "art/heroes/raw/", out: "public/heroes/", cols: COLS, rows: ROWS, cellW: CELL_W, cellH: CELL_H, footX: FOOT_X, footY: FOOT_Y, main: false, height: () => FIGURE_H, textureScale: HERO_TEXTURE_SCALE, fixes: FIXES },
  // A mob's cell is wide: its attack (an arrow, a web, a spark) flies ahead of it, to the right.
  mobs: { raw: "art/mobs/raw/", out: "public/mobs/", cols: 4, rows: 1, cellW: 96, cellH: 56, footX: 32, footY: 52, main: true, height: name => MOB_HEIGHT[name] ?? 24, textureScale: 2, fixes: {} },
  // A prop: a strip of square-ish frames, as many as the picture is times wider than tall: 1 (only whole), 3 (whole,
  // cracked, breaking apart) or 6 (whole, two stages of cracks, three of breaking apart); see src/render/prop-sheets.ts.
  // Every frame is placed by its whole picture on the first frame's baseline, so flying pieces keep their places.
  // art/props/raw/loot.webp is the loot row instead:
  // six things side by side, each scaled to its own height (see LOOT_ORDER). The AI draws a dark magenta contact shadow
  // under each; the game draws its own, so every shade of magenta is background here.
  props: {
    raw: "art/props/raw/", out: "public/props/", cols: 3, rows: 1, cellW: 56, cellH: 48, footX: 28, footY: 43, main: false, sameBaseline: true,
    // Twice the creatures' density, like the heroes: the AI draws a prop about 1.4x taller than it stands in the game,
    // and shrinking it to 1x smeared rims, hoops and holes.
    height: name => PROP_HEIGHT[name] ?? 20, fixes: {}, textureScale: 2,
    // Dust, smoke and edges the AI tinted with the magenta background turn grey; wood, metal, clay and crystal are never
    // pink. Which columns of the sheet: all but the Sealed Vault's, whose rune is purple.
    untint: name => (x => name !== "loot" || Math.floor(x / (56 * 2)) !== LOOT_ORDER.indexOf("vault")),
    // The background's blue and red stay within about 12 of each other; the vault's purple rune has 30 more blue, so the
    // loot row takes only that as background.
    isBg: (r, g, b, name) => Math.min(r, b) > 40 && g < 0.45 * Math.min(r, b) && Math.abs(r - b) < 0.35 * Math.max(r, b)
      && (name !== "loot" || b - r < 20),
    variant: (name, w, h) => (name === "loot" ? { cols: LOOT_ORDER.length, perCell: LOOT_ORDER.map(id => LOOT_HEIGHT[id]) } : { cols: PROP_FRAMES[name] ?? Math.max(1, Math.round(w / h)) }),
  },
  // The camp's buildings and furniture, drawn apart from the empty cave so each stands on its own tiles (2026-10-15).
  // A row of things of different sizes, like the loot: each scaled to its own height. Violet and pink glows are part of
  // the art, so only true magenta is background and nothing is untinted.
  lobby: {
    raw: "art/lobby/sprites/", out: "public/lobby/", cols: 1, rows: 1, cellW: 224, cellH: 208, footX: 112, footY: 200, main: false,
    height: name => name === "curbs" ? 8 : 100, fixes: {}, textureScale: 1,
    isBg: (r, g, b) => Math.min(r, b) > 40 && g < 0.45 * Math.min(r, b) && Math.abs(r - b) < 0.35 * Math.max(r, b) && b - r < 20,
    variant: name => {
      if (name === "curbs") return { cols: CURB_ORDER.length, perCell: CURB_ORDER.map(id => CURB_HEIGHT[id]), uniformScale: true };
      const rows = { buildings: [BUILDING_ORDER, BUILDING_HEIGHT], furniture: [FURNITURE_ORDER, FURNITURE_HEIGHT],
        benches: [BENCH_ORDER, BENCH_HEIGHT], vault: [VAULT_ORDER, VAULT_HEIGHT], decor: [DECOR_ORDER, DECOR_HEIGHT] }[name];
      return rows ? { cols: rows[0].length, perCell: rows[0].map(id => rows[1][id]) } : null;
    },
  },
};

/** Perceptual palette distances, with linear sRGB input as specified by OKLab. No dithering or random choices. */
export function rgbToOklab([r, g, b]) {
  const linear = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  r = linear(r); g = linear(g); b = linear(b);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.793617785*m - 0.0040720468*s,
    1.9779984951*l - 2.428592205*m + 0.4505937099*s,
    0.0259040371*l + 0.7827717662*m - 0.808675766*s];
}
const labDistance = (a, b) => a.reduce((sum, n, i) => sum + (n - b[i]) ** 2, 0);
const fromHex = h => h.replace('#', '').match(/../g).map(v => parseInt(v, 16));
const toHex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

export function nearestMobColor(rgb, colors) {
  const lab = rgbToOklab(rgb);
  return colors.reduce((best, color) => labDistance(lab, rgbToOklab(color)) < labDistance(lab, rgbToOklab(best)) ? color : best);
}

/** One owner-made 5x3 sheet; exact 32px cells, shared mob palette, transparent clean matte. */
export async function writePerks(input='art/perks/raw/perks.webp',output='public/perks/perks.png'){
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true}),w=info.width,h=info.height;
  const palette=JSON.parse(readFileSync('art/palette/mobs.json','utf8')).colors.map(fromHex),atlas=Buffer.alloc(160*96*4);
  const bg=(x,y)=>x<0||y<0||x>=w||y>=h||!data[(y*w+x)*4+3]||isBg(...data.subarray((y*w+x)*4,(y*w+x)*4+3));
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const x0=Math.floor(col*w/5),x1=Math.floor((col+1)*w/5),y0=Math.floor(row*h/3),y1=Math.floor((row+1)*h/3);
    let left=x1,right=x0,top=y1,bottom=y0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(!bg(x,y)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left||bottom<top)throw new Error(`Empty perk icon at ${col+1},${row+1}`);
    const cw=right-left+1,ch=bottom-top+1,clean=Buffer.alloc(cw*ch*4);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      if(bg(x,y))continue;const p=(y*w+x)*4,edge=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>bg(x+dx,y+dy));let rgb=[data[p],data[p+1],data[p+2]];
      if(edge){const neighbours=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(!bg(x+dx,y+dy)){const n=((y+dy)*w+x+dx)*4;neighbours.push([...data.subarray(n,n+3)]);}rgb=cleanMobFringe(rgb,neighbours);}
      if(!rgb)continue;const q=nearestMobColor(rgb,palette),at=((y-top)*cw+x-left)*4;clean[at]=q[0];clean[at+1]=q[1];clean[at+2]=q[2];clean[at+3]=255;
    }
    const resized=await sharp(clean,{raw:{width:cw,height:ch,channels:4}}).resize(30,30,{fit:'inside',kernel:'nearest'}).raw().toBuffer({resolveWithObject:true});
    const ox=col*32+Math.floor((32-resized.info.width)/2),oy=row*32+Math.floor((32-resized.info.height)/2);
    for(let y=0;y<resized.info.height;y++)for(let x=0;x<resized.info.width;x++)resized.data.copy(atlas,((oy+y)*160+ox+x)*4,(y*resized.info.width+x)*4,(y*resized.info.width+x+1)*4);
  }
  await sharp(atlas,{raw:{width:160,height:96,channels:4}}).png().toFile(output);return{width:160,height:96,icons:15};
}

/** Derive a frozen palette from existing artwork, retaining small semantic accents before weighted clustering. */
export async function deriveMobPalette(mobDir = 'public/mobs') {
  const histogram = new Map();
  for (const path of [
    ...Object.keys(MOB_HEIGHT).map(id => `${mobDir}/${id}.png`),
    ...['catacombs', 'mycelium', 'cinderworks', 'hollowglass'].map(id => `public/tiles/${id}.png`),
  ]) {
    const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const weight = path.includes('/tiles/') ? 0.15 : 1;
    for (let p = 0; p < data.length; p += 8) {
      if (!data[p + 3]) continue;
      const c = [data[p], data[p + 1], data[p + 2]];
      if (isBg(...c)) continue;
      const key = c.map(v => v >> 3).join(',');
      const point = histogram.get(key) ?? { rgb: c, weight: 0, lab: rgbToOklab(c) };
      point.weight += weight; histogram.set(key, point);
    }
  }
  const points = [...histogram.values()];
  const accents = [[14,12,20], [249,243,222], [255,238,139], [255,148,18], [244,69,28], [255,30,27],
    [91,235,235], [58,155,255], [190,244,255], [226,168,87], [106,73,47], [127,157,46], [133,80,144],
    [137,142,132], [187,187,172], [83,89,82], [48,57,68], [235,255,255]];
  const chosen = accents.map(c => points.reduce((a,b) => labDistance(rgbToOklab(c),a.lab) < labDistance(rgbToOklab(c),b.lab) ? a : b));
  const centers = chosen.map(p => [...p.lab]);
  while (centers.length < 32) {
    const p = points.reduce((a,b) => {
      const score = p => Math.min(...centers.map(c => labDistance(p.lab,c))) * Math.sqrt(p.weight);
      return score(a) > score(b) ? a : b;
    }); centers.push([...p.lab]);
  }
  for (let iteration = 0; iteration < 12; iteration++) {
    const sums = centers.map(() => [0,0,0,0]);
    for (const p of points) {
      let best = 0; centers.forEach((c,i) => { if (labDistance(p.lab,c) < labDistance(p.lab,centers[best])) best = i; });
      p.lab.forEach((v,i) => sums[best][i] += v*p.weight); sums[best][3] += p.weight;
    }
    for (let i = accents.length; i < centers.length; i++) if (sums[i][3]) centers[i] = sums[i].slice(0,3).map(v => v/sums[i][3]);
  }
  const colors = centers.map(c => toHex(points.reduce((a,b) => labDistance(c,a.lab) < labDistance(c,b.lab) ? a : b).rgb));
  return { version: 1, space: 'OKLab', colors, outline: colors[0], texturePixel: 1,
    derivation: 'Existing nine baseline mob PNGs (weight 1) and four tile atlases (weight 0.15). Eighteen locked nearest-source accents/neutral shades, fourteen weighted OKLab clusters; frozen for reproducibility.',
    accents: ['outline', 'bone/wax', 'flame highlight', 'orange eyes/fire', 'red fire', 'spider eyes', 'golem cyan', 'wisp blue', 'wisp highlight', 'moth wings', 'moth/bow brown', 'moss', 'spider violet', 'stone mid', 'stone light', 'stone shade', 'cool stone shade', 'cold white'],
    keepOriginal: {} };
}

/** Edge periodicity estimates the source's block SIZE independently of the requested in-game body height. */
export function detectMobGrid(data, w, h, boxes, fallback = 8) {
  const profiles = boxes.map(box => {
    const xs = new Float64Array(w), ys = new Float64Array(h);
    for (let y = Math.max(1,box.y0); y <= Math.min(h-1,box.y1); y++) for (let x = Math.max(1,box.x0); x <= Math.min(w-1,box.x1); x++) {
      const p = (y*w+x)*3, here = [data[p],data[p+1],data[p+2]];
      if (isBg(...here)) continue;
      for (const [prev,profile,k] of [[p-3,xs,x],[p-w*3,ys,y]]) {
        if (isBg(data[prev],data[prev+1],data[prev+2])) continue;
        const edge = Math.sqrt(here.reduce((n,v,i) => n+(v-data[prev+i])**2,0));
        if (edge > 34) profile[k] += Math.min(90, edge-34);
      }
    }
    return [xs,ys];
  });
  const wave = (profile, size) => {
    let re=0,im=0,total=0;
    for (let i=0;i<profile.length;i++) if (profile[i]) { const a=2*Math.PI*i/size; re+=profile[i]*Math.cos(a);im+=profile[i]*Math.sin(a);total+=profile[i]; }
    return { score: total ? Math.hypot(re,im)/total : 0, offset: ((Math.atan2(im,re)*size/(2*Math.PI))%size+size)%size };
  };
  let size=fallback, confidence=-1;
  for (let candidate= Math.max(3, fallback*0.5); candidate <= Math.min(32,fallback*2); candidate+=0.25) {
    const score=profiles.reduce((n,axes) => n+axes.reduce((sum,p)=>sum+wave(p,candidate).score,0),0)/(2*profiles.length);
    // Harmonics can have equal strength: prefer the full block period over its half/quarter subdivisions.
    if(score>confidence+1e-6 || (Math.abs(score-confidence)<1e-6&&candidate>size)){confidence=score;size=candidate;}
  }
  if (confidence < 0.045) size=fallback;
  return { size, confidence, phases: profiles.map(axes=>axes.map(p=>wave(p,size).offset)) };
}

/** Mob-only matte cleanup: a saturated pink edge borrows a real neighbouring colour, never the backdrop. */
export function cleanMobFringe(rgb, neighbours) {
  const [r,g,b] = rgb;
  if (Math.min(r,b)-g < 18 || b < r*0.6 || r < b*0.65) return rgb;
  const safe=neighbours.filter(c=>!isBg(...c) && Math.min(c[0],c[2])-c[1] < 16);
  if(!safe.length)return null;
  // Keep genuine violet interiors; only the caller's boundary pixels enter this function.
  return safe.reduce((a,c)=>labDistance(rgbToOklab(rgb),rgbToOklab(a)) < labDistance(rgbToOklab(rgb),rgbToOklab(c))?a:c);
}

function styledMob(name, data, w, h, cells, body, feetX, bottom, mine) {
  const palette = JSON.parse(readFileSync('art/palette/mobs.json','utf8'));
  if (palette.keepOriginal[name]) {
    throw new Error(`Preserved original ${name}: use its checked-in approval asset, not an automatic replacement.`);
  }
  const colors=palette.colors.map(fromHex), labs=colors.map(rgbToOklab), ink=fromHex(palette.outline);
  const quantized=new Map();
  const quantize=c=>{const key=c.map(Math.round).join(',');let got=quantized.get(key);if(got)return got;
    const lab=rgbToOklab(c);let best=0;labs.forEach((l,i)=>{if(labDistance(l,lab)<labDistance(labs[best],lab))best=i;});got=colors[best];quantized.set(key,got);return got;};
  const density=2,scale=(body[0].y1-body[0].y0+1)/(MOB_HEIGHT[name]*density);
  const grid=detectMobGrid(data,w,h,body,scale*density);
  const cellW=96*density,cellH=56*density,width=cellW*4,logical=Buffer.alloc(width*cellH*4);
  for(let cell=0;cell<4;cell++){
    const [fx,fy]=grid.phases[cell];
    // Subdivide the measured art blocks at texture density. Never collapse a face to the coarse native block grid.
    const sub=grid.size/Math.max(1,Math.round(grid.size/scale));
    const sampleWidth=Math.min(scale*0.8,sub*0.85);
    const snap=(v,offset)=>{const at=offset+(Math.floor((v-offset)/sub)+0.5)*sub;return v+Math.max(-scale*0.18,Math.min(scale*0.18,at-v));};
    const colorAt=(sx,sy)=>{
      const left=snap(sx,fx)-sampleWidth/2,top=snap(sy,fy)-sampleWidth/2,counts=new Map();
      let total=0,figure=0;
      for(let y=Math.floor(top);y<Math.floor(top+sampleWidth);y++)for(let x=Math.floor(left);x<Math.floor(left+sampleWidth);x++){
        if(x<0||y<0||x>=w||y>=h)continue;total++;
        const p=y*w+x;if(!mine(p,cell))continue;figure++;
        const c=[data[p*3],data[p*3+1],data[p*3+2]],q=c.map(v=>v>>3).join(',');
        const a=counts.get(q)??{rgb:[0,0,0],n:0};c.forEach((v,i)=>a.rgb[i]+=v);a.n++;counts.set(q,a);
      }
      let result=null;
      if(figure>=total*0.38&&counts.size){const best=[...counts.values()].sort((a,b)=>b.n-a.n)[0];result=best.rgb.map(v=>Math.round(v/best.n));}
      return result;
    };
    for(let y=0;y<cellH;y++)for(let x=0;x<cellW;x++){
      const sx=feetX[cell]+(x-32*density+0.5)*scale,sy=bottom(cell)+1+(y-52*density-0.5)*scale;
      if(sx<cells[cell].x0-grid.size||sx>cells[cell].x1+grid.size||sy>bottom(cell)+scale*0.25)continue;
      const c=colorAt(sx,sy);if(!c)continue;
      const p=(y*width+cell*cellW+x)*4;c.forEach((v,i)=>logical[p+i]=v);logical[p+3]=255;
    }
    // Process the whole outline from an immutable copy, so neighbouring edits cannot propagate through a face.
    const source=Buffer.from(logical),point=(x,y)=> (y*width+cell*cellW+x)*4;
    const alpha=(x,y)=>x>=0&&y>=0&&x<cellW&&y<cellH&&source[point(x,y)+3]>0;
    for(let y=0;y<cellH;y++)for(let x=0;x<cellW;x++){
      const p=point(x,y);if(!source[p+3])continue;
      const edge=[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!alpha(x+dx,y+dy));
      const neighbours=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(alpha(x+dx,y+dy)){
        const q=point(x+dx,y+dy);neighbours.push([source[q],source[q+1],source[q+2]]);
      }
      let c=[source[p],source[p+1],source[p+2]];
      if(edge)c=cleanMobFringe(c,neighbours);
      if(!c){logical[p+3]=0;continue;}
      // Bright flame tips, sparks and luminous wisps keep an emissive edge; solid bodies share one inward pixel of ink.
      const emissive=(name==='needle-wraith') || (c[0]>185&&c[1]>115&&c[2]<140&&y<(52-MOB_HEIGHT[name]+8)*density);
      let immediate=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(alpha(x+dx,y+dy))immediate++;
      if(edge&&!emissive&&immediate>=5)c=ink;
      else c=quantize(c);
      c.forEach((v,i)=>logical[p+i]=v);
    }
  }
  console.log(`  grid ${name}: ${grid.size.toFixed(2)} source px, confidence ${grid.confidence.toFixed(3)}, 0.5 logical px / 1 texture px`);
  return {data:logical,width,height:cellH,scale,grid};
}

async function rasterize(name, logical, density = 1) {
  const { data, info } = await sharp(logical.raw + name + ".webp").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  // A variant (the loot row, a single-frame prop) has its own number of columns and maybe a height for each cell.
  const variant = logical.variant?.(name, w, h) ?? null;
  const k = { ...logical, cols: variant?.cols ?? logical.cols, cellW: logical.cellW * density, cellH: logical.cellH * density,
    footX: logical.footX * density, footY: logical.footY * density, height: n => logical.height(n) * density };
  const background = k.isBg ?? isBg;
  const bg = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) bg[p] = background(data[p * 3], data[p * 3 + 1], data[p * 3 + 2], name) ? 1 : 0;

  // 8-connected blobs of figure pixels; each blob belongs to the grid cell its centre falls in.
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const blobs = [];
  for (let p = 0; p < w * h; p++) {
    if (bg[p] || label[p] >= 0) continue;
    const id = blobs.length;
    let top = 0, size = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[top++] = p; label[p] = id;
    while (top) {
      const q = stack[--top], x = q % w, y = (q - x) / w;
      size++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const r = ny * w + nx;
        if (!bg[r] && label[r] < 0) { label[r] = id; stack[top++] = r; }
      }
    }
    const col = Math.min(k.cols - 1, Math.floor((sx / size) / (w / k.cols)));
    const row = Math.min(k.rows - 1, Math.floor((sy / size) / (h / k.rows)));
    blobs.push({ size, x0, x1, y0, y1, cell: row * k.cols + col });
  }

  // A row of things of different widths (the loot) is not evenly spaced: when the gaps between the big blobs split it
  // into exactly as many groups as cells, each blob goes to the group it stands over, or the nearest one.
  if (variant?.perCell && k.rows === 1) {
    const groups = [];
    for (const b of blobs.filter(b => b.size >= 30).sort((a, b) => a.x0 - b.x0)) {
      const last = groups[groups.length - 1];
      if (last && b.x0 <= last.x1 + 2) last.x1 = Math.max(last.x1, b.x1);
      else groups.push({ x0: b.x0, x1: b.x1 });
    }
    if (groups.length === k.cols) for (const b of blobs) {
      const mid = (b.x0 + b.x1) / 2;
      const away = g => (mid < g.x0 ? g.x0 - mid : mid > g.x1 ? mid - g.x1 : 0);
      b.cell = groups.reduce((best, g, i) => (away(g) < away(groups[best]) ? i : best), 0);
    }
  }

  // Per cell: the box of its blobs (specks under 30 pixels are noise). For a mob, the feet are those of its biggest
  // blob, its body, so a flying arrow or a cloud of spores does not move where it stands.
  const n = k.cols * k.rows;
  const cells = Array.from({ length: n }, () => ({ x0: w, x1: 0, y0: h, y1: 0, main: -1 }));
  const keep = new Uint8Array(blobs.length);
  blobs.forEach((b, i) => {
    if (b.size < 30) return;
    keep[i] = 1;
    const c = cells[b.cell];
    c.x0 = Math.min(c.x0, b.x0); c.x1 = Math.max(c.x1, b.x1); c.y0 = Math.min(c.y0, b.y0); c.y1 = Math.max(c.y1, b.y1);
    if (c.main < 0 || b.size > blobs[c.main].size) c.main = i;
  });
  const body = cells.map(c => (k.main && c.main >= 0 ? blobs[c.main] : c));
  // Frames drawn on one baseline (a prop breaking apart: its pieces fly up, the floor stays) keep the first one's.
  const bottom = cell => (k.sameBaseline && !variant?.perCell ? body[0].y1 : body[cell].y1);
  const mine = (p, cell) => !bg[p] && keep[label[p]] && blobs[label[p]].cell === cell;
  const feetX = body.map((c, cell) => {
    // The middle of the figure in its lowest eighth: the boots.
    let sum = 0, count = 0;
    for (let y = Math.round(c.y1 - (c.y1 - c.y0) / 8); y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      const p = y * w + x;
      if (mine(p, cell) && (!k.main || label[p] === cells[cell].main)) { sum += x; count++; }
    }
    return count ? sum / count : (c.x0 + c.x1) / 2;
  });
  if (logical.out === 'public/mobs/') return styledMob(name,data,w,h,cells,body,feetX,bottom,mine);
  // One scale for the whole sheet, from the first frame (standing, facing the viewer or to the right).
  const s0 = (body[0].y1 - body[0].y0 + 1) / k.height(name);
  /** Source pixels per game pixel: one scale for the whole sheet, or each cell's own in a variant. */
  const scaleOf = cell => (variant?.perCell && !variant.uniformScale ? (body[cell].y1 - body[cell].y0 + 1) / (variant.perCell[cell] * density) : s0);

  const sheetW = k.cellW * k.cols;
  const out = Buffer.alloc(sheetW * k.cellH * k.rows * 4);

  /**
   * The colour of the game pixel (tx, ty) of a cell, with the block grid shifted by (fx, fy) source pixels, and how
   * much of the block's middle that colour covers (1 is a clean block). The AI's own pixels are about the size of a
   * block but not on a grid of ours; sampling only the middle of each block, on the shift where blocks come out
   * cleanest, keeps small things like the pupils and the shine in the eyes.
   */
  const sample = (cell, tx, ty, fx, fy, inner = true) => {
    const s = scaleOf(cell);
    const bx0 = feetX[cell] + (tx - k.footX) * s + fx, by0 = bottom(cell) + 1 + (ty - k.footY - 1) * s + fy;
    const m = inner ? s * 0.15 : 0;
    const counts = new Map();
    let total = 0, figure = 0, dark = 0, dr = 0, dg = 0, db = 0;
    for (let y = Math.floor(by0 + m); y < Math.floor(by0 + s - m); y++) for (let x = Math.floor(bx0 + m); x < Math.floor(bx0 + s - m); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      total++;
      const p = y * w + x;
      if (!mine(p, cell)) continue;
      figure++;
      const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
      if (r + g + b < 150) { dark++; dr += r; dg += g; db += b; }
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const e = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      counts.set(key, e);
    }
    if (!total || figure < total * 0.4) return null;
    // At the old size, prefer thin outlines; at 2x, majority sampling retains the iris and eye highlight.
    if (dark >= total * (density > 1 ? 0.5 : 0.25)) return { color: [dr / dark, dg / dark, db / dark], clean: dark / total };
    let best = null;
    for (const e of counts.values()) if (!best || e.n > best.n) best = e;
    return { color: [best.r / best.n, best.g / best.n, best.b / best.n], clean: best.n / total };
  };

  for (let cell = 0; cell < n; cell++) {
    const ox = (cell % k.cols) * k.cellW, oy = Math.floor(cell / k.cols) * k.cellH;
    // The shift of the grid that gives the cleanest blocks over this frame.
    let shift = [0, 0], cleanest = -1;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const fx = (i - 1.5) * scaleOf(cell) / 4, fy = (j - 1.5) * scaleOf(cell) / 4;
      let sum = 0, count = 0;
      for (let ty = 0; ty < k.cellH; ty++) for (let tx = 0; tx < k.cellW; tx++) {
        const got = sample(cell, tx, ty, fx, fy);
        if (got) { sum += got.clean; count++; }
      }
      const score = count ? sum / count : 0;
      if (score > cleanest) { cleanest = score; shift = [fx, fy]; }
    }
    for (let ty = 0; ty < k.cellH; ty++) for (let tx = 0; tx < k.cellW; tx++) {
      const got = sample(cell, tx, ty, shift[0], shift[1]);
      if (!got) continue;
      const o = ((oy + ty) * sheetW + ox + tx) * 4;
      out[o] = Math.round(got.color[0]); out[o + 1] = Math.round(got.color[1]); out[o + 2] = Math.round(got.color[2]); out[o + 3] = 255;
    }
  }
  return { data: out, width: sheetW, height: k.cellH * k.rows, scale: s0 };
}

/** Assemble exact 32px curb joins from the rasterized source. No new stone pixels are painted here. */
function normalizeCurbs(sheet, k) {
  const source = sheet.data, out = Buffer.alloc(source.length);
  for (let cell = 0; cell < CURB_ORDER.length; cell++) {
    let left = k.cellW, right = -1, top = k.cellH, bottom = -1;
    const at = (x, y) => (y * sheet.width + cell * k.cellW + x) * 4;
    for (let y = 0; y < k.cellH; y++) for (let x = 0; x < k.cellW; x++) if (source[at(x,y)+3]) {
      left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y);
    }
    if (right < left) throw Error(`Missing curb sprite ${cell}`);
    const sw = right-left+1, sh = bottom-top+1;
    const w = cell === 1 || cell === 5 ? 8 : 32, h = CURB_HEIGHT[CURB_ORDER[cell]];
    const ox = k.footX-w/2, oy = k.footY-h+1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // Retain the endcaps on the last two pieces; extend only the straight middle rows/columns.
      const fit = (p, size, target, end) => {
        if (size >= target) return p+(end?size-target:0);
        const middle = Math.floor(size/2), extra = target-size;
        return p < middle ? p : p < middle+extra ? middle : p-extra;
      };
      let sx = fit(x,sw,w,cell === 4), sy = fit(y,sh,h,cell === 5);
      // The inner source is a top-right bend; the atlas convention is top-left for both corner kinds.
      if (cell === 3) sx = sw-1-sx;
      const src = at(left+sx,top+sy), dst = ((oy+y)*sheet.width+cell*k.cellW+ox+x)*4;
      source.copy(out,dst,src,src+4);
    }
  }
  return { ...sheet, data: out };
}

async function convert(name, k) {
  const density = k.textureScale ?? 1;
  let sheet = await rasterize(name, k, density);
  if (name === "curbs" && k.out === "public/lobby/") sheet = normalizeCurbs(sheet,k);
  const untinted = k.untint?.(name);
  if (untinted) {
    const d = sheet.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (!d[i + 3] || Math.min(r, b) - g < 24 || !untinted((i / 4) % sheet.width)) continue;
      const grey = Math.round(0.6 * g + 0.2 * (r + b));
      d[i] = grey + 6; d[i + 1] = grey + 2; d[i + 2] = grey;
    }
  }
  if (k.fixes[name]) {
    if (density === 1) k.fixes[name](sheet.data);
    else {
      // Preserve the already-approved rear cat frames exactly. Their tail/leg fixes are tied to the old pixel grid;
      // rerunning the heuristic at 2x can mistake a paw or the coat for a tail. Front/profile eyes keep the 2x source.
      const back = await rasterize(name, k);
      k.fixes[name](back.data);
      for (let y = 3 * k.cellH; y < back.height; y++) for (let x = 0; x < back.width; x++) {
        const i = (y * back.width + x) * 4;
        for (let dy = 0; dy < density; dy++) for (let dx = 0; dx < density; dx++) {
          const d = ((y * density + dy) * sheet.width + x * density + dx) * 4;
          back.data.copy(sheet.data, d, i, i + 4);
        }
      }
      if (name === "cat-ginger-tabby") recolorTips(sheet.data, [
        { x0: 42, x1: 60, y0: 22, y1: 40 }, { x0: 40, x1: 62, y0: 20, y1: 46 },
        { x0: 2, x1: 21, y0: 26, y1: 46 }, { x0: 0, x1: 0, y0: 0, y1: 0 },
      ], [236, 140, 48], [196, 98, 30], density);
    }
  }
  mkdirSync(k.out, { recursive: true });
  const png = density > 1 ? { palette: true, colours: 256, dither: 0, effort: 7 } : {};
  await sharp(sheet.data, { raw: { width: sheet.width, height: sheet.height, channels: 4 } }).png(png).toFile(k.out + name + ".png");
  console.log(name, "texture", density + "x", "scale 1/" + sheet.scale.toFixed(2));
}

/** Read-only regeneration for tests; the CLI remains the sole writer of runtime mob strips. */
export async function buildMobSheet(name) {
  if (!(name in MOB_HEIGHT)) throw new Error(`Unknown mob: ${name}`);
  return rasterize(name,KINDS.mobs,2);
}

// Importing the exported dimensions in tests must not regenerate unrelated artwork.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [kind, only] = process.argv.slice(2);
  for (const [id, k] of Object.entries(KINDS)) {
    if (kind && kind !== id) continue;
    if(id==='perks'){
      if(existsSync(k.raw+'perks.webp')){mkdirSync(k.out,{recursive:true});await writePerks(k.raw+'perks.webp',k.out+'perks.png');}
      else if(kind==='perks')console.log('No art/perks/raw/perks.webp yet; the game uses its temporary distinct perk icons.');
      continue;
    }
    if (!existsSync(k.raw)) continue;
    if (id === "tiles") {
      if (!only || only === "catacombs" || only === "catacombs-v5") {
        mkdirSync(k.out, { recursive: true });
        await writeTiles(k.raw + "catacombs-v5.webp", k.out + "catacombs.png");
      }
      if (!only || only === "mycelium" || only === "mycelium-v1") {
        mkdirSync(k.out, { recursive: true });
        await writeTiles(k.raw + "mycelium-v1.webp", k.out + "mycelium.png", "mycelium");
      }
      for (const theme of ["cinderworks", "hollowglass"]) if (!only || only === theme || only === `${theme}-v1`) {
        mkdirSync(k.out, { recursive: true });
        await writeTiles(k.raw + `${theme}-v1.webp`, k.out + `${theme}.png`, theme);
      }
      continue;
    }
    for (const f of readdirSync(k.raw)) {
      const name = f.replace(/\.webp$/, "");
      if (!only || only === name) await convert(name, k);
    }
  }
}
