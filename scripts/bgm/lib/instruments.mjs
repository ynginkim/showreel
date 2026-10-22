// bgm/lib/instruments.mjs: synth voices for code-composed BGM. Each render* writes one event into the Mixer
// (dry bus + plate/hall/delay sends). A score's compose() returns { events: { <instrument>: [event, ...] } }; render.mjs
// calls INSTRUMENTS[name](mixer, event, ctx) for every event, in the order the instrument keys appear.
//
// Event fields (t = seconds; midi = MIDI note; vel 0..1; pan -1..1; gain = per-event multiplier on top of the score's mix):
//   pad   { t0, t1, notes:[midi], att=0.5, rel=1.2, kind:'warm'|'full'|'soft', cut?:Hz|fn(t), cutMul?, hp?:Hz, swell?, sends? }
//         4-pole low-pass follows cut (or the score's padCut(t)); 'full' = 3 saws/voice, 'soft' = mostly sine. swell = reverse envelope.
//   bass  { t, dur, midi, vel, style:'sub'|'pulse'|'round'|'motor'|'drive'|{...}, duck?:0..1 }   duck = sidechain dip under a kick
//   kick  { t, vel, kind:'norm'|'soft' }                               soft sine thump with a little beater click
//   tick  { t, type, vel, pan, alt?, var?, open? }  type: clock | flap | pencil | hat | step | feed | clunk | ratchet
//   pluck { t, midi, vel, dec=0.35, bright=0.45, pan, sends? }         additive kalimba / felt-mallet pluck
//   arp   { t, midi, vel, cut=900, envAmt=2.2, dec=0.12, sq=0.3, q?, pan, sends? }   saw/square with filter envelope
//   glass { t, midi, vel, dec=0.5, ratio=2, index=1.6, pan, sends? }    2-op FM, glassy
//   bell  { t, midi, vel, dec=2.4, pan, sends? }                         inharmonic glassy mallet bell
//   piano { t, midi, vel, dur, dec=2.6, pan, sends? }                    felt piano
//   fx    { type:'boom', t, midi, dec, gain } | { type:'stab', t, notes, cut0, cutEnd, cutDec, dec, gain }
//         | { type:'riser'|'air', t, t1, f0, f1, q?, curve?, tail?, hall?, gain } | { type:'shimmer', t, dec, gain }
//   sends = { plate, hall, delay } amounts; each instrument has its own default.
import { SR, TAU, SVF, blep, noise, seedOf, makeRng, mtof, panL, panR, clamp } from './dsp.mjs';

export class Mixer {
  constructor(N, stemNames = []) {
    this.N = N;
    this.L = new Float32Array(N); this.R = new Float32Array(N);
    this.plate = new Float32Array(N); this.hall = new Float32Array(N);
    this.dL = new Float32Array(N); this.dR = new Float32Array(N);
    this.stems = {}; for (const s of stemNames) this.stems[s] = [new Float32Array(N), new Float32Array(N)];
  }
  // stereo pair (bL may equal bR for mono) placed at sample s0
  put(stem, s0, bL, bR, gain, pan = 0, sends = {}) {
    const gl = gain * panL(pan) * Math.SQRT2, gr = gain * panR(pan) * Math.SQRT2;
    const pl = (sends.plate || 0) * gain, ha = (sends.hall || 0) * gain, de = (sends.delay || 0);
    const st = this.stems[stem], n = Math.min(bL.length, this.N - s0);
    for (let i = Math.max(0, -s0); i < n; i++) {
      const a = bL[i], b = bR[i], j = s0 + i, l = a * gl, r = b * gr;
      this.L[j] += l; this.R[j] += r;
      if (pl) this.plate[j] += (a + b) * 0.5 * pl;
      if (ha) this.hall[j] += (a + b) * 0.5 * ha;
      if (de) { this.dL[j] += l * de; this.dR[j] += r * de; }
      if (st) { st[0][j] += l; st[1][j] += r; }
    }
  }
}

const S = t => Math.round(t * SR);
function fadeTail(b, ms = 4) { const n = Math.min(b.length, Math.round(ms * SR / 1000)); for (let i = 0; i < n; i++) b[b.length - 1 - i] *= i / n; }

