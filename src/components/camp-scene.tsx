import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Flame, Gem, KeyRound, ScrollText, Sparkles, Swords, Ticket, Trophy, Vault } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DescendTab } from "@/components/descend-tab";
import { DPad } from "@/components/dpad";
import { GuidePanel, HallPanel } from "@/components/camp-panels";
import { Header } from "@/components/header";
import { playSfx } from "@/audio/sfx";
import {
  CAMP_SPAWN, STATIONS, facingOf, facingStation, pathTo, pathToStation, stationAt, stationNear, stepInCamp,
  type Facing, type Station, type StationId,
} from "@/game/camp";
import { advanceCrowd, createCrowd, npcPosition, type Crowd } from "@/game/camp-crowd";
import { paintedStationAt } from "@/game/camp-art";
import { roundShare } from "@/game/economy";
import type { Animal } from "@/game/animals";
import { DRAW_MINTS } from "@/game/config";
import { MOVE_MS, isActKey, moveOf } from "@/lib/controls";
import { percent, usd } from "@/lib/format";
import { CAMP_TILE, campCamera, drawCamp, paintedCampReady, type View } from "@/render/camp-renderer";
import { useGame } from "@/state/store";
import { useUi } from "@/state/ui";
import { HeroAvatar, type Portrait } from "./art";
import { resolveHero, type HeroVisual } from "./hero-info";

/** Three faces for the weekly draw on the camp HUD: a win mints a Delver of a rolled class and rarity. */
const DRAW_PORTRAITS: Portrait[] = [
  { kind: "prospector", rarity: "common" }, { kind: "seer", rarity: "rare" }, { kind: "duelist", rarity: "epic" },
];

const AltarTab = lazy(() => import("@/components/altar-tab").then(m => ({ default: m.AltarTab })));
const ArmoryTab = lazy(() => import("@/components/armory-tab").then(m => ({ default: m.ArmoryTab })));
const RaffleTab = lazy(() => import("@/components/raffle-tab").then(m => ({ default: m.RaffleTab })));
const LedgerTab = lazy(() => import("@/components/ledger-tab").then(m => ({ default: m.LedgerTab })));

const ICON: Record<StationId, typeof Flame> = {
  gate: Flame, altar: Sparkles, armory: Swords, board: ScrollText, ledger: Vault, guide: BookOpen, hall: Trophy,
};

/** The buildings shown in the icon rail. The gate has the big PLAY button instead. */
const RAIL: { id: StationId; label: string }[] = [
  { id: "altar", label: "Altar" }, { id: "armory", label: "Armory" }, { id: "board", label: "Board" },
  { id: "ledger", label: "Vault" }, { id: "hall", label: "Hall" }, { id: "guide", label: "Guide" },
];

const WALK_MS = 130;

type Walker = { x: number; y: number; facing: Facing };
type Route = { cells: { x: number; y: number }[]; open: Station | null };
type Screen = { w: number; h: number };

/** How many screen pixels one camp pixel gets. Whole numbers keep the pixel art sharp. */
function zoomFor(screen: Screen) {
  const byWidth = screen.w >= 1500 ? 3 : screen.w >= 640 ? 2 : 1;
  const byHeight = screen.h >= 1000 ? 3 : screen.h >= 560 ? 2 : 1;
  return Math.min(byWidth, byHeight);
}

