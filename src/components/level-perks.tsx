import {useEffect,useState} from 'react';
import {Droplets,Flame,ScanEye,HeartPulse,Sparkles,Swords,Hammer,Footprints,Shirt,Shield,Hand,Wind,Compass,ArrowDown,Skull} from 'lucide-react';
import {LEVEL_PERKS,PERK_IDS,PERK_SLOTS,perkUsesLeft,rankLabel,rankOf,type LevelPerkId} from '@/game/level-perks';
import type {RunState} from '@/game/run';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
const SYMBOLS=[Droplets,Flame,ScanEye,HeartPulse,Sparkles,Swords,Hammer,Footprints,Shirt,Shield,Hand,Wind,Compass,ArrowDown,Skull];
const COLORS=['#ffb547','#ffd985','#72d6dc','#ff764f','#ffd985','#bfd7e6','#a4b6c6','#ffc36a','#b39479','#72d6dc','#ff8d58','#a4cdb8','#b397dd','#72d6dc','#ff764f'];
const perkAtlasRect=(id:LevelPerkId)=>{const i=PERK_IDS.indexOf(id);return{x:i%5*32,y:Math.floor(i/5)*32};};
/** The build flag avoids a missing-asset 404. Restart dev/build after importing the owner's atlas. */
export function PerkIcon({id,artAvailable=import.meta.env.VITE_PERK_ART==='true'}:{id:LevelPerkId;artAvailable?:boolean}){
  const[failed,setFailed]=useState(false),i=PERK_IDS.indexOf(id),Icon=SYMBOLS[i],rect=perkAtlasRect(id);
  return <span aria-hidden className="relative block size-8 shrink-0 overflow-hidden" data-perk-art={artAvailable&&!failed?'atlas':'fallback'}>
    {artAvailable&&!failed?<img alt="" src={`${import.meta.env.BASE_URL}perks/perks.png`} width={160} height={96} draggable={false} onError={()=>setFailed(true)} className="pixelated absolute max-w-none" style={{left:-rect.x,top:-rect.y}}/>:
      <Icon size={28} strokeWidth={2.5} color={COLORS[i]} className="m-0.5"/>}
  </span>;
}
export function PerkChoiceDialog({run,onChoose}:{run:RunState;onChoose:(id:LevelPerkId)=>void}){
  const choice=run.perkChoice;
  useEffect(()=>{
    if(!choice)return;const key=(e:KeyboardEvent)=>{if(e.repeat)return;const i=['1','2','3'].indexOf(e.key);if(i>=0&&choice.options[i]){e.preventDefault();e.stopImmediatePropagation();onChoose(choice.options[i]);}};
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[choice,onChoose]);
  return <Dialog open={!!choice&&run.status==='playing'} onOpenChange={()=>{}}>
    <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl" aria-describedby="perk-choice-help">
      <DialogHeader><DialogTitle className="font-pixel text-lime">Level {choice?.level} · choose a perk</DialogTitle>
        <DialogDescription id="perk-choice-help">Choose one. No turn or light cost; creatures wait. {run.levelPerks?.length??0}/{PERK_SLOTS} slots used.</DialogDescription></DialogHeader>
      <div className="grid gap-2 sm:grid-cols-3">
        {choice?.options.map((id,i)=>{const def=LEVEL_PERKS[id],old=rankOf(run,id),rank=old+1;return <button key={id} data-perk-option={id} onClick={()=>onChoose(id)} className="flex min-h-32 flex-col items-start gap-2 rounded-lg border border-white/25 bg-black/20 p-3 text-left transition-colors hover:border-lime focus-visible:outline-2 focus-visible:outline-lime">
          <div className="flex w-full items-center gap-3"><PerkIcon id={id}/><strong className="text-sm">{def.name} <span className="text-gold">{rankLabel(rank)}</span></strong><kbd className="ml-auto rounded border border-white/30 px-1.5 text-xs">{i+1}</kbd></div>
          <span className="text-xs leading-relaxed">{def.effects[rank-1]}</span>
          <span className="mt-auto text-[11px] text-muted-foreground">{old?'Upgrade':`New slot ${(run.levelPerks?.length??0)+1}/${PERK_SLOTS}`}{def.risk&&<strong className="ml-2 text-orange-300">Risky</strong>}</span>
        </button>;})}
      </div>
    </DialogContent>
  </Dialog>;
}
export function PerkBar({run}:{run:RunState}){
  const[inspect,setInspect]=useState<LevelPerkId|null>(null),perks=run.levelPerks??[],shown=perks.find(p=>p.id===inspect);
  return <section aria-label="Descent perks" data-run-hud className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-white/20 bg-[#150c2b]/95 p-1.5">
    {shown&&<div role="tooltip" id="perk-inspect" className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 rounded-lg border border-white/20 bg-[#150c2b] p-3 text-xs shadow-lg">
      <strong className="block text-gold">{LEVEL_PERKS[shown.id].name} {rankLabel(shown.rank)}</strong>{LEVEL_PERKS[shown.id].effects[shown.rank-1]}
    </div>}
    <div className="flex gap-1.5">{Array.from({length:PERK_SLOTS},(_,i)=>{const p=perks[i];return p?<button key={i} aria-label={`${LEVEL_PERKS[p.id].name} ${rankLabel(p.rank)}`} aria-describedby={inspect===p.id?'perk-inspect':undefined} onMouseEnter={()=>setInspect(p.id)} onMouseLeave={()=>setInspect(null)} onFocus={()=>setInspect(p.id)} onBlur={()=>setInspect(null)} onClick={()=>setInspect(p.id)} className="relative flex h-12 w-12 items-center justify-center rounded border border-white/25 hover:border-lime focus-visible:outline-2 focus-visible:outline-lime">
      <PerkIcon id={p.id}/><b className="absolute right-0.5 bottom-0 text-[10px] text-gold">{rankLabel(p.rank)}</b>
      {perkUsesLeft(run,p.id)!==null&&<span className="absolute top-0 left-0 rounded bg-black/90 px-1 text-[10px] text-white">{perkUsesLeft(run,p.id)}</span>}
    </button>:<div key={i} aria-label={`Empty perk slot ${i+1}`} className="h-12 w-12 rounded border border-white/10 bg-black/20"/>;})}</div>
  </section>;
}
