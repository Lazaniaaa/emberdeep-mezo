// Every tunable number of the Emberdeep economy lives here.
// Every amount of money is in cents of simulated USDC (Arc's native token): 50 is $0.50. Nothing moves on chain.

/** Dollars per unit of money in the game: one cent. */
export const CENT = 0.01;

/**
 * Every cent spent anywhere in the game is split this way. The studio's revenue keeps the game running (the server,
 * development, and the gas for the Hall of Descents on Arc); the rest goes back to players.
 */
export const REVENUE_SHARE = 0.33;
/** What goes back to players in total: the gold-share round pool plus the lock pool. */
export const POOL_SHARE = 0.67;
/** The part of it reserved for locked Delvers and stakes. Shared by passive gold, never by descents. */
export const LOCK_SHARE = 0.07;
/** The gold-share round pool: POOL_SHARE minus LOCK_SHARE. */
export const ACTIVE_SHARE = 0.6;

export const START_BALANCE = 2_000;
export const FAUCET_AMOUNT = 1_000;

/** One flask of lantern oil: the entry ticket for a descent. */
export const FLASK_PRICE = 20;
export const FLASK_LIGHT = 80;
export const MAX_FLASKS = 5;

/**
 * Entry key: one is spent to start a descent, and it is bought separately from lantern oil.
 * Its price goes through the same 25/8/67 split as every other spend.
 */
export const KEY_PRICE = 50;
/** New saves start with a hundred keys (owner, 2026-10-14): judges and players try the game without buying any first. */
export const START_KEYS = 100;
export const MAX_KEYS = 999;

// Rewards are a share of the round's pool, never a fixed rate per gold. The pool is 60% of every cent
// spent in the round (ACTIVE_SHARE; another 7% feeds the lock pool). Gold is only earned by extracting
// alive, and when the round closes each delver receives (their gold / all gold) of the pool, so nothing
// in the game promises an amount of money.

/** One click of "other delvers this week": their spend ($200). It feeds the round pool and the lock pool. */
export const FIELD_WEEK_SPEND = 20_000;
/**
 * Simulated crowd: gold banked per cent they spend. The simulated 70/20/10 crowd of unperked, held-Delver and top-build
 * bots banked about 6.59 after tracing the painted floors and adding prop cover (2026-10-23).
 * Owner-approved calibration: 6.4, below that bot baseline. Prices, loot, pool split and return cap are unchanged.
 */
export const FIELD_GOLD_PER_CENT = 6.4;
/**
 * The most a delver takes back from the round pool, as a multiple of what they put into descents that round
 * (entry keys plus oil): +60% at the very best. Whatever the cap withholds stays in the pool for the next round.
 */
export const MAX_ROUND_RETURN = 1.6;
/** Every round opens with one simulated crowd week already in it, so a share is never trivially 100%. */
export const ROUND_SEED_POOL = FIELD_WEEK_SPEND * ACTIVE_SHARE;
export const ROUND_SEED_GOLD = FIELD_WEEK_SPEND * FIELD_GOLD_PER_CENT;
/** The same crowd week also fills the lock pool and brings its own lockers. */
export const ROUND_SEED_LOCKED = FIELD_WEEK_SPEND * LOCK_SHARE;
/** Passive gold the simulated crowd's lockers farm in a crowd week. An assumption, like FIELD_GOLD_PER_CENT. */
export const FIELD_LOCK_GOLD = 16_000;

export const MAP_W = 27;
export const MAP_H = 17;

/**
 * Floors 1-3 use a finer grid over the same painted rooms, so they hold about 60% more walkable tiles
 * (34x22 against 27x17) and a delver has room to move, fight and dodge. Deeper floors keep 27x17.
 */
export const BIG_FLOOR_DEPTH = 3;
export const BIG_MAP_W = 34;
export const BIG_MAP_H = 22;
export const floorWidth = (depth: number) => (depth <= BIG_FLOOR_DEPTH ? BIG_MAP_W : MAP_W);
export const floorHeight = (depth: number) => (depth <= BIG_FLOOR_DEPTH ? BIG_MAP_H : MAP_H);
/** How much bigger than a 27x17 floor this depth's grid is. Loot and creatures scale with it. */
export const floorScale = (depth: number) => (floorWidth(depth) * floorHeight(depth)) / (MAP_W * MAP_H);

