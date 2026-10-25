// Replaying a descent from its setup and its moves. Every change to a descent goes through `applyAction`, and the
// dungeon, the creatures and the loot all come from the seed, so the same setup and moves always give the same result.
// The signing server replays a descent this way before it vouches for it (server/attest.ts); the game keeps the
// moves while you play (state/run-store.ts).
import {
  ARMORS, CLASS_IDS, CLASSES, LEGENDARY_BONUS, NO_PERKS, POTION_IDS, RARITY_INFO, WEAPONS, mergePerks, scalePerks,
  type Perks, type PotionId,
} from "./catalog";
import { LOCK_MAX, MAX_FLASKS, PASSES, STAKE_GOLD_CAP, TICKET_DROP_CHANCE } from "./config";
import { applyAction, startRun, type PotionBag, type RunAction, type RunSetup, type RunState } from "./run";
import {isLevelPerk} from './level-perks';

/**
 * A five-flask descent with the strongest loadout is about 2,000 moves and replays in half a second. Ten times that is
 * plenty, and it keeps one request from holding the server for long.
 */
export const MAX_MOVES = 20_000;
/** The most of one potion a descent may carry. Potions are bought with simulated USDC; this only stops absurd claims. */
export const MAX_CARRIED = 50;

export class ReplayError extends Error {}

// ── moves as short codes ───────────────────────────────────────────────────────────────────────────────

const DIRS: Record<string, { dx: number; dy: number }> = { U: { dx: 0, dy: -1 }, D: { dx: 0, dy: 1 }, L: { dx: -1, dy: 0 }, R: { dx: 1, dy: 0 } };

/** One move as a short string: U/D/L/R to step or strike, W to wait, > to take the stairs, X to leave, P<id> for a potion. */
export function encodeMove(action: RunAction): string {
  switch (action.type) {
    case "move": {
      const code = Object.keys(DIRS).find(k => DIRS[k].dx === action.dx && DIRS[k].dy === action.dy);
      if (!code) throw new ReplayError(`Not a step: ${action.dx},${action.dy}`);
      return code;
    }
    case "wait": return "W";
    case "descend": return ">";
    case "extract": return "X";
    case "potion": return `P${action.id}`;
    case "perk": return `K${action.id}`;
  }
}

export function decodeMove(code: unknown): RunAction {
  if (typeof code !== "string") throw new ReplayError("A move is not a string");
  if (DIRS[code]) return { type: "move", ...DIRS[code] };
  if (code === "W") return { type: "wait" };
  if (code === ">") return { type: "descend" };
  if (code === "X") return { type: "extract" };
  if(code.startsWith('K')&&isLevelPerk(code.slice(1)))return{type:'perk',id:code.slice(1) as import('./level-perks').LevelPerkId};
  if (code.startsWith("P") && (POTION_IDS as readonly string[]).includes(code.slice(1))) return { type: "potion", id: code.slice(1) as PotionId };
  throw new ReplayError(`Unknown move: ${code.slice(0, 12)}`);
}

// ── what a descent may start with ──────────────────────────────────────────────────────────────────────

const NUMERIC_PERKS = ["goldPct", "crystalPct", "startLight", "stepDiscount", "damage", "findPct", "radius", "drainReduce", "freeStepChance", "lightOnKill"] as const;

/**
 * The strongest perks a descent can legally carry: the best Delver for each perk, locked to full strength, plus the
 * full stake, the best weapon and the best armor. Taking the best of every perk at once is more than any one Delver
 * gives, so this is a ceiling, never a real loadout.
 */
export function maxRunPerks(): Perks {
  const options: Partial<Perks>[] = CLASS_IDS
    .map(id => mergePerks(CLASSES[id].perk(RARITY_INFO.legendary.tier), LEGENDARY_BONUS))
    .map(p => scalePerks(p, LOCK_MAX));
  const best: Perks = { ...NO_PERKS };
  for (const o of options) {
    for (const key of NUMERIC_PERKS) best[key] = Math.max(best[key], o[key] ?? 0);
    if (o.regenEvery) best.regenEvery = best.regenEvery ? Math.min(best.regenEvery, o.regenEvery) : o.regenEvery;
    if (o.stealth) best.stealth = true;
  }
  return mergePerks(
    best,
    { goldPct: Math.round(STAKE_GOLD_CAP * LOCK_MAX) },
    { lightOnKill: Math.max(...Object.values(WEAPONS).map(w => w.lightOnKill)) },
    { drainReduce: Math.max(...Object.values(ARMORS).map(a => a.drainReduce)) },
  );
}

