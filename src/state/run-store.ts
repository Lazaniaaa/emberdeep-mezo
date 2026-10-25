import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MAX_MOVES, encodeMove } from "@/game/replay";
import { applyAction, maxLightOf, startRun, type RunAction, type RunSetup, type RunState } from "@/game/run";
import { floorHeight, floorWidth } from "@/game/config";
import { isSpecies } from "@/game/enemies";
import { MAX_LEVEL } from "@/game/levels";
import { isGearId, isPropKind } from "@/game/props";
import { POTION_IDS } from "@/game/catalog";
import {validPerkState} from '@/game/level-perks';
import { useGame } from "@/state/store";

/** How a descent started and every move made in it, as short codes. Enough to replay it exactly (game/replay.ts). */
export type DescentLog = { setup: RunSetup; moves: string[] };

type RunStore = {
  run: RunState | null;
  prevPlayer: { x: number; y: number } | null;
  /** The descent being played. Null for a descent restored from a save that kept no moves. */
  log: DescentLog | null;
  /** The last descent that ended, kept after the run screen closes so the run report can have it signed. */
  lastDescent: DescentLog | null;
  /** The descent in play is a prize descent for the Ember Pot (game/prize.ts); it is settled outside the economy. */
  prize: boolean;
  start: (setup: RunSetup, prize?: boolean) => void;
  act: (action: RunAction) => RunState | null;
  clear: () => void;
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function validBag(value: unknown): boolean {
  const bag = object(value);
  return POTION_IDS.every(id => Number.isSafeInteger(bag[id]) && (bag[id] as number) >= 0);
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const ITEM_KINDS = ["gold", "crystal", "oil", "chest", "vault", "hoard"];
const THEMES = ["catacombs", "mycelium", "cinderworks", "hollowglass"];

/** Floors 1-3 are bigger than the rest, so a point is judged against the floor it is on. */
const isPointIn = (value: unknown, w: number, h: number) => {
  const p = object(value);
  return Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y)
    && (p.x as number) >= 0 && (p.x as number) < w && (p.y as number) >= 0 && (p.y as number) < h;
};

const validItem = (w: number, h: number) => (value: unknown) => {
  const item = object(value);
  return isPointIn(item, w, h) && Number.isSafeInteger(item.id) && ITEM_KINDS.includes(item.kind as string);
};

const validProp = (w: number, h: number) => (value: unknown) => {
  const prop = object(value);
  return isPointIn(prop, w, h) && Number.isSafeInteger(prop.id) && isPropKind(prop.kind) && finite(prop.hp) && finite(prop.maxHp);
};

const validDimling = (w: number, h: number) => (value: unknown) => {
  const d = object(value);
  const size = d.size === undefined ? 1 : d.size;
  const count = (n: unknown) => n === undefined || (Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 10);
  return isPointIn(d, w, h) && Number.isSafeInteger(d.id) && finite(d.hp) && finite(d.maxHp) && typeof d.awake === "boolean"
    && Number.isSafeInteger(size) && (size as number) >= 1 && (size as number) <= 3
    && (d.x as number) + (size as number) <= w && (d.y as number) + (size as number) <= h
    && (d.boss === undefined || typeof d.boss === "boolean")
    // Creature fields added with the telegraphed attacks; saves from before them omit all of these.
    && (d.species === undefined || isSpecies(d.species))
    && (d.phase === undefined || d.phase === "idle" || d.phase === "windup" || d.phase === "recovery")
    && count(d.windupLeft) && count(d.cooldown) && count(d.rest)
    && (d.aim === undefined || d.aim === null || (Number.isSafeInteger(object(d.aim).x) && Number.isSafeInteger(object(d.aim).y)
      && Math.abs(object(d.aim).x as number) + Math.abs(object(d.aim).y as number) === 1));
};

/** A saved descent must be complete enough to play on; anything else is dropped instead of crashing the game. */
export function validSavedRun(value: unknown): value is RunState {
  const run = object(value);
  const floor = object(run.floor);
  const player = object(run.player);
  const rng = object(run.rng);
  const perks = object(run.perks);
  const depth = Number.isSafeInteger(run.depth) && (run.depth as number) >= 1 ? run.depth as number : 1;
  const W = floorWidth(depth), H = floorHeight(depth);
  const at = (p: unknown) => (object(p).y as number) * W + (object(p).x as number);
  return Number.isSafeInteger(run.depth) && (run.depth as number) >= 1
    && Number.isSafeInteger(run.deepest) && (run.deepest as number) >= 1
    && Number.isSafeInteger(rng.s)
    && floor.w === W && floor.h === H
    && floor.depth === run.depth && THEMES.includes(floor.theme as string) && typeof floor.revealed === "boolean"
    && Array.isArray(floor.tiles) && floor.tiles.length === W * H
    && floor.tiles.every(tile => tile === 0 || tile === 1)
    && Array.isArray(floor.seen) && floor.seen.length === floor.tiles.length
    && floor.seen.every(v => v === 0 || v === 1)
    && isPointIn(floor.spawn, W, H) && isPointIn(floor.stairs, W, H)
    && floor.tiles[at(floor.spawn)] === 1
    && floor.tiles[at(floor.stairs)] === 1
    && Array.isArray(floor.items) && floor.items.every(validItem(W, H))
    && Array.isArray(floor.dimlings) && floor.dimlings.every(validDimling(W, H))
    // Props, levels and gear came later; a save from before them has none of these.
    && (floor.props === undefined || (Array.isArray(floor.props) && floor.props.every(validProp(W, H))))
    && (run.level === undefined || (Number.isSafeInteger(run.level) && (run.level as number) >= 1 && (run.level as number) <= MAX_LEVEL))
    && (run.xp === undefined || (finite(run.xp) && (run.xp as number) >= 0))
    && (run.smashed === undefined || (Number.isSafeInteger(run.smashed) && (run.smashed as number) >= 0))
    && (run.gear === undefined || (Array.isArray(run.gear) && run.gear.every(isGearId)))
    && validPerkState(run)
    && isPointIn(player, W, H)
    && floor.tiles[at(player)] === 1
    && ["left", "right", "up", "down"].includes(player.facing as string)
    && ["playing", "dead", "extracted"].includes(run.status as string)
    && [run.light, run.startLight, run.steps, run.kills, run.gold, run.crystals, run.sigils,
      run.tickets, run.ticketChance, run.ward, run.nightVision, run.weaponDamage].every(finite)
    && (run.maxLight === undefined || (finite(run.maxLight) && (run.maxLight as number) >= 0))
    && ["goldPct", "crystalPct", "startLight", "stepDiscount", "damage", "findPct",
      "radius", "drainReduce", "regenEvery", "freeStepChance", "lightOnKill"]
      .every(key => finite(perks[key]))
    && typeof perks.stealth === "boolean"
    && validBag(run.bag) && validBag(run.used) && validBag(run.found)
    && Array.isArray(run.messages) && run.messages.every(m => typeof m === "string")
    && Array.isArray(run.events) && run.events.every(e => typeof e === "string")
    && (run.runId === undefined || typeof run.runId === "string");
}

/** Books a finished descent. Safe to call again: a result settles only once, and a stale one is ignored. */
export function settle(run: RunState) {
  try {
    if (useRun.getState().prize) {
      // A prize descent settles once; afterwards it falls through to finishRun, which ignores it (nothing was paid).
      useRun.setState({ prize: false });
      useGame.getState().finishPrizeRun(run);
      return;
    }
    useGame.getState().finishRun(run);
  } catch {
    // Nothing to settle: it was booked already, or it belongs to another payment.
  }
}

/** A saved log must belong to the saved descent and stay within what the server would replay. */
function validLog(value: unknown, seed?: number): value is DescentLog {
  const log = object(value);
  const setup = object(log.setup);
  return Number.isSafeInteger(setup.seed) && (seed === undefined || setup.seed === seed)
    && Array.isArray(log.moves) && log.moves.length <= MAX_MOVES && log.moves.every(m => typeof m === "string" && m.length <= 16);
}

export const useRun = create<RunStore>()(persist((set, get) => ({
  run: null,
  prevPlayer: null,
  log: null,
  lastDescent: null,
  prize: false,
  start: (setup, prize = false) => set({ run: startRun(setup), prevPlayer: null, log: { setup, moves: [] }, lastDescent: null, prize }),
  act: action => {
    const { run, log } = get();
    if (!run) return null;
    const next = applyAction(run, action);
    if (next !== run) {
      let nextLog: DescentLog | null = null;
      if (log && run.status === "playing" && log.moves.length < MAX_MOVES) {
        // A move the replay could not read would make the descent impossible to sign; stop logging rather than lie.
        try { nextLog = { setup: log.setup, moves: [...log.moves, encodeMove(action)] }; } catch { nextLog = null; }
      }
      const ended = next.status !== "playing" && run.status === "playing";
      set({
        run: next, prevPlayer: { x: run.player.x, y: run.player.y }, log: nextLog,
        ...(ended ? { lastDescent: nextLog } : {}),
      });
    }
    // The result is banked the moment the descent ends. Leaving the result screen only closes it.
    if (next.status !== "playing" && run.status === "playing") settle(next);
    return next;
  },
  clear: () => set({ run: null, prevPlayer: null, log: null }),
}), {
  name: "emberdeep-run-v1",
  storage: createJSONStorage(() => sessionStorage),
  merge: (saved, current) => {
    const data = object(saved);
    const run = validSavedRun(data.run) ? data.run : null;
    const legacyPerks=!!run&&run.levelPerks===undefined;
    if (run) {
      // Fill in what a save from before props and levels leaves out.
      run.floor.props ??= [];
      run.xp ??= 0; run.level ??= 1; run.gear ??= []; run.smashed ??= 0;
      run.maxLight = maxLightOf(run); run.light = Math.min(run.light,run.maxLight);
      run.levelPerks??=[];run.perkChoice??=null;run.perkQueue??=[];
      run.flickersUsed??=0;run.interruptsUsed??=0;run.stoneWardUsed??=0;
      run.riposteReady??=false;run.momentumSteps??=0;run.breathWaits??=0;
    }
    const prev = object(data.prevPlayer);
    const prevPlayer = run && Number.isSafeInteger(prev.x) && Number.isSafeInteger(prev.y)
      ? { x: prev.x as number, y: prev.y as number } : null;
    // Old in-progress runs stay playable, but an old-rules tape cannot attest under the new perk-choice rules.
    const log = run && !legacyPerks && validLog(data.log, run.seed) ? data.log : null;
    const lastDescent = validLog(data.lastDescent) ? data.lastDescent : null;
    return { ...current, run, prevPlayer, log, lastDescent, prize: !!run && run.status === "playing" && data.prize === true };
  },
}));
