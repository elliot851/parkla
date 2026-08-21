/* ============================================================
   Parkla — flöden som gör verklighet av löftena i texten
   Förfrågningar · foto in och ut · betyg · delbar länk · offline
   ============================================================ */
"use strict";

let REQUESTS = LS.get("requests", null);
let RATINGS  = LS.get("ratings", {});

/* Seedar två förfrågningar första gången någon lagt upp en plats. */
function ensureRequests() {
  if (REQUESTS !== null) return;
  REQUESTS = LISTINGS.length ? [
    { id: "r1", who: "Johan", reg: "MKL 214", car: "Volvo V60", rate: 4.9, n: 23,
      from: "2026-08-24", qty: 3, unit: "dygn", msg: "Hej! Ska till Arlanda på fredag, kommer runt kl 06.", status: "ny" },
    { id: "r2", who: "Amina", reg: "TRB 887", car: "Kia Niro EV", rate: 5.0, n: 41,
      from: "2026-09-01", qty: 1, unit: "månad", msg: "Vill hyra långsiktigt. Har du laddbox?", status: "ny" }
  ] : [];
  LS.set("requests", REQUESTS);
}
function saveFlows() { LS.set("requests", REQUESTS); LS.set("ratings", RATINGS); }

/* ---------------- Förfrågningar till värden ---------------- */
function hostRequestsHTML() {
  ensureRequests();
  const open = REQUESTS.filter(r => r.status === "ny");
  if (!LISTINGS.length) return "";
  if (!open.length) return `
    <h3 style="margin:38px 0 4px">Förfrågningar</h3>
    <div class="empty" style="margin-top:14px;padding:34px 20px">
      <div class="ic">${I("users", 30)}</div>
      <p class="dim small" style="margin-top:10px">Inga nya förfrågningar just nu. Vi säger till så fort någon vill hyra.</p>
    </div>`;
  return `
  <div class="spread" style="margin:38px 0 4px">
    <h3>Förfrågningar</h3><span class="tag clay">${open.length} väntar på svar</span>
  </div>
  <div class="stack" style="margin-top:14px">
    ${open.map(r => `<div class="reqcard">
      <div class="row top">
        <span class="av">${esc(r.who[0])}</span>
        <div style="flex:1;min-width:0">
          <div class="spread"><b>${esc(r.who)}</b>
            <span class="rate">${IF("star", 12)}${r.rate.toFixed(1).replace(".", ",")} <span class="muted">(${r.n})</span></span></div>
          <div class="muted small" style="margin-top:2px">${esc(r.car)} · <span class="mono">${esc(r.reg)}</span></div>
          <div class="tag" style="margin-top:9px">${r.qty} ${esc(r.unit)} från ${esc(r.from)}</div>
        </div>
      </div>
      <p class="quote" style="margin:14px 0 0">${esc(r.msg)}</p>
      <div class="row" style="margin-top:16px">
        <button class="btn btn-sm btn-g" style="flex:1" onclick="answerReq('${r.id}',true)">${I("check", 15)} Godkänn</button>
        <button class="btn btn-sm" onclick="answerReq('${r.id}',false)">Neka</button>
        <button class="btn btn-sm" onclick="go('meddelanden')">${I("message", 15)}</button>
      </div>
    </div>`).join("")}
  </div>`;
}
function answerReq(id, yes) {
  const r = REQUESTS.find(x => x.id === id); if (!r) return;
  r.status = yes ? "godkand" : "nekad";
  saveFlows();
  if (yes) {
    NOTIS.unshift({ id: "n" + Date.now(), ic: "check", t: "Du sa ja till " + r.who,
      s: `${r.qty} ${r.unit} från ${r.from}. Pengarna kommer den 25:e.`, unread: true });
    EARNED = EARNED + 400; LS.set("earned", EARNED);
  }
  persist();
  toast(yes ? "Godkänd – " + r.who + " är meddelad" : "Nekad. " + r.who + " får veta direkt.", yes ? "check" : "close");
  render();
}

