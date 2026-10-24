import { idx, tileHash, type Floor } from "@/game/dungeon";
import { catacombsDecorAt, catacombsRow } from "./catacombs";
import { loadSheet } from "./sheets";

const SIZE=32;
export const usesLateTiles=(depth:number)=>depth>=5&&depth<=7;
const gateCell=(f:Floor)=>({x:f.stairs.x,y:f.stairs.y-2});

/** Hollowglass face cutouts reveal rock, never a pink or empty cell behind their protruding crystals. */
export function drawLateCell(ctx:CanvasRenderingContext2D,f:Floor,x:number,y:number,lit:boolean,
  reserved:ReadonlySet<number>|null,occupied:ReadonlySet<number>){
  const glass=f.depth===7,sheet=loadSheet(`tiles/${glass?"hollowglass":"cinderworks"}.png`);
  const row=catacombsRow(f,x,y),variant=tileHash(x+f.depth*137,y)%4,px=x*SIZE,py=y*SIZE;
  if(sheet){
    if(glass&&row===2)ctx.drawImage(sheet.image,variant*SIZE,SIZE,SIZE,SIZE,px,py,SIZE,SIZE);
    ctx.drawImage(sheet.image,variant*SIZE,row*SIZE,SIZE,SIZE,px,py,SIZE,SIZE);
    const decor=catacombsDecorAt(f,x,y,reserved,occupied);
    if(decor!==null)ctx.drawImage(sheet.image,decor*SIZE,3*SIZE,SIZE,SIZE,px,py,SIZE,SIZE);
    const gate=gateCell(f);
    if(row===2&&tileHash(x,y+179)%5===0&&!(glass&&x===gate.x&&y===gate.y)){
      const attachment=!glass&&tileHash(x+53,y)%5===0?1:0;
      ctx.drawImage(sheet.image,attachment*SIZE,4*SIZE,SIZE,SIZE,px,py,SIZE,SIZE);
    }
  }else{
    ctx.fillStyle=row===0?(glass?"#15203c":"#323033"):row===2?"#171c2e":"#0b1425";
    ctx.fillRect(px,py,SIZE,SIZE);
  }
  if(!lit){ctx.fillStyle="rgba(0,0,0,0.48)";ctx.fillRect(px,py,SIZE,SIZE);}
}

/** A brighter, two-tile-high gate is an attachment over solid wall, never another walkable exit. Draw last. */
export function drawCrystalGate(ctx:CanvasRenderingContext2D,f:Floor,visible:ReadonlySet<number>){
  if(f.depth!==7)return;
  const p=gateCell(f),sheet=loadSheet("tiles/hollowglass.png");
  if(!sheet||p.y<1)return;
  for(let y=p.y-1;y<=p.y;y++)for(let x=p.x-1;x<=p.x+1;x++)
    if(f.tiles[idx(f,x,y)]!==0||!f.seen[idx(f,x,y)])return;
  ctx.save();ctx.globalAlpha=visible.has(idx(f,p.x,p.y))?1:0.52;
  ctx.drawImage(sheet.image,SIZE,4*SIZE,SIZE,SIZE,p.x*SIZE-SIZE/2,(p.y-1)*SIZE,2*SIZE,2*SIZE);
  ctx.restore();
}
