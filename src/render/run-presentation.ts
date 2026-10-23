import type { RunState } from "@/game/run";
import { TurnSounds } from "@/audio/turn-sounds";
import { CreatureAnimator } from "./creature-anim";
import { FxQueue } from "./fx";
import { HeroAttacks, HERO_WINDUP_MS, turnEffects } from "./hero-anim";
import { deathExplanation, lightLoss, sameFloor } from "./turn-feedback";

/** UI-only history; deliberately separate from RunState, replay, settlement and the signing server. */
export class RunPresentation {
  previous: RunState;
  readonly fx = new FxQueue();
  readonly hero = new HeroAttacks();
  readonly creatures = new CreatureAnimator();
  readonly sounds = new TurnSounds();
  hurtAt = -Infinity;
  death: string | null = null;

  constructor(run: RunState) {
    this.previous = run;
    this.creatures.updateRun(run, 0);
  }

  observe(next: RunState, now: number) {
    const prev = this.previous;
    if (prev === next) return;
    this.previous = next;
    if (!sameFloor(prev, next)) {
      this.fx.clear(); this.hero.clear(); this.sounds.clear(); this.hurtAt = -Infinity;
      if (prev.seed !== next.seed || prev.runId !== next.runId) this.death = null;
    }
    const turn = turnEffects(prev, next, now);
    for (const fx of turn.fx) this.fx.add(fx);
    if (turn.attack) this.hero.add(now, next.player.facing);
    if (turn.hurt) this.hurtAt = now;
    const loss = lightLoss(prev, next);
    if (loss) this.fx.light.add(loss, next.player, now);
    this.death = deathExplanation(prev, next) ?? this.death;
    this.creatures.updateRun(next, now);
    this.sounds.add(next.events, now, now + HERO_WINDUP_MS);
  }
}
