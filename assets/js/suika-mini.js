// Live Suika box: replays one of the bot's real games tick by tick, using the
// same physics engine the bot trained on (Rust compiled to WebAssembly).
// The engine is deterministic, so the replay is exactly the game the bot played.
//
// Markup: <div data-suika data-wasm=".." data-game=".." data-start="345" data-speed="4">
//           <canvas>, [data-drop] [data-score] [data-clears], .suika-flash, [data-toggle], [data-status]
(() => {
  const COLORS = ["#d62839", "#f25f7a", "#7b3fa0", "#f4a259", "#e8702a", "#c81d25",
                  "#d9d64a", "#f7a8b8", "#f2c14e", "#9bd770", "#2e8b3d"];
  const RADII = [18.375, 23.625, 33, 36, 45.75, 58.5, 68.25, 83.625, 94.125, 115.875, 135];
  const LEFT = 55, RIGHT = 599, FLOOR = 708, DROP_Y = 80, LOSE_Y = 70;
  const VIEW = { x: 49, y: -6, w: 556, h: 720 }; // the part of the board drawn, in engine units
  const COOLDOWN = 36;      // ticks between drops (the game's 600 ms rule at 60 Hz)
  const WATERMELON = 10;
  const FF_TICKS = 700;     // ticks per frame while skipping ahead
  const lo = s => s % 2 ** 32 >>> 0, hi = s => Math.floor(s / 2 ** 32) >>> 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  for (const el of document.querySelectorAll("[data-suika]")) setup(el);

  function setup(el) {
    const canvas = el.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const out = {
      drop: el.querySelector("[data-drop]"),
      score: el.querySelector("[data-score]"),
      clears: el.querySelector("[data-clears]"),
      status: el.querySelector("[data-status]"),
    };
    const flash = el.querySelector(".suika-flash");
    const toggle = el.querySelector("[data-toggle]");
    const startDrop = Number(el.dataset.start || 0);
    const speed = Number(el.dataset.speed || 4);

    let E = null, game = null, colors = readColors();
    let idx = 0, rt = 0, melons = 0, clears = 0;
    let phase = "idle";                    // idle | ff | play | done
    let paused = reduceMotion.matches, visible = false, started = false;
    let raf = 0, restartAt = 0, flashTimer = 0, lastFrame = 0, owed = 0;

    function readColors() {
      const cs = getComputedStyle(el);
      const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
      return { bg: v("--board-bg", "#fff3dc"), wall: v("--board-wall", "#3f8a4d"), line: v("--board-line", "rgba(180,35,74,.45)") };
    }

    async function load() {
      try {
        const [bytes, data] = await Promise.all([
          fetch(el.dataset.wasm).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
          fetch(el.dataset.game).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        ]);
        E = (await WebAssembly.instantiate(bytes, {})).instance.exports;
        game = { ...data, seed: data.origin_seed ?? data.seed, reseeds: data.reseeds ?? [], waits: data.waits ?? [] };
        newGame();
      } catch (err) {
        if (out.status) out.status.textContent = "The replay couldn't start in this browser.";
      }
    }

    function newGame() {
      E.reset(lo(game.seed), hi(game.seed));
      idx = 0; rt = game.waits[0] ?? 0; melons = 0; clears = 0; owed = 0;
      phase = "ff";
      if (out.status) out.status.textContent = `Skipping ahead to drop ${startDrop.toLocaleString()}…`;
      if (reduceMotion.matches) { while (phase === "ff") advanceFF(Infinity); }
      draw();
      schedule();
    }

    // One engine action: a physics tick, or the bot's next drop. False when the game is over.
    function step() {
      if (E.over()) return false;
      if (rt > 0) { E.tick(); rt--; }
      else if (idx < game.xs.length) {
        for (const [d, s] of game.reseeds) if (d === idx) E.reseed(lo(s), hi(s));
        E.drop_fruit(game.xs[idx++]);
        rt = COOLDOWN + (game.waits[idx] ?? 0);
      } else return false;
      let m = 0;
      for (let i = 0, n = E.body_count(); i < n; i++) if (E.body_kind(i) === WATERMELON) m++;
      if (m <= melons - 2) { clears++; if (phase === "play") showFlash(); }
      melons = m;
      return true;
    }

    function advanceFF(budget) {
      for (let i = 0; i < budget; i++) {
        if (idx >= startDrop) { phase = "play"; if (out.status) out.status.textContent = ""; return; }
        if (!step()) { finish(); return; }
      }
    }

    function finish() {
      phase = "done";
      restartAt = performance.now() + 5000;
      if (out.status) out.status.textContent = E.over() ? "Game over. Restarting…" : "End of the game. Restarting…";
    }

    function showFlash() {
      if (!flash) return;
      flash.classList.add("show");
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => flash.classList.remove("show"), 1800);
    }

    // Playback is paced by the clock, not the frame rate, so it's the same speed
    // on 60 Hz and 120 Hz screens. Long gaps (a background tab) don't make it jump.
    function frame(now) {
      raf = 0;
      const dt = Math.min(now - (lastFrame || now), 100);
      lastFrame = now;
      if (phase === "ff") advanceFF(FF_TICKS);
      else if (phase === "play" && !paused) {
        owed += dt * 60 * speed / 1000;
        for (; owed >= 1; owed--) if (!step()) { finish(); break; }
      }
      else if (phase === "done" && performance.now() >= restartAt) newGame();
      draw();
      schedule();
    }

    function schedule() {
      const busy = phase === "ff" || phase === "done" || (phase === "play" && !paused);
      if (!raf && busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
      if (!raf) lastFrame = 0; // stopped: the next start shouldn't count the time away
    }

    function clampX(kind, x) { const r = RADII[kind]; return Math.min(RIGHT - r, Math.max(LEFT + r, x)); }

    function fruit(kind, x, y, r, alpha) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS[kind];
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.beginPath(); ctx.arc(x - r * .32, y - r * .32, r * .3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    function draw() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      const s = canvas.width / VIEW.w;
      ctx.setTransform(s, 0, 0, s, -VIEW.x * s, -VIEW.y * s);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
      ctx.strokeStyle = colors.line; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(LEFT, LOSE_Y); ctx.lineTo(RIGHT, LOSE_Y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = colors.wall; ctx.lineWidth = 8; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(LEFT - 4, 24); ctx.lineTo(LEFT - 4, FLOOR + 4); ctx.lineTo(RIGHT + 4, FLOOR + 4); ctx.lineTo(RIGHT + 4, 24); ctx.stroke();
      if (!E || !game || phase === "ff") return;
      if (phase === "play" && idx < game.xs.length) { // the next fruit, held where the bot will drop it
        const k = E.current();
        fruit(k, clampX(k, game.xs[idx]), DROP_Y, RADII[k], .4);
      }
      for (let i = 0, n = E.body_count(); i < n; i++) fruit(E.body_kind(i), E.body_x(i), E.body_y(i), E.body_r(i), 1);
      if (out.drop) out.drop.textContent = idx.toLocaleString();
      if (out.score) out.score.textContent = E.score().toLocaleString();
      if (out.clears) out.clears.textContent = String(clears);
    }

    if (toggle) {
      const label = () => {
        toggle.textContent = paused ? "▶ Play" : "❚❚ Pause";
        toggle.setAttribute("aria-pressed", String(paused));
      };
      toggle.addEventListener("click", () => { paused = !paused; label(); schedule(); });
      label();
    }

    const repaint = () => { colors = readColors(); draw(); };
    document.addEventListener("themechange", repaint);
    window.addEventListener("resize", () => { if (!raf) draw(); });
    document.addEventListener("visibilitychange", schedule);

    new IntersectionObserver(entries => {
      visible = entries.some(e => e.isIntersecting);
      if (visible && !started) { started = true; load(); }
      schedule();
    }, { rootMargin: "100px" }).observe(el);
    draw();
  }
})();
