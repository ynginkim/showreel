#!/usr/bin/env python3
"""bgm/verify.py: measure a rendered BGM (render.mjs output) against its own score.

  python3 verify.py <music.wav> [--analysis analysis.json] [--meta music.meta.json] [--out-dir DIR]
                    [--bars 136-148] [--waveform-png [PNG]] [--spec 0,40,120] [--mix timeline.json]

Reads <wav-stem>.meta.json (written by render.mjs: grid, sections, accents, narration gaps, kick/boom onsets, master
report) and prints:
  [loudness]  integrated LUFS / true peak / LRA (ffmpeg ebur128), sample peak, DC, clipped samples, fade-out tail
  [grid]      analysis.json beats/downbeats vs the score grid (should be exact to the 1 ms rounding)
  [onsets]    onset of every kick and boom (averaged template + per-hit cross-correlation, < 200 Hz) and of each
              declared accent (50% rise of the analytic envelope) vs its grid time: proves the audio sits on the grid
  [energy]    2-s momentary loudness bar chart with section starts and narration gaps, mean loudness per section vs
              the declared energy (rank correlation), and a per-bar table around the strongest accent (or --bars)
  --waveform-png  one panel per accent: waveform, beats (grey), downbeats (blue), accent (red), measured attack (green)
  --spec      spectrogram PNGs (20 s from each listed second)
  --mix       runs scripts/mix.py on the timeline into DIR/mix_test.wav and summarises narration-over-bed per line
Outputs go to --out-dir (default: <wav dir>/verify). Needs ffmpeg and numpy only.
"""
import argparse
import json
import re
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent
SR = 48000


