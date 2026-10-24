import { describe, expect, it } from "vitest";
import {
  BOSS_DEPTH, BOSS_DRAIN, BOSS_HP, BOSS_SIZE, DRAW_MINTS, HOARD_CRYSTALS, HOARD_GOLD, HOARD_SIGIL_CHANCE, HP_SCALE, FLASK_LIGHT, HEAL_LIGHT, KEY_PRICE, LOCK_SHARE, NIGHT_VISION_STEPS, POOL_SHARE, REVENUE_SHARE, ACTIVE_SHARE,
  RAGE_HITS, RAGE_MULT, REGEN_TURNS,
  FIELD_GOLD_PER_CENT, FLASK_PRICE, HOLD_FACTOR, MAX_ROUND_RETURN, ROUND_SEED_GOLD, ROUND_SEED_LOCKED, ROUND_SEED_POOL, enemyCount,
  floorScale, stepCost,
} from "./config";
import { enemyDef } from "./enemies";
import { MAX_STEP_DISCOUNT, NO_PERKS, POTIONS, POTION_DROP_WEIGHTS, SHOP_POTION_IDS, mergePerks, scalePerks } from "./catalog";
import { dimlingDistance, distances, footprint, generateFloor, idx, themeForDepth, type Dimling } from "./dungeon";
import { applyClaim, applySpend, roundShare, settleRound, splitSpend } from "./economy";
import { drawWeek, passCost, ticketChance, ticketsKept } from "./raffle";
import { createRng } from "./rng";
import { applyAction, bossAlive, emptyBag, onStairs, startRun, type RunState } from "./run";
import { simulateFogMany, simulateFogRun, simulateMany, simulateRound, type Cohort } from "./sim";

const ledger = { balance: 1_000, pool: ROUND_SEED_POOL, locked: ROUND_SEED_LOCKED, revenue: 0, spent: 0, returned: 0 };

describe("economy", () => {
  it("pays the studio exactly the configured share of every spend and pools the rest", () => {
    const { revenue, locked, pooled } = splitSpend(100);
    expect(revenue).toBe(100 * REVENUE_SHARE);
    expect(locked).toBeCloseTo(100 * LOCK_SHARE, 10);
    expect(revenue + locked + pooled).toBe(100);
    const after = applySpend(ledger, 100);
    expect(after.balance).toBe(900);
    expect(after.revenue).toBe(33);
    expect(after.locked).toBeCloseTo(ROUND_SEED_LOCKED + 7, 6);
    expect(after.pool).toBe(ROUND_SEED_POOL + 60);
  });

  it("keeps 67% for players, split between the round pool and the lock pool", () => {
    expect(ACTIVE_SHARE + LOCK_SHARE).toBeCloseTo(POOL_SHARE, 10);
    expect(REVENUE_SHARE + POOL_SHARE).toBeCloseTo(1, 10);
    for (const amount of [1, 7, 13.37, 50, 999.99]) {
      const { revenue, locked, pooled } = splitSpend(amount);
      expect(revenue + locked + pooled).toBeCloseTo(amount, 2);
    }
  });

  it("refuses to spend more than the balance", () => {
    expect(() => applySpend(ledger, 1_001)).toThrow();
  });

  it("gives a delver the same percentage of the pool as of the gold", () => {
    expect(roundShare(10, 990)).toBeCloseTo(0.01);
    const one = settleRound(10_000, 10, 990);
    expect(one.share).toBeCloseTo(0.01);
    expect(one.payout).toBe(100);
    expect(settleRound(10_000, 250, 750).payout).toBe(2_500);
    expect(settleRound(10_000, 1_000, 0).payout).toBe(10_000);
  });

  it("never pays out more than the pool holds", () => {
    for (const pool of [0.07, 1, 13.37, 999.99, 13_400]) {
      for (const [mine, others] of [[1, 2], [7, 13], [1, 1_000_000], [123, 456]]) {
        const s = settleRound(pool, mine, others);
        expect(s.payout).toBeGreaterThanOrEqual(0);
        expect(s.payout + s.fieldPayout).toBeLessThanOrEqual(pool + 1e-9);
        expect(s.payout).toBeLessThanOrEqual(pool * (mine / (mine + others)) + 1e-9);
      }
    }
  });

  it("rewards more gold with a larger share and no gold with nothing", () => {
    expect(settleRound(5_000, 300, 700).payout).toBeGreaterThan(settleRound(5_000, 100, 900).payout);
    expect(settleRound(5_000, 0, 700).payout).toBe(0);
  });

  it("carries the pool over when nobody banked gold", () => {
    const s = settleRound(5_000, 0, 0);
    expect(s.payout).toBe(0);
    expect(s.carry).toBe(5_000);
    expect(applyClaim({ ...ledger, pool: 5_000 }, s).pool).toBe(5_000);
  });

  it("caps what a delver takes back at a multiple of what they put in, and leaves the rest in the pool", () => {
    // 90% of the gold would be $90, but only $1 went into descents.
    const s = settleRound(10_000, 900, 100, MAX_ROUND_RETURN * 100);
    expect(s.payout).toBe(MAX_ROUND_RETURN * 100);
    expect(s.withheld).toBe(9_000 - s.payout);
    expect(s.carry).toBeCloseTo(s.withheld, 2);
    expect(s.payout + s.fieldPayout + s.carry).toBeCloseTo(10_000, 6);
    // Under the cap nothing changes.
    const under = settleRound(10_000, 10, 990, 5_000);
    expect(under).toEqual(settleRound(10_000, 10, 990));
    expect(under.withheld).toBe(0);
    // No cap given means no cap.
    expect(settleRound(10_000, 900, 100).payout).toBe(9_000);
    expect(settleRound(10_000, 900, 100, 0).payout).toBe(0);
  });

  it("moves a claimed payout out of the pool and into the balance", () => {
    const s = settleRound(2_000, 50, 150);
    const after = applyClaim({ ...ledger, pool: 2_000 }, s);
    expect(s.payout).toBe(500);
    expect(after.balance).toBe(ledger.balance + 500);
    expect(after.returned).toBe(500);
    expect(after.pool).toBe(0);
  });

  it("opens each round with a simulated crowd worth one crowd week", () => {
    expect(ROUND_SEED_POOL).toBeCloseTo(20_000 * ACTIVE_SHARE);
    expect(ROUND_SEED_LOCKED).toBeCloseTo(20_000 * LOCK_SHARE);
    expect(ROUND_SEED_GOLD).toBeGreaterThan(0);
  });
});

