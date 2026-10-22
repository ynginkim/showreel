# BGM: Claude가 JS로 작곡한다

음악은 외부 음원·샘플·루프나 음악 생성 서비스(ElevenLabs Music 포함) 없이 코드로만 만든다. 프로젝트마다 Claude가 악보 `audio/music/score.mjs`를 쓰고, `scripts/bgm/render.mjs`가 그 악보를 합성·믹스·마스터링해 WAV와 `analysis.json`을 함께 쓴다. 라이브러리는 의존성이 없고(Node 18 이상) 결정적이다. 같은 악보와 같은 seed면 언제나 같은 샘플이 나온다.

## 목차

- 만드는 순서
- 1) 섹션과 에너지
- 2) 박 격자를 먼저 정한다
- 3) score.mjs 쓰기
- 4) 나레이션 아래 깔리는 음악의 편곡 규칙
- 5) 큰 히트와 피날레
- 6) 렌더 → analysis.json → 타임라인
- 7) 검증
- 자주 생기는 문제
- 라이브러리를 고칠 때(회귀 테스트)

## 만드는 순서

```bash
S=<스킬 폴더>/scripts
cp $S/bgm/examples/starter.score.mjs <프로젝트>/audio/music/score.mjs      # 처음 한 번. 길고 완성된 예: $S/bgm/examples/pstack-harness.score.mjs
node $S/bgm/render.mjs --score <프로젝트>/audio/music/score.mjs --out <프로젝트>/audio/music/music.wav --analysis <프로젝트>/audio/music/analysis.json
python3 $S/bgm/verify.py <프로젝트>/audio/music/music.wav --analysis <프로젝트>/audio/music/analysis.json --waveform-png
python3 $S/timeline.py <프로젝트>/script.json --music-analysis audio/music/analysis.json
python3 $S/bgm/verify.py <프로젝트>/audio/music/music.wav --analysis <프로젝트>/audio/music/analysis.json --mix <프로젝트>/timeline.json   # 나레이션이 생긴 뒤
```

1. `concept.md`의 구간에서 섹션·에너지를 정한다.
2. 박 격자를 정하고, 섹션 경계·큰 히트를 다운비트에 둔다.
3. `score.mjs`를 쓰고 렌더한다. 같은 명령이 `analysis.json`(박·다운비트·히트)을 쓴다.
4. `timeline.py --music-analysis`로 마디 큐(`bar9`)·히트 큐(`music.hit3`)를 만든다. 화면은 이 큐를 쓴다.
5. 나레이션이 배치되면 나레이션 없는 구간(`gaps`)을 악보에 옮겨 적고 다시 렌더한다. 격자를 바꾸지 않으면 화면은 다시 렌더하지 않아도 되고 `mix.py`·`finish.py`만 다시 돌린다.
6. `verify.py`의 수치와 파형·스펙트로그램을 보고 고친다. Claude는 소리를 들을 수 없으므로 수치로 확인하고, 납품 때 사용자에게 청취를 부탁한다.

## 1) 섹션과 에너지

- 섹션은 `concept.md`의 구간과 맞춘다. 구간마다 화면의 재질이 바뀌면 소리의 질감도 바꾼다(pstack-harness: 스플릿 플랩 안내판 → 시계 틱과 플랩 클릭, 종이 책상 → 망설이는 플럭과 연필 톡, 감열 프린터 → 32분음표 스테퍼 소리).
- 에너지(0~1)는 층의 개수와 음량을 정한다. 대비를 둔다. 절정(0.85 이상)은 전체의 25% 안에, 가운데쯤에 0.3~0.45의 숨 고르기 하나, 이웃 섹션은 악기 변화가 들려야 한다.
- 나레이션 영상은 나레이션 줄 시각(`timeline.json`의 `vo`)에서 나레이션 없는 구간을 뽑아 `gaps`에 적는다. 1.2초 이상인 쉼이 대상이다. 음악은 그 구간에서만 조금 올라오고, 음악만 나오는 구간(콜드 오픈·피날레·엔드카드)은 음악이 화면을 끌고 간다.
- 섹션 시작은 가장 가까운 다운비트에 둔다. 화면 컷이 다운비트에 있으면 스펙의 초보다 컷을 따른다(pstack-harness의 Problem 섹션은 32초가 아니라 종이 책상 컷인 29.585초 다운비트에서 시작했다).

