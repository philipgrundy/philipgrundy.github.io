// Renders the board of a recorded real-time game at a given drop as an inline SVG
// (fruit colours fixed; walls and background take the page's CSS variables).
// Usage: node board-svg.mjs <engine.wasm> <replay.json> <drop> [--counts a,b,c]
import { readFileSync } from "node:fs";

const [wasmPath, replayPath, dropArg, flag, list] = process.argv.slice(2);
const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), {});
const E = instance.exports;
const r = JSON.parse(readFileSync(replayPath, "utf8"));
const seed = r.origin_seed ?? r.seed;
const lo = s => s % 2 ** 32 >>> 0, hi = s => Math.floor(s / 2 ** 32) >>> 0;
const COOLDOWN = 36;
const COLORS = ["#d62839", "#f25f7a", "#7b3fa0", "#f4a259", "#e8702a", "#c81d25",
                "#d9d64a", "#f7a8b8", "#f2c14e", "#9bd770", "#2e8b3d"];

// Play until `drops` fruit have been dropped and the wait before the next drop is over.
function playTo(drops) {
  E.reset(lo(seed), hi(seed));
  let idx = 0, rt = r.waits[0];
  while (!E.over()) {
    if (rt > 0) { E.tick(); rt--; continue; }
    if (idx >= drops || idx >= r.xs.length) break;
    for (const [d, s] of r.reseeds ?? []) if (d === idx) E.reseed(lo(s), hi(s));
    E.drop_fruit(r.xs[idx++]);
    rt = COOLDOWN + (r.waits[idx] ?? 0);
  }
}
const bodies = () => Array.from({ length: E.body_count() }, (_, i) => ({
  k: E.body_kind(i), x: E.body_x(i), y: E.body_y(i), r: E.body_r(i),
}));

if (flag === "--counts") {
  for (const d of list.split(",").map(Number)) {
    playTo(d);
    const b = bodies();
    console.log(`drop ${d}: ${b.length} fruit, watermelons ${b.filter(f => f.k === 10).length}, melons ${b.filter(f => f.k === 9).length}, score ${E.score()}`);
  }
} else {
  playTo(Number(dropArg));
  const f = n => +n.toFixed(1);
  const circles = bodies().map(b =>
    `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r)}" fill="${COLORS[b.k]}"/>` +
    `<circle cx="${f(b.x - b.r * .32)}" cy="${f(b.y - b.r * .32)}" r="${f(b.r * .3)}" fill="#fff" fill-opacity=".22"/>`).join("");
  console.log(
    `<svg class="board-svg" viewBox="49 -6 556 720" role="img" aria-label="A Suika board from the bot's best game, packed with fruit around a watermelon">` +
    `<rect class="board-bg" x="49" y="-6" width="556" height="720"/>` +
    `<line class="board-line" x1="55" y1="70" x2="599" y2="70"/>` +
    `<path class="board-wall" d="M51 24 V712 H603 V24"/>` + circles + `</svg>`);
}
