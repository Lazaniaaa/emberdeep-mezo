import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, DoorOpen, Gem, Moon, Shield, Ticket, Stars } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItemArt } from "@/components/art";
import { DPad } from "@/components/dpad";
import { Header } from "@/components/header";
import { MOVE_MS, isActKey, moveOf } from "@/lib/controls";
import { playSfx } from "@/audio/sfx";
import { lootMultiplier } from "@/game/config";
import type { Animal } from "@/game/animals";
import { POTIONS, POTION_IDS, type PotionId } from "@/game/catalog";
import { roundShare } from "@/game/economy";
import { MAX_LEVEL, xpToNext } from "@/game/levels";
import { GEAR } from "@/game/props";
import { baseDamage, bossAlive, currentRadius, currentStepCost, levelOf, maxLightOf, onRift, onStairs, xpOf, type RunAction, type RunState } from "@/game/run";
import { percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RunPresentation } from "@/render/run-presentation";
import { lightNumber, riftEstimate, SHAKE_PX, shakeWeight, type ShakeWeight } from "@/render/turn-feedback";
import { COLORS, TILE, cameraFor, drawRun, type View } from "@/render/renderer";
import { settle, useRun } from "@/state/run-store";
import { holdRunLock } from "@/state/run-lock";
import { useGame } from "@/state/store";
import { resolveHero } from "./hero-info";
import { rememberDeath, reportDeath } from "./death-cause";
import {PerkBar,PerkChoiceDialog} from './level-perks';
import type {LevelPerkId} from '@/game/level-perks';

type Screen = { w: number; h: number };

/** Whole-number zoom, so at least about 14 x 9 tiles fit: enough to see a creature wind up and step aside. */
function runZoom(screen: Screen) {
  const fit = Math.floor(Math.min(screen.w / (14 * TILE), screen.h / (9 * TILE)));
  return Math.max(1, Math.min(4, fit));
}

