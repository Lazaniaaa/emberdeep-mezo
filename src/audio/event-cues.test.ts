import {describe,expect,it} from 'vitest';
import {NO_PERKS} from '@/game/catalog';
import {applyAction,emptyBag,startRun} from '@/game/run';
import type {Dimling,Prop} from '@/game/dungeon';
import {turnCues,EVENT_CUES} from './event-cues';
import {TurnSounds} from './turn-sounds';
import {sceneFor} from './music';
function room(){const s=startRun({seed:7,flasks:5,perks:NO_PERKS,weaponDamage:8,bag:emptyBag()});
  s.floor.tiles.fill(1);s.floor.seen.fill(1);s.floor.items=[];s.floor.props=[];s.floor.dimlings=[];s.player={x:6,y:6,facing:'right'};return s;}
const mob=(over:Partial<Dimling>={}):Dimling=>({id:1,x:7,y:6,hp:100,maxHp:100,awake:true,species:'chaincoil',phase:'windup',windupLeft:1,aim:{x:-1,y:0},...over});
const names=(...args:Parameters<typeof turnCues>)=>turnCues(...args).map(c=>c.name);
describe('presentation-only event routing',()=>{
  it('covers all 28 run event keys including cap and boss drain',()=>{expect(Object.keys(EVENT_CUES)).toHaveLength(28);expect(EVENT_CUES.lanternFull).toBe('oil');});
  it('plays the actual attacker and hurt, without duplicating a boss hit',()=>{
    for(const boss of [false,true]){const s=room();s.floor.dimlings=[mob({boss,size:boss?2:1})];
      const n=applyAction(s,{type:'wait'}),c=names(s,n);expect(c).toContain(boss?'cerberus:s':'chaincoil:s');expect(c.filter(k=>k==='hurt')).toHaveLength(1);}
  });
  it('distinguishes a Ward block from a dodge on the same strike',()=>{
    const s=room();s.floor.dimlings=[mob()];s.ward=4;let n=applyAction(s,{type:'wait'});
    expect(names(s,n)).toContain('ward');expect(names(s,n)).not.toContain('hurt');expect(names(s,n)).not.toContain('dodge');
    s.ward=0;n=applyAction(s,{type:'move',dx:0,dy:1});expect(names(s,n)).toContain('chaincoil:s');expect(names(s,n)).toContain('dodge');
  });
  it('caps simultaneous windups at two and does not repeat an existing windup',()=>{
    const s=room(),n=structuredClone(s);s.floor.dimlings=[mob({phase:'idle'}),mob({id:2,phase:'idle'}),mob({id:3,phase:'idle'})];
    n.floor.dimlings=s.floor.dimlings.map(d=>({...d,phase:'windup'}));n.events=['warn'];
    expect(names(s,n).filter(k=>k.endsWith(':w'))).toHaveLength(2);expect(names(n,{...n})).not.toContain('chaincoil:w');
  });
  it('plays kill plus the defeated species, waiting for the original contact clock',()=>{
    const s=room();s.floor.dimlings=[mob({hp:1,phase:'idle'})];const n=applyAction(s,{type:'move',dx:1,dy:0});
    const q=new TurnSounds(),heard:string[]=[];q.addTurn(s,n,1000,1090);q.flush(1000,false,k=>heard.push(k));
    expect(heard).toContain('swing');expect(heard).not.toContain('kill');expect(heard).not.toContain('chaincoil:d');
    q.flush(1090,false,k=>heard.push(k));expect(heard).toContain('kill');expect(heard).toContain('chaincoil:d');
  });
  it('uses the removed/struck prop rather than the generic break name',()=>{
    for(const kind of ['urn','sack','crate','barrel'] as const){const s=room();s.floor.props=[{id:4,x:7,y:6,kind,hp:1,maxHp:1} as Prop];
      const n=applyAction(s,{type:'move',dx:1,dy:0});expect(names(s,n)).toContain(kind==='urn'||kind==='sack'?'urn':'crate');}
  });
  it('chooses camp/descent/boss, theme and max-light fullness without changing the run',()=>{
    const s=room();expect(sceneFor(null)).toEqual({track:'camp',ambience:null,light:1});
    s.light=20;s.maxLight=100;expect(sceneFor(s)).toEqual({track:'descent',ambience:'catacombs',light:.2});
    s.depth=7;s.floor.theme='hollowglass';s.floor.dimlings=[mob({boss:true,awake:false})];expect(sceneFor(s).track).toBe('descent');
    s.floor.dimlings[0].awake=true;expect(sceneFor(s).track).toBe('boss');s.status='dead';expect(sceneFor(s).track).toBeNull();
  });
});
