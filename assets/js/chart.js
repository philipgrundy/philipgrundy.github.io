// Hover and keyboard readout for the line charts: a crosshair snaps to the
// nearest test and a tooltip shows its numbers (the table below has them all too).
(() => {
  const pct = v => (100 * v).toFixed(1) + "%";
  for (const chart of document.querySelectorAll(".chart[data-points]")) {
    const points = JSON.parse(chart.dataset.points);
    const width = Number(chart.dataset.width);
    const svg = chart.querySelector("svg");
    const hit = svg.querySelector(".hit");
    const cross = svg.querySelector(".cross");
    const tip = chart.querySelector(".chart-tip");
    let current = -1;

    function show(i) {
      current = i;
      const p = points[i];
      cross.setAttribute("x1", p.x); cross.setAttribute("x2", p.x); cross.setAttribute("visibility", "visible");
      tip.replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = pct(p.p);
      tip.append(strong, ` of ${p.n} test games`, document.createElement("br"),
        `luck range ${pct(p.lo)}–${pct(p.hi)}`, document.createElement("br"),
        `after ${p.games.toLocaleString()} training games`);
      tip.style.display = "block";
      const box = svg.getBoundingClientRect();
      const left = p.x * box.width / width + 12;
      tip.style.left = Math.max(0, Math.min(left, box.width - tip.offsetWidth)) + "px";
    }
    function hide() { current = -1; tip.style.display = "none"; cross.setAttribute("visibility", "hidden"); }
    function nearest(clientX) {
      const box = svg.getBoundingClientRect();
      const x = (clientX - box.left) * width / box.width;
      let best = 0;
      points.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i; });
      return best;
    }

    hit.addEventListener("pointermove", ev => show(nearest(ev.clientX)));
    hit.addEventListener("pointerleave", hide);
    chart.tabIndex = 0;
    chart.setAttribute("aria-label", "Chart: use the arrow keys to step through the tests");
    chart.addEventListener("keydown", ev => {
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        ev.preventDefault();
        const step = ev.key === "ArrowRight" ? 1 : -1;
        show(Math.max(0, Math.min(points.length - 1, (current < 0 ? (step > 0 ? -1 : points.length) : current) + step)));
      } else if (ev.key === "Escape") hide();
    });
    chart.addEventListener("blur", hide);
  }
})();
