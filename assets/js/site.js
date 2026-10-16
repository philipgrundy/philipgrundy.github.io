// Day/night switch. The site follows the visitor's system setting until they
// pick a theme here; the pick is remembered (the <head> applies it before paint).
(() => {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");
  const button = document.querySelector(".theme-toggle");
  const announce = () => document.dispatchEvent(new CustomEvent("themechange"));

  function label() {
    if (!button) return;
    const dark = current() === "dark";
    button.dataset.targetTheme = dark ? "light" : "dark";
    const description = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", description);
    button.setAttribute("title", description);
    const pageColour = getComputedStyle(root).getPropertyValue("--page-bg").trim();
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", pageColour);
  }

  if (button) {
    label();
    button.hidden = false;
    button.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode: the pick lasts this visit */ }
      label();
      announce();
    });
  }
  systemDark.addEventListener("change", () => { label(); announce(); });
  label();

  for (const el of document.querySelectorAll("[data-year]")) el.textContent = new Date().getFullYear();
  for (const el of document.querySelectorAll("[data-print]")) el.addEventListener("click", () => window.print());
})();