describe("dungeon", () => {
  it("always connects the rift to the stairs", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const floor = generateFloor(createRng(seed), 1 + (seed % 8), { findPct: 0 });
      const dist = distances(floor, floor.spawn);
      expect(dist[idx(floor, floor.stairs.x, floor.stairs.y)]).toBeGreaterThan(5);
      expect(dist[idx(floor, floor.stairs.x, floor.stairs.y)]).toBeLessThanOrEqual(45);
      for (let k = 0; k < floor.tiles.length; k++) {
        if (floor.tiles[k] === 1) expect(dist[k]).toBeGreaterThanOrEqual(0);
      }
      for (const item of floor.items) expect(dist[idx(floor, item.x, item.y)]).toBeGreaterThan(0);
    }
  });

  it("ramps room layouts up gently and changes biome every two floors", () => {
    const expectedRooms = [2, 3, 3, 4, 4, 5, 1, 5];
    for (let depth = 1; depth <= expectedRooms.length; depth++) {
      const floor = generateFloor(createRng(depth), depth, { findPct: 0 });
      expect(floor.roomCount).toBe(expectedRooms[depth - 1]);
    }
    expect(themeForDepth(1)).toBe(themeForDepth(2));
    expect(themeForDepth(3)).toBe(themeForDepth(4));
    expect(themeForDepth(5)).toBe(themeForDepth(6));
    expect(themeForDepth(1)).not.toBe(themeForDepth(3));
    expect(themeForDepth(3)).not.toBe(themeForDepth(5));
  });

  it("keeps authored entrances and the open boss arena on the walkable grid", () => {
    const first = generateFloor(createRng(1), 1, { findPct: 0 });
    for (const y of [9, 10, 11]) expect(first.tiles[idx(first, 13, y)]).toBe(1);
    for (const y of [8, 12]) expect(first.tiles[idx(first, 13, y)]).toBe(0);

    const stairs = [[26, 10], [28, 9], [26, 6], [22, 7], [22, 8], [23, 8], [13, 3]];
    for (let depth = 1; depth <= 7; depth++) {
      const floor = generateFloor(createRng(depth), depth, { findPct: 0 });
      expect([floor.stairs.x, floor.stairs.y]).toEqual(stairs[depth - 1]);
      expect(floor.tiles[idx(floor, floor.spawn.x, floor.spawn.y)]).toBe(1);
      expect(floor.tiles[idx(floor, floor.stairs.x, floor.stairs.y)]).toBe(1);
    }

    const arena = generateFloor(createRng(7), 7, { findPct: 0 });
    for (let y = 3; y <= 12; y++) {
      for (let x = 7; x <= 19; x++) expect(arena.tiles[idx(arena, x, y)]).toBe(1);
      expect(arena.tiles[idx(arena, 6, y)]).toBe(0);
      expect(arena.tiles[idx(arena, 20, y)]).toBe(0);
    }
    expect(arena.tiles[idx(arena, 13, 14)]).toBe(1);
    expect(arena.tiles[idx(arena, 13, 15)]).toBe(0);
  });

  it("hides every guaranteed pile of gold, crystals and oil in a prop, and keeps the enemies placeable on every layout", () => {
    for (let depth = 1; depth <= 12; depth++) {
      // A bigger floor holds proportionally more of everything.
      const scaled = (n: number) => Math.round(n * floorScale(depth));
      const piles = { gold: scaled(6 + depth), crystals: scaled(3 + Math.floor(depth / 2)), oil: scaled(Math.max(1, 3 - Math.floor(depth / 3))) };
      for (let seed = 1; seed <= 20; seed++) {
        const floor = generateFloor(createRng(seed * 101 + depth), depth, { findPct: 0 });
        const cells = floor.tiles.filter(t => t === 1).length;
        // Nothing of the kind lies on the floor (there are props to hold it), and the props hold all of it.
        expect(floor.props.length).toBeGreaterThan(0);
        expect(floor.items.filter(i => i.kind === "gold" || i.kind === "crystal" || i.kind === "oil")).toEqual([]);
        for (const kind of ["gold", "crystals", "oil"] as const) {
          expect(floor.props.reduce((n, p) => n + (p.stash?.[kind] ?? 0), 0), `${depth}/${seed} ${kind}`).toBe(piles[kind]);
        }
        expect(floor.items.some(i => i.kind === "chest")).toBe(true);
        expect(floor.dimlings).toHaveLength(Math.min(enemyCount(depth), Math.floor(cells / 12)));
      }
    }
  });

  it("is deterministic for a seed", () => {
    const a = generateFloor(createRng(42), 3, { findPct: 0 });
    const b = generateFloor(createRng(42), 3, { findPct: 0 });
    expect(a.tiles).toEqual(b.tiles);
    expect(a.items).toEqual(b.items);
    expect(a.theme).toBe(b.theme);
  });
});

