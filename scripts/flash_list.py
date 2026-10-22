#!/usr/bin/env python3
"""섬광 전이 목록: motion_check.py 의 섬광 판정과 같은 기준으로, 전이가 생긴 프레임·방향·면적을 모두 보여 준다.

사용법
  flash_list.py <clip.mp4> [<클립 시작 초>]     ← 시작 초를 주면 절대 시각도 함께 찍는다

판정: 이웃 프레임 사이 선형 밝기 변화가 0.1 이상인 면적이 10% 이상이면 전이. 방향이 바뀌는 전이가 1초에 3회를 넘으면 bad window.
"""
import subprocess
import sys

import numpy as np

if len(sys.argv) < 2:
    print(__doc__); sys.exit(1)
path, off = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
W_, H_, fps = 480, 270, 30.0
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W_}:{H_},format=gray", "-f", "rawvideo", "-"],
                     capture_output=True, check=True).stdout
n = len(raw) // (W_ * H_)
v = np.frombuffer(raw[: n * W_ * H_], np.uint8).reshape(n, H_, W_).astype(np.float32) / 255.0
lin = np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
ev = []
for i in range(1, n):
    d = lin[i] - lin[i - 1]
    up, dn = float((d >= 0.1).mean()), float((d <= -0.1).mean())
    if up >= 0.10:
        ev.append((i, 1, up))
    if dn >= 0.10:
        ev.append((i, -1, dn))
fl, last = [], None
for f, s, a in ev:
    if last is not None and s != last:
        fl.append(f); last = None
    else:
        last = s
for f, s, a in ev:
    print(f"{f / fps:7.3f} clip  {f / fps + off:8.3f} abs  {'+' if s > 0 else '-'} area {a:.3f}{'  FLASH' if f in fl else ''}")
bad = sorted({f for f in fl if sum(1 for x in fl if f <= x < f + fps) > 3})
print("flashes", len(fl), "bad windows", [round(f / fps + off, 2) for f in bad])
