import { audioContext } from './context';
import { engineFor,R,type SynthEngine } from './engine';
import { musicTracks,type TrackId } from './tracks';
import { ambienceSounds,type AmbienceId } from './ambience';
import { audioSettings } from './settings';
import { maxLightOf,type RunState } from '@/game/run';

export type AudioScene={track:TrackId|null;ambience:AmbienceId|null;light:number};
export function sceneFor(run:RunState|null):AudioScene {
  if(!run)return{track:'camp',ambience:null,light:1};
  if(run.status!=='playing')return{track:null,ambience:null,light:1};
  return{track:run.depth===7&&run.floor.dimlings.some(d=>d.boss&&d.awake)?'boss':'descent',
    ambience:run.floor.theme,light:Math.max(0,Math.min(1,run.light/Math.max(1,maxLightOf(run))))};
}

/** One clock, no catch-up, and a sequential fade-out/fade-in so two scores never play together. */
export class MusicPlayer {
  private getContext:()=>AudioContext;
  private ctx:AudioContext|null=null;
  private engine:SynthEngine|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private generation=0;
  private starting=false;
  private scene:AudioScene=sceneFor(null);
  private track:TrackId|null=null;
  private switchingAt:number|null=null;
  private beat=0;
  private nextAt=0;
  private ambient:AmbienceId|null=null;
  private ambientBus:GainNode|null=null;
  private ambientNodes:AudioScheduledSourceNode[]=[];
  private ambientNext=0;
  private ambientDefs:ReturnType<typeof ambienceSounds>|null=null;
  private nextHB=0;
  private crackleAt=0;
  constructor(getContext:()=>AudioContext=audioContext){this.getContext=getContext;}
  get playing(){return this.timer!==null;}
  get activeVoices(){return this.engine?.activeVoices??0;}
  get activeEffectVoices(){return this.engine?.activeEffectVoices??0;}
  get currentTrack(){return this.track;}
  get currentScene(){return this.scene;}
  setScene(scene:AudioScene){this.scene=scene;if(this.playing)this.sync();}
  setLevels(muted=false){const s=audioSettings.getSnapshot();this.engine?.setLevels(s.music,s.effects,muted);}
  async start(){
    if(this.playing||this.starting)return;
    const generation=++this.generation;this.starting=true;
    try{
      const ctx=this.getContext();this.ctx=ctx;await ctx.resume();
      if(generation!==this.generation||ctx.state!=='running')return;
      this.engine=engineFor(ctx);this.setLevels();this.nextHB=ctx.currentTime+.05;this.crackleAt=ctx.currentTime;
      this.beginTrack(this.scene.track);this.setAmbience(this.scene.ambience);this.engine.setLight(this.scene.light);
      this.tick();this.timer=setInterval(()=>this.tick(),50);
    }catch{/* A later gesture can retry audio unlock. */}
    finally{if(generation===this.generation)this.starting=false;}
  }
  private beginTrack(track:TrackId|null){
    const e=this.engine;if(!e)return;
    e.stop('music',e.A.currentTime);this.track=track;this.beat=0;this.nextAt=e.A.currentTime+.05;this.switchingAt=null;
  }
  private stopAmbience(immediate=false){
    const e=this.engine,g=this.ambientBus;if(!e||!g)return;
    const at=e.A.currentTime;g.gain.setTargetAtTime(0,at,immediate?.01:.3);
    const nodes=this.ambientNodes;
    for(const n of nodes)try{n.stop(at+(immediate?0:1.5));}catch{/* Ended. */}
    // Stop the discrete droplets/chimes as well as the continuous sources.
    e.stop('ambience',at);e.unregisterOutput(g);
    if(nodes.length)nodes[0].addEventListener('ended',()=>g.disconnect(),{once:true});else g.disconnect();
    this.ambientNodes=[];this.ambientBus=null;this.ambient=null;this.ambientDefs=null;
  }
  private setAmbience(id:AmbienceId|null){
    if(this.ambient===id)return;this.stopAmbience();const e=this.engine;if(!e||!id)return;
    const g=e.A.createGain();g.connect(e.AMBB);e.registerOutput(g,'ambience');
    this.ambientBus=g;this.ambientDefs=ambienceSounds(e,g);this.ambientNodes=this.ambientDefs.AMB[id].start(g);
    this.ambient=id;this.ambientNext=e.A.currentTime+.3;
  }
  private sync(){
    const e=this.engine;if(!e)return;e.setLight(this.scene.light);this.setAmbience(this.scene.ambience);
    if(this.track!==this.scene.track&&this.switchingAt===null){
      const now=e.A.currentTime;this.switchingAt=now+.5;
      e.MF.gain.cancelScheduledValues(now);e.MF.gain.setValueAtTime(e.MF.gain.value,now);e.MF.gain.linearRampToValueAtTime(0,now+.5);
    }
  }
  private tick(){
    const e=this.engine,ctx=this.ctx;if(!e||!ctx||ctx.state!=='running')return;const now=ctx.currentTime;
    if(this.switchingAt!==null&&now>=this.switchingAt){
      this.beginTrack(this.scene.track);e.MF.gain.cancelScheduledValues(now);e.MF.gain.setValueAtTime(0,now);e.MF.gain.linearRampToValueAtTime(1,now+.5);
    }
    if(this.track&&this.switchingAt===null){
      const T=musicTracks(e)[this.track];if(this.nextAt<now)this.nextAt=now+.05;
      while(this.nextAt<now+.2){T.play(this.beat,this.nextAt);this.beat=(this.beat+1)%T.len;this.nextAt+=T.sd;}
    }
    if(this.ambient&&this.ambientDefs){
      const E=this.ambientDefs.AMB[this.ambient];if(this.ambientNext<now)this.ambientNext=now+.1;
      while(this.ambientNext<now+.2){E.ev(this.ambientNext);this.ambientNext+=E.gap();}
    }
    if(this.scene.light<=.25&&(this.track||this.ambient)){
      const {heart}=ambienceSounds(e,e.AMBB);if(this.nextHB<now)this.nextHB=now+.05;
      while(this.nextHB<now+.2){heart(this.nextHB);this.nextHB+=.95-(25-this.scene.light*100)*.014;}
      if(now>=this.crackleAt){if(Math.random()<.25)e.noise(now+.1,{ft:'highpass',f:R(4000,.3),d:.01,g:R(.05,.6)});this.crackleAt=now+.05;}
    }
  }
  stop(){
    ++this.generation;this.starting=false;if(this.timer!==null)clearInterval(this.timer);this.timer=null;
    this.stopAmbience(true);this.track=null;this.switchingAt=null;
    if(this.engine){this.engine.M.gain.setTargetAtTime(0,this.engine.A.currentTime,.01);this.engine.stop();this.engine.MF.gain.cancelScheduledValues(this.engine.A.currentTime);this.engine.MF.gain.setValueAtTime(1,this.engine.A.currentTime);}
  }
}
export const soundtrack=new MusicPlayer();
