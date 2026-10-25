// Enlarged review evidence from the untouched baseline and the current generated PNGs.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildMobSheet } from './sprite-sheets.mjs';

const before = 'artifacts/mobs/before', out = 'docs/screenshots';
mkdirSync(out, { recursive: true });
const title = (text, w=1536) => Buffer.from(`<svg width="${w}" height="32"><rect width="100%" height="100%" fill="#111927"/><text x="12" y="23" fill="#e7e2d8" font-size="19" font-family="Arial">${text}</text></svg>`);
const stats = [];
for (const name of readdirSync(before).filter(n=>n.endsWith('.png')).sort()) {
  const id = name.slice(0,-4), files = [`${before}/${name}`, `public/mobs/${name}`];
  const layers=[];
  for (const [i,path] of files.entries()) {
    const sheet=await sharp(path).resize(1536,224,{kernel:'nearest'}).png().toBuffer();
    layers.push({input:title(`${id} / ${i?'AFTER':'BEFORE'} / a | b | w | s / zoom 4`),left:0,top:i*256});
    layers.push({input:sheet,left:0,top:i*256+32});
  }
  await sharp({create:{width:1536,height:512,channels:4,background:'#29313e'}}).composite(layers).png().toFile(`${out}/mobs-compare-${id}.png`);
  const colors = [], hashes=[], matte=[], bytes=[];
  for(const path of files){
    const {data}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true}),set=new Set();let pink=0;
    for(let p=0;p<data.length;p+=4)if(data[p+3]){
      const [r,g,b]=data.subarray(p,p+3);set.add(`${r},${g},${b}`);
      if(Math.min(r,b)-g>25&&g<0.5*Math.min(r,b)&&Math.abs(r-b)<0.35*Math.max(r,b))pink++;
    }
    colors.push(set.size);hashes.push(createHash('sha256').update(readFileSync(path)).digest('hex'));matte.push(pink);bytes.push(readFileSync(path).length);
  }
  const {grid}=await buildMobSheet(id);
  stats.push({id,beforeColors:colors[0],afterColors:colors[1],beforePinkPixels:matte[0],pinkPixels:matte[1],beforeBytes:bytes[0],afterBytes:bytes[1],
    beforeSha256:hashes[0],afterSha256:hashes[1],sourceGridPixels:grid.size,gridConfidence:grid.confidence});
}
const p=JSON.parse(readFileSync('art/palette/mobs.json','utf8'));
const swatches=p.colors.map((color,i)=>({input:Buffer.from(`<svg width="80" height="80"><rect width="80" height="54" fill="${color}"/><text x="3" y="73" fill="#e7e2d8" font-size="12" font-family="monospace">${color}</text></svg>`),left:i%16*80,top:Math.floor(i/16)*80}));
await sharp({create:{width:1280,height:160,channels:4,background:'#111927'}}).composite(swatches).png().toFile(`${out}/mobs-palette.png`);
mkdirSync('artifacts/mobs',{recursive:true});
writeFileSync('artifacts/mobs/look-metrics.json',JSON.stringify({paletteSha256:createHash('sha256').update(readFileSync('art/palette/mobs.json')).digest('hex'),mobs:stats},null,2)+'\n');
console.log(JSON.stringify(stats.map(({id,beforeColors,afterColors,pinkPixels})=>({id,beforeColors,afterColors,pinkPixels})),null,2));
