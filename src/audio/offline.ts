/** Dev-only entry point, imported by audio-render.mjs; never imported by the shipped game. */
import { SynthEngine,R } from './engine';
import { worldSounds } from './world';
import { mobSounds } from './mobs';
import { musicTracks,type TrackId } from './tracks';
import { ambienceSounds,type AmbienceId } from './ambience';
export type RenderRequest={kind:'sfx'|'music'|'ambience';id:string;seconds:number;light?:number;seed?:number};
export const audioManifest={sounds:[...Object.keys(mobSounds({} as SynthEngine,worldSounds({} as SynthEngine)))],tracks:['camp','descent','boss'],ambiences:['catacombs','mycelium','cinderworks','hollowglass']};
export async function renderAudio(request:RenderRequest){
  const original=Math.random;let seed=request.seed??541923;
  // A fixed QA seed makes random reverb, noise and cue variations reproducible; live audio stays random.
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const ctx=new OfflineAudioContext(2,Math.ceil(44100*request.seconds),44100);
  try{
    const e=new SynthEngine(ctx,Infinity),world=worldSounds(e),S=mobSounds(e,world);
    const ratio=request.light??1;e.filter.frequency.value=400*Math.pow(22,ratio);
    if(request.kind==='sfx')S[request.id as keyof typeof S](.1);
    else if(request.kind==='music'){
      const T=musicTracks(e)[request.id as TrackId];let step=0;
      for(let t=.05;t<request.seconds;t+=T.sd){T.play(step,t);step=(step+1)%T.len;}
      if(ratio<=.25){const {heart}=ambienceSounds(e,e.AMBB);
        for(let t=.05;t<request.seconds;t+=.95-(25-ratio*100)*.014)heart(t);
        for(let now=0;now<request.seconds;now+=.05)if(Math.random()<.25)e.noise(now+.1,{ft:'highpass',f:R(4000,.3),d:.01,g:R(.05,.6)});
      }
    }else{
      const g=ctx.createGain();g.connect(e.AMBB);e.registerOutput(g,'ambience');
      const E=ambienceSounds(e,g,0).AMB[request.id as AmbienceId];
      const nodes=E.start(g);for(let t=.3;t<request.seconds;t+=E.gap())E.ev(t);
      for(const n of nodes)n.stop(request.seconds);
    }
  }finally{Math.random=original;}
  const buffer=await ctx.startRendering();
  let peak=0,sum=0,nonFinite=0;const pcm=new Float32Array(buffer.length*2);
  for(let c=0;c<2;c++){const data=buffer.getChannelData(c);for(let i=0;i<data.length;i++){
    const v=data[i];if(!Number.isFinite(v))nonFinite++;peak=Math.max(peak,Math.abs(v));sum+=v*v;pcm[i*2+c]=v;
  }}
  // IEEE float WAV preserves the measured signal without normalizing or hiding clipping.
  const bytes=new Uint8Array(44+pcm.byteLength),v=new DataView(bytes.buffer);
  const str=(at:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,2,true);
  v.setUint32(24,44100,true);v.setUint32(28,44100*8,true);v.setUint16(32,8,true);v.setUint16(34,32,true);str(36,'data');v.setUint32(40,pcm.byteLength,true);
  for(let i=0;i<pcm.length;i++)v.setFloat32(44+i*4,pcm[i],true);
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return{base64:btoa(binary),peak,peakDb:20*Math.log10(peak),rms:Math.sqrt(sum/pcm.length),nonFinite,samples:buffer.length,sampleRate:44100};
}
