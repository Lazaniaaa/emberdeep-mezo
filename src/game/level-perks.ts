import {createRng,int} from './rng';

export const PERK_SLOTS=4;
export const PERK_IDS=['oil-thief','steady-wick','wide-glass','ember-heart','last-flicker','riposte','heavy-blow','momentum','thick-coat','stone-ward','interrupt','deep-breath','rift-sense','second-wind','hungry-flame'] as const;
export type LevelPerkId=typeof PERK_IDS[number];
export type PerkRank=1|2|3;
export type RunPerk={id:LevelPerkId;rank:PerkRank};
export type PerkChoice={level:number;options:LevelPerkId[]};
export type PerkState={
  levelPerks?:RunPerk[];perkChoice?:PerkChoice|null;perkQueue?:number[];
  flickersUsed?:number;interruptsUsed?:number;stoneWardUsed?:number;
  riposteReady?:boolean;momentumSteps?:number;breathWaits?:number;
};
export const rankOf=(s:PerkState,id:LevelPerkId)=>s.levelPerks?.find(p=>p.id===id)?.rank??0;
export const isLevelPerk=(id:unknown):id is LevelPerkId=>typeof id==='string'&&(PERK_IDS as readonly string[]).includes(id);
export const rankLabel=(rank:number)=>['','I','II','III'][rank]??'';
export const flickerLimit=(rank:number)=>rank===3?2:rank>0?1:0;
export const interruptLimit=(rank:number)=>rank>0?rank+2:0;
export const stoneWardLimit=(rank:number)=>Math.min(2,rank);
export const hungryCost=(rank:number)=>rank>0?1+[.2,.3,.4][rank-1]:1;
export const perkEffects={
  'oil-thief':[1,2,3], 'steady-wick':[.08,.16,.24], 'wide-glass':[1,2,3], 'ember-heart':[15,30,45],
  'heavy-blow':[3,6,9], 'thick-coat':[.1,.2,.3], 'second-wind':[10,20,30], 'hungry-flame':[6,12,18],
} as const;
type Def={name:string;risk?:boolean;effects:readonly[string,string,string]};
export const LEVEL_PERKS:Record<LevelPerkId,Def>={
  'oil-thief':{name:'Oil Thief',effects:['Kills restore 1 light.','Kills restore 2 light.','Kills restore 3 light.']},
  'steady-wick':{name:'Steady Wick',effects:['Steps cost 8% less light (total cap 40%).','Steps cost 16% less light (total cap 40%).','Steps cost 24% less light (total cap 40%).']},
  'wide-glass':{name:'Wide Glass',effects:['+1 lantern radius.','+2 lantern radius.','+3 lantern radius.']},
  'ember-heart':{name:'Ember Heart',effects:['+15 lantern capacity; restore 15 light now.','+30 lantern capacity; restore 15 light now.','+45 lantern capacity; restore 15 light now.']},
  'last-flicker':{name:'Last Flicker',effects:['Survive darkness once per descent with 10 light.','Survive darkness once per descent with 20 light.','Survive darkness twice per descent with 20 light.']},
  riposte:{name:'Riposte',effects:['After a dodge, your next strike deals ×1.5 damage.','After a dodge, your next strike deals ×2 damage.','After a dodge, your next strike deals ×2.5 damage.']},
  'heavy-blow':{name:'Heavy Blow',effects:['+3 strike damage.','+6 strike damage.','+9 strike damage.']},
  momentum:{name:'Momentum',effects:['After a kill, your next step costs no light.','After a kill, your next 2 steps cost no light.','After a kill, your next 3 steps cost no light.']},
  'thick-coat':{name:'Thick Coat',effects:['Creature drain reduced by 10% (total cap 80%).','Creature drain reduced by 20% (total cap 80%).','Creature drain reduced by 30% (total cap 80%).']},
  'stone-ward':{name:'Stone Ward',effects:['Block 1 ordinary strike per floor; not Cerberus.','Block 2 ordinary strikes per floor; not Cerberus.','Block 2 strikes per floor, including Cerberus.']},
  interrupt:{name:'Interrupt',effects:['Cancel a winding-up ordinary creature: 3 times per descent.','Cancel a winding-up ordinary creature: 4 times per descent.','Cancel a winding-up ordinary creature: 5 times per descent.']},
  'deep-breath':{name:'Deep Breath',effects:['After stepping, your next wait costs no light.','After stepping, your next 2 waits cost no light.','After stepping, your next 3 waits cost no light.']},
  'rift-sense':{name:'Rift Sense',effects:['On entering a floor, reveal its rift.','On entering a floor, reveal its rift and stairs.','On entering a floor, reveal rift, stairs, chests and vaults.']},
  'second-wind':{name:'Second Wind',effects:['Descending restores 10 light.','Descending restores 20 light.','Descending restores 30 light.']},
  'hungry-flame':{name:'Hungry Flame',risk:true,effects:['+6 damage, but steps cost 20% more light.','+12 damage, but steps cost 30% more light.','+18 damage, but steps cost 40% more light.']},
};

