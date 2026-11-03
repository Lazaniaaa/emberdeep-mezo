import type { ArmorId, ClassId, PotionId, Rarity, WeaponId } from "@/game/catalog";
import { SPRITE_SIZE, type Sprite } from "./pixel-art";

// Every icon and portrait is drawn in code: a 16x16 grid of palette letters.

const EMPTY = ".".repeat(SPRITE_SIZE);

type Grid = string[][];
const blank = (): Grid => Array.from({ length: SPRITE_SIZE }, () => Array<string>(SPRITE_SIZE).fill("."));

function put(g: Grid, x: number, y: number, ch: string) {
  if (x >= 0 && y >= 0 && x < SPRITE_SIZE && y < SPRITE_SIZE) g[y][x] = ch;
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string, thick = false) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(g, x0, y0, ch);
    if (thick) put(g, x0 - 1, y0, ch);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Wraps every painted cell in a dark outline so the icon reads on any background. */
function outline(g: Grid) {
  const out = g.map(r => [...r]);
  for (let y = 0; y < SPRITE_SIZE; y++) for (let x = 0; x < SPRITE_SIZE; x++) {
    if (g[y][x] !== ".") continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y + dy]?.[x + dx] ?? ".") !== ".");
    if (near) out[y][x] = "k";
  }
  return out.map(r => r.join(""));
}

function blade(steel: string, shine: string, tip: [number, number], base: [number, number]) {
  const g = blank();
  line(g, tip[0], tip[1], base[0], base[1], steel, true);
  line(g, tip[0], tip[1], base[0], base[1], shine);
  return g;
}

function sword(steel: string, shine: string, guard: string, grip: string, tip: [number, number], base: [number, number]) {
  const g = blade(steel, shine, tip, base);
  // The guard runs across the blade; the grip continues along it.
  line(g, base[0] - 2, base[1] - 2, base[0] + 2, base[1] + 2, guard);
  line(g, base[0] - 1, base[1] + 1, base[0] - 4, base[1] + 4, grip);
  put(g, base[0] - 5, base[1] + 5, guard);
  return outline(g);
}

const FIST: Sprite = [
  "................", "................", "....kkkkkkk.....", "...knnnnnnnk....", "..knnNnNnNnnk...",
  "..knnnnnnnnnk...", "..knNnNnNnnnk...", "..knnnnnnnnnkk..", "...knnnnnnnnk...", "....kNNNNNnk....",
  ".....kkkkkk.....", EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
];

const ARMOR_TEMPLATE = [
  "................",
  "..kkk......kkk..",
  ".kMMMk....kMMMk.",
  ".kMLMMkkkkMMLMk.",
  ".kMMMMMTTMMMMMk.",
  "..kMMMMTTMMMMk..",
  "..kMLMMMMMMLMk..",
  "..kMMMLMMLMMMk..",
  "..kMMMMMMMMMMk..",
  "..kMDMMMMMMDMk..",
  "..kMMDDDDDDMMk..",
  "...kMMMMMMMMk...",
  "....kkkkkkkk....",
  EMPTY, EMPTY, EMPTY,
];

const recolor = (rows: readonly string[], map: Record<string, string>) =>
  rows.map(row => [...row].map(ch => map[ch] ?? ch).join(""));

const BOTTLE = [
  EMPTY,
  "......kkkk......",
  ".....kBBBBk.....",
  "......kwwk......",
  "......kwwk......",
  ".....kwwwwk.....",
  "....kwFFFFwk....",
  "...kwFFFFFFwk...",
  "...kwFFFFFFwk...",
  "...kwFFFFFFwk...",
  "...kwFFDDFFwk...",
  "...kwFDDDDFwk...",
  "....kwDDDDwk....",
  ".....kkkkkk.....",
  EMPTY, EMPTY,
];

/** A glass bottle of `fill` liquid with a 4x4 mark in white where '#' is set. */
function potion(fill: string, dark: string, mark: readonly string[]): Sprite {
  const rows = recolor(BOTTLE, { F: fill, D: dark });
  return rows.map((row, y) => {
    const my = y - 7;
    if (my < 0 || my > 3) return row;
    return [...row].map((ch, x) => (x >= 6 && x <= 9 && mark[my][x - 6] === "#" ? "w" : ch)).join("");
  });
}