// ---------------- pad: detuned saws + sine, 4-pole low-pass following an automation curve ----------------
export function renderPad(mx, e, cutFn, stem = 'pad') {
  const { t0, t1, notes, att = 0.5, rel = 1.2, gain = 1 } = e;
  if (typeof e.cut === 'function') cutFn = e.cut; else if (typeof e.cut === 'number') { const c = e.cut; cutFn = () => c; }
  const kind = e.kind || 'warm', s0 = S(t0), nOn = S(t1 - t0), len = nOn + S(rel), r = makeRng('pad:' + t0.toFixed(4) + kind);
  const cutMul = e.cutMul || 1, hp = e.hp || 0;
  const out = [new Float32Array(len), new Float32Array(len)];
  const dets = kind === 'full' ? [-10, -2, 7] : kind === 'soft' ? [-4, 5] : [-7, 6];
  const sawAmp = kind === 'soft' ? 0.45 : 1, sineAmp = kind === 'soft' ? 1.2 : 0.55;
  for (let side = 0; side < 2; side++) {
    const vs = [];
    for (const m of notes) {
      const f = mtof(m);
      for (const d of dets) vs.push({ f, d: (side ? -d : d) + r.range(-1.5, 1.5), saw: 1, a: sawAmp, ph: r(), lr: r.range(0.05, 0.19), lp: r() * TAU });
      vs.push({ f, d: r.range(-2, 2), saw: 0, a: sineAmp, ph: r(), lr: r.range(0.05, 0.15), lp: r() * TAU });
    }
    const nv = vs.length, ph = new Float64Array(nv), inc = new Float64Array(nv), saw = new Uint8Array(nv), amp = new Float64Array(nv);
    for (let j = 0; j < nv; j++) { ph[j] = vs[j].ph; saw[j] = vs[j].saw; amp[j] = vs[j].a / Math.sqrt(notes.length * (dets.length + 1)); }
    const f1 = new SVF(), f2 = new SVF(), h1 = new SVF(hp || 20, 0.707), o = out[side];
    for (let b = 0; b < len; b += 32) {
      const tt = b / SR;
      for (let j = 0; j < nv; j++) { const v = vs[j]; inc[j] = v.f * Math.pow(2, (v.d + 2.2 * Math.sin(v.lp + TAU * v.lr * tt)) / 1200) / SR; }
      const c = cutFn(t0 + tt) * cutMul; f1.set(c, 0.541); f2.set(c, 1.307);
      const be = Math.min(len, b + 32);
      for (let i = b; i < be; i++) {
        let s = 0;
        for (let j = 0; j < nv; j++) {
          let p = ph[j] + inc[j]; if (p >= 1) p -= 1; ph[j] = p;
          s += saw[j] ? amp[j] * (2 * p - 1 - blep(p, inc[j])) : amp[j] * Math.sin(TAU * p);
        }
        let y = Math.tanh(f2.run(f1.run(s)));            // gentle analog saturation keeps the saw-stack crest factor down
        if (hp) { h1.run(y); y = h1.hp; }
        o[i] = y;
      }
    }
    const kr = 6.9078 / rel;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      let env = t < att ? (e.swell ? Math.pow(t / att, 2.2) : 0.5 - 0.5 * Math.cos(Math.PI * t / att)) : 1;
      if (i >= nOn) env *= Math.exp(-(i - nOn) / SR * kr);
      o[i] *= env;
    }
    fadeTail(o, 20);
  }
  mx.put(stem, s0, out[0], out[1], gain, 0, e.sends || { hall: 0.32, plate: 0.05 });
}

