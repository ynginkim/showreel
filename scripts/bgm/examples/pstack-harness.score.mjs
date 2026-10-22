// pstack-harness BGM (approved): 300.12 s minimal motorik electronic bed in A major, composed for the Korean explainer
// "pstack으로 살펴본 하네스 엔지니어링". Ported from the project-local version to the bgm/ library API.
// REGRESSION: rendering this file with bgm/render.mjs must reproduce the approved music_synth.wav sample for sample, so the
// arithmetic below is kept exactly as it was (do not "tidy" expressions, evaluation order matters for float sums).
//
// Grid (fixed by the already-rendered picture): beat n at 0.1 + n*0.499751 s; bar k (4/4) starts on beat 3+4k (beats 0-2 = pickup).
// Picture anchors on downbeats: stroke groups of the "하네스" lettering at bars 139-142, the LOCK at bar 143 (287.457 s).

export const title = 'pstack-harness';
export const seed = 'pstack-harness';          // PRNG namespace: changing it changes every random choice
export const key = 'A major';
export const grid = { beat: 0.499751, t0: 0.1, beatsPerBar: 4, firstDownbeat: 3 };
export const duration = 300.12;

// narration-free windows (from the finished timeline); the music may lift a little inside them
export const gaps = [[24.72, 29.92], [50.18, 52.2], [74.87, 76.07], [102.3, 103.7], [127.9, 129.3], [140.49, 144.1],
  [201.06, 202.26], [220.33, 224.1], [256.1, 260.1], [277.02, 300.2]];

const SECTIONS = [
  { id: 'board', k: -0.75, name: 'Departure Board', e: 0.30 },
  { id: 'title', k: 7, name: 'Title', e: 0.50 },
  { id: 'problem', k: 14, name: 'Problem', e: 0.40 },
  { id: 'mapdraw', k: 25, name: 'Map: line straightens', e: 0.48 },
  { id: 'map', k: 31, name: 'Map Builds', e: 0.60 },
  { id: 'routing', k: 55, name: 'Routing', e: 0.72 },
  { id: 'front', k: 71, name: 'Front Door', e: 0.80 },
  { id: 'breath', k: 87, name: 'Breath', e: 0.35 },
  { id: 'ticket', k: 95, name: 'Ticket and Switch', e: 0.65 },
  { id: 'words', k: 111, name: 'Your Words', e: 0.60 },
  { id: 'blue', k: 123, name: 'Blueprint', e: 0.50 },
  { id: 'summary', k: 129, name: 'Summary', e: 0.55 },
  { id: 'build', k: 138, name: 'Finale build', e: 0.75 },
  { id: 'lock', k: 143, name: 'LOCK', e: 0.85 },
  { id: 'end', k: 144, name: 'End card', e: 0.40 },
];
const secAt = k => { let s = SECTIONS[0]; for (const x of SECTIONS) if (k >= x.k - 1e-9) s = x; return s; };
export const sections = SECTIONS.map(s => ({ bar: s.k, name: s.name, energy: s.e, id: s.id }));

// declared accents -> analysis.json hits (with the section starts) and verify.py's hit checks
export const accents = [
  { bar: 7, name: 'Title: one warm hit', strength: 0.6 },
  { bar: 31, name: 'Map Builds: kick and bass enter', strength: 0.5 },
  { bar: 71, name: 'Front Door: zoom-through lands', strength: 0.5 },
  { bar: 87, name: 'Breath: landing thump', strength: 0.3 },
  { bar: 139, name: 'Stroke group 1', strength: 0.6 }, { bar: 140, name: 'Stroke group 2', strength: 0.65 },
  { bar: 141, name: 'Stroke group 3', strength: 0.7 }, { bar: 142, name: 'Stroke group 4', strength: 0.75 },
  { bar: 143, name: 'LOCK', strength: 1 },
  { bar: 146, name: 'Final chord + soft bell', strength: 0.4 },
];

// loudness shape (LU relative; render.mjs calibrates the mix to it, then normalises to -13 LUFS)
const LEVELS = [[-0.75, -9.6], [7, -6.3], [14, -8.0], [25, -6.8], [31, -5.0], [43, -4.2], [55, -2.8], [71, -1.8], [87, -9.0],
  [95, -3.6], [111, -4.5], [123, -6.3], [129, -5.7], [133, -4.7], [138, -6.0], [139, -4.9], [140, -3.9], [141, -3.0], [142, -2.2],
  [143, 2.6], [144, -1.6], [145, -3.8]];
export const levels = { points: LEVELS, end: 146 };

// stem balance and master: the values the approved render used (same as the library defaults, spelled out)
export const mix = { pad: 0.55, bass: 0.42, kick: 0.5, tick: 0.11, pluck: 0.15, arp: 0.075, glass: 0.045, bell: 0.075, piano: 0.17, fx: 1.0 };
export const master = { lufs: -13.0, ceiling: -1.35, fadeIn: 0.06, fadeOut: [298.3, 299.9] };

