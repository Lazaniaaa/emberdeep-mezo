import { describe, expect, it } from "vitest";
import { NO_PERKS } from "./catalog";
import { lootMultiplier } from "./config";
import { distances, generateFloor, hasFloorDecor, idx, isFloor, type Dimling, type Prop } from "./dungeon";
import { LEVEL_DAMAGE, LEVEL_LIGHT, MAX_LEVEL, levelDamage, xpToNext } from "./levels";
import { GEAR, GEAR_IDS, GEAR_DUPLICATE_XP, gearDamage, lootWeights, propCounts, propDef, PROPS } from "./props";
import { createRng } from "./rng";
import { applyAction, baseDamage, emptyBag, levelOf, startRun, xpOf, type RunState } from "./run";
import { simulateFogRun } from "./sim";
import { DEFAULT_TUNING } from "./tuning";

/** An open 11 x 11 room with the delver in the middle, nothing else on it, and plenty of light. */
function room(over: Partial<Parameters<typeof startRun>[0]> = {}): RunState {
  const s = startRun({ seed: 7, flasks: 5, perks: NO_PERKS, weaponDamage: 16, bag: emptyBag(), ...over });
  s.floor.tiles.fill(0);
  for (let y = 2; y <= 12; y++) for (let x = 2; x <= 12; x++) s.floor.tiles[idx(s.floor, x, y)] = 1;
  s.floor.items = [];
  s.floor.dimlings = [];
  s.floor.props = [];
  s.player = { x: 6, y: 6, facing: "right" };
  return s;
}

const prop = (kind: Prop["kind"], over: Partial<Prop> = {}): Prop => {
  const hp = propDef(kind).hp;
  return { id: 90, x: 7, y: 6, kind, hp, maxHp: hp, ...over };
};

const right = (s: RunState) => applyAction(s, { type: "move", dx: 1, dy: 0 });

describe("levels", () => {
  it("need a little more experience each time, 595 in all for level 15", () => {
    expect(xpToNext(1)).toBe(10);
    expect(xpToNext(2)).toBe(15);
    let total = 0;
    for (let level = 1; level < MAX_LEVEL; level++) total += xpToNext(level);
    expect(MAX_LEVEL).toBe(15);
    expect(total).toBe(595);
  });

  it("add damage for every level after the first, and stop at the last", () => {
    expect(levelDamage(1)).toBe(0);
    expect(levelDamage(2)).toBe(LEVEL_DAMAGE);
    expect(levelDamage(MAX_LEVEL)).toBe(LEVEL_DAMAGE * (MAX_LEVEL - 1));
    expect(levelDamage(MAX_LEVEL + 5)).toBe(levelDamage(MAX_LEVEL));
  });

  it("pour 10 light into the lantern and add damage when one is reached", () => {
    let s = room();
    s.floor.props = [prop("urn", { hp: 1 })];
    s.xp = xpToNext(1) - 1;
    const before = s.light, damage = baseDamage(s);
    s = right(s);
    expect(s.events).toContain("levelup");
    expect(levelOf(s)).toBe(2);
    expect(baseDamage(s)).toBe(damage + LEVEL_DAMAGE);
    // The light is the 10 from the level, minus a step, plus any oil the urn held.
    expect(s.light).toBeGreaterThanOrEqual(before + LEVEL_LIGHT - 1.01);
    expect(s.messages[0]).toContain("Level 2");
  });

  it("can give several levels at once and carries the rest of the experience over", () => {
    let s = room();
    s.floor.props = [prop("urn", { hp: 1 })];
    s.xp = xpToNext(1) + xpToNext(2) - 1;
    s = right(s);
    expect(levelOf(s)).toBe(3);
    expect(xpOf(s)).toBeGreaterThanOrEqual(0);
    expect(xpOf(s)).toBeLessThan(xpToNext(3));
  });

  it("stop at level 15: no more levels, no more light", () => {
    let s = room();
    s.level = MAX_LEVEL;
    s.xp = 0;
    s.floor.props = [prop("barrel", { hp: 1 })];
    const before = s.light;
    s = right(s);
    expect(levelOf(s)).toBe(MAX_LEVEL);
    expect(s.events).not.toContain("levelup");
    expect(xpOf(s)).toBe(0);
    expect(s.light).toBeLessThanOrEqual(before + Math.round(propDef("barrel").oil[1] * DEFAULT_TUNING.dropOil));
  });

  it("are read as level 1 from a descent saved before levels existed", () => {
    let s = room();
    delete s.xp; delete s.level; delete s.gear; delete s.smashed;
    delete (s.floor as { props?: Prop[] }).props;
    expect(levelOf(s)).toBe(1);
    s = right(s);
    expect(s.player.x).toBe(7);
    expect(levelOf(s)).toBe(1);
  });
});

