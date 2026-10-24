import { describe, expect, it } from "vitest";
import { NO_PERKS } from "./catalog";
import { idx } from "./dungeon";
import { applyAction, emptyBag, startRun, type RunState } from "./run";
import { DEFAULT_TUNING, tuning, withTuning } from "./tuning";

/** An open 11 x 11 room with the delver in the middle and one sleeping creature beside them, about to fall. */
function fight(seed: number): RunState {
  const s = startRun({ seed, flasks: 2, perks: NO_PERKS, weaponDamage: 16, bag: emptyBag() });
  s.floor.tiles.fill(0);
  for (let y = 2; y <= 12; y++) for (let x = 2; x <= 12; x++) s.floor.tiles[idx(s.floor, x, y)] = 1;
  s.floor.items = [];
  s.floor.props = [];
  s.player = { x: 6, y: 6, facing: "right" };
  s.floor.dimlings = [{ id: 1, x: 7, y: 6, hp: 1, maxHp: 1, awake: false, species: "wickgnaw", phase: "idle", windupLeft: 0, cooldown: 0, aim: null }];
  return s;
}

const strike = (s: RunState) => applyAction(s, { type: "move", dx: 1, dy: 0 });

describe("the oil the deep gives back", () => {
  it("keeps every knob in a sane range", () => {
    const range = DEFAULT_TUNING.killDropChance;
    expect(range[0]).toBeGreaterThanOrEqual(0);
    expect(range[1]).toBeLessThanOrEqual(1);
    // A nearly empty lantern is helped more than a full one, never less.
    expect(range[1]).toBeGreaterThanOrEqual(range[0]);
    expect(DEFAULT_TUNING.propOilWeight[1]).toBeGreaterThanOrEqual(DEFAULT_TUNING.propOilWeight[0]);
    expect(DEFAULT_TUNING.propOilWeight[0]).toBeGreaterThan(0);
    // The +30% test setting; anything from none extra to double is sane.
    expect(DEFAULT_TUNING.dropOil).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_TUNING.dropOil).toBeLessThanOrEqual(2);
    expect(DEFAULT_TUNING.killDropLight[1]).toBeGreaterThanOrEqual(DEFAULT_TUNING.killDropLight[0]);
    expect(DEFAULT_TUNING.killDropLight[0]).toBeGreaterThan(0);
  });

  it("lets a defeated creature drop oil, more often the lower the lantern is", () => {
    const dropRate = (light: number) => {
      let drops = 0;
      const trials = 500;
      for (let seed = 1; seed <= trials; seed++) {
        let s = fight(seed);
        s.startLight = s.maxLight = 160; s.light = light;
        const before = s.light;
        s = strike(s);
        expect(s.events).toContain("kill");
        if (s.events.includes("oil")) {
          drops++;
          const gained = s.light - before;
          // The step costs a little; the oil is what the creature held.
          const scaled = (n: number) => Math.round(n * DEFAULT_TUNING.dropOil);
          expect(gained).toBeGreaterThanOrEqual(Math.min(scaled(DEFAULT_TUNING.killDropLight[0]),s.maxLight-before) - 1.5);
          expect(gained).toBeLessThanOrEqual(scaled(DEFAULT_TUNING.killDropLight[1]) + DEFAULT_TUNING.levelLight);
          if(gained>0)expect(s.messages.some(m => m.includes("defeated") && m.includes("light"))).toBe(true);
          else expect(s.messages.some(m=>m.includes("Lantern full"))).toBe(true);
        }
      }
      return drops / trials;
    };
    const low = dropRate(10), high = dropRate(160);
    expect(low).toBeGreaterThan(high + 0.3);
    expect(high).toBeGreaterThan(0.2);
    expect(high).toBeLessThan(0.5);
    expect(low).toBeGreaterThan(0.65);
  });

  it("changes what the game does when a knob is turned, and puts it back afterwards", () => {
    const drops = (seedCount: number) => {
      let n = 0;
      for (let seed = 1; seed <= seedCount; seed++) if (strike(fight(seed)).events.includes("oil")) n++;
      return n;
    };
    const normal = drops(100);
    expect(normal).toBeGreaterThan(0);
    expect(withTuning({ killDropChance: [0, 0] }, () => drops(100))).toBe(0);
    expect(withTuning({ killDropChance: [1, 1], killDropLight: [7, 7] }, () => drops(100))).toBe(100);
    expect(tuning.killDropChance).toEqual(DEFAULT_TUNING.killDropChance);
    expect(() => withTuning({ oilJarLight: 99 }, () => { throw new Error("boom"); })).toThrow("boom");
    expect(tuning.oilJarLight).toBe(DEFAULT_TUNING.oilJarLight);
  });

  it("pours the tuned amount into the lantern from an oil jar", () => {
    const s = fight(3);
    s.floor.dimlings = [];
    s.light -= 30; // Measure an accepted jar, not intentional overflow from a full lantern.
    s.floor.items = [{ id: 5, x: 7, y: 6, kind: "oil" }];
    const light = s.light;
    const next = withTuning({ oilJarLight: 13, dropOil: 1 }, () => strike(s));
    expect(next.light).toBeGreaterThanOrEqual(light + 13 - 1.01);
    expect(next.messages[0]).toContain("+13 light");
    // All dropped oil is scaled together: +30% turns 13 into 17.
    const richer = withTuning({ oilJarLight: 13, dropOil: 1.3 }, () => strike(s));
    expect(richer.messages[0]).toContain("+17 light");
  });
});