function run(overrides: Partial<Parameters<typeof startRun>[0]> = {}) {
  return startRun({ seed: 7, flasks: 1, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag(), ...overrides });
}

function waitUntilOver(state: RunState, limit = 1_000) {
  for (let i = 0; i < limit && state.status === "playing"; i++) state = applyAction(state, { type: "wait" });
  return state;
}

describe("run", () => {
  it("starts with flask light plus perk light", () => {
    expect(run({ flasks: 2, perks: mergePerks({ startLight: 10 }) }).light).toBe(2 * FLASK_LIGHT + 10);
  });

  it("burns light every turn and ends in darkness", () => {
    const s = run();
    const after = applyAction(s, { type: "wait" });
    expect(after.light).toBeLessThan(s.light);
    expect(waitUntilOver(s).status).toBe("dead");
  });

  it("night vision buys extra steps once the light dies", () => {
    // Nothing else is on the floor, so only the lantern decides how long each descent lasts.
    const alone = (overrides = {}) => { const s = run(overrides); s.floor.dimlings = []; return s; };
    const plain = waitUntilOver(alone());
    const saved = waitUntilOver(alone({ bag: { ...emptyBag(), nightVision: 1 } }));
    expect(saved.status).toBe("dead");
    expect(saved.used.nightVision).toBe(1);
    expect(saved.steps).toBeGreaterThanOrEqual(plain.steps + NIGHT_VISION_STEPS - 5);
  });

  it("keeps the ward active through its fifteenth protected turn", () => {
    let state = run({ bag: { ...emptyBag(), ward: 1 } });
    state.light = 100;
    state.floor.dimlings = [{ id: 1, x: state.player.x + 1, y: state.player.y, hp: 4, maxHp: 4, awake: true }];
    state = applyAction(state, { type: "potion", id: "ward" });
    for (let turn = 1; turn <= 15; turn++) {
      state = applyAction(state, { type: "wait" });
      expect(state.events).not.toContain("drain");
      expect(state.ward).toBe(15 - turn);
    }
    // Once the ward is gone the creature's next wind-up ends in a blow that lands.
    let drained = false;
    for (let turn = 0; turn < 6 && !drained; turn++) {
      state = applyAction(state, { type: "wait" });
      drained = state.events.includes("drain");
    }
    expect(drained).toBe(true);
  });

  it("lets an awake enemy route around a wall even when the first step moves away", () => {
    let state = run();
    state.light = 300;
    state.player = { x: 4, y: 2, facing: "left" };
    state.floor.tiles.fill(0);
    for (const [x, y] of [[2, 2], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2]]) {
      state.floor.tiles[idx(state.floor, x, y)] = 1;
    }
    state.floor.dimlings = [{ id: 1, x: 2, y: 2, hp: 4, maxHp: 4, awake: true }];
    let reachedDetour = false;
    for (let turn = 0; turn < 30 && !reachedDetour; turn++) {
      state = applyAction(state, { type: "wait" });
      reachedDetour = state.floor.dimlings[0].x === 1;
    }
    expect(reachedDetour).toBe(true);
  });

  it("extracts only on the rift and descends only on the stairs", () => {
    const s = run();
    const extracted = applyAction(s, { type: "extract" });
    expect(extracted.status).toBe("extracted");
    expect(applyAction(s, { type: "descend" })).toBe(s);
  });

  it("does not spend a turn walking into a wall", () => {
    let s = run();
    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
      const tx = s.player.x + dx, ty = s.player.y + dy;
      if (s.floor.tiles[idx(s.floor, tx, ty)] === 0) {
        const after = applyAction(s, { type: "move", dx, dy });
        expect(after.steps).toBe(s.steps);
        expect(after.light).toBe(s.light);
        s = after;
        break;
      }
    }
  });
});

