// bgm/lib/dsp.mjs: DSP core for code-composed BGM (no dependencies, Node >= 18).
// Seeded randomness, filters, FFT convolution reverb, ping-pong delay, BS.1770 loudness, true-peak limiter, bus glue, 24-bit WAV.
// Everything is deterministic: no Math.random, no clocks. Same score + same Node -> same samples.
import { writeFileSync } from 'node:fs';

export const SR = 48000;
export const TAU = Math.PI * 2;

export function seedOf(str) {               // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Seed namespace: every makeRng stream (yours and the instruments') is seeded by `${namespace}:${name}`.
// render.mjs sets it from the score's `seed` export before compose() runs; change it to get a different take of the same score.
let SEED_NS = 'showreel';
export function setSeed(ns) { SEED_NS = String(ns); }
export function getSeed() { return SEED_NS; }

// mulberry32 stream with helpers; one named stream per musical decision so layers stay independent
export function makeRng(name) {
  let a = seedOf(SEED_NS + ':' + name) | 0;
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = () => next();
  r.range = (lo, hi) => lo + (hi - lo) * next();
  r.int = (lo, hi) => lo + Math.floor((hi - lo + 1) * next());
  r.pick = arr => arr[Math.floor(next() * arr.length)];
  r.chance = p => next() < p;
  r.gauss = () => { let u = 0; while (u === 0) u = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * next()); };
  return r;
}

// audio-rate white noise, xorshift32, output in [-1, 1)
export function noise(seed) {
  let x = (seed | 0) || 0x1234567;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x / 2147483648; };
}

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const db = d => Math.pow(10, d / 20);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const panL = p => Math.cos((clamp(p, -1, 1) + 1) * Math.PI / 4);
export const panR = p => Math.sin((clamp(p, -1, 1) + 1) * Math.PI / 4);

// polyBLEP residual for band-limited saw/square
export function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// Zavalishin TPT state-variable filter (stable under fast modulation)
export class SVF {
  constructor(fc = 1000, q = 0.707) { this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; this.set(fc, q); }
  set(fc, q) {
    if (fc > SR * 0.46) fc = SR * 0.46; if (fc < 8) fc = 8;
    const g = Math.tan(Math.PI * fc / SR), k = 1 / q;
    this.k = k; this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  run(v0) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = v0 - this.k * v1 - v2;
    return v2;
  }
}

// in-place direct-form-I biquad over a Float32Array
export function biquad(x, b0, b1, b2, a1, a2) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
  }
}
export function butterHP(x, fc) {           // 2nd-order Butterworth high-pass (RBJ)
  const w = TAU * fc / SR, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
  biquad(x, (1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - al) / a0);
}

export function peakEQ(x, fc, q, gainDb) {   // RBJ peaking EQ
  const A = Math.pow(10, gainDb / 40), w = TAU * fc / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al / A;
  biquad(x, (1 + al * A) / a0, -2 * c / a0, (1 - al * A) / a0, -2 * c / a0, (1 - al / A) / a0);
}
export function highShelf(x, fc, gainDb) {    // RBJ high shelf, S = 1
  const A = Math.pow(10, gainDb / 40), w = TAU * fc / SR, c = Math.cos(w), al = Math.sin(w) / 2 * Math.SQRT2, sA = 2 * Math.sqrt(A) * al;
  const a0 = (A + 1) - (A - 1) * c + sA;
  biquad(x, A * ((A + 1) + (A - 1) * c + sA) / a0, -2 * A * ((A - 1) + (A + 1) * c) / a0, A * ((A + 1) + (A - 1) * c - sA) / a0,
    2 * ((A - 1) - (A + 1) * c) / a0, ((A + 1) - (A - 1) * c - sA) / a0);
}

// ---------- FFT + convolution reverb ----------
export class FFT {
  constructor(n) {
    this.n = n; const lv = Math.round(Math.log2(n));
    this.cos = new Float64Array(n / 2); this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(TAU * i / n); this.sin[i] = Math.sin(TAU * i / n); }
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < lv; b++) { r = (r << 1) | (x & 1); x >>= 1; } this.rev[i] = r >>> 0; }
  }
  run(re, im, inverse) {
    const n = this.n, rev = this.rev, C = this.cos, S = this.sin;
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    const sg = inverse ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = C[k], s = sg * S[k], l = j + half;
          const tr = re[l] * c - im[l] * s, ti = re[l] * s + im[l] * c;
          re[l] = re[j] - tr; im[l] = im[j] - ti; re[j] += tr; im[j] += ti;
        }
      }
    }
    if (inverse) { const s = 1 / n; for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; } }
  }
}

