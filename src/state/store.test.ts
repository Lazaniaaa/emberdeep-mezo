import { describe, expect, it } from "vitest";
import { computeRunPerks, mergeSavedState, migrateSavedState, useGame } from "./store";
import { ANIMALS } from "@/game/animals";
import { NO_PERKS } from "@/game/catalog";
import { DRAW_MINTS, KEY_PRICE, MAX_KEYS, MAX_ROUND_RETURN, RARITY_SUPPLY, ROUND_SEED_GOLD, ROUND_SEED_POOL, START_KEYS, WORLD_MINT_SEED } from "@/game/config";
import { ARMORS } from "@/game/catalog";
import { mintsLeft, rollSigilRarity } from "@/game/economy";
import { withTuning } from "@/game/tuning";
import { applyAction, emptyBag, startRun } from "@/game/run";

describe("saved game recovery", () => {
  it("keeps the delver's animal, and deals one to a save from before animals", () => {
    const current = useGame.getState();
    expect(ANIMALS).toContain(current.animal);
    expect(mergeSavedState({ animal: "dog-husky" }, current).animal).toBe("dog-husky");
    expect(ANIMALS).toContain(mergeSavedState({}, current).animal);
    expect(ANIMALS).toContain(mergeSavedState({ animal: "dragon" }, current).animal);
  });

  it("recovers from missing and malformed nested data without losing store actions", () => {
    const current = useGame.getState();
    const restored = mergeSavedState({
      balance: 125, potions: null, stats: null, weapons: null, heroes: [null],
      hero: null, log: [null], lastReport: { outcome: "dead" },
      lastDraw: { prizes: null }, tickets: -4, pool: "broken",
    }, current);

    expect(restored.balance).toBe(125);
    expect(restored.pool).toBe(current.pool);
    expect(restored.potions.nightVision).toBe(1);
    expect(restored.potions.ward).toBe(0);
    expect(restored.stats.runs).toBe(0);
    expect(restored.weapons).toEqual(["fists"]);
    expect(restored.heroes).toEqual([]);
    expect(restored.lastReport).toBeNull();
    expect(restored.lastDraw).toBeNull();
    expect(restored.tickets).toBe(0);
    expect(restored.payForRun).toBe(current.payForRun);
  });

  it("preserves valid progress and fills missing potion fields", () => {
    const current = useGame.getState();
    const restored = mergeSavedState({
      balance: 345, pool: 1_234, potions: { oil: 3 },
      weapons: ["dagger"], weapon: "dagger", stats: { runs: 9, extracts: 4 },
      hero: { kind: "wanderer" },
    }, current);

    expect(restored.balance).toBe(345);
    expect(restored.pool).toBe(1_234);
    expect(restored.potions).toEqual({ nightVision: 1, oil: 3, flare: 0, ward: 0, rage: 0, regen: 0, heal: 0 });
    expect(restored.weapons).toEqual(["fists", "dagger"]);
    expect(restored.weapon).toBe("dagger");
    expect(restored.stats).toMatchObject({ runs: 9, extracts: 4, deaths: 0 });
  });
});

