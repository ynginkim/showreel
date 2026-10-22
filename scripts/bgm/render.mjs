#!/usr/bin/env node
// Code-composed BGM: render a score module to a mastered WAV + a drift-free analysis.json.
//
//   node <skill>/scripts/bgm/render.mjs --score <project>/audio/music/score.mjs \
//        --out <project>/audio/music/music.wav [--analysis <project>/audio/music/analysis.json]
//        [--stems pad,bass,...] [--stems-dir DIR] [--mute arp,glass] [--describe]
//
// Writes: the WAV (48 kHz stereo 24-bit, about -13 LUFS integrated, <= -1.3 dBTP), analysis.json (default: next to the
// WAV) in the exact music_tools.py analyze shape, and <wav-stem>.meta.json (grid, sections, accents, gaps, kick/boom
// onsets, master report) for verify.py. --describe prints the score's grid/sections/accents as JSON and exits.
// Deterministic: every random choice is seeded by the score's `seed` export.
import { pathToFileURL } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SR, writeWav24 } from './lib/dsp.mjs';
import { renderScore, describe } from './lib/engine.mjs';
import { makeGrid } from './lib/grid.mjs';
import { analysisJson, projectRelative, summary } from './lib/analysis.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const flag = k => args.includes('--' + k);
if (flag('help') || !opt('score')) {
  console.log('usage: node render.mjs --score score.mjs [--out music.wav] [--analysis analysis.json | --no-analysis] [--stems a,b] [--stems-dir DIR] [--mute a,b] [--describe]');
  process.exit(opt('score') ? 0 : 2);
}
const scorePath = resolve(opt('score'));
const mod = await import(pathToFileURL(scorePath).href);
const grid = makeGrid(mod.grid);
const desc = describe(mod, grid);
if (flag('describe')) { console.log(JSON.stringify(desc, null, 1)); process.exit(0); }

const OUT = resolve(opt('out') || join(dirname(scorePath), 'music.wav'));
const ANALYSIS = flag('no-analysis') ? null : resolve(opt('analysis') || join(dirname(OUT), 'analysis.json'));
const META = OUT.replace(/\.wav$/i, '') + '.meta.json';
const STEMS = (opt('stems') || '').split(',').filter(Boolean);
const STEMS_DIR = resolve(opt('stems-dir') || join(dirname(OUT), 'stems'));
const MUTE = new Set((opt('mute') || '').split(',').filter(Boolean));
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

mkdirSync(dirname(OUT), { recursive: true });
const res = await renderScore(mod, { stems: STEMS, mute: MUTE, log });
const { L, R, N, report } = res;
if (report.limiterOver1_5dB.length) log('limiter >1.5 dB GR (per second): ' + report.limiterOver1_5dB.map(([s, g]) => `${s}s:${g}`).join(' '));
writeWav24(OUT, L, R);
log(`wrote ${OUT}  (${(N / SR).toFixed(3)} s, I ${report.integrated.toFixed(2)} LUFS, limiter max GR ${report.limiterMaxGR.toFixed(2)} dB)`);

if (ANALYSIS) {
  const a = analysisJson({ L, R, N, grid, desc, file: projectRelative(OUT) });
  mkdirSync(dirname(ANALYSIS), { recursive: true });
  writeFileSync(ANALYSIS, JSON.stringify(a));
  console.log(summary(a, ANALYSIS, grid.beatsPerBar));
}
const meta = { ...desc, score: scorePath, wav: OUT, analysis: ANALYSIS, events: res.counts, onsets: res.onsets, master: report };
writeFileSync(META, JSON.stringify(meta, null, 1));
log(`meta ${META}`);

if (STEMS.length) {
  mkdirSync(STEMS_DIR, { recursive: true });
  for (const [s, st] of Object.entries(res.stems)) { const p = join(STEMS_DIR, `stem_${s}.wav`); writeWav24(p, st[0], st[1]); log(`stem ${basename(p)}`); }
}