pstack-harness(300초, 120 BPM, A major) 섹션 예:

| 섹션 | 시작 마디(초) | 에너지 | 편곡 |
| --- | --- | --- | --- |
| Departure Board | 픽업(0.1) | 0.30 | 시계 틱(모든 박), 플랩 클릭, 낮은 패드, 서브. 드럼 없음 |
| Title | 7(15.59) | 0.50 | 첫 박에 따뜻한 히트 하나, 8분 베이스 펄스, 16분 틱 |
| Problem | 14(29.59) | 0.40 | 스윙·휴머나이즈한 싱코페이션 플럭, 늦게 들어오는 베이스, 해결 안 되는 화음 |
| Map Builds | 31(63.57) | 0.60 | 모토릭 킥·8분 베이스, 8마디마다 층 추가 |
| Routing | 55(111.54) | 0.72 | 16분 아르페지오, 점8분 FM 글라스, 높은 벨 |
| Front Door | 71(143.53) | 0.80 | 감열 프린터 스테퍼, 3-3-2 아르페지오, 페달 A |
| Breath | 87(175.51) | 0.35 | 드럼·펄스 빠짐, 패드와 8분 틱만 |
| Finale | 138(277.46) | 0.75→0.85 | 획 그룹 다운비트마다 한 단계, 143마디 LOCK, 엔드카드 해결 |

## 2) 박 격자를 먼저 정한다

화면의 시각은 음악의 박에서 정해지므로 격자가 가장 먼저다. 악보가 격자를 선언하고, 렌더러는 모든 음을 그 격자의 샘플 위치에 놓는다.

```js
export const grid = { bpm: 120, t0: 0.5, beatsPerBar: 4, firstDownbeat: 0 };     // 박 n = t0 + n*(60/bpm), 마디 k = 박 firstDownbeat + 4k
```

- 120 BPM이면 1마디 2초, 4마디 8초다. 섹션·장면은 4마디 단위로 잡는다.
- 첫 박은 0.3~0.5초 뒤에 둔다. 0초에 두면 시작 페이드(60ms)에 첫 다운비트가 묻힌다.
- 픽업이 필요하면 `firstDownbeat`을 0보다 크게 둔다(pstack-harness: `{ beat: 0.499751, t0: 0.1, firstDownbeat: 3 }` = 박 0~2가 픽업, 첫 다운비트 1.599초).
- **이미 렌더된 영상의 음악을 바꿀 때**는 그 영상이 쓴 격자(`timeline.json`의 `music_tl`, 마디 큐 `bar1`…)를 그대로 옮겨 적는다. `bpm` 대신 `beat`(초)를 적으면 소수점 반올림 오차가 없다. 새 `analysis.json`의 박이 이전 큐와 1ms 안에서 같으면 화면은 다시 렌더하지 않는다.
- 악보 안에서는 시간을 초로 쓰지 않고 `bar(k, beat)`로 쓴다. `bar(142, 3.5)`는 142마디 넷째 박 뒷박이다.

## 3) score.mjs 쓰기

악보는 라이브러리를 import하지 않는다. `render.mjs`가 `compose(bgm)`에 격자 도우미와 유틸리티를 넘긴다. 그래서 악보 파일을 프로젝트 어디에 두어도 된다.

