import type { RunEvent } from "@/game/run";

const BLOWS = new Set<RunEvent>(["hit", "kill", "boss", "smash", "break"]);

/** Flushed by the visible render frame: contact sound and contact picture share the same clock. No input timers. */
export class TurnSounds {
  private pending: { event: RunEvent; at: number }[] = [];

  add(events: readonly RunEvent[], now: number, contactAt: number) {
    for (const event of new Set(events)) this.pending.push({ event, at: BLOWS.has(event) ? contactAt : now });
    if (this.pending.length > 80) this.pending = this.pending.slice(-80);
  }

  flush(now: number, muted: boolean, play: (event: RunEvent) => void) {
    const due = this.pending.filter(cue => cue.at <= now);
    this.pending = this.pending.filter(cue => cue.at > now);
    if (!muted) for (const cue of due) play(cue.event);
  }

  clear() { this.pending = []; }
}
