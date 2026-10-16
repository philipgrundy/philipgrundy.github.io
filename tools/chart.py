"""Builds the Suika learning-curve figure (inline SVG + data table) for the write-up.

Only tests run under the same conditions are plotted: the same unseen test games,
2 drops of look-ahead, turn-based rules. Earlier v5 tests used other settings.
Usage: python chart.py <suika-ai/runs/value> > chart.html
"""
import json
import math
import sys
from pathlib import Path

runs = Path(sys.argv[1])


def wilson(p, n, z=1.96):
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


points, offset = [], 0
for run in ["v5", "v6"]:
    rows = [json.loads(l) for l in (runs / run / "log.jsonl").read_text().splitlines() if l.strip()]
    for r in rows:
        e = r.get("eval")
        if not e:
            continue
        games = r["games"] + offset
        if run == "v5" and e["n"] < 192:  # early v5 tests: fewer games, different settings
            continue
        lo, hi = wilson(e["clear"], e["n"])
        points.append(dict(games=games, p=e["clear"], n=e["n"], lo=lo, hi=hi, run=run))
    offset += max(r["games"] for r in rows)
v6_start = next(p["games"] for p in points if p["run"] == "v6")

W, H, L, R, T, B = 720, 300, 46, 64, 26, 44
x0, x1, ymax = 50_000, 150_000, 0.6
X = lambda v: L + (v - x0) / (x1 - x0) * (W - L - R)
Y = lambda p: T + (1 - p / ymax) * (H - T - B)
f = lambda v: f"{v:.1f}"
pct = lambda v: f"{100 * v:.1f}%"

svg = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="curve-title curve-sub">']
svg.append('<g class="grid">')
for v in (0, 0.2, 0.4, 0.6):
    if v:
        svg.append(f'<line x1="{L}" x2="{W - R}" y1="{f(Y(v))}" y2="{f(Y(v))}"/>')
svg.append("</g>")
for v in (0, 0.2, 0.4, 0.6):
    svg.append(f'<text x="{L - 8}" y="{f(Y(v) + 4)}" text-anchor="end">{round(v * 100)}%</text>')
svg.append(f'<line class="axis-line" x1="{L}" x2="{W - R}" y1="{f(Y(0))}" y2="{f(Y(0))}"/>')
for v in range(50_000, 150_001, 25_000):
    svg.append(f'<text x="{f(X(v))}" y="{H - 22}" text-anchor="middle">{v // 1000}k</text>')
svg.append(f'<text x="{f((L + W - R) / 2)}" y="{H - 4}" text-anchor="middle">games of self-play training</text>')
svg.append(f'<text class="annot" x="{L + 6}" y="{f(Y(0) - 6)}">rule-based bot: 0%</text>')
mx = X(v6_start - 400)
svg.append(f'<line class="marker" x1="{f(mx)}" x2="{f(mx)}" y1="{T - 6}" y2="{f(Y(0))}" stroke-dasharray="3 4"/>')
svg.append(f'<text class="annot" x="{f(mx - 6)}" y="{T + 4}" text-anchor="end">precision fix</text>')
band = [(p["games"], p["hi"]) for p in points] + [(p["games"], p["lo"]) for p in reversed(points)]
svg.append('<path class="band" d="' + " ".join(("L" if i else "M") + f"{f(X(g))} {f(Y(v))}" for i, (g, v) in enumerate(band)) + ' Z"/>')
svg.append('<path class="line" d="' + " ".join(("L" if i else "M") + f'{f(X(p["games"]))} {f(Y(p["p"]))}' for i, p in enumerate(points)) + '"/>')
for p in points:
    svg.append(f'<circle class="dot" cx="{f(X(p["games"]))}" cy="{f(Y(p["p"]))}" r="4.5"/>')
last = points[-1]
svg.append(f'<text class="end-label" x="{f(X(last["games"]) + 10)}" y="{f(Y(last["p"]) + 4)}">{pct(last["p"])}</text>')
svg.append(f'<line class="cross" x1="0" x2="0" y1="{T}" y2="{f(Y(0))}" visibility="hidden"/>')
svg.append(f'<rect class="hit" x="{L - 12}" y="{T}" width="{W - L - R + 24}" height="{f(Y(0) - T)}" fill="transparent"/>')
svg.append("</svg>")

data = [dict(x=round(X(p["games"]), 1), games=p["games"], p=p["p"], n=p["n"], lo=round(p["lo"], 4), hi=round(p["hi"], 4)) for p in points]
rows = "\n".join(
    f'      <tr><td class="num">{p["games"]:,}</td><td class="num">{p["n"]}</td><td class="num">{pct(p["p"])}</td><td class="num">{pct(p["lo"])}–{pct(p["hi"])}</td></tr>'
    for p in points)

print(f'''<figure class="chart-figure">
  <p class="chart-title" id="curve-title">Double-watermelon games as training went on</p>
  <p class="chart-sub" id="curve-sub">Share of the same unseen test games with at least one double watermelon (2 drops of look-ahead). The band is the range luck alone could explain (95%).</p>
  <div class="chart" data-points='{json.dumps(data)}' data-width="{W}">
    {"".join(svg)}
    <div class="chart-tip" role="status"></div>
  </div>
  <details>
    <summary>Show the numbers</summary>
    <div class="table-scroll">
    <table>
      <thead><tr><th class="num">Training games</th><th class="num">Test games</th><th class="num">Double watermelon</th><th class="num">Luck range (95%)</th></tr></thead>
      <tbody>
{rows}
      </tbody>
    </table>
    </div>
  </details>
</figure>''')
