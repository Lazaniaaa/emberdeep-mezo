import { tuning } from "./tuning";

/**
 * Things to smash. They stand in the way like a creature: walk into one to hit it, and when it breaks something falls
 * out: one kind of loot (gold, oil or crystals), sometimes two, plus a little experience and, from crates and barrels,
 * now and then a piece of gear. They never move or hit back, and they never block the way for good.
 * A prop's hit points count blows, whatever the weapon: an urn or a sack breaks at the first, a crate or a barrel at
 * the second (2026-10-11, the owner: "one blow, two at most"). A blow costs no light; only steps do.
 */
export type PropKind = "urn" | "crate" | "barrel" | "sack";

/** What a broken prop can give. */
export type LootKind = "gold" | "oil" | "crystal";

export type PropDef = {
  id: PropKind;
  name: string;
  /** Blows it takes to break. */
  hp: number;
  /** Chance a second kind of loot falls out with the first. 1 is always two. */
  second: number;
  /** Gold, before the depth multiplier and perks, when gold is what falls out. */
  gold: readonly [number, number];
  /** Light, before `tuning.dropOil`, when oil is what falls out. */
  oil: readonly [number, number];
  /** Crystals, before the depth multiplier and perks, when crystals fall out. */
  crystals: readonly [number, number];
  /** How likely each kind is to fall out. Oil's weight also grows as the lantern runs low (see lootWeights). */
  weights: { gold: number; crystal: number; oil: number };
  xp: readonly [number, number];
  /** Chance it holds a piece of gear, on top of the loot. */
  gear: number;
  blurb: string;
};

export const PROPS: readonly PropDef[] = [
  {
    id: "urn", name: "Clay Urn", hp: 1, second: 0.2,
    gold: [4, 6], oil: [7, 11], crystals: [1, 1], weights: { gold: 45, crystal: 15, oil: 1 }, xp: [1, 2], gear: 0,
    blurb: "Brittle. Gold, oil or a crystal.",
  },
  {
    id: "crate", name: "Wooden Crate", hp: 2, second: 0.4,
    gold: [7, 10], oil: [10, 16], crystals: [1, 2], weights: { gold: 45, crystal: 15, oil: 1 }, xp: [3, 4], gear: 0.06,
    blurb: "Takes two blows. Often two kinds of loot, and it might hide a tool.",
  },
  {
    id: "barrel", name: "Iron-bound Barrel", hp: 2, second: 1,
    gold: [10, 14], oil: [14, 22], crystals: [2, 3], weights: { gold: 45, crystal: 15, oil: 1 }, xp: [5, 7], gear: 0.16,
    blurb: "Takes two blows, and the best of them: always two kinds of loot.",
  },
  {
    id: "sack", name: "Old Sack", hp: 1, second: 0.15,
    gold: [3, 5], oil: [5, 8], crystals: [1, 2], weights: { gold: 45, crystal: 35, oil: 0.5 }, xp: [1, 2], gear: 0.03,
    blurb: "A sack a lost delver left behind. One blow; mostly gold and crystals.",
  },
];

export const propDef = (kind: PropKind): PropDef => PROPS.find(p => p.id === kind) ?? PROPS[0];

export const isPropKind = (value: unknown): value is PropKind => PROPS.some(p => p.id === value);

/** How many of each a floor holds before the bigger floors' scale. Old sacks start on floor 2. */
export const propCounts = (depth: number): Record<PropKind, number> => ({
  urn: 2 + Math.floor(depth / 3),
  crate: 2 + (depth >= 3 ? 0.5 : 0),
  barrel: 0.5 + (depth >= 4 ? 0.5 : 0),
  sack: depth >= 2 ? 1 + (depth >= 5 ? 1 : 0) : 0,
});

/**
 * How likely each kind of loot is to fall out of a prop. Oil's weight is `tuning.propOilWeight` (from a full lantern to
 * an empty one) times the prop's own oil weight, so a delver running dry finds more oil in what they break.
 */
export function lootWeights(def: PropDef, light: number, maxLight: number): Record<LootKind, number> {
  const [full, empty] = tuning.propOilWeight;
  const oil = (full + (empty - full) * (1 - lanternFullness(light, maxLight))) * def.weights.oil;
  return { gold: def.weights.gold, crystal: def.weights.crystal, oil };
}

/** How full the lantern is against its current capacity, including level-up growth. */
export const lanternFullness = (light: number, maxLight: number) => Math.min(1, Math.max(0, light / Math.max(maxLight, 1)));

/** Gear found in props. Each adds to every blow for the rest of the descent; the pickaxe also breaks any prop in one blow. */
export type GearId = "sword" | "axe" | "pickaxe";

export const GEAR: Record<GearId, { name: string; damage: number; blurb: string }> = {
  sword: { name: "Rusty Sword", damage: 6, blurb: "+6 damage" },
  axe: { name: "Hand Axe", damage: 5, blurb: "+5 damage" },
  pickaxe: { name: "Miner's Pickaxe", damage: 4, blurb: "+4 damage, breaks any prop in one blow" },
};

export const GEAR_IDS = Object.keys(GEAR) as GearId[];

export const isGearId = (value: unknown): value is GearId => GEAR_IDS.includes(value as GearId);

/** Damage all gear a delver carries adds to a blow. */
export const gearDamage = (gear: readonly GearId[] | undefined) => (gear ?? []).reduce((n, g) => n + (GEAR[g]?.damage ?? 0), 0);

/** Experience a duplicate piece of gear is worth instead. */
export const GEAR_DUPLICATE_XP = 12;
