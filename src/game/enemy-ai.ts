import { enemyDef } from "./enemies";
import { isFloor, type Dimling, type Floor, type Point } from "./dungeon";

const DIRS: readonly Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const openToStrike = (floor: Floor, x: number, y: number) => isFloor(floor, x, y)
  && !(floor.props ?? []).some(p => p.x === x && p.y === y);

/**
 * The tiles a creature's next blow covers: four arms of a cross, or one aimed line. Walls and intact props stop it.
 * While a creature winds up these are the tiles marked on the floor, and stepping off them is how a blow is dodged.
 */
export function attackTiles(floor: Floor, d: Dimling): Point[] {
  const def = enemyDef(d.species);
  const dirs = def.attack === "cross" ? DIRS : d.aim ? [d.aim] : [];
  const tiles: Point[] = [];
  for (const dir of dirs) {
    for (let k = 1; k <= def.range; k++) {
      const x = d.x + dir.x * k, y = d.y + dir.y * k;
      if (!openToStrike(floor, x, y)) break;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * The direction from a creature to the delver, if the delver stands in a straight, open line within the creature's reach.
 * That is what makes a creature start winding up; null means the delver is out of reach.
 */
export function reachDirection(floor: Floor, d: Dimling, player: Point): Point | null {
  const dx = player.x - d.x, dy = player.y - d.y;
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return null;
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance > enemyDef(d.species).range) return null;
  const dir = { x: Math.sign(dx), y: Math.sign(dy) };
  for (let k = 1; k <= distance; k++) if (!openToStrike(floor, d.x + dir.x * k, d.y + dir.y * k)) return null;
  return dir;
}

/** How far through its wind-up a creature is, from 0 (just started) towards 1 (about to strike). Null when it is not winding up. */
export function windupProgress(d: Dimling): number | null {
  if (d.phase !== "windup") return null;
  const total = enemyDef(d.species).windup;
  return Math.min(1, Math.max(0, (total - (d.windupLeft ?? total) + 1) / total));
}
