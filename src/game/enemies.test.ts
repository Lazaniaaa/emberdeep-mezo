import { describe, expect, it } from "vitest";
import { NO_PERKS } from "./catalog";
import { ENEMY_HIT_MULT, ENEMY_RECOVERY, MAP_H, MAP_W, enemyCount, floorHeight, floorScale, floorWidth, stepCost } from "./config";
import { generateFloor, idx, type Dimling } from "./dungeon";
import { ENEMIES, enemiesAvailableAt, enemyDef } from "./enemies";
import { attackTiles, reachDirection, windupProgress } from "./enemy-ai";
import { createRng } from "./rng";
import { applyAction, emptyBag, startRun, type RunState } from "./run";

/** An open 11 x 11 room with the delver in the middle, nothing else on the floor, and plenty of light. */
function room(over: Partial<Parameters<typeof startRun>[0]> = {}): RunState {
  const s = startRun({ seed: 7, flasks: 5, perks: NO_PERKS, weaponDamage: 8, bag: emptyBag(), ...over });
  s.floor.tiles.fill(0);
  for (let y = 2; y <= 12; y++) for (let x = 2; x <= 12; x++) s.floor.tiles[idx(s.floor, x, y)] = 1;
  s.floor.items = [];
  s.floor.dimlings = [];
  s.floor.props = [];
  s.player = { x: 6, y: 6, facing: "right" };
  return s;
}

const creature = (over: Partial<Dimling> = {}): Dimling => ({
  id: 1, x: 7, y: 6, hp: 16, maxHp: 16, awake: true, species: "wickgnaw", phase: "idle", windupLeft: 0, cooldown: 0, aim: null, ...over,
});

const wait = (s: RunState) => applyAction(s, { type: "wait" });
const hit = (depth = 1) => (2 + Math.floor(depth / 2)) * ENEMY_HIT_MULT;

