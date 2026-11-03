// Weapons found in the deep, which live on chain as EmberItems NFTs (contracts/EmberItems.sol). Slaying Cerberus and
// coming home earns a chest; the signing server rolls what is inside from a secret and the descent's runId, so nobody can
// work out the roll before playing. An item is a kind, a rarity and a seed; this file decides what those mean. The chain
// stores only the numbers, so the kind and rarity lists below must only ever grow at the end.
import { HP_SCALE } from "./config";
import { RARITIES, RARITY_INFO, type Perks, type Rarity } from "./catalog";
import { PERK_IDS, type LevelPerkId, type PerkRank, type RunPerk } from "./level-perks";

export type ItemKind = "pickaxe" | "axe" | "sword" | "spear";

/** Index = the kind number on chain. */
export const ITEM_KINDS: readonly ItemKind[] = ["pickaxe", "axe", "sword", "spear"];

type KindDef = {
  name: string;
  damage: number;
  lightOnKill: number;
  goldPct: number;
  /** The sword carries a level perk, chosen by the item's seed. */
  perk: boolean;
  /** Relative chance in a chest. */
  weight: number;
  blurb: string;
};

export const ITEM_KIND_INFO: Record<ItemKind, KindDef> = {
  pickaxe: { name: "Pickaxe", damage: 1.5 * HP_SCALE, lightOnKill: 0, goldPct: 15, perk: false, weight: 40, blurb: "Made for rock, not for dimlings. +15% gold." },
  axe: { name: "Axe", damage: 4 * HP_SCALE, lightOnKill: 0, goldPct: 0, perk: false, weight: 35, blurb: "Plain, heavy and honest." },
  sword: { name: "Sword", damage: 3 * HP_SCALE, lightOnKill: 0, goldPct: 0, perk: true, weight: 20, blurb: "Found only in the deep. Carries a level perk." },
  spear: { name: "Spear", damage: 6 * HP_SCALE, lightOnKill: 3, goldPct: 0, perk: false, weight: 5, blurb: "The rarest find: long reach, +3 light per kill." },
};

/** What each rarity adds on top of the kind, and its chance in a chest. Index = the rarity number on chain. */
export const ITEM_RARITY: Record<Rarity, { weight: number; lightOnKill: number; damage: number; perkRank: PerkRank }> = {
  common: { weight: 700, lightOnKill: 0, damage: 0, perkRank: 1 },
  rare: { weight: 220, lightOnKill: 1, damage: 0, perkRank: 1 },
  epic: { weight: 65, lightOnKill: 1, damage: HP_SCALE / 2, perkRank: 2 },
  legendary: { weight: 15, lightOnKill: 2, damage: HP_SCALE, perkRank: 3 },
};

/** The finish a seed gives an item: part of its name and the tint of its icon. */
export const ITEM_FINISHES = [
  { name: "Ashen", tint: "#9a948c" },
  { name: "Cinder", tint: "#e0703a" },
  { name: "Gloomsteel", tint: "#5f6f8f" },
  { name: "Mossbound", tint: "#6f9a52" },
  { name: "Bonewhite", tint: "#e8e0cc" },
  { name: "Moonlit", tint: "#9fc4ff" },
  { name: "Bloodrust", tint: "#a8382f" },
  { name: "Starforged", tint: "#ffd76a" },
] as const;

/** Perks a sword may carry: every level perk except the one that trades light for damage. */
const SWORD_PERKS = PERK_IDS.filter(id => id !== "hungry-flame");

/** Chance that slaying Cerberus leaves a chest with an item. 100% on Mezo Testnet; 20% is planned for mainnet. */
export const CHEST_CHANCE = 1;
export const MAINNET_CHEST_CHANCE = 0.2;

/** An item as the chain stores it. */
export type Item = { kind: number; rarity: number; seed: bigint };
/** An item the player holds, with its token id. */
export type OwnedItem = Item & { id: number };

export const isItem = (i: Item) =>
  Number.isSafeInteger(i.kind) && i.kind >= 0 && i.kind < ITEM_KINDS.length
  && Number.isSafeInteger(i.rarity) && i.rarity >= 0 && i.rarity < RARITIES.length
  && i.seed >= 0n && i.seed < 1n << 64n;

export const kindOf = (i: Item) => ITEM_KINDS[i.kind]!;
export const rarityOf = (i: Item): Rarity => RARITIES[i.rarity]!;
export const finishOf = (i: Item) => ITEM_FINISHES[Number(i.seed % BigInt(ITEM_FINISHES.length))]!;
export const itemName = (i: Item) => `${finishOf(i).name} ${ITEM_KIND_INFO[kindOf(i)].name}`;
export const itemColor = (i: Item) => RARITY_INFO[rarityOf(i)].color;

export type ItemStats = { damage: number; perks: Partial<Perks>; perk: RunPerk | null };

/** What an item does in a descent: its damage, the perks it adds, and the sword's level perk. */
export function itemStats(i: Item): ItemStats {
  const kind = ITEM_KIND_INFO[kindOf(i)];
  const rarity = ITEM_RARITY[rarityOf(i)];
  const perkId: LevelPerkId | null = kind.perk ? SWORD_PERKS[Number((i.seed >> 8n) % BigInt(SWORD_PERKS.length))]! : null;
  return {
    damage: kind.damage + rarity.damage,
    perks: { lightOnKill: kind.lightOnKill + rarity.lightOnKill, goldPct: kind.goldPct },
    perk: perkId ? { id: perkId, rank: rarity.perkRank } : null,
  };
}

/** Picks from weighted entries with `r` in [0, 1). */
function weighted<T>(entries: readonly (readonly [T, number])[], r: number): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let at = r * total;
  for (const [value, w] of entries) {
    if (at < w) return value;
    at -= w;
  }
  return entries.at(-1)![0];
}

/** Reads 32 bits of a 32-byte hex roll as a number in [0, 1). */
const unit = (roll: string, word: number) => parseInt(roll.slice(2 + word * 8, 10 + word * 8), 16) / 2 ** 32;

/**
 * What a chest holds, from a 32-byte roll (the server's HMAC of the runId). Null when the chest is empty, which only
 * happens when the chest chance is below 100%.
 */
export function rollChest(roll: string, chance = CHEST_CHANCE): Item | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(roll)) throw new Error("A roll is 32 bytes of hex");
  if (unit(roll, 0) >= chance) return null;
  const kind = weighted(ITEM_KINDS.map((k, i) => [i, ITEM_KIND_INFO[k].weight] as const), unit(roll, 1));
  const rarity = weighted(RARITIES.map((r, i) => [i, ITEM_RARITY[r].weight] as const), unit(roll, 2));
  const seed = BigInt(`0x${roll.slice(26, 42)}`);
  return { kind, rarity, seed };
}
