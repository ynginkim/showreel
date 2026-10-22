#!/usr/bin/env python3
"""납품 뒤 정리: 다시 만들 수 있는 작업 파일을 지운다. 규칙은 references/qa.md 의 '납품 뒤 정리'.

사용법
  cleanup.py <프로젝트>              지울 목록과 크기만 보여 준다(기본)
  cleanup.py <프로젝트> --apply      지운다
  cleanup.py <프로젝트> --apply --trash   지우지 않고 ~/.Trash/showreel-cleanup-<프로젝트>-<시각>/ 으로 옮긴다

납품본(out/ 의 *_포스터.jpg 와 이름이 같은 파일)이 없으면 아무것도 하지 않는다(--force 로 무시).
"""
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

MEDIA = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".flac"}
IMAGE = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def size(p):
    if p.is_dir():
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
    return p.stat().st_size


def mb(n):
    return f"{n / 1048576:8.1f}MB"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--trash", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    root = Path(a.project).expanduser().resolve()
    out = root / "out"

    stems = sorted(p.name[: -len("_포스터.jpg")] for p in out.glob("*_포스터.jpg")) if out.is_dir() else []
    if not stems and not a.force:
        sys.exit("납품본(out/*_포스터.jpg)이 없다. 납품 전이면 정리하지 않는다(--force 로 무시).")

    def deliverable(p):
        return p.parent == out and any(p.name.startswith(s) for s in stems)

    music_keep = set()
    sj = root / "script.json"
    if sj.exists():
        m = (json.loads(sj.read_text()).get("music") or {}).get("file")
        if m:
            music_keep.add((root / m).resolve())

    todo = []   # (분류, 경로)
    if out.is_dir():
        for d in sorted(out.rglob("*")):
            if d.is_dir() and d.suffix in (".parts", ".pieces"):
                todo.append(("out 렌더 조각", d))
        for f in sorted(out.rglob("*")):
            if f.is_file() and f.suffix.lower() in MEDIA and not deliverable(f) \
                    and not any(part.endswith((".parts", ".pieces")) for part in f.relative_to(out).parts[:-1]):
                todo.append(("out 초안·점검 영상", f))
    aud = root / "audio"
    if aud.is_dir():
        for f in sorted(aud.glob("mix*.wav")):
            todo.append(("audio 믹스(mix.py 로 재생성)", f))
        mus = aud / "music"
        if mus.is_dir():
            for f in sorted(mus.rglob("*")):
                if f.is_file() and f.suffix.lower() in AUDIO and f.resolve() not in music_keep:
                    todo.append(("audio/music 안 쓴 테이크·테스트", f))
    qa = root / "qa"
    if qa.is_dir():
        for f in sorted(qa.rglob("*")):
            if not f.is_file():
                continue
            ext = f.suffix.lower()
            if ext in MEDIA | AUDIO or (ext in IMAGE and not (f.parent == qa and f.name.startswith("final_sheet"))):
                todo.append(("qa 스틸·시트·클립", f))

    total = 0
    by = {}
    for cat, p in todo:
        s = size(p)
        total += s
        by[cat] = by.get(cat, 0) + s
    for cat, s in by.items():
        print(f"{mb(s)}  {cat}")
    print(f"{mb(total)}  합계 · {len(todo)}개 · 남기는 납품본: {', '.join(stems) or '(없음)'}")
    if not a.apply:
        print("목록만 보였다. 지우려면 --apply (휴지통은 --trash)")
        for cat, p in todo[:40]:
            print(f"  {cat}: {p.relative_to(root)}")
        if len(todo) > 40:
            print(f"  … 외 {len(todo) - 40}개")
        return

    dest = None
    if a.trash:
        dest = Path.home() / ".Trash" / f"showreel-cleanup-{root.name}-{time.strftime('%Y%m%d-%H%M%S')}"
    for _, p in todo:
        if not p.exists():
            continue
        if dest:
            t = dest / p.relative_to(root)
            t.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(p), str(t))
        elif p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()
    for d in sorted((x for x in (qa, out) if x.is_dir()), reverse=True):   # 빈 폴더 정리
        for sub in sorted(d.rglob("*"), key=lambda x: len(x.parts), reverse=True):
            if sub.is_dir() and not any(sub.iterdir()):
                sub.rmdir()
    print(f"{'휴지통으로 옮겼다 → ' + str(dest) if dest else '지웠다'} · {mb(total).strip()}")


if __name__ == "__main__":
    main()
