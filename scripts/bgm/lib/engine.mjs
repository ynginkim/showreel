// bgm/lib/engine.mjs: score module -> mastered stereo buffers.
// Order of work (kept identical to the approved pstack-harness render so it reproduces bit for bit):
//   compose() events -> instruments into dry bus + sends -> plate & hall convolution, dotted-8th ping-pong
//   -> master EQ -> loudness-shape calibration (one trim per `levels` segment) + score automation + fades
//   -> pre-normalise -> glue -> normalise to target LUFS with a true-peak limiter (iterated) -> silence after the fade.
import { SR, setSeed, makeIR, convolve, pingPong, blockPower, lufsOf, integrated, limit, glue, butterHP, peakEQ, highShelf, db, smooth, clamp, mtof, makeRng, noise, seedOf } from './dsp.mjs';
import { Mixer, INSTRUMENTS, DEFAULT_MIX, BASS } from './instruments.mjs';
import { makeGrid } from './grid.mjs';

export const DEFAULT_MASTER = {
  lufs: -13.0,            // integrated target of the delivered file (mix.py re-normalises music to -16 LUFS itself)
  ceiling: -1.35,         // limiter ceiling in dBTP (ffmpeg then measures about -1.3)
  preLufs: -15,           // level the glue compressor sees
  glue: { thr: -15, ratio: 1.35, knee: 8, att: 0.03, rel: 0.35 },
  eq: [['hp', 22], ['peak', 280, 0.9, -2.0], ['shelf', 8000, 1.5]],   // DC/sub clean-up, room for a voice, a little air
  fadeIn: 0.06,
  fadeOut: null,          // [start, end] seconds; default [duration - 1.6, duration - 0.1]
  rise: 0.03, fall: 0.35, // how fast `levels` trims move at segment boundaries (s)
  trimClamp: 9,
};
export const DEFAULT_SPACE = {
  plate: { len: 1.5, rtLow: 1.0, rtMid: 0.95, rtHigh: 0.55, pre: 0.006, early: [[0.011, 0.5], [0.017, 0.4], [0.023, 0.35]], gain: 0.8 },
  hall: { len: 3.6, rtLow: 2.9, rtMid: 2.4, rtHigh: 1.3, pre: 0.024, early: [[0.031, 0.5], [0.043, 0.42], [0.057, 0.35], [0.071, 0.3]], gain: 0.9 },
  delay: { sixteenths: 3, fb: 0.36, lp: 3600, wet: 1.0 },
};

// what compose() receives: grid helpers + the small utility set a score needs
export function toolkit(grid) {
  return { ...grid, makeRng, noise, seedOf, smooth, clamp, mtof, db, BASS, SR };
}

export function describe(mod, grid) {
  const at = x => (x.t != null ? x.t : grid.bar(x.bar ?? 0, x.beat ?? 0));
  return {
    seed: mod.seed ?? 'showreel', duration: mod.duration, key: mod.key ?? null, title: mod.title ?? null,
    grid: { bpm: grid.bpm, beat: grid.BEAT, t0: grid.t0, beatsPerBar: grid.beatsPerBar, firstDownbeat: grid.firstDownbeat },
    sections: (mod.sections || []).map(s => ({ ...s, t: Math.max(0, at(s)) })),
    accents: (mod.accents || []).map(a => ({ strength: 0.5, ...a, t: at(a) })),
    gaps: mod.gaps || [],
  };
}