describe("a creature that strikes after a warning", () => {
  it.each([[1,8],[2,12],[3,12],[4,16],[5,16],[6,20],[7,20]])("takes %s-floor light at the rebalanced ordinary-creature rate (%s)", (depth,drain) => {
    const s=room();s.depth=s.floor.depth=depth;s.light=200;
    s.floor.dimlings=[creature({phase:"windup",windupLeft:1})];
    const struck=wait(s);
    expect(struck.events).toContain("drain");
    expect(s.light-struck.light).toBeCloseTo(stepCost(depth)+drain);
    expect(struck.floor.dimlings[0]).toMatchObject({phase:"recovery",cooldown:ENEMY_RECOVERY});
  });

  it("winds up first, then strikes, then is open for a turn before it can start again", () => {
    let s = room();
    s.floor.dimlings = [creature()];
    const start = s.light;

    s = wait(s);
    expect(s.events).toContain("warn");
    expect(s.floor.dimlings[0]).toMatchObject({ phase: "windup", windupLeft: 1 });
    // The warning itself costs nothing but the step.
    expect(start - s.light).toBeCloseTo(stepCost(1));

    const before = s.light;
    s = wait(s);
    expect(s.events).toContain("drain");
    expect(before - s.light).toBeCloseTo(stepCost(1) + hit());
    expect(s.floor.dimlings[0]).toMatchObject({ phase: "recovery", cooldown: ENEMY_RECOVERY });

    // While it recovers it cannot hit, whatever the delver does.
    const rest = s.light;
    s = wait(s);
    expect(s.events).not.toContain("drain");
    expect(rest - s.light).toBeCloseTo(stepCost(1));
    expect(s.floor.dimlings[0].phase).toBe("idle");

    s = wait(s);
    expect(s.events).toContain("warn");
  });

  it("misses a delver who steps off the marked tiles in time", () => {
    let s = room();
    s.floor.dimlings = [creature()];
    s = wait(s);
    const marked = attackTiles(s.floor, s.floor.dimlings[0]);
    expect(marked).toHaveLength(4);
    expect(marked.some(t => t.x === 6 && t.y === 6)).toBe(true);
    const before = s.light;
    s = applyAction(s, { type: "move", dx: -1, dy: 0 });
    expect(s.player).toMatchObject({ x: 5, y: 6 });
    expect(s.events).toContain("miss");
    expect(s.events).not.toContain("drain");
    expect(before - s.light).toBeCloseTo(stepCost(1));
    expect(s.floor.dimlings[0].phase).toBe("recovery");
  });

  it("is cancelled by killing the creature during its wind-up", () => {
    let s = room();
    s.floor.dimlings = [creature({ hp: 8, maxHp: 8 })];
    s = wait(s);
    expect(s.floor.dimlings[0].phase).toBe("windup");
    s = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(s.events).toContain("kill");
    expect(s.events).not.toContain("drain");
    expect(s.floor.dimlings).toHaveLength(0);
    expect(s.messages[0]).toMatch(/Waxling defeated/);
  });

  it("is turned aside by a ward, and says so", () => {
    let s = room({ bag: { ...emptyBag(), ward: 1 } });
    s.floor.dimlings = [creature()];
    s = applyAction(s, { type: "potion", id: "ward" });
    s = wait(s);
    s = wait(s);
    expect(s.events).toContain("miss");
    expect(s.events).not.toContain("drain");
    expect(s.messages.some(m => /ward/i.test(m))).toBe(true);
  });

  it("takes less light through armor, like every other blow", () => {
    let s = room({ perks: { ...NO_PERKS, drainReduce: 0.5 } });
    s.floor.dimlings = [creature()];
    s = wait(s);
    const before = s.light;
    s = wait(s);
    expect(before - s.light).toBeCloseTo(stepCost(1) + hit() * 0.5);
  });

  it("aims a line attack when the wind-up starts, and gives slow creatures two moves to dodge", () => {
    let s = room();
    const toad = enemyDef("snaretoad");
    expect(toad.windup).toBe(2);
    s.floor.dimlings = [creature({ species: "snaretoad", x: 9, y: 6 })];
    s = wait(s);
    let d = s.floor.dimlings[0];
    expect(d).toMatchObject({ phase: "windup", windupLeft: 2, aim: { x: -1, y: 0 } });
    expect(attackTiles(s.floor, d).map(t => `${t.x},${t.y}`)).toEqual(["8,6", "7,6", "6,6"]);
    expect(windupProgress(d)).toBeCloseTo(0.5);

    s = wait(s);
    d = s.floor.dimlings[0];
    expect(s.events).not.toContain("drain");
    expect(windupProgress(d)).toBe(1);

    // Stepping sideways leaves the line.
    const before = s.light;
    s = applyAction(s, { type: "move", dx: 0, dy: 1 });
    expect(s.events).toContain("miss");
    expect(before - s.light).toBeCloseTo(stepCost(1));
  });

  it("hits a delver who stays in the line", () => {
    let s = room();
    s.floor.dimlings = [creature({ species: "snaretoad", x: 9, y: 6 })];
    for (let i = 0; i < 3; i++) s = wait(s);
    expect(s.events).toContain("drain");
  });

  it("does not wind up when the delver is not in its reach", () => {
    let s = room();
    s.floor.dimlings = [creature({ x: 9, y: 9 })];
    s = wait(s);
    expect(s.floor.dimlings[0].phase).toBe("idle");
    expect(s.events).not.toContain("warn");
    // A cross reaches only as far as its range: two tiles away is out of a Waxling's reach.
    s = room();
    s.floor.dimlings = [creature({ x: 8, y: 6 })];
    expect(reachDirection(s.floor, s.floor.dimlings[0], s.player)).toBeNull();
  });

  it("never attacks from the dark, so the warning is always in view", () => {
    let s = room();
    s.light = 10;
    s.floor.dimlings = [creature({ species: "cinder-hound", x: 9, y: 6 })];
    s = wait(s);
    expect(s.floor.dimlings[0].phase).not.toBe("windup");
    expect(s.events).not.toContain("warn");
  });

  it("is stopped by walls: no line of attack through them", () => {
    const s = room();
    s.floor.tiles[idx(s.floor, 7, 6)] = 0;
    const d = creature({ species: "snaretoad", x: 9, y: 6, aim: { x: -1, y: 0 } });
    expect(reachDirection(s.floor, d, s.player)).toBeNull();
    expect(attackTiles(s.floor, d).map(t => `${t.x},${t.y}`)).toEqual(["8,6"]);
  });

  it("has the skeleton archer back away a tile at a time, resting one to three turns between steps", () => {
    let s = room();
    // Off every line through the delver, so it has no shot and only keeps its distance.
    s.floor.dimlings = [creature({ species: "chaincoil", x: 8, y: 9 })];
    const far = (d: { x: number; y: number }) => Math.abs(d.x - 6) + Math.abs(d.y - 6);
    const moves: number[] = [];
    let last = { ...s.floor.dimlings[0] };
    for (let turn = 0; turn < 10; turn++) {
      s = wait(s);
      const d = s.floor.dimlings[0];
      if (d.x !== last.x || d.y !== last.y) {
        expect(Math.abs(d.x - last.x) + Math.abs(d.y - last.y)).toBe(1);
        expect(far(d)).toBeGreaterThan(far(last));
        moves.push(turn);
      }
      expect(d.phase).toBe("idle");
      last = { ...d };
    }
    expect(moves.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i] - moves[i - 1]).toBeGreaterThanOrEqual(1);
      expect(moves[i] - moves[i - 1]).toBeLessThanOrEqual(3);
    }
    // It rests at least once in a while, so it is slower than the delver.
    expect(moves.length).toBeLessThan(10);
  });

  it("lets a delver who presses on catch the skeleton archer", () => {
    let s = room();
    for (let y = 1; y < 21; y++) for (let x = 1; x < 33; x++) s.floor.tiles[idx(s.floor, x, y)] = 1;
    s.light = 9999; s.startLight = 9999;
    s.floor.dimlings = [creature({ species: "chaincoil", x: 12, y: 11 })];
    let caught = false;
    for (let turn = 0; turn < 60 && !caught; turn++) {
      const d = s.floor.dimlings[0];
      const dx = d.x - s.player.x, dy = d.y - s.player.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) { caught = true; break; }
      s = Math.abs(dx) >= Math.abs(dy)
        ? applyAction(s, { type: "move", dx: Math.sign(dx), dy: 0 })
        : applyAction(s, { type: "move", dx: 0, dy: Math.sign(dy) });
    }
    expect(caught).toBe(true);
  });

  it("wakes only when the delver comes near and leaves sleeping creatures alone", () => {
    let s = room();
    s.floor.dimlings = [creature({ awake: false, x: 12, y: 12 })];
    for (let i = 0; i < 5; i++) s = wait(s);
    expect(s.floor.dimlings[0]).toMatchObject({ x: 12, y: 12, phase: "idle" });
  });

  it("gives a defeated creature's gold from the kill table", () => {
    let s = room();
    s.floor.dimlings = [creature({ hp: 8, maxHp: 8, awake: false })];
    s = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(s.gold).toBeGreaterThanOrEqual(3);
    expect(s.gold).toBeLessThanOrEqual(6);
  });
});