/** The lobby: the whole screen is the camp. Buildings open the screens that used to be tabs. */
export function CampScene() {
  const game = useGame();
  const hero = resolveHero(game.hero, game.heroes);
  const [panel, setPanel] = useState<StationId | null>(null);
  const [walker, setWalker] = useState<Walker>({ ...CAMP_SPAWN, facing: "up" });
  const walkerRef = useRef(walker);
  const tween = useRef({ from: { x: CAMP_SPAWN.x, y: CAMP_SPAWN.y }, to: { x: CAMP_SPAWN.x, y: CAMP_SPAWN.y }, at: 0 });
  const route = useRef<Route>({ cells: [], open: null });
  const camera = useRef({ x: 0, y: 0 });
  const lastKey = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>({ w: 1280, h: 720 });
  const near = stationNear(walker, walker.facing);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setScreen({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const move = useCallback((dx: number, dy: number, quiet = false) => {
    const now = walkerRef.current;
    const facing = facingOf(dx, dy, now.facing);
    const next = stepInCamp(now, dx, dy);
    const moved = next.x !== now.x || next.y !== now.y;
    if (moved) {
      tween.current = { from: { x: now.x, y: now.y }, to: next, at: performance.now() };
      if (!quiet) playSfx("step", useGame.getState().muted);
    } else if (!quiet) {
      playSfx("bump", useGame.getState().muted);
    }
    walkerRef.current = { ...next, facing };
    setWalker(walkerRef.current);
  }, []);

  const stopRoute = useCallback(() => { route.current = { cells: [], open: null }; }, []);

  const interact = useCallback(() => {
    const w = walkerRef.current;
    const station = stationNear(w, w.facing);
    if (station) setPanel(station.id);
  }, []);

  const walkTo = useCallback((station: Station) => {
    const cells = pathToStation(walkerRef.current, station);
    if (cells === null) return;
    if (cells.length === 0) {
      walkerRef.current = { ...walkerRef.current, facing: facingStation(walkerRef.current, station) };
      setWalker(walkerRef.current);
      setPanel(station.id);
      return;
    }
    route.current = { cells, open: station };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog]")) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const onControl = e.target instanceof HTMLElement && !!e.target.closest("button, a, summary, [role=button]");
      const dir = moveOf(e);
      // A focused button keeps Enter and Space, so keyboard users can press PLAY and the building buttons.
      const act = (isActKey(e) || ((e.key === "Enter" || e.key === " ") && !onControl));
      if (dir || act) e.preventDefault();
      const now = performance.now();
      if (e.repeat && now - lastKey.current < MOVE_MS) return;
      lastKey.current = now;
      if (dir) { stopRoute(); move(dir[0], dir[1]); }
      else if (act) interact();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, interact, stopRoute]);

  // Tap-to-walk: follow the planned route one cell at a time, then open the building we walked to.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.querySelector("[role=dialog]")) return;
      const r = route.current;
      const next = r.cells[0];
      if (!next) return;
      const now = walkerRef.current;
      r.cells = r.cells.slice(1);
      move(next.x - now.x, next.y - now.y, true);
      if (r.cells.length === 0 && r.open) {
        const station = r.open;
        r.open = null;
        walkerRef.current = { ...walkerRef.current, facing: facingStation(walkerRef.current, station) };
        setWalker(walkerRef.current);
        setPanel(station.id);
      }
    }, WALK_MS);
    return () => window.clearInterval(id);
  }, [move]);

  // Other parts of the app, such as the run report, can ask the camp to open a building.
  useEffect(() => useUi.subscribe(state => {
    if (!state.requestedPanel) return;
    setPanel(state.requestedPanel);
    useUi.getState().clear();
  }), []);

  const openStation = (id: StationId) => {
    const station = STATIONS.find(s => s.id === id);
    if (station) walkTo(station);
  };

  const [hint, setHint] = useState(game.stats.runs === 0);
  const zoom = zoomFor(screen);
  const view: View = { w: Math.ceil(screen.w / zoom), h: Math.ceil(screen.h / zoom) };
  const current = STATIONS.find(s => s.id === panel) ?? null;
  const share = roundShare(game.roundGold, game.fieldGold);

  return (
    <div ref={root} className="fixed inset-0 overflow-hidden bg-[#150c2b] text-white">
      <CampCanvas walker={walker} tween={tween} camera={camera} hero={hero} animal={game.animal} reducedMotion={game.reducedMotion}
        near={near?.id ?? null} firstVisit={game.stats.runs === 0} view={view} zoom={zoom}
        onTapStation={walkTo}
        onTapGround={(x, y) => {
          const cells = pathTo(walkerRef.current, { x, y });
          if (cells && cells.length) route.current = { cells, open: null };
        }} />

      <Header overlay />

      {/* Resources */}
      <div className="pointer-events-none absolute top-14 left-3 z-20 flex flex-wrap gap-1.5 sm:top-[4.25rem]" aria-label="Resources">
        <Pill icon={<KeyRound className="size-3.5" />} value={game.keys} label="keys" color="text-gold" />
        <Pill icon={<Gem className="size-3.5" />} value={game.crystals} label="crystals" color="text-crystal" />
        <Pill icon={<Ticket className="size-3.5" />} value={game.tickets} label="tickets" color="text-sigil" />
      </div>

      {/* Buildings */}
      <nav aria-label="Camp buildings" className="absolute top-24 left-3 z-20 flex flex-col gap-1.5 sm:top-28">
        {RAIL.map(({ id, label }) => {
          const Icon = ICON[id];
          const station = STATIONS.find(s => s.id === id)!;
          return (
            <button key={id} type="button" aria-label={`Open ${station.name}`} onClick={() => openStation(id)}
              className="flex w-14 flex-col items-center gap-0.5 rounded-lg border border-white/20 bg-[#150c2b]/85 px-1 py-1.5 text-white backdrop-blur-sm transition-colors outline-none hover:border-lime hover:bg-[#241447] focus-visible:ring-2 focus-visible:ring-lime sm:w-16 sm:py-2">
              <Icon className="size-5 text-lime sm:size-6" />
              <span className="font-pixel text-[8px] leading-none uppercase sm:text-[10px]">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* The round and the weekly draw */}
      <div className="absolute top-14 right-3 z-20 flex w-44 flex-col items-stretch gap-2 sm:top-[4.25rem] sm:w-64">
        <button type="button" aria-label="Open Vault" onClick={() => openStation("ledger")}
          className="rounded-xl border border-white/20 bg-[#150c2b]/85 px-3 py-2 text-left backdrop-blur-sm outline-none hover:border-gold focus-visible:ring-2 focus-visible:ring-lime">
          <span className="block font-pixel text-[9px] text-gold sm:text-[10px]">ROUND {game.round}</span>
          <span className="block text-[10px] leading-tight sm:text-xs">
            Pool {usd(game.pool)} · {game.roundGold > 0 ? `you hold ${percent(share)}` : "bank gold to join"}
          </span>
        </button>
        <button type="button" aria-label="Open Draw Board" onClick={() => openStation("board")}
          className="rounded-xl border-2 border-sigil/70 bg-[#150c2b]/90 px-3 py-2 text-left shadow-[0_0_18px_rgba(255,95,220,0.25)] backdrop-blur-sm outline-none hover:border-sigil focus-visible:ring-2 focus-visible:ring-lime">
          <span className="block font-pixel text-[10px] leading-tight text-sigil sm:text-xs">WEEKLY DELVER DRAW</span>
          <span className="my-1.5 flex gap-1" aria-hidden>
            {DRAW_PORTRAITS.map(p => (
              <HeroAvatar key={p.kind} portrait={p} px={2} showEdition={false} className="min-w-0 flex-1" />
            ))}
          </span>
          <span className="block text-[10px] leading-tight sm:text-xs">
            <span className="font-pixel text-gold">{DRAW_MINTS} FREE MINTS</span>
            <span className="text-muted-foreground"> · {game.tickets > 0 ? `you hold ${game.tickets} ticket${game.tickets === 1 ? "" : "s"}` : "find tickets in the deep"}</span>
          </span>
        </button>
      </div>

      {/* Play */}
      <button type="button" aria-label="Open Dungeon Gate" onClick={() => openStation("gate")}
        className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-2xl border-2 border-[#150c2b] bg-lime px-5 py-3 font-pixel text-lg text-[#150c2b] shadow-[0_4px_0_#7aa800] transition-transform outline-none hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none focus-visible:ring-2 focus-visible:ring-white sm:px-8 sm:py-4 sm:text-2xl">
        <Flame className="size-6 sm:size-7" /> PLAY
      </button>

      <div className="absolute right-3 bottom-4 z-20 opacity-90 lg:hidden">
        <DPad compact onMove={(dx, dy) => { stopRoute(); move(dx, dy); }} />
      </div>

      {hint && current === null && (
        <div className="absolute bottom-24 left-1/2 z-20 w-[min(22rem,92%)] -translate-x-1/2 rounded-xl border border-lime/50 bg-[#150c2b]/95 p-3 text-xs shadow-lg backdrop-blur-sm sm:bottom-28">
          <div className="mb-1 font-pixel text-[11px] text-lime">FIRST DESCENT</div>
          <p className="text-white/85">
            You already hold <b>{game.keys} keys</b> and {usd(game.balance)} of simulated USDC. Press <b>PLAY</b>, pick your oil, collect gold in the cave, then walk back to the
            green rift to bring it home. Potions are keys 1-7.
          </p>
          <button type="button" onClick={() => setHint(false)} className="mt-2 rounded-md border border-white/25 px-2 py-1 font-pixel text-[10px] text-white hover:border-lime">GOT IT</button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-[#150c2b]/70 px-3 py-1 font-pixel text-[9px] text-white/70 sm:block">
        DEMO · SIMULATED USDC · OTHER DELVERS ARE SIMULATED
      </div>

      <Dialog open={current !== null} onOpenChange={open => { if (!open) setPanel(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle className="font-pixel text-lg text-lime">{current.name}</DialogTitle>
                <DialogDescription>{current.blurb}</DialogDescription>
              </DialogHeader>
              <Suspense fallback={<p className="py-8 text-center text-muted-foreground">Opening…</p>}>
                {current.id === "gate" && <DescendTab />}
                {current.id === "altar" && <AltarTab />}
                {current.id === "armory" && <ArmoryTab />}
                {current.id === "board" && <RaffleTab />}
                {current.id === "ledger" && <LedgerTab />}
                {current.id === "guide" && <GuidePanel onPlay={() => setPanel("gate")} />}
                {current.id === "hall" && <HallPanel />}
              </Suspense>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pill({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <span className={`flex items-center gap-1 rounded-full border border-white/20 bg-[#150c2b]/85 px-2.5 py-1 font-pixel text-[10px] backdrop-blur-sm sm:text-xs ${color}`} aria-label={`${value} ${label}`}>
      {icon}{value}
    </span>
  );
}

function CampCanvas({ walker, tween, camera, hero, animal, reducedMotion, near, firstVisit, view, zoom, onTapStation, onTapGround }: {
  walker: Walker;
  tween: React.RefObject<{ from: { x: number; y: number }; to: { x: number; y: number }; at: number }>;
  camera: React.RefObject<{ x: number; y: number }>;
  hero: HeroVisual;
  animal: Animal;
  reducedMotion: boolean;
  near: StationId | null;
  firstVisit: boolean;
  view: View;
  zoom: number;
  onTapStation: (station: Station) => void;
  onTapGround: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const crowd = useRef<Crowd | null>(null);
  const live = useRef({ walker, hero, animal, reducedMotion, near, firstVisit, view });
  useEffect(() => { live.current = { walker, hero, animal, reducedMotion, near, firstVisit, view }; });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    crowd.current ??= createCrowd(7, performance.now());
    let raf = 0;
    let lastDraw = -Infinity;
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const { walker, hero, animal, reducedMotion, near, firstVisit, view } = live.current;
      const interval = reducedMotion ? 100 : 1000 / 30;
      if (time - lastDraw < interval) return;
      lastDraw = time;
      const t = tween.current;
      const k = reducedMotion ? 1 : Math.min(1, (time - t.at) / MOVE_MS);
      const walking = k < 1;
      const pos = { x: t.from.x + (t.to.x - t.from.x) * k, y: t.from.y + (t.to.y - t.from.y) * k };
      // Every step to a neighbouring tile changes x + y by one, so its parity swaps the leading foot step by step.
      const pose = walking ? ((t.to.x + t.to.y) % 2 ? "b" : "c") : "a";
      const c = crowd.current!;
      advanceCrowd(c, time, [{ x: t.to.x, y: t.to.y }]);
      camera.current = campCamera(pos, view);
      drawCamp(ctx, {
        time, reducedMotion, camera: camera.current, view, zoom,
        hero: { animal, dir: walker.facing, frame: pose, offX: 0, offY: 0, flash: 0 },
        playerPos: pos, playerName: hero.name, playerColor: hero.color, near, firstVisit,
        crowd: c.npcs.map(npc => ({ npc, ...npcPosition(npc, time) })),
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tween, camera, zoom]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const wx = camera.current.x + (e.clientX - rect.left) * view.w / rect.width;
    const wy = camera.current.y + (e.clientY - rect.top) * view.h / rect.height;
    const tx = Math.floor(wx / CAMP_TILE), ty = Math.floor(wy / CAMP_TILE);
    const id = paintedCampReady() ? paintedStationAt(wx, wy) : null;
    // Painting uses its traced silhouette; the old code building extends one tile above its door.
    const hit = id ? STATIONS.find(s => s.id === id) : stationAt(tx, ty) ?? (!paintedCampReady() ? stationAt(tx, ty + 1) : null);
    if (hit) onTapStation(hit);
    else onTapGround(tx, ty);
  };

  return (
    <canvas
      ref={ref}
      data-scene="camp"
      data-player-x={walker.x}
      data-player-y={walker.y}
      data-facing={walker.facing}
      data-zoom={zoom}
      width={view.w * zoom}
      height={view.h * zoom}
      onPointerDown={onPointer}
      style={{ width: view.w * zoom, height: view.h * zoom }}
      className="pixelated absolute top-0 left-0 block touch-none select-none"
      role="img"
      aria-label="Cave camp. Walk with the arrow keys, tap to walk, or use the building buttons on the left."
    />
  );
}