def decode(path, sr=SR, ch=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", str(ch), "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    return x.reshape(-1, ch) if ch > 1 else x


class Grid:
    def __init__(self, g):
        self.beat_s, self.t0 = g["beat"], g.get("t0", 0.0)
        self.bpb, self.fd = g.get("beatsPerBar", 4), g.get("firstDownbeat", 0)

    def beat(self, n):
        return self.t0 + n * self.beat_s

    def bar(self, k, b=0.0):
        return self.beat(self.fd + self.bpb * k + b)

    def bar_of(self, t):
        return (t - self.t0) / self.beat_s / self.bpb - self.fd / self.bpb


def grid_from_analysis(a):
    b = np.array(a["beats"]); d = np.array(a["downbeats"])
    per = float(np.polyfit(np.arange(len(b)), b, 1)[0])
    n0 = int(round((d[0] - b[0]) / per))
    return {"beat": per, "t0": float(b[0]), "beatsPerBar": 4, "firstDownbeat": n0}


# ---------------------------------------------------------------- loudness
def loudness(wav, meta):
    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(wav), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    summ = r[r.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
    lra = float(re.search(r"LRA:\s+([\d.]+) LU", summ).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ).group(1))
    M = [(float(m.group(1)), float(m.group(2))) for m in re.finditer(r"t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.inf]+)", r)]
    x = decode(wav)
    peak = 20 * np.log10(np.abs(x).max() + 1e-12)
    dc = x.mean(0)
    clip = int((np.abs(x) >= 0.9999).sum())
    tgt = (meta.get("master") or {}).get("target") or {"lufs": -13.0, "ceiling": -1.35}
    ok_i = abs(I - tgt["lufs"]) <= 0.5
    ok_tp = tp <= -1.0
    print(f"[loudness] integrated {I:.1f} LUFS (target {tgt['lufs']}) {'✓' if ok_i else '✗'} · true peak {tp:.1f} dBTP {'✓' if ok_tp else '✗ (> -1.0)'} · "
          f"LRA {lra:.1f} LU · sample peak {peak:.2f} dBFS · DC {dc[0]:.1e}/{dc[1]:.1e} · clipped samples {clip}")
    fo = (meta.get("master") or {}).get("fadeOut")
    if fo:
        a, b = fo
        tail = 20 * np.log10(np.abs(x[int((b - 1.0) * SR):int(b * SR)]).max() + 1e-12)
        after = float(np.abs(x[int(b * SR):]).max()) if int(b * SR) < len(x) else 0.0
        print(f"[loudness] fade-out {a:.2f}-{b:.2f} s: last second before it peaks {tail:.1f} dBFS, after it max |x| {after:.1e} · length {len(x) / SR:.3f} s")
    lim = (meta.get("master") or {}).get("limiterOver1_5dB") or []
    if lim:
        worst = sorted(lim, key=lambda v: v[1])[:6]
        print("[loudness] limiter gain reduction > 1.5 dB at (s:dB): " + " ".join(f"{s}:{g}" for s, g in worst)
              + ("  <- the biggest hit is being flattened; lower its peaky layers (boom/kick/stab) rather than the target" if worst[0][1] < -4 else ""))
    return I, M, x


# ---------------------------------------------------------------- grid + onsets
def grid_check(a, G):
    if not a:
        return
    b = np.array(a["beats"]); d = np.array(a["downbeats"])
    nb = np.round((b - G.t0) / G.beat_s)
    eb = np.abs(b - G.beat(nb)).max() * 1000
    kd = np.round(G.bar_of(d))
    ed = np.abs(d - G.bar(kd)).max() * 1000
    print(f"[grid] analysis.json: {a['bpm']} BPM, {len(b)} beats (max |beat - grid| {eb:.2f} ms), {len(d)} downbeats (max {ed:.2f} ms), "
          f"first downbeat {d[0]:.3f} s, {len(a['hits'])} hits {'✓' if eb <= 0.6 and ed <= 0.6 else '✗ (not written from this grid)'}")


def analytic_env(X, n):
    """|analytic signal| from a one-sided spectrum: a smooth amplitude envelope, also for 50-100 Hz content"""
    full = np.zeros(n, complex); m = len(X); full[:m] = X; full[1:m - (1 if n % 2 == 0 else 0)] *= 2
    return np.abs(np.fft.ifft(full))


def crossing(env, s, pre_a=0.06, pre_b=0.015, post=0.04, frac=0.5):
    """onset = first sample after s-pre_b where env passes pre + frac*(peak - pre); returns (offset s, rise dB)"""
    a, b, c = s - int(pre_a * SR), s - int(pre_b * SR), s + int(post * SR)
    if a < 0 or c > len(env):
        return None, 0.0
    pre = float(np.median(env[a:b])); w = env[b:c]; pk = float(w[int(pre_b * SR) - int(0.005 * SR):].max())
    k = int(np.argmax(w > pre + frac * (pk - pre)))
    return (b + k - s) / SR, 20 * np.log10(pk / (pre + 1e-12))


def template_offsets(low, times):
    """repeated hits (kick, boom): average the aligned low-band waveform, find the template's onset on its envelope,
    then each hit's lag against the template by cross-correlation (robust when bass and pads overlap the hit)"""
    pre, W = int(0.03 * SR), int(0.08 * SR)
    ss = [int(round(t * SR)) for t in times if int(round(t * SR)) - pre >= 0 and int(round(t * SR)) + W <= len(low)]
    if len(ss) < 4:
        return None
    segs = np.array([low[s - pre:s + W] for s in ss])
    tm = segs.mean(0)
    n = 1 << int(np.ceil(np.log2(len(tm) * 4)))
    env = analytic_env(np.fft.rfft(tm, n), n)[:len(tm)]
    base = float(np.median(env[:int(0.02 * SR)])); pk = float(env[pre - int(0.005 * SR):].max())
    a0 = (int(np.argmax(env[int(0.015 * SR):] > base + 0.5 * (pk - base))) + int(0.015 * SR) - pre) / SR
    core = tm[pre - int(0.005 * SR):pre + int(0.05 * SR)]
    rel = []
    for sg in segs:
        cc = np.correlate(sg[pre - int(0.01 * SR):pre + int(0.06 * SR)], core, mode="valid")
        i = int(np.argmax(cc))
        if 0 < i < len(cc) - 1:
            y0, y1, y2 = cc[i - 1], cc[i], cc[i + 1]
            den = y0 - 2 * y1 + y2
            i = i + (0.5 * (y0 - y2) / den if den != 0 else 0)
        rel.append((i - int(0.005 * SR)) / SR)
    return a0 + np.array(rel)


def onsets(x, meta, G):
    mono = x.mean(1).astype(np.float64)
    n = len(mono); X = np.fft.rfft(mono); f = np.fft.rfftfreq(n, 1 / SR)
    lowX = X / np.sqrt(1 + (f / 200.0) ** 8)
    low = np.fft.irfft(lowX, n)
    envF = analytic_env(X, n)
    for name in ("kick",):
        ts = (meta.get("onsets") or {}).get(name) or []
        d = template_offsets(low, ts)
        if d is None:
            continue
        d = d * 1000
        print(f"[onsets] {name}: {len(d)} hits, offset vs grid median {np.median(d):+.2f} ms, max |{np.abs(d).max():.2f}| ms "
              f"{'✓' if np.abs(d).max() <= 5 else '✗'} (averaged-{name} template onset + per-hit cross-correlation, low band < 200 Hz)")
    res = []
    for a in sorted(meta.get("accents") or [], key=lambda a: a["t"]):
        off, rise = crossing(envF, int(round(a["t"] * SR)))
        if off is None:
            res.append((a, (None, 0.0, "full"))); continue
        tt = a["t"] + off
        res.append((a, (tt, rise, "full")))
        dev = off * 1000
        mark = "soft (no sharp attack)" if rise < 8 else ("✓" if abs(dev) <= 5 else "✗")
        print(f"[onsets] accent {a.get('name', '')[:34]:34s} bar {G.bar_of(a['t']):7.2f} t {a['t']:8.3f}  onset {dev:+6.2f} ms (rise {rise:4.1f} dB) {mark}")
    return res


# ---------------------------------------------------------------- energy
def energy(M, meta, G, bars_arg):
    t = np.array([m[0] for m in M]); m = np.array([m[1] for m in M])
    p = 10 ** (np.where(np.isfinite(m), m, -120) / 10)
    secs = sorted(meta.get("sections") or [], key=lambda s: s["t"])
    gaps = meta.get("gaps") or []
    dur = meta.get("duration") or (t[-1] if len(t) else 0)

    def mean_lu(a, b):
        sel = (t > a + 0.4) & (t <= b)
        return 10 * np.log10(p[sel].mean() + 1e-12) if sel.any() else float("nan")

    def sec_at(tt):
        cur = secs[0] if secs else None
        for s in secs:
            if s["t"] <= tt + 1e-6:
                cur = s
        return cur

    print("\n[energy] 2-s momentary loudness (LUFS); 1 # = 1 dB above -30; G = narration gap; | = section start")
    last = None
    for a in np.arange(0, dur - 0.5, 2.0):
        lu = mean_lu(a, a + 2.0)
        s = sec_at(a + 1.0)
        gap = any(g0 <= a + 1.0 < g1 for g0, g1 in gaps)
        label = f"{s['name']} (e={s.get('energy', float('nan')):.2f})" if s is not None and s is not last else ""
        print(f"{a:6.1f} {lu:6.1f} {'|' if label else ' '}{'G' if gap else ' '} {'#' * max(0, int(round(lu + 30))):<26s} {label}")
        last = s
    if secs:
        print("\n[energy] per section: mean momentary loudness vs declared energy")
        rows = []
        for i, s in enumerate(secs):
            a = s["t"]; b = secs[i + 1]["t"] if i + 1 < len(secs) else dur - 1.0
            lu = mean_lu(a, b)
            rows.append((s.get("energy"), lu))
            print(f"  {s['name'][:26]:26s} {a:7.2f}-{b:7.2f}  e={s.get('energy', float('nan')):.2f}  {lu:6.1f} LUFS  {'#' * max(0, int(round((lu + 26) * 1.5)))}")
        e = np.array([r[0] for r in rows if r[0] is not None and np.isfinite(r[1])], float)
        l = np.array([r[1] for r in rows if r[0] is not None and np.isfinite(r[1])], float)
        if len(e) >= 3:
            rk = lambda v: np.argsort(np.argsort(v)).astype(float)
            rho = np.corrcoef(rk(e), rk(l))[0, 1]
            print(f"  rank correlation energy vs loudness: {rho:+.2f} {'✓' if rho >= 0.8 else '△ (sections do not follow the declared energy)'}")
    acc = meta.get("accents") or []
    if bars_arg:
        k0, k1 = [int(v) for v in bars_arg.split("-")]
    elif acc:
        top = max(acc, key=lambda a: a.get("strength", 0.5))
        kt = int(round(G.bar_of(top["t"])))
        k0, k1 = kt - 6, kt + 5
    else:
        return
    print(f"\n[energy] per bar {k0}-{k1} (momentary mean / max); * = accent bar")
    acc_bars = {int(round(G.bar_of(a["t"]))) for a in acc}
    for k in range(k0, k1 + 1):
        a, b = G.bar(k), G.bar(k + 1)
        if b <= 0 or a >= dur:
            continue
        sel = (t > a + 0.4) & (t <= b)
        if not sel.any():
            continue
        lu = 10 * np.log10(p[sel].mean() + 1e-12)
        print(f"  bar {k:4d} {a:8.3f}{'*' if k in acc_bars else ' '} mean {lu:6.1f}  max {m[sel].max():6.1f}  {'#' * max(0, int(round(lu + 30)))}")


# ---------------------------------------------------------------- waveform PNG (no matplotlib: tiny PNG writer + 3x5 digits)
FONT = {"0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
        "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
        ".": "000000000000010", "-": "000000111000000", "s": "000011010001110", "#": "101111101111101", " ": "000000000000000"}


def text(img, x, y, s, col, scale=2):
    for ch in s:
        g = FONT.get(ch, FONT[" "])
        for r in range(5):
            for c in range(3):
                if g[r * 3 + c] == "1":
                    img[y + r * scale:y + (r + 1) * scale, x + c * scale:x + (c + 1) * scale] = col
        x += 4 * scale


def write_png(path, img):
    h, w, _ = img.shape
    raw = b"".join(b"\x00" + img[r].tobytes() for r in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                          + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def waveform_png(x, meta, G, results, path):
    acc = [r for r in results]
    if not acc:
        print("[waveform] no accents declared"); return
    W, H, pad = 1400, 170, 6
    img = np.full(((H + pad) * len(acc) + pad, W, 3), 18, np.uint8)
    mono = x.mean(1)
    span = 2.0 * G.beat_s
    gpk = max(1e-6, max(np.abs(mono[max(0, int((a["t"] - span) * SR)):int((a["t"] + span) * SR)]).max() for a, _ in acc))   # one scale for all panels
    for pi, (a, (tt, rise, band)) in enumerate(acc):
        y0 = pad + pi * (H + pad)
        t0, t1 = a["t"] - span, a["t"] + span
        tx = lambda tq: int(round((tq - t0) / (t1 - t0) * (W - 1)))
        panel = img[y0:y0 + H]
        panel[:] = 26
        n = int(np.floor((t0 - G.t0) / G.beat_s)) - 1
        while G.beat(n) <= t1:
            bt = G.beat(n)
            if bt >= t0:
                is_db = (n - G.fd) % G.bpb == 0
                panel[:, tx(bt)] = (70, 110, 210) if is_db else (70, 70, 70)
            n += 1
        s0, s1 = max(0, int(t0 * SR)), min(len(mono), int(t1 * SR))
        seg = mono[s0:s1]
        if len(seg):
            pk = gpk
            cols = np.array_split(seg, W)
            mid = H // 2
            for c, v in enumerate(cols):
                if len(v) == 0:
                    continue
                lo = int(mid - v.max() / pk * (mid - 8)); hi = int(mid - v.min() / pk * (mid - 8))
                panel[max(0, lo):min(H, hi + 1), c] = (200, 200, 190)
        panel[:, tx(a["t"])] = (230, 60, 50)
        if tt is not None and t0 <= tt <= t1:
            panel[:, min(W - 1, tx(tt) + 1)] = (60, 220, 90)
        text(panel, 8, 8, f"{pi + 1} {a['t']:.3f}s", (235, 235, 235))
        print(f"[waveform] panel {pi + 1}: {a.get('name', '')} at {a['t']:.3f} s (red = grid time, green = measured attack, blue = downbeats)")
    write_png(path, img)
    print(f"[waveform] wrote {path}")


# ---------------------------------------------------------------- spectrograms, test mix
def spectrograms(wav, times, out):
    for x in times:
        p = out / f"spec_{x:g}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(x), "-t", "20", "-i", str(wav), "-lavfi",
                        "showspectrumpic=s=1600x600:legend=1:fscale=log:start=20:stop=20000", str(p)], check=True)
        print(f"[spec] {p}")