/** Creatures on a floor: six on the first, then a few more each level. The arena of floor 7 is capped by its size. */
export function enemyCount(depth: number) {
  return 6 + Math.round((depth - 1) * 1);
}
/**
 * A creature hits after a warning (see enemies.ts) and a hit takes this many times the light a creature used to drink
 * in a turn, since it lands every few turns instead of every turn and can be dodged.
 */
export const ENEMY_HIT_MULT = 1.25;
/** Gold a defeated creature drops, before the depth multiplier. */
export const KILL_GOLD: readonly [number, number] = [3, 6];
/** Turns a creature is stuck recovering after it attacks. */
export const ENEMY_RECOVERY = 1;

/**
 * Hit points and blows are counted in these units, so a dimling has 16-40 HP and a blow is 8-40.
 * The ratio of damage to health is what matters; the larger numbers just leave room to tune.
 */
export const HP_SCALE = 8;

/**
 * Cerberus guards the stairs of the last illustrated floor. It is far larger than a dimling (2x2 tiles),
 * has 150 HP, drinks light hard and moves at half the pace. A Ward Charm (15 protected steps) covers a
 * dagger fight, and the stairs stay sealed until it falls.
 */
export const BOSS_DEPTH = 7;
export const BOSS_HP = 150;
export const BOSS_SIZE = 2;
export const BOSS_DRAIN = 40;
export const BOSS_MOVE_FACTOR = 0.5;
/** What the Cerberus Hoard holds, before the depth multiplier and perks. */
export const HOARD_GOLD: readonly [number, number] = [40, 60];
export const HOARD_CRYSTALS: readonly [number, number] = [10, 16];
export const HOARD_SIGIL_CHANCE = 0.4;

export const NIGHT_VISION_STEPS = 25;
export const WARD_STEPS = 15;

/** Delvers minted free each week for the holders of the winning draw tickets. They count against the supply. */
export const DRAW_MINTS = 3;
/** Chance a gold pile, crystal, chest, vault or kill drops a raffle ticket. Dying still drops them on the floor. */
export const TICKET_DROP_CHANCE = 0.03;
/** Rough loot rolls per cent the simulated crowd spends, so their ticket count matches the free drop rate. */
export const FIELD_ROLLS_PER_CENT = 0.12;
/** Share of that spend assumed to come home, so the field's ticket count stays believable. */
export const FIELD_EXTRACT_SHARE = 0.55;

export type PassId = "plus" | "pro";

/** Weekly passes. They raise the ticket drop rate. They do not sell tickets. */
export const PASSES: Record<PassId, { id: PassId; name: string; usd: number; price: number; chance: number }> = {
  plus: { id: "plus", name: "Ember Pass", usd: 5, price: 500, chance: 0.045 },
  pro: { id: "pro", name: "Deep Pass", usd: 10, price: 1_000, chance: 0.065 },
};

/** Hard cap on how many Delvers of each rarity can ever exist. */
export const RARITY_SUPPLY = { common: 999, rare: 111, epic: 69, legendary: 11 } as const;
/** Simulated: how many of each the wider community had already minted before this session. */
export const WORLD_MINT_SEED = { common: 640, rare: 71, epic: 38, legendary: 5 } as const;

/** Rage Potion: your next few blows hit harder. */
export const RAGE_HITS = 5;
export const RAGE_MULT = 1.8;
/** Regeneration: a little light back on each of the next turns. */
export const REGEN_TURNS = 5;
/** Healing Draught: found in the deep, never sold. */
export const HEAL_LIGHT = 60;

// ---------------------------------------------------------------- locks
// A perk you merely hold works at HOLD_FACTOR of its full strength. Locking a Delver
// or a stake starts at LOCK_START and grows by LOCK_STEP for every round closed since, up to LOCK_MAX. The clock
// is closed rounds: the Vault's button in the demo, a schedule in production.

