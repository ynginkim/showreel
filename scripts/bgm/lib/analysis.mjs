// bgm/lib/analysis.mjs: analysis.json in exactly the shape `music_tools.py analyze` writes
// ({file, duration, bpm, beats, downbeats, hits, energy}), but beats/downbeats come from the score's exact grid and hits
// are the declared section starts + accents, so `timeline.py --music-analysis` gets a drift-free grid.
// energy reproduces music_tools' curve: mono RMS of 2048-sample frames every 512 samples at 22.05 kHz, averaged 21 frames.
import { existsSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { SR } from './dsp.mjs';

const r3 = x => Number(x.toFixed(3));
const r2 = x => Number(x.toFixed(2));
const r1 = x => Number(x.toFixed(1));

// music_tools writes the path it was given, which in this skill is project-relative ("audio/music/music.mp3").
// Use the nearest ancestor holding project.json; else relative to cwd when inside it; else absolute.
export function projectRelative(p) {
  const abs = resolve(p);
  for (let d = dirname(abs); ; d = dirname(d)) {
    if (existsSync(resolve(d, 'project.json'))) return relative(d, abs).split(sep).join('/');
    if (dirname(d) === d) break;
  }
  const rel = relative(process.cwd(), abs);
  return rel && !rel.startsWith('..') ? rel.split(sep).join('/') : abs;
}

export function energyCurve(L, R) {
  const N = L.length, sr2 = 22050, h = 512, n = 2048, ratio = SR / sr2;
  const ps = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) { const m = Math.SQRT1_2 * (L[i] + R[i]); ps[i + 1] = ps[i] + m * m; }   // same downmix as ffmpeg -ac 1
  const n22 = Math.round(N / ratio), nF = Math.ceil((n22 + 1) / h), win = Math.round(n * ratio);
  const rms = new Float64Array(nF);
  for (let j = 0; j < nF; j++) {
    const a = Math.min(N, Math.round(j * h * ratio)), b = Math.min(N, a + win);
    rms[j] = Math.sqrt((ps[b] - ps[a]) / win);
  }
  const hop = Math.floor(0.5 * sr2 / h), out = [];
  for (let i = 0; i < nF; i += hop) {
    let s = 0, c = 0; for (let j = i; j < Math.min(nF, i + hop); j++) { s += rms[j]; c++; }
    out.push([r2(i * h / sr2), r1(20 * Math.log10(s / c + 1e-9))]);
  }
  return out;
}

export function analysisJson({ L, R, N, grid, desc, file }) {
  const dur = N / SR, beats = [], downbeats = [];
  const bpb = grid.beatsPerBar, fd = grid.firstDownbeat;
  let n = Math.ceil(-grid.t0 / grid.BEAT - 1e-9);
  for (; grid.beat(n) < dur; n++) {
    const t = grid.beat(n); if (t < 0) continue;
    beats.push(r3(t));
    if ((((n - fd) % bpb) + bpb) % bpb === 0) downbeats.push(r3(t));
  }
  const hits = [...new Set([...desc.sections.map(s => s.t), ...desc.accents.map(a => a.t)].filter(t => t >= 0 && t < dur).map(r3))].sort((a, b) => a - b);
  return { file, duration: r3(dur), bpm: r2(grid.bpm), beats, downbeats, hits, energy: energyCurve(L, R) };
}

// one-line summary in the same spirit as music_tools analyze
export function summary(a, path, beatsPerBar = 4) {
  const per = 60 / a.bpm, top = Math.max(...a.energy.map(e => e[1]));
  const bars = a.energy.map(e => '▁▂▃▄▅▆▇█'[Math.max(0, Math.min(7, Math.floor((e[1] - top + 30) / 30 * 8)))]).join('');
  return `${path}\n길이 ${a.duration}s · 템포 ${a.bpm} BPM (1박 ${per.toFixed(3)}s, 1마디 ${(per * beatsPerBar).toFixed(3)}s) · 첫 다운비트 ${(a.downbeats[0] ?? 0).toFixed(2)}s`
    + `\n히트(섹션 시작·악센트): ${a.hits.map(t => t.toFixed(2)).join(', ')}\n에너지(0.5초, ▁~█): ${bars}`;
}
