// Ease the light toward the pointer
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const scene = document.querySelector(".scene");
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;

  const tick = () => {
    x += (tx - x) * 0.04;
    y += (ty - y) * 0.04;
    scene.style.setProperty("--mx", x.toFixed(4));
    scene.style.setProperty("--my", y.toFixed(4));
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
  };

  const aim = (nx, ny) => {
    tx = nx; ty = ny;
    if (!raf) raf = requestAnimationFrame(tick);
  };

  addEventListener("pointermove", e => aim(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1));
  document.addEventListener("pointerleave", () => aim(0, 0));
})();

// Open a person's full biography; a click outside it closes it
document.querySelectorAll("[data-bio]").forEach(button => {
  const dialog = document.getElementById(button.dataset.bio);
  button.addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
});

// Frost the nav bar once the page scrolls
(() => {
  const nav = document.querySelector(".nav");
  const update = () => nav.classList.toggle("is-scrolled", scrollY > 8);
  update();
  addEventListener("scroll", update, { passive: true });
})();

// Light / dark mode, remembered between visits
(() => {
  const root = document.documentElement;
  const toggle = document.querySelector(".theme-toggle");
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = light => {
    if (light) root.dataset.theme = "light"; else delete root.dataset.theme;
    toggle.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    meta.content = light ? "#f1ece3" : "#050707";
  };
  apply(root.dataset.theme === "light");
  toggle.addEventListener("click", () => {
    const light = root.dataset.theme !== "light";
    apply(light);
    try { localStorage.setItem("theme", light ? "light" : "dark"); } catch (e) {}
  });
})();
