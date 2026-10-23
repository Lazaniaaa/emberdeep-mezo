import type { Dimling, Point } from "@/game/dungeon";
import { windupProgress } from "@/game/enemy-ai";
import { DEFAULT_SPECIES, enemyDef, type EnemySpecies } from "@/game/enemies";
import { HERO_CONTACT_MS, HERO_WINDUP_MS } from "./hero-anim";
import type { MobFrame } from "./mob-sheets";
import type { RunState } from "@/game/run";
import { bossDrained } from "./turn-feedback";

/**
 * Which picture of a creature to show, and where. A creature glides between tiles on a walk cycle with a small hop, turns
 * to face the delver (the sprites look right, so they are mirrored to look left), bobs while it waits, and shows a
 * separate pose while it winds up. When its blow lands it lunges along it; when the delver's blow lands on it, it flashes
 * white and is knocked back a little. Everything is computed from the game state and the clock, with no canvas.
 */

/** A creature crosses a tile a little slower than the delver, so the eye can follow it. */
export const CREATURE_MOVE_MS = 160;
/** How long each half of the walk cycle lasts. */
export const WALK_MS = 80;
/** How long each half of the idle bob lasts. */
export const IDLE_MS = 480;
/** How long a creature that was hit shows white, and how long it takes to come back from the knock. */
export const HIT_FLASH_MS = 110;
export const KNOCKBACK_MS = 170;
/** How long a creature's lunge lasts when its blow lands, and how far it reaches in canvas pixels. */
export const STRIKE_MS = 220;
/** A short presentation-only anticipation; the boss's contact damage still lands on the game turn. */
export const BOSS_ANTICIPATION_MS = 60;
const LUNGE_PX = 7;

/**
 * Hop height in pixels while crossing a tile, whether it floats (swaps frames as it hovers) while it waits, and how high
 * above the floor a flyer hangs.
 */
const GAIT: Record<EnemySpecies, { hop: number; floats: boolean; hover: number }> = {
  wickgnaw: { hop: 2, floats: false, hover: 0 },
  snaretoad: { hop: 1, floats: false, hover: 0 },
  "cinder-hound": { hop: 0, floats: true, hover: 8 },
  chaincoil: { hop: 1, floats: false, hover: 0 },
  "needle-wraith": { hop: 0, floats: true, hover: 6 },
  sootplate: { hop: 1, floats: false, hover: 0 },
  "hollow-burrower": { hop: 1, floats: false, hover: 0 },
  "fourfold-bell": { hop: 3, floats: false, hover: 0 },
  "rift-leaper": { hop: 2, floats: true, hover: 4 },
};

export type Pose = {
  /** Position in tiles, fractional while gliding. */
  x: number;
  y: number;
  /** Whole pixels the picture is raised, from hopping or floating. */
  lift: number;
  /** Whole-pixel offset from trembling. */
  offX: number;
  offY: number;
  frame: MobFrame;
  /** The picture looks right; true mirrors it to look left. */
  flip: boolean;
  /** The delver's blow just landed on it: show it white. */
  flash: boolean;
  /** Its own blow is landing: show it whole, not faded as it is while it recovers. */
  striking: boolean;
};

