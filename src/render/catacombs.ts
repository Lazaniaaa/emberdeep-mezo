import { footprint, idx, tileHash, type Floor } from "@/game/dungeon";
import type { RunState } from "@/game/run";
import { loadSheet } from "./sheets";

const SIZE = 32, SAVE_KEY = "emberdeep-catacombs-decor-v1";
export const usesCatacombsTiles = (depth: number) => depth === 1 || depth === 2;

/** A face occupies the wall cell itself, never the floor in front of it. */
export function catacombsRow(floor: Pick<Floor, "tiles" | "w" | "h">, x: number, y: number) {
  if (floor.tiles[y * floor.w + x] === 1) return 0;
  return y + 1 < floor.h && floor.tiles[(y + 1) * floor.w + x] === 1 ? 2 : 1;
}

export function decorOccupants(floor: Floor) {
  return new Set([
    idx(floor, floor.spawn.x, floor.spawn.y), idx(floor, floor.stairs.x, floor.stairs.y),
    ...(floor.props ?? []).map(p => idx(floor, p.x, p.y)), ...floor.items.map(p => idx(floor, p.x, p.y)),
    ...floor.dimlings.flatMap(d => footprint(d).map(p => idx(floor, p.x, p.y))),
  ]);
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
/** Visual history only. Keep initial spawns reserved after movement, breaking props and a tab reload. */
export class CatacombsDecor {
  blocked: ReadonlySet<number> | null = null;
  private storage: StorageLike | undefined;

  constructor(run: RunState, storage?: StorageLike) {
    try { this.storage = storage ?? globalThis.sessionStorage; } catch { /* Storage can be disabled. */ }
    this.reset(run, run.steps === 0);
  }

  reset(run: RunState, fresh: boolean) {
    this.blocked = null;
    if (!usesCatacombsTiles(run.depth)) return;
    const f = run.floor, key = `${run.runId ?? ""}:${run.seed}:${run.depth}:${f.w}:${f.h}`;
    if (!fresh) try {
      const saved: unknown = JSON.parse(this.storage?.getItem(SAVE_KEY) ?? "null");
      if (saved && typeof saved === "object" && "key" in saved && saved.key === key && "cells" in saved
        && Array.isArray(saved.cells) && saved.cells.length <= f.tiles.length
        && saved.cells.every(n => Number.isInteger(n) && n >= 0 && n < f.tiles.length)) {
        this.blocked = new Set<number>(saved.cells);
        return;
      }
    } catch { /* Unknown old spawns: omit floor decorations until the next fresh floor. */ }
    if (!fresh) return;
    this.blocked = decorOccupants(f);
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify({ key, cells: [...this.blocked] })); } catch { /* Optional visuals. */ }
  }
}

/** Immutable visual selection: row 3 decorations only on empty, non-reserved floor cells. */
export function catacombsDecorAt(floor: Floor, x: number, y: number, reserved: ReadonlySet<number> | null, occupied: ReadonlySet<number>) {
  const k = idx(floor, x, y);
  if (floor.tiles[k] !== 1 || !reserved || reserved.has(k) || occupied.has(k)) return null;
  const h = tileHash(x + floor.depth * 137, y + 73);
  return h % 13 === 0 ? (h >>> 8) % 4 : null;
}

export function drawCatacombsCell(ctx: CanvasRenderingContext2D, floor: Floor, x: number, y: number,
  lit: boolean, reserved: ReadonlySet<number> | null, occupied: ReadonlySet<number>) {
  const sheet = loadSheet("tiles/catacombs.png"), row = catacombsRow(floor, x, y);
  const variant = tileHash(x + floor.depth * 137, y) % 4, px = x * SIZE, py = y * SIZE;
  if (sheet) {
    ctx.drawImage(sheet.image, variant * SIZE, row * SIZE, SIZE, SIZE, px, py, SIZE, SIZE);
    const decor = catacombsDecorAt(floor, x, y, reserved, occupied);
    if (decor !== null) ctx.drawImage(sheet.image, decor * SIZE, 3 * SIZE, SIZE, SIZE, px, py, SIZE, SIZE);
    // A wall attachment occupies only its face cell; gates remain closed visual niches, not exits.
    if (row === 2 && tileHash(x, y + 179) % 5 === 0) {
      const attachment = tileHash(x + 53, y) % 5 === 0 ? 1 : 0;
      ctx.drawImage(sheet.image, attachment * SIZE, 4 * SIZE, SIZE, SIZE, px, py, SIZE, SIZE);
    }
  } else {
    // Loading/missing-asset fallback still obeys full 32px cells. No old painting or partial wall footprint.
    ctx.fillStyle = row === 0 ? "#195165" : row === 2 ? "#183442" : "#0b1425";
    ctx.fillRect(px, py, SIZE, SIZE);
    ctx.strokeStyle = "#0B1A24"; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, SIZE - 2, SIZE - 2);
  }
  if (!lit) { ctx.fillStyle = "rgba(0,0,0,0.48)"; ctx.fillRect(px, py, SIZE, SIZE); }
}