// ---------------- harmony ----------------
const CH = {
  'A': [33, [52, 57, 61, 64]], 'Aadd9': [33, [57, 59, 61, 64]], 'Asus2': [33, [52, 57, 59, 64]], 'A/C#': [37, [52, 57, 61, 64]],
  'C#m7/G#': [32, [52, 56, 59, 61]], 'C#m7': [37, [52, 56, 59, 61]], 'Dmaj9': [38, [54, 57, 61, 64]], 'Dmaj9/A': [33, [54, 57, 61, 64]],
  'E': [40, [52, 56, 59, 64]], 'E/G#': [32, [52, 59, 64, 68]], 'E/A': [33, [52, 56, 59, 64]], 'E/D': [38, [52, 56, 59, 64]],
  'Esus4': [40, [52, 57, 59, 64]], 'F#m7': [30, [52, 57, 61, 66]], 'F#m9': [30, [57, 61, 64, 68]], 'Bm7': [35, [54, 57, 59, 62]],
  'Bm9': [35, [54, 57, 61, 62]], 'Bm11': [35, [52, 57, 59, 62]], 'Bm/A': [33, [54, 59, 62, 66]],
  // finale: the bass climbs B-D-E-F#-G#-A and the pad's top voice climbs with it, one step per stroke-group downbeat
  'Bm7*': [35, [54, 57, 59, 62]], 'Dmaj9*': [38, [57, 61, 64, 66]], 'E*': [40, [56, 59, 64, 68]], 'F#m7*': [42, [57, 61, 64, 69]],
  'E/G#*': [44, [59, 64, 68, 71]], 'LOCK': [45, [52, 57, 61, 64, 69, 73]], 'A~': [33, [52, 57, 61, 64, 69]], 'FINAL': [33, [52, 57, 61, 64, 71]],
};
const PROG = [
  [-0.75, 'Asus2'], [2, 'Dmaj9/A'], [4, 'Asus2'], [5, 'Aadd9'], [6, 'E/A'],                                       // board
  [7, 'A'], [8, 'C#m7/G#'], [9, 'F#m7'], [10, 'Dmaj9'], [12, 'Bm11'], [13, 'Esus4'], [13.5, 'E'],                  // title
  [14, 'F#m9'], [16, 'Dmaj9'], [18, 'Bm11'], [20, 'C#m7'], [21, 'Dmaj9'], [22, 'Bm11'], [23, 'Esus4'],              // problem
  [25, 'A'], [26, 'A/C#'], [27, 'Dmaj9'], [29, 'Bm7'], [30, 'Esus4'], [30.5, 'E'],                                  // line straightens
  [31, 'A'], [33, 'E/G#'], [35, 'F#m7'], [37, 'Dmaj9'], [38, 'Esus4'], [38.5, 'E'],                                 // map builds
  [39, 'Dmaj9'], [40, 'A/C#'], [41, 'Bm7'], [42, 'E'], [43, 'Dmaj9'], [44, 'A/C#'], [45, 'Bm7'], [46, 'Esus4'], [46.5, 'E'],
  [47, 'F#m7'], [48, 'C#m7'], [49, 'Dmaj9'], [50, 'A'], [51, 'Bm7'], [52, 'Dmaj9'], [53, 'Esus4'], [54, 'E'],
  [55, 'Dmaj9'], [57, 'A/C#'], [59, 'Bm7'], [61, 'E'], [63, 'F#m7'], [64, 'Dmaj9'], [65, 'A'], [66, 'E/G#'],       // routing
  [67, 'F#m7'], [68, 'Dmaj9'], [69, 'Esus4'], [70, 'E'],
  [71, 'A'], [72, 'Bm/A'], [73, 'Dmaj9/A'], [74, 'A'], [76, 'Bm/A'], [77, 'Dmaj9/A'], [78, 'E/A'],                   // front door (A pedal)
  [79, 'F#m7'], [81, 'Dmaj9'], [83, 'Bm7'], [84, 'C#m7'], [85, 'Dmaj9'], [86, 'Esus4'],
  [87, 'Dmaj9'], [89, 'A/C#'], [91, 'Bm11'], [93, 'Esus4'], [94, 'E'],                                              // breath
  [95, 'F#m7'], [97, 'Dmaj9'], [99, 'A'], [101, 'E'], [103, 'Bm7'], [104, 'Dmaj9'], [105, 'F#m7'], [106, 'E/G#'],    // ticket & switch
  [107, 'A'], [108, 'Dmaj9'], [109, 'Esus4'], [110, 'E'],
  [111, 'Dmaj9'], [112, 'C#m7'], [113, 'Bm9'], [114, 'A/C#'], [115, 'Dmaj9'], [116, 'E/D'], [117, 'C#m7'], [118, 'F#m9'], // your words
  [119, 'Bm9'], [120, 'Dmaj9'], [121, 'Esus4'], [122, 'E'],
  [123, 'A'], [124, 'E/G#'], [125, 'F#m7'], [126, 'Dmaj9'], [127, 'Bm7'], [128, 'Esus4'],                           // blueprint
  [129, 'A'], [130, 'A/C#'], [131, 'Dmaj9'], [132, 'E'], [133, 'F#m7'], [134, 'Dmaj9'], [135, 'A/C#'], [136, 'E/G#'], [137, 'F#m7'],
  [138, 'Bm7*'], [139, 'Dmaj9*'], [140, 'E*'], [141, 'F#m7*'], [142, 'E/G#*'], [143, 'LOCK'], [144, 'A~'], [145, 'Dmaj9/A'], [146, 'FINAL'],
];