describe("run settlement", () => {
  it("applies the equipped Emberblade's light gain on a kill", () => {
    useGame.getState().reset();
    useGame.setState({ weapons: ["fists", "emberblade"], weapon: "emberblade" });
    const perks = computeRunPerks(useGame.getState());
    const started = startRun({ seed: 7, flasks: 2, perks, weaponDamage: 5, bag: emptyBag() });
    started.light -= 20; // Test accepted blade light, not intentional loss at a full lantern.
    started.floor.dimlings = [{ id: 1, x: started.player.x + 1, y: started.player.y, hp: 1, maxHp: 1, awake: true }];
    // A defeated creature may also drop oil; switch that off to count only what the blade gives.
    const after = withTuning({ killDropChance: [0, 0] }, () => applyAction(started, { type: "move", dx: 1, dy: 0 }));
    expect(after.kills).toBe(1);
    // A blow burns no light (only steps do), so the light grows by exactly the blade's gain.
    expect(after.light).toBe(started.light + 4);
    useGame.getState().reset();
  });

  it("does not charge twice when starting a run twice", () => {
    useGame.getState().reset();
    expect(useGame.getState().payForRun()).toBe(true);
    const balance = useGame.getState().balance;
    expect(useGame.getState().payForRun()).toBe(false);
    expect(useGame.getState().balance).toBe(balance);
    useGame.getState().reset();
  });

  it("does not pay out or award tickets twice for the same finished run", () => {
    useGame.getState().reset();
    expect(useGame.getState().payForRun()).toBe(true);
    const started = startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() });
    const extracted = applyAction(started, { type: "extract" });
    extracted.gold = 100;
    extracted.tickets = 2;
    const first = useGame.getState().finishRun(extracted);
    const afterFirst = useGame.getState();
    const second = afterFirst.finishRun(extracted);
    const afterSecond = useGame.getState();
    expect(second).toEqual(first);
    expect(afterSecond.balance).toBe(afterFirst.balance);
    expect(afterSecond.pool).toBe(afterFirst.pool);
    expect(afterSecond.tickets).toBe(2);
    expect(afterSecond.stats.runs).toBe(1);
    useGame.getState().reset();
  });

  it("counts a slain boss once, even when the delver does not make it home", () => {
    useGame.getState().reset();
    expect(useGame.getState().payForRun()).toBe(true);
    const started = startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() });
    const dead = { ...started, status: "dead" as const, bossSlain: true };
    const report = useGame.getState().finishRun(dead);
    expect(report.bossSlain).toBe(true);
    expect(useGame.getState().stats.bosses).toBe(1);
    useGame.getState().finishRun(dead);
    expect(useGame.getState().stats.bosses).toBe(1);
    useGame.getState().reset();
  });

  it("needs an entry key to start a descent and spends exactly one", () => {
    useGame.getState().reset();
    const start = useGame.getState();
    expect(start.keys).toBe(START_KEYS);
    expect(start.payForRun()).toBe(true);
    expect(useGame.getState().keys).toBe(START_KEYS - 1);
    useGame.setState({ keys: 0, runSpent: 0 });
    const balance0 = useGame.getState().balance;
    expect(useGame.getState().payForRun()).toBe(false);
    expect(useGame.getState().balance).toBe(balance0);
    useGame.getState().reset();
  });

  it("frees a paid run whose progress was lost, counting it as a death", () => {
    useGame.getState().reset();
    expect(useGame.getState().abandonRun()).toBe(false);
    expect(useGame.getState().payForRun()).toBe(true);
    expect(useGame.getState().payForRun()).toBe(false);
    const balance0 = useGame.getState().balance;
    expect(useGame.getState().abandonRun()).toBe(true);
    const after = useGame.getState();
    expect(after.runSpent).toBe(0);
    expect(after.stats.deaths).toBe(1);
    expect(after.stats.runs).toBe(1);
    expect(after.balance).toBe(balance0);
    expect(after.payForRun()).toBe(true);
    useGame.getState().reset();
  });

  it("sells keys through the same 60/7/33 split", () => {
    useGame.getState().reset();
    const before = useGame.getState();
    useGame.getState().buyKey(2);
    const after = useGame.getState();
    expect(after.keys).toBe(before.keys + 2);
    expect(after.balance).toBe(before.balance - 2 * KEY_PRICE);
    expect(after.revenue - before.revenue).toBeCloseTo(2 * KEY_PRICE * 0.33);
    expect(after.pool - before.pool).toBeCloseTo(2 * KEY_PRICE * 0.6);
    expect(after.locked - before.locked).toBeCloseTo(2 * KEY_PRICE * 0.07);
    expect(() => useGame.getState().buyKey(MAX_KEYS)).toThrow();
    useGame.getState().reset();
  });

  it("banks gold only from runs that make it home, and never pays it out at once", () => {
    useGame.getState().reset();
    for (const status of ["extracted", "dead"] as const) {
      useGame.getState().payForRun();
      const before = useGame.getState();
      const run = { ...startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() }), status, gold: 120 };
      const report = useGame.getState().finishRun(run);
      const after = useGame.getState();
      expect(report.payout).toBe(0);
      expect(after.balance).toBe(before.balance);
      expect(after.pool).toBe(before.pool);
      expect(after.roundGold).toBe(before.roundGold + (status === "extracted" ? 120 : 0));
    }
    useGame.getState().reset();
  });

  it("closes a round by gold share, then opens the next with a fresh crowd", () => {
    useGame.getState().reset();
    expect(useGame.getState().claimRound()).toBeNull();
    useGame.setState({ pool: 10_000, roundGold: 100, roundSpent: 1_000, fieldGold: 9_900 });
    const balance0 = useGame.getState().balance;
    const result = useGame.getState().claimRound()!;
    const after = useGame.getState();
    expect(result.share).toBeCloseTo(0.01);
    expect(result.payout).toBe(100);
    expect(after.balance).toBe(balance0 + 100);
    expect(after.returned).toBe(100);
    expect(after.round).toBe(2);
    expect(after.roundGold).toBe(0);
    expect(after.roundSpent).toBe(0);
    expect(after.fieldGold).toBe(ROUND_SEED_GOLD);
    expect(after.pool).toBeCloseTo(ROUND_SEED_POOL);
    expect(after.stats.bestPayout).toBe(100);
    useGame.getState().reset();
  });

  it("counts every descent's key and oil toward the round's return cap, whether or not the delver made it home", () => {
    useGame.getState().reset();
    for (const status of ["extracted", "dead"] as const) {
      useGame.getState().payForRun();
      const before = useGame.getState();
      const run = { ...startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() }), status, gold: 50 };
      useGame.getState().finishRun(run);
      expect(useGame.getState().roundSpent).toBeCloseTo(before.roundSpent + KEY_PRICE + before.runSpent, 6);
    }
    useGame.getState().payForRun();
    const beforeAbandon = useGame.getState();
    useGame.getState().abandonRun();
    expect(useGame.getState().roundSpent).toBeCloseTo(beforeAbandon.roundSpent + KEY_PRICE + beforeAbandon.runSpent, 6);
    useGame.getState().reset();
  });

  it("pays at most the return cap when a round closes, and keeps the rest in the pool for the next round", () => {
    useGame.getState().reset();
    useGame.setState({ pool: 10_000, roundGold: 900, roundSpent: 100, fieldGold: 100 });
    const balance0 = useGame.getState().balance;
    const result = useGame.getState().claimRound()!;
    const after = useGame.getState();
    expect(result.payout).toBe(MAX_ROUND_RETURN * 100);
    expect(result.withheld).toBe(9_000 - result.payout);
    expect(after.balance).toBe(balance0 + result.payout);
    expect(after.pool).toBeCloseTo(result.withheld + ROUND_SEED_POOL, 1);
    expect(after.roundSpent).toBe(0);
    useGame.getState().reset();
  });

  it("adds a simulated crowd to the pool, the gold and the draw together", () => {
    useGame.getState().reset();
    const before = useGame.getState();
    before.addFieldWeek();
    const after = useGame.getState();
    expect(after.pool).toBeGreaterThan(before.pool);
    expect(after.fieldGold).toBeGreaterThan(before.fieldGold);
    expect(after.locked).toBeGreaterThan(before.locked);
    expect(after.fieldLockGold).toBeGreaterThan(before.fieldLockGold);
    expect(after.fieldTickets).toBeGreaterThan(before.fieldTickets);
    useGame.getState().reset();
  });

  it("gives an in-progress round of an older save a cap that does not zero its payout", () => {
    const mid = migrateSavedState({ balance: 500, roundGold: 240 }, 5) as Record<string, unknown>;
    expect(mid.roundSpent).toBe(240);
    const fresh = migrateSavedState({ balance: 500, roundGold: 0 }, 5) as Record<string, unknown>;
    expect(fresh.roundSpent).toBe(0);
  });

  it("resets the meaningless old pool when a pre-round save is migrated", () => {
    const old = migrateSavedState({ balance: 500, pool: 251_234 }, 3) as Record<string, unknown>;
    expect(old.pool).toBe(ROUND_SEED_POOL);
    expect(old.keys).toBe(START_KEYS);
    expect(old.round).toBe(1);
    expect(old.balance).toBe(500);
  });

  it("tops an older save up to a hundred keys, and keeps more if it has them", () => {
    expect(START_KEYS).toBe(100);
    expect((migrateSavedState({ balance: 500, keys: 0 }, 7) as Record<string, unknown>).keys).toBe(100);
    expect((migrateSavedState({ balance: 500, keys: 140 }, 7) as Record<string, unknown>).keys).toBe(140);
  });
});

