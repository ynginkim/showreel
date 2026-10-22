# 로컬 수정판 운영

이 저장소는 [revfactory/showreel](https://github.com/revfactory/showreel)을 받아 와 로컬 수정을 얹은 것이다. `~/Documents/video-creator`에서 프로젝트 스코프 스킬로 쓴다.

## 구조

| 위치 | 역할 |
| --- | --- |
| `~/Documents/video-creator/showreel/` (이 저장소) | 원본. 수정은 여기서만 한다 |
| 리모트 `upstream` | `https://github.com/revfactory/showreel.git`(인증 없이 받는 HTTPS) |
| 리모트 `origin` | `git@github.com:ynginkim/showreel.git`(포크, 공개). `tools/sync.sh`가 `main`을 앞으로 나아가는 경우에만 자동으로 푸시한다 |
| 브랜치 `main` | `upstream/main` + 로컬 수정. 업스트림 새 커밋은 merge로 받는다(rebase 하지 않는다) |
| `~/Documents/video-creator/.claude/skills/showreel/` | 설치본(생성물). `tools/sync.sh`가 rsync로 만든다. 직접 고치지 않는다 |
| `~/Documents/video-creator/.claude/settings.json` | SessionStart 훅이 세션마다 `tools/sync.sh --session-start`를 돌린다 |

## 동기화

```bash
tools/sync.sh                 # 업스트림 확인·병합 → npm install(필요할 때) → 설치
tools/sync.sh --no-fetch      # 네트워크 없이 설치만
```

- **세션 시작 때마다 자동으로 돈다.** 알릴 것이 있을 때만 한두 줄을 남긴다(업스트림 병합, 충돌, 의존성 설치, 네트워크 실패).
- **작업 트리가 깨끗할 때만 병합한다.** 로컬 수정이 커밋되지 않았으면 병합을 건너뛰고 지금 상태로 설치한다. 그래서 수정은 끝나는 대로 커밋한다.
- **충돌이 나면 병합을 되돌리고 알린다.** 해결하는 순서는 이렇다.
  1. `git merge upstream/main`
  2. 충돌 파일마다 업스트림의 새 의미는 받아들이고, 아래 "로컬 수정"의 의도를 다시 적용한다.
  3. 커밋하고 `tools/sync.sh`를 다시 돌린다.
- 업스트림에 기여할 수정(버그 수정 등)은 `main`이 아니라 `upstream/main`에서 딴 브랜치로 포크에 올려 PR을 연다. 같은 수정을 `main`에도 같은 내용으로 넣어 두면, 업스트림이 받아들인 뒤의 병합이 충돌 없이 끝난다.
- 업스트림 변경을 먼저 보고 싶으면 `git fetch upstream && git log --oneline main..upstream/main`로 확인한다.

## 로컬 수정 (의도)

업스트림과 충돌을 줄이려고, 기존 파일은 꼭 필요한 줄만 바꾸고 새 기능은 새 파일로 더한다.

| 파일 | 수정 | 의도 |
| --- | --- | --- |
| `SKILL.md` | 음악 기본값, 스크립트 경로(`S=<스킬 폴더>/scripts`), 5단계 음악 명령, 9·10단계 검사 보강, 11단계 "납품 뒤 정리", 지킬 것·자주 생기는 문제·참조 표 | BGM은 Claude가 JS로 작곡한다(ElevenLabs Music을 쓰지 않는다). 프로젝트 스코프 설치에서도 경로가 맞게 한다. 실제 제작에서 겪은 문제를 절차에 넣는다 |
| `references/audio.md` | "음악" 절 맨 앞에 안내 한 단락 | 기본 경로가 `references/bgm.md`임을 알린다. 업스트림 원문은 그대로 둔다 |
| `references/qa.md` | 끝에 "납품 뒤 정리" 절 | 무엇을 남기고 무엇을 지우는지 정한다 |
| `scripts/finish.py` | 공유용 오디오를 `--audio` 원본에서 인코딩 | 마스터의 AAC를 다시 인코딩하며 피크 보정이 과하게 걸려 공유용이 -17.5 LUFS로 나온 버그를 고친다 |
| `scripts/preflight.py` | 음악 경로 안내 한 줄 | JS 작곡이 기본임을 보인다 |
| `scripts/bgm/` (새 파일) | JS 합성 라이브러리·렌더 CLI·검증·예시 악보 | Claude가 작곡한 악보를 결정적으로 렌더하고, 정확한 박 격자로 `analysis.json`을 쓴다 |
| `references/bgm.md` (새 파일) | BGM 작곡 방법 | 프로젝트마다 악보를 쓰는 절차와 검증 |
| `scripts/render_pieces.py` (새 파일) | 구간 조각 최종 렌더 | 장면 코드를 고친 뒤 그 조각만 다시 렌더한다 |
| `scripts/flash_list.py` (새 파일) | 섬광 전이 프레임 목록 | 최종 렌더에서 생긴 섬광의 원인 프레임을 찾는다 |
| `scripts/cleanup.py` (새 파일) | 납품 뒤 정리 | 다시 만들 수 있는 작업 파일을 지운다 |
| `scripts/sfx_library.py` (새 파일), SKILL.md 5단계·납품 뒤 정리 | 공용 효과음 라이브러리(find·use·add·list) | 프로젝트마다 만든 효과음을 모아 다시 쓴다(ElevenLabs 크레딧 절약). 위치는 `SHOWREEL_SFX_LIBRARY` |
| `tools/sync.sh`, `CUSTOM.md` (새 파일) | 동기화·설치, 이 문서 | 업스트림을 따라가면서 로컬 수정을 지킨다 |

`README.md`, `CONTRIBUTING.md`의 `~/.claude/skills/showreel` 설치 안내는 업스트림 원문 그대로 둔다. 이 수정판은 위 구조로 설치한다.

## 업스트림에 보낸 PR

같은 수정을 `main`에도 병합해 두었다. 업스트림이 받아들이면 다음 동기화가 충돌 없이 끝나고, 아래 표의 해당 행은 지운다. 고쳐 달라는 리뷰가 오면 그 브랜치에서 고쳐 포크에 다시 올리고, `main`에도 다시 병합한다.

| PR | 브랜치 | 내용 |
| --- | --- | --- |
| [revfactory/showreel#1](https://github.com/revfactory/showreel/pull/1) | `fix/analyze-beat-drift` | `music_tools.py analyze` 박 주기 다듬기(긴 곡의 박 밀림 33~334ms → 25~27ms), 다운비트 판정을 박 직후 0.1초 저역 평균으로 |
| [revfactory/showreel#2](https://github.com/revfactory/showreel/pull/2) | `fix/finish-share-loudness` | 공유용 오디오를 원본 믹스에서 인코딩, 피크 보정은 원본에서 누적 이득으로(-17.5 → -14.2 LUFS) |
| [revfactory/showreel#3](https://github.com/revfactory/showreel/pull/3) | `docs/skill-script-path` | `SKILL.md`·`references/images.md`의 스크립트 경로를 스킬 폴더(Base directory) 기준으로 |

제안 이슈: [revfactory/showreel#4](https://github.com/revfactory/showreel/issues/4) — BGM을 JS로 작곡하는 선택지(ElevenLabs Music 비용 대안). 방향이 정해지면 `scripts/bgm/`을 선택지 형태로 다시 정리해 PR로 보낸다. 이 포크는 그때까지 JS 작곡만 쓴다.