describe("cerberus", () => {
  /** A run standing at the arena's entrance on the seventh floor, with plenty of light. */
  function bossFight(overrides: Partial<Parameters<typeof startRun>[0]> = {}) {
    const state = run({ flasks: 5, ...overrides });
    state.depth = BOSS_DEPTH;
    state.floor = generateFloor(createRng(7), BOSS_DEPTH, { findPct: 0 });
    state.player = { ...state.floor.spawn, facing: "up" };
    return state;
  }
  const boss = (s: RunState) => s.floor.dimlings.find(d => d.boss)!;
  const lone = (s: RunState, extra: Partial<Dimling> = {}) => {
    s.floor.dimlings = [{ id: 1, x: s.player.x + 1, y: s.player.y, hp: BOSS_HP, maxHp: BOSS_HP, awake: true, boss: true, ...extra }];
  };

  it("scales creature health with depth and species (12-70 HP) and gives Cerberus 150", () => {
    for (let depth = 1; depth <= 7; depth++) {
      const floor = generateFloor(createRng(depth), depth, { findPct: 0 });
      const regular = floor.dimlings.filter(d => !d.boss);
      expect(regular.length).toBeGreaterThan(0);
      for (const d of regular) {
        // The floor sets the base; each species is a little frailer or tougher than that.
        expect(d.hp).toBe(Math.round((2 + Math.floor(depth / 2)) * HP_SCALE * enemyDef(d.species).hp));
        expect(d.hp).toBeGreaterThanOrEqual(12);
        expect(d.hp).toBeLessThanOrEqual(70);
      }
    }
    expect(BOSS_HP).toBe(150);
    expect(BOSS_HP).toBeGreaterThanOrEqual(3 * 40);
  });

  it("guards the seventh-floor stairs as a 2x2 hound and appears nowhere else", () => {
    for (let depth = 1; depth <= 12; depth++) {
      for (let seed = 1; seed <= 10; seed++) {
        const floor = generateFloor(createRng(seed * 31 + depth), depth, { findPct: 0 });
        const bosses = floor.dimlings.filter(d => d.boss);
        expect(bosses).toHaveLength(depth === BOSS_DEPTH ? 1 : 0);
        if (bosses.length) {
          const b = bosses[0];
          const dist = distances(floor, floor.spawn);
          expect(b.size).toBe(BOSS_SIZE);
          expect(footprint(b)).toHaveLength(BOSS_SIZE * BOSS_SIZE);
          for (const c of footprint(b)) {
            expect(floor.tiles[idx(floor, c.x, c.y)]).toBe(1);
            expect(dist[idx(floor, c.x, c.y)]).toBeGreaterThan(0);
            expect(floor.items.some(i => i.x === c.x && i.y === c.y)).toBe(false);
            expect(c.x === floor.stairs.x && c.y === floor.stairs.y).toBe(false);
          }
          expect(dimlingDistance(b, floor.stairs)).toBeGreaterThanOrEqual(2);
          expect(b.hp).toBe(BOSS_HP);
          expect(b.awake).toBe(false);
        }
      }
    }
  });

  it("is hit on any of its four tiles and blocks all of them", () => {
    // The player stands at (5,5); each case puts a different tile of the hound next to them.
    const cases = [
      { x: 6, y: 4, dx: 1, dy: 0 }, // its lower-left tile is beside the player
      { x: 6, y: 5, dx: 1, dy: 0 }, // its upper-left tile
      { x: 5, y: 6, dx: 0, dy: 1 }, // its upper-left tile, from above
      { x: 4, y: 6, dx: 0, dy: 1 }, // its upper-right tile, from above
    ];
    for (const c of cases) {
      const s = bossFight({ weaponDamage: 8 });
      s.floor.tiles.fill(1);
      s.player = { x: 5, y: 5, facing: "right" };
      s.floor.dimlings = [{ id: 1, x: c.x, y: c.y, hp: 150, maxHp: 150, awake: false, boss: true, size: 2 }];
      expect(footprint(s.floor.dimlings[0]).some(t => t.x === 5 + c.dx && t.y === 5 + c.dy)).toBe(true);
      const after = applyAction(s, { type: "move", dx: c.dx, dy: c.dy });
      expect(after.floor.dimlings[0].hp).toBe(142);
      expect(after.player).toMatchObject({ x: 5, y: 5 });
    }
  });

  it("drinks light from anywhere along its body, and a Ward Charm cancels it", () => {
    let s = bossFight({ bag: { ...emptyBag(), ward: 1 } });
    s.floor.tiles.fill(1);
    s.player = { x: 10, y: 10, facing: "up" };
    // The player touches only the hound's lower-left tile.
    s.floor.dimlings = [{ id: 1, x: 8, y: 8, hp: BOSS_HP, maxHp: BOSS_HP, awake: true, boss: true, size: 2 }];
    expect(dimlingDistance(s.floor.dimlings[0], s.player)).toBe(2);
    s.floor.dimlings[0].y = 9;
    expect(dimlingDistance(s.floor.dimlings[0], s.player)).toBe(1);
    s = applyAction(s,{type:"wait"}); // Visible wind-up before the strike.
    const before = s.light;
    const hit = applyAction(s, { type: "wait" });
    expect(before - hit.light).toBeCloseTo(stepCost(BOSS_DEPTH) + BOSS_DRAIN);

    s = applyAction(s, { type: "potion", id: "ward" });
    const warded = applyAction(s, { type: "wait" });
    expect(s.light - warded.light).toBeCloseTo(stepCost(BOSS_DEPTH));
  });

  it("takes exactly 40 light before armour from each orthogonal side of the body", () => {
    expect(BOSS_DRAIN).toBe(40);
    for(const player of [{x:4,y:5},{x:7,y:6},{x:5,y:4},{x:6,y:7}])for(const drainReduce of [0,0.3,0.8]) {
      const s=bossFight({perks:{...NO_PERKS,drainReduce}});
      s.floor.tiles.fill(1);s.floor.items=[];s.floor.props=[];
      s.player={...player,facing:"up"};
      s.floor.dimlings=[{id:1,x:5,y:5,size:2,boss:true,awake:true,hp:150,maxHp:150,phase:"windup",windupLeft:1}];
      const after=applyAction(s,{type:"wait"});
      expect(s.light-after.light).toBeCloseTo(stepCost(BOSS_DEPTH)+40*(1-drainReduce));
      expect(after.events.filter(e=>e==="drain")).toHaveLength(1);
    }
  });

  it("keeps the stairs sealed, without spending a turn, until the boss is dead", () => {
    let s = bossFight();
    s.player = { ...s.floor.stairs, facing: "up" };
    const light = s.light;
    const sealed = applyAction(s, { type: "descend" });
    expect(sealed.depth).toBe(BOSS_DEPTH);
    expect(sealed.light).toBe(light);
    expect(sealed.steps).toBe(s.steps);
    expect(sealed.events).toContain("sealed");
    expect(sealed.messages[0]).toMatch(/sealed/i);

    s = { ...s, floor: { ...s.floor, dimlings: [] } };
    expect(bossAlive(s)).toBe(false);
    expect(onStairs(s)).toBe(true);
    expect(applyAction(s, { type: "descend" }).depth).toBe(BOSS_DEPTH + 1);
  });

  it("walks as a 2x2 body: never into walls, the player or another creature, and it closes in", () => {
    let s = bossFight();
    s.light = 50_000;
    s.floor.tiles.fill(0);
    for (let y = 2; y <= 12; y++) for (let x = 2; x <= 14; x++) s.floor.tiles[idx(s.floor, x, y)] = 1;
    s.player = { x: 13, y: 11, facing: "up" };
    s.floor.items = [];
    s.floor.dimlings = [
      { id: 1, x: 3, y: 3, hp: BOSS_HP, maxHp: BOSS_HP, awake: true, boss: true, size: 2 },
      { id: 2, x: 7, y: 8, hp: 16, maxHp: 16, awake: false },
    ];
    const start = dimlingDistance(s.floor.dimlings[0], s.player);
    for (let t = 0; t < 80; t++) {
      s = applyAction(s, { type: "wait" });
      const b = s.floor.dimlings.find(d => d.boss)!;
      for (const c of footprint(b)) {
        expect(s.floor.tiles[idx(s.floor, c.x, c.y)]).toBe(1);
        expect(c.x === s.player.x && c.y === s.player.y).toBe(false);
        expect(s.floor.dimlings.some(o => o !== b && footprint(o).some(oc => oc.x === c.x && oc.y === c.y))).toBe(false);
      }
    }
    expect(dimlingDistance(s.floor.dimlings.find(d => d.boss)!, s.player)).toBeLessThan(start);
  });

  it("takes many blows, then leaves a hoard chest where it stood and opens the way", () => {
    let s = bossFight({ weaponDamage: 40 });
    s.floor.items = [];
    lone(s, { hp: 60, awake: false });
    s = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(s.bossSlain).toBeFalsy();
    expect(boss(s).hp).toBe(20);
    const anchor = { x: boss(s).x, y: boss(s).y };
    s = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(s.bossSlain).toBe(true);
    expect(s.events).toContain("boss");
    expect(bossAlive(s)).toBe(false);
    expect(s.kills).toBe(1);
    expect(s.gold).toBe(0);
    expect(s.floor.items).toEqual([expect.objectContaining({ kind: "hoard", ...anchor })]);
    expect(new Set(s.floor.items.map(i => i.id)).size).toBe(s.floor.items.length);
  });

  it("pays out the hoard when the delver walks over it, and only then", () => {
    let s = bossFight({ weaponDamage: 40 });
    s.player = { x: 13, y: 10, facing: "right" }; // An open arena cell, not the now single-file rift entrance.
    s.floor.props = [];
    s.floor.items = [{ id: 9, x: s.player.x + 1, y: s.player.y, kind: "hoard" }];
    s.floor.dimlings = [];
    const before = { gold: s.gold, heal: s.bag.heal, rage: s.bag.rage };
    s = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(s.floor.items).toHaveLength(0);
    expect(s.events).toContain("hoard");
    expect(s.gold).toBeGreaterThanOrEqual(before.gold + Math.round(HOARD_GOLD[0] * 3.4));
    expect(s.crystals).toBeGreaterThanOrEqual(Math.round(HOARD_CRYSTALS[0] * 3.4 ** 0.8));
    expect(s.bag.heal).toBe(before.heal + 1);
    expect(s.bag.rage).toBe(before.rage + 1);
    expect(s.found.heal).toBe(1);
  });

  it("holds a Soul Sigil about as often as promised", () => {
    let sigils = 0;
    const runs = 600;
    for (let seed = 1; seed <= runs; seed++) {
      const s = bossFight({ seed });
      s.player = { x: 13, y: 10, facing: "right" };
      s.floor.props = [];
      s.floor.items = [{ id: 9, x: s.player.x + 1, y: s.player.y, kind: "hoard" }];
      s.floor.dimlings = [];
      if (applyAction(s, { type: "move", dx: 1, dy: 0 }).sigils > 0) sigils++;
    }
    expect(sigils / runs).toBeGreaterThan(HOARD_SIGIL_CHANCE - 0.08);
    expect(sigils / runs).toBeLessThan(HOARD_SIGIL_CHANCE + 0.08);
  });

  it("moves at half the pace of a dimling", () => {
    const turnsToReach = (isBoss: boolean, seed: number) => {
      const s0 = bossFight({ seed, weaponDamage: 8 });
      s0.light = 5_000;
      s0.floor.props = [];
      s0.floor.dimlings = [{ id: 1, x: s0.floor.stairs.x, y: s0.floor.stairs.y + 6, hp: 40, maxHp: 40, awake: true, boss: isBoss || undefined }];
      let s = s0;
      let turns = 0;
      while (turns < 200 && s.status === "playing") {
        const d = s.floor.dimlings[0];
        if (dimlingDistance(d, s.player) <= 1) break;
        s = applyAction(s, { type: "wait" });
        turns++;
      }
      return turns;
    };
    let hound = 0, dimling = 0;
    for (let seed = 1; seed <= 25; seed++) { hound += turnsToReach(true, seed); dimling += turnsToReach(false, seed); }
    expect(hound / dimling).toBeGreaterThan(1.5);
    expect(hound / dimling).toBeLessThan(2.6);
  });
});

