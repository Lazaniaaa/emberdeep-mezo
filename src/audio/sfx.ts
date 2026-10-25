import type { RunEvent } from '@/game/run';
import { audioContext } from './context';
import { engineFor } from './engine';
import { worldSounds, type WorldCue } from './world';
import { mobSounds, type MobCue } from './mobs';
import { audioSettings } from './settings';
export type SoundName = WorldCue | MobCue | RunEvent | 'burn';
/** Legacy UI cues retain their character using only the approved primitives. */
export const ALIASES = {
  bump:'step',vault:'chest',hoard:'chest',sigil:'mint',ticket:'gold',gear:'levelup',sealed:'ward',
  nightVision:'potion',burn:'stairs',lanternFull:'oil',descend:'stairs',extract:'rift',
  drain:'hurt',bossDrain:'cerberus:s',warn:'swing',boss:'cerberus:w',miss:'dodge',smash:'urn',break:'crate',
} as const;
export function playSfx(name:SoundName, muted=false) {
  if(muted||(typeof document!=='undefined'&&document.hidden))return;
  try {
    const ctx=audioContext(),e=engineFor(ctx),settings=audioSettings.getSnapshot();
    if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
    e.setLevels(settings.music,settings.effects);
    const key=name in ALIASES?ALIASES[name as keyof typeof ALIASES]:name;
    if(name!=='bump')mobSounds(e,worldSounds(e))[key as WorldCue|MobCue](ctx.currentTime);
    else {
      const output=ctx.createGain();output.gain.value=.35;output.connect(e.FXB);
      const scaled=Object.create(e) as typeof e;
      scaled.tone=(t,o)=>e.tone(t,{...o,out:o.out??output});
      scaled.noise=(t,o)=>e.noise(t,{...o,out:o.out??output});
      worldSounds(scaled).step(ctx.currentTime);
      setTimeout(()=>output.disconnect(),200);
    }
  }catch{/* Audio is optional; a later gesture can retry an unavailable context. */}
}
