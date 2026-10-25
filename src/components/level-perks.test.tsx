import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PerkIcon,PerkBar} from './level-perks';
import {PERK_IDS} from '@/game/level-perks';
import {NO_PERKS} from '@/game/catalog';
import {emptyBag,startRun} from '@/game/run';
describe('perk art and bar',()=>{
  it('renders every distinct fallback without requesting missing art',()=>{
    const icons=PERK_IDS.map(id=>renderToStaticMarkup(<PerkIcon id={id} artAvailable={false}/>));
    expect(new Set(icons).size).toBe(15);for(const icon of icons){expect(icon).toContain('<svg');expect(icon).not.toContain('<img');}
  });
  it('renders the owner atlas path and its complete 5x3 ordering',()=>{
    for(let i=0;i<PERK_IDS.length;i++){const html=renderToStaticMarkup(<PerkIcon id={PERK_IDS[i]} artAvailable/>);expect(html).toContain('perks/perks.png');expect(html).toContain(`left:${-(i%5)*32}`);expect(html).toContain(`top:${-Math.floor(i/5)*32}`);}
  });
  it('renders four slots and remaining charges rather than resetting usage on upgrades',()=>{
    const run=startRun({seed:7,flasks:1,perks:NO_PERKS,weaponDamage:8,bag:emptyBag()});run.levelPerks=[{id:'interrupt',rank:3},{id:'last-flicker',rank:3},{id:'stone-ward',rank:2}];run.interruptsUsed=4;run.flickersUsed=1;run.stoneWardUsed=2;
    const html=renderToStaticMarkup(<PerkBar run={run}/>);expect(html).toContain('Empty perk slot 4');expect(html).toContain('Interrupt III');expect(html).toContain('Last Flicker III');expect(html).toContain('Stone Ward II');
  });
});