| export | 뜻 |
| --- | --- |
| `grid` | 박 격자(위) |
| `duration` | 파일 길이(초). 영상 길이 + 꼬리 0.1~0.2초 |
| `seed` | 무작위 이름 공간. 바꾸면 휴머나이즈·랜덤 패턴만 다른 테이크가 된다 |
| `sections` | `[{ bar, name, energy }]` 섹션 시작. `analysis.json`의 hits와 verify 표가 쓴다 |
| `accents` | `[{ bar, beat?, name, strength }]` 큰 히트. hits에 들어가고 verify가 정렬을 잰다. strength가 가장 큰 것 주변을 마디별로 보여 준다 |
| `gaps` | `[[시작초, 끝초]]` 나레이션 없는 구간(선택) |
| `levels` | `{ points: [[마디, LU]], end: 마디 }` 섹션 음량 모양(상대값). 렌더러가 구간마다 이 모양으로 보정한 뒤 전체를 정규화한다 |
| `mix` | 악기별 음량 균형(선형). 기본은 `lib/instruments.mjs`의 `DEFAULT_MIX` |
| `master` | `{ lufs: -13, ceiling: -1.35, fadeIn: 0.06, fadeOut: [시작, 끝], eq, glue }` |
| `compose(bgm)` | `{ events, padCut?, automation? }`를 돌려준다 |

`bgm`에 들어 있는 것: `bar(k, b)`, `beat(n)`, `barOf(t)`, `BEAT`, `S16`, `S32`, `table(rows)`(마디별 값 + 로그 글라이드, 필터 컷오프용), `progression(rows, voicings, { end, fromZero })`(화음 타임라인과 `at(마디)`), `makeRng(이름)`, `smooth`, `clamp`, `mtof`, `db`.

- `events`는 악기 이름별 이벤트 배열이다. 렌더 순서는 객체에 적은 순서다.
- `padCut(t)`는 패드의 4-pole 로패스 컷오프(Hz) 곡선이다. 섹션마다 `table`로 값을 주고, 나레이션 공백에서 2배로 연다.
- `automation(t, g)`는 `levels`가 정한 보정값 g(dB)를 받아 고친 값을 돌려준다. 공백에서 +1.6dB, 히트 직전 숨 죽이기 같은 것을 여기에 쓴다.
- 무작위는 `Math.random`을 쓰지 않는다. 결정마다 `makeRng('problem-pluck')`처럼 이름 붙은 스트림을 만든다. 한 층을 고쳐도 다른 층의 무작위가 바뀌지 않는다.

악기(필드 전체는 `lib/instruments.mjs` 맨 위):

| 악기 | 이벤트 | 쓰는 곳 |
| --- | --- | --- |
| `pad` | `{ t0, t1, notes, att, rel, kind: warm·full·soft, cutMul, hp, swell }` | 화음 블록. full은 두툼, soft는 사인 위주. `swell`은 역재생처럼 차오르는 엔벨로프, `hp: 900`이면 높은 공기층 |
| `bass` | `{ t, dur, midi, vel, style: sub·pulse·round·motor·drive, duck }` | sub = 깔리는 서브, motor = 8분 모토릭. 킥과 같은 박이면 `duck: 0.55` |
| `kick` | `{ t, vel, kind: norm·soft }` | 부드러운 사인 킥. 무겁게 찌그러뜨리지 않는다 |
| `tick` | `{ t, type, vel, pan }` | clock·flap(스플릿 플랩)·pencil·hat·step(프린터 스테퍼)·feed·ratchet·clunk(레버). 대부분 4kHz 위 |
| `pluck` | `{ t, midi, vel, dec, bright, pan }` | 칼림바·말렛 느낌의 가산 합성 플럭 |
| `arp` | `{ t, midi, vel, cut, dec, sq, pan }` | 필터 엔벨로프가 있는 톱니·사각 아르페지오 |
| `glass` | `{ t, midi, vel, dec, ratio, index }` | 유리질 FM. 점8분 교차 리듬에 좋다 |
| `bell` | `{ t, midi, vel, dec }` | 유리 말렛 벨. 공백·히트·마지막 화음에 |
| `piano` | `{ t, midi, vel, dur }` | 펠트 피아노 |
| `fx` | boom·stab·riser·air·shimmer | 히트(붐+닫히는 화음 스탭+쉬머), 라이저(끝이 히트), air(숨 쉬기) |

