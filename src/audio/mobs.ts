import {R, type SynthEngine} from './engine';
import type {worldSounds} from './world';
export const MOB_IDS = ["wickgnaw","snaretoad","cinder-hound","chaincoil","needle-wraith","sootplate","hollow-burrower","fourfold-bell","rift-leaper","cerberus"] as const;
export type MobCue = `${typeof MOB_IDS[number]}:${'w' | 's' | 'd'}`;
export function mobSounds(engine: SynthEngine, world: ReturnType<typeof worldSounds>) {
const {tone,noise,clicks} = engine;
const S: Record<MobCue, (t: number) => void> & typeof world = {...world,
'wickgnaw:w':t=>{noise(t,{ft:'highpass',f:2500,f2:6000,d:.55,a:.45,g:.12});tone(t,{f:180,f2:280,d:.55,a:.4,g:.05})},
'wickgnaw:s':t=>{noise(t,{f:900,f2:250,q:.8,d:.4,a:.02,g:.5});tone(t,{f:120,f2:55,d:.3,g:.35})},
'wickgnaw:d':t=>{noise(t,{ft:'lowpass',f:2500,f2:180,d:.9,g:.22});tone(t,{f:320,f2:70,d:.7,g:.07});clicks(t,4,.4,{ft:'highpass',f:3500,d:.015,g:.08})},
'snaretoad:w':t=>clicks(t,10,.45,{f:3600,q:6,d:.015,g:.35}),
'snaretoad:s':t=>{tone(t,{f:2400,f2:280,d:.13,g:.16});noise(t,{ft:'highpass',f:4000,d:.09,g:.12})},
'snaretoad:d':t=>{noise(t,{ft:'lowpass',f:900,f2:140,d:.22,g:.45});tone(t,{f:320,f2:85,d:.17,g:.22});clicks(t+.05,5,.35,{f:2800,q:5,d:.015,g:.2})},
'cinder-hound:w':t=>{for(let i=0;i<18;i++)noise(t+i/30,{f:R(900,.15),q:.9,d:.025,g:.22*(.5+i/36)})},
'cinder-hound:s':t=>{noise(t,{f:300,f2:2200,q:1.4,d:.32,a:.08,g:.4});for(let i=0;i<10;i++)noise(t+i/45,{f:1400,q:1,d:.018,g:.15})},
'cinder-hound:d':t=>{noise(t,{ft:'lowpass',f:1800,f2:300,d:.4,g:.3});[2637,3136].forEach((f,i)=>tone(t+.08+i*.07,{f,d:.4,g:.025}))},
'chaincoil:w':t=>tone(t,{w:'sawtooth',f:92,f2:125,d:.5,a:.05,g:.06,lp:650,vib:13,vd:7}),
'chaincoil:s':t=>{tone(t,{w:'triangle',f:196,f2:186,d:.4,g:.3});tone(t,{f:392,d:.2,g:.08});noise(t+.02,{f:3200,f2:1800,q:8,d:.3,g:.12})},
'chaincoil:d':t=>{for(let i=0;i<11;i++){const u=t+Math.random()*.55;noise(u,{f:R(2300,.4),q:5,d:.03,g:.4});tone(u,{w:'triangle',f:R(750,.35),d:.05,g:.08})}},
'needle-wraith:w':t=>{[1760,2217,2637,3520].forEach((f,i)=>tone(t+i*.06,{f,d:.45,g:.035}));tone(t,{f:880,d:.55,g:.03,vib:6,vd:12})},
'needle-wraith:s':t=>{tone(t,{w:'square',f:420,f2:2600,d:.13,g:.05,lp:4500});noise(t,{ft:'highpass',f:5000,d:.12,g:.12})},
'needle-wraith:d':t=>[3520,2637,2217,1760,1318].forEach((f,i)=>tone(t+i*.08,{f,d:.9,g:.035})),
'sootplate:w':t=>{noise(t,{ft:'lowpass',f:170,q:1,d:1.1,a:.85,g:.8});tone(t,{f:44,f2:58,d:1.1,a:.85,g:.3})},
'sootplate:s':t=>{tone(t,{f:95,f2:28,d:.55,g:.9});noise(t,{ft:'lowpass',f:1300,f2:180,d:.45,g:.6});clicks(t+.05,8,.4,{f:600,q:2,d:.05,g:.3})},
'sootplate:d':t=>{clicks(t,16,1.1,{f:500,q:2,d:.07,g:.45});noise(t,{ft:'lowpass',f:320,d:1.1,a:.1,g:.35});tone(t,{f:60,f2:30,d:.9,g:.4})},
'hollow-burrower:w':t=>{for(let i=0;i<7;i++){noise(t+i*.055,{f:R(1500,.2),q:4,d:.02,g:.3});tone(t+i*.055,{w:'triangle',f:R(620,.2),d:.03,g:.05})}},
'hollow-burrower:s':t=>[0,.07].forEach(o=>{noise(t+o,{ft:'highpass',f:2600,d:.025,g:.6});tone(t+o,{w:'square',f:1100,f2:650,d:.035,g:.06,lp:3000})}),
'hollow-burrower:d':t=>{noise(t,{f:1800,q:1.5,d:.12,g:.55});tone(t,{w:'triangle',f:520,f2:190,d:.22,g:.15});clicks(t+.1,5,.35,{f:1300,q:4,d:.025,g:.25})},
'fourfold-bell:w':t=>{tone(t,{f:140,f2:430,d:.65,a:.55,g:.2,lp:900});noise(t,{ft:'lowpass',f:300,f2:1000,d:.65,a:.5,g:.08})},
'fourfold-bell:s':t=>{noise(t,{ft:'lowpass',f:2000,f2:400,d:.55,g:.5});tone(t,{f:95,f2:48,d:.22,g:.3});clicks(t+.05,8,.5,{ft:'highpass',f:6000,d:.02,g:.06})},
'fourfold-bell:d':t=>{tone(t,{w:'sawtooth',f:320,f2:75,d:.65,g:.06,lp:700});noise(t,{ft:'lowpass',f:600,f2:100,d:.7,g:.22})},
'rift-leaper:w':t=>[880,1046,880,1174,988].forEach((f,i)=>tone(t+i*.065,{w:'square',f,d:.06,g:.035,lp:2600,vib:30,vd:25})),
'rift-leaper:s':t=>{noise(t,{f:500,f2:3200,q:2,d:.2,a:.03,g:.32});[.12,.15,.18].forEach(o=>noise(t+o,{ft:'highpass',f:3000,d:.02,g:.35}))},
'rift-leaper:d':t=>{tone(t,{f:600,f2:1700,d:.06,g:.2});noise(t+.03,{ft:'lowpass',f:1600,f2:300,d:.3,g:.3});[1174,988,784].forEach((f,i)=>tone(t+.15+i*.07,{w:'square',f,d:.06,g:.025,lp:2200}))},
'cerberus:w':t=>{[62,65.5,93].forEach(f=>tone(t,{w:'sawtooth',f,d:1.3,a:.4,g:.07,lp:420,vib:7,vd:3}));noise(t,{ft:'lowpass',f:250,d:1.3,a:.5,g:.15})},
'cerberus:s':t=>{noise(t,{f:1300,q:1,d:.09,g:.7});tone(t,{f:120,f2:38,d:.4,g:.8});noise(t+.05,{f:300,f2:650,q:1,d:.8,a:.06,g:.45});[70,74].forEach(f=>tone(t+.05,{w:'sawtooth',f,f2:f*.7,d:.8,g:.08,lp:600}))},
'cerberus:d':t=>{S['cerberus:w'](t);tone(t+.3,{f:80,f2:24,d:1.8,g:.8});clicks(t+.4,20,1.4,{f:500,q:2,d:.08,g:.4});noise(t+.3,{ft:'lowpass',f:400,f2:60,d:2,g:.4})}

}; return S;
}