export const HOLD_FACTOR = 0.6;
export const LOCK_START = 0.8;
export const LOCK_STEP = 0.05;
export const LOCK_MAX = 1.3;
/** Closed rounds until a lock is mature: what it farmed can be harvested and it can be released for free. */
export const MATURITY_ROUNDS = 4;
/** Leaving a lock early forfeits this share of what it has farmed (it goes back to the lock pool)... */
export const EXIT_FORFEIT = 0.5;
/** ...and costs this share of the lock's value as a fee (a Delver's mint price, or the stake), which is studio revenue. */
export const EXIT_FEE = 0.1;
/** Passive gold a lock farms per round per cent of value (before the tenure factor). It sets its share of the lock pool. */
export const LOCK_GOLD_PER_CENT = 0.1;
/** Most one wallet can stake ($50), and the smallest step to add ($5). */
export const STAKE_MAX = 5_000;
export const STAKE_STEP = 500;
/** A stake adds this much gold per STAKE_STEP locked, up to the cap (both before the tenure factor). */
export const STAKE_GOLD_PER_STEP = 1;
export const STAKE_GOLD_CAP = 8;
/** Delver locks earn this fraction of a raffle ticket per round, for the first few locks only. */
export const LOCK_TICKET_DUST = 0.25;
export const LOCK_TICKET_LOCKS = 2;

// ---------------------------------------------------------------- expeditions
// A Delver can be sent into unmapped land instead of down the cave. It may come back with a haul, or with
// nothing (it is never lost). The roll is made when it leaves, so reloading the page cannot re-roll it.

/** What one expedition costs, before any pack. About $1. */
export const EXPEDITION_COST = 100;
/** Expedition spend has its own split: more goes to the studio than for ordinary spend, and no lock pool takes a cut. */
export const EXPEDITION_REVENUE = 0.45;
export const EXPEDITION_POOL = 0.55;
/**
 * How long a Delver is away. 5 seconds is a test preview so a whole trip can be seen at once; a live
 * version would send it away for a few hours up to a day (the timestamps already work that way).
 */
export const EXPEDITION_DURATION_MS = 5_000;
/** What an average haul (a multiplier of 1) holds. The multiplier scales all three. */
export const EXPEDITION_BASE_LOOT = { keys: 1, tickets: 1, gold: 120 } as const;
export type ExpeditionTierId = "common" | "uncommon" | "rare" | "epic" | "legendary";
/** Haul size by rarity: the weight is in basis points of successful trips, the range is the multiplier. */
export const EXPEDITION_TIERS: readonly { id: ExpeditionTierId; label: string; weight: number; min: number; max: number }[] = [
  { id: "common", label: "Common", weight: 8_400, min: 0.6, max: 1.2 },
  { id: "uncommon", label: "Uncommon", weight: 1_200, min: 1.2, max: 2.5 },
  { id: "rare", label: "Rare", weight: 320, min: 2.5, max: 5 },
  { id: "epic", label: "Epic", weight: 70, min: 5, max: 10 },
  { id: "legendary", label: "Legendary", weight: 10, min: 10, max: 15 },
];
export type PackId = "none" | "scout" | "ranger" | "vanguard";
/**
 * Gear for one trip: it costs money and raises the chance of coming back with a haul. Prices are set so the average haul
 * stays worth about half of what the trip costs at every tier: a pack buys a steadier trip, not a better deal.
 */
export const EXPEDITION_PACKS: Record<PackId, { id: PackId; name: string; price: number; chance: number; blurb: string }> = {
  none: { id: "none", name: "No pack", price: 0, chance: 0.45, blurb: "Bare hands and a prayer." },
  scout: { id: "scout", name: "Scout Pack", price: 30, chance: 0.58, blurb: "Rope, torch and a map scrap." },
  ranger: { id: "ranger", name: "Ranger Pack", price: 60, chance: 0.7, blurb: "Leather, a lantern and rations." },
  vanguard: { id: "vanguard", name: "Vanguard Pack", price: 90, chance: 0.82, blurb: "Plate, flares and a guide." },
};

/** Chance that a Sealed Vault holds a Soul Sigil (a free character mint). */
export const SIGIL_DROP_CHANCE = 0.3;
/** Rarity weights (basis points) for a Soul Sigil mint. */
export const SIGIL_RARITY_WEIGHTS = { common: 6_200, rare: 2_700, epic: 900, legendary: 200 } as const;

export function stepCost(depth: number) {
  return 1 + Math.floor((depth - 1) / 2) * 0.5;
}

export function lootMultiplier(depth: number) {
  return 1 + 0.4 * (depth - 1);
}

export function lightRadius(light: number) {
  // A healthy lantern keeps its full view; only the final 25 light narrows it.
  if (light >= 25) return 5;
  if (light >= 20) return 4;
  if (light >= 10) return 3;
  return light >= 5 ? 2 : 1;
}

export function toUsd(cents: number) {
  return cents * CENT;
}