describe("props on a floor", () => {
  it("are placed on open floor, apart from everything else, at least a handful a floor", () => {
    for (let depth = 1; depth <= 9; depth++) {
      for (let seed = 1; seed <= 12; seed++) {
        const floor = generateFloor(createRng(seed * 77 + depth), depth, { findPct: 0 });
        expect(floor.props.length).toBeGreaterThanOrEqual(depth <= 3 ? 4 : 3);
        const taken = new Set<number>([idx(floor, floor.spawn.x, floor.spawn.y), idx(floor, floor.stairs.x, floor.stairs.y)]);
        for (const i of floor.items) taken.add(idx(floor, i.x, i.y));
        for (const d of floor.dimlings) taken.add(idx(floor, d.x, d.y));
        for (const p of floor.props) {
          expect(isFloor(floor, p.x, p.y)).toBe(true);
          expect(taken.has(idx(floor, p.x, p.y)), `${depth}/${seed} ${p.kind}`).toBe(false);
          taken.add(idx(floor, p.x, p.y));
          expect(p.hp).toBe(propDef(p.kind).hp);
          expect(p.maxHp).toBe(p.hp);
        }
        expect(new Set(floor.props.map(p => p.id)).size).toBe(floor.props.length);
      }
    }
  });

  it("never stand on a stone or bones drawn into the floor, nor beside the stairs or the rift", () => {
    let props = 0;
    for (let depth = 1; depth <= 7; depth++) {
      for (let seed = 1; seed <= 10; seed++) {
        const floor = generateFloor(createRng(seed * 53 + depth), depth, { findPct: 0 });
        for (const p of floor.props) expect(hasFloorDecor(p.x, p.y), `${depth}/${seed} ${p.kind}`).toBe(false);
        // Nor beside the stairs or the rift: two tiles clear, diagonals included.
        for (const p of floor.props) for (const exit of [floor.stairs, floor.spawn]) {
          expect(Math.max(Math.abs(p.x - exit.x), Math.abs(p.y - exit.y)), `${depth}/${seed} ${p.kind} by an exit`).toBeGreaterThan(2);
        }
        props += floor.props.length;
      }
    }
    expect(props).toBeGreaterThan(200);
  });

  it("never shut a route: every open tile stays reachable without breaking anything", () => {
    for (let depth = 1; depth <= 7; depth++) {
      for (let seed = 1; seed <= 10; seed++) {
        const floor = generateFloor(createRng(seed * 131 + depth), depth, { findPct: 0 });
        const blocked = new Set(floor.props.map(p => idx(floor, p.x, p.y)));
        // Breadth-first walk from the rift that treats every prop as a wall.
        const seen = new Set<number>([idx(floor, floor.spawn.x, floor.spawn.y)]);
        const queue = [floor.spawn];
        for (let head = 0; head < queue.length; head++) {
          for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
            const nx = queue[head].x + d.x, ny = queue[head].y + d.y;
            if (!isFloor(floor, nx, ny) || seen.has(idx(floor, nx, ny)) || blocked.has(idx(floor, nx, ny))) continue;
            seen.add(idx(floor, nx, ny));
            queue.push({ x: nx, y: ny });
          }
        }
        const open = distances(floor, floor.spawn).filter(v => v >= 0).length - blocked.size;
        expect(seen.size, `${depth}/${seed}`).toBe(open);
        expect(seen.has(idx(floor, floor.stairs.x, floor.stairs.y))).toBe(true);
        for (const i of floor.items) expect(seen.has(idx(floor, i.x, i.y))).toBe(true);
      }
    }
  });

  it("scale with the size of the floor", () => {
    const counts = propCounts(1);
    expect(counts.urn).toBeGreaterThan(counts.barrel);
    expect(counts.crate).toBeGreaterThanOrEqual(2);
    // Bone piles start on floor 2.
    expect(counts.sack).toBe(0);
    expect(propCounts(2).sack).toBeGreaterThan(0);
    expect(PROPS.map(p => p.id)).toEqual(["urn", "crate", "barrel", "sack"]);
  });

  it("are not walked through by creatures", () => {
    let s = room();
    s.floor.props = [prop("crate", { x: 7, y: 8 }), prop("crate", { id: 91, x: 8, y: 8 }), prop("crate", { id: 92, x: 6, y: 8 })];
    const d: Dimling = { id: 1, x: 7, y: 11, hp: 99, maxHp: 99, awake: true, species: "cinder-hound", phase: "idle", windupLeft: 0, cooldown: 0, aim: null };
    s.floor.dimlings = [d];
    s.light = 9999; s.startLight = 9999;
    for (let turn = 0; turn < 30; turn++) {
      s = applyAction(s, { type: "wait" });
      for (const p of s.floor.props) expect(s.floor.dimlings.some(c => c.x === p.x && c.y === p.y)).toBe(false);
    }
  });
});