화음은 `[베이스 MIDI, [패드 MIDI…]]`로 적는다. 패드는 E3~G#4(MIDI 52~68) 근처에 두고, 베이스 루트는 F#1~F2(30~41)에 둔다. 섹션마다 진행을 바꾼다(I–vi–IV–V 계열, sus 화음, 페달음, 기만 종지).

## 4) 나레이션 아래 깔리는 음악의 편곡 규칙

`mix.py`는 말소리 구간에서 음악의 700~4500Hz를 깊게(약 -17dB), 나머지를 얕게(약 -6.5dB) 덕킹하고, 음악을 -16 LUFS로 다시 맞춘다. 그래도 말소리 대역은 악보에서 먼저 비운다.

- 나레이션 아래: 300~4000Hz에 바쁜 리드 멜로디를 두지 않는다. 추진력은 베이스·서브·킥과 4kHz 위의 틱으로 낸다. 패드는 로패스 500~1200Hz, 벨·글라스는 드물게 작게.
- 나레이션 공백: 패드 컷오프를 2배로 열고, `automation`으로 +1.6dB, 벨 모티프나 높은 공기층을 넣는다. 1.2초짜리 짧은 쉼도 올라오는 것이 숫자에 보여야 한다.
- 음악만 나오는 구간: 멜로디·밝기·층을 마음껏 쓴다. 이 구간이 곡의 얼굴이다.
- 한 루프처럼 들리지 않게: 섹션마다 화음 진행을 바꾸고, 층은 섹션 다운비트에 넣고 빼며, 8마디 끝마다 필(틱 롤, 킥 빼기)을 둔다. 스윙·휴머나이즈는 망설이는 장면에만 쓰고, 기계적인 장면은 격자에 딱 맞춘다.
- 조용한 섹션의 서브 드론은 gain 0.5~0.65로 둔다. 1.0이면 55Hz가 곡을 덮는다.
- 기준: `verify.py --mix`의 모든 줄 ✓(나레이션 대 배경 9dB 이상). pstack-harness는 41줄 모두 ✓, 최저 13.0dB, 최고 22.9dB였다(이전 ElevenLabs 곡 11.7~23dB).

## 5) 큰 히트와 피날레

