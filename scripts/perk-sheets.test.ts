import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {expect,it} from 'vitest';
import {writePerks} from './sprite-sheets.mjs';
it('cuts all 15 ordered squares with transparent padding, palette colors and no magenta fringe',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'emberdeep-perks-'));
  try{
    const palette=JSON.parse(readFileSync('art/palette/mobs.json','utf8')).colors;
    const cells=Array.from({length:15},(_,i)=>`<rect x="${i%5*64+16}" y="${Math.floor(i/5)*64+12}" width="32" height="40" fill="${palette[i+1]}"/>`).join('');
    const source=Buffer.from(`<svg width="320" height="192"><rect width="320" height="192" fill="#ff00ff"/>${cells}</svg>`),input=join(dir,'input.webp'),output=join(dir,'output.png');
    await sharp(source).webp({lossless:true}).toFile(input);await writePerks(input,output);
    const{data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect([info.width,info.height]).toEqual([160,96]);
    for(let i=0;i<15;i++){const at=((Math.floor(i/5)*32+16)*160+(i%5*32+16))*4;const hex='#'+[...data.subarray(at,at+3)].map(v=>v.toString(16).padStart(2,'0')).join('');expect(hex).toBe(palette[i+1]);expect(data[at+3]).toBe(255);expect(data[(Math.floor(i/5)*32*160+i%5*32)*4+3]).toBe(0);}
    for(let p=0;p<data.length;p+=4)if(data[p+3]){const hex='#'+[...data.subarray(p,p+3)].map(v=>v.toString(16).padStart(2,'0')).join('');expect(palette).toContain(hex);expect(hex).not.toBe('#ff00ff');}
  }finally{const target=resolve(dir),root=resolve(tmpdir());if(!target.startsWith(root+ '\\')&&!target.startsWith(root+'/'))throw new Error('Unsafe temp cleanup');rmSync(target,{recursive:true,force:true});}
},15000);