/* ---------------- Foto vid in- och utcheckning ---------------- */
function photoBlockHTML(b) {
  const ph = b.photos || [];
  return `
  <div class="photoblock">
    <div class="spread"><span class="lbl">Foto på platsen</span>
      <span class="muted small">${ph.length} av 4</span></div>
    <p class="muted small" style="margin-top:6px">Ta ett kort när du kommer och ett när du åker. Händer något har båda bevis.</p>
    <div class="photogrid" id="pgrid">
      ${ph.map((p, i) => `<div class="photo"><img src="${p.url}" alt="">
        <span class="when">${esc(p.kind)} ${esc(p.when)}</span>
        <button class="del" onclick="delPhoto(${b.id},${i})" aria-label="Ta bort">${I("close", 12)}</button></div>`).join("")}
      ${ph.length < 4 ? `<label class="photo add">
        ${I("camera", 22)}<span>Ta kort</span>
        <input type="file" accept="image/*" capture="environment" hidden onchange="addPhoto(${b.id},this)">
      </label>` : ""}
    </div>
  </div>`;
}
function addPhoto(bid, input) {
  const f = input.files && input.files[0]; if (!f) return;
  const b = BOOKINGS.find(x => x.id === bid); if (!b) return;
  toast("Sparar kortet …", "camera");
  const rd = new FileReader();
  rd.onload = e => {
    const img = new Image();
    img.onload = () => {
      /* Skala ner så localStorage räcker: max 900 px, JPEG 70 % */
      const max = 900, sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      b.photos = b.photos || [];
      b.photos.push({ url: c.toDataURL("image/jpeg", .7), kind: b.photos.length ? "ut" : "in",
        when: new Date().toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) });
      try { persist(); } catch (err) { b.photos.pop(); toast("Minnet är fullt – ta bort ett kort först", "info"); return; }
      const g = document.getElementById("pgrid");
      if (g) g.outerHTML = photoBlockHTML(b).match(/<div class="photogrid"[\s\S]*<\/div>\s*<\/div>/)[0].replace(/<\/div>\s*$/, "");
      openAccess(bid);
      toast("Kortet är sparat", "check");
    };
    img.src = e.target.result;
  };
  rd.readAsDataURL(f);
}
function delPhoto(bid, i) {
  const b = BOOKINGS.find(x => x.id === bid); if (!b || !b.photos) return;
  b.photos.splice(i, 1); persist(); openAccess(bid); toast("Kortet är borttaget", "close");
}

/* ---------------- Betygsätt efter bokning ---------------- */
function rateBooking(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const cur = b.rating || 0;
  openSheet(sheetHead("Hur gick det?") + `<div class="sheet-b stack center">
    <p class="dim">${esc(b.spot)} · värd ${esc(b.host)}</p>
    <div class="stars" id="starrow">
      ${[1,2,3,4,5].map(n => `<button class="star ${n <= cur ? "on" : ""}" data-n="${n}"
        onclick="setStars(${n})" aria-label="${n} av 5">${IF("star", 34)}</button>`).join("")}
    </div>
    <p class="muted small" id="starword">${cur ? starWord(cur) : "Tryck på stjärnorna"}</p>
    <div class="field" style="text-align:left;width:100%"><label>Vill du skriva något? (frivilligt)</label>
      <textarea class="inp" id="ratetxt" rows="3" placeholder="Enkelt att hitta, precis som beskrivet."></textarea></div>
    <button class="btn btn-p btn-block btn-lg" onclick="saveRating(${id})">Skicka betyg</button>
    <p class="muted small">Värden betygsätter dig också. Båda betygen visas när ni båda svarat.</p>
  </div>`);
  window._stars = cur;
}
function starWord(n) { return ["", "Inte bra", "Sådär", "Okej", "Bra", "Toppen"][n]; }
function setStars(n) {
  window._stars = n;
  document.querySelectorAll("#starrow .star").forEach(s => s.classList.toggle("on", +s.dataset.n <= n));
  const w = document.getElementById("starword"); if (w) w.textContent = starWord(n);
}
function saveRating(id) {
  const n = window._stars || 0;
  if (!n) { toast("Välj hur många stjärnor", "info"); return; }
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const txt = (document.getElementById("ratetxt") || {}).value || "";
  b.rating = n; b.ratingText = txt;
  RATINGS[b.spotId] = RATINGS[b.spotId] || [];
  RATINGS[b.spotId].unshift({ who: "Du", r: n, t: txt || "Tack för lånet!",
    d: new Date().toLocaleDateString("sv-SE", { month: "short", year: "numeric" }) });
  persist(); saveFlows(); closeSheet();
  toast("Tack! Betyget är skickat", "star");
  render();
}
/* Egna omdömen visas överst på platsen */
function reviewsWithMine(id) {
  const mine = RATINGS[id] || [];
  return mine.concat(REVIEWS[id] || DEFAULT_REVIEWS);
}

