#!/usr/bin/env python3
"""공용 효과음 라이브러리: 프로젝트마다 만든 효과음을 모아 두고 다음 프로젝트에서 다시 쓴다(ElevenLabs 크레딧 절약).

사용법
  sfx_library.py find 종이 연필                  이름·프롬프트·태그에서 찾는다(여러 단어는 모두 포함)
  sfx_library.py list [--tag paper]             전체 목록
  sfx_library.py use paper_whoosh stamp --to <프로젝트>   <프로젝트>/audio/sfx/ 로 복사하고 list.tsv 에 프롬프트를 남긴다
  sfx_library.py add <프로젝트>                  <프로젝트>/audio/sfx/ 의 효과음을 라이브러리에 등록한다(내용이 같으면 건너뜀)

라이브러리 위치: --lib > 환경 변수 SHOWREEL_SFX_LIBRARY > $CLAUDE_PROJECT_DIR/sfx-library
라이브러리 구조: files/<이름>.<확장자>, index.json(이름·길이·프롬프트·태그·출처·해시), INDEX.md(사람이 읽는 표)

프롬프트는 프로젝트의 audio/sfx/list.tsv(이름<TAB>길이<TAB>프롬프트)에서, 없으면 assets/sfx_presets.json(sfx-kit 프리셋)에서 가져온다.
같은 이름에 다른 소리가 들어오면 <이름>__<출처 프로젝트> 로 등록한다. script.json 에서는 use 로 복사한 파일 이름을 쓴다.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
EXTS = (".mp3", ".wav")
TAGS = {   # 프롬프트·이름의 단어 → 태그. 단어 경계로 맞춘다("flipping" 안의 ping, "ticket" 안의 tick 이 걸리지 않게)
    "paper": r"\b(paper|cards?|pages?|sheets?|tickets?|receipts?)\b",
    "pencil": r"\b(pencils?|pens?|scribbl\w*|markers?|draw\w*)\b",
    "ui": r"\b(ui|clicks?|ticks?|blips?|checkbox\w*|pops?)\b",
    "bell": r"\b(bells?|chimes?|ping|ding|glassy)\b",
    "mechanical": r"\b(mechanical|levers?|switch\w*|printers?|printing|motors?|flaps?|split-flap|stamps?|clatter|metal\w*)\b",
    "transport": r"\b(trams?|trains?|railway|stations?)\b",
    "impact": r"\b(impacts?|hits?|booms?|thump\w*|slam\w*|stamps?)\b",
    "whoosh": r"\b(whoosh\w*|swoosh\w*|swell\w*|risers?|glid\w*)\b",
    "error": r"\b(errors?|buzz\w*|fail\w*)\b",
    "string": r"\b(ropes?|strings?|twang|taut)\b",
}


def lib_dir(a):
    p = a.lib or os.environ.get("SHOWREEL_SFX_LIBRARY") or (
        os.path.join(os.environ["CLAUDE_PROJECT_DIR"], "sfx-library") if os.environ.get("CLAUDE_PROJECT_DIR") else None)
    if not p:
        sys.exit("라이브러리 위치를 모른다: --lib 또는 SHOWREEL_SFX_LIBRARY 를 준다")
    d = Path(p).expanduser().resolve()
    (d / "files").mkdir(parents=True, exist_ok=True)
    return d


def load(d):
    f = d / "index.json"
    return json.loads(f.read_text()) if f.exists() else []


def save(d, idx):
    idx.sort(key=lambda e: e["name"])
    for e in idx:   # 태그는 이름·프롬프트에서 늘 다시 계산한다(규칙을 고치면 전체에 반영)
        e["tags"] = tags_for(e["name"].split("__")[0], e["prompt"])
    (d / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1))
    lines = ["# 공용 효과음 라이브러리", "", f"{len(idx)}개 · `sfx_library.py find <단어>`로 찾고 `use <이름> --to <프로젝트>`로 복사한다.", "",
             "| 이름 | 길이 | 태그 | 프롬프트 | 출처 |", "| --- | --- | --- | --- | --- |"]
    for e in idx:
        lines.append(f"| `{e['name']}` | {e['duration']:.1f}s | {', '.join(e['tags'])} | {e['prompt'] or '(기록 없음)'} | {e['source']} |")
    (d / "INDEX.md").write_text("\n".join(lines) + "\n")


def duration(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def sha1(f):
    return hashlib.sha1(Path(f).read_bytes()).hexdigest()


def tags_for(name, prompt):
    text = f"{name} {prompt}".lower().replace("_", " ")
    return sorted(t for t, rx in TAGS.items() if re.search(rx, text))


def prompts_of(sfx_dir):
    out = {}
    tsv = sfx_dir / "list.tsv"
    if tsv.exists():
        for line in tsv.read_text().splitlines():
            parts = line.split("\t")
            if len(parts) >= 3 and parts[0].strip():
                out[parts[0].strip()] = parts[2].strip()
    return out


def presets():
    p = SKILL / "assets" / "sfx_presets.json"
    return {x["name"]: x.get("prompt", "") for x in json.loads(p.read_text())} if p.exists() else {}


def cmd_add(a):
    d = lib_dir(a)
    proj = Path(a.project).expanduser().resolve()
    sd = proj / "audio" / "sfx"
    if not sd.is_dir():
        sys.exit(f"효과음 폴더가 없다: {sd}")
    idx = load(d)
    by_hash = {e["sha1"]: e for e in idx}
    names = {e["name"] for e in idx}
    tsv, pre = prompts_of(sd), presets()
    added = skipped = 0
    for f in sorted(p for p in sd.iterdir() if p.suffix.lower() in EXTS):
        h = sha1(f)
        if h in by_hash:
            skipped += 1
            continue
        base = f.stem
        prompt = tsv.get(base) or pre.get(base, "")
        name = base if base not in names else f"{base}__{proj.name}"
        dest = d / "files" / f"{name}{f.suffix.lower()}"
        shutil.copy2(f, dest)
        e = {"name": name, "file": f"files/{dest.name}", "duration": round(duration(dest), 2), "prompt": prompt,
             "prompt_from": "list.tsv" if base in tsv else ("sfx_presets.json" if base in pre else ""),
             "tags": tags_for(base, prompt), "source": proj.name, "sha1": h, "added": time.strftime("%Y-%m-%d")}
        idx.append(e)
        by_hash[h] = e
        names.add(name)
        added += 1
        print(f"+ {name}  {e['duration']:.1f}s  [{', '.join(e['tags'])}]  {prompt[:70]}")
    save(d, idx)
    print(f"등록 {added}개 · 이미 있음 {skipped}개 → {d}")


def match(e, words, tag=None):
    if tag and tag not in e["tags"]:
        return False
    hay = f"{e['name']} {e['prompt']} {' '.join(e['tags'])}".lower()
    return all(w.lower() in hay for w in words)


KO = {"종이": "paper", "연필": "pencil", "펜": "pen", "종": "bell", "차임": "chime", "기계": "mechanical", "레버": "lever",
      "프린터": "printer", "도장": "stamp", "기차": "train", "열차": "tram", "타격": "impact", "휙": "whoosh", "오류": "error",
      "클릭": "click", "틱": "tick", "줄": "string", "플랩": "flap", "카드": "card"}


def cmd_find(a):
    d = lib_dir(a)
    words = [KO.get(w, w) for w in a.words]
    hits = [e for e in load(d) if match(e, words, a.tag)]
    for e in hits:
        print(f"{e['name']:<22} {e['duration']:5.1f}s  [{', '.join(e['tags'])}]  {e['prompt']}")
    if not hits:
        print("없음. 새로 만들 때는 eleven.py sfx \"<프롬프트>\" 를 쓰고, 납품 뒤 sfx_library.py add <프로젝트> 로 등록한다")


def cmd_list(a):
    a.words = []
    cmd_find(a)


def cmd_use(a):
    d = lib_dir(a)
    idx = {e["name"]: e for e in load(d)}
    proj = Path(a.to).expanduser().resolve()
    sd = proj / "audio" / "sfx"
    sd.mkdir(parents=True, exist_ok=True)
    tsv = sd / "list.tsv"
    have = prompts_of(sd)
    rows = []
    for n in a.names:
        e = idx.get(n)
        if not e:
            print(f"✗ 라이브러리에 없다: {n} (sfx_library.py find 로 찾는다)")
            continue
        src = d / e["file"]
        dest = sd / f"{n}{src.suffix}"
        if dest.exists() and sha1(dest) != e["sha1"]:
            print(f"✗ {dest.name} 가 이미 있고 내용이 다르다 — 덮어쓰지 않음")
            continue
        shutil.copy2(src, dest)
        if n not in have:
            rows.append(f"{n}\t{e['duration']}\t{e['prompt']}\n")
        print(f"→ {dest.relative_to(proj)}  {e['duration']:.1f}s  (출처 {e['source']})")
    if rows:
        with open(tsv, "a") as fh:
            fh.writelines(rows)


def main():
    ap = argparse.ArgumentParser(description="공용 효과음 라이브러리")
    ap.add_argument("--lib")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("add"); p.add_argument("project"); p.set_defaults(fn=cmd_add)
    p = sub.add_parser("find"); p.add_argument("words", nargs="+"); p.add_argument("--tag"); p.set_defaults(fn=cmd_find)
    p = sub.add_parser("list"); p.add_argument("--tag"); p.set_defaults(fn=cmd_list)
    p = sub.add_parser("use"); p.add_argument("names", nargs="+"); p.add_argument("--to", required=True); p.set_defaults(fn=cmd_use)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