describe("new potions", () => {
  const foe = (s: RunState, hp = 20) => {
    s.floor.dimlings = [{ id: 1, x: s.player.x + 1, y: s.player.y, hp, maxHp: hp, awake: false }];
  };

  it("makes the next five blows hit 80% harder, then stops", () => {
    let s = run({ flasks: 5, weaponDamage: 5, bag: { ...emptyBag(), rage: 2 } });
    foe(s, 60);
    s = applyAction(s, { type: "potion", id: "rage" });
    expect(s.rage).toBe(RAGE_HITS);
    expect(applyAction(s, { type: "potion", id: "rage" })).toBe(s);
    let hp = s.floor.dimlings[0].hp;
    for (let i = 0; i < RAGE_HITS; i++) {
      s = applyAction(s, { type: "move", dx: 1, dy: 0 });
      expect(hp - s.floor.dimlings[0].hp).toBe(Math.round(5 * RAGE_MULT));
      hp = s.floor.dimlings[0].hp;
    }
    expect(s.rage).toBe(0);
    s = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(hp - s.floor.dimlings[0].hp).toBe(5);
  });

  it("returns a little light on each of the next five turns", () => {
    let a = run({ flasks: 5 });
    let b = applyAction(run({ flasks: 5, bag: { ...emptyBag(), regen: 1 } }), { type: "potion", id: "regen" });
    expect(b.regen).toBe(REGEN_TURNS);
    expect(applyAction(b, { type: "potion", id: "regen" })).toBe(b);
    for (let i = 0; i < 8; i++) { a = applyAction(a, { type: "wait" }); b = applyAction(b, { type: "wait" }); }
    expect(b.regen).toBe(0);
    expect(b.light - a.light).toBeCloseTo(REGEN_TURNS);
  });

  it("heals at once, but only ever drops in the deep", () => {
    let s = run({ flasks: 1, bag: { ...emptyBag(), heal: 1 } });
    s.light = 20;
    const before = s.light;
    s = applyAction(s, { type: "potion", id: "heal" });
    expect(s.light).toBe(before + HEAL_LIGHT);
    expect(POTIONS.heal.shop).toBe(false);
    expect(POTIONS.heal.price).toBe(0);
    expect(POTION_DROP_WEIGHTS.heal).toBeGreaterThan(0);
    expect(SHOP_POTION_IDS).not.toContain("heal");
    expect(SHOP_POTION_IDS).toEqual(expect.arrayContaining(["rage", "regen"]));
  });

  it("drops the new potions from chests and gives a Healing Draught from the hoard", () => {
    const dropped = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const s = run({ seed, flasks: 5 });
      s.floor.items = [{ id: 1, x: s.player.x + 1, y: s.player.y, kind: "chest" }];
      const after = applyAction(s, { type: "move", dx: 1, dy: 0 });
      for (const id of Object.keys(after.found) as (keyof typeof after.found)[]) if (after.found[id] > 0) dropped.add(id);
    }
    for (const id of ["rage", "regen", "heal"]) expect(dropped.has(id)).toBe(true);

    // Cerberus's hoard hands out a Healing Draught for certain.
    let s = run({ flasks: 5 });
    s.depth = BOSS_DEPTH;
    s.floor.items = [{ id: 9, x: s.player.x + 1, y: s.player.y, kind: "hoard" }];
    s = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(s.found.heal).toBe(1);
    expect(s.bag.heal).toBe(1);
  });
});

