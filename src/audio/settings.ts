import { useSyncExternalStore } from 'react';
export const AUDIO_SETTINGS_KEY='emberdeep-audio-v1';
export type AudioLevels={music:number;effects:number};
const defaults:AudioLevels={music:.55,effects:.8};
const clamp=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
export function parseAudioSettings(raw:string|null):AudioLevels {
  try{const s=JSON.parse(raw??'null');return{music:clamp(s?.music,.55),effects:clamp(s?.effects,.8)};}catch{return{...defaults};}
}
function read(){try{return parseAudioSettings(localStorage.getItem(AUDIO_SETTINGS_KEY));}catch{return{...defaults};}}
let levels:AudioLevels=read();
const listeners=new Set<()=>void>();
export const audioSettings={
  getSnapshot:()=>levels,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  set:(patch:Partial<AudioLevels>)=>{
    levels={music:clamp(patch.music,levels.music),effects:clamp(patch.effects,levels.effects)};
    try{localStorage.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(levels));}catch{/* Storage can be disabled. */}
    listeners.forEach(fn=>fn());
  },
};
if(typeof window!=='undefined')window.addEventListener('storage',e=>{
  if(e.key===AUDIO_SETTINGS_KEY||e.key===null){levels=parseAudioSettings(e.newValue);listeners.forEach(fn=>fn());}
});
export const useAudioLevels=()=>useSyncExternalStore(audioSettings.subscribe,audioSettings.getSnapshot);
