// starter.score.mjs — 32초짜리 BGM 악보 템플릿. 프로젝트의 audio/music/score.mjs로 복사해 고쳐 쓴다.
//
//   node $S/bgm/render.mjs --score audio/music/score.mjs --out audio/music/music.wav --analysis audio/music/analysis.json
//   python3 $S/bgm/verify.py audio/music/music.wav --analysis audio/music/analysis.json --waveform-png
//
// 구성: Intro(낮은 패드·시계 틱) → Build(킥·베이스·플럭 입장) → Main(8마디 첫 박 히트, 아르페지오·벨) → Resolve(마지막 화음 + 벨)
// 이 파일은 라이브러리를 import하지 않는다. render.mjs가 compose(bgm)에 격자 도우미와 유틸리티를 넘겨 준다.
// 같은 파일 + 같은 seed면 항상 같은 샘플이 나온다(모든 무작위는 이름 붙은 seed 스트림에서 나온다).

export const title = 'starter';
export const seed = 'starter-v1';          // 바꾸면 무작위 선택(휴머나이즈·랜덤 패턴)만 달라진 다른 테이크가 된다
export const key = 'D major';

// ---- 1) 격자를 먼저 정한다. 화면의 컷·히트는 이 격자의 다운비트에 놓인다 ----
// beat n = t0 + n*(60/bpm), 마디 k는 박 firstDownbeat + 4k에서 시작한다. 첫 박을 0.5초에 두면 페이드인(60ms)에 첫 다운비트가 묻히지 않는다.
export const grid = { bpm: 120, t0: 0.5, beatsPerBar: 4, firstDownbeat: 0 };
export const duration = 33.0;              // 파일 길이(초). 16마디 = 32초 + 앞 0.5초 + 꼬리

// ---- 2) 섹션·악센트: analysis.json의 hits(= timeline.py의 music.hitN 큐)와 verify.py 표가 이것을 쓴다 ----
export const sections = [
  { bar: 0, name: 'Intro', energy: 0.3 },
  { bar: 4, name: 'Build', energy: 0.55 },
  { bar: 8, name: 'Main', energy: 0.85 },
  { bar: 12, name: 'Resolve', energy: 0.35 },
];
export const accents = [
  { bar: 8, name: 'Main hit', strength: 1 },            // 가장 큰 히트(verify.py가 이 마디 주변을 마디별로 보여 준다)
  { bar: 13, name: 'Final chord', strength: 0.4 },
];
export const gaps = [];                    // 나레이션이 없는 구간 [[시작, 끝], ...] (timeline에서 옮겨 적는다. verify 표에 G로 표시)

// ---- 3) 섹션 음량 모양(LU, 상대값): render.mjs가 마디 구간마다 이 모양으로 맞춘 뒤 전체를 -13 LUFS로 정규화한다 ----
export const levels = { points: [[0, -7], [4, -4], [8, 0], [12, -5], [13, -6]], end: 14 };
export const master = { fadeOut: [31.2, 32.9] };   // 나머지(-13 LUFS, -1.35 dBTP, EQ, glue)는 기본값
// export const mix = { arp: 0.06 };       // 악기별 음량 균형(선형). 기본값은 lib/instruments.mjs의 DEFAULT_MIX

// 화음: 이름 → [베이스 MIDI, [패드 MIDI...]]. 패드는 E3~G#4(52~68) 근처에 두면 말소리 대역을 덜 덮는다
const CH = {
  'D': [38, [54, 57, 62, 66]], 'Bm': [35, [54, 59, 62, 66]], 'G': [31, [55, 59, 62, 67]],
  'A': [33, [52, 57, 61, 64]], 'Asus4': [33, [52, 57, 62, 64]], 'Dadd9': [38, [54, 57, 62, 64, 69]],
};
const PROG = [[0, 'D'], [1, 'Bm'], [2, 'G'], [3, 'Asus4'], [3.5, 'A'],
  [4, 'D'], [5, 'Bm'], [6, 'G'], [7, 'A'], [8, 'D'], [9, 'Bm'], [10, 'G'], [11, 'A'], [12, 'G'], [13, 'Dadd9']];

