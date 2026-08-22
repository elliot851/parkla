/* ============================================================
   Parkla — guidad rundtur
   Ljuskägla på ett element + pratbubbla med pil. Steg för steg.
   ============================================================ */
"use strict";

const Tour = (function () {
  let steps = [], i = 0, root = null, onDone = null, raf = null;

  function el(cls, html) { const d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; return d; }

  function build() {
    root = el("tour");
    root.innerHTML = `
      <div class="tour-veil"></div>
      <div class="tour-hole"></div>
      <div class="tour-pop">
        <div class="tour-arrow"></div>
        <div class="tour-count"></div>
        <h4 class="tour-title"></h4>
        <p class="tour-body"></p>
        <div class="tour-dots"></div>
        <div class="tour-btns">
          <button class="btn btn-sm btn-q tour-skip">Hoppa över</button>
          <span style="flex:1"></span>
          <button class="btn btn-sm tour-prev">Tillbaka</button>
          <button class="btn btn-sm btn-p tour-next">Nästa</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector(".tour-skip").onclick = stop;
    root.querySelector(".tour-prev").onclick = () => jump(i - 1);
    root.querySelector(".tour-next").onclick = () => jump(i + 1);
    /* Slöjan avslutade rundturen. Säger den "tryck här" och man
       trycker bredvid ska turen leva vidare – inte försvinna.
       Vill man ut finns Hoppa över-knappen. */
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
  }

  function target() {
    const s = steps[i];
    if (!s || !s.sel) return null;
    const list = s.sel.split("|");
    for (const q of list) {
      const n = document.querySelector(q.trim());
      if (n && n.getBoundingClientRect().width > 0) return n;
    }
    return null;
  }

  function place() {
    if (!root || !steps[i]) return;
    const s = steps[i], t = target();
    const hole = root.querySelector(".tour-hole");
    const pop = root.querySelector(".tour-pop");
    const arrow = root.querySelector(".tour-arrow");
    const vw = window.innerWidth, vh = window.innerHeight;

    if (!t) { /* inget mål → centrera bubblan */
      hole.style.opacity = "0";
      pop.style.left = Math.max(16, vw / 2 - 170) + "px";
      pop.style.top = (vh / 2 - 110) + "px";
      arrow.style.display = "none";
      return;
    }
    const r = t.getBoundingClientRect();
    const pad = s.pad == null ? 8 : s.pad;
    hole.style.opacity = "1";
    hole.style.left = (r.left - pad) + "px";
    hole.style.top = (r.top - pad) + "px";
    hole.style.width = (r.width + pad * 2) + "px";
    hole.style.height = (r.height + pad * 2) + "px";
    hole.style.borderRadius = (s.radius || 12) + "px";

    const pw = Math.min(342, vw - 32), ph = pop.offsetHeight || 190;
    let top, left, dir;
    const below = vh - r.bottom, above = r.top;
    if (s.place === "top" || (below < ph + 26 && above > below)) { dir = "down"; top = r.top - ph - 16; }
    else { dir = "up"; top = r.bottom + 16; }
    top = Math.max(14, Math.min(top, vh - ph - 14));
    left = r.left + r.width / 2 - pw / 2;
    left = Math.max(16, Math.min(left, vw - pw - 16));

    pop.style.width = pw + "px";
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    arrow.style.display = "block";
    arrow.className = "tour-arrow " + dir;
    arrow.style.left = Math.max(16, Math.min(r.left + r.width / 2 - left - 7, pw - 30)) + "px";
  }

  function paint() {
    const s = steps[i];
    root.querySelector(".tour-count").textContent = (i + 1) + " av " + steps.length;
    root.querySelector(".tour-title").textContent = s.title;
    root.querySelector(".tour-body").innerHTML = s.body;
    root.querySelector(".tour-prev").style.display = i === 0 ? "none" : "";
    root.querySelector(".tour-next").textContent = i === steps.length - 1 ? "Sätt igång" : "Nästa";
    root.querySelector(".tour-dots").innerHTML =
      steps.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
  }

  function jump(n) {
    if (n < 0) return;
    if (n >= steps.length) { stop(true); return; }
    i = n;
    const s = steps[i];
    const go = () => {
      paint();
      const t = target();
      if (t) {
        const r = t.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight - 210) {
          window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 2 + r.height / 2, behavior: "smooth" });
          setTimeout(place, 420); return;
        }
      }
      cancelAnimationFrame(raf); raf = requestAnimationFrame(place);
    };
    if (s.route && typeof go2 === "function" && s.route !== currentRoute()) { go2(s.route); setTimeout(go, 300); }
    else go();
  }
  function currentRoute() { return (typeof S !== "undefined" && S.route) || ""; }

  function start(list, done) {
    steps = list; onDone = done; i = 0;
    if (!root) build();
    root.classList.add("on");
    document.body.style.overflow = "hidden";
    setTimeout(() => jump(0), 60);
  }
  function stop(finished) {
    if (!root) return;
    root.classList.remove("on");
    document.body.style.overflow = "";
    if (onDone) onDone(finished === true);
  }
  function active() { return root && root.classList.contains("on"); }

  return { start, stop, active, place };
})();

/* liten global så turen kan byta vy */
function go2(r) { if (typeof go === "function") go(r); }