/** A private stream: neither rolling nor accepting an offer consumes the descent RNG. */
export function perkOffers(seed:number,level:number,taken:readonly RunPerk[]):LevelPerkId[]{
  let hash=2166136261;for(const c of `${seed}:${level}:perk`)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  const rng=createRng(hash>>>0),ranks=new Map(taken.map(p=>[p.id,p.rank]));
  const pool=PERK_IDS.filter(id=>(ranks.get(id)??0)<3&&(taken.length<PERK_SLOTS||ranks.has(id)));
  const result:LevelPerkId[]=[];while(result.length<3&&pool.length)result.push(pool.splice(int(rng,0,pool.length-1),1)[0]);return result;
}
export function openPerkChoice(s:PerkState&{seed:number}){
  if(s.perkChoice)return;
  while(s.perkQueue?.length){const level=s.perkQueue.shift()!,options=perkOffers(s.seed,level,s.levelPerks??[]);if(options.length){s.perkChoice={level,options};return;}}
  s.perkChoice=null;
}
export function canChoosePerk(s:PerkState,id:unknown):id is LevelPerkId{
  if(!isLevelPerk(id)||!s.perkChoice?.options.includes(id)||rankOf(s,id)>=3)return false;
  return rankOf(s,id)>0||(s.levelPerks?.length??0)<PERK_SLOTS;
}
/** Upgrades add capacity, never reset charges already spent in this descent/floor. */
export function perkUsesLeft(s:PerkState,id:LevelPerkId){
  const rank=rankOf(s,id);return id==='last-flicker'?Math.max(0,flickerLimit(rank)-(s.flickersUsed??0)):
    id==='interrupt'?Math.max(0,interruptLimit(rank)-(s.interruptsUsed??0)):
    id==='stone-ward'?Math.max(0,stoneWardLimit(rank)-(s.stoneWardUsed??0)):null;
}

/** Stable, intentional bot policy shared by simulations/replay fixtures. Prioritize survival, then damage. */
export const BOT_PERK_PRIORITY:readonly LevelPerkId[]=['steady-wick','oil-thief','ember-heart','last-flicker','momentum','second-wind','stone-ward','heavy-blow','thick-coat','interrupt','riposte','deep-breath','wide-glass','rift-sense','hungry-flame'];
export function botPerkChoice(s:PerkState):LevelPerkId|null{
  return BOT_PERK_PRIORITY.find(id=>s.perkChoice?.options.includes(id)&&canChoosePerk(s,id))??null;
}

/** Old saves omit the entire feature; malformed new state is rejected rather than granting resources. */
export function validPerkState(raw:unknown):boolean{
  if(!raw||typeof raw!=='object')return false;const s=raw as Record<string,unknown>;
  const list=s.levelPerks??[];if(!Array.isArray(list)||list.length>PERK_SLOTS)return false;
  const ids=new Set<string>();for(const p of list){if(!p||!isLevelPerk(p.id)||![1,2,3].includes(p.rank)||ids.has(p.id))return false;ids.add(p.id);}
  for(const[key,max]of Object.entries({flickersUsed:2,interruptsUsed:5,stoneWardUsed:2,momentumSteps:3,breathWaits:3}))if(s[key]!==undefined&&(!Number.isSafeInteger(s[key])||(s[key] as number)<0||(s[key] as number)>max))return false;
  if(s.riposteReady!==undefined&&typeof s.riposteReady!=='boolean')return false;
  if(s.perkQueue!==undefined&&(!Array.isArray(s.perkQueue)||s.perkQueue.length>14||s.perkQueue.some((n,i,a)=>!Number.isSafeInteger(n)||n<2||n>15||(i>0&&n<=a[i-1]))))return false;
  const c=s.perkChoice;if(c!==undefined&&c!==null){
    const p=c as PerkChoice;if(!Number.isSafeInteger(p.level)||p.level<2||p.level>15||!Array.isArray(p.options)||!p.options.length||p.options.length>3||p.options.some(id=>!isLevelPerk(id))||new Set(p.options).size!==p.options.length)return false;
    if(p.options.some(id=>!canChoosePerk(s as PerkState,id)))return false;
  }
  return true;
}