describe("weekly draw", () => {
  it("mints a free Delver for each ticket that wins, counts it against the supply and clears the drum", () => {
    useGame.getState().reset();
    useGame.setState({ tickets: 5, fieldTickets: 0 });
    const before = useGame.getState();
    const draw = useGame.getState().drawRaffle()!;
    const after = useGame.getState();
    const won = draw.prizes.filter(p => p.fate === "you");
    expect(won).toHaveLength(DRAW_MINTS);
    expect(won.every(p => p.rarity !== undefined)).toBe(true);
    expect(after.heroes.filter(h => h.source === "draw")).toHaveLength(DRAW_MINTS);
    const minted = Object.values(after.minted).reduce((a, b) => a + b, 0) - Object.values(before.minted).reduce((a, b) => a + b, 0);
    expect(minted).toBe(DRAW_MINTS);
    expect(after.stats.mints).toBe(before.stats.mints + DRAW_MINTS);
    expect(after.balance).toBe(before.balance);
    expect(after.tickets).toBe(0);
    expect(after.fieldTickets).toBe(0);
    expect(after.week).toBe(before.week + 1);
    useGame.getState().reset();
  });

  it("draws nothing without tickets, and skips a win when every Delver is minted", () => {
    useGame.getState().reset();
    expect(useGame.getState().drawRaffle()).toBeNull();
    useGame.setState({ tickets: 3, fieldTickets: 0, minted: { common: 10_000, rare: 10_000, epic: 10_000, legendary: 10_000 } });
    const draw = useGame.getState().drawRaffle()!;
    expect(draw.prizes.every(p => p.rarity === undefined)).toBe(true);
    expect(useGame.getState().heroes).toHaveLength(0);
    useGame.getState().reset();
  });
});