/* ---------------- Delbar länk per plats ---------------- */
function shareSpot(id) {
  const s = SPOTS.find(x => x.id === id);
  const url = location.origin + location.pathname + "#spot/" + id;
  const txt = `${s.nm} – ${num(priceFor(s, S.mode) || s.d || s.m)} ${sym()} ${unitLong(S.mode)} på Parkla`;
  if (navigator.share) navigator.share({ title: s.nm, text: txt, url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Länken är kopierad", "copy"));
  else toast(url);
}
function openDeepLink() {
  const m = (location.hash || "").match(/^#spot\/(\d+)/);
  if (!m) return false;
  const id = +m[1];
  if (!SPOTS.some(s => s.id === id)) return false;
  S.route = "sok"; render();
  setTimeout(() => openSpot(id), 260);
  return true;
}

/* ---------------- Offline ---------------- */
/* Nätet först, cache bara som reserv – då kan man aldrig fastna på en gammal version. */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  let offlineShown = false;
  window.addEventListener("offline", () => { offlineShown = true; toast("Du är offline – sparat innehåll visas", "info"); });
  window.addEventListener("online", () => { if (offlineShown) { toast("Uppkopplad igen", "check"); offlineShown = false; } });
}

/* Kör igång djuplänk om sidan öppnades med #spot/… */
if (!openDeepLink()) {
  window.addEventListener("hashchange", () => { openDeepLink(); });
}


/* ============================================================
   Sidan ska inte gå att nypa i – den ska bete sig som en app.
   iOS Safari struntar i user-scalable=no sedan iOS 10, så det
   måste göras här. Kartan är undantagen: där SKA man kunna nypa.
   ============================================================ */
(function lockPageZoom() {
  const inMap = el => !!(el && el.closest && el.closest(".mapwrap, .leaflet-container"));
  ["gesturestart", "gesturechange", "gestureend"].forEach(type =>
    document.addEventListener(type, e => { if (!inMap(e.target)) e.preventDefault(); }, { passive: false }));
  document.addEventListener("touchmove", e => {
    if (e.touches && e.touches.length > 1 && !inMap(e.target)) e.preventDefault();
  }, { passive: false });
  /* Dubbeltryck-zoom sköts av touch-action:manipulation i app.css. */
})();


/* ============================================================
   Alltid senaste versionen.
   Adressen https://elliot851.github.io/parkla/ ska funka för alltid:
   spara den på hemskärmen en gång, sedan håller appen sig själv aktuell.
   ============================================================ */
(function keepFresh() {
  let banner = null;

  function showBanner(ny) {
    if (banner) return;
    banner = document.createElement("button");
    banner.className = "updbar";
    banner.innerHTML = I("refresh", 17) + "<span>Ny version finns</span><b>Uppdatera</b>";
    banner.onclick = reloadNow;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("on"));
  }
  function reloadNow() {
    if ("caches" in window) {
      caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).finally(hardReload);
    } else hardReload();
  }
  function hardReload() { location.replace(location.pathname); }

  function busy() {
    return document.getElementById("sheet").classList.contains("on")
      || (typeof Tour !== "undefined" && Tour.active());
  }

  async function check() {
    if (!navigator.onLine) return;
    try {
      const r = await fetch("version.json?cb=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (!j.v || j.v === VERSION) return;
      /* Är användaren mitt i något visar vi bara en knapp. Annars byter vi direkt. */
      if (busy()) showBanner(j.v);
      else reloadNow();
    } catch (e) {}
  }

  window.addEventListener("load", () => setTimeout(check, 1200));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60 * 1000);
})();