// ---------------- bass: saw + sine through a resonant low-pass with envelope ----------------
export function renderBass(mx, e) {
  const { t, dur, midi, vel = 1 } = e, st = typeof e.style === 'string' ? BASS[e.style] : (e.style || BASS.round);
  if (!st) throw new Error(`bass: unknown style ${e.style}`);
  const f = mtof(midi), s0 = S(t), nOn = S(dur), len = nOn + S(st.rel) + 64;
  const b = new Float32Array(len), fl = new SVF(), r = makeRng('bass:' + t.toFixed(4));
  let p1 = r(), p2 = r(), p3 = r(); const dt = f / SR;
  const kr = 6.9078 / st.rel;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    if ((i & 15) === 0) fl.set(st.cut + st.env * vel * Math.exp(-tt / st.dec), st.q);
    p1 += dt * 1.0012; if (p1 >= 1) p1 -= 1;
    p2 += dt * 0.9991; if (p2 >= 1) p2 -= 1;
    p3 += dt; if (p3 >= 1) p3 -= 1;
    const saw = 0.5 * ((2 * p1 - 1 - blep(p1, dt)) + (2 * p2 - 1 - blep(p2, dt)));
    let x = st.saw * saw + st.sine * Math.sin(TAU * p3);
    x = fl.run(x);
    let env = Math.min(1, tt / st.att);
    env *= st.sus + (1 - st.sus) * Math.exp(-tt / st.hold);
    if (e.duck) env *= 1 - e.duck * Math.exp(-tt / 0.045);   // sidechain-style: make room for the kick
    if (i >= nOn) env *= Math.exp(-(i - nOn) / SR * kr);
    b[i] = Math.tanh(1.4 * x * env) / 1.4;
  }
  fadeTail(b, 3);
  mx.put('bass', s0, b, b, e.gain * vel, 0, { plate: st.plate || 0 });
}
export const BASS = {
  sub:   { saw: 0.12, sine: 1.0, cut: 170, env: 60, dec: 0.3, q: 0.7, att: 0.35, hold: 1, sus: 1, rel: 1.2 },
  pulse: { saw: 0.9, sine: 0.6, cut: 150, env: 420, dec: 0.05, q: 1.0, att: 0.003, hold: 0.09, sus: 0.35, rel: 0.05 },
  round: { saw: 0.6, sine: 0.8, cut: 220, env: 260, dec: 0.12, q: 0.8, att: 0.008, hold: 0.5, sus: 0.7, rel: 0.25 },
  motor: { saw: 1.0, sine: 0.55, cut: 190, env: 620, dec: 0.06, q: 1.25, att: 0.002, hold: 0.12, sus: 0.55, rel: 0.035 },
  drive: { saw: 1.0, sine: 0.5, cut: 240, env: 900, dec: 0.055, q: 1.45, att: 0.002, hold: 0.1, sus: 0.5, rel: 0.03 },
};

// ---------------- kick: soft sine thump, no distortion ----------------
const kickCache = {};
function kickSample(kind) {
  if (kickCache[kind]) return kickCache[kind];
  const soft = kind === 'soft', n = S(0.55), b = new Float32Array(n), nz = noise(seedOf('kick' + kind)), bp = new SVF(2600, 1.1);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 43 + 68 * Math.exp(-t / 0.03) + 120 * Math.exp(-t / 0.004);
    ph += TAU * f / SR;
    const env = (1 - Math.exp(-t / 0.0009)) * (0.8 * Math.exp(-t / (soft ? 0.12 : 0.15)) + 0.2 * Math.exp(-t / 0.045));
    const click = bp.run(nz()) * Math.exp(-t / 0.0022) * (soft ? 0.12 : 0.22);
    b[i] = Math.tanh(1.2 * (Math.sin(ph) * env + click)) / Math.tanh(1.2);
  }
  fadeTail(b, 30);
  return (kickCache[kind] = b);
}
export function renderKick(mx, e) {
  const b = kickSample(e.kind || 'norm');
  mx.put('kick', S(e.t), b, b, e.gain * (e.vel ?? 1), 0, { plate: 0.03 });
}

