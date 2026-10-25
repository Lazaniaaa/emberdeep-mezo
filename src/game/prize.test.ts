import { describe, expect, it } from "vitest";
import { NO_PERKS, WEAPONS } from "./catalog";
import { PRIZE_FLASKS, isPrizeSetup, prizeSetup } from "./prize";
import { validateSetup } from "./replay";

describe("prize descent", () => {
  it("is the one equal loadout, and survives the server's setup check", () => {
    const setup = validateSetup(JSON.parse(JSON.stringify(prizeSetup(123))));
    expect(isPrizeSetup(setup)).toBe(true);
    expect(setup.flasks).toBe(PRIZE_FLASKS);
  });

  it("refuses anything bought in the simulated economy", () => {
    const base = prizeSetup(5);
    expect(isPrizeSetup({ ...base, flasks: PRIZE_FLASKS + 1 })).toBe(false);
    expect(isPrizeSetup({ ...base, weaponDamage: WEAPONS.emberblade.damage })).toBe(false);
    expect(isPrizeSetup({ ...base, perks: { ...NO_PERKS, goldPct: 5 } })).toBe(false);
    expect(isPrizeSetup({ ...base, bag: { ...base.bag, oil: 1 } })).toBe(false);
  });
});
