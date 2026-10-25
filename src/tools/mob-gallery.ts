// This entry is served by Vite dev only; it is deliberately absent from the site build.
import { ENEMIES, enemyDef, type EnemySpecies } from "@/game/enemies";
import type { Dimling, Floor, FloorTheme } from "@/game/dungeon";
import { CreatureAnimator, restPose } from "@/render/creature-anim";
import { drawCreature } from "@/render/renderer";
import { drawHero } from "@/render/mob-art";
import { mobSheet, type MobFrame } from "@/render/mob-sheets";
import { animalSheet } from "@/render/animal-sprites";
import { drawCatacombsCell } from "@/render/catacombs";
import { drawMyceliumCell } from "@/render/mycelium";
import { drawLateCell } from "@/render/late-tiles";
import { drawLanternLight } from "@/render/lantern-light";
import { loadSheet } from "@/render/sheets";

const THEMES: FloorTheme[] = ["catacombs", "mycelium", "cinderworks", "hollowglass"];
const FRAMES: MobFrame[] = ["a", "b", "w", "s"];
const PERIOD = 1800;
const select = document.querySelector<HTMLSelectElement>("#theme")!;
const lighting = document.querySelector<HTMLSelectElement>("#lighting")!;
const status = document.querySelector<HTMLElement>("#status")!;
const contexts = new Map<EnemySpecies, CanvasRenderingContext2D>();
const tourContexts: { ctx: CanvasRenderingContext2D; theme: FloorTheme; species: EnemySpecies }[] = [];
const histories = new Map<string, { animator: CreatureAnimator; cycle: number; stage: number }>();
const coverage = new Map<string, Set<string>>();
const floorCache = new Map<string, HTMLCanvasElement>();
let ready = false, frozen: number | null = null, clock = 0, touring = false;
let tourAt = 0, tourDone = false;

function canvas(width: number, height: number) {
  const c = document.createElement("canvas"); c.width = width * 2; c.height = height * 2;
  const ctx = c.getContext("2d")!; ctx.scale(2, 2); ctx.imageSmoothingEnabled = false; return ctx;
}

for (const e of ENEMIES) {
  const article = document.createElement("article"); article.id = e.id;
  article.innerHTML = `<h2>${e.name} <small>· ${e.id}</small></h2><div class="labels"><span>a · idle</span><span>b · walk</span><span>w · windup</span><span>s · strike</span><span>Live + hero for scale</span></div>`;
  const ctx = canvas(704, 160); contexts.set(e.id, ctx); article.append(ctx.canvas);
  document.querySelector("#gallery")!.append(article);
}
for (const theme of THEMES) {
  const section = document.createElement("section"); section.className = "tour-page"; section.id = `tour-${theme}`;
  section.innerHTML = `<h2>${theme} · left / right · real animation · plain above / lantern below</h2>`;
  const grid = document.createElement("div"); grid.className = "tour-grid";
  for (const e of ENEMIES) {
    const figure = document.createElement("figure"), caption = document.createElement("figcaption"); caption.textContent = e.name;
    const ctx = canvas(240, 108); tourContexts.push({ ctx, theme, species: e.id }); figure.append(caption, ctx.canvas); grid.append(figure);
  }
  section.append(grid); document.querySelector("#tour")!.append(section);
}

function floor(theme: FloorTheme, width: number, height: number) {
  const key = `${theme}:${width}:${height}`;
  let c = floorCache.get(key); if (c) return c;
  c = document.createElement("canvas"); c.width = width; c.height = height;
  const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = false;
  const w = Math.ceil(width / 32), h = Math.ceil(height / 32);
  const f: Floor = { depth: [1, 3, 5, 7][THEMES.indexOf(theme)], theme, w, h, tiles: Array(w * h).fill(1), seen: Array(w * h).fill(1),
    spawn: { x: 0, y: 0 }, stairs: { x: w - 1, y: h - 1 }, dimlings: [], items: [], props: [], roomCount: 1, revealed: true };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (theme === "catacombs") drawCatacombsCell(ctx, f, x, y, true, null, new Set());
    else if (theme === "mycelium") drawMyceliumCell(ctx, f, x, y, true, null, new Set(), 0, true);
    else drawLateCell(ctx, f, x, y, true, null, new Set());
  }
  floorCache.set(key, c); return c;
}

function animated(species: EnemySpecies, flip: boolean, time: number, key: string) {
  let track = histories.get(key);
  if (!track) { track = { animator: new CreatureAnimator(), cycle: -1, stage: -1 }; histories.set(key, track); }
  const cycle = Math.floor(time / PERIOD), t = time % PERIOD;
  const stage = t < 400 ? 0 : t < 880 ? 1 + Math.floor((t - 400) / 160) : t < 1380 ? 4 : t < 1600 ? 5 : 6;
  const d: Dimling = { id: 1, species, x: (stage === 2 ? (flip ? -0.5 : 0.5) : 0), y: 0, hp: 40, maxHp: 40, awake: true,
    phase: stage === 4 ? "windup" : stage >= 5 ? "recovery" : "idle", windupLeft: enemyDef(species).windup, aim: { x: flip ? -1 : 1, y: 0 } };
  if (track.cycle !== cycle) { track.animator = new CreatureAnimator(); track.stage = -1; track.cycle = cycle; }
  if (track.stage !== stage) {
    // Presentation fixtures only: no applyAction, RNG, saves, balance or real descent is involved.
    track.animator.update(key, [d], { x: flip ? -3 : 3, y: 0 }, time, stage);
    track.stage = stage;
  }
  const pose = track.animator.pose(d, time);
  const seen = coverage.get(key) ?? new Set<string>(); seen.add(pose.frame); coverage.set(key, seen);
  return { d, pose, label: stage === 0 ? "idle" : stage < 4 ? "walk" : stage === 4 ? "windup" : stage === 5 ? "strike" : "recover" };
}