// ---------------- ticks, clicks, mechanical percussion (all short noise/sine bursts) ----------------
function burst(len, seed, fn) { const b = new Float32Array(S(len)); const nz = noise(seed); for (let i = 0; i < b.length; i++) b[i] = fn(i / SR, nz); fadeTail(b, 2); return b; }
export function renderTick(mx, e) {
  const seed = seedOf('tick:' + e.type + ':' + e.t.toFixed(5));
  let b, sends = { plate: 0.12 };
  switch (e.type) {
    case 'clock': {           // dry wooden-metal clock tick, two pitches (tick / tock)
      const f1 = e.alt ? 5200 : 6400, a = new SVF(f1, 7), c = new SVF(f1 * 1.47, 9);
      b = burst(0.03, seed, (t, nz) => { const x = (t < 0.0006 ? nz() : 0) + 0.02 * nz() * Math.exp(-t / 0.002); return (a.run(x) + 0.6 * c.run(x)) * Math.exp(-t / 0.006) * 4; });
      break;
    }
    case 'flap': {            // split-flap card slapping its stop: plastic click + faint thock
      const a = new SVF(3300 + 600 * (e.var || 0), 4.5), c = new SVF(7400, 3), lo = new SVF(900, 1.5);
      b = burst(0.04, seed, (t, nz) => {
        const x = nz() * Math.exp(-t / 0.0011);
        return 1.6 * a.run(x) + 1.1 * c.run(x) + 0.35 * lo.run(x) * Math.exp(-t / 0.004);
      });
      sends = { plate: 0.18 };
      break;
    }
    case 'pencil': {          // soft dry tap, paper desk
      const a = new SVF(4800, 2.2), c = new SVF(8200, 2);
      b = burst(0.03, seed, (t, nz) => { const x = nz() * Math.exp(-t / 0.0018); return 1.2 * a.run(x) + 0.7 * c.run(x); });
      sends = { plate: 0.2 };
      break;
    }
    case 'hat': {             // closed hat: noise + metallic square cluster, high-passed
      const hp = new SVF(7200, 0.8), bp = new SVF(10500, 1.2), fr = [263, 400, 531, 588, 764, 1020].map(x => x * 9.1);
      const ph = fr.map(() => 0), dec = e.open ? 0.11 : 0.032;
      b = burst(e.open ? 0.22 : 0.08, seed, (t, nz) => {
        let m = 0; for (let k = 0; k < 6; k++) { ph[k] += fr[k] / SR; if (ph[k] >= 1) ph[k] -= 1; m += ph[k] < 0.5 ? 1 : -1; }
        const x = 0.7 * nz() + 0.06 * m; hp.run(x); return (0.8 * hp.hp + 0.6 * bp.run(x)) * Math.exp(-t / dec);
      });
      sends = { plate: 0.08 };
      break;
    }
    case 'step': {            // thermal-printer stepper: tiny descending chirp + grit, all above 4 kHz
      const hp = new SVF(4200, 0.9); let ph = 0;
      b = burst(0.02, seed, (t, nz) => {
        ph += (6200 - 1500 * Math.min(1, t / 0.004)) / SR;
        const x = 0.6 * Math.sin(TAU * ph) * Math.exp(-t / 0.0028) + 0.5 * nz() * Math.exp(-t / 0.0012);
        hp.run(x); return hp.hp * 1.3;
      });
      sends = { plate: 0.06 };
      break;
    }
    case 'feed': {            // paper feed: low thunk (below the speech band) + a quick zip
      const lo = new SVF(220, 1.2), zp = new SVF(3000, 2.5); let ph = 0;
      b = burst(0.12, seed, (t, nz) => {
        ph += (95 - 30 * Math.min(1, t / 0.03)) / SR;
        zp.set(3000 + 60000 * t, 2.5);
        return 0.9 * Math.sin(TAU * ph) * Math.exp(-t / 0.035) + 0.35 * lo.run(nz()) * Math.exp(-t / 0.01) + 0.25 * zp.run(nz()) * Math.exp(-t / 0.03) * Math.min(1, t / 0.01);
      });
      sends = { plate: 0.1 };
      break;
    }
    case 'clunk': {           // lever throw: heavy low body, short woody knock
      const bp = new SVF(520, 3); let ph = 0;
      b = burst(0.16, seed, (t, nz) => {
        ph += (118 - 46 * Math.min(1, t / 0.05)) / SR;
        return 0.95 * Math.sin(TAU * ph) * Math.exp(-t / 0.055) + 0.5 * bp.run(nz()) * Math.exp(-t / 0.009);
      });
      sends = { plate: 0.16 };
      break;
    }
    case 'ratchet': {         // lever detent click
      const a = new SVF(4600, 6), c = new SVF(6900, 5);
      b = burst(0.025, seed, (t, nz) => { const x = nz() * Math.exp(-t / 0.0009); return 1.5 * a.run(x) + c.run(x); });
      sends = { plate: 0.12 };
      break;
    }
  }
  if (!b) throw new Error(`tick: unknown type ${e.type}`);
  // tame the sub-millisecond spike (it costs headroom, not loudness): soft-clip at ~+9 dB over the 3 ms attack RMS
  let en = 0; const n3 = Math.min(b.length, S(0.003)); for (let i = 0; i < n3; i++) en += b[i] * b[i];
  const c = 2.8 * Math.sqrt(en / Math.max(1, n3)) + 1e-9;
  for (let i = 0; i < b.length; i++) b[i] = c * Math.tanh(b[i] / c);
  mx.put('tick', S(e.t), b, b, e.gain * (e.vel ?? 1), e.pan || 0, sends);
}

