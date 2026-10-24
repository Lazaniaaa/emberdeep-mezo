// Local-only map tracing tool. Usage: node scripts/floor-overlay.mjs before|after [baseUrl]
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const phase = process.argv[2] ?? "after", base = process.argv[3] ?? "http://127.0.0.1:5741/";
if (!["before", "after"].includes(phase)) throw new Error("Expected before or after");
const out = process.argv[4] ?? "docs/screenshots"; mkdirSync(out, { recursive: true });
if(phase==="before"&&existsSync(`${out}/floor-01-before.png`))throw new Error("Baseline already captured; choose a separate output directory for a new baseline");
const browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL || "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base);
  const floors = await page.evaluate(async phase => {
    const { generateFloor } = await import("/src/game/dungeon.ts");
    const { createRng } = await import("/src/game/rng.ts");
    const { drawRun } = await import("/src/render/renderer.ts");
    const { startRun, emptyBag } = await import("/src/game/run.ts");
    const { NO_PERKS } = await import("/src/game/catalog.ts");
    const { FxQueue } = await import("/src/render/fx.ts");
    const { HeroAttacks } = await import("/src/render/hero-anim.ts");
    const results = [];
    for (let depth = 1; depth <= 7; depth++) {
      const floor = generateFloor(createRng(20261023 + depth), depth, { findPct: 0 });
      const art = document.createElement("canvas"); art.width = floor.w * 32; art.height = floor.h * 32;
      const a = art.getContext("2d"); a.imageSmoothingEnabled = false;
      const state = startRun({seed:20261023+depth,flasks:5,perks:{...NO_PERKS,radius:100},weaponDamage:16,bag:emptyBag()});
      state.floor={...floor,seen:floor.tiles.map(()=>1),items:[],props:[],dimlings:[]};state.depth=depth;state.player={...floor.spawn,facing:"right"};
      const render=()=>drawRun(a,state,{time:1000,reducedMotion:true,hero:{animal:"cat-scottish-fold",...new HeroAttacks().pose(1000,"right",false,0,-Infinity,true)},fx:new FxQueue(),playerPos:state.player,view:{x:0,y:0,w:floor.w,h:floor.h},zoom:1});
      render();await new Promise(r=>setTimeout(r,250));render();
      const c = document.createElement("canvas"); c.width=art.width+32;c.height=art.height+80;
      const ctx=c.getContext("2d");ctx.fillStyle="#121423";ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle="#fff";ctx.font="14px monospace";ctx.fillText(`Depth ${depth} · ${phase} · seed ${20261023+depth} · green=floor P=prop I=item M=mob B=boss S=stairs R=rift`,8,20);
      ctx.translate(32,48);ctx.drawImage(art,0,0);
      ctx.font="10px monospace";ctx.textAlign="center";
      for(let y=0;y<floor.h;y++)for(let x=0;x<floor.w;x++){
        if(floor.tiles[y*floor.w+x]){ctx.fillStyle="#66ffb52b";ctx.fillRect(x*32,y*32,32,32);}
        ctx.strokeStyle="#ffffff44";ctx.lineWidth=0.5;ctx.strokeRect(x*32,y*32,32,32);
        ctx.fillStyle="#ddd";if(y===0)ctx.fillText(String(x),x*32+16,-5);if(x===0)ctx.fillText(String(y),-14,y*32+20);
      }
      const mark=(p,text,color,size=1)=>{ctx.fillStyle=color;ctx.fillRect(p.x*32+4,p.y*32+4,size*32-8,size*32-8);ctx.fillStyle="#000";ctx.font="bold 14px monospace";ctx.fillText(text,(p.x+size/2)*32,(p.y+size/2)*32+5);};
      for(const p of floor.props)mark(p,"P","#ffc06b");
      for(const p of floor.items)mark(p,"I","#65cbff");
      for(const p of floor.dimlings)mark(p,p.boss?"B":"M","#ff6b8a",p.size??1);
      mark(floor.spawn,"R","#d0ff33");mark(floor.stairs,"S","#ffffff");
      results.push({depth,floor,png:c.toDataURL("image/png").split(",")[1]});
    }
    return results;
  }, phase);
  for (const {depth,png} of floors) writeFileSync(`${out}/floor-${String(depth).padStart(2,"0")}-${phase}.png`,Buffer.from(png,"base64"));
  writeFileSync(`${out}/floors-${phase}.json`,JSON.stringify(floors.map(({png,...rest})=>rest))+"\n");
  console.log(`Saved ${phase} overlays for all 7 floors`);
} finally { await browser.close(); }
