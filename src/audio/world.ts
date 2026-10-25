import {R, type SynthEngine} from './engine';
export const WORLD_KEYS = ["step","swing","hit","kill","urn","crate","gold","crystal","oil","chest","hurt","dodge","ward","potion","levelup","stairs","rift","dark","buy","mint"] as const;
export type WorldCue = typeof WORLD_KEYS[number];
export function worldSounds(engine: SynthEngine) {
const {tone,noise,clicks} = engine;
const S: Record<WorldCue, (t: number) => void> = {

step:t=>{noise(t,{ft:'lowpass',f:R(650,.2),q:1.2,d:.06,g:.35});tone(t,{f:R(95,.1),f2:55,d:.05,g:.18})},
swing:t=>noise(t,{f:600,f2:2800,q:2.5,d:.16,a:.04,g:.3}),
hit:t=>{noise(t,{f:R(1500,.15),q:.9,d:.07,g:.45});tone(t,{f:R(190,.1),f2:55,d:.13,g:.5})},
kill:t=>{S.hit(t);tone(t+.03,{w:'square',f:320,f2:60,d:.22,g:.07,lp:1600});noise(t+.03,{ft:'lowpass',f:900,f2:200,d:.3,g:.25})},
urn:t=>{tone(t,{f:130,f2:70,d:.08,g:.35});noise(t,{ft:'highpass',f:2200,d:.13,g:.3});for(let i=0;i<6;i++)tone(t+.01+Math.random()*.12,{f:R(2700,.35),d:R(.1,.4),g:.06})},
crate:t=>{noise(t,{f:900,q:1.6,d:.06,g:.6});tone(t,{w:'triangle',f:170,f2:90,d:.12,g:.3});noise(t+.07,{f:R(1300,.2),q:2,d:.05,g:.4});noise(t+.05,{ft:'lowpass',f:600,f2:200,d:.25,g:.3});clicks(t+.08,5,.25,{f:900,q:3,d:.03,g:.2})},
gold:t=>[1950,2550].forEach((f,i)=>{tone(t+i*.07,{f,d:.3,g:.11});tone(t+i*.07,{f:f*2.76,d:.12,g:.04})}),
crystal:t=>{[1568,2349,3136,3951].forEach((f,i)=>tone(t+i*.045,{f,d:1,g:.05,a:.004}));noise(t,{ft:'highpass',f:6000,d:.35,g:.05})},
oil:t=>{tone(t,{f:240,f2:620,d:.07,g:.28});tone(t+.09,{f:360,f2:880,d:.07,g:.22});tone(t+.17,{f:300,f2:700,d:.06,g:.12})},
chest:t=>{tone(t,{w:'sawtooth',f:110,f2:150,d:.3,g:.05,lp:700,vib:11,vd:6});for(let i=0;i<7;i++){const f=R(2200,.25);tone(t+.25+i*.055,{f,d:.25,g:.06});tone(t+.25+i*.055,{f:f*2.76,d:.1,g:.02})}},
hurt:t=>{noise(t,{ft:'lowpass',f:1000,f2:180,d:.28,g:.4});tone(t,{f:150,f2:42,d:.32,g:.55});tone(t,{w:'square',f:75,d:.12,g:.05,lp:500})},
dodge:t=>{noise(t,{f:900,f2:3500,q:3,d:.13,a:.02,g:.25});tone(t+.04,{w:'triangle',f:900,f2:1500,d:.09,g:.05})},
ward:t=>{[1046,1318,1568].forEach(f=>tone(t,{f,d:.7,g:.05,vib:7,vd:6}));noise(t,{ft:'highpass',f:5000,d:.3,g:.06});tone(t,{w:'triangle',f:523,d:.25,g:.12})},
potion:t=>{for(let i=0;i<3;i++)tone(t+i*.08,{f:R(300,.2),f2:R(650,.2),d:.06,g:.18});tone(t+.25,{f:400,f2:950,d:.3,g:.08,vib:9})},
levelup:t=>[523,659,784,1047,1319].forEach((f,i)=>{tone(t+i*.07,{w:'triangle',f,d:.35,g:.08});tone(t+i*.07,{f:f/2,d:.4,g:.04})}),
stairs:t=>{for(let i=0;i<4;i++)S.step(t+i*.17);noise(t+.2,{ft:'lowpass',f:1400,f2:150,d:1,a:.2,g:.25});tone(t+.2,{f:220,f2:70,d:1,g:.12})},
rift:t=>{noise(t,{f:300,f2:4500,q:5,d:1.3,a:.5,g:.22});[392,523,659,784].forEach((f,i)=>tone(t+.15*i,{f,d:1.4,a:.3,g:.05,vib:5}));tone(t+.6,{f:1568,d:1.2,g:.04})},
dark:t=>{tone(t,{w:'sawtooth',f:110,f2:34,d:2.6,g:.13,lp:1400,lp2:90});tone(t,{w:'sawtooth',f:111.5,f2:34.5,d:2.6,g:.1,lp:1400,lp2:90});noise(t,{ft:'lowpass',f:400,f2:80,d:2.2,a:.6,g:.15});tone(t+.1,{f:55,d:2.4,a:.5,g:.3})},
buy:t=>{tone(t,{w:'square',f:1200,d:.035,g:.05,lp:3000});tone(t+.05,{w:'square',f:1600,d:.05,g:.05,lp:3000});S.gold(t+.08)},
mint:t=>[587,740,880,1175,1480].forEach((f,i)=>{tone(t+i*.09,{f,d:.9,g:.06});tone(t+i*.09,{f:f*2.76,d:.3,g:.015})})
}; return S;
}
