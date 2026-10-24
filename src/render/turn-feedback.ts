import { isFloor, idx } from "@/game/dungeon";
import { currentStepCost, type RunState } from "@/game/run";

export type LossCause = "step" | "hit" | "boss";
export type LightLoss = { amount: number; cause: LossCause };

export const sameFloor = (a: RunState, b: RunState) => a.seed === b.seed && a.runId === b.runId && a.depth === b.depth;

/** Read the already-resolved contact, including attacks that do not increment steps. No game state is changed. */
export function bossDrained(prev: RunState, next: RunState) {
  return sameFloor(prev, next) && next.events.includes("bossDrain");
}

export function lossCause(prev: RunState, next: RunState): LossCause {
  return bossDrained(prev, next) ? "boss" : next.events.includes("drain") ? "hit" : "step";
}

/** The actual net fall of the bar, not nominal damage that could exceed the remaining light or be offset by oil. */
export function lightLoss(prev: RunState, next: RunState): LightLoss | null {
  if (!sameFloor(prev, next) || next.light >= prev.light) return null;
  return { amount: prev.light - next.light, cause: lossCause(prev, next) };
}

export const lightNumber = (n: number) => Number(n.toFixed(2)).toString();

export function deathExplanation(prev: RunState, next: RunState): string | null {
  if (prev.status !== "playing" || next.status !== "dead") return null;
  const cause = lossCause(prev, next);
  if (prev.light <= 0 && prev.nightVision > 0) return `Night Vision exhausted · ${cause}`;
  const loss = lightLoss(prev, next);
  return loss ? `Last loss: −${lightNumber(loss.amount)} light · ${cause}` : "Light exhausted · final source unavailable";
}

export type ShakeWeight = "none" | "small" | "big" | "boss" | "death";
export function shakeWeight(prev: RunState, next: RunState, reducedMotion: boolean): ShakeWeight {
  if (reducedMotion || !sameFloor(prev, next)) return "none";
  if (prev.status === "playing" && next.status === "dead") return "death";
  if (bossDrained(prev, next)) return "boss";
  if (!next.events.includes("drain")) return "none";
  return (lightLoss(prev, next)?.amount ?? 0) >= 8 ? "big" : "small";
}

export const SHAKE_PX: Record<ShakeWeight, number> = { none: 0, small: 1, big: 3, boss: 5, death: 7 };

/** Optimistic walk cost along discovered floor only. Ignores occupants, threats, refills and Night Vision. */
export function riftEstimate(run: RunState): { steps: number; light: number } | null {
  const { floor, player } = run;
  const queue = [{ x: player.x, y: player.y, steps: 0 }], visited = new Set<number>([idx(floor, player.x, player.y)]);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (p.x === floor.spawn.x && p.y === floor.spawn.y) return { steps: p.steps, light: p.steps * currentStepCost(run) };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = idx(floor, x, y);
      if (!isFloor(floor, x, y) || !floor.seen[k] || visited.has(k)) continue;
      visited.add(k); queue.push({ x, y, steps: p.steps + 1 });
    }
  }
  return null;
}