def test_mix(timeline, wav, out):
    tl = json.loads(Path(timeline).read_text())
    mf = (tl.get("music") or {}).get("file")
    if mf:
        mp = Path(mf) if Path(mf).is_absolute() else Path(timeline).resolve().parent / mf
        if mp.resolve() != Path(wav).resolve():
            print(f"[mix] ! timeline music.file is {mp}, not the verified WAV; the test mix uses the timeline's file")
    dst = out / "mix_test.wav"
    r = subprocess.run([sys.executable, str(SCRIPTS / "mix.py"), str(timeline), "--out", str(dst)], capture_output=True, text=True)
    (out / "mix_test_report.txt").write_text(r.stdout + r.stderr)
    rows = [(m.group(1), float(m.group(2)), m.group(3)) for m in re.finditer(r"^(\S+)\s+(-?[\d.]+)dB\s+(✓|△|✗)", r.stdout, re.M)]
    if not rows:
        print("[mix] no narration table (no narration, or mix.py failed); see " + str(out / "mix_test_report.txt")); return
    lo = min(rows, key=lambda v: v[1]); hi = max(rows, key=lambda v: v[1])
    bad = [f"{i} {d:.1f}dB {m}" for i, d, m in rows if m != "✓"]
    print(f"[mix] {len(rows)} narration lines: {sum(1 for v in rows if v[2] == '✓')} ✓ · VO over bed min {lo[1]:.1f} dB ({lo[0]}) · max {hi[1]:.1f} dB ({hi[0]})"
          + (f" · not ✓: {', '.join(bad)}" if bad else ""))
    print(f"[mix] {dst}  (report: {out / 'mix_test_report.txt'})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav")
    ap.add_argument("--analysis")
    ap.add_argument("--meta")
    ap.add_argument("--out-dir")
    ap.add_argument("--bars", help="per-bar loudness table for bars A-B (default: around the strongest accent)")
    ap.add_argument("--waveform-png", nargs="?", const="", help="PNG of every accent with the grid marked (default name in --out-dir)")
    ap.add_argument("--spec", help="comma-separated start seconds for 20-s spectrograms")
    ap.add_argument("--mix", help="timeline.json for a test mix through scripts/mix.py")
    a = ap.parse_args()
    wav = Path(a.wav).resolve()
    out = Path(a.out_dir).resolve() if a.out_dir else wav.parent / "verify"
    out.mkdir(parents=True, exist_ok=True)
    meta_p = Path(a.meta) if a.meta else wav.with_name(wav.stem + ".meta.json")
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
    if not meta:
        print(f"! {meta_p} not found: sections, accents and onsets come from render.mjs; only loudness and the analysis grid are checked")
    an = json.loads(Path(a.analysis).read_text()) if a.analysis else None
    G = Grid(meta["grid"]) if meta.get("grid") else (Grid(grid_from_analysis(an)) if an else None)
    I, M, x = loudness(wav, meta)
    if G is None:
        return
    grid_check(an, G)
    results = onsets(x, meta, G) if meta else []
    energy(M, meta, G, a.bars)
    if a.waveform_png is not None:
        waveform_png(x, meta, G, results, Path(a.waveform_png) if a.waveform_png else out / "hits_waveform.png")
    if a.spec:
        spectrograms(wav, [float(v) for v in a.spec.split(",")], out)
    if a.mix:
        test_mix(a.mix, wav, out)


if __name__ == "__main__":
    main()