// mono send -> stereo wet via two decorrelated impulse responses (packed as one complex IR)
export function convolve(x, irL, irR, outL, outR, gain) {
  const M = irL.length; let n = 1; while (n < M) n <<= 1; n <<= 1;
  const fft = new FFT(n), hop = n - M + 1;
  const Hr = new Float64Array(n), Hi = new Float64Array(n);
  Hr.set(irL); Hi.set(irR); fft.run(Hr, Hi, false);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let pos = 0; pos < x.length; pos += hop) {
    const len = Math.min(hop, x.length - pos); let any = false;
    re.fill(0); im.fill(0);
    for (let i = 0; i < len; i++) { const v = x[pos + i]; re[i] = v; if (v !== 0) any = true; }
    if (!any) continue;
    fft.run(re, im, false);
    for (let i = 0; i < n; i++) { const a = re[i], b = im[i], c = Hr[i], d = Hi[i]; re[i] = a * c - b * d; im[i] = a * d + b * c; }
    fft.run(re, im, true);
    const lim = Math.min(n, outL.length - pos);
    for (let i = 0; i < lim; i++) { outL[pos + i] += re[i] * gain; outR[pos + i] += im[i] * gain; }
  }
}

// exponentially decaying 3-band noise IR with frequency-dependent RT60 and a few early reflections
export function makeIR(name, { len, rtLow, rtMid, rtHigh, pre = 0.015, xLow = 350, xHigh = 3500, early = [] }) {
  const n = Math.round(len * SR), p0 = Math.round(pre * SR), out = [];
  for (let ch = 0; ch < 2; ch++) {
    const nz = noise(seedOf(name + ':' + ch)), lo = new SVF(xLow, 0.707), hi = new SVF(xHigh, 0.707);
    const ir = new Float32Array(n);
    const kL = -6.9078 / rtLow, kM = -6.9078 / rtMid, kH = -6.9078 / rtHigh, fadeN = Math.round(0.12 * n);
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / SR, w = nz();
      lo.run(w); hi.run(w);
      const l = lo.lp, h = hi.hp, m = w - l - h;
      let v = l * Math.exp(kL * t) + m * Math.exp(kM * t) + h * Math.exp(kH * t);
      const fi = Math.min(1, t / 0.012); v *= fi * fi;
      if (i > n - fadeN) v *= (n - i) / fadeN;
      ir[i] = v;
    }
    const er = makeRng(name + ':er' + ch);
    for (const [tt, g] of early) { const j = Math.round((tt + er.range(-0.002, 0.002)) * SR); if (j < n) ir[j] += g * (er.chance(0.5) ? 1 : -1); }
    out.push(ir);
  }
  let e = 0; for (const ir of out) for (let i = 0; i < n; i++) e += ir[i] * ir[i];
  const g = Math.sqrt(2 / e); for (const ir of out) for (let i = 0; i < n; i++) ir[i] *= g;
  return out;
}

// tempo-synced ping-pong delay with damped feedback; mono-summed input enters the left tap
export function pingPong(inL, inR, outL, outR, dSamp, fb, lpHz, wet) {
  const N = inL.length, bL = new Float32Array(dSamp), bR = new Float32Array(dSamp);
  const lpa = 1 - Math.exp(-TAU * lpHz / SR), hpa = 1 - Math.exp(-TAU * 180 / SR);
  let zL = 0, zR = 0, hL = 0, hR = 0, idx = 0;
  for (let i = 0; i < N; i++) {
    const dl = bL[idx], dr = bR[idx];
    let nl = 0.5 * (inL[i] + inR[i]) + dr * fb, nr = dl * fb;
    zL += lpa * (nl - zL); zR += lpa * (nr - zR);        // damping
    hL += hpa * (zL - hL); hR += hpa * (zR - hR);        // keep the repeats out of the low end
    bL[idx] = zL - hL; bR[idx] = zR - hR;
    outL[i] += dl * wet; outR[i] += dr * wet;
    if (++idx >= dSamp) idx = 0;
  }
}

// ---------- loudness (ITU-R BS.1770-4, 48 kHz K-weighting) ----------
function kweight(x) {
  const y = Float32Array.from(x);
  biquad(y, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585);
  biquad(y, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
  return y;
}
// mean-square power per 100 ms block (sum of both channels), K-weighted
export function blockPower(L, R) {
  const kl = kweight(L), kr = kweight(R), hop = SR / 10, nb = Math.floor(L.length / hop), z = new Float64Array(nb);
  for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * hop; i < (b + 1) * hop; i++) s += kl[i] * kl[i] + kr[i] * kr[i]; z[b] = s / hop; }
  return z;
}
export const lufsOf = p => -0.691 + 10 * Math.log10(p + 1e-20);
export function momentary(z) {               // 400 ms windows, one value per 100 ms block (window ends at block)
  const m = new Float64Array(z.length);
  for (let b = 0; b < z.length; b++) { let s = 0, c = 0; for (let j = Math.max(0, b - 3); j <= b; j++) { s += z[j]; c++; } m[b] = s / c; }
  return m;
}
export function integrated(z) {
  const m = momentary(z).slice(3);
  let s = 0, c = 0; for (const p of m) if (lufsOf(p) > -70) { s += p; c++; }
  const rel = lufsOf(s / c) - 10; s = 0; c = 0;
  for (const p of m) if (lufsOf(p) > -70 && lufsOf(p) > rel) { s += p; c++; }
  return lufsOf(s / c);
}