/** The descent fills the screen, like the camp: the cave is the picture and everything else floats over it. */
export function RunView() {
  const run = useRun(s => s.run)!;
  const act = useRun(s => s.act);
  const clear = useRun(s => s.clear);
  const game = useGame();
  const hero = resolveHero(game.hero, game.heroes);
  const [presentation] = useState(() => new RunPresentation(run));
  const [impact, setImpact] = useState({ id: 0, weight: "none" as ShakeWeight });
  const shakeRoot = useRef<HTMLDivElement>(null);
  const lastKey = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>({ w: 1280, h: 720 });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setScreen({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  // Observe every action synchronously, even if React batches multiple store notifications into one render.
  useEffect(() => {
    const unsubscribe = useRun.subscribe(({ run: next }) => {
      if (!next || next === presentation.previous) return;
      const prev = presentation.previous;
      presentation.observe(next, performance.now());
      if (document.hidden) presentation.sounds.clear();
      if (prev.status === "playing" && next.status === "dead" && presentation.death) rememberDeath(next, presentation.death);
      const weight = shakeWeight(prev, next, useGame.getState().reducedMotion);
      setImpact(last => ({ id: last.id + 1, weight }));
    });
    const hide = () => { if (document.hidden) presentation.sounds.clear(); };
    document.addEventListener("visibilitychange", hide);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", hide); presentation.sounds.clear(); };
  }, [presentation]);

  useEffect(() => { if (game.muted) presentation.sounds.clear(); }, [game.muted, presentation]);

  useEffect(() => {
    const px = game.reducedMotion ? 0 : SHAKE_PX[impact.weight];
    if (!px || !shakeRoot.current) return;
    // Animate the existing wrapper. A keyed wrapper used to remount Canvas and erase its strike history on every hit.
    const animation = shakeRoot.current.animate([
      { transform: "translate(0,0)" }, { transform: `translate(${-px}px,${px / 2}px)` },
      { transform: `translate(${px}px,${-px / 2}px)` }, { transform: `translate(${-px / 2}px,${px / 3}px)` },
      { transform: "translate(0,0)" },
    ], { duration: impact.weight === "death" ? 260 : 180, easing: "ease-in-out" });
    return () => animation.cancel();
  }, [impact, game.reducedMotion]);

  const dispatch = useCallback((action: RunAction) => { act(action); }, [act]);
  const choosePerk=useCallback((id:LevelPerkId)=>{const prev=useRun.getState().run,next=act({type:'perk',id});if(next&&next!==prev)playSfx('buy',useGame.getState().muted);},[act]);

  const contextAction = useCallback(() => {
    const r = useRun.getState().run;
    if (!r) return;
    if (onStairs(r)) dispatch({ type: "descend" });
    else if (onRift(r)) dispatch({ type: "extract" });
  }, [dispatch]);

  // While this tab plays, tell the other tabs; once the descent ends, make sure its result is booked.
  useEffect(() => {
    const r = useRun.getState().run;
    if (!r) return;
    if (r.status !== "playing") { settle(r); return; }
    return holdRunLock(r.runId ?? "legacy");
  }, [run.status, run.runId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      // Enter and Space belong to a focused button; do not steal them for the game.
      if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLElement && e.target.closest("button, a, summary, [role=button]")) return;
      const r = useRun.getState().run;
      if (!r || r.status !== "playing") return;
      const now = performance.now();
      const dir = moveOf(e);
      const potion = POTION_IDS.find(id => POTIONS[id].key === e.key);
      if (dir || e.key === " " || e.key === "." || isActKey(e) || e.key === "Enter" || potion) e.preventDefault();
      if (e.repeat && now - lastKey.current < MOVE_MS) return;
      lastKey.current = now;
      if (dir) dispatch({ type: "move", dx: dir[0], dy: dir[1] });
      else if (e.key === " " || e.key === ".") dispatch({ type: "wait" });
      else if (isActKey(e) || e.key === "Enter") contextAction();
      else if (potion) dispatch({ type: "potion", id: potion });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, contextAction]);

  // The result is already banked when the descent ends, so this only closes the screen.
  const finish = () => clear();

  const zoom = runZoom(screen);
  const view: View = { x: 0, y: 0, w: Math.ceil(screen.w / (TILE * zoom)), h: Math.ceil(screen.h / (TILE * zoom)) };
  const share = roundShare(game.roundGold + run.gold, game.fieldGold);
  const capacity = maxLightOf(run);
  const lightPct = Math.min(100, (run.light / Math.max(1, capacity)) * 100);
  const nightVision = run.light <= 0 && run.nightVision > 0;
  const atStairs = onStairs(run), atRift = onRift(run);
  const sealed = bossAlive(run);
  const playing = run.status === "playing";
  const windingUp = run.floor.dimlings.some(d => d.phase === "windup");
  const level = levelOf(run);
  const xpPct = level >= MAX_LEVEL ? 100 : Math.min(100, (xpOf(run) / xpToNext(level)) * 100);
  const back = riftEstimate(run);
  const death = presentation.death ?? (game.lastReport ? reportDeath(game.lastReport) : null);

  return (
    <div ref={root} className="fixed inset-0 overflow-hidden bg-black text-white">
      <div ref={shakeRoot} className="absolute inset-0" data-shake={game.reducedMotion ? "none" : impact.weight}>
        <GameCanvas run={run} animal={game.animal} reducedMotion={game.reducedMotion} view={view} zoom={zoom}
          presentation={presentation}
          onMove={(dx, dy) => dispatch({ type: "move", dx, dy })} />
      </div>
      {!game.reducedMotion && impact.weight !== "none" && <div key={`hurt-${impact.id}`} aria-hidden className="pointer-events-none absolute inset-0 z-10 animate-[hurt_450ms_ease-out_forwards]" />}

      <Header overlay />

      {/* Light and loot */}
      <div data-run-hud className="pointer-events-none absolute top-14 left-3 z-20 flex w-[13.5rem] flex-col gap-2 sm:top-[4.25rem] sm:w-64">
        <section className="rounded-xl border border-white/20 bg-[#150c2b]/85 px-3 py-2 backdrop-blur-sm" aria-label="Lantern">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">Light</span>
            <span className={cn("font-pixel text-xl", run.light < 15 ? "text-destructive" : "text-lime")} aria-label="Lantern light" aria-live="polite">{Math.ceil(run.light)} / {Math.ceil(capacity)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(lightPct)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${Math.ceil(run.light)} of ${Math.ceil(capacity)} light`} aria-label="Light remaining">
            <div className="h-full rounded-full bg-lime transition-[width]" style={{ width: `${lightPct}%`, boxShadow: `0 0 10px ${COLORS.lime}` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
            <Badge variant="outline">Radius {currentRadius(run)}</Badge>
            <Badge variant="outline">-{currentStepCost(run).toFixed(2)}/step</Badge>
            {nightVision && <Badge className="bg-emerald-400 text-black"><Moon /> Night vision {run.nightVision}</Badge>}
            {run.ward > 0 && <Badge className="bg-crystal text-black"><Shield /> Ward {run.ward}</Badge>}
            {(run.rage ?? 0) > 0 && <Badge className="bg-red-500 text-white">Rage {run.rage}</Badge>}
            {(run.regen ?? 0) > 0 && <Badge className="bg-emerald-500 text-black">Regen {run.regen}</Badge>}
            {(run.momentumSteps??0)>0&&<Badge className="bg-gold text-black">Free steps {run.momentumSteps}</Badge>}
            {(run.breathWaits??0)>0&&<Badge variant="outline">Free waits {run.breathWaits}</Badge>}
            {run.riposteReady&&<Badge className="bg-sigil text-black">Riposte ready</Badge>}
          </div>
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground" aria-label="Rift walk estimate"
            title="Lower bound for walking over seen tiles only. Threats, occupants and refills are excluded; survival is not guaranteed.">
            {back ? `Rift estimate: ≈${lightNumber(back.light)}+ light · ${back.steps} steps` : "Rift estimate: no known route"}
            <span className="block opacity-80">Lower bound · not a guarantee</span>
          </p>
        </section>
        <section className="rounded-xl border border-white/20 bg-[#150c2b]/85 px-3 py-1.5 backdrop-blur-sm" aria-label="Level">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">Level</span>
            <span className="font-pixel text-lg text-sigil" aria-live="polite">{level}{level >= MAX_LEVEL ? " MAX" : ""}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(xpPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Experience to the next level">
            <div className="h-full rounded-full bg-sigil transition-[width]" style={{ width: `${xpPct}%` }} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
            <Badge variant="outline">Damage {baseDamage(run)}</Badge>
            {level < MAX_LEVEL && <Badge variant="outline">{xpOf(run)}/{xpToNext(level)} xp</Badge>}
            {(run.gear ?? []).map(g => <Badge key={g} className="bg-gold text-black" title={GEAR[g].blurb}>{GEAR[g].name}</Badge>)}
          </div>
        </section>
        <section className="grid grid-cols-4 gap-1 rounded-xl border border-white/20 bg-[#150c2b]/85 px-2 py-1.5 text-center backdrop-blur-sm" aria-label="Loot this run">
          <Loot label="Depth" value={run.depth} sub={`x${lootMultiplier(run.depth).toFixed(1)}`} />
          <Loot label="Gold" value={run.gold} sub={percent(share)} color="text-gold" />
          <Loot label="Crystals" value={run.crystals} sub={run.sigils ? `${run.sigils} sigil${run.sigils > 1 ? "s" : ""}` : " "} color="text-crystal" icon={<Gem className="size-3" />} />
          <Loot label="Tickets" value={run.tickets} sub={" "} color="text-sigil" icon={<Ticket className="size-3" />} />
        </section>
      </div>

      {/* Potions */}
      <section data-run-hud className="absolute top-14 right-3 z-20 grid grid-cols-1 gap-1.5 sm:top-[4.25rem] sm:grid-cols-2" aria-label="Potions">
        {POTION_IDS.filter(id => POTIONS[id].shop || run.bag[id] > 0).map(id => (
          <PotionButton key={id} id={id} run={run} onUse={() => dispatch({ type: "potion", id })} />
        ))}
      </section>

      {/* Actions, warnings and the log share one stack, so nothing sits on the touch pad */}
      <div data-run-hud className="pointer-events-none absolute bottom-20 left-3 z-20 flex w-[calc(100%-10.5rem)] max-w-[26rem] flex-col gap-1.5 lg:w-[26rem]">
        <div className="pointer-events-auto flex flex-col items-start gap-1.5">
          {atStairs && playing && !sealed && (
            <Button size="lg" className="font-pixel shadow-lg" onClick={contextAction}><ArrowDown data-icon="inline-start" /> Descend to depth {run.depth + 1} <Kbd>E</Kbd></Button>
          )}
          {atStairs && playing && sealed && (
            <p className="rounded-lg border border-sigil/50 bg-[#150c2b]/90 px-3 py-1.5 text-xs text-sigil">The stairs are sealed. Defeat Cerberus, or walk back to the rift and leave with your loot.</p>
          )}
          {atRift && playing && (
            <Button size="lg" className="font-pixel shadow-lg" variant="secondary" onClick={contextAction}><DoorOpen data-icon="inline-start" /> Extract with {run.gold} gold <Kbd>E</Kbd></Button>
          )}
          {!atStairs && !atRift && playing && sealed && (
            <p className="rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm"><span className="text-sigil">Cerberus</span> guards the stairs. Dodge the marked strike, then attack during its two-turn recovery.</p>
          )}
        </div>
        {windingUp && playing && (
          <p className="rounded-lg border border-red-400/60 bg-red-950/80 px-2.5 py-1.5 text-xs text-red-100 backdrop-blur-sm">
            The red rings mark where the blow lands. Step off them.
          </p>
        )}
        <section className="rounded-xl border border-white/15 bg-black/60 px-3 py-2 backdrop-blur-sm" aria-label="Log">
          <ul className="space-y-0.5 text-xs" aria-live="polite">
            {run.messages.slice(0, 3).map((m, i) => (
              <li key={`${run.steps}-${i}`} className={i === 0 ? "text-foreground" : "text-muted-foreground"}>{m}</li>
            ))}
          </ul>
          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Stars className="size-3" /> Playing as <span style={{ color: hero.color }}>{hero.name}</span>
            <span className="hidden md:inline"> · Move: WASD / arrows · Wait: Space · Act: E · Potions: 1-7</span>
          </p>
        </section>
      </div>

      <div data-run-hud className="absolute right-3 bottom-20 z-20 opacity-90 lg:hidden">
        <DPad compact disabled={!playing} onMove={(dx, dy) => dispatch({ type: "move", dx, dy })} onWait={() => dispatch({ type: "wait" })} />
      </div>

      <PerkBar run={run}/>
      <PerkChoiceDialog run={run} onChoose={choosePerk}/>

      {!playing && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/75 p-4 backdrop-blur-[2px]">
          <div className="max-w-sm space-y-3 text-center">
            <div className={cn("font-pixel text-2xl", run.status === "extracted" ? "text-lime" : "text-destructive")}>
              {run.status === "extracted" ? "Extracted" : "Lost in the dark"}
            </div>
            <p className="text-sm text-muted-foreground">
              {run.status === "extracted"
                ? `You made it home from depth ${run.deepest} with ${run.gold} gold. It joins this round's pool share.`
                : `The deep keeps your ${run.gold} gold. It counts for nobody, so the pool is split among the delvers who made it home.`}
            </p>
            {run.status === "dead" && <p className="text-sm text-orange-200" aria-label="Last cause">{death ?? "Light exhausted · final source unavailable"}</p>}
            <Button size="lg" className="font-pixel" onClick={finish} autoFocus>Return to camp</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded border border-current/30 px-1 text-[10px] opacity-70">{children}</kbd>;
}

function Loot({ label, value, sub, color, icon }: { label: string; value: number; sub: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className={cn("flex items-center justify-center gap-0.5 font-pixel text-base", color)}>{icon}{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function PotionButton({ id, run, onUse }: { id: PotionId; run: RunState; onUse: () => void }) {
  const p = POTIONS[id];
  const count = run.bag[id];
  const active = (id === "nightVision" && run.nightVision > 0) || (id === "rage" && (run.rage ?? 0) > 0) || (id === "regen" && (run.regen ?? 0) > 0);
  const blocked = run.status !== "playing" || count <= 0 || active;
  return (
    <Button variant="outline" className="h-auto justify-start gap-1.5 border-white/20 bg-[#150c2b]/85 px-2 py-1.5 text-left backdrop-blur-sm" onClick={onUse} disabled={blocked} title={p.blurb}
      aria-label={`${p.name}, ${count} left, key ${p.key}`}>
      <ItemArt id={id} px={2} />
      <span className="min-w-0 flex-1">
        <span className="hidden truncate text-[11px] sm:block">{p.name}</span>
        <span className="block text-[10px] text-muted-foreground">×{count}<span className="hidden sm:inline"> · key {p.key}</span></span>
      </span>
    </Button>
  );
}

function GameCanvas({ run, animal, reducedMotion, view: viewSize, zoom, onMove, presentation }: {
  run: RunState; animal: Animal; reducedMotion: boolean; view: View; zoom: number; onMove: (dx: number, dy: number) => void; presentation: RunPresentation;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const camera = useRef<View>({ x: 0, y: 0, w: viewSize.w, h: viewSize.h });
  const live = useRef({ run, animal, reducedMotion });
  useEffect(() => { live.current = { run, animal, reducedMotion }; });
  const tween = useRef({ from: { x: run.player.x, y: run.player.y }, to: { x: run.player.x, y: run.player.y }, at: 0, depth: run.depth });

  useEffect(() => {
    const t = tween.current;
    const p = run.player;
    if (p.x === t.to.x && p.y === t.to.y && run.depth === t.depth) return;
    const teleport = run.depth !== t.depth || Math.abs(p.x - t.to.x) + Math.abs(p.y - t.to.y) > 1;
    tween.current = { from: teleport ? { ...p } : { ...t.to }, to: { x: p.x, y: p.y }, at: performance.now(), depth: run.depth };
  }, [run]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { w: viewW, h: viewH } = viewSize;
    let raf = 0;
    let lastDraw = -Infinity;
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { presentation.sounds.clear(); return; }
      const { run, animal, reducedMotion } = live.current;
      const interval = reducedMotion ? 100 : 1000 / 30;
      if (time - lastDraw < interval) return;
      lastDraw = time;
      const t = tween.current;
      const k = reducedMotion ? 1 : Math.min(1, (time - t.at) / MOVE_MS);
      const walking = k < 1;
      const pos = { x: t.from.x + (t.to.x - t.from.x) * k, y: t.from.y + (t.to.y - t.from.y) * k };
      // Every step to a neighbouring tile changes x + y by one, so its parity swaps the leading foot step by step.
      const m = presentation.hero.pose(time, run.player.facing, walking, t.to.x + t.to.y, presentation.hurtAt, reducedMotion);
      presentation.sounds.flush(time, useGame.getState().muted, event => playSfx(event, false));
      const view = cameraFor(pos, run.floor.w, run.floor.h, viewW, viewH);
      camera.current = view;
      const canvasRect = canvas.getBoundingClientRect();
      const panels = presentation.fx.light.active ? [...(canvas.parentElement?.parentElement?.querySelectorAll<HTMLElement>("[data-run-hud], header") ?? [])] : [];
      const feedbackAvoid = panels.map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => ({
        x: view.x*TILE + (r.left-canvasRect.left)/zoom, y: view.y*TILE + (r.top-canvasRect.top)/zoom, w: r.width/zoom, h: r.height/zoom,
      }));
      drawRun(ctx, run, { time, reducedMotion, hero: { animal, ...m }, fx: presentation.fx, creatures: presentation.creatures, playerPos: pos, view, zoom, feedbackAvoid, decorBlocked: presentation.decor.blocked });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // The loop reads live state from refs; only a change of view size or zoom needs a restart.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSize.w, viewSize.h, zoom, presentation]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const view = camera.current;
    const tile = TILE * zoom;
    const tx = view.x + (e.clientX - rect.left) / tile;
    const ty = view.y + (e.clientY - rect.top) / tile;
    const dx = tx - (run.player.x + 0.5), dy = ty - (run.player.y + 0.5);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    if (Math.abs(dx) > Math.abs(dy)) onMove(Math.sign(dx), 0);
    else onMove(0, Math.sign(dy));
  };

  return (
    <canvas
      ref={ref}
      width={viewSize.w * TILE * zoom}
      height={viewSize.h * TILE * zoom}
      style={{ width: viewSize.w * TILE * zoom, height: viewSize.h * TILE * zoom }}
      onPointerDown={onPointer}
      className="pixelated absolute top-0 left-0 block touch-manipulation select-none"
      role="img"
      aria-label={`Depth ${run.depth}. Light ${Math.ceil(run.light)}. Tap a side of your character to step that way.`}
    />
  );
}