describe("supply, armor and drop-only potions", () => {
  it("never sells the Healing Draught, for USDC or for crystals", () => {
    useGame.getState().reset();
    useGame.setState({ balance: 5_000, crystals: 500 });
    expect(() => useGame.getState().buyPotion("heal", "usdc")).toThrow();
    expect(() => useGame.getState().buyPotion("heal", "crystals")).toThrow();
    expect(useGame.getState().potions.heal).toBe(0);
    useGame.getState().buyPotion("rage", "usdc");
    useGame.getState().buyPotion("regen", "crystals");
    expect(useGame.getState().potions.rage).toBe(1);
    expect(useGame.getState().potions.regen).toBe(1);
    useGame.getState().reset();
  });

  it("carries a Healing Draught found in a run home only if the delver extracts", () => {
    useGame.getState().reset();
    for (const status of ["extracted", "dead"] as const) {
      useGame.getState().payForRun();
      const before = useGame.getState().potions.heal;
      const run = { ...startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() }), status };
      run.bag.heal = 1; run.found.heal = 1;
      useGame.getState().finishRun(run);
      expect(useGame.getState().potions.heal).toBe(before + (status === "extracted" ? 1 : 0));
    }
    useGame.getState().reset();
  });

  it("buys, wears and stacks armor into the run perks", () => {
    useGame.getState().reset();
    useGame.setState({ balance: 2_000, crystals: 100 });
    useGame.getState().buyArmor("chain");
    const s = useGame.getState();
    expect(s.armor).toBe("chain");
    expect(s.balance).toBe(2_000 - ARMORS.chain.price);
    expect(s.crystals).toBe(100 - ARMORS.chain.crystals);
    expect(computeRunPerks(s).drainReduce).toBeCloseTo(0.3);
    useGame.getState().equipArmor("none");
    expect(computeRunPerks(useGame.getState()).drainReduce).toBe(0);
    useGame.getState().reset();
  });

  it("caps each rarity at its supply and refuses to mint past it", () => {
    expect(RARITY_SUPPLY).toEqual({ common: 999, rare: 111, epic: 69, legendary: 11 });
    for (const r of ["common", "rare", "epic", "legendary"] as const) {
      expect(WORLD_MINT_SEED[r]).toBeLessThan(RARITY_SUPPLY[r]);
      expect(mintsLeft(r, 0)).toBe(RARITY_SUPPLY[r] - WORLD_MINT_SEED[r]);
      expect(mintsLeft(r, 10_000)).toBe(0);
    }
    useGame.getState().reset();
    useGame.setState({ balance: 100_000 });
    const left = mintsLeft("legendary", 0);
    const first = useGame.getState().mint("legendary");
    expect(first.edition).toBe(WORLD_MINT_SEED.legendary + 1);
    for (let i = 1; i < left; i++) useGame.getState().mint("legendary");
    const last = useGame.getState().heroes[0];
    expect(last.edition).toBe(RARITY_SUPPLY.legendary);
    expect(() => useGame.getState().mint("legendary")).toThrow(/minted/);
    expect(useGame.getState().minted.legendary).toBe(left);
    useGame.getState().reset();
  });

  it("never lets a Soul Sigil mint a sold-out rarity", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(rollSigilRarity(seed, ["common", "rare"])).toMatch(/^(common|rare)$/);
    }
    expect(() => rollSigilRarity(1, [])).toThrow();

    useGame.getState().reset();
    useGame.setState({ minted: { common: 0, rare: 0, epic: 0, legendary: mintsLeft("legendary", 0) } });
    useGame.getState().payForRun();
    const run = { ...startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() }), status: "extracted" as const, sigils: 60 };
    const report = useGame.getState().finishRun(run);
    expect(report.minted).toHaveLength(60);
    expect(report.minted.some(h => h.rarity === "legendary")).toBe(false);
    for (const r of ["common", "rare", "epic", "legendary"] as const) {
      expect(WORLD_MINT_SEED[r] + useGame.getState().minted[r]).toBeLessThanOrEqual(RARITY_SUPPLY[r]);
    }
    useGame.getState().reset();
  });
});