export async function renderScore(mod, { stems = [], mute = new Set(), log = () => {} } = {}) {
  if (typeof mod.compose !== 'function') throw new Error('score must export compose(bgm)');
  if (!(mod.duration > 0)) throw new Error('score must export duration (seconds)');
  setSeed(mod.seed ?? 'showreel');
  const grid = makeGrid(mod.grid);
  const out = await mod.compose(toolkit(grid));
  const events = out.events || {};
  const N = Math.round(mod.duration * SR);
  const mx = new Mixer(N, stems);
  const GAIN = { ...DEFAULT_MIX, ...(mod.mix || {}) };
  const ctx = { padCut: out.padCut || (() => 1200) };
  const counts = {};
  for (const [name, list] of Object.entries(events)) {
    const fn = INSTRUMENTS[name];
    if (!fn) throw new Error(`unknown instrument "${name}" (have: ${Object.keys(INSTRUMENTS).join(', ')})`);
    counts[name] = list.length;
    if (mute.has(name)) continue;
    for (const e of list) fn(mx, { ...e, gain: (e.gain ?? 1) * GAIN[name] }, ctx);
    log(`${name}: ${list.length} events`);
  }

  // ---- space ----
  const ms = mod.space || {};
  const SP = { plate: { ...DEFAULT_SPACE.plate, ...(ms.plate || {}) }, hall: { ...DEFAULT_SPACE.hall, ...(ms.hall || {}) }, delay: { ...DEFAULT_SPACE.delay, ...(ms.delay || {}) } };
  const L = mx.L, R = mx.R;
  const { gain: pg, ...pIR } = SP.plate, { gain: hg, ...hIR } = SP.hall;
  const plate = makeIR('plate', pIR), hall = makeIR('hall', hIR);
  convolve(mx.plate, plate[0], plate[1], L, R, pg); log('plate done');
  convolve(mx.hall, hall[0], hall[1], L, R, hg); log('hall done');
  pingPong(mx.dL, mx.dR, L, R, Math.round(SP.delay.sixteenths * grid.S16 * SR), SP.delay.fb, SP.delay.lp, SP.delay.wet); log('delay done');

  // ---- master EQ, loudness-shape calibration, automation, fades ----
  const M = { ...DEFAULT_MASTER, ...(mod.master || {}) };
  M.glue = { ...DEFAULT_MASTER.glue, ...((mod.master || {}).glue || {}) };
  for (const ch of [L, R]) {
    for (const [type, a, b, c] of M.eq) {
      if (type === 'hp') butterHP(ch, a); else if (type === 'peak') peakEQ(ch, a, b, c); else if (type === 'shelf') highShelf(ch, a, b);
      else throw new Error(`master.eq: unknown band ${type}`);
    }
  }
  const levels = out.levels || mod.levels || null;
  let segs = [{ k: null, target: 0, t0: 0, t1: mod.duration, trim: 0 }];
  if (levels && levels.points && levels.points.length) {
    const P = levels.points, end = levels.end ?? null;
    const z = blockPower(L, R);
    segs = P.map(([k, target], i) => ({ k, target, t0: Math.max(0, grid.bar(k)), t1: i + 1 < P.length ? grid.bar(P[i + 1][0]) : (end != null ? grid.bar(end) : mod.duration) }));
    for (const s of segs) {
      let sum = 0, c = 0;
      for (let b = Math.ceil((s.t0 + 0.4) * 10); b + 1 <= s.t1 * 10; b++) { let p = 0; for (let j = b - 3; j <= b; j++) p += z[j]; sum += p / 4; c++; }
      s.meas = lufsOf(sum / Math.max(1, c));
    }
    const ref = segs.reduce((a, s) => a + (s.meas - s.target) * (s.t1 - s.t0), 0) / segs.reduce((a, s) => a + s.t1 - s.t0, 0);
    for (const s of segs) s.trim = Math.max(-M.trimClamp, Math.min(M.trimClamp, s.target - s.meas + ref));
    log('segment trims (dB): ' + segs.map(s => `${s.k}:${s.trim >= 0 ? '+' : ''}${s.trim.toFixed(1)}`).join(' '));
  }
  const automation = out.automation || null;
  const gainDb = new Float32Array(Math.ceil(N / 32) + 1);
  for (let b = 0; b < gainDb.length; b++) {
    const t = b * 32 / SR;
    let j = 0; while (j + 1 < segs.length && t >= segs[j + 1].t0) j++;
    let g = segs[j].trim;
    if (j > 0) {                                            // rises snap on the downbeat, falls glide
      const a = segs[j - 1].trim, d = t - segs[j].t0, T = g > a ? M.rise : M.fall;
      if (d < T) g = a + (g - a) * smooth(d / T);
    }
    if (automation) g = automation(t, g);
    gainDb[b] = g;
  }
  const fadeIn = M.fadeIn, [fadeA, fadeB] = M.fadeOut || [mod.duration - 1.6, mod.duration - 0.1];
  const env = i => {
    const t = i / SR, b = i / 32, b0 = Math.floor(b), f = b - b0;
    let g = db(gainDb[b0] + (gainDb[Math.min(b0 + 1, gainDb.length - 1)] - gainDb[b0]) * f);
    if (t < fadeIn) g *= smooth(t / fadeIn);
    if (t > fadeA) g *= t >= fadeB ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (t - fadeA) / (fadeB - fadeA));
    return g;
  };
  const curve = new Float32Array(N); for (let i = 0; i < N; i++) curve[i] = env(i);
  for (let i = 0; i < N; i++) { L[i] *= curve[i]; R[i] *= curve[i]; }

  // ---- glue, loudness, true-peak limit ----
  const I0 = integrated(blockPower(L, R)), pre = db(M.preLufs - I0);
  for (let i = 0; i < N; i++) { L[i] *= pre; R[i] *= pre; }
  const glueGR = glue(L, R, M.glue);
  log(`glue max GR ${glueGR.toFixed(1)} dB`);
  const keepL = Float32Array.from(L), keepR = Float32Array.from(R);
  let gTot = db(M.lufs - integrated(blockPower(L, R))), I = 0, lim = 0, grReport = [];
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < N; i++) { L[i] = keepL[i] * gTot; R[i] = keepR[i] * gTot; }
    const preL = Float32Array.from(L);
    lim = limit(L, R, db(M.ceiling));
    grReport = [];
    for (let sec = 0; sec < Math.floor(N / SR); sec++) {
      let m = 1; for (let i = sec * SR; i < (sec + 1) * SR; i++) { const a = Math.abs(preL[i]); if (a > 1e-4) { const g = Math.abs(L[i]) / a; if (g < m) m = g; } }
      if (m < db(-1.5)) grReport.push([sec, +(20 * Math.log10(m)).toFixed(1)]);
    }
    I = integrated(blockPower(L, R));
    log(`iter ${it}: I ${I.toFixed(2)} LUFS, limiter max GR ${(-lim).toFixed(2)} dB`);
    if (Math.abs(I - M.lufs) < 0.03) break;
    gTot *= db(M.lufs - I);
  }
  for (let i = Math.round(fadeB * SR); i < N; i++) { L[i] = 0; R[i] = 0; }

  const stemOut = {};
  for (const s of stems) {                                  // dry stems with the same trims and master gain (no glue/limiter)
    const st = mx.stems[s]; if (!st) continue;
    const g = pre * gTot;
    for (let i = 0; i < N; i++) { st[0][i] *= curve[i] * g; st[1][i] *= curve[i] * g; }
    stemOut[s] = st;
  }
  const onsets = {
    kick: (events.kick || []).map(e => e.t),
    boom: (events.fx || []).filter(e => e.type === 'boom').map(e => e.t),
  };
  return {
    L, R, N, grid, counts, onsets, stems: stemOut,
    report: { target: { lufs: M.lufs, ceiling: M.ceiling }, integrated: I, limiterMaxGR: -lim, limiterOver1_5dB: grReport, glueMaxGR: glueGR,
      trims: segs.filter(s => s.k != null).map(s => ({ bar: s.k, target: s.target, measured: s.meas, trim: s.trim })), fadeOut: [fadeA, fadeB] },
  };
}