describe("raffle", () => {
  it("keeps found tickets only when you extract, and prices passes without selling tickets", () => {
    expect(ticketsKept(false, 4)).toBe(0);
    expect(ticketsKept(true, 4)).toBe(4);
    expect(ticketChance(null)).toBe(0.03);
    expect(ticketChance("plus")).toBe(0.045);
    expect(ticketChance("pro")).toBe(0.065);
    expect(passCost("plus", null)).toBe(500);
    expect(passCost("pro", "plus")).toBe(500);
    expect(passCost("plus", "plus")).toBe(0);
    expect(passCost("plus", "pro")).toBeNull();
  });

  it("draws the week's free mints by ticket, and nothing when nobody holds one", () => {
    const draw = drawWeek({ yourTickets: 3, fieldTickets: 9, seed: 11 });
    expect(draw).not.toBeNull();
    expect(draw!.mints).toBe(DRAW_MINTS);
    expect(draw!.prizes).toHaveLength(DRAW_MINTS);
    expect(draw!.prizes.every(p => p.fate === "you" || p.fate === "field")).toBe(true);
    expect(drawWeek({ yourTickets: 0, fieldTickets: 0, seed: 1 })).toBeNull();
    expect(drawWeek({ yourTickets: 5, fieldTickets: 5, seed: 1, mints: 0 })).toBeNull();
  });

  it("gives every mint to the only ticket holder", () => {
    const draw = drawWeek({ yourTickets: 4, fieldTickets: 0, seed: 3 })!;
    expect(draw.prizes.filter(p => p.fate === "you")).toHaveLength(DRAW_MINTS);
  });

  it("shares the mints by tickets over many weeks", () => {
    let mine = 0, all = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const draw = drawWeek({ yourTickets: 1, fieldTickets: 3, seed })!;
      mine += draw.prizes.filter(p => p.fate === "you").length;
      all += draw.mints;
    }
    expect(mine / all).toBeGreaterThan(0.2);
    expect(mine / all).toBeLessThan(0.3);
  });
});