describe("carrying potions into a descent", () => {
  it("takes the potions out of the inventory when the descent starts", () => {
    useGame.getState().reset();
    useGame.setState({ potions: { nightVision: 1, oil: 2, flare: 0, ward: 3, rage: 0, regen: 0, heal: 0 } });
    expect(useGame.getState().payForRun()).toBe(true);
    const s = useGame.getState();
    expect(s.potions).toEqual({ nightVision: 0, oil: 0, flare: 0, ward: 0, rage: 0, regen: 0, heal: 0 });
    expect(s.carried).toMatchObject({ nightVision: 1, oil: 2, ward: 3 });
    expect(s.runId).toBeTruthy();
    useGame.getState().reset();
  });

  it("gives back only what the delver did not use, and found potions only after extracting", () => {
    for (const status of ["extracted", "dead"] as const) {
      useGame.getState().reset();
      useGame.setState({ potions: { nightVision: 0, oil: 0, flare: 0, ward: 2, rage: 0, regen: 0, heal: 0 } });
      useGame.getState().payForRun();
      const paid = useGame.getState();
      const run = { ...startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: { ...paid.carried }, runId: paid.runId ?? undefined }), status };
      run.bag.ward -= 1; run.used.ward = 1;          // one Ward was drunk
      run.bag.rage += 1; run.found.rage = 1;         // one Rage Potion was found
      useGame.getState().finishRun(run);
      const after = useGame.getState().potions;
      expect(after.ward).toBe(1);
      expect(after.rage).toBe(status === "extracted" ? 1 : 0);
    }
    useGame.getState().reset();
  });

  it("loses the pack when the tab is closed mid-descent", () => {
    useGame.getState().reset();
    useGame.setState({ potions: { nightVision: 1, oil: 0, flare: 0, ward: 4, rage: 0, regen: 0, heal: 0 } });
    useGame.getState().payForRun();
    expect(useGame.getState().abandonRun()).toBe(true);
    const s = useGame.getState();
    expect(s.potions.ward).toBe(0);
    expect(s.carried.ward).toBe(0);
    expect(s.runId).toBeNull();
    useGame.getState().reset();
  });

  it("keeps the cents of the best claim across a reload", () => {
    const restored = mergeSavedState({ stats: { bestPayout: 47.68, runs: 3.5, extracts: 2 } }, useGame.getState());
    expect(restored.stats.bestPayout).toBe(47.68);
    expect(restored.stats.runs).toBe(0);
    expect(restored.stats.extracts).toBe(2);
  });
});


describe("the crystal economy of the Mezo release", () => {
  it("has no money: practice keys and oil are free, the shop costs crystals, and a practice descent settles", async () => {
    const { campMode, PRACTICE_KEYS } = await import("@/lib/camp-mode");
    const { WEAPONS } = await import("@/game/catalog");
    const { startRun: start, emptyBag: bag } = await import("@/game/run");
    const { NO_PERKS: none } = await import("@/game/catalog");
    campMode.crystals = true;
    try {
      useGame.getState().reset();
      const before = useGame.getState();
      expect(useGame.getState().payForRun()).toBe(true);
      const paid = useGame.getState();
      expect(paid.balance).toBe(before.balance);
      expect(paid.keys).toBe(before.keys - 1);
      const run = { ...start({ seed: 3, flasks: 2, perks: none, weaponDamage: 8, bag: bag(), runId: paid.runId! }), status: "extracted" as const, gold: 40, crystals: 30 };
      expect(useGame.getState().finishRun(run).outcome).toBe("extracted");
      expect(useGame.getState().crystals).toBe(before.crystals + 30);

      expect(() => useGame.getState().buyWeapon("emberblade")).toThrow(/crystals/);
      useGame.getState().buyWeapon("dagger"); // 60 cents = 6 crystals
      expect(useGame.getState().weapons).toContain("dagger");
      expect(useGame.getState().crystals).toBe(before.crystals + 30 - Math.ceil(WEAPONS.dagger.price / 10) - WEAPONS.dagger.crystals);
      expect(useGame.getState().balance).toBe(before.balance);

      useGame.setState({ keys: 3 });
      useGame.getState().refillKeys();
      expect(useGame.getState().keys).toBe(PRACTICE_KEYS);
    } finally {
      campMode.crystals = false;
      useGame.getState().reset();
    }
  });
});
