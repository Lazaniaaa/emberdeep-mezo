/** Approved Sound Lab synthesis. The same graph runs in real time and OfflineAudioContext. */
export type ToneOptions = { f: number; f2?: number; d?: number; g?: number; a?: number; w?: OscillatorType; det?: number; vib?: number; vd?: number; lp?: number; lp2?: number; out?: AudioNode };
export type NoiseOptions = { f?: number; f2?: number; d?: number; g?: number; a?: number; ft?: BiquadFilterType; q?: number; out?: AudioNode };
type Group = "effects" | "music" | "ambience";
type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[]; start: number; end: number; group: Group };
export const R = (x: number, p: number) => x * (1 + (Math.random() * 2 - 1) * p);
export const mt = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const musicCutoff = (ratio: number) => 400 * Math.pow(22, Math.max(0, Math.min(1, ratio)));

export class SynthEngine {
  readonly A: BaseAudioContext;
  readonly M: GainNode;
  readonly REV: ConvolverNode;
  readonly NB: AudioBuffer;
  readonly FXB: GainNode;
  readonly AMBB: GainNode;
  readonly MUB: GainNode;
  readonly filter: BiquadFilterNode;
  /** Input gate, before the approved music filter, used only for track transitions. */
  readonly MF: GainNode;
  private voices = new Set<Voice>();
  private outputs = new Map<AudioNode, Group>();
  private effectLimit: number;
  constructor(A: BaseAudioContext, effectLimit = 24) {
    this.effectLimit = effectLimit;
    this.A = A;
    const c = A.createDynamicsCompressor(); c.threshold.value = -14; c.ratio.value = 4;
    this.M = A.createGain(); this.M.gain.value = .9; this.M.connect(c); c.connect(A.destination);
    this.REV = A.createConvolver(); const L = Math.floor(A.sampleRate * 2.4), ib = A.createBuffer(2, L, A.sampleRate);
    for (let k = 0; k < 2; k++) { const d = ib.getChannelData(k); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3); }
    this.REV.buffer = ib; const rg = A.createGain(); rg.gain.value = .5; this.REV.connect(rg); rg.connect(this.M);
    this.NB = A.createBuffer(1, A.sampleRate * 2, A.sampleRate); const nd = this.NB.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.FXB = this.bus(.8, .25); this.AMBB = this.bus(.8, .45);
    this.MUB = A.createGain(); this.MUB.gain.value = .55;
    this.filter = A.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 8800; this.filter.Q.value = .7;
    this.MF = A.createGain(); this.MF.connect(this.filter); this.filter.connect(this.MUB); this.MUB.connect(this.M);
    const ms = A.createGain(); ms.gain.value = .35; this.MUB.connect(ms); ms.connect(this.REV);
    this.outputs.set(this.MF, "music"); this.outputs.set(this.AMBB, "ambience");
  }
  private bus(g: number, w: number) {
    const b = this.A.createGain(); b.gain.value = g; b.connect(this.M);
    const s = this.A.createGain(); s.gain.value = w; b.connect(s); s.connect(this.REV); return b;
  }
  registerOutput(output: AudioNode, group: Group) { this.outputs.set(output, group); }
  unregisterOutput(output: AudioNode) { this.outputs.delete(output); }
  get activeVoices() { return this.voices.size; }
  get activeEffectVoices() {
    const now=this.A.currentTime;return [...this.voices].filter(v=>v.group==='effects'&&v.start<=now&&v.end>now).length;
  }
  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, end: number, output: AudioNode) {
    const group = this.outputs.get(output) ?? "effects";
    if (group === "effects") {
      // Click clusters are scheduled in random time order: check future starts too, not just this start.
      const points=[start,...[...this.voices].filter(v=>v.group===group&&v.start>start&&v.start<end).map(v=>v.start)].sort((a,b)=>a-b);
      for(const at of points){
        const overlap=[...this.voices].filter(v=>v.group===group&&v.start<=at&&v.end>at).sort((a,b)=>a.start-b.start);
        while(overlap.length>=this.effectLimit){
          const oldest=overlap.shift()!;oldest.end=at;
          try{oldest.source.stop(at);}catch{/* Already ended. */}
        }
      }
    }
    const v = { source, nodes, start, end, group }; this.voices.add(v);
    source.addEventListener("ended", () => { this.voices.delete(v); for (const n of nodes) n.disconnect(); }, { once: true });
  }
  stop(group?: Group, at = this.A.currentTime + .04) {
    for (const v of this.voices) if (!group || v.group === group) {
      try { v.source.stop(at); } catch { /* Already ended. */ }
      for (const n of v.nodes) n.disconnect(); this.voices.delete(v);
    }
  }
  setLevels(music: number, effects: number, muted = false) {
    const t = this.A.currentTime;
    this.M.gain.setTargetAtTime(muted ? 0 : .9, t, .01);
    this.MUB.gain.setTargetAtTime(music, t, .05);
    this.FXB.gain.setTargetAtTime(effects, t, .05); this.AMBB.gain.setTargetAtTime(effects, t, .05);
  }
  setLight(ratio: number) { this.filter.frequency.setTargetAtTime(musicCutoff(ratio), this.A.currentTime, .1); }
  private env(g: GainNode, t: number, a: number, d: number, p: number) {
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(p, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(d, a + .01));
  }
  tone = (t: number, o: ToneOptions) => {
    const A = this.A, os = A.createOscillator(), g = A.createGain(), d = o.d || .1, nodes: AudioNode[] = [os, g];
    os.type = o.w || "sine"; os.frequency.setValueAtTime(o.f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + d); if (o.det) os.detune.value = o.det;
    if (o.vib) {
      const l = A.createOscillator(), lg = A.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vd || o.f * .02;
      l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + d + .05); nodes.push(l, lg);
      // A stopped parent also releases its modulation oscillator.
      os.addEventListener("ended", () => { try { l.stop(); } catch { /* Ended. */ } }, { once: true });
    }
    let n: AudioNode = os;
    if (o.lp) {
      const fl = A.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.setValueAtTime(o.lp, t);
      if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + d); n.connect(fl); n = fl; nodes.push(fl);
    }
    const out = o.out || this.FXB; n.connect(g); g.connect(out); this.env(g, t, o.a || .005, d, o.g || .1);
    this.track(os, nodes, t, t + d + .05, out); os.start(t); os.stop(t + d + .05);
  };
  noise = (t: number, o: NoiseOptions) => {
    const A = this.A, s = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain(), d = o.d || .1;
    s.buffer = this.NB; s.loop = true; fl.type = o.ft || "bandpass"; fl.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + d); fl.Q.value = o.q || 1;
    const out = o.out || this.FXB; s.connect(fl); fl.connect(g); g.connect(out); this.env(g, t, o.a || .003, d, o.g || .2);
    this.track(s, [s, fl, g], t, t + d + .05, out); s.start(t, Math.random() * 1.5); s.stop(t + d + .05);
  };
  clicks = (t: number, n: number, span: number, o: NoiseOptions) => {
    for (let i = 0; i < n; i++) this.noise(t + Math.random() * span, { ...o, f: R(o.f!, .4), g: R(o.g!, .4) });
  };
}

const engines = new WeakMap<BaseAudioContext, SynthEngine>();
export function engineFor(ctx: BaseAudioContext) {
  let engine = engines.get(ctx); if (!engine) { engine = new SynthEngine(ctx); engines.set(ctx, engine); } return engine;
}