describe("the creatures and the floors they live on", () => {
  it("gives every creature a reach, a wind-up and a way to be beaten", () => {
    for (const e of ENEMIES) {
      expect(e.range).toBeGreaterThanOrEqual(1);
      expect(e.windup).toBeGreaterThanOrEqual(1);
      expect(e.hp).toBeGreaterThan(0);
      expect(e.move).toBeGreaterThanOrEqual(0);
      expect(["line", "cross"]).toContain(e.attack);
    }
  });

  it("introduces creatures gradually, with more to choose from as the floors go down", () => {
    expect(enemiesAvailableAt(1).map(e => e.id)).toEqual(["wickgnaw", "snaretoad"]);
    for (let depth = 2; depth <= 6; depth++) expect(enemiesAvailableAt(depth).length).toBeGreaterThanOrEqual(enemiesAvailableAt(depth - 1).length);
    expect(enemiesAvailableAt(6)).toHaveLength(ENEMIES.length);
  });

  it("puts at least six creatures on the first floor and a few more on every one after", () => {
    expect(enemyCount(1)).toBe(6);
    for (let depth = 2; depth <= 12; depth++) expect(enemyCount(depth)).toBeGreaterThan(enemyCount(depth - 1));
    for (let seed = 1; seed <= 40; seed++) {
      const floor = generateFloor(createRng(seed), 1, { findPct: 0 });
      expect(floor.dimlings.length).toBeGreaterThanOrEqual(6);
      for (const d of floor.dimlings) {
        expect(["wickgnaw", "snaretoad"]).toContain(d.species);
        expect(d).toMatchObject({ phase: "idle", awake: false });
      }
    }
  });

  it("spaces creatures out and keeps them off the rift, the stairs and the loot", () => {
    for (let depth = 1; depth <= 6; depth++) {
      const floor = generateFloor(createRng(depth * 17), depth, { findPct: 0 });
      const items = new Set(floor.items.map(i => `${i.x},${i.y}`));
      floor.dimlings.forEach((d, i) => {
        expect(items.has(`${d.x},${d.y}`)).toBe(false);
        expect([d.x, d.y]).not.toEqual([floor.spawn.x, floor.spawn.y]);
        expect([d.x, d.y]).not.toEqual([floor.stairs.x, floor.stairs.y]);
        for (const o of floor.dimlings.slice(i + 1)) expect(Math.abs(d.x - o.x) + Math.abs(d.y - o.y)).toBeGreaterThanOrEqual(3);
      });
    }
  });

  it("keeps the larger early-floor canvases independently of each authored floor's walkable area", () => {
    for (let depth = 1; depth <= 3; depth++) {
      expect([floorWidth(depth), floorHeight(depth)]).toEqual([34, 22]);
      expect(floorScale(depth)).toBeGreaterThanOrEqual(1.6);
      const floor = generateFloor(createRng(depth), depth, { findPct: 0 });
      expect([floor.w, floor.h]).toEqual([34, 22]);
      expect(floor.tiles).toHaveLength(34 * 22);
    }
    for (let depth = 4; depth <= 9; depth++) {
      expect([floorWidth(depth), floorHeight(depth)]).toEqual([MAP_W, MAP_H]);
      expect(generateFloor(createRng(depth), depth, { findPct: 0 }).tiles).toHaveLength(MAP_W * MAP_H);
    }
    // Independent layout tests cover the actual area and three-lane links; canvas size is not an area quota.
  });

  it("carries a saved floor of any depth through a copy without losing its creatures' state", () => {
    const s = room();
    s.floor.dimlings = [creature({ phase: "windup", windupLeft: 2, aim: { x: 0, y: 1 } })];
    const copy = JSON.parse(JSON.stringify(s)) as RunState;
    expect(copy.floor.dimlings[0]).toMatchObject({ phase: "windup", windupLeft: 2, aim: { x: 0, y: 1 } });
    // The next turn behaves the same on the copy.
    expect(wait(copy).floor.dimlings[0].windupLeft).toBe(1);
  });
});

