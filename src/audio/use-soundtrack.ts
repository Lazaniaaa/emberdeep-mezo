import { useEffect } from 'react';
import { useRun } from '@/state/run-store';
import { sceneFor,soundtrack } from './music';
import { audioSettings } from './settings';
let interacted=false;
// Read-only lifecycle diagnostics for the local browser smoke; removed by the production build.
if(import.meta.env.DEV)(window as unknown as Record<string,unknown>).__emberdeepAudio={soundtrack};
/** Mounted once. Store updates describe the scene without changing the deterministic run. */
export function useSoundtrack(muted:boolean){
  useEffect(()=>{
    const sync=()=>soundtrack.setScene(sceneFor(useRun.getState().run));sync();
    const unsubscribe=useRun.subscribe(sync);
    const levels=audioSettings.subscribe(()=>soundtrack.setLevels(muted));
    const start=()=>{if(!muted&&!document.hidden)void soundtrack.start();};
    const gesture=()=>{interacted=true;start();};
    const visibility=()=>{if(document.hidden)soundtrack.stop();else if(interacted)start();};
    document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);document.addEventListener('visibilitychange',visibility);
    if(muted)soundtrack.stop();else if(interacted)start();
    return()=>{unsubscribe();levels();document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',visibility);soundtrack.stop();};
  },[muted]);
}