export function compose(bgm) {
  // bgm: bar(k, b) / beat(n) / barOf(t) / BEAT / S16 / S32 / table(rows) / progression(rows, voicings)
  //      makeRng(name) / smooth / clamp / mtof / db
  const { bar, S16, makeRng, table } = bgm;
  const chords = bgm.progression(PROG, CH, { end: 16 });
  const E = { pad: [], bass: [], kick: [], tick: [], pluck: [], arp: [], glass: [], bell: [], piano: [], fx: [] };
  const sec = k => (k < 4 ? 'intro' : k < 8 ? 'build' : k < 12 ? 'main' : 'resolve');

  // 패드: 화음마다 블록 하나. 섹션이 어택·음색을 정한다. 필터 컷오프는 아래 padCut이 시간에 따라 움직인다
  for (const c of chords.list) {
    const s = sec(c.k0), last = c.name === 'Dadd9';
    E.pad.push({ t0: c.t0, t1: last ? bar(15) : c.t1, notes: c.pad, att: s === 'main' ? 0.05 : 0.6, rel: last ? 2.4 : 1.2,
      gain: s === 'intro' ? 0.7 : 0.85, kind: s === 'main' ? 'full' : s === 'intro' || s === 'resolve' ? 'soft' : 'warm' });
  }
  const padCut = table([[0, 600], [4, 900], [8, 2200, 0.1], [12, 1000, 1], [13, 800, 2]]);

  const rng = makeRng('starter-pluck');
  for (let k = 0; k < 16; k++) {
    const s = sec(k), c = chords.at(k), root = c.bass;
    // 베이스: Intro는 길게 깔리는 서브, Build·Main은 8분 모토릭(킥과 겹치는 음은 duck으로 자리를 비킨다)
    if (s === 'intro' && k % 2 === 0) E.bass.push({ t: bar(k), dur: bgm.BEAT * 8 - 0.1, midi: root, vel: 0.8, style: 'sub', gain: 0.6 });
    if (s === 'build' || s === 'main') for (let i = 0; i < 8; i++) {
      const cc = chords.at(k + i / 8);
      E.bass.push({ t: bar(k, i / 2), dur: bgm.BEAT / 2 * 0.72, midi: cc.bass + (s === 'main' && i % 4 === 3 ? 12 : 0), vel: i % 2 ? 0.7 : 0.9,
        style: 'motor', duck: i % 2 === 0 ? 0.55 : 0 });
    }
    if (s === 'resolve' && k === 12) E.bass.push({ t: bar(k), dur: bgm.BEAT * 4 - 0.05, midi: root, vel: 0.7, style: 'round' });
    if (k === 13) E.bass.push({ t: bar(13), dur: bgm.BEAT * 6, midi: 38, vel: 0.75, style: 'sub' });

    // 킥: Build부터 4박. Build 마지막 마디의 4박째는 비워 히트 앞을 숨 쉬게 한다
    if (s === 'build' || s === 'main') for (let b = 0; b < 4; b++) if (!(k === 7 && b === 3)) E.kick.push({ t: bar(k, b), vel: b ? 0.85 : 1 });

    // 틱: Intro는 시계 박, Build는 8분 뒷박 하이햇, Main은 16분 하이햇(뒷박 강세)
    for (let i = 0; i < 16; i++) {
      const t = bar(k, i / 4);
      if (s === 'intro' && i % 4 === 0) E.tick.push({ t, type: 'clock', vel: i === 0 ? 0.9 : 0.6, pan: 0.15, alt: (i / 4) % 2 });
      if (s === 'build' && i % 4 === 2) E.tick.push({ t, type: 'hat', vel: 0.55, pan: 0.1 });
      if (s === 'main') E.tick.push({ t, type: 'hat', vel: i % 4 === 2 ? 0.6 : 0.3, pan: i % 2 ? 0.25 : -0.15 });
      if (s === 'resolve' && k < 14 && i % 8 === 0) E.tick.push({ t, type: 'clock', vel: 0.5, pan: 0.15 });
    }

    // 플럭: Build의 8분 화음 걷기(사람 손 느낌을 조금: ±6ms)
    if (s === 'build') for (let i = 0; i < 8; i++) {
      const tones = chords.at(k + i / 8).pad.map(m => m + 12);
      E.pluck.push({ t: bar(k, i / 2) + rng.range(-0.006, 0.006), midi: tones[[0, 1, 2, 3, 2, 1, 2, 3][i] % tones.length], vel: i % 2 ? 0.5 : 0.65,
        pan: i % 2 ? 0.25 : -0.25 });
    }
    // 아르페지오(16분)와 유리질 FM(점8분 교차 리듬): Main에서만
    if (s === 'main') {
      for (let i = 0; i < 16; i++) {
        const t = bar(k, i / 4), tn = chords.at(k + i / 16).pad;
        E.arp.push({ t, midi: tn[i % tn.length] + 12, vel: i % 4 === 0 ? 0.8 : 0.55, cut: 1400, dec: 0.1, pan: i % 2 ? 0.3 : -0.3 });
      }
      for (const [j, pos] of [0, 3, 6, 9, 12].entries()) {
        const tn = chords.at(k + pos / 16).pad.map(m => m + 24);
        E.glass.push({ t: bar(k, pos / 4), midi: tn[(j + k) % tn.length], vel: 0.6, pan: j % 2 ? 0.5 : -0.5 });
      }
    }
    // 피아노: Resolve의 펠트 피아노 분산화음
    if (s === 'resolve' && k === 12) [0, 1, 2, 3].forEach(b => E.piano.push({ t: bar(k, b), midi: c.pad[b % c.pad.length] + 12, vel: 0.5, dur: bgm.BEAT * 1.6 }));
  }

  // 히트(8마디 첫 박): 낮은 붐 + 닫히는 화음 스탭 + 벨 + 심벌 같은 쉬머. 바로 앞 1마디는 라이저로 끌어올린다
  E.fx.push({ type: 'riser', t: bar(7), t1: bar(8), f0: 400, f1: 8000, q: 1.4, gain: 0.08 });
  E.fx.push({ type: 'boom', t: bar(8) + 0.004, midi: 38, dec: 1.0, gain: 0.28 });      // 붐·킥처럼 뾰족한 층은 작게: 리미터가 히트를 깎지 않게
  E.fx.push({ type: 'stab', t: bar(8), notes: [50, 57, 62, 66, 69, 74], cut0: 6000, cutEnd: 900, cutDec: 0.5, dec: 1.6, gain: 0.3 });
  E.fx.push({ type: 'shimmer', t: bar(8), dec: 1.2, gain: 0.07 });
  E.bell.push({ t: bar(8), midi: 86, vel: 0.9 }, { t: bar(8) + 0.012, midi: 90, vel: 0.6, pan: 0.3 });
  // 마지막 화음: 부드러운 벨과 피아노, 시계 틱 한 번. 꼬리는 fadeOut 전에 자연히 사라지게 길이를 잡는다
  E.bell.push({ t: bar(13), midi: 81, vel: 0.4, dec: 2.6 }, { t: bar(13, 0.5), midi: 86, vel: 0.25, dec: 2.2, pan: 0.3 });
  E.piano.push({ t: bar(13), midi: 50, vel: 0.4, dur: bgm.BEAT * 6 }, { t: bar(13, 0.02), midi: 57, vel: 0.3, dur: bgm.BEAT * 6 });

  return {
    events: E, padCut,
    // levels 보정값(dB) g를 받아 시간별로 더 고친다. 여기서는 히트 직전 8분음표 동안 3dB 숨을 죽인다
    automation: (t, g) => (t >= bar(7, 3.5) && t < bar(8) ? g - 3 : g),
  };
}