// ---------------- pluck: additive, soft kalimba / felt-mallet character ----------------
export function renderPluck(mx, e) {
  const f = mtof(e.midi), dec = e.dec || 0.35, bright = e.bright ?? 0.45, len = S(dec * 5.5), b = new Float32Array(len);
  const nz = noise(seedOf('pl' + e.t.toFixed(5))), pick = new SVF(2400, 1.4), P = 5;
  const fr = [], am = [], kd = [];
  for (let k = 1; k <= P; k++) { fr.push(TAU * f * k * (1 + 0.0007 * k * k) / SR); am.push(Math.pow(bright, k - 1) / k); kd.push(1 / (dec / (1 + 1.1 * (k - 1)))); }
  for (let i = 0; i < len; i++) {
    const t = i / SR; let s = 0;
    for (let k = 0; k < P; k++) s += am[k] * Math.sin(fr[k] * i) * Math.exp(-t * kd[k]);
    s *= Math.min(1, t / 0.0015);
    s += 0.05 * pick.run(nz()) * Math.exp(-t / 0.003);
    b[i] = s;
  }
  fadeTail(b, 10);
  mx.put('pluck', S(e.t), b, b, e.gain * (e.vel ?? 1), e.pan || 0, e.sends || { plate: 0.22, delay: 0.16 });
}

// ---------------- arp: band-limited saw/square with filter envelope ----------------
export function renderArp(mx, e) {
  const cut = e.cut ?? 900, envAmt = e.envAmt ?? 2.2, dec = e.dec ?? 0.12, sqm = e.sq ?? 0.3;
  const f = mtof(e.midi), dt = f / SR, len = S(dec * 6 + 0.01), b = new Float32Array(len), fl = new SVF(), r = makeRng('arp' + e.t.toFixed(5));
  let p = r(), q = r();
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    if ((i & 15) === 0) fl.set(cut * (1 + envAmt * Math.exp(-t / (dec * 0.5))), e.q || 0.9);
    p += dt; if (p >= 1) p -= 1; q += dt * 1.004; if (q >= 1) q -= 1;
    const saw = 2 * p - 1 - blep(p, dt);
    let sq = q < 0.5 ? 1 : -1; sq += blep(q, dt * 1.004); let q2 = q + 0.5; if (q2 >= 1) q2 -= 1; sq -= blep(q2, dt * 1.004);
    const x = (1 - sqm) * saw + sqm * 0.7 * sq;
    b[i] = fl.run(x) * Math.min(1, t / 0.002) * Math.exp(-t / dec);
  }
  fadeTail(b, 4);
  mx.put('arp', S(e.t), b, b, e.gain * (e.vel ?? 1), e.pan || 0, e.sends || { plate: 0.16, delay: 0.12 });
}

// ---------------- glass: 2-op FM, the second arpeggio layer ----------------
export function renderGlass(mx, e) {
  const f = mtof(e.midi), dec = e.dec || 0.5, len = S(dec * 6), b = new Float32Array(len), r = makeRng('gl' + e.t.toFixed(5));
  const wc = TAU * f / SR, wm = TAU * f * (e.ratio || 2) / SR, I0 = e.index || 1.6, ph0 = r() * TAU;
  for (let i = 0; i < len; i++) {
    const t = i / SR, I = I0 * Math.exp(-t / (dec * 0.35));
    b[i] = Math.sin(wc * i + I * Math.sin(wm * i + ph0)) * Math.min(1, t / 0.0015) * Math.exp(-t / dec);
  }
  fadeTail(b, 8);
  mx.put('glass', S(e.t), b, b, e.gain * (e.vel ?? 1), e.pan || 0, e.sends || { hall: 0.25, delay: 0.3 });
}