const CEILING = maxRunPerks();
const WEAPON_DAMAGE = new Set(Object.values(WEAPONS).map(w => w.damage));
const TICKET_CHANCES = new Set([TICKET_DROP_CHANCE, ...Object.values(PASSES).map(p => p.chance)]);

const record = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Checks a setup sent from a browser and rebuilds it from the checked fields only. The loadout comes from the
 * simulated economy, which lives in the player's browser, so it cannot be proven; it can only be held to what the
 * game allows.
 */
export function validateSetup(raw: unknown): RunSetup {
  const s = record(raw);
  const fail = (what: string) => { throw new ReplayError(`Setup: ${what}`); };
  if (!Number.isSafeInteger(s.seed) || (s.seed as number) < 0 || (s.seed as number) > 0xffff_ffff) fail("seed");
  if (!Number.isSafeInteger(s.flasks) || (s.flasks as number) < 1 || (s.flasks as number) > MAX_FLASKS) fail("flasks");
  if (!WEAPON_DAMAGE.has(s.weaponDamage as number)) fail("weapon");
  if (s.ticketChance !== undefined && !TICKET_CHANCES.has(s.ticketChance as number)) fail("ticket chance");

  const rawBag = record(s.bag);
  const bag = {} as PotionBag;
  for (const id of POTION_IDS) {
    const n = rawBag[id] ?? 0;
    if (!Number.isSafeInteger(n) || (n as number) < 0 || (n as number) > MAX_CARRIED) fail(`potion ${id}`);
    bag[id] = n as number;
  }

  const rawPerks = record(s.perks);
  const perks: Perks = { ...NO_PERKS };
  for (const key of NUMERIC_PERKS) {
    const v = rawPerks[key] ?? 0;
    if (!isNum(v) || v < 0 || v > CEILING[key] + 1e-9) fail(`perk ${key}`);
    perks[key] = v as number;
  }
  // Regrowth: 0 is none, and a smaller interval is stronger. Nothing in the game gives it today, so the ceiling is 0.
  const regen = rawPerks.regenEvery ?? 0;
  const regenAllowed = regen === 0 || (CEILING.regenEvery > 0 && Number.isSafeInteger(regen) && (regen as number) >= CEILING.regenEvery);
  if (!Number.isSafeInteger(regen) || !regenAllowed) fail("perk regenEvery");
  perks.regenEvery = regen as number;
  if (rawPerks.stealth !== undefined && typeof rawPerks.stealth !== "boolean") fail("perk stealth");
  if (rawPerks.stealth === true && !CEILING.stealth) fail("perk stealth");
  perks.stealth = rawPerks.stealth === true;

  return {
    seed: s.seed as number, flasks: s.flasks as number, perks, weaponDamage: s.weaponDamage as number, bag,
    ...(s.ticketChance !== undefined ? { ticketChance: s.ticketChance as number } : {}),
  };
}

// ── replay ─────────────────────────────────────────────────────────────────────────────────────────────

export type ReplayResult = {
  /** The setup as checked and rebuilt, with its fields always in the same order. */
  setup: RunSetup;
  state: RunState;
  /** The deepest floor reached, as the run report shows it. */
  depth: number;
  gold: number;
  kills: number;
  home: boolean;
  bossSlain: boolean;
};

/** Plays a descent again from its setup and moves. It must end exactly on the last move: home or lost in the dark. */
export function replayRun(rawSetup: unknown, rawMoves: unknown): ReplayResult {
  const setup = validateSetup(rawSetup);
  if (!Array.isArray(rawMoves) || rawMoves.length === 0) throw new ReplayError("No moves");
  if (rawMoves.length > MAX_MOVES) throw new ReplayError("Too many moves");
  let state = startRun(setup);
  for (const code of rawMoves) {
    if (state.status !== "playing") throw new ReplayError("Moves go on after the descent ended");
    const action=decodeMove(code);
    if(state.perkChoice&&action.type!=='perk')throw new ReplayError('Choose the pending level perk before another action');
    const next=applyAction(state,action);
    if(action.type==='perk'&&next===state)throw new ReplayError('Illegal level perk choice');
    state=next;
  }
  if (state.status === "playing") throw new ReplayError("The descent has not ended");
  return {
    setup, state, depth: state.deepest, gold: state.gold, kills: state.kills,
    home: state.status === "extracted", bossSlain: state.bossSlain === true,
  };
}
