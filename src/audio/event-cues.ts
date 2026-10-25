import { attackTiles } from '@/game/enemy-ai';
import { DEFAULT_SPECIES } from '@/game/enemies';
import type { RunEvent,RunState } from '@/game/run';
import type { Dimling } from '@/game/dungeon';
import type { SoundName } from './sfx';
/** Exhaustive fallback map. Rich cues use the immutable before/after states below. */
export const EVENT_CUES:Record<RunEvent,SoundName>={
  step:'step',bump:'bump',hit:'hit',kill:'kill',warn:'swing',drain:'hurt',bossDrain:'cerberus:s',miss:'dodge',
  smash:'urn',break:'crate',gold:'gold',crystal:'crystal',oil:'oil',potion:'potion',levelup:'levelup',
  chest:'chest',vault:'chest',hoard:'chest',descend:'stairs',extract:'rift',dark:'dark',boss:'cerberus:w',
  sigil:'mint',ticket:'gold',gear:'levelup',sealed:'ward',nightVision:'potion',lanternFull:'oil',
};
export type TurnCue={name:SoundName;contact:boolean};
const species=(d:Dimling)=>d.boss?'cerberus':d.species??DEFAULT_SPECIES;
const contact=new Set<RunEvent>(['hit','kill','boss','smash','break']);
export function turnCues(prev:RunState,next:RunState):TurnCue[]{
  const cues:TurnCue[]=[],add=(name:SoundName,atContact=false)=>cues.push({name,contact:atContact});
  const same=prev.seed===next.seed&&prev.runId===next.runId&&prev.depth===next.depth;
  const events=new Set(next.events),rich=new Set<RunEvent>(['warn','drain','bossDrain','miss','smash','break']);
  for(const event of events)if(!rich.has(event))add(EVENT_CUES[event],contact.has(event));
  if(events.has('hit')||events.has('kill')||events.has('boss')||events.has('smash')||events.has('break'))add('swing');
  if(!same)return cues;
  const current=new Map(next.floor.dimlings.map(d=>[d.id,d]));
  const warns=next.floor.dimlings.filter(d=>d.phase==='windup'&&prev.floor.dimlings.find(p=>p.id===d.id)?.phase!=='windup');
  for(const d of warns.slice(0,2))add(`${species(d)}:w` as SoundName);
  for(const d of prev.floor.dimlings){
    const n=current.get(d.id);
    if(!n&&(events.has('kill')||events.has('boss')))add(`${species(d)}:d` as SoundName,true);
    if(d.boss&&!d.awake&&n?.awake&&!warns.some(w=>w.id===d.id))add('cerberus:w');
    if(d.phase!=='windup'||n?.phase!=='recovery')continue;
    add(`${species(d)}:s` as SoundName);
    const hit=attackTiles(next.floor,d).some(p=>p.x===next.player.x&&p.y===next.player.y);
    if(hit&&prev.ward>0)add('ward');else add(hit?'hurt':'dodge');
  }
  if(events.has('potion')&&next.ward>prev.ward)add('ward');
  if(events.has('smash')||events.has('break')){
    const prop=prev.floor.props?.find(p=>{const n=next.floor.props?.find(n=>n.id===p.id);return !n||n.hp<p.hp;});
    add(prop?.kind==='crate'||prop?.kind==='barrel'?'crate':'urn',true);
  }
  if(events.has('drain')&&!cues.some(c=>c.name==='hurt'))add('hurt');
  if(events.has('bossDrain')&&!cues.some(c=>c.name==='cerberus:s'))add('cerberus:s');
  if(events.has('miss')&&!cues.some(c=>c.name==='dodge'||c.name==='ward'))add('dodge');
  return cues;
}
