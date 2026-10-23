// Isolated UI/render/audio QA. Never connects a wallet, records a descent or touches a live prize pool.
// SMOKE_CHANNEL=msedge node scripts/feel-smoke.mjs [baseUrl] [outDir]
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5741/", out = process.argv[3] ?? "artifacts/feel";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL || "msedge" });
const result = {}, errors = [];
try {
  for (const [name, width, height] of [["desktop", 1280, 900], ["phone", 375, 812]]) {
    const context = await browser.newContext({ viewport: { width, height } }), page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(base); await page.waitForFunction(() => window.__emberdeep);
    const fixture = async (boss = false, light = 400, reducedMotion = false) => {
      await page.evaluate(async ({ boss, light, reducedMotion }) => {
        const { startRun, emptyBag } = await import("/src/game/run.ts");
        const { NO_PERKS } = await import("/src/game/catalog.ts");
        const { useGame, useRun } = window.__emberdeep;
        const runId = `feel-${boss}-${light}-${reducedMotion}`;
        const setup = { seed: 1023, flasks: 5, weaponDamage: 16, bag: emptyBag(), perks: { ...NO_PERKS }, runId };
        const s = startRun(setup);
        // Open procedural-looking room, real applyAction, no props/drops obscuring a controlled contact.
        s.floor.depth = 8; s.floor.tiles.fill(1); s.floor.seen.fill(1); s.floor.props = []; s.floor.items = [];
        s.floor.spawn = { x: 7, y: 10 }; s.floor.stairs = { x: 20, y: 10 };
        s.player = { x: 10, y: 10, facing: "right" }; s.light = light;
        s.floor.dimlings = [{ id: 999, x: 11, y: 10, hp: 2000, maxHp: 2000, awake: true,
          ...(boss ? { boss: true, size: 2 } : { species: "wickgnaw", phase: "idle", windupLeft: 0, cooldown: 0, aim: null }) }];
        useGame.setState({ muted: false, reducedMotion, lastReport: null, runSpent: 60, runId, carried: emptyBag() });
        useRun.setState({ run: s, log: { setup, moves: [] }, lastDescent: null });
      }, { boss, light, reducedMotion });
      await page.getByLabel("Rift walk estimate").waitFor();
      await page.waitForTimeout(100);
    };
    await fixture();
    await page.evaluate(async () => {
      const live = async fragment => {
        const url = performance.getEntriesByType("resource").map(e => e.name).filter(n => n.includes(fragment)).at(-1);
        if (!url) throw new Error(`Missing live module ${fragment}`);
        return import(url);
      };
      window.__feel = { actions: [], frames: [], bosses: [], sounds: [], texts: [] };
      const q = window.__feel;
      const { RunPresentation } = await live("/src/render/run-presentation.ts");
      const original = RunPresentation.prototype.observe;
      RunPresentation.prototype.observe = function(next, at) {
        const changed = this.previous !== next;
        const value = original.call(this, next, at);
        if (changed) q.actions.push({ at, events: [...next.events], steps: next.steps, light: next.light });
        q.presentation = this; return value;
      };
      const { HeroAttacks } = await live("/src/render/hero-anim.ts"), pose = HeroAttacks.prototype.pose;
      HeroAttacks.prototype.pose = function(...args) { const p = pose.apply(this, args); q.frames.push({ at: args[0], ...p }); return p; };
      const { CreatureAnimator } = await live("/src/render/creature-anim.ts"), creaturePose = CreatureAnimator.prototype.pose;
      CreatureAnimator.prototype.pose = function(d, time) {
        const p = creaturePose.call(this, d, time);
        if (d.boss) q.bosses.push({ at: time, ...p }); return p;
      };
      const { TurnSounds } = await live("/src/audio/turn-sounds.ts"), flush = TurnSounds.prototype.flush;
      TurnSounds.prototype.flush = function(now, muted, play) {
        return flush.call(this, now, muted, event => { q.sounds.push({ at: now, event }); play(event); });
      };
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        if (typeof text === "string" && text.includes(" light · ")) q.texts.push(text);
        return fillText.call(this, text, ...args);
      };
    });
    const reset = () => page.evaluate(() => {
      for (const k of ["actions", "frames", "bosses", "sounds", "texts"]) window.__feel[k] = [];
    });
    const hold = async () => {
      // Repeated keydown while held sets KeyboardEvent.repeat, exercising the real input throttle.
      for (let i = 0; i < 8; i++) { await page.keyboard.down("ArrowRight"); await page.waitForTimeout(110); }
      await page.keyboard.up("ArrowRight");
    };
    await reset();
    const canvas = await page.locator("canvas").elementHandle();
    await hold();
    await page.screenshot({ path: `${out}/${name}-attack.png` });
    await page.waitForTimeout(200);
    const attacks = await page.evaluate(() => {
      const q = window.__feel, hits = q.actions.filter(a => a.events.includes("hit"));
      const sounds = q.sounds.filter(s => s.event === "hit");
      return { hits: hits.length, sounds: sounds.length, soundDelays: hits.map((a, i) => sounds[i]?.at - a.at),
        frames: [...new Set(q.frames.map(f => f.frame))],
        hp: window.__emberdeep.useRun.getState().run.floor.dimlings[0].hp,
        steps: window.__emberdeep.useRun.getState().run.steps,
        hitLabel: q.texts.some(t => / light · hit$/.test(t)) };
    });
    assert.equal(attacks.hits, 8); assert.equal(attacks.hp, 2000 - 8 * 16); assert.equal(attacks.steps, 0);
    assert(attacks.frames.includes("s") && attacks.frames.includes("w"), "held attack must visibly land");
    assert.equal(attacks.sounds, attacks.hits);
    assert(attacks.soundDelays.every(n => n >= 89 && n < 220), "hit cues must wait for visible contact");
    assert(attacks.hitLabel);
    assert(await canvas.evaluate(el => el.isConnected), "shake must preserve the same Canvas");

    await fixture(true); await reset();
    await hold(); await page.screenshot({ path: `${out}/${name}-boss.png` });
    const boss = await page.evaluate(() => {
      const q = window.__feel, contacts = q.actions.filter(a => a.events.includes("drain"));
      return { drains: contacts.length, steps: window.__emberdeep.useRun.getState().run.steps,
        strikes: contacts.map(a => q.bosses.some(p => p.frame === "s" && p.striking && p.at >= a.at + 60 && p.at < a.at + 110)),
        label: q.texts.some(t => t === "−40 light · boss"), weight: document.querySelector("[data-shake]").dataset.shake };
    });
    assert.equal(boss.drains, 8); assert.equal(boss.steps, 0); assert(boss.strikes.every(Boolean));
    assert(boss.label); assert.equal(boss.weight, "boss");

    await fixture(false); await reset();
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(80);
    assert.match(await page.getByLabel("Rift walk estimate").innerText(), /≈2\+ light · 2 steps/);
    assert.match(await page.getByLabel("Rift walk estimate").innerText(), /not a guarantee/);
    const step = await page.evaluate(() => ({ label: window.__feel.texts.includes("−1 light · step"), weight: document.querySelector("[data-shake]").dataset.shake }));
    assert(step.label); assert.equal(step.weight, "none");

    await fixture(); await reset();
    await page.keyboard.press("ArrowRight");
    await page.evaluate(() => window.__emberdeep.useGame.setState({ muted: true }));
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => window.__feel.sounds.filter(s => s.event === "hit").length), 0, "mute cancels queued contact sound");
    await fixture(); await reset();
    await page.keyboard.press("ArrowRight");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(180);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => window.__feel.sounds.filter(s => s.event === "hit").length), 0, "no contact cue backlog after hidden tab");
    await fixture(); await reset();
    await page.keyboard.press("ArrowRight");
    await page.evaluate(() => window.__emberdeep.useRun.getState().clear());
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => window.__feel.sounds.filter(s => s.event === "hit").length), 0, "unmount cancels queued contact sound");

    await fixture(true, 20); await reset();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Return to camp", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Last cause").innerText(), "Last loss: −20 light · boss");
    assert.equal(await page.locator("[data-shake]").getAttribute("data-shake"), "death");
    await page.screenshot({ path: `${out}/${name}-death.png` });
    await page.getByRole("button", { name: "Return to camp", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByLabel("Last cause").innerText(), "Last loss: −20 light · boss");
    await page.reload(); await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByLabel("Last cause").innerText(), "Last loss: −20 light · boss");
    await page.getByRole("button", { name: "Back to camp", exact: true }).click();

    // Reload discarded prototype instrumentation; use the same isolated fixture to inspect reduced-motion DOM.
    await fixture(true, 400, true);
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
    const reduced = await page.evaluate(() => ({ weight: document.querySelector("[data-shake]").dataset.shake,
      animations: document.querySelector("[data-shake]").getAnimations().length,
      hurt: !!document.querySelector('[class*="hurt_450ms"]') }));
    assert.deepEqual(reduced, { weight: "none", animations: 0, hurt: false });
    await page.screenshot({ path: `${out}/${name}-reduced.png` });
    result[name] = { attacks, boss, step, death: "boss; persisted through report and reload", reduced,
      soundCleanup: "mute, hide/resume and unmount: no delayed hit" };
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...result, errors }, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