describe("smashing", () => {
  it("breaks an urn or a sack at the first blow and a crate or a barrel at the second, whatever the weapon", () => {
    const blows = (kind: Prop["kind"], damage: number, gear: typeof GEAR_IDS = []) => {
      let s = room({ weaponDamage: damage });
      s.gear = [...gear];
      s.floor.props = [prop(kind)];
      let n = 0;
      while (s.floor.props.length && n < 20) { s = right(s); n++; }
      return n;
    };
    for (const damage of [4, 16, 60]) {
      expect(blows("urn", damage)).toBe(1);
      expect(blows("sack", damage)).toBe(1);
      expect(blows("crate", damage)).toBe(2);
      expect(blows("barrel", damage)).toBe(2);
    }
    expect(blows("barrel", 4, ["pickaxe"])).toBe(1);
  });

  it("does not move the delver or burn light, cracks the prop and says so", () => {
    let s = room();
    s.floor.props = [prop("barrel")];
    const before = { light: s.light, steps: s.steps };
    s = right(s);
    expect(s.player.x).toBe(6);
    expect(s.events).toContain("smash");
    expect(s.events).not.toContain("break");
    expect(s.floor.props[0].hp).toBe(propDef("barrel").hp - 1);
    // Only steps burn light (the owner, 2026-10-11); a blow is not a step.
    expect(s.light).toBe(before.light);
    expect(s.steps).toBe(before.steps);
    expect(s.messages[0]).toContain("cracks");
  });

  it("does not burn light for a blow at a creature either", () => {
    let s = room();
    s.floor.dimlings = [{ id: 1, x: 7, y: 6, hp: 99, maxHp: 99, awake: false, species: "sootplate", phase: "idle", windupLeft: 0, cooldown: 0, aim: null }];
    const before = s.light;
    s = right(s);
    expect(s.events).toContain("hit");
    expect(s.light).toBe(before);
    // A step still does.
    s.floor.dimlings = [];
    const walked = applyAction(s, { type: "move", dx: 0, dy: 1 });
    expect(walked.light).toBeLessThan(before);
  });

  it("lets one kind of loot fall out, sometimes two, and says and shows what fell out", () => {
    const twos: Record<string, number> = {};
    for (const kind of ["urn", "crate", "barrel", "sack"] as const) {
      const def = propDef(kind);
      const mult = lootMultiplier(1);
      let two = 0;
      for (let seed = 1; seed <= 200; seed++) {
        let s = room({ seed });
        s.light = 100; // Room for the rolled oil; full-lantern loss has separate cap tests.
        s.floor.props = [prop(kind, { hp: 1 })];
        const before = { gold: s.gold, crystals: s.crystals };
        s = right(s);
        expect(s.events).toContain("break");
        expect(s.floor.props).toHaveLength(0);
        expect(s.smashed).toBe(1);
        const drop = s.drops![0];
        expect([drop.x, drop.y]).toEqual([7, 6]);
        const kinds = [drop.gold > 0, drop.crystals > 0, drop.light > 0].filter(Boolean).length;
        expect(kinds, `${kind} ${seed}`).toBeGreaterThanOrEqual(1);
        expect(kinds).toBeLessThanOrEqual(2);
        if (kinds === 2) two++;
        expect(s.gold - before.gold).toBe(drop.gold);
        expect(s.crystals - before.crystals).toBe(drop.crystals);
        if (drop.gold) {
          expect(drop.gold).toBeGreaterThanOrEqual(Math.round(def.gold[0] * mult));
          expect(drop.gold).toBeLessThanOrEqual(Math.round(def.gold[1] * mult));
        }
        if (drop.light) {
          expect(drop.light).toBeGreaterThanOrEqual(Math.round(def.oil[0] * DEFAULT_TUNING.dropOil));
          expect(drop.light).toBeLessThanOrEqual(Math.round(def.oil[1] * DEFAULT_TUNING.dropOil));
        }
        expect(s.messages[0]).toContain(`${def.name} breaks`);
        expect(s.messages[0]).toContain("xp");
      }
      twos[kind] = two / 200;
    }
    // Two kinds: an urn now and then, a crate often, a barrel always.
    expect(twos.urn).toBeGreaterThan(0.1);
    expect(twos.urn).toBeLessThan(0.3);
    expect(twos.crate).toBeGreaterThan(0.3);
    expect(twos.crate).toBeLessThan(0.5);
    expect(twos.barrel).toBe(1);
  });

  it("forgets last turn's drops", () => {
    let s = room();
    s.floor.props = [prop("urn", { hp: 1 })];
    s = right(s);
    expect(s.drops).toHaveLength(1);
    s = applyAction(s, { type: "wait" });
    expect(s.drops).toEqual([]);
  });

  it("gives oil more often the lower the lantern is", () => {
    const crate = propDef("crate");
    const [full, empty] = DEFAULT_TUNING.propOilWeight;
    expect(lootWeights(crate, 160, 160).oil).toBeCloseTo(full);
    expect(lootWeights(crate, 0, 160).oil).toBeCloseTo(empty);
    expect(lootWeights(crate, 80, 160).oil).toBeGreaterThan(lootWeights(crate, 120, 160).oil);
    expect(lootWeights(crate, 400, 160).oil).toBeCloseTo(full);
    // Old sacks hold less oil than the rest.
    expect(lootWeights(propDef("sack"), 0, 160).oil).toBeLessThan(lootWeights(crate, 0, 160).oil);
    const dropRate = (light: number) => {
      let drops = 0;
      const trials = 400;
      for (let seed = 1; seed <= trials; seed++) {
        let s = room({ seed });
        s.startLight = s.maxLight = 160; s.light = light;
        s.floor.props = [prop("crate", { hp: 1 })];
        s = right(s);
        if (s.events.includes("oil")) drops++;
      }
      return drops / trials;
    };
    const low = dropRate(10), high = dropRate(160);
    expect(low).toBeGreaterThan(high + 0.12);
    expect(low).toBeGreaterThan(0.55);
    expect(high).toBeLessThan(0.55);
  });

  it("sometimes gives gear, never the same piece twice, and gear adds to every blow", () => {
    let found = 0;
    for (let seed = 1; seed <= 300; seed++) {
      let s = room({ seed });
      s.floor.props = [prop("barrel", { hp: 1 })];
      const damage = baseDamage(s);
      s = right(s);
      if (!s.events.includes("gear")) { expect(s.gear).toEqual([]); continue; }
      found++;
      expect(s.gear).toHaveLength(1);
      const piece = s.gear![0];
      expect(GEAR_IDS).toContain(piece);
      expect(baseDamage(s)).toBe(damage + GEAR[piece].damage + levelDamage(levelOf(s)));
      expect(s.messages[0]).toContain(GEAR[piece].name);
    }
    // A barrel holds gear 16% of the time.
    expect(found).toBeGreaterThan(15);
    expect(found).toBeLessThan(90);
  });

  it("turns a piece of gear the delver already has into experience", () => {
    let sawXp = false;
    for (let seed = 1; seed <= 300 && !sawXp; seed++) {
      let s = room({ seed });
      s.gear = [...GEAR_IDS];
      s.floor.props = [prop("barrel", { hp: 1 })];
      s = right(s);
      expect(s.events).not.toContain("gear");
      expect(s.gear).toHaveLength(GEAR_IDS.length);
      // Normal experience from a barrel never reaches this much, so only a duplicate can.
      if (levelOf(s) > 2 || xpOf(s) + (levelOf(s) - 1) * 10 >= propDef("barrel").xp[1] + GEAR_DUPLICATE_XP - 2) sawXp = true;
    }
    expect(sawXp).toBe(true);
    expect(gearDamage(GEAR_IDS)).toBe(GEAR.sword.damage + GEAR.axe.damage + GEAR.pickaxe.damage);
  });

  it("breaks anything in one blow with a pickaxe", () => {
    let s = room({ weaponDamage: 8 });
    s.gear = ["pickaxe"];
    s.floor.props = [prop("barrel")];
    s = right(s);
    expect(s.events).toContain("break");
    expect(s.floor.props).toHaveLength(0);
  });

  it("makes creatures easier to kill as the delver levels up", () => {
    let s = room({ weaponDamage: 16 });
    s.level = 5;
    s.floor.dimlings = [{ id: 1, x: 7, y: 6, hp: 24, maxHp: 24, awake: false, species: "wickgnaw", phase: "idle", windupLeft: 0, cooldown: 0, aim: null }];
    // 16 + 4 levels x 2 = 24: one blow.
    s = right(s);
    expect(s.events).toContain("kill");
    expect(xpOf(s) + (levelOf(s) - 5) * 99).toBeGreaterThan(0);
  });
});

describe("the bots", () => {
  it("smash props and level up on the way", { timeout: 60_000 }, () => {
    let smashed = 0, level = 0;
    const runs = 6;
    for (let i = 0; i < runs; i++) {
      const r = simulateFogRun(1_000 + i * 7_919, 2);
      smashed += r.smashed; level += r.level;
    }
    expect(smashed / runs).toBeGreaterThan(4);
    expect(level / runs).toBeGreaterThan(2);
  });
});