export function compose(bgm) {
  const { makeRng, smooth, clamp } = bgm;
  const BEAT = bgm.BEAT, S16 = bgm.S16, S32 = bgm.S32;
  const tb = bgm.beat, tbar = bgm.bar, table = bgm.table;
  const LOCK_T = tbar(143);                       // 287.457, the LOCK
  const GAPS = gaps;
  function lift(t) {                              // 0 under narration, 1 inside a gap (finale handled by its own tables)
    if (t >= tbar(138)) return 0;
    let g = 0;
    for (const [a, b] of GAPS) {
      if (t <= a || t >= b) continue;
      g = Math.max(g, Math.min(smooth((t - a - 0.05) / 0.6), smooth((b - 0.14 - t) / 0.45)));
    }
    return g;
  }

  // piecewise-constant tables keyed by bar, with a log glide of `g` bars after each change
  const padBase = table([[-0.75, 430], [7, 640], [14, 560], [25, 640], [31, 720], [47, 820], [55, 900], [71, 980], [87, 560], [95, 800],
    [111, 740], [123, 640], [129, 700], [133, 780], [138, 900, 1], [139, 1250, 0.1], [140, 1700, 0.1], [141, 2300, 0.1], [142, 3000, 0.1],
    [143, 4200, 0.05], [144, 2300, 1], [145, 1500, 1], [146, 1250, 2], [148, 600, 2]]);
  const padCut = t => padBase(t) * (1 + 1.0 * lift(t)) * (1 + 0.07 * Math.sin(2 * Math.PI * t / 15.99));
  const arpBase = table([[31, 600], [39, 620], [47, 700], [55, 800], [63, 860], [71, 900], [87, 600], [95, 760], [111, 700], [129, 640],
    [133, 680], [138, 700, 0.1], [139, 950, 0.1], [140, 1350, 0.1], [141, 1900, 0.1], [142, 2600, 0.1], [143, 3600, 0.05], [144, 1800, 1]]);
  const arpCut = t => arpBase(t) * (1 + 1.3 * lift(t));

  const prog = bgm.progression(PROG, CH, { end: 150.5, fromZero: true });
  const chordTimeline = () => prog.list;

  function buildScore() {
    const chords = chordTimeline();
    const chordAt = k => { let c = chords[0]; for (const x of chords) if (k >= x.k0 - 1e-9) c = x; return c; };
    const E = { pad: [], bass: [], kick: [], tick: [], pluck: [], arp: [], glass: [], bell: [], piano: [], fx: [] };
    const T = (k, b) => tbar(k, b);
    const tick = (t, type, vel, pan = 0, x = {}) => E.tick.push({ t, type, vel, pan, gain: 1, ...x });

    // ===== PAD (one block per chord; section decides attack/release/timbre) =====
    for (const c of chords) {
      const s = secAt(c.k0);
      let att = 0.6, rel = 1.3, gain = 0.9, kind = 'warm';
      switch (s.id) {
        case 'board': att = c.k0 < 0 ? 1.5 : 0.9; rel = 1.6; gain = 0.75; break;
        case 'title': att = c.k0 === 7 ? 0.05 : 0.5; rel = 1.4; gain = 0.85; break;
        case 'problem': att = 0.9; rel = 1.6; gain = 0.6; kind = 'soft'; break;
        case 'mapdraw': att = 0.5; gain = 0.75; break;
        case 'map': att = 0.35; gain = 0.8; break;
        case 'routing': att = 0.3; gain = 0.82; break;
        case 'front': att = 0.25; gain = 0.85; kind = 'full'; break;
        case 'breath': att = 1.1; rel = 2.2; gain = 0.7; kind = 'soft'; break;
        case 'ticket': att = 0.3; gain = 0.75; break;
        case 'words': att = 0.6; rel = 1.6; gain = 0.85; kind = 'soft'; break;
        case 'blue': att = 0.9; rel = 1.8; gain = 0.6; kind = 'soft'; break;
        case 'summary': att = 0.5; gain = 0.72; break;
        case 'build': att = c.k0 === 138 ? 0.8 : 0.03; rel = 0.5; gain = 0.85; kind = 'full'; break;
        case 'lock': att = 0.035; rel = 1.1; gain = 1.0; kind = 'full'; break;
        case 'end': att = c.name === 'A~' ? 0.35 : 0.9; rel = c.name === 'FINAL' ? 3.6 : 1.4; gain = c.name === 'FINAL' ? 0.8 : 0.85; break;
      }
      const t1 = c.name === 'FINAL' ? T(147) : c.t1;      // final chord held one bar, then a 3.6 s release (-60 dB by ~299.1)
      E.pad.push({ t0: c.t0, t1, notes: c.pad, att, rel, gain, kind });
    }
    // the Bm7 pre-roll pad swells up (reverse-envelope) into the first stroke group
    E.pad.push({ t0: T(138), t1: T(139) - 0.03, notes: [66, 69, 71, 74], att: T(139) - T(138) - 0.05, rel: 0.04, gain: 0.55, kind: 'soft', swell: 1, cutMul: 1.2 });
    // the pre-roll into the line straightening (string pulled taut at 50.95)
    E.pad.push({ t0: 50.3, t1: T(25) - 0.02, notes: [64, 68, 71], att: T(25) - 50.32, rel: 0.05, gain: 0.5, kind: 'soft', swell: 1 });
    // air pad: high, high-passed shimmer only where nobody speaks
    const air = (t0, t1, notes, gain, att = 0.8, rel = 1.5) => E.pad.push({ t0, t1, notes, att, rel, gain, kind: 'soft', hp: 900, cutMul: 3.2, sends: { hall: 0.6 } });
    air(25.0, T(14) - 0.2, [69, 73, 76], 0.45);
    air(141.0, T(71) - 0.3, [71, 76, 80], 0.45);
    air(220.6, T(111) - 0.3, [71, 76, 80], 0.42);
    air(256.4, T(129) + 0.2, [69, 73, 76], 0.42);
    air(T(139), T(143), [73, 76, 81], 0.38, 6, 0.3);
    air(T(143), T(146), [76, 81, 85], 0.5, 0.05, 2.5);

    // ===== BASS =====
    const B = (t, dur, midi, vel, style, gain = 1) => E.bass.push({ t, dur, midi, vel, style, gain });
    const motorBar = (k, root, style, vel, pat = 'straight') => {
      for (let i = 0; i < 8; i++) {
        let m = root, v = vel * (i % 2 === 0 ? 1 : 0.82);
        if (pat === 'oct' && (i === 3 || i === 7)) m = root + 12;
        if (pat === 'octC' && (i === 2 || i === 5 || i === 7)) m = root + 12;
        if (pat === 'train' && (i === 2 || i === 6)) m = root + 7;
        if (pat === 'train' && i === 4) m = root + 12;
        if (pat === 'sync' && (i === 3 || i === 6)) continue;
        B(T(k, i / 2), BEAT / 2 * 0.72, m, v, style);
      }
    };
    for (let k = -1; k < 150; k++) {
      const s = secAt(k), c = chordAt(k), root = c.bass, mid = chordAt(k + 0.5);
      switch (s.id) {
        case 'board': if (k === 0 || k === 2 || k === 4) B(T(k), BEAT * 8 - 0.1, root, 0.8, 'sub', 0.5);
          if (k === 6) B(T(k), BEAT * 4 - 0.05, root, 0.8, 'sub', 0.5); break;
        case 'title':
          for (let i = 0; i < 8; i++) { const cc = chordAt(k + i / 8); B(T(k, i / 2), 0.16, cc.bass, i % 2 ? 0.6 : 0.85, 'pulse', 0.85); }
          break;
        case 'problem': {        // long notes that enter late or anticipate the next chord: hesitant
          if (k % 2 === 1) break;
          const rr = makeRng('prob-bass' + k), late = rr.pick([0, 0, 0.5, 1.5]), span = k === 24 ? 4 : 8;
          const antic = k < 23 && rr.chance(0.45);
          B(T(k, late), BEAT * (span - late - (antic ? 0.6 : 0)) - 0.12, root, 0.75, 'round', 0.6);
          if (antic) B(T(k, 7.5), BEAT * 0.45, chordAt(k + 2).bass, 0.5, 'round', 0.55);
          break;
        }
        case 'mapdraw': for (let b = 0; b < 4; b++) B(T(k, b), BEAT * 0.8, chordAt(k + b / 4).bass, b === 0 ? 0.85 : 0.65, 'round', 0.9); break;
        case 'map': motorBar(k, root, 'motor', 0.85, k >= 47 ? 'octC' : k >= 39 ? 'oct' : 'straight');
          if (mid !== c) { /* mid-bar chord change: re-voice the second half */ E.bass.splice(-4, 4); for (let i = 4; i < 8; i++) B(T(k, i / 2), BEAT / 2 * 0.72, mid.bass, 0.8, 'motor'); }
          break;
        case 'routing': if (k === 70) { for (let i = 0; i < 4; i++) B(T(k, i / 2), BEAT / 2 * 0.72, root, 0.85, 'motor'); B(T(k, 2), BEAT * 2 - 0.05, root, 0.7, 'round'); }
          else motorBar(k, root, 'motor', 0.9, k >= 63 ? 'train' : 'straight'); break;
        case 'front': motorBar(k, root, 'drive', 0.9, k % 4 === 3 ? 'oct' : 'straight');
          if (k % 2 === 1) B(T(k, 3.75), BEAT / 4 * 0.7, root + 12, 0.6, 'drive'); break;
        case 'breath': if (k % 2 === 1) B(T(k), BEAT * 8 - 0.1, root, 0.75, 'sub', 0.6); break;
        case 'ticket': motorBar(k, root, 'motor', 0.85, k >= 103 ? 'oct' : 'sync'); break;
        case 'words': B(T(k), BEAT * 1.9, root, 0.8, 'round'); B(T(k, 2), BEAT * 1.9, root, 0.7, 'round'); break;
        case 'blue': if (k === 123 || k === 125) B(T(k), BEAT * 8 - 0.1, root, 0.75, 'sub', 0.65);
          if (k === 127 || k === 128) B(T(k), BEAT * 4 - 0.1, root, 0.75, 'sub', 0.65); break;
        case 'summary': if (k < 133) { B(T(k), BEAT * 1.9, root, 0.75, 'round'); B(T(k, 2), BEAT * 1.9, root, 0.65, 'round'); }
          else motorBar(k, root, 'motor', 0.6 + 0.06 * (k - 133), 'straight'); break;
        case 'build':
          if (k === 138) B(T(k), BEAT * 4 - 0.05, root, 0.7, 'round');
          else { motorBar(k, root, 'motor', 0.8 + 0.05 * (k - 139), k >= 141 ? 'oct' : 'straight');
            if (k === 142) { E.bass.splice(-2, 2); for (let i = 0; i < 4; i++) B(T(k, 3 + i / 4), BEAT / 4 * 0.7, root + (i % 2 ? 12 : 0), 0.9, 'drive'); } }
          break;
        case 'lock': motorBar(k, 45, 'drive', 1.0, 'oct'); break;
        case 'end': if (k === 144) B(T(k), BEAT * 8 - 0.1, 33, 0.8, 'sub'); if (k === 146) B(T(k), BEAT * 6, 33, 0.75, 'sub'); break;
      }
    }

    // ===== KICK =====
    const K = (t, vel, kind = 'norm') => E.kick.push({ t, vel, kind, gain: 1 });
    for (let k = 31; k < 145; k++) {
      const s = secAt(k);
      if (['map', 'routing', 'front', 'ticket'].includes(s.id)) {
        for (let b = 0; b < 4; b++) {
          if (k === 70 && b >= 2) continue;                      // zoom-through: the floor drops out under the riser
          if ((k === 38 || k === 46 || k === 54) && b === 3) { K(T(k, 3), 0.7); K(T(k, 3.5), 0.55); continue; }
          K(T(k, b), b === 0 ? 1 : 0.84, s.id === 'ticket' ? 'soft' : 'norm');
        }
        if (s.id === 'front' && k % 4 === 2) K(T(k, 3.75), 0.45);
      } else if (s.id === 'words') { K(T(k), 0.7, 'soft'); K(T(k, 2), 0.6, 'soft'); }
      else if (s.id === 'summary' && k >= 133) { const v = 0.55 + 0.05 * (k - 133); for (let b = 0; b < 4; b++) if (k >= 135 || b % 2 === 0) K(T(k, b), b ? v * 0.85 : v, 'soft'); }
      else if (s.id === 'build' && k >= 139) {
        const v = 0.8 + 0.06 * (k - 139);
        for (let b = 0; b < 4; b++) K(T(k, b), b ? v * 0.86 : v);
        if (k === 142) { K(T(k, 2.5), 0.6); K(T(k, 3.5), 0.7); }
      } else if (s.id === 'lock') { for (let b = 0; b < 4; b++) K(T(k, b), b ? 0.85 : 0.95); }
    }
    K(T(87), 0.6, 'soft');                                      // breath: one soft landing thump, then the floor is gone
    K(T(144), 0.7, 'soft');                                     // end card: last footfall

    // ===== TICKS / MECHANICS =====
    const rt = makeRng('ticks');
    const clatter = (t, n, vel) => {                             // split-flap card run on the 32nd grid, last card settles harder
      for (let i = 0; i < n; i++) tick(t + i * S32, 'flap', vel * (i === n - 1 ? 1.25 : rt.range(0.55, 0.9)), rt.range(-0.5, 0.5), { var: rt() });
    };
    for (let n = 0; n < 31; n++) tick(tb(n), 'clock', (n - 3) % 4 === 0 ? 0.9 : 0.62, 0.15, { alt: n % 2 });   // the station clock
    const boardRuns = [[-0.75, 2, 4], [0, 1, 6], [1, 2.5, 5], [2, 0.5, 7], [3, 1.5, 5], [3, 3, 4], [4, 0.25, 8], [5, 1, 6], [5, 2.75, 5], [6, 0.5, 9], [6, 2.5, 6]];
    for (const [k, b, n] of boardRuns) clatter(k < 0 ? tb(1) : T(k, b), n, 0.75);
    for (let k = 7; k < 14; k++) {                               // title: the clock becomes a soft 16th pulse
      for (let i = 0; i < 16; i++) tick(T(k, i / 4), 'clock', i % 4 === 0 ? 0.6 : i % 2 === 0 ? 0.42 : 0.26, i % 2 ? 0.3 : -0.2, { alt: i % 2 });
      if (k % 2 === 1 || k >= 12) clatter(T(k, rt.pick([1, 1.5, 2.5])), rt.int(4, 7), k >= 12 ? 0.75 : 0.55);
    }
    for (let k = 14; k < 25; k++) {                              // problem: a red pencil taps, unevenly
      const n = rt.int(1, 3);
      for (let j = 0; j < n; j++) tick(T(k, rt.int(0, 15) / 4) + rt.range(-0.012, 0.012), 'pencil', rt.range(0.5, 0.85), rt.range(-0.4, 0.4));
    }
    for (let k = 25; k < 31; k++) for (let i = 0; i < 8; i++) tick(T(k, i / 2), 'clock', i % 2 ? 0.34 : 0.5, 0.2, { alt: i % 2 });
    const hats = (k, mode, vel) => {
      for (let i = 0; i < 16; i++) {
        const off8 = i % 4 === 2, on8 = i % 4 === 0;
        if (mode === 'off8' && !off8) continue;
        if (mode === '16') { const v = off8 ? vel : on8 ? vel * 0.55 : vel * 0.38; tick(T(k, i / 4), 'hat', v, i % 2 ? 0.25 : -0.15); continue; }
        if (mode === 'click16') { const v = off8 ? vel : (i % 4 === 1 || i % 4 === 3) ? vel * (k % 2 ? 0.7 : 0.5) : vel * 0.35; tick(T(k, i / 4), 'hat', v, i % 2 ? 0.35 : -0.25); continue; }
        tick(T(k, i / 4), 'hat', vel, 0.1);
      }
    };
    const roll = (k, b0, b1, v0, v1, type = 'hat', step = S16) => {
      const t0 = T(k, b0), t1 = T(k, b1), n = Math.round((t1 - t0) / step);
      for (let i = 0; i < n; i++) tick(t0 + i * step, type, v0 + (v1 - v0) * i / n, (i % 2 ? 0.3 : -0.3));
    };
    for (let k = 31; k < 55; k++) {
      hats(k, k >= 47 ? '16' : 'off8', k >= 47 ? 0.6 : 0.55);
      if (k >= 39 && k < 47) for (let i = 1; i < 16; i += 2) tick(T(k, i / 4), 'clock', 0.22, 0.4, { alt: 1 });
      if (k === 38 || k === 46 || k === 54) roll(k, 3, 4, 0.25, 0.7, 'clock');
    }
    for (let k = 55; k < 71; k++) {
      if (k === 70) { hats(k, 'off8', 0.5); continue; }
      hats(k, '16', 0.62);
      tick(T(k, 1), 'clock', 0.55, -0.35); tick(T(k, 3), 'clock', 0.55, -0.35);
      if (k % 4 === 2 && k > 62) roll(k, 3.5, 4, 0.3, 0.6, 'clock', S32);
    }
    const rs = makeRng('stepper');
    for (let k = 71; k < 87; k++) {                              // thermal printer: print-head runs on 32nds, paper feed thunks
      hats(k, 'off8', 0.45);
      tick(T(k, 1), 'clock', 0.5, 0.35); tick(T(k, 3), 'clock', 0.5, 0.35);
      const runs = rs.pick([[[0, 7], [2, 6]], [[0.5, 6], [2.5, 6]], [[0, 12]], [[1, 5], [2, 5], [3, 3]]]);
      for (const [b, n] of runs) for (let i = 0; i < n; i++) tick(T(k, b) + i * S32, 'step', 0.42 + 0.3 * (i % 2 === 0) + 0.1 * rs(), rs.range(-0.2, 0.4));
      tick(T(k, k % 2 ? 3.5 : 1.5), 'feed', 0.7, 0);
    }
    for (let k = 87; k < 95; k++) for (let i = 0; i < 8; i++) tick(T(k, i / 2), 'clock', i % 2 ? 0.3 : 0.46, 0.2, { alt: i % 2 });
    for (let k = 95; k < 111; k++) {                             // switch yard: clicky 16ths, lever detents and throws
      hats(k, 'click16', 0.58);
      if (k % 2 === 1) { for (let i = 0; i < 3; i++) tick(T(k, 3) + i * S32, 'ratchet', 0.55 + 0.1 * i, 0.3); tick(T(k, 3.5), 'clunk', 0.8, 0.1); }
      if (k % 4 === 2) { tick(T(k, 1.5), 'ratchet', 0.5, -0.3); tick(T(k, 1.75), 'clunk', 0.6, -0.1); }
      if (k === 110) roll(k, 2, 4, 0.2, 0.65, 'clock', S32);
    }
    for (let k = 111; k < 123; k++) {                            // your words: the pencil again, now on the grid
      hats(k, 'off8', 0.34);
      tick(T(k, 0.75), 'pencil', 0.6, -0.3); tick(T(k, 2.75), 'pencil', 0.5, 0.3);
    }
    for (let k = 123; k < 138; k++) {
      for (let i = 0; i < 8; i++) tick(T(k, i / 2), 'clock', i % 2 ? 0.28 : 0.42, 0.2, { alt: i % 2 });
      if (k >= 133) hats(k, k >= 135 ? '16' : 'off8', 0.35 + 0.04 * (k - 133));
    }
    roll(138, 0, 4, 0.12, 0.55, 'clock');                       // finale pre-roll
    for (let k = 139; k < 143; k++) { hats(k, '16', 0.55 + 0.05 * (k - 139)); if (k >= 140) tick(T(k, 1), 'clock', 0.5, -0.3), tick(T(k, 3), 'clock', 0.5, -0.3); }
    roll(142, 2, 3.5, 0.3, 0.85, 'hat', S32);
    for (let i = 0; i < 16; i++) tick(T(143, i / 4), 'hat', i % 4 === 2 ? 0.75 : 0.4, i % 2 ? 0.3 : -0.3, { open: i % 4 === 2 });
    for (let n = 0; n < 8; n++) tick(T(144, n), 'clock', 0.6 - 0.06 * n, 0.15, { alt: n % 2 });   // the station clock returns
    clatter(T(145, 1), 6, 0.45); clatter(T(145, 3), 4, 0.35);
    tick(T(146), 'flap', 0.55, 0);                               // the board settles on the final chord

    // ===== PLUCKS =====
    const P = (t, midi, vel, x = {}) => E.pluck.push({ t, midi, vel, gain: 1, ...x });
    const tonesOf = (c, lo, hi) => { const out = []; for (const m of c.pad) for (const o of [0, 12, 24]) if (m + o >= lo && m + o <= hi) out.push(m + o); return [...new Set(out)].sort((a, b) => a - b); };
    { // problem: syncopated, swung, humanised, hesitant (drops, stutters, late notes)
      const rp = makeRng('problem-pluck'), pats = [[0, 3, 6, 10, 13], [2, 5, 8, 11, 14], [0, 3, 7, 9], [1, 4, 6, 12, 15], [0, 2, 6, 11], [3, 6, 10], [0, 3, 6, 9, 12]];
      let idx = 2, last = -1;
      for (let k = 14; k < 25; k++) {
        let pi; do pi = rp.int(0, pats.length - 1); while (pi === last); last = pi;
        const pat = k === 24 ? [0, 3, 6] : pats[pi];
        for (const pos of pat) {
          if (k !== 24 && rp.chance(0.13)) continue;
          const c = chordAt(k + pos / 16), tones = tonesOf(c, 64, 78);
          idx = clamp(idx + rp.pick([-1, -1, 0, 1, 1, 2, -2]), 0, tones.length - 1);
          let t = T(k, pos / 4) + (pos % 2 ? 0.19 * S16 : 0) + clamp(rp.gauss() * 0.008, -0.018, 0.018);
          if (rp.chance(0.1)) t += S16 * 0.5;
          const v = (pos === 0 ? 0.85 : rp.range(0.45, 0.8)) * (k === 24 ? 0.8 : 1);
          P(t, tones[idx], v, { dec: 0.34, bright: 0.42, pan: rp.range(-0.35, 0.35) });
          if (rp.chance(0.12)) P(t + S32 + rp.range(0, 0.01), tones[idx], v * 0.55, { dec: 0.25, bright: 0.38, pan: rp.range(-0.35, 0.35) });
        }
      }
    }
    for (let k = 25; k < 39; k++) {                              // the line straightens: even 8ths walking the chord
      const c0 = chordAt(k), tones = tonesOf(c0, 64, 79), seq = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let i = 0; i < 8; i++) {
        const c = chordAt(k + i / 8), tn = tonesOf(c, 64, 79);
        const v = (k < 31 ? 0.62 : 0.48 - 0.02 * (k - 31)) * (i % 2 ? 0.8 : 1);
        if (v > 0.1) P(T(k, i / 2), tn[Math.min(seq[i], tn.length - 1)] ?? tones[0], v, { dec: 0.3, bright: 0.45, pan: i % 2 ? 0.25 : -0.25 });
      }
    }
    for (let k = 111; k < 123; k++) {                            // your words: the problem motif, quantised and repeated (structure holds)
      const c = chordAt(k), tn = tonesOf(c, 64, 79), contour = [3, 1, 0, 2, 3, 1];
      [0, 3, 6, 8, 11, 14].forEach((pos, j) => P(T(k, pos / 4), tn[Math.min(contour[j], tn.length - 1)], j === 0 ? 0.75 : 0.6, { dec: 0.36, bright: 0.45, pan: j % 2 ? 0.3 : -0.3 }));
    }

    // ===== ARP (motorik synth) and GLASS (FM second layer) =====
    const A = (t, midi, vel, x = {}) => E.arp.push({ t, midi, vel, gain: 1, cut: 800, envAmt: 2.2, dec: 0.12, sq: 0.3, ...x });
    const arpBar = (k, rate, octave, vel, shape, dec, sq = 0.3) => {
      const steps = rate === 16 ? 16 : 8;
      for (let i = 0; i < steps; i++) {
        const b = i * 4 / steps, t = T(k, b), c = chordAt(k + b / 4), tn = c.pad.map(m => m + octave);
        const order = shape === 'up' ? [0, 1, 2, 3] : shape === 'updown' ? [0, 1, 2, 3, 2, 1] : shape === '332' ? [0, 2, 1, 3, 1, 2, 0, 3] : [0, 2, 1, 3];
        const m = tn[order[i % order.length] % tn.length];
        const acc = rate === 16 ? (shape === '332' ? ([0, 3, 6].includes(i % 8) ? 1 : 0.6) : (i % 4 === 0 ? 1 : 0.65)) : (i % 2 === 0 ? 1 : 0.75);
        A(t, m, vel * acc, { cut: arpCut(t), dec, sq, pan: i % 2 ? 0.3 : -0.3 });
      }
    };
    for (let k = 39; k < 47; k++) arpBar(k, 8, 0, 0.8, 'updown', 0.16);
    for (let k = 47; k < 55; k++) arpBar(k, 16, 0, 0.75, 'up', 0.11);
    for (let k = 55; k < 70; k++) arpBar(k, 16, 0, 0.78, k % 4 < 2 ? 'up' : 'updown', 0.1);
    arpBar(70, 8, 0, 0.7, 'up', 0.16);
    for (let k = 71; k < 87; k++) arpBar(k, 16, 0, 0.72, '332', 0.085, 0.55);
    for (let k = 95; k < 111; k++) {
      for (const pos of [0, 2, 3, 6, 8, 10, 11, 14]) {
        const t = T(k, pos / 4), c = chordAt(k + pos / 16), m = c.pad[(pos / 2 | 0) % c.pad.length];
        A(t, m, pos % 4 === 0 ? 0.8 : 0.6, { cut: arpCut(t), dec: 0.1, sq: 0.45, pan: pos % 3 ? 0.3 : -0.3 });
      }
    }
    for (let k = 133; k < 138; k++) arpBar(k, 8, 0, 0.5 + 0.06 * (k - 133), 'up', 0.13);
    for (let k = 138; k < 143; k++) arpBar(k, 16, k >= 141 ? 12 : 0, 0.55 + 0.1 * (k - 138), 'up', 0.1 + 0.01 * (k - 138));
    arpBar(143, 16, 12, 0.9, 'updown', 0.14);
    const G = (t, midi, vel, x = {}) => E.glass.push({ t, midi, vel, gain: 1, ...x });
    for (let k = 55; k < 71; k++) {                              // dotted-8th cross-rhythm against the four-on-the-floor
      for (const [j, pos] of [0, 3, 6, 9, 12].entries()) {
        const t = T(k, pos / 4), c = chordAt(k + pos / 16), tn = c.pad.map(m => m + 24), l = lift(t);
        G(t, tn[(j + k) % tn.length], (0.5 + 0.5 * l) * (j === 0 ? 1 : 0.75), { dec: 0.45, ratio: 2, index: 1.3, pan: j % 2 ? 0.55 : -0.55 });
      }
    }
    for (let k = 140; k < 144; k++) for (const [j, pos] of [0, 3, 6, 9, 12].entries()) {
      const c = chordAt(k + pos / 16), tn = c.pad.map(m => m + 24);
      G(T(k, pos / 4), tn[(j + k) % tn.length], 0.6 + 0.1 * (k - 140), { dec: 0.5, ratio: 2, index: 1.5, pan: j % 2 ? 0.55 : -0.55 });
    }

    // ===== BELLS (gaps, sparse accents, finale strokes, final chord) =====
    const BL = (t, midi, vel, x = {}) => E.bell.push({ t, midi, vel, gain: 1, ...x });
    [[12, 0, 85], [12, 1.5, 88], [12, 3, 83], [13, 0, 81], [13, 2, 88]].forEach(([k, b, m], i) => BL(T(k, b), m, i === 0 ? 0.8 : 0.6, { pan: i % 2 ? 0.4 : -0.4 }));
    BL(T(37), 81, 0.7, { pan: -0.3 }); BL(T(37), 88, 0.5, { pan: 0.3 });          // gap 74.9-76.1
    BL(T(51), 83, 0.7, { pan: 0.3 }); BL(T(51, 0.5), 88, 0.45, { pan: -0.3 });   // gap 102.3-103.7
    for (let k = 55; k < 71; k += 2) BL(T(k), chordAt(k).pad[3] + 24, 0.35, { pan: k % 4 ? 0.4 : -0.4 });
    [[63, 1, 88], [63, 1.75, 85], [63, 2.5, 83]].forEach(([k, b, m]) => BL(T(k, b), m, 0.6, { pan: b === 1.75 ? -0.4 : 0.4 }));       // gap 127.9-129.3
    [[69, 2.5, 88], [69, 3, 85], [69, 3.5, 83], [70, 0, 88], [70, 0.75, 92], [70, 1.5, 89], [70, 2.25, 88]].forEach(([k, b, m], i) => BL(T(k, b), m, 0.55 + 0.04 * i, { pan: i % 2 ? 0.45 : -0.45 }));
    BL(T(87), 85, 0.45, { pan: -0.3 }); BL(T(91), 83, 0.4, { pan: 0.3 });
    BL(T(100), 85, 0.6, { pan: 0.35 }); BL(T(100, 0.75), 88, 0.45, { pan: -0.35 });   // gap 201.1-202.3
    [[109, 2, 83], [109, 2.75, 85], [109, 3.5, 88], [110, 0, 92], [110, 1, 88], [110, 2, 85], [110, 3, 83]].forEach(([k, b, m], i) => BL(T(k, b), m, 0.55, { pan: i % 2 ? 0.4 : -0.4 }));
    [[127, 2.5, 88], [128, 0, 85], [128, 1, 83], [128, 2, 81], [128, 3, 80]].forEach(([k, b, m], i) => BL(T(k, b), m, 0.5, { pan: i % 2 ? 0.4 : -0.4, dec: 2.8 }));
    [[139, 78], [140, 80], [141, 81], [142, 83]].forEach(([k, m], i) => { BL(T(k), m, 0.6 + 0.1 * i, { pan: 0 }); BL(T(k), m + 12, 0.35 + 0.08 * i, { pan: 0.3 }); });
    BL(LOCK_T, 81, 0.9); BL(LOCK_T + 0.012, 88, 0.7, { pan: -0.35 }); BL(LOCK_T + 0.024, 93, 0.5, { pan: 0.35 });
    [[143, 1, 85], [143, 1.75, 88], [143, 2.5, 85], [143, 3, 83], [144, 0, 81], [144, 1, 76]].forEach(([k, b, m], i) => BL(T(k, b), m, 0.55 - 0.04 * i, { pan: i % 2 ? 0.4 : -0.4 }));
    BL(T(146), 81, 0.55, { dec: 3.0 }); BL(T(146, 0.5), 88, 0.32, { dec: 2.6, pan: 0.3 });   // the final chord's soft bell

    // ===== FELT PIANO (blueprint, summary, final chord) =====
    const PN = (t, midi, vel, dur, x = {}) => E.piano.push({ t, midi, vel, dur, gain: 1, ...x });
    for (let k = 123; k < 129; k++) {
      const c = chordAt(k), tn = tonesOf(c, 57, 76), root = c.bass + 24;
      PN(T(k), root, 0.7, BEAT * 3.6, { pan: -0.2 });
      PN(T(k, 1), tn[1], 0.45, BEAT * 1.8, { pan: 0.15 });
      PN(T(k, 2), tn[2] ?? tn[1], 0.5, BEAT * 1.8, { pan: 0.25 });
      if (k % 2 === 0) PN(T(k, 3), tn[3] ?? tn[2], 0.4, BEAT * 0.9, { pan: -0.1 });
    }
    [[127, 2.5, 76], [127, 3, 73], [127, 3.5, 71], [128, 0, 69], [128, 1.5, 71], [128, 2, 73], [128, 3, 76]].forEach(([k, b, m]) => PN(T(k, b), m, 0.55, BEAT * 1.4));
    for (let k = 129; k < 138; k++) {
      const c = chordAt(k), tn = tonesOf(c, 57, 76);
      PN(T(k), c.bass + 24, 0.55, BEAT * 3.6, { pan: -0.2 });
      PN(T(k, 2), tn[2] ?? tn[1], 0.38, BEAT * 1.8, { pan: 0.2 });
    }
    PN(T(146), 57, 0.5, BEAT * 7); PN(T(146, 0.02), 64, 0.38, BEAT * 7, { pan: 0.2 }); PN(T(146, 0.04), 69, 0.32, BEAT * 7, { pan: -0.2 });

    // ===== FX =====
    const FX = x => E.fx.push(x);
    FX({ type: 'boom', t: T(7), midi: 33, dec: 0.9, gain: 0.6 });                                          // title: one warm hit
    FX({ type: 'stab', t: T(7), notes: [45, 52, 57, 61, 64, 69], cut0: 2600, cutEnd: 520, cutDec: 0.35, dec: 1.8, gain: 0.32 });
    FX({ type: 'air', t: 50.25, t1: T(25) + 0.4, f0: 600, f1: 5000, q: 1.2, gain: 0.05, hall: 0.4 });       // the line pulled taut
    FX({ type: 'boom', t: T(31), midi: 33, dec: 0.7, gain: 0.45 });                                         // map builds: kick+bass enter
    FX({ type: 'stab', t: T(31), notes: [45, 52, 57, 61, 64], cut0: 2000, cutEnd: 600, cutDec: 0.25, dec: 1.2, gain: 0.2 });
    FX({ type: 'riser', t: T(70, 1), t1: T(71), f0: 500, f1: 7000, q: 1.6, gain: 0.08, curve: 2.4 });       // zoom-through into the ticket slot
    FX({ type: 'boom', t: T(71), midi: 33, dec: 0.6, gain: 0.4 });
    FX({ type: 'air', t: T(86, 2), t1: T(87, 1), f0: 6000, f1: 900, q: 0.9, gain: 0.05 });                // breath: exhale
    FX({ type: 'boom', t: T(87), midi: 38, dec: 1.0, gain: 0.35 });
    FX({ type: 'air', t: T(110, 2), t1: T(111, 0.5), f0: 800, f1: 4000, q: 1.1, gain: 0.04 });
    FX({ type: 'riser', t: T(138), t1: LOCK_T, f0: 350, f1: 9000, q: 1.3, gain: 0.09, curve: 2.0, tail: 0.04 });   // finale riser
    for (const k of [139, 140, 141, 142]) FX({ type: 'boom', t: T(k), midi: [38, 40, 42, 44][k - 139], dec: 0.45, gain: 0.25 + 0.04 * (k - 139) });
    FX({ type: 'boom', t: LOCK_T + 0.004, midi: 33, dec: 1.4, gain: 0.36 });                                       // LOCK
    FX({ type: 'stab', t: LOCK_T, notes: [45, 52, 57, 61, 64, 69, 73, 76], cut0: 6500, cutEnd: 1100, cutDec: 0.7, dec: 2.0, gain: 0.42 });
    FX({ type: 'shimmer', t: LOCK_T, dec: 1.5, gain: 0.09 });
    // bass ducks under every kick it coincides with
    const kt = new Set(E.kick.map(k => Math.round(k.t * 1000)));
    for (const b of E.bass) if (kt.has(Math.round(b.t * 1000)) && b.style !== 'sub') b.duck = 0.55;
    return { E, chords };
  }

  const { E } = buildScore();
  return {
    events: E, padCut,
    // trims from `levels` arrive as g (dB); narration gaps breathe up a little, and a held breath right before the LOCK
    automation: (t, g) => {
      g += 1.6 * lift(t);
      const preT = tbar(142, 3.5);
      if (t >= preT - 0.12 && t < LOCK_T) g -= 3.5 * smooth((t - (preT - 0.12)) / 0.12);
      return g;
    },
  };
}
