import { SlidersHorizontal } from 'lucide-react';
import { audioSettings,useAudioLevels } from '@/audio/settings';
export function AudioControls(){
  const levels=useAudioLevels();
  return <details className="relative">
    <summary aria-label="Audio settings" title="Audio settings" className="flex size-8 cursor-pointer list-none items-center justify-center rounded hover:bg-white/10"><SlidersHorizontal size={16} aria-hidden /></summary>
    <div className="absolute right-0 top-10 z-50 w-64 space-y-3 rounded-md border border-white/20 bg-[#150c2b] p-4 shadow-xl">
      {(['music','effects'] as const).map(key=><label key={key} className="block text-xs capitalize">{key} <span className="float-right">{Math.round(levels[key]*100)}%</span>
        <input className="mt-2 w-full accent-lime" aria-label={`${key==='music'?'Music':'Effects'} volume`} type="range" min="0" max="100" step="1" value={Math.round(levels[key]*100)} onChange={e=>audioSettings.set({[key]:Number(e.target.value)/100})} />
      </label>)}
      <p className="text-[10px] text-muted-foreground">Effects include cave ambience.</p>
    </div>
  </details>;
}
