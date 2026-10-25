import {mt, type SynthEngine} from './engine';
export type TrackId = 'camp' | 'descent' | 'boss';
export function musicTracks(engine: SynthEngine) { const {tone,noise,MF}=engine;
function pl(t: number,m: number,d: number,g: number){tone(t,{f:mt(m),w:'triangle',d,g,out:MF});tone(t,{f:mt(m+12),d:d*.4,g:g*.25,out:MF})}
function bl(t: number,m: number,d: number,g: number){tone(t,{f:mt(m),d,g,a:.008,out:MF});tone(t,{f:mt(m)*2.76,d:d*.35,g:g*.2,out:MF});tone(t,{f:mt(m+12),d:d*.6,g:g*.18,out:MF})}
function pd(t: number,ns: number[],d: number,g: number){ns.forEach(m=>[-8,8].forEach(det=>tone(t,{f:mt(m),w:'sawtooth',det,d,a:d*.4,g:g/ns.length,lp:1100,out:MF})))}
function bs(t: number,m: number,d: number,g: number){tone(t,{f:mt(m),d,g,a:.01,out:MF});tone(t,{f:mt(m),w:'triangle',d:d*.6,g:g*.3,out:MF})}
function ht(t: number,g: number){noise(t,{ft:'highpass',f:7500,d:.035,g,out:MF})}
function tm(t: number,g: number){tone(t,{f:115,f2:45,d:.35,g,out:MF});noise(t,{ft:'lowpass',f:600,d:.08,g:g*.3,out:MF})}
function sn(t: number,g: number){noise(t,{f:1800,q:.8,d:.13,g,out:MF});tone(t,{w:'triangle',f:190,f2:150,d:.08,g:g*.4,out:MF})}
const CM=[74,0,76,78,0,76,74,0,73,0,74,76,0,74,71,0,71,0,74,79,0,78,76,0,76,0,73,69,0,71,73,0,78,0,81,78,0,76,74,0,74,0,78,76,0,74,73,71,71,74,79,0,81,79,78,76,76,0,0,73,0,0,74,0];
const DM=[62,0,65,69,67,65,62,0,65,69,72,69,67,0,64,60,62,65,69,0,70,69,65,62,67,65,62,60,61,0,64,69,74,0,69,65,67,70,69,0,72,69,65,64,67,64,60,0,65,69,74,72,70,0,69,65,67,62,65,64,61,64,69,0];
const DB=[38,34,41,36,38,34,43,33],DC: Record<number,number[]>={38:[62,65,69],34:[58,62,65],41:[60,65,69],36:[60,64,67],43:[58,62,67],33:[57,61,64]};
const BL=[[62,65],[63,62],[62,69],[68,67],[65,63],[62,61],[60,62],[61,0]];
const TR: Record<TrackId, {sd: number; len: number; play(s: number,t: number): void}>={
camp:{sd:60/76/2,len:64,play(s,t){const P=['D','Bm','G','A','D','Bm','G','A'],C: Record<string,number[]>={D:[62,66,69],Bm:[59,62,66],G:[55,59,62],A:[57,61,64]},B: Record<string,number>={D:50,Bm:47,G:43,A:45},bar=s>>3,i=s&7,c=C[P[bar]],sd=this.sd;
if(i==0){pd(t,c,sd*8.5,.07);bs(t,B[P[bar]],sd*3.5,.16)}if(i==4)bs(t,B[P[bar]]+7,sd*3,.09);
pl(t,c[[0,1,2,1,0,2,1,2][i]],sd*1.6,.035);if(CM[s])bl(t,CM[s],sd*3,.06);if(i==2||i==6)ht(t,.012)}},
descent:{sd:60/66/2,len:128,play(s,t){const sd=this.sd,root=DB[(s>>3)%8];
if(s%8==0){pd(t,DC[root],sd*9,.08);bs(t,root+12,sd*7,.18)}
if(s%2==0){const m=DM[(s>>1)%64];if(m)bl(t,m,sd*2.6,.055)}
if(s%2==1)ht(t,.008);if(s%16==0)tm(t,.18);if(s%4==2)bs(t,root+24,sd*.8,.03)}},
boss:{sd:60/132/4,len:128,play(s,t){const sd=this.sd,bar=s>>4,i=s&15,root=[38,38,39,39,38,38,36,37][bar],BP=[0,null,0,12,0,null,0,12,0,null,0,12,0,null,1,null];
if(BP[i]!==null)tone(t,{f:mt(root+BP[i]),w:'sawtooth',d:sd*.9,g:.07,lp:700,lp2:250,out:MF});
if(i==0||i==6||i==10)tm(t,.4);if(i==4||i==12)sn(t,.22);if(i%2==0)ht(t,i%4==0?.02:.012);
if(i==0||i==8){const n=BL[bar][i>>3];if(n)tone(t,{f:mt(n),w:'square',d:sd*8,a:.02,g:.035,lp:1800,vib:5.5,vd:4,out:MF})}
if(i==0)pd(t,[root+24,root+27,root+31],sd*15,.05)}}
};

return TR;
}
