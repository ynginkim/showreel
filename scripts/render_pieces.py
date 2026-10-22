#!/usr/bin/env python3
"""최종 렌더를 구간 경계에서 조각으로 나눠 만들고 이어 붙인다.

render.mjs 는 장면 코드가 한 줄만 바뀌어도 이전 청크를 모두 버린다. 긴 영상은 조각으로 나눠 두면 고친 조각만 다시 렌더할 수 있다.

사용법
  render_pieces.py --dir <프로젝트>/reel --out <프로젝트>/out/video.mp4 --cuts 0,51.6,103.2,300
  render_pieces.py --dir <프로젝트>/reel --out <프로젝트>/out/video.mp4 --cuts 0,51.6,103.2,300 --only 2,3
                   [--sub 4] [--format png] [--workers N] [--fps 30]

- 조각은 <out 이름>.pieces/p1.mp4 … 에 남는다. --only 는 그 조각만 다시 렌더하고, 나머지는 있는 파일을 쓴다(없으면 함께 렌더).
- 경계는 '초 × fps'가 정수인 시각이어야 한다(프레임 경계). 아니면 멈춘다.
- 끝나면 프레임 수가 (끝 − 시작) × fps 와 같은지 확인한다.
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def frames(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                        "stream=nb_read_frames", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return int(r.stdout.strip() or 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cuts", required=True, help="쉼표로 구분한 경계 초. 첫 값은 시작, 마지막 값은 끝")
    ap.add_argument("--only", default="", help="다시 렌더할 조각 번호(1부터), 쉼표 구분")
    ap.add_argument("--sub", default="4")
    ap.add_argument("--format", default="png")
    ap.add_argument("--workers")
    ap.add_argument("--fps", type=float, default=30.0)
    a = ap.parse_args()

    cuts = [float(x) for x in a.cuts.split(",") if x.strip()]
    if len(cuts) < 2 or any(b <= c for c, b in zip(cuts, cuts[1:])):
        sys.exit("--cuts 는 2개 이상, 커지는 순서여야 한다")
    bad = [c for c in cuts if abs(c * a.fps - round(c * a.fps)) > 1e-6]
    if bad:
        sys.exit(f"프레임 경계가 아닌 시각: {bad} (초 × {a.fps:g} 가 정수가 되게 고른다)")

    out = Path(a.out).resolve()
    pdir = out.with_suffix("").with_name(out.stem + ".pieces")
    pdir.mkdir(parents=True, exist_ok=True)
    pieces = [(i + 1, c, b, pdir / f"p{i + 1}.mp4") for i, (c, b) in enumerate(zip(cuts, cuts[1:]))]
    only = {int(x) for x in a.only.split(",") if x.strip()}
    if only - {p[0] for p in pieces}:
        sys.exit(f"없는 조각 번호: {sorted(only - {p[0] for p in pieces})}")

    for i, c, b, path in pieces:
        if only and i not in only and path.exists():
            continue
        if not only and path.exists():
            path.unlink()
        cmd = ["node", str(HERE / "render.mjs"), "--dir", a.dir, "--out", str(path), "--sub", a.sub,
               "--format", a.format, "--from", f"{c:g}", "--to", f"{b:g}"]
        if a.workers:
            cmd += ["--workers", a.workers]
        print(f"== 조각 {i}: {c:g}–{b:g}초", flush=True)
        log = path.with_suffix(".log")
        with open(log, "w") as lf:
            rc = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT).returncode
        tail = log.read_text().strip().splitlines()[-1:] or [""]
        print(f"   종료 코드 {rc} · {tail[0]}", flush=True)
        if rc != 0:
            sys.exit(f"조각 {i} 렌더 실패(로그: {log}). 종료 코드 2 는 페이지 오류다")

    lst = pdir / "concat.txt"
    lst.write_text("".join(f"file '{p[3]}'\n" for p in pieces))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
                    "-movflags", "+faststart", str(out)], check=True)
    want = round((cuts[-1] - cuts[0]) * a.fps)
    got = frames(out)
    print(f"→ {out} · 프레임 {got}/{want} {'✓' if got == want else '✗'}")
    if got != want:
        sys.exit(1)


if __name__ == "__main__":
    main()
