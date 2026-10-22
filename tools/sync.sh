#!/bin/bash
# showreel 로컬 수정판: 업스트림(revfactory/showreel) 병합 + 프로젝트 스코프 설치.
#
# 사용
#   tools/sync.sh                          업스트림 확인·병합 → 의존성 → 설치(기본 설치 위치: ../.claude/skills/showreel)
#   tools/sync.sh --install-to <폴더>      설치 위치 지정
#   tools/sync.sh --session-start          Claude Code SessionStart 훅용. 짧게 한두 줄만 출력하고 실패해도 0 으로 끝난다
#   tools/sync.sh --no-fetch               네트워크 없이 설치만
#
# 규칙(CUSTOM.md 참고)
#   - main = upstream/main + 로컬 수정. 업스트림 새 커밋은 main 에 merge 한다(rebase 하지 않는다).
#   - 작업 트리가 지저분하거나 merge 중이면 병합을 건너뛴다(설치는 지금 상태로 한다).
#   - 충돌이 나면 merge 를 되돌리고 알린다. 해결은 CUSTOM.md 의 의도를 지키며 사람이(또는 Claude 가) 한다.
#   - 설치본은 생성물이다. 수정은 항상 이 저장소에서 한다.

set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST=""
FETCH=1
HOOK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --install-to) DEST="$2"; shift 2 ;;
    --no-fetch) FETCH=0; shift ;;
    --session-start) HOOK=1; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done
[ -n "$DEST" ] || DEST="${CLAUDE_PROJECT_DIR:-$(dirname "$REPO")}/.claude/skills/showreel"

notes=()
warn() { notes+=("$1"); }
fail() { echo "showreel sync: $1"; [ "$HOOK" = 1 ] && exit 0; exit 1; }

cd "$REPO" || fail "저장소가 없다: $REPO"
git rev-parse --git-dir >/dev/null 2>&1 || fail "git 저장소가 아니다: $REPO"
export GIT_TERMINAL_PROMPT=0

# 1) 업스트림 확인·병합
if [ "$FETCH" = 1 ]; then
  if perl -e 'alarm shift; exec @ARGV' 25 git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 fetch -q upstream 2>/dev/null; then
    behind=$(git rev-list --count main..upstream/main 2>/dev/null || echo 0)
    if [ "$behind" -gt 0 ]; then
      branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
      if [ "$branch" != "main" ]; then
        warn "업스트림 새 커밋 ${behind}개 — 지금 브랜치가 main 이 아니라($branch) 병합을 건너뜀"
      elif [ -n "$(git status --porcelain --untracked-files=no)" ] || [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
        warn "업스트림 새 커밋 ${behind}개 — 로컬 수정이 커밋되지 않아 병합을 건너뜀(커밋 후 tools/sync.sh)"
      else
        up=$(git rev-parse --short upstream/main)
        if git merge -q --no-edit -m "Sync upstream revfactory/showreel @ ${up}" upstream/main >/dev/null 2>&1; then
          warn "업스트림 새 커밋 ${behind}개를 병합함(@ ${up}). 바뀐 내용: git -C $REPO log --oneline ORIG_HEAD..upstream/main"
        else
          files=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
          git merge --abort >/dev/null 2>&1
          warn "업스트림 새 커밋 ${behind}개가 로컬 수정과 충돌해 병합을 되돌림(충돌 파일: ${files}). CUSTOM.md 의 의도를 지키며 해결한 뒤 tools/sync.sh"
        fi
      fi
    fi
  else
    warn "업스트림 확인 실패(네트워크?) — 지금 상태로 설치"
  fi
fi

# 2) 의존성(렌더러용 playwright-core)
lock="scripts/package-lock.json"; stamp="scripts/node_modules/.sync-stamp"
if [ ! -d scripts/node_modules ] || [ "$lock" -nt "$stamp" ]; then
  if (cd scripts && npm install --silent >/dev/null 2>&1); then
    touch "$stamp"; warn "scripts/ 의존성 설치함(npm install)"
  else
    warn "npm install 실패 — 렌더러가 동작하지 않을 수 있다"
  fi
fi

# 3) 설치(생성물)
mkdir -p "$DEST" || fail "설치 위치를 만들 수 없다: $DEST"
rsync -a --delete --exclude .git --exclude .github --exclude docs --exclude evals --exclude __pycache__ \
  --exclude .installed-from "$REPO"/ "$DEST"/ || fail "rsync 실패"
head=$(git rev-parse --short HEAD)
dirty=$([ -n "$(git status --porcelain)" ] && echo "(커밋 안 된 수정 포함)" || echo "")
ahead=$(git rev-list --count upstream/main..main 2>/dev/null || echo "?")
cat > "$DEST/.installed-from" <<EOF
생성물이다. 수정하지 말고 원본에서 고친 뒤 tools/sync.sh 를 돌린다.
source: $REPO
commit: $head $dirty
local_commits_over_upstream: $ahead
installed_at: $(date '+%Y-%m-%d %H:%M:%S')
EOF

summary="showreel: 설치 $head${dirty:+ $dirty} · 업스트림 위 로컬 커밋 ${ahead}개 → ${DEST/#$HOME/~}"
if [ "$HOOK" = 1 ]; then
  [ ${#notes[@]} -gt 0 ] && { echo "$summary"; printf '  - %s\n' "${notes[@]}"; }
  exit 0
fi
echo "$summary"
[ ${#notes[@]} -gt 0 ] && printf '  - %s\n' "${notes[@]}"
exit 0
