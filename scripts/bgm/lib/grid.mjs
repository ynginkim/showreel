// bgm/lib/grid.mjs: the beat grid a score declares, and helpers that place things on it.
// beat n is at t0 + n * period; bar k starts on beat firstDownbeat + beatsPerBar * k (fractional k and beat offsets are fine,
// negative bars are pickup beats). Keep the arithmetic order as written: the approved renders depend on it bit for bit.
import { smooth } from './dsp.mjs';

export function makeGrid(g) {
  if (!g || (g.beat == null && g.bpm == null)) throw new Error('score.grid needs `bpm` or `beat` (seconds per beat)');
  const BEAT = g.beat != null ? g.beat : 60 / g.bpm;
  const t0 = g.t0 ?? 0, bpb = g.beatsPerBar ?? 4, fd = g.firstDownbeat ?? 0;
  const beat = n => t0 + n * BEAT;                        // time of beat n
  const bar = (k, b = 0) => beat(fd + bpb * k + b);       // time of bar k, beat b
  const barOf = t => (t - t0) / BEAT / bpb - fd / bpb;    // fractional bar index at time t
  const beatOf = t => (t - t0) / BEAT;
  const nearestDownbeat = t => bar(Math.round(barOf(t)));
  // piecewise-constant automation keyed by bar: rows [[bar, value, glideBars=0.25], ...]; after each change the value
  // glides (log-interpolated, smoothstep) from the previous row over glideBars. Use for filter cutoffs and similar.
  const table = rows => t => {
    const k = barOf(t);
    let i = 0; while (i + 1 < rows.length && k >= rows[i + 1][0]) i++;
    const [k0, v, gl = 0.25] = rows[i];
    if (i === 0 || k >= k0 + gl) return v;
    const prev = rows[i - 1][1], x = smooth((k - k0) / gl);
    return prev * Math.pow(v / prev, x);
  };
  // chord progression: rows [[bar, name], ...] + voicings { name: [bassMidi, [padMidi...]] } -> timeline and lookup.
  // opts.end = bar where the last chord ends; opts.fromZero = the first chord starts at t = 0 (covers a pickup).
  const progression = (rows, voicings, opts = {}) => {
    const end = opts.end ?? rows[rows.length - 1][0] + 4;
    const list = rows.map(([k, name], i) => {
      if (!voicings[name]) throw new Error(`progression: no voicing for chord ${name}`);
      const k1 = i + 1 < rows.length ? rows[i + 1][0] : end;
      return { k0: k, k1, t0: i === 0 && opts.fromZero ? 0 : bar(k), t1: bar(k1), name, bass: voicings[name][0], pad: voicings[name][1] };
    });
    const at = k => { let c = list[0]; for (const x of list) if (k >= x.k0 - 1e-9) c = x; return c; };
    return { list, at };
  };
  return {
    BEAT, t0, beatsPerBar: bpb, firstDownbeat: fd, bpm: 60 / BEAT, S16: BEAT / 4, S32: BEAT / 8,
    beat, bar, barOf, beatOf, nearestDownbeat, table, progression,
  };
}