type BossContact = { at: number; lunge: Point };
type Track = {
  fromX: number; fromY: number; toX: number; toY: number; movedAt: number;
  flip: boolean;
  last: Dimling;
  /** When the delver's blow landed on it, and the way it was knocked. */
  hitAt: number; knock: Point;
  /** When its own blow landed, and the way it lunged. */
  strikeAt: number; lunge: Point;
  turn: number;
  contacts: BossContact[];
  lastContact?: BossContact;
  shownContact?: BossContact;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (n: number) => n * n * (3 - 2 * n);

/** One step from `from` toward `to` along the longer axis. */
function toward(from: Point, to: Point): Point {
  const dx = to.x - from.x, dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

export const restPose = (d: Point): Pose => ({ x: d.x, y: d.y, lift: 0, offX: 0, offY: 0, frame: "a", flip: false, flash: false, striking: false });

export class CreatureAnimator {
  private tracks = new Map<number, Track>();
  private key = "";
  private lastRun: RunState | null = null;
  private action = 0;

  /** Immutable state identity counts render-side actions, including blows with unchanged game steps. */
  updateRun(run: RunState, time: number) {
    const prev = this.lastRun;
    const changed = prev !== run;
    if (changed) this.action++;
    this.update(`${run.seed}:${run.depth}:${run.runId ?? ""}`, run.floor.dimlings, run.player, time, this.action,
      !!prev && changed && bossDrained(prev, run));
    this.lastRun = run;
  }

  private position(t: Track, time: number) {
    const k = clamp01((time - t.movedAt) / CREATURE_MOVE_MS);
    const e = smooth(k);
    return { x: t.fromX + (t.toX - t.fromX) * e, y: t.fromY + (t.toY - t.fromY) * e, k };
  }

  /** Reads this frame's creatures. `key` names the floor being shown: a new floor starts every picture afresh. */
  update(key: string, creatures: readonly Dimling[], player: Point, time: number, turn = 0, bossStruck = false) {
    if (key !== this.key) { this.tracks.clear(); this.key = key; }
    const present = new Set<number>();
    for (const d of creatures) {
      present.add(d.id);
      // An awake creature looks at the delver; one that is level with them keeps the way it was looking.
      const facing = d.awake && player.x !== d.x ? player.x < d.x : null;
      const t = this.tracks.get(d.id);
      if (!t) {
        this.tracks.set(d.id, {
          fromX: d.x, fromY: d.y, toX: d.x, toY: d.y, movedAt: -Infinity, flip: facing ?? false, last: d,
          hitAt: -Infinity, knock: { x: 0, y: 0 }, strikeAt: -Infinity, lunge: { x: 0, y: 0 }, turn, contacts: [],
        });
        continue;
      }
      // Hurt: the flash waits for the delver's wind-up, so it comes with the blow. The knock is away from the delver.
      if (d.hp < t.last.hp) {
        t.hitAt = time + HERO_WINDUP_MS;
        t.knock = toward(player, d);
      }
      // Its blow landed: it lunges along its aim (read from before, as striking clears it) or at the delver.
      if (t.last.phase === "windup" && d.phase === "recovery") {
        t.strikeAt = time;
        t.lunge = t.last.aim ?? toward(d, player);
      }
      if (d.boss && t.turn !== turn && bossStruck) {
        t.strikeAt = time;
        const middle = ((d.size ?? 2) - 1) / 2;
        t.lunge = toward({ x: d.x + middle, y: d.y + middle }, player);
        t.contacts.push({ at: time + BOSS_ANTICIPATION_MS, lunge: t.lunge });
        if (t.contacts.length > 32) t.contacts.shift();
      }
      t.turn = turn;
      if (d.x !== t.toX || d.y !== t.toY) {
        const far = Math.abs(d.x - t.toX) + Math.abs(d.y - t.toY) > 2;
        const here = this.position(t, time);
        t.fromX = far ? d.x : here.x; t.fromY = far ? d.y : here.y;
        t.toX = d.x; t.toY = d.y; t.movedAt = time;
      }
      if (facing !== null) t.flip = facing;
      t.last = d;
    }
    for (const id of this.tracks.keys()) if (!present.has(id)) this.tracks.delete(id);
  }

  pose(d: Dimling, time: number): Pose {
    const t = this.tracks.get(d.id);
    if (!t) return restPose(d);
    const gait = d.boss ? { hop: 0, floats: false, hover: 0 } : GAIT[d.species ?? DEFAULT_SPECIES] ?? GAIT[DEFAULT_SPECIES];
    const { x, y, k } = this.position(t, time);
    const moving = k < 1 && (t.fromX !== t.toX || t.fromY !== t.toY);
    const pose: Pose = { x, y, lift: 0, offX: 0, offY: 0, frame: "a", flip: t.flip, flash: false, striking: false };

    let struck = time - t.strikeAt, lunge = t.lunge;
    if (d.boss) {
      while (t.contacts.length && t.contacts[0].at <= time) t.lastContact = t.contacts.shift();
      const last = t.lastContact;
      const firstFrame = last && last !== t.shownContact && time - last.at < STRIKE_MS - BOSS_ANTICIPATION_MS;
      if (firstFrame) t.shownContact = last;
      const contact = firstFrame || (last && time - last.at < HERO_CONTACT_MS);
      const active = contact ? last : t.contacts[0] ?? last;
      struck = active ? time - active.at + BOSS_ANTICIPATION_MS : Infinity;
      lunge = active?.lunge ?? lunge;
    }
    const hit = time - t.hitAt;
    const p = windupProgress(d);
    if (struck >= 0 && struck < STRIKE_MS) {
      // Its blow: a lunge along it for a creature that hits up close, a small kick back for one that shoots.
      const def = enemyDef(d.species ?? DEFAULT_SPECIES);
      const shoots = def.attack === "line" && def.range > 1;
      const reach = Math.round(Math.sin((Math.PI * struck) / STRIKE_MS) * (shoots ? -2 : LUNGE_PX));
      pose.frame = d.boss && struck < BOSS_ANTICIPATION_MS ? "w" : "s";
      pose.striking = true;
      pose.offX = lunge.x * reach;
      pose.offY = lunge.y * reach;
    } else if (p !== null) {
      // Winding up: its attack pose, trembling more as the blow gets closer.
      pose.frame = "w";
      pose.offX = Math.round(Math.sin(time / 26) * 1.2 * p);
      pose.offY = Math.round(Math.cos(time / 31) * 0.8 * p);
    } else if (moving) {
      pose.frame = Math.floor((time - t.movedAt) / WALK_MS) % 2 === 0 ? "b" : "a";
      pose.lift = Math.round(Math.sin(Math.PI * k) * gait.hop);
    } else if (d.awake) {
      const beat = Math.floor((time + d.id * 131) / IDLE_MS) % 2;
      if (gait.floats) pose.frame = beat === 0 ? "a" : "b";
      else pose.lift = beat;
    }
    pose.lift += gait.hover;
    if (hit >= 0 && hit < KNOCKBACK_MS) {
      const knock = Math.round(2 * (1 - hit / KNOCKBACK_MS));
      pose.offX += t.knock.x * knock;
      pose.offY += t.knock.y * knock;
      pose.flash = hit < HIT_FLASH_MS;
    }
    return pose;
  }
}
