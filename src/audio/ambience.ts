import {R,mt, type SynthEngine} from './engine';
export type AmbienceId = 'catacombs' | 'mycelium' | 'cinderworks' | 'hollowglass';
export function ambienceSounds(engine: SynthEngine, AG: AudioNode, at = engine.A.currentTime) {
const {A,NB,tone,noise}=engine;
const keep=(s: AudioScheduledSourceNode,nodes: AudioNode[])=>s.addEventListener('ended',()=>nodes.forEach(n=>n.disconnect()),{once:true});
function loopNoise(o: AudioNode,type: BiquadFilterType,f: number,q: number,g: number,lr?: number,ld?: number){const s=A.createBufferSource();s.buffer=NB;s.loop=true;const fl=A.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const gg=A.createGain();gg.gain.value=g;s.connect(fl);fl.connect(gg);gg.connect(o);s.start(at);const r: AudioScheduledSourceNode[]=[s];keep(s,[s,fl,gg]);if(lr){const l=A.createOscillator(),lg=A.createGain();l.frequency.value=lr;lg.gain.value=ld!;l.connect(lg);lg.connect(fl.frequency);l.start(at);r.push(l);keep(l,[l,lg]);}return r;}
function loopOsc(o: AudioNode,w: OscillatorType,f: number,g: number,lp?: number,tr?: number){const os=A.createOscillator();os.type=w;os.frequency.value=f;const gg=A.createGain();gg.gain.value=g;let n: AudioNode=os;const nodes: AudioNode[]=[os,gg];if(lp){const fl=A.createBiquadFilter();fl.type='lowpass';fl.frequency.value=lp;os.connect(fl);n=fl;nodes.push(fl);}n.connect(gg);gg.connect(o);os.start(at);const r: AudioScheduledSourceNode[]=[os];keep(os,nodes);if(tr){const l=A.createOscillator(),lg=A.createGain();l.frequency.value=tr;lg.gain.value=g*.6;l.connect(lg);lg.connect(gg.gain);l.start(at);r.push(l);keep(l,[l,lg]);}return r;}
const AMB: Record<AmbienceId, {start(o: AudioNode): AudioScheduledSourceNode[]; gap(): number; ev(t: number): void}>={
catacombs:{start:o=>loopNoise(o,'bandpass',500,.6,.09,.07,250),gap:()=>R(2.2,.5),ev:t=>{if(Math.random()<.85){const f=R(1700,.3),o={out:AG,f,f2:f*.45,d:.07,g:.05};tone(t,o);if(Math.random()<.35)tone(t+.28,Object.assign({},o,{g:.025}))}}},
mycelium:{start:o=>[...loopOsc(o,'sine',55,.04,0,.2),...loopOsc(o,'sine',82.4,.025,0,.13),...loopNoise(o,'lowpass',700,.7,.025,.05,200)],gap:()=>R(1.6,.5),ev:t=>{if(Math.random()<.6)noise(t,{out:AG,f:R(450,.3),f2:140,q:2,d:.35,a:.12,g:.06});else for(let i=0;i<3;i++)tone(t+i*.09,{out:AG,f:R(260,.2),f2:R(520,.2),d:.06,g:.04})}},
cinderworks:{start:o=>[...loopOsc(o,'sawtooth',55,.05,170),...loopNoise(o,'lowpass',380,.7,.06,.3,120)],gap:()=>R(.18,.6),ev:t=>{noise(t,{out:AG,ft:'highpass',f:R(3500,.3),d:.012,g:R(.06,.6)});if(Math.random()<.04){const f=R(330,.25);tone(t,{out:AG,w:'triangle',f,d:1,g:.05});tone(t,{out:AG,f:f*2.76,d:.6,g:.025});tone(t,{out:AG,f:f*5.4,d:.25,g:.01})}}},
hollowglass:{start:o=>loopNoise(o,'bandpass',2600,.5,.03,.06,900),gap:()=>R(1.8,.5),ev:t=>{const P=[84,86,88,91,93,96],n=1+Math.floor(Math.random()*3);for(let i=0;i<n;i++){const f=mt(P[Math.floor(Math.random()*6)]);tone(t+i*.13,{out:AG,f,d:1.8,g:.03});tone(t+i*.13,{out:AG,f:f*2.76,d:.6,g:.008})}}}
};
function heart(t: number){tone(t,{f:65,f2:42,d:.13,g:.6});tone(t+.21,{f:60,f2:40,d:.12,g:.38})}

return {AMB,heart};
}