describe("balance", () => {
  // These bots almost never die, so they are an upper bound on skilled play, not a forecast.
  // The strongest build: a Legendary Pathfinder locked to full strength (the step discount hits the shared cap) and the full stake.
  const strong = mergePerks(scalePerks({ stepDiscount: 0.35, radius: 1 }, 1.3), { goldPct: 10 });

  it("caps stacked step discounts so light cannot be multiplied without limit", () => {
    expect(mergePerks({ stepDiscount: 0.35 }, { stepDiscount: 0.25 }).stepDiscount).toBe(MAX_STEP_DISCOUNT);
    expect(strong.stepDiscount).toBe(MAX_STEP_DISCOUNT);
  });

  it("keeps the two bots close, so the fog bot is a fair stand-in for the perfect one", { timeout: 60_000 }, () => {
    const omni = simulateMany(40, 2).goldPerCent;
    const fog = simulateFogMany(40, 2).goldPerCent;
    // Owner-approved geometry rebaseline (2026-10-23): three-lane corridors yield a 36.635% gap over these 40 seeds.
    // Keep a small 2.4 percentage-point margin; this changes only the comparison test, not rules or bot behaviour.
    expect(Math.abs(omni - fog) / omni).toBeLessThan(0.39);
  });

  it("sets the simulated crowd's rate a little below what the mixed crowd of bots banks, since people make mistakes", { timeout: 120_000 }, () => {
    // 70% unperked, 20% holding a Rare Prospector, 10% holding a Legendary Pathfinder, all only holding their perks.
    const held = (p: Parameters<typeof scalePerks>[0]) => scalePerks(p, HOLD_FACTOR);
    const mix = [
      { share: 70, flasks: 2, perks: NO_PERKS },
      { share: 20, flasks: 2, perks: mergePerks(held({ goldPct: 25 })) },
      { share: 10, flasks: 3, perks: mergePerks(held({ stepDiscount: 0.35, radius: 1 })) },
    ];
    let gold = 0, spent = 0;
    for (const m of mix) {
      const cost = m.flasks * FLASK_PRICE + KEY_PRICE;
      gold += m.share * cost * simulateFogMany(40, m.flasks, m.perks).goldPerCent;
      spent += m.share * cost;
    }
    const bots = gold / spent;
    expect(FIELD_GOLD_PER_CENT).toBeLessThanOrEqual(bots);
    expect(FIELD_GOLD_PER_CENT).toBeGreaterThanOrEqual(bots * 0.7);
  });

  it("keeps a fixed entry cost and a meaningful two-flask efficiency advantage with stronger creature drain", { timeout: 60_000 }, () => {
    const one = simulateFogMany(30, 1).goldPerCent;
    const two = simulateFogMany(30, 2).goldPerCent;
    expect(KEY_PRICE).toBeGreaterThan(0);
    expect(simulateFogRun(1000,1).spent).toBe(KEY_PRICE+FLASK_PRICE);
    expect(simulateFogRun(1000,2).spent).toBe(KEY_PRICE+2*FLASK_PRICE);
    // The original +25% requirement is unchanged. Drain 4 plus the lantern cap measures ~2.14x on these 30 seeds.
    expect(two).toBeGreaterThan(one * 1.25);
  });

  it("lets the best build bank more gold per cent spent, but within 3.5x of an unperked delver", { timeout: 120_000 }, () => {
    // The strongest legal build, locked 10+ rounds, banks about 3.1x (the Rare Friends version's reached 3.4x). Payouts are
    // bounded anyway: a round never returns more than MAX_ROUND_RETURN of what went into its descents.
    const base = simulateFogMany(40, 2).goldPerCent;
    const best = simulateFogMany(40, 2, strong).goldPerCent;
    expect(best / base).toBeGreaterThan(1.2);
    expect(best / base).toBeLessThan(3.5);
  });

  it("splits exactly the pool between a mixed crowd, with more gold taking more", { timeout: 120_000 }, () => {
    const cohorts: Cohort[] = [
      { name: "base", perks: NO_PERKS, flasks: 2, share: 70 },
      { name: "prospector", perks: mergePerks({ goldPct: 25 }), flasks: 2, share: 20 },
      { name: "strong", perks: strong, flasks: 3, share: 10 },
    ];
    const sim = simulateRound(cohorts, 2_000, 20);
    // Paid out plus what the return cap held back is the round pool's share by construction: nothing more is handed out.
    expect(sim.overall + sim.withheld).toBeCloseTo(ACTIVE_SHARE, 2);
    for (const r of Object.values(sim.rtp)) expect(r).toBeLessThanOrEqual(MAX_ROUND_RETURN + 1e-9);
    expect(Object.values(sim.goldShare).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(sim.rtp.strong).toBeGreaterThan(sim.rtp.prospector);
    expect(sim.rtp.prospector).toBeGreaterThan(sim.rtp.base);
  });
});

describe("settlement rounding", () => {
  it("rounds both shares down and keeps the crumb for the next round", () => {
    const s = settleRound(1, 1, 2);
    expect(s.payout).toBe(0.33);
    expect(s.fieldPayout).toBe(0.66);
    expect(s.carry).toBe(0.01);
    expect(s.payout + s.fieldPayout + s.carry).toBeCloseTo(1, 10);
    for (const pool of [0.07, 1, 13.37, 999.99, 13_427.13]) {
      for (const [mine, others] of [[1, 2], [7, 13], [150, 28_000], [1, 1_000_000]]) {
        const r = settleRound(pool, mine, others);
        expect(r.payout + r.fieldPayout + r.carry).toBeCloseTo(pool, 8);
        expect(r.carry).toBeGreaterThanOrEqual(0);
        expect(r.carry).toBeLessThan(0.02);
      }
    }
  });
});