describe("props provide cover", () => {
  for (const species of ["chaincoil", "fourfold-bell"] as const) it(`${species}: every arm stops before a prop, including warnings`, () => {
    for (const aim of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]) {
      const s=room(), d=creature({x:6,y:6,species,aim});
      const p={x:6+aim.x,y:6+aim.y};
      const target={x:6+aim.x*2,y:6+aim.y*2};
      s.floor.props=[{...p,id:99,kind:"crate",hp:1,maxHp:2}];
      expect(attackTiles(s.floor,d).some(t=>t.x===p.x&&t.y===p.y)).toBe(false);
      expect(attackTiles(s.floor,d).some(t=>t.x===target.x&&t.y===target.y)).toBe(false);
      expect(reachDirection(s.floor,d,target)).toBeNull();
      s.floor.props=[];
      expect(attackTiles(s.floor,d)).toContainEqual(target);
      expect(reachDirection(s.floor,d,target)).toEqual(aim);
    }
  });
  it("rechecks cover when a wound-up strike resolves; a broken prop opens the line immediately", () => {
    const s=room();
    s.floor.dimlings=[creature({x:9,y:6,species:"chaincoil",phase:"windup",windupLeft:1,aim:{x:-1,y:0}})];
    s.floor.props=[{id:90,x:7,y:6,kind:"urn",hp:1,maxHp:1}];
    const protectedTurn=wait(s);
    expect(protectedTurn.events).not.toContain("drain");
    expect(protectedTurn.events).toContain("miss");
    const exposed=applyAction(s,{type:"move",dx:1,dy:0});
    expect(exposed.floor.props).toHaveLength(0);
    expect(exposed.events).toContain("drain");
  });
});