- **쌓기**: 단계마다 다운비트에서 하나씩 올린다. 베이스를 한 음씩 올리고(D–E–F#–G#–A), 패드의 맨 위 음도 함께 올리고, 필터를 열고, 층을 하나씩 더한다. `levels`로 마디마다 약 +1dB. 라이저는 히트 시각에서 끝나게 둔다.
- **도착**: 히트는 화성의 해결(V→I)과 같이 온다. 직전 8분음표 동안 3~3.5dB 숨을 죽였다가(`automation`) 히트에서 돌아온다. 히트 층은 낮은 붐 + 밝은 화음 스탭 + 벨 + 쉬머로 만든다.
- **리미터에 깎이지 않게**: 붐·킥·톱니 스탭처럼 뾰족한 층은 작게 둔다(붐 gain 0.3~0.4). 스탭은 tanh 포화로 크레스트를 낮췄다. `verify.py`가 리미터 감쇠 4dB 이상인 초를 보여 주면 그 층을 줄이고, 목표 음량은 낮추지 않는다.
- **해결**: 엔드카드에서는 펄스를 빼고(마지막 킥 하나), 처음 섹션의 소리(pstack-harness는 시계 틱과 플랩)를 북엔드로 돌려놓고, IV/I → I(add9) 마지막 화음과 부드러운 벨로 끝낸다. 꼬리는 `fadeOut` 전에 자연히 사라지게 길이를 잡는다. 마지막 정지 화면 동안에는 소리가 거의 없어야 한다.
- 숫자: `verify.py`의 마디별 표에서 히트 마디가 곡 전체의 최대이고 직전 마디보다 2dB 이상 커야 한다. pstack-harness: 138~142마디 -14.4 → -13.3 → -12.4 → -11.7 → -11.2, LOCK -8.7, 이후 -10.4 → -12.4 → -14.0 LUFS.

## 6) 렌더 → analysis.json → 타임라인

```bash
node $S/bgm/render.mjs --score <프로젝트>/audio/music/score.mjs --out <프로젝트>/audio/music/music.wav --analysis <프로젝트>/audio/music/analysis.json
node $S/bgm/render.mjs --score <프로젝트>/audio/music/score.mjs --describe                 # 격자·섹션·악센트만 JSON으로 보기
node $S/bgm/render.mjs --score ... --out ... --stems pad,bass --stems-dir <폴더>   # 악기별 스템(같은 트림·마스터 게인, 리미터 전)
node $S/bgm/render.mjs --score ... --out ... --mute arp,glass                     # 원인 분리
```

- 출력: `music.wav`(48kHz 스테레오 24비트, -13 LUFS, -1.3 dBTP 이하), `analysis.json`, `music.meta.json`(verify용: 격자·섹션·악센트·공백·킥 시각·마스터 보고).
- `analysis.json`은 `music_tools.py analyze`와 같은 모양이다(`file, duration, bpm, beats, downbeats, hits, energy`). 박·다운비트는 악보의 격자에서 정확히 계산하고, `hits`는 섹션 시작 + `accents`(시간순)이며, `energy`는 렌더한 소리로 `music_tools`와 같은 방법(0.5초)으로 잰다(같은 파일에서 0.1dB 안).
- `timeline.py --music-analysis`가 `bar1…`(다운비트)과 `music.hit1…`(hits 순서) 큐를 만든다. hits 번호는 섹션·악센트를 더하거나 빼면 밀리므로, 장면 경계에는 되도록 `barN`을 쓴다.
- `script.json`의 `music.file`은 `audio/music/music.wav`로 둔다.
- 렌더 시간: 5분 곡 약 35초, 30초 곡 약 4초(M 시리즈 Mac).

## 7) 검증

```bash
python3 $S/bgm/verify.py <프로젝트>/audio/music/music.wav --analysis <프로젝트>/audio/music/analysis.json \
  --waveform-png --spec 0,60,120,180 --mix <프로젝트>/timeline.json --out-dir <프로젝트>/audio/music/verify
```

| 항목 | 기준 |
| --- | --- |
| `[loudness]` | 통합 -13 LUFS ± 0.5 ✓, true peak -1.0 dBTP 이하 ✓, clipped 0, DC 1e-4 미만, 페이드 뒤 0 |
| `[grid]` | `analysis.json`의 박·다운비트가 격자와 0.6ms 안 ✓(반올림만큼) |
| `[onsets] kick` | 모든 킥의 실제 시작이 격자에서 5ms 안 ✓(평균 킥 템플릿 + 히트마다 상호상관). pstack-harness 357개 최대 1.8ms |
| `[onsets] accent` | 악센트마다 엔벨로프가 50% 오르는 시각이 5ms 안 ✓. 어택이 없는 화음은 "soft"로 표시된다 |
| `[energy]` 섹션 표 | 선언한 에너지와 섹션 음량의 순위 상관 0.8 이상 ✓(pstack-harness +0.96) |
| `[energy]` 마디 표 | 가장 큰 악센트 마디가 최대이고 직전 마디보다 2dB 이상 |
| `--waveform-png` | 악센트마다 한 줄: 빨강 = 격자 시각, 초록 = 잰 시작, 파랑 = 다운비트, 회색 = 박. 빨강과 초록이 겹쳐야 한다. 모든 줄이 같은 세로 눈금이라 히트의 상대 크기도 보인다 |
| `--spec` | 20초 스펙트로그램을 Read로 본다. 줄무늬(앨리어싱)·클릭·무음 구멍이 없고, 나레이션 아래 1.3~4kHz가 비어 있어야 한다 |
| `--mix` | `mix.py`로 테스트 믹스를 만들고 줄별 나레이션 대 배경을 요약한다. 모든 줄 ✓(9dB 이상) |

`--mix`는 타임라인의 `music.file`을 쓴다. 검증하는 WAV와 다르면 경고한다. 결과는 `--out-dir`(기본: WAV 옆 `verify/`)에 쓴다.

## 자주 생기는 문제

| 증상 | 원인과 조치 |
| --- | --- |
| `music_tools.py analyze`로 읽은 박이 곡 끝으로 갈수록 어긋남 | 분석기의 템포 추정(23ms 홉에서 포물선 보간)이 정확한 격자의 곡도 120.06 BPM을 120.1로 읽어, 5분 끝에서 약 -70ms 어긋난다. 정확한 클릭 트랙도 똑같이 읽는다. 펌핑·지터·노이즈를 넣어도 고쳐지지 않았다. 박을 다시 읽지 말고 `render.mjs`가 쓴 `analysis.json`을 쓴다. 정렬은 `verify.py`의 `[onsets]`로 확인한다 |
| 가장 큰 히트가 생각보다 작게 들림 | 리미터가 히트를 5~6dB 깎았다. 붐·킥·스탭을 줄이고, 히트 벨은 10~25ms씩 어긋나게 친다. 목표 LUFS를 낮추면 곡 전체가 작아질 뿐이다 |
| 섹션 대비가 숫자에서 사라짐(LRA 3~4 LU) | 버스 컴프레서가 너무 셌다. 기본 glue는 thr -15dB, 1.35:1로 약하게 두었다. `levels`의 간격을 넓힌다(조용한 섹션 -8~-10 LU, 큰 섹션 -2~0) |
| 틱마다 곡 전체가 들썩임 | 클릭은 피크가 RMS보다 40dB 높다(피크 -2.4dBFS, RMS -42dBFS 실측). 리미터가 틱마다 걸린다. `tick`은 첫 3ms RMS의 +9dB에서 소프트 클립하도록 바꿨다. 새 클릭 소리를 만들면 같은 처리를 한다 |
| 저역이 뭉개짐 | 서브 드론이 크거나 킥 꼬리가 길다. 조용한 섹션 서브 gain 0.5~0.65, 킥 감쇠 0.15초(라이브러리 기본), 킥과 같은 박의 베이스는 `duck` |
| 시작이 안 들림 | 첫 다운비트가 0초 근처라 페이드인에 묻혔다. `grid.t0`을 0.3~0.5초로 둔다. 첫 박들은 틱처럼 들리는 소리로 시작한다 |
| 렌더할 때마다 소리가 다름 | `Math.random`이나 시각을 썼다. `makeRng(이름)`만 쓴다. 같은 Node에서는 바이트까지 같다. 다른 JS 엔진에서는 삼각함수 마지막 비트가 다를 수 있다 |
| 줄 하나가 △·✗ | 그 줄 아래 300~4000Hz 층(플럭·아르페지오·벨)을 줄이거나 패드 컷오프를 낮춘다. 그다음 그 근처 효과음 |

## 라이브러리를 고칠 때(회귀 테스트)

`scripts/bgm/lib/`를 고친 뒤에는 승인된 곡이 샘플까지 같은지 확인한다. 연산 순서를 바꾸면(덧셈 순서 포함) 바이트가 바뀐다.

```bash
node $S/bgm/render.mjs --score $S/bgm/examples/pstack-harness.score.mjs --out <작업 폴더>/music.wav --analysis <작업 폴더>/analysis.json
shasum -a 256 <작업 폴더>/music.wav     # 911c23850837474dcedb37822ebaf121b3d0bb3cc29d5911b1bb3f0a6b3cdeaf (Node 22, macOS)
```

결과가 다르면 고친 부분이 의도한 소리 변화인지 확인하고, 의도했다면 이 해시를 새 값으로 바꾼다.
