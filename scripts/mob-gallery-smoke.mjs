// Development-only visual evidence. Uses the installed browser, never downloads one.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const phase = process.argv[2] ?? "after", base = process.argv[3] ?? "http://127.0.0.1:5741/";
assert(["before", "after"].includes(phase), "Phase must be before or after");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local dev server only");
const root = "artifacts/mobs", out = "docs/screenshots", themes = ["catacombs", "mycelium", "cinderworks", "hollowglass"];
mkdirSync(root, { recursive: true }); mkdirSync(out, { recursive: true });
mkdirSync(`${root}/${phase}`, { recursive: true });
const strips = readdirSync("public/mobs").filter(n => n.endsWith(".png"));
assert.equal(strips.length,9);
const baselineRef = process.argv[4];
if (phase === "before" && baselineRef) {
  for (const name of strips) {
    const original = execFileSync("git", ["-c", "core.bare=false", "-c", `core.worktree=${process.cwd().replaceAll('\\','/')}`,
      "show", `${baselineRef}:public/mobs/${name}`]);
    const path = `${root}/before/${name}`;
    assert(!existsSync(path) || readFileSync(path).equals(original), `Frozen baseline differs from ${baselineRef}: ${name}`);
    if (!existsSync(path)) writeFileSync(path, original);
  }
}
const frozenBaseline = phase === "before" && strips.every(name => existsSync(`${root}/before/${name}`));
if (!frozenBaseline) {
  // A partial baseline may only be completed from the same, still-unmodified sprites.
  if (phase === "before") for (const name of strips) {
    const baseline = `${root}/before/${name}`;
    assert(!existsSync(baseline) || readFileSync(baseline).equals(readFileSync(`public/mobs/${name}`)), "Partial before baseline differs from the current art.");
  }
  for (const name of strips) copyFileSync(`public/mobs/${name}`, `${root}/${phase}/${name}`);
}
const errors = [], browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL || "msedge" });
try {
  const routeBaseline = async context => {
    // Re-record the old art against improved review tooling without replacing any runtime PNG on disk.
    if (phase === "before") await context.route("**/mobs/*.png", route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      assert(strips.includes(name)); return route.fulfill({ path: `${root}/before/${name}`, contentType: "image/png" });
    });
  };
  const context = await browser.newContext({ viewport: { width: 1600, height: 1024 }, deviceScaleFactor: 1 });
  await routeBaseline(context);
  const page = await context.newPage();
  const watch = p => { p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type() === "error") errors.push(m.text()); }); };
  watch(page);
  await page.goto(new URL("mob-gallery.html", base).href); await page.waitForFunction(() => window.__mobGallery?.ready);
  for (const theme of themes) {
    await page.evaluate(t => { window.__mobGallery.setTheme(t); window.__mobGallery.setLighting("plain"); window.__mobGallery.snapshot(1400); }, theme);
    await page.screenshot({ path: `${out}/mobs-${phase}-${theme}.png`, fullPage: true });
    copyFileSync(`${out}/mobs-${phase}-${theme}.png`, `${out}/mobs-${theme}.png`);
    await page.evaluate(() => { window.__mobGallery.setLighting("lantern"); window.__mobGallery.snapshot(1400); });
    await page.screenshot({ path: `${out}/mobs-${phase}-${theme}-lantern.png`, fullPage: true });
  }
  await context.close();
  const videoContext = await browser.newContext({ viewport: { width: 1600, height: 1024 }, deviceScaleFactor: 1,
    recordVideo: { dir: `${root}/recordings`, size: { width: 1600, height: 1024 } } });
  await routeBaseline(videoContext);
  const tour = await videoContext.newPage(); watch(tour);
  await tour.goto(new URL("mob-gallery.html", base).href); await tour.waitForFunction(() => window.__mobGallery?.ready);
  await tour.evaluate(() => window.__mobGallery.startTour());
  await tour.waitForFunction(() => window.__mobGallery.tourDone, undefined, { timeout: 25000 });
  const coverage = await tour.evaluate(() => window.__mobGallery.coverage());
  for (const theme of themes) for (const species of readdirSync("public/mobs").filter(n => n.endsWith(".png")).map(n => n.slice(0, -4))) {
    for (const flip of [false, true]) assert.deepEqual(coverage[`${species}:tour:${theme}:${flip}`], ["a", "b", "s", "w"], `${species}/${theme}/${flip}: all real frames shown`);
  }
  const video = tour.video(); await videoContext.close(); await video.saveAs(`${root}/gallery-${phase}.webm`);
  assert.deepEqual(errors, [], "No console or page errors");
  writeFileSync(`${root}/gallery-${phase}.json`, JSON.stringify({ phase, themes, species: 9, zoom: 2, durationTarget: 18,
    facings: ["right", "left"], modes: ["plain", "lantern"], coverage, errors, video: `${root}/gallery-${phase}.webm` }, null, 2) + "\n");
  console.log(`${phase}: 4 floors, 9 mobs, every a/b/w/s pose in both facings; no errors; ${root}/gallery-${phase}.webm`);
} finally { await browser.close(); }