// ---------- true-peak safe look-ahead limiter ----------
function interpTaps(frac, half = 12) {      // Blackman-windowed sinc for a fractional delay
  const t = new Float64Array(2 * half); let s = 0;
  for (let j = 0; j < 2 * half; j++) {
    const x = j - half + 1 - frac, w = 0.42 + 0.5 * Math.cos(Math.PI * x / (half + 1)) + 0.08 * Math.cos(2 * Math.PI * x / (half + 1));
    t[j] = (Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w; s += t[j];
  }
  for (let j = 0; j < 2 * half; j++) t[j] /= s;
  return t;
}
export function truePeakEnvelope(L, R) {    // per-sample max |x| over 4x-oversampled positions in [i, i+1)
  const N = L.length, half = 12, ph = [0.25, 0.5, 0.75].map(f => interpTaps(f, half)), pk = new Float32Array(N);
  for (const x of [L, R]) {
    for (let i = 0; i < N; i++) {
      let m = Math.abs(x[i]);
      if (i >= half - 1 && i + half < N) {
        for (const t of ph) { let s = 0; for (let j = 0; j < 2 * half; j++) s += t[j] * x[i - half + 1 + j]; const a = Math.abs(s); if (a > m) m = a; }
      }
      if (m > pk[i]) pk[i] = m;
    }
  }
  return pk;
}
export function limit(L, R, ceiling, look = 96, relSec = 0.12) {
  const N = L.length, pk = truePeakEnvelope(L, R), req = new Float32Array(N);
  for (let i = 0; i < N; i++) { const p = Math.max(pk[i], i > 0 ? pk[i - 1] : 0); req[i] = p > ceiling ? ceiling / p : 1; }
  const hold = new Float32Array(N), dq = new Int32Array(N); let h = 0, t = 0;   // sliding min over [i, i+look-1]
  for (let j = N - 1; j >= 0; j--) {
    while (t > h && req[dq[t - 1]] >= req[j]) t--;
    dq[t++] = j;
    while (dq[h] > j + look - 1) h++;
    hold[j] = req[dq[h]];
  }
  const rc = 1 - Math.exp(-1 / (relSec * SR)); let g = 1; let minG = 1;
  for (let i = 0; i < N; i++) { g = hold[i] < g ? hold[i] : g + (1 - g) * rc; if (g > hold[i]) g = hold[i]; hold[i] = g; }
  let acc = 0; const box = new Float32Array(N);
  for (let i = 0; i < N; i++) { acc += hold[i]; if (i >= look) acc -= hold[i - look]; box[i] = acc / Math.min(i + 1, look); }
  for (let i = 0; i < N; i++) { const gg = Math.min(box[i], 1); L[i] *= gg; R[i] *= gg; if (gg < minG) minG = gg; }
  return 20 * Math.log10(minG);
}

// gentle stereo-linked RMS compressor for bus glue
export function glue(L, R, { thr = -18, ratio = 1.8, knee = 8, att = 0.02, rel = 0.25 } = {}) {
  const N = L.length, aR = 1 - Math.exp(-1 / (0.012 * SR)), aA = 1 - Math.exp(-1 / (att * SR)), aRl = 1 - Math.exp(-1 / (rel * SR));
  let ms = 0, gr = 0, maxGr = 0;
  for (let i = 0; i < N; i++) {
    const x = 0.5 * (L[i] * L[i] + R[i] * R[i]); ms += aR * (x - ms);
    const lv = 10 * Math.log10(ms + 1e-12), o = lv - thr;
    let want = 0;
    if (o > knee / 2) want = o * (1 - 1 / ratio);
    else if (o > -knee / 2) want = (1 - 1 / ratio) * (o + knee / 2) ** 2 / (2 * knee);
    gr += (want > gr ? aA : aRl) * (want - gr);
    if (gr > maxGr) maxGr = gr;
    const g = Math.pow(10, -gr / 20); L[i] *= g; R[i] *= g;
  }
  return maxGr;
}

export function writeWav24(path, L, R) {
  const n = L.length, data = n * 6, buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34); buf.write('data', 36); buf.writeUInt32LE(data, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const x of [L[i], R[i]]) {
      let v = Math.round(clamp(x, -1, 1) * 8388607);
      if (v < 0) v += 16777216;
      buf[o++] = v & 255; buf[o++] = (v >> 8) & 255; buf[o++] = (v >> 16) & 255;
    }
  }
  writeFileSync(path, buf);
}