// ---------------- bell: glassy mallet, inharmonic additive partials + mallet tick ----------------
const BELLP = [[1, 1, 1], [2.0, 0.1, 0.55], [3.0, 0.06, 0.35], [4.07, 0.24, 0.22], [6.28, 0.07, 0.1], [9.42, 0.035, 0.05]];
export function renderBell(mx, e) {
  const f = mtof(e.midi), dec = e.dec || 2.4, len = S(dec * 5.2), b = new Float32Array(len);
  const nz = noise(seedOf('bell' + e.t.toFixed(5) + e.midi)), bp = new SVF(Math.min(9000, f * 5), 2), r = makeRng('bell' + e.t + e.midi);
  const parts = BELLP.filter(p => p[0] * f < 15000).map(([k, a, d]) => ({ w: TAU * f * k / SR, a, kd: 1 / (dec * d), ph: r() * TAU }));
  for (let i = 0; i < len; i++) {
    const t = i / SR; let s = 0;
    for (const p of parts) s += p.a * Math.sin(p.w * i + p.ph) * Math.exp(-t * p.kd);
    s = s * Math.min(1, t / 0.0012) + 0.12 * bp.run(nz()) * Math.exp(-t / 0.0025);
    b[i] = s;
  }
  fadeTail(b, 20);
  mx.put('bell', S(e.t), b, b, e.gain * (e.vel ?? 1), e.pan || 0, e.sends || { hall: 0.4, delay: 0.22 });
}

// ---------------- felt piano: two slightly detuned strings, stretched partials, soft hammer ----------------
export function renderPiano(mx, e) {
  const f = mtof(e.midi), dec = e.dec || 2.6, nOn = S(e.dur), len = nOn + S(0.45), b = new Float32Array(len);
  const nz = noise(seedOf('pno' + e.t.toFixed(5) + e.midi)), hm = new SVF(700, 0.8), r = makeRng('pno' + e.t + e.midi);
  const parts = [];
  for (let n = 1; n <= 7; n++) {
    const fn = f * n * Math.sqrt(1 + 0.00035 * n * n); if (fn > 9000) break;
    const a = Math.pow(n, -1.25) * Math.exp(-fn / 1700);
    for (const d of [-1.3, 1.3]) parts.push({ w: TAU * fn * Math.pow(2, d / 1200) / SR, a: a * 0.5, k1: 1 / (0.32 / (1 + 0.4 * (n - 1))), k2: 1 / (dec / (1 + 0.55 * (n - 1))), ph: r() * TAU });
  }
  for (let i = 0; i < len; i++) {
    const t = i / SR; let s = 0;
    for (const p of parts) s += p.a * Math.sin(p.w * i + p.ph) * (0.55 * Math.exp(-t * p.k1) + 0.45 * Math.exp(-t * p.k2));
    s = s * Math.min(1, t / 0.004) + 0.09 * hm.run(nz()) * Math.exp(-t / 0.014);
    if (i >= nOn) s *= Math.exp(-(i - nOn) / SR * 16);
    b[i] = s;
  }
  fadeTail(b, 10);
  mx.put('piano', S(e.t), b, b, e.gain * (e.vel ?? 1), e.pan || 0, e.sends || { hall: 0.34, plate: 0.06 });
}

