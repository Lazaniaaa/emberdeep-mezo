import { describe, expect, it, vi } from "vitest";
import { NO_PERKS, WEAPONS } from "./catalog";
import { MAX_MOVES, ReplayError, decodeMove, encodeMove, maxRunPerks, replayRun, validateSetup } from "./replay";
import { emptyBag, type RunAction, type RunState } from "./run";
import { simulateDiveRun, simulateFogRun } from "./sim";

// The bots play through the real applyAction; this records the moves they make while the descent is on.
const tape = vi.hoisted(() => ({ moves: [] as RunAction[], last: null as RunState | null, on: false }));
vi.mock("./run", async importOriginal => {
  const run = await importOriginal<typeof import("./run")>();
  return {
    ...run,
    applyAction: (s: RunState, a: RunAction) => {
      const next = run.applyAction(s, a);
      if (tape.on && s.status === "playing") { tape.moves.push(a); tape.last = next; }
      return next;
    },
  };
});

function recordBot(play: () => unknown) {
  tape.moves = []; tape.last = null; tape.on = true;
  try { play(); } finally { tape.on = false; }
  return { moves: tape.moves.map(encodeMove), final: tape.last! };
}

const setupFor = (seed: number, flasks: number) => ({ seed, flasks, perks: { ...NO_PERKS }, weaponDamage: WEAPONS.dagger.damage, bag: emptyBag() });

describe("replayRun", () => {
  it("reaches exactly what the bots reached, home or lost", () => {
    let home = 0, lost = 0;
    for (let i = 0; i < 6; i++) {
      const seed = 4_000 + i * 977;
      for (const [play, flasks] of [[() => simulateFogRun(seed, 2), 2], [() => simulateDiveRun(seed, 1), 1]] as const) {
        const { moves, final } = recordBot(play);
        const r = replayRun(setupFor(seed, flasks), moves);
        expect(r.state.status).toBe(final.status);
        expect([r.state.light,r.state.maxLight]).toEqual([final.light,final.maxLight]);
        expect([r.depth, r.gold, r.kills, r.bossSlain]).toEqual([final.deepest, final.gold, final.kills, final.bossSlain === true]);
        expect(r.home).toBe(final.status === "extracted");
        if (r.home) home++; else lost++;
      }
    }
    expect(home).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  }, 60_000);

  it("refuses moves that would play past the end", () => {
    const { moves } = recordBot(() => simulateFogRun(7, 2));
    expect(() => replayRun(setupFor(7, 2), [...moves, "W"])).toThrow(ReplayError);
  });

  it("refuses a descent that has not ended", () => {
    const { moves } = recordBot(() => simulateFogRun(7, 2));
    expect(() => replayRun(setupFor(7, 2), moves.slice(0, -1))).toThrow(/not ended/);
  });

  it("gives another result for another seed, so a result cannot be moved to an easier dungeon", () => {
    const { moves, final } = recordBot(() => simulateFogRun(11, 2));
    let same = true;
    try {
      const other = replayRun(setupFor(12, 2), moves);
      same = other.gold === final.gold && other.depth === final.deepest && other.kills === final.kills;
    } catch { same = false; }
    expect(same).toBe(false);
  });

  it("refuses empty, oversized and unknown move lists", () => {
    expect(() => replayRun(setupFor(1, 1), [])).toThrow(/No moves/);
    expect(() => replayRun(setupFor(1, 1), new Array(MAX_MOVES + 1).fill("W"))).toThrow(/Too many/);
    expect(() => replayRun(setupFor(1, 1), ["Q"])).toThrow(/Unknown move/);
    expect(() => replayRun(setupFor(1, 1), "UUDD")).toThrow(/No moves/);
  });
});

describe("moves as codes", () => {
  it("round-trips every kind of move", () => {
    const all: RunAction[] = [
      { type: "move", dx: 0, dy: -1 }, { type: "move", dx: 0, dy: 1 }, { type: "move", dx: -1, dy: 0 }, { type: "move", dx: 1, dy: 0 },
      { type: "wait" }, { type: "descend" }, { type: "extract" }, { type: "potion", id: "oil" }, { type: "potion", id: "heal" },
    ];
    for (const a of all) expect(decodeMove(encodeMove(a))).toEqual(a);
  });

  it("refuses diagonal steps and leaps", () => {
    expect(() => encodeMove({ type: "move", dx: 1, dy: 1 })).toThrow(ReplayError);
    expect(() => encodeMove({ type: "move", dx: 2, dy: 0 })).toThrow(ReplayError);
    expect(() => decodeMove("Pgold")).toThrow(ReplayError);
    expect(() => decodeMove(5)).toThrow(ReplayError);
  });
});

describe("validateSetup", () => {
  it("accepts the strongest legal loadout and rebuilds it from checked fields only", () => {
    const max = maxRunPerks();
    const s = validateSetup({ ...setupFor(9, 5), perks: max, weaponDamage: WEAPONS.emberblade.damage, ticketChance: 0.03, runId: "x", extra: 1 });
    expect(s.perks).toEqual(max);
    expect(Object.keys(s).sort()).toEqual(["bag", "flasks", "perks", "seed", "ticketChance", "weaponDamage"]);
  });

  it("refuses anything the game cannot give", () => {
    const max = maxRunPerks();
    const bad: Record<string, unknown>[] = [
      { seed: -1 }, { seed: 2 ** 32 }, { seed: 1.5 }, { flasks: 0 }, { flasks: 6 }, { weaponDamage: 999 },
      { ticketChance: 1 }, { bag: { ...emptyBag(), oil: 51 } }, { bag: { ...emptyBag(), oil: -1 } },
      { perks: { ...max, goldPct: max.goldPct + 1 } }, { perks: { ...max, damage: max.damage + 1 } },
      { perks: { ...max, radius: max.radius + 1 } }, { perks: { ...max, startLight: -5 } },
      { perks: { ...max, regenEvery: 1 } }, { perks: { ...max, regenEvery: 8 } }, { perks: { ...max, stealth: "yes" } },
      { perks: { ...max, stealth: true } }, { perks: { ...max, findPct: Number.NaN } },
    ];
    for (const change of bad) expect(() => validateSetup({ ...setupFor(9, 2), ...change }), JSON.stringify(change)).toThrow(ReplayError);
  });

  it("keeps the ceiling within what a locked Delver, the stake, a weapon and armor can reach", () => {
    const max = maxRunPerks();
    expect(max.stepDiscount).toBeLessThanOrEqual(0.4);
    expect(max.drainReduce).toBe(0.45);
    // Only a Legendary Delver's +1 radius is left, and nothing in the game gives regrowth or stealth any more.
    expect(max.radius).toBe(1);
    expect(max.regenEvery).toBe(0);
    expect(max.stealth).toBe(false);
  });
});