function actor(ctx: CanvasRenderingContext2D, species: EnemySpecies, flip: boolean, time: number, x: number, base: number, key: string, frame?: MobFrame) {
  const live = animated(species, flip, time, key);
  ctx.save(); ctx.translate(x - 16, base - 29);
  drawCreature(ctx, frame ? { ...live.d, phase: "idle" } : live.d,
    frame ? { ...restPose(live.d), x: 0, frame, flip, striking: frame === "s" } : live.pose);
  ctx.restore(); return live.label;
}
function hero(ctx: CanvasRenderingContext2D, x: number, base: number, flip: boolean) {
  drawHero(ctx, { animal: "cat-scottish-fold", dir: flip ? "left" : "right", frame: "a", offX: 0, offY: 0, flash: 0 }, x - 16, base - 30, 32, "#0006");
}
function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number) {
  drawLanternLight(ctx, { x: x + w - 32, y: y + h - 24 }, 3, { x, y, w, h }, time, false);
}
function render(time: number) {
  const theme = select.value as FloorTheme;
  for (const [species, ctx] of contexts) {
    ctx.drawImage(floor(theme, 704, 160), 0, 0);
    for (const [row, flip] of [false, true].entries()) {
      const y = row * 80, base = y + 66;
      FRAMES.forEach((frame, col) => {
        actor(ctx, species, flip, time, col * 128 + 64, base, `${species}:static:${flip}`, frame);
        if (lighting.value === "lantern") lantern(ctx, col * 128, y, 128, 80, time);
      });
      const label = actor(ctx, species, flip, time, 568, base, `${species}:detail:${flip}`);
      hero(ctx, 672, base, !flip);
      if (lighting.value === "lantern") lantern(ctx, 512, y, 192, 80, time);
      ctx.fillStyle = "#e7e2d8"; ctx.font = "8px monospace"; ctx.fillText(`${flip ? "←" : "→"} ${label}`, 520, y + 10);
    }
  }
  if (touring) {
    const elapsed = performance.now() - tourAt, index = Math.min(3, Math.floor(elapsed / 4500));
    select.value = THEMES[index];
    document.querySelector(`#tour-${THEMES[index]}`)!.scrollIntoView();
    if (elapsed >= 18000) { tourDone = true; touring = false; }
    const visible = THEMES[index];
    for (const { ctx, theme: t, species } of tourContexts) {
      if (t !== visible) continue;
      ctx.drawImage(floor(t, 240, 108), 0, 0);
      for (const [i, flip] of [false, true].entries()) {
        const x = i * 120;
        // Two facings on each of the two rows: plain and production lantern.
        for (let row = 0; row < 2; row++) {
          ctx.save(); ctx.beginPath(); ctx.rect(x, row * 54, 120, 54); ctx.clip();
          actor(ctx, species, flip, time, x + 45, row * 54 + 47, `${species}:tour:${t}:${flip}`);
          hero(ctx, x + 99, row * 54 + 47, !flip);
          if (row) lantern(ctx, x, 54, 120, 54, time);
          ctx.restore();
        }
      }
    }
  }
}

function assetsReady() {
  return ENEMIES.every(e => !!mobSheet(e.id)) && !!animalSheet("cat-scottish-fold") && THEMES.every(t => !!loadSheet(`tiles/${t}.png`));
}
document.querySelector("#pause")!.addEventListener("click", e => {
  frozen = frozen === null ? clock : null; (e.target as HTMLElement).textContent = frozen === null ? "Pause" : "Play";
});
function startTour() {
  touring = true; tourDone = false; tourAt = performance.now(); frozen = null; document.body.classList.add("touring");
  document.querySelector("#tour-button")!.textContent = "Back to gallery";
}
function stopTour() {
  touring = false; document.body.classList.remove("touring"); window.scrollTo(0, 0);
  document.querySelector("#tour-button")!.textContent = "18-second video tour";
}
document.querySelector("#tour-button")!.addEventListener("click", () => document.body.classList.contains("touring") ? stopTour() : startTour());
select.addEventListener("change", stopTour);
lighting.addEventListener("change", stopTour);
Object.assign(window, { __mobGallery: {
  get ready() { return ready; }, get tourDone() { return tourDone; },
  setTheme(t: FloorTheme) { select.value = t; }, setLighting(mode: string) { lighting.value = mode; },
  snapshot(time = 1400) { frozen = time; render(time); }, play() { frozen = null; }, startTour,
  coverage: () => Object.fromEntries([...coverage].map(([k, v]) => [k, [...v].sort()])),
} });
function frame(time: number) {
  if (!ready) { ready = assetsReady(); if (ready) status.textContent = "9 mobs · 4 themes · 2 facings · ready"; }
  if (ready) { clock = frozen ?? time; render(clock); }
  requestAnimationFrame(frame);
}
if (import.meta.env.DEV) requestAnimationFrame(frame);
else throw new Error("The mob gallery is development-only.");
