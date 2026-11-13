import { describe, expect, it } from "vitest";
import { HP_SCALE } from "./config";
import { idx } from "./dungeon";
import { ITEM_KINDS, itemName, itemStats, rollChest, type Item } from "./items";
import { isPrizeSetup, prizeSetup } from "./prize";
import { ReplayError, replayRun, validateSetup } from "./replay";
import { emptyBag, startRun } from "./run";
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

  it("can be a prize descent, in place of the dagger", () => {
    const pickaxe = { id: 1, kind: 0, rarity: 0, seed: "0" };
    expect(isPrizeSetup(prizeSetup(7))).toBe(true);
    expect(isPrizeSetup(validateSetup(prizeSetup(7, pickaxe)))).toBe(true);
    // The dagger's damage with an item, or extra flasks, is not the prize loadout.
    expect(isPrizeSetup({ ...prizeSetup(7), item: pickaxe })).toBe(false);
    expect(isPrizeSetup({ ...prizeSetup(7, pickaxe), flasks: 5 })).toBe(false);
  });

  it("starts a sword's perk at its rank, with what taking it gives", () => {
    const swordWith = (id: string, rarity: number) => {
      for (let i = 0n; i < 64n; i++) {
        const item = { kind: 2, rarity, seed: i << 8n };
        if (itemStats(item).perk!.id === id) return { id: 4, kind: 2, rarity, seed: item.seed.toString() };
      }
      throw new Error(`No sword with ${id}`);
    };
    const start = (id: string, rarity = 3) => startRun(validateSetup(prizeSetup(7, swordWith(id, rarity))));
    const plain = startRun(prizeSetup(7));
    expect(start("ember-heart").maxLight).toBe(plain.maxLight + 45);
    expect(start("ember-heart").light).toBe(plain.light + 45);
    expect(start("ember-heart", 0).maxLight).toBe(plain.maxLight + 15);
    expect(start("wide-glass").perks.radius).toBe(plain.perks.radius + 3);
    expect(start("heavy-blow").perks.damage).toBe(plain.perks.damage + 9);
    expect(start("oil-thief").perks.lightOnKill).toBe(plain.perks.lightOnKill + itemStats({ kind: 2, rarity: 3, seed: 0n }).perks.lightOnKill! + 3);
    expect(start("steady-wick").perks.stepDiscount).toBeCloseTo(plain.perks.stepDiscount + 0.24);
    expect(start("thick-coat").perks.drainReduce).toBeCloseTo(plain.perks.drainReduce + 0.3);
    expect(start("riposte").levelPerks).toEqual([{ id: "riposte", rank: 3 }]);
    // Rift Sense shows a floor's landmarks on entering it, and the first floor is entered too.
    const seenStairs = (s: ReturnType<typeof startRun>) => s.floor.seen[idx(s.floor, s.floor.stairs.x, s.floor.stairs.y)];
    expect(seenStairs(plain)).toBe(0);
    expect(seenStairs(start("rift-sense", 2))).toBe(1);
    expect(seenStairs(start("rift-sense", 0))).toBe(0);
  });

  it("leaves descents without an item exactly as before", () => {
    const plain = validateSetup(prizeSetup(7));
    expect("item" in plain).toBe(false);
    expect(replayRun(plain, ["X"]).state.levelPerks).toEqual([]);
  });

  it("keeps a server's start with the setup, in shape only (the server checks its signature)", () => {
    const start = { issued: 1_800_000_000, signature: `0x${"ab".repeat(65)}` };
    expect(validateSetup(prizeSetup(7, null, start)).start).toEqual(start);
    expect(() => validateSetup(prizeSetup(7, null, { ...start, signature: "0x12" }))).toThrow(ReplayError);
    expect(() => validateSetup(prizeSetup(7, null, { ...start, issued: -1 }))).toThrow(ReplayError);
    expect(isPrizeSetup(validateSetup(prizeSetup(7, null, start)))).toBe(true);
  });
});