export const ITEM_ART: Record<WeaponId | Exclude<ArmorId, "none"> | PotionId, Sprite> = {
  fists: FIST,
  dagger: sword("s", "w", "y", "B", [13, 2], [7, 8]),
  sword: sword("s", "w", "y", "B", [14, 1], [6, 9]),
  emberblade: sword("o", "y", "y", "B", [14, 1], [6, 9]),
  leather: recolor(ARMOR_TEMPLATE, { M: "b", L: "n", D: "B", T: "y" }),
  chain: recolor(ARMOR_TEMPLATE, { M: "S", L: "w", D: "G", T: "s" }),
  emberplate: recolor(ARMOR_TEMPLATE, { M: "r", L: "o", D: "R", T: "y" }),
  nightVision: potion("v", "V", [".##.", "#...", "#...", ".##."]),
  oil: potion("y", "Y", [".##.", "####", "####", ".##."]),
  flare: potion("o", "R", ["#..#", ".##.", ".##.", "#..#"]),
  ward: potion("c", "C", ["####", "####", "####", ".##."]),
  rage: potion("r", "R", [".#..", "##.#", "####", ".##."]),
  regen: potion("e", "E", [".##.", "####", ".##.", ".##."]),
  heal: potion("p", "P", ["##.#", "####", ".##.", "..#."]),
};

export type ItemArtId = keyof typeof ITEM_ART;

// ---------------------------------------------------------------- found weapons (EmberItems), until the drawn icons land

/** A wooden haft from the bottom-left corner toward `top`. */
function haft(top: [number, number]): Grid {
  const g = blank();
  line(g, 2, 13, top[0], top[1], "B", true);
  line(g, 2, 13, top[0], top[1], "b");
  return g;
}

function pickaxe(): Sprite {
  const g = haft([10, 5]);
  // A curved two-pointed head across the top of the haft.
  line(g, 6, 3, 9, 3, "S"); line(g, 9, 3, 12, 5, "S"); line(g, 12, 5, 13, 8, "S");
  line(g, 7, 2, 10, 2, "s"); line(g, 10, 2, 13, 4, "s"); line(g, 13, 4, 14, 8, "s");
  put(g, 5, 4, "s"); put(g, 14, 9, "s");
  return outline(g);
}

function axe(): Sprite {
  const g = haft([11, 4]);
  // A broad single blade on the right of the haft's head.
  for (let y = 1; y <= 8; y++) for (let x = 10; x <= 14; x++) {
    if (x - 10 + Math.abs(y - 4.5) <= 5) put(g, x, y, x >= 13 ? "w" : "s");
  }
  line(g, 10, 1, 10, 8, "S");
  return outline(g);
}

function spear(): Sprite {
  const g = blank();
  line(g, 1, 14, 11, 4, "B", true);
  line(g, 1, 14, 11, 4, "b");
  // A leaf-shaped head past the shaft.
  line(g, 11, 4, 14, 1, "s", true);
  put(g, 12, 2, "s"); put(g, 13, 3, "s"); put(g, 11, 3, "w"); put(g, 12, 4, "S"); put(g, 15, 0, "w");
  return outline(g);
}

/** Code icons for the four found-weapon kinds, in the order the chain numbers them. */
export const FOUND_ART: readonly Sprite[] = [pickaxe(), axe(), sword("s", "w", "y", "B", [14, 1], [6, 9]), spear()];

// ---------------------------------------------------------------- Delver portraits

const PORTRAIT = [
  EMPTY,
  "....hhhhhhhh....",
  "...hHHHHHHHHh...",
  "..hHHHHHHHHHHh..",
  "..hHHnnnnnnHHh..",
  "..hHnknnnnknHh..",
  "...nnnnnnnnnn...",
  "...nnnnNNnnnn...",
  "....nnkkkknn....",
  ".....nnnnnn.....",
  "...kOOOOOOOOk...",
  "..kOOOoOOoOOOk..",
  ".kOOOAOOOOAOOOk.",
  ".kOOOOOOOOOOOOk.",
  ".kkkkkkkkkkkkkk.",
  EMPTY,
];

const OUTFIT: Record<ClassId | "wanderer", { h: string; H: string; O: string; o: string; A: string }> = {
  wanderer: { h: "B", H: "b", O: "g", o: "G", A: "y" },
  prospector: { h: "Y", H: "y", O: "b", o: "B", A: "y" },
  seer: { h: "C", H: "c", O: "v", o: "V", A: "c" },
  lamplighter: { h: "Y", H: "o", O: "y", o: "Y", A: "w" },
  pathfinder: { h: "E", H: "e", O: "E", o: "B", A: "l" },
  duelist: { h: "R", H: "r", O: "S", o: "G", A: "w" },
  scavenger: { h: "V", H: "v", O: "B", o: "k", A: "y" },
};

/** A bust of the class. Higher rarities add a gem or a crown so a Delver's tier shows in the picture. */
export function portraitArt(kind: ClassId | "wanderer", rarity: Rarity = "common"): Sprite {
  const map = OUTFIT[kind];
  const rows = recolor(PORTRAIT, { h: map.h, H: map.H, O: map.O, o: map.o, A: map.A });
  const set = (r: number, c: number, ch: string) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
  if (rarity === "epic") { set(3, 7, "p"); set(3, 8, "p"); }
  if (rarity === "legendary") {
    for (const c of [4, 7, 8, 11]) set(0, c, "y");
    for (const c of [5, 6, 7, 8, 9, 10]) set(1, c, "y");
  }
  return rows;
}