// ---------------- fx: warm hits, risers, low thumps, cymbal shimmer ----------------
export function renderFx(mx, e) {
  const r = makeRng('fx' + e.type + e.t.toFixed(4));
  if (e.type === 'boom') {             // low warm sine drop, below the speech band
    const len = S(e.dec * 5), b = new Float32Array(len); let ph = 0; const f0 = mtof(e.midi);
    for (let i = 0; i < len; i++) { const t = i / SR; ph += TAU * (f0 * (1 + 0.6 * Math.exp(-t / 0.05))) / SR; b[i] = Math.sin(ph) * Math.min(1, t / 0.003) * Math.exp(-t / e.dec); }
    fadeTail(b, 30);
    mx.put('fx', S(e.t), b, b, e.gain, 0, { hall: 0.15 });
  } else if (e.type === 'stab') {      // chord stab with closing low-pass: the "warm hit"
    const len = S(e.dec * 4.5), out = [new Float32Array(len), new Float32Array(len)];
    for (let side = 0; side < 2; side++) {
      const vs = e.notes.flatMap(m => [-8, 7].map(d => ({ inc: mtof(m) * Math.pow(2, (side ? -d : d) / 1200) / SR, ph: r() })));
      const f1 = new SVF(), f2 = new SVF(), o = out[side];
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        if ((i & 31) === 0) { const c = e.cutEnd + (e.cut0 - e.cutEnd) * Math.exp(-t / e.cutDec); f1.set(c, 0.541); f2.set(c, 1.307); }
        let s = 0; for (const v of vs) { v.ph += v.inc; if (v.ph >= 1) v.ph -= 1; s += 2 * v.ph - 1 - blep(v.ph, v.inc); }
        o[i] = Math.tanh(1.6 * f2.run(f1.run(s / Math.sqrt(vs.length)))) / 1.6 * Math.min(1, t / 0.004) * Math.exp(-t / e.dec);
      }
      fadeTail(o, 30);
    }
    mx.put('fx', S(e.t), out[0], out[1], e.gain, 0, { hall: 0.55, plate: 0.1 });
  } else if (e.type === 'riser' || e.type === 'air') {   // filtered noise sweep with crescendo (riser) or swell-and-fade (air)
    const len = S(e.t1 - e.t + (e.tail || 0.05)), out = [new Float32Array(len), new Float32Array(len)], T = e.t1 - e.t;
    for (let side = 0; side < 2; side++) {
      const nz = noise(seedOf('rs' + e.t + side)), bp = new SVF(), o = out[side];
      for (let i = 0; i < len; i++) {
        const t = i / SR, x = Math.min(1, t / T);
        if ((i & 15) === 0) bp.set(e.f0 * Math.pow(e.f1 / e.f0, x), e.q || 1.4);
        let env = e.type === 'riser' ? Math.pow(x, e.curve || 2.2) : Math.sin(Math.PI * Math.min(1, x)) ** 2;
        if (t > T) env = Math.exp(-(t - T) / Math.max(0.01, (e.tail || 0.05) / 5));
        o[i] = bp.run(nz()) * env;
      }
      fadeTail(o, 10);
    }
    mx.put('fx', S(e.t), out[0], out[1], e.gain, 0, { hall: e.hall ?? 0.35 });
  } else if (e.type === 'shimmer') {   // soft cymbal-like wash for the LOCK, kept airy (high-passed)
    const len = S(e.dec * 4.5), out = [new Float32Array(len), new Float32Array(len)];
    for (let side = 0; side < 2; side++) {
      const nz = noise(seedOf('sh' + e.t + side)), hp = new SVF(5200, 0.7), bp = new SVF(8800, 0.9), o = out[side];
      for (let i = 0; i < len; i++) { const t = i / SR, x = nz(); hp.run(x); o[i] = (0.7 * hp.hp + 0.5 * bp.run(x)) * Math.min(1, t / 0.006) * Math.exp(-t / e.dec); }
      fadeTail(o, 30);
    }
    mx.put('fx', S(e.t), out[0], out[1], e.gain, 0, { hall: 0.5 });
  }
}

// ---------------- registry and default stem balance ----------------
// ctx = { padCut } from the score's compose() result. Unknown instrument names are an error in render.mjs.
export const INSTRUMENTS = {
  pad: (mx, e, ctx) => renderPad(mx, e, ctx.padCut), bass: (mx, e) => renderBass(mx, e), kick: (mx, e) => renderKick(mx, e),
  tick: (mx, e) => renderTick(mx, e), pluck: (mx, e) => renderPluck(mx, e), arp: (mx, e) => renderArp(mx, e),
  glass: (mx, e) => renderGlass(mx, e), bell: (mx, e) => renderBell(mx, e), piano: (mx, e) => renderPiano(mx, e),
  fx: (mx, e) => renderFx(mx, e),
};
// linear stem gains that balanced the approved pstack-harness bed; a score's `mix` export overrides any of them
export const DEFAULT_MIX = { pad: 0.55, bass: 0.42, kick: 0.5, tick: 0.11, pluck: 0.15, arp: 0.075, glass: 0.045, bell: 0.075, piano: 0.17, fx: 1.0 };
