import { describe, expect, it } from "vitest";
import { HP_SCALE } from "./config";
import { ITEM_KINDS, itemName, itemStats, rollChest, type Item } from "./items";
import { isPrizeSetup, prizeSetup } from "./prize";
import { ReplayError, replayRun, validateSetup } from "./replay";
import { emptyBag } from "./run";
import { NO_PERKS } from "./catalog";

/** A 32-byte roll whose first four words are the given fractions of 2^32, then a fixed seed. */
const roll = (chance: number, kind: number, rarity: number, seed = "00000000000000ff") =>
  `0x${[chance, kind, rarity].map(f => Math.floor(f * 2 ** 32).toString(16).padStart(8, "0")).join("")}${seed}${"0".repeat(64 - 24 - 16)}`;

describe("found weapons", () => {
  it("rolls kind and rarity by their weights", () => {
    expect(rollChest(roll(0, 0, 0))).toEqual({ kind: 0, rarity: 0, seed: 255n });
    expect(rollChest(roll(0, 0.399, 0.699))).toMatchObject({ kind: 0, rarity: 0 }); // pickaxe 40%, common 70%
    expect(rollChest(roll(0, 0.401, 0.701))).toMatchObject({ kind: 1, rarity: 1 }); // axe, rare
    expect(rollChest(roll(0, 0.76, 0.93))).toMatchObject({ kind: 2, rarity: 2 }); // sword, epic
    expect(rollChest(roll(0, 0.96, 0.986))).toMatchObject({ kind: 3, rarity: 3 }); // spear, legendary
  });

  it("leaves the chest empty past the chest chance", () => {
    expect(rollChest(roll(0.99, 0, 0))).not.toBeNull(); // 100% on testnet
    expect(rollChest(roll(0.19, 0, 0), 0.2)).not.toBeNull();
    expect(rollChest(roll(0.21, 0, 0), 0.2)).toBeNull();
    expect(() => rollChest("0x1234")).toThrow();
  });

  it("gives each kind and rarity its stats", () => {
    const at = (kind: number, rarity: number, seed = 0n) => itemStats({ kind, rarity, seed });
    expect(at(0, 0)).toEqual({ damage: 1.5 * HP_SCALE, perks: { lightOnKill: 0, goldPct: 15 }, perk: null });
    expect(at(1, 2).damage).toBe(4.5 * HP_SCALE);
    expect(at(3, 3)).toMatchObject({ damage: 7 * HP_SCALE, perks: { lightOnKill: 5 } });
    expect(at(2, 0).perk?.rank).toBe(1);
    expect(at(2, 3).perk?.rank).toBe(3);
    expect(new Set(Array.from({ length: 64 }, (_, i) => at(2, 0, BigInt(i) << 8n).perk!.id)).has("hungry-flame")).toBe(false);
    expect(itemName({ kind: 1, rarity: 0, seed: 5n })).toBe("Moonlit Axe");
    expect(ITEM_KINDS).toEqual(["pickaxe", "axe", "sword", "spear"]);
  });
});

describe("a descent with a found weapon", () => {
  const sword: Item = { kind: 2, rarity: 2, seed: 3n << 8n };
  const setup = (over: Record<string, unknown> = {}) => ({
    seed: 7, flasks: 3, perks: { ...NO_PERKS }, bag: emptyBag(),
    weaponDamage: itemStats(sword).damage, item: { id: 4, kind: 2, rarity: 2, seed: sword.seed.toString() }, ...over,
  });

  it("starts with the item's damage, perks and level perk", () => {
    const { state } = replayRun(setup(), ["X"]);
    const stats = itemStats(sword);
    expect(state.weaponDamage).toBe(stats.damage);
    expect(state.levelPerks).toEqual([stats.perk]);
  });

  it("is refused when the weapon damage does not match the item, or the item is malformed", () => {
    expect(() => validateSetup(setup({ weaponDamage: 2 * HP_SCALE }))).toThrow(ReplayError);
    expect(() => validateSetup(setup({ item: { id: 4, kind: 9, rarity: 0, seed: "1" } }))).toThrow(ReplayError);
    expect(() => validateSetup(setup({ item: { id: 0, kind: 2, rarity: 2, seed: "768" } }))).toThrow(ReplayError);
    expect(() => validateSetup(setup({ item: { id: 4, kind: 2, rarity: 2, seed: "-1" } }))).toThrow(ReplayError);
  });

  it("is never a prize descent", () => {
    const prize = prizeSetup(7);
    expect(isPrizeSetup(prize)).toBe(true);
    expect(isPrizeSetup({ ...prize, item: { id: 1, kind: 0, rarity: 0, seed: "0" } })).toBe(false);
  });

  it("leaves descents without an item exactly as before", () => {
    const plain = validateSetup(prizeSetup(7));
    expect("item" in plain).toBe(false);
    expect(replayRun(plain, ["X"]).state.levelPerks).toEqual([]);
  });
});
