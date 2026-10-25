import { vi } from 'vitest';
/** Small scheduling mock; waveform correctness is tested in Edge OfflineAudioContext. */
export function mockAudio(){
  const nodes:Record<string,unknown>[]=[];
  const param=()=>({value:1,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn()});
  const node=()=>{const n={connect:vi.fn(),disconnect:vi.fn(),addEventListener:vi.fn(),start:vi.fn(),stop:vi.fn(),frequency:param(),detune:param(),gain:param(),Q:param(),threshold:param(),ratio:param()};nodes.push(n);return n;};
  const ctx={currentTime:0,state:'running',sampleRate:100,destination:{},resume:vi.fn(async()=>{}),
    createGain:vi.fn(node),createOscillator:vi.fn(node),createBufferSource:vi.fn(node),createBiquadFilter:vi.fn(node),createConvolver:vi.fn(node),createDynamicsCompressor:vi.fn(node),
    createBuffer:vi.fn((channels:number,length:number)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{getChannelData:(i:number)=>data[i]};}),
  };
  return{ctx,nodes,get:()=>ctx as unknown as AudioContext};
}
