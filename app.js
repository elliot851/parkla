/* ============================================================
   Parkla — applogik
   ============================================================ */
"use strict";

/* ---------------- Lagring ---------------- */
const NS = "parkla.v3.";
const LS = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} }
};

const DEFAULT_SETTINGS = {
  theme: "system", lang: "sv", currency: "SEK", font: "instrument",
  city: "sthlm", mapMode: "satellit",
  notis: { bokning: true, betalning: true, pris: true, evenemang: true, nyheter: false },
  bigText: false
};
let SET = Object.assign({}, DEFAULT_SETTINGS, LS.get("settings", {}));
SET.notis = Object.assign({}, DEFAULT_SETTINGS.notis, SET.notis || {});
/* Engångsflytt: satellit blev standard, och typsnittet är nu valbart. */
if (!SET.v5) { SET.v5 = 1; SET.mapMode = "satellit"; SET.font = SET.font || "instrument"; LS.set("settings", SET); }
function setFont(k) { SET.font = k; saveSettings(); render(); toast("Typsnitt: " + k, "eye"); }
function saveSettings() { LS.set("settings", SET); applyTheme(); }
function applyTheme() {
  const el = document.documentElement;
  if (SET.theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", SET.theme);
  el.setAttribute("data-font", SET.font || "instrument");
  document.body.style.fontSize = SET.bigText ? "18px" : "";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#F4F1E9";
}

let BOOKINGS = LS.get("bookings", []);
let LISTINGS = LS.get("listings", []);
let FAVS     = LS.get("favs", []);
let NOTIS    = LS.get("notis", SEED_NOTIS.slice());
let MSGS     = LS.get("msgs", SEED_MSG.slice());
let WATCH    = LS.get("watch", []);
let EARNED   = LS.get("earned", 0);
function persist() {
  LS.set("bookings", BOOKINGS); LS.set("listings", LISTINGS); LS.set("favs", FAVS);
  LS.set("notis", NOTIS); LS.set("msgs", MSGS); LS.set("watch", WATCH); LS.set("earned", EARNED);
}

/* ---------------- Läge ---------------- */
let S = {
  route: (location.hash.replace("#", "").split("?")[0]) || "start",
  area: SET.city, mode: "manad", view: "karta",
  q: "", near: null, nearLabel: "", part: null, partZoom: null, maxPrice: 0,
  fCharge: false, fGarage: false, fSecure: false, fBig: false,
  sort: "pris", selSpot: null,
  calc: { city: "Stockholm innerstad", type: "Uppfart", walk: 5, charger: false, gated: false, dyn: true },
  wizard: null, bk: null
};

/* ---------------- Hjälpare ---------------- */
const t = k => (I18N[SET.lang] && I18N[SET.lang][k]) || I18N.sv[k] || k;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const loc = () => SET.lang === "sv" ? "sv-SE" : "en-GB";

function money(sek) {
  const c = CURRENCIES[SET.currency] || CURRENCIES.SEK;
  const v = sek * c.rate;
  const dec = (c.rate < 0.5 && v < 100 && v % 1 !== 0) ? 2 : 0;
  const n = v.toLocaleString(loc(), { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return c.after ? `${n} ${c.sym}` : `${c.sym}${n}`;
}
const kr = money;
function num(sek) {
  const c = CURRENCIES[SET.currency] || CURRENCIES.SEK;
  return Math.round(sek * c.rate).toLocaleString(loc());
}
const sym = () => (CURRENCIES[SET.currency] || CURRENCIES.SEK).sym;

const priceFor = (s, m) => m === "evenemang" ? s.ev : m === "timme" ? s.h : m === "dygn" ? s.d : m === "vecka" ? s.w : s.m;
const unitLong  = m => m === "evenemang" ? t("per_event") : m === "timme" ? t("per_hour") : m === "dygn" ? t("per_day") : m === "vecka" ? t("per_week") : t("per_month");
const unitShort = m => m === "evenemang" ? t("u_event") : m === "timme" ? t("u_hour") : m === "dygn" ? t("u_day") : m === "vecka" ? t("u_week") : t("u_month");
const reviewsFor = id => REVIEWS[id] || DEFAULT_REVIEWS;

function feeSplit(base, m) {
  const monthly = m === "manad";
  const service = Math.round(base * (monthly ? FEES.driverPctMonthly : FEES.driverPct));
  const hostFee = Math.round(base * (monthly ? FEES.hostPctMonthly : FEES.hostPct));
  const trygg = monthly ? FEES.tryggMonthly : FEES.tryggShort;
  return { base, service, trygg, hostFee, hostNet: base - hostFee, driverTotal: base + service + trygg };
}
function priceSuggest(city, type, walk, charger, gated) {
  const b = CITY_BASE[city] || CITY_BASE["Övrig stad/tätort"];
  const mult = TYPE_MULT[type] || 1;
  const w = walk <= 3 ? 1.18 : walk <= 6 ? 1.08 : walk <= 10 ? 1.0 : walk <= 15 ? 0.88 : 0.70;
  const f = mult * w * (charger ? 1.28 : 1) * (gated ? 1.07 : 1);
  return {
    month: Math.round(b.m * f / 10) * 10, day: Math.round(b.d * f / 5) * 5,
    hour: b.h ? Math.max(5, Math.round(b.h * f)) : 0,
    week: Math.round(b.d * f * 4.6 / 10) * 10, event: Math.round(b.d * f * 1.9 / 10) * 10
  };
}
function ratingHTML(s) {
  return `<span class="rate">${IF("star", 12)}${s.rate.toFixed(1).replace(".", SET.lang === "sv" ? "," : ".")}<span class="muted">(${s.n})</span></span>`;
}

/* ---------------- Gränssnitt ---------------- */
function toast(msg, icon) {
  const el = document.getElementById("toast");
  el.innerHTML = (icon ? I(icon, 17) : I("check", 17)) + "<span>" + esc(msg) + "</span>";
  el.classList.add("on");
  clearTimeout(el._x); el._x = setTimeout(() => el.classList.remove("on"), 2800);
}
function openSheet(html) {
  document.getElementById("sheetContent").innerHTML = html;
  const sh = document.getElementById("sheet");
  sh.classList.add("on"); document.getElementById("scrim").classList.add("on");
  sh.scrollTop = 0;
}
function closeSheet() {
  document.getElementById("sheet").classList.remove("on");
  document.getElementById("scrim").classList.remove("on");
}
function sheetHead(title) {
  return `<div class="sheet-h"><h3>${esc(title)}</h3><button class="x" onclick="closeSheet()" aria-label="${t("close")}">${I("close", 16)}</button></div>`;
}
function go(r) {
  if (r === S.route) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  PMap.destroy();
  S.route = r; history.replaceState(null, "", "#" + r);
  window.scrollTo(0, 0); render();
}

/* ---------------- Meny ---------------- */
function navHTML() {
  const items = [["sok", t("nav_find")], ["hyrut", t("nav_rent")], ["evenemang", t("nav_events")],
                 ["trygg", t("nav_trust")], ["priser", t("nav_price")], ["mina", t("nav_me")]];
  return items.map(([r, l]) => `<a href="#${r}" data-go="${r}" class="${S.route === r ? "on" : ""}">${esc(l)}</a>`).join("")
    + `<a href="#sok" data-go="sok" class="cta">${esc(t("nav_cta"))}</a>`;
}
function tabbarHTML() {
  const unread = NOTIS.filter(n => n.unread).length;
  const items = [["start", "home", t("tab_start"), 0], ["sok", "search", t("tab_search"), 0],
                 ["hyrut", "wallet", t("tab_rent"), 0], ["mina", "receipt", t("tab_me"), BOOKINGS.length],
                 ["mer", "dots", t("tab_more"), unread]];
  return items.map(([r, ic, l, b]) => `<button data-go="${r}" class="${S.route === r ? "on" : ""}" aria-label="${esc(l)}">
    ${I(ic, 21)}${esc(l)}${b ? `<span class="badge">${b}</span>` : ""}</button>`).join("");
}
function footerHTML() {
  return `
<footer><div class="wrap">
  <div class="fgrid">
    <div>
      <div class="row" style="gap:10px;margin-bottom:14px">${logoSVG(30)}<span class="logotype">Parkla</span></div>
      <p class="dim small" style="max-width:34ch">Sveriges marknadsplats för privata parkeringsplatser. Din uppfart står tom 22 timmar om dygnet.</p>
    </div>
    <div><h5>För förare</h5><ul>
      <li><a href="#sok" data-go="sok">Hitta parkering</a></li>
      <li><a href="#evenemang" data-go="evenemang">Evenemang</a></li>
      <li><a href="#trygg" data-go="trygg">Så fungerar det</a></li>
      <li><a href="#priser" data-go="priser">Priser</a></li></ul></div>
    <div><h5>För värdar</h5><ul>
      <li><a href="#hyrut" data-go="hyrut">Hyr ut din plats</a></li>
      <li><a href="#skatt" data-go="skatt">Skatt och regler</a></li>
      <li><a href="#brf" data-go="brf">BRF och fastighet</a></li>
      <li><a href="#bjudin" data-go="bjudin">Bjud in en vän</a></li></ul></div>
    <div><h5>Parkla</h5><ul>
      <li><a href="#affar" data-go="affar">Affärsmodell</a></li>
      <li><a href="#installningar" data-go="installningar">Inställningar</a></li>
      <li><a href="#mer" data-go="mer">Vanliga frågor</a></li>
      <li>hej@parkla.se</li></ul></div>
  </div>
  <div class="fbot"><span>Parkla · prototyp med demodata</span><span>v${VERSION}</span></div>
</div></footer>`;
}
function logoSVG(s) {
  return `<svg viewBox="0 0 40 40" width="${s}" height="${s}" style="border-radius:8px" aria-hidden="true">
    <rect width="40" height="40" rx="11" fill="var(--pine)"/>
    <path d="M7 19.5 20 9l13 10.5" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 31V18.5h6.6a4.6 4.6 0 0 1 0 9.2H15" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ============================================================
   VY: START
   ============================================================ */
function viewStart() {
  const sug = priceSuggest("Stockholm innerstad", "Uppfart", 5, false, false);
  const ev = EVENTS[0];
  const cities = AREAS.map(a => a.name.split(" ")[0]);
  return `
<div class="hero"><div class="wrap"><div class="hero-grid">
  <div>
    <h1 data-reveal style="--d:60ms">Din uppfart står tom.<br>Den kan ge dig <em>${num(FEES.schablon)} ${sym()}</em> om året.</h1>
    <p class="lede" style="margin-top:26px" data-reveal>Har du en ledig plats framför huset? Lägg upp den. Någon som behöver parkera betalar dig varje månad. Vi sköter pengarna, legitimeringen och tryggheten.</p>
    <div class="hero-cta" data-reveal style="--d:120ms">
      <button class="btn btn-p btn-lg" data-go="hyrut">${I("wallet", 18)}Se vad min plats är värd${I("arrow", 17, "arw")}</button>
      <button class="btn btn-lg" onclick="document.getElementById('kartan').scrollIntoView({behavior:'smooth',block:'start'})">${I("search", 18)}Se lediga platser</button>
    </div>
    <div class="trustrow" data-reveal style="--d:150ms">
      <span>${I("shield", 16)} Alla legitimerar sig med BankID</span>
      <span>${I("swish", 16)} Betala med Swish</span>
      <span>${I("lock", 16)} Skador ersätts upp till ${num(FEES.garantiBelopp)} ${sym()}</span>
    </div>
    <div class="figures" data-reveal style="--d:210ms">
      <div><b><span class="countup" data-count="${Math.round(sug.month * (CURRENCIES[SET.currency] || CURRENCIES.SEK).rate)}">${num(sug.month)}</span> ${sym()}</b><span>i snitt per månad i Stockholm</span></div>
      <div><b><span class="countup" data-count="${Math.round(FEES.schablon * (CURRENCIES[SET.currency] || CURRENCIES.SEK).rate)}">${num(FEES.schablon)}</span> ${sym()}</b><span>får du tjäna skattefritt varje år</span></div>
      <div><b class="countup" data-count="${SPOTS.length}">${SPOTS.length}</b><span>platser i ${AREAS.length} områden</span></div>
    </div>
  </div>
  <div data-reveal style="--d:240ms">
    <div class="receipt">
      <div class="receipt-h">
        <div class="k">Nästa utbetalning</div>
        <div class="v">${kr(2015)}</div>
        <div class="s">Ringvägen 41 · månadshyra · 25 augusti</div>
      </div>
      <div class="receipt-b">
        <div class="rrow"><span class="ic">${I("car", 19)}</span><span class="t"><b>ABC 123 · Volvo XC40</b><span>Står på din uppfart nu</span></span><span class="v" style="color:var(--green)">Aktiv</span></div>
        <div class="rrow"><span class="ic">${I("bolt", 19)}</span><span class="t"><b>Laddning</b><span>18,4 kWh den här veckan</span></span><span class="v">+${kr(92)}</span></div>
        <div class="perf"></div>
        <div class="rrow"><span class="ic">${I("receipt", 19)}</span><span class="t"><b>Skattefritt kvar i år</b><span>${num(14820)} av ${num(FEES.schablon)} ${sym()} använt</span></span><span class="v">63 %</span></div>
        <div class="meter" style="margin-top:2px"><i style="width:37%"></i></div>
      </div>
    </div>
  </div>
</div></div></div>

<div class="marquee"><div class="marquee-in">
  ${[...cities, ...cities].map(c => `<span>${esc(c)}</span>`).join("")}
</div></div>

<section class="tight" id="kartan"><div class="wrap">
  <div class="spread" style="align-items:flex-end;flex-wrap:wrap;gap:16px">
    <div>
      <span class="kicker">Lediga just nu</span>
      <h2 style="margin-top:12px">Var vill du parkera?</h2>
    </div>
    <button class="btn" data-go="sok">Öppna hela kartan${I("arrow", 16, "arw")}</button>
  </div>
  <div class="row wrap" style="margin-top:18px;gap:10px">
    <button class="placebtn" onclick="openPlacePicker()">${I("pin", 19)}<span>${esc(placeLabel())}</span>${I("chevron", 16, "flip90")}</button>
    <button class="btn" onclick="usePlacePos()">${I("target", 16)} Nära mig</button>
  </div>
</div>
<div class="wrap" style="margin-top:16px">
  <div class="mapwrap heromap">
    <div id="hmap" class="leafletmap"></div>
    <div class="mapui tl">
      <div class="msearch">
        <span class="mi">${I("search", 18)}</span>
        <input id="mapq" placeholder="Sök adress eller stad" autocomplete="off"
          oninput="onMapSearch(this.value)" onfocus="this.select()">
        <button class="mx" onclick="clearSearch()" aria-label="Rensa">${I("close", 15)}</button>
        <div id="mres"></div>
      </div>
    </div>
    <div class="mapui tr">
      <div class="mseg">
        <button class="${SET.mapMode !== "satellit" ? "on" : ""}" onclick="setMapMode('karta')">${I("map", 14)} Karta</button>
        <button class="${SET.mapMode === "satellit" ? "on" : ""}" onclick="setMapMode('satellit')">${I("layers", 14)} Satellit</button>
      </div>
      <button class="mbtn" onclick="locateMe()" title="Var är jag?">${I("target", 19)}</button>
    </div>
    <div class="maplegend">
      <span class="l-free"><i></i>Ledig nu</span>
      <span class="l-busy"><i></i>Upptagen</span>
      <span class="l-best"><i></i>Billigast</span>
    </div>
  </div>
  <p class="muted small center" style="margin-top:12px">Dra i kartan för att flytta den. Tryck på ett pris så ser du platsen.</p>
</div></section>

<section class="snug"><div class="wrap">
  <div class="callout brass" data-reveal style="display:flex;gap:13px;align-items:flex-start">
    ${I("info", 18)}<div><b>Så ser det ut idag.</b> Att parkera vid Arlanda kostar 1 495–1 995 kr i veckan. Boendeparkering i centrala Stockholm kostar 1 100 kr i månaden och kön till garage är flera år lång. Samtidigt står tusentals uppfarter tomma.</div>
  </div>
  <div class="panel pad" data-reveal style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-top:18px">
    <span class="tag clay">Nästa stora match</span>
    <div style="flex:1;min-width:210px">
      <h3>${esc(ev.name)}</h3>
      <p class="muted small" style="margin-top:3px">${esc(ev.venue)} · ${esc(ev.date)} kl ${esc(ev.time)} · ${ev.crowd.toLocaleString("sv-SE")} personer kommer</p>
    </div>
    <button class="btn btn-g" onclick="S.area='${ev.area}';S.mode='evenemang';go('sok')">Hitta plats nära${I("arrow", 17, "arw")}</button>
  </div>
</div></section>

<section><div class="wrap">
  <div class="split">
    <div>
      <span class="kicker" data-reveal>Så gör du</span>
      <h2 style="margin:14px 0 0" data-reveal>Fyra steg. <em>Två minuter.</em></h2>
      <p class="lede" style="margin-top:16px" data-reveal>Det kostar ingenting att lägga upp en plats. Vi tjänar pengar först när du gör det.</p>
      <button class="btn btn-p" style="margin-top:26px" data-reveal data-go="hyrut">Kom igång${I("arrow", 17, "arw")}</button>
    </div>
    <ul class="numlist" data-reveal>
      ${[["Lägg upp platsen", "Skriv adressen och välj vad det är för plats. Vi föreslår ett pris."],
         ["Välj när den är ledig", "Alltid, bara vardagar, eller bara när det är match. Du bestämmer."],
         ["Säg ja till föraren", "Alla har legitimerat sig med BankID och bokar med sitt registreringsnummer."],
         ["Få pengarna", "De landar på ditt konto den 25:e varje månad. Vi sköter Skatteverket åt dig."]]
        .map(([a, b], k) => `<li style="--d:${k * 70}ms"><span class="n">0${k + 1}</span><div><b>${a}</b><p>${b}</p></div></li>`).join("")}
    </ul>
  </div>
</div></section>

<section class="tight"><div class="wrap">
  <div class="spread" style="margin-bottom:20px">
    <div><span class="kicker">Områden</span><h2 style="margin-top:12px">Där behovet är störst</h2></div>
    <button class="btn btn-sm" data-go="sok">Se alla${I("arrow", 15, "arw")}</button>
  </div>
</div>
<div class="wrap" style="padding:0">
  <div class="rail">
    ${AREAS.map(a => `<button class="railcard" onclick="S.area='${a.id}';go('sok')">
      <span class="code3">${a.code}</span>
      <h4>${esc(a.name)}</h4>
      <div class="sub">${esc(a.sub)}</div>
      <div class="ref">${esc(a.ref)}</div>
      <div class="cnt">${SPOTS.filter(s => s.area === a.id).length} platser ${I("arrow", 14, "arw")}</div>
    </button>`).join("")}
  </div>
</div></section>

<section class="band"><div class="wrap">
  <div class="split">
    <div>
      <span class="kicker" data-reveal>Trygghet</span>
      <h2 style="margin:14px 0 0;color:var(--on-dark)" data-reveal>Tänk om någon<br><em style="color:var(--green-lift)">förstör något?</em></h2>
      <p class="lede" style="margin-top:18px;color:rgba(244,241,233,.72)" data-reveal>Det är den frågan alla ställer. Här är svaret.</p>
      <button class="btn btn-p" style="margin-top:26px" data-reveal data-go="trygg">Läs mer om trygghet${I("arrow", 17, "arw")}</button>
    </div>
    <div data-reveal>
      ${[["shield", `Vi ersätter upp till ${num(FEES.garantiBelopp)} ${sym()}`, "Går något sönder på din uppfart betalar vi. Du betalar ingen självrisk."],
         ["door", "Flyttar inte bilen?", `Tryck på en knapp. Vi ringer föraren, tar ${num(FEES.overtidPerTimme)} ${sym()} i timmen som går till dig, och bekostar bärgning.`],
         ["shield", "Alla är legitimerade", "Ingen kan boka anonymt. Vi vet vem det är och vilken bil det är."],
         ["camera", "Foto före och efter", "Båda tar ett kort. Blir det tvist tittar vi på bilderna."]]
        .map(([ic, h, p], k) => `<div style="display:grid;grid-template-columns:34px 1fr;gap:16px;padding:18px 0;border-bottom:1px solid rgba(244,241,233,.14)">
          <span style="color:var(--green-lift)">${I(ic, 22)}</span>
          <div><b style="display:block;font-size:1rem;font-weight:600">${h}</b>
          <p style="margin-top:5px;color:rgba(244,241,233,.66);font-size:.9rem">${p}</p></div></div>`).join("")}
    </div>
  </div>
</div></section>

<section><div class="wrap center">
  <h2 data-reveal>Vad är din uppfart värd?</h2>
  <p class="lede" style="margin:16px auto 0" data-reveal>Räkna ut det på tjugo sekunder. Du behöver inget konto.</p>
  <button class="btn btn-p btn-lg" style="margin-top:26px" data-reveal data-go="hyrut">${I("wallet", 18)}Öppna räknaren${I("arrow", 17, "arw")}</button>
</div></section>
${footerHTML()}`;
}

/* ============================================================
   VY: SÖK
   ============================================================ */
function baseList() {
  let list = SPOTS.filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
  if (S.q.trim()) {
    const q = S.q.toLowerCase();
    list = list.filter(s => (s.nm + " " + s.ad + " " + s.type + " " + s.feat.join(" ")).toLowerCase().includes(q));
  }
  if (S.fCharge) list = list.filter(s => s.charge);
  if (S.fGarage) list = list.filter(s => s.kind === "garage" || s.kind === "carport");
  if (S.fSecure) list = list.filter(s => s.feat.some(f => /Kamera|Låst|Grind|Portkod/.test(f)));
  if (S.fBig)    list = list.filter(s => /SUV|husbil|buss|husvagn|släp/i.test(s.size));
  if (S.maxPrice) list = list.filter(s => priceFor(s, S.mode) <= S.maxPrice);
  const ref = S.near || (AREAS.find(a => a.id === S.area) || AREAS[0]).c;
  list.forEach(s => s._km = distKm(ref, s.ll));
  const by = {
    pris: (a, b) => priceFor(a, S.mode) - priceFor(b, S.mode),
    betyg: (a, b) => b.rate - a.rate || b.n - a.n,
    avstand: (a, b) => a._km - b._km
  };
  return list.slice().sort(by[S.sort] || by.pris);
}
/* Vilken nål som ska lysa grönt, vilken som är billigast av de lediga. */
function makeStateOf(list) {
  const free = list.filter(spotFree);
  const pool = free.length ? free : list;
  let best = null, min = Infinity;
  pool.forEach(x => { const p = priceFor(x, S.mode); if (p && p < min) { min = p; best = x.id; } });
  return s => ({ label: num(priceFor(s, S.mode)) + " " + sym(), free: spotFree(s), best: s.id === best });
}

function activeFilterCount() { return [S.fCharge, S.fGarage, S.fSecure, S.fBig, !!S.maxPrice].filter(Boolean).length; }

function viewSok() {
  const area = AREAS.find(a => a.id === S.area) || AREAS[0];
  const list = baseList();
  const nf = activeFilterCount();
  return `
<div class="wrap" style="padding-top:16px">
  <div class="row" style="gap:10px;margin-bottom:12px">
    <button class="placebtn" onclick="openPlacePicker()">${I("pin", 19)}<span>${esc(placeLabel())}</span>${I("chevron", 16, "flip90")}</button>
    <button class="btn" onclick="usePlacePos()" title="Nära mig" aria-label="Nära mig">${I("target", 18)}</button>
  </div>
  <div class="spread" style="gap:12px;flex-wrap:wrap">
    <div class="seg" style="max-width:230px;flex:1">
      <button class="${S.view === "karta" ? "on" : ""}" onclick="setView('karta')">${I("map", 15)} ${esc(t("map"))}</button>
      <button class="${S.view === "lista" ? "on" : ""}" onclick="setView('lista')">${I("list", 15)} ${esc(t("list"))}</button>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn btn-sm" onclick="openFilters()">${I("filter", 15)} ${esc(t("filters"))}${nf ? ` <b class="mono">${nf}</b>` : ""}</button>
      <select class="inp" style="min-height:38px;padding:6px 30px 6px 12px;font-size:.84rem;width:auto"
        onchange="S.sort=this.value;refreshResults()">
        <option value="pris" ${S.sort === "pris" ? "selected" : ""}>${esc(t("sort_price"))}</option>
        <option value="betyg" ${S.sort === "betyg" ? "selected" : ""}>${esc(t("sort_rating"))}</option>
        <option value="avstand" ${S.sort === "avstand" ? "selected" : ""}>${esc(t("sort_dist"))}</option>
      </select>
    </div>
  </div>

  <div class="seg" style="margin-top:12px" id="modeSeg">
    ${[["timme", t("hour")], ["dygn", t("day")], ["vecka", t("week")], ["manad", t("month")], ["evenemang", t("event")]]
      .map(([k, l]) => `<button class="${S.mode === k ? "on" : ""}" onclick="setMode('${k}')">${esc(l)}</button>`).join("")}
  </div>

  <div class="chips" style="margin-top:11px">
    <button class="chip ${S.fCharge ? "on" : ""}" onclick="tog('fCharge',this)">${I("bolt", 15)} Laddbox</button>
    <button class="chip ${S.fGarage ? "on" : ""}" onclick="tog('fGarage',this)">${I("garage", 15)} Tak eller garage</button>
    <button class="chip ${S.fSecure ? "on" : ""}" onclick="tog('fSecure',this)">${I("lock", 15)} Låst</button>
    <button class="chip ${S.fBig ? "on" : ""}" onclick="tog('fBig',this)">${I("truck", 15)} Stor bil</button>
    ${nf ? `<button class="chip" onclick="clearFilters()">${I("close", 14)} ${esc(t("clear"))}</button>` : ""}
  </div>
</div>

<div class="wrap" style="margin-top:14px" id="sokBody">${sokBodyHTML(list, area)}</div>
${S.view === "lista" ? footerHTML() : ""}`;
}

function sokBodyHTML(list, area) {
  if (S.view === "karta") {
    return `
    <div class="mapwrap full">
      <div id="lmap" class="leafletmap"></div>
      <div class="mapui tl">
        <div class="msearch ${S.q || S.nearLabel ? "filled" : ""}">
          <span class="mi">${I("search", 18)}</span>
          <input id="mapq" value="${esc(S.nearLabel || S.q)}" placeholder="Sök adress, plats eller stad"
            autocomplete="off" oninput="onMapSearch(this.value)" onfocus="this.select()">
          <button class="mx" onclick="clearSearch()" aria-label="Rensa">${I("close", 15)}</button>
          <div id="mres"></div>
        </div>
      </div>
      <div class="mapui tr">
        <div class="mseg">
          <button class="${PMap.getMode() !== "satellit" ? "on" : ""}" onclick="setMapMode('karta')">${I("map", 14)} ${esc(t("map"))}</button>
          <button class="${PMap.getMode() === "satellit" ? "on" : ""}" onclick="setMapMode('satellit')">${I("layers", 14)} ${esc(t("satellite"))}</button>
        </div>
        <button class="mbtn" onclick="locateMe()" aria-label="Visa var jag är" title="Var är jag?">${I("target", 19)}</button>
        <button class="mbtn" onclick="fitAll()" aria-label="Visa alla platser" title="Visa alla">${I("layers", 19)}</button>
      </div>
      <div class="maplegend">
        <span class="l-free"><i></i>Ledig nu</span>
        <span class="l-busy"><i></i>Upptagen</span>
        <span class="l-best"><i></i>Billigast</span>
      </div>
      <div id="mcard"></div>
    </div>
    <div class="maplegend">
      <span class="l-free"><i></i>Ledig nu</span>
      <span class="l-busy"><i></i>Upptagen</span>
      <span class="l-best"><i></i>Billigast</span>
    </div>
    </div>
    <p class="muted small center" style="margin-top:12px">Dra i kartan för att flytta den. Nyp med två fingrar för att zooma. Tryck på ett pris för att se platsen.</p>`;
  }
  return `
  <div class="mapwrap short" style="margin-bottom:18px">
    <div id="lmap" class="leafletmap"></div>
    <div class="mapui bl"><span class="mapnote" style="position:static">${esc(area.name)}</span></div>
    <div class="mapui tr"><button class="mbtn" onclick="setView('karta')" title="Öppna stor karta">${I("external", 18)}</button></div>
  </div>
  <div class="spread" style="margin-bottom:6px">
    <h3>${list.length} ${esc(t("free_spots"))}</h3>
    <span class="tag brass">${esc(area.ref)}</span>
  </div>
  <div class="spotlist">${list.length ? list.map(spotRow).join("") : emptyHTML()}</div>
  ${savingsHTML(list, area)}
  <div class="hint" style="margin-top:18px">${I("info", 17)}
    <div><b>Hittar du inget?</b> Skapa en bevakning så hör vi av oss när något blir ledigt.
    <button class="btn btn-sm" style="margin-top:9px" onclick="addWatch()">Bevaka ${esc(area.name)}</button></div>
  </div>`;
}

function spotRow(s) {
  const p = priceFor(s, S.mode);
  const fav = FAVS.includes(s.id);
  return `<button class="spot ${S.selSpot === s.id ? "sel" : ""}" onclick="openSpot(${s.id})">
    <span class="thumb">${kindIcon(s.kind, 28)}</span>
    <span class="body">
      <span class="nm">${esc(s.nm)}</span>
      <span class="ad">${esc(s.ad)}</span>
      <span class="tags">
        <span class="tag">${esc(s.type)}</span>
        ${s.charge ? `<span class="tag green">${I("bolt", 11)} Laddbox</span>` : ""}
        ${s._km != null ? `<span class="tag">${s._km < 1 ? Math.round(s._km * 1000) + " m" : s._km.toFixed(1).replace(".", ",") + " km"}</span>` : ""}
        ${ratingHTML(s)}
      </span>
    </span>
    <span class="price"><b>${num(p)} ${sym()}</b><span>${esc(unitShort(S.mode))}</span></span>
    <span class="fav ${fav ? "on" : ""}" onclick="event.stopPropagation();toggleFav(${s.id})" role="button"
      aria-label="Spara">${fav ? IF("heart", 17) : I("heart", 17)}</span>
  </button>`;
}
function emptyHTML() {
  return `<div class="empty"><div class="ic">${I("search", 34)}</div>
    <h3>Inga platser matchar</h3>
    <p class="dim small" style="margin-top:8px">Ta bort ett filter eller byt tidsläge.</p>
    <button class="btn btn-sm btn-p" style="margin-top:16px" onclick="clearFilters()">Rensa filter</button></div>`;
}
function savingsHTML(list, area) {
  if (S.mode !== "manad" || !list.length) return "";
  const cheapest = Math.min.apply(null, list.map(s => s.m));
  const refMap = { sthlm:1100, gbg:1500, malmo:1100, uppsala:1050, lund:950, vasteras:750, solna:1200, arn:1400 };
  const ref = refMap[area.id] || 1000, diff = ref - cheapest;
  if (diff <= 0) return "";
  return `<div class="callout" style="margin-top:18px">
    <b>Du sparar ${kr(diff * 12)} på ett år.</b> Billigaste platsen här kostar ${kr(cheapest)} i månaden.
    Kommunens parkering eller p-huset kostar ungefär ${kr(ref)}.</div>`;
}

/* ---- interaktion utan omritning av hela vyn ---- */
function setView(v) { S.view = v; PMap.destroy(); render(); }
function setMode(m) {
  S.mode = m; S.maxPrice = 0;
  document.querySelectorAll("#modeSeg button").forEach((b, k) =>
    b.classList.toggle("on", ["timme", "dygn", "vecka", "manad", "evenemang"][k] === m));
  refreshResults();
}
function tog(k, btn) { S[k] = !S[k]; btn.classList.toggle("on"); refreshResults(); }
function clearFilters() {
  S.fCharge = S.fGarage = S.fSecure = S.fBig = false; S.maxPrice = 0; S.q = "";
  render();
}
function refreshResults() {
  const list = baseList(), area = AREAS.find(a => a.id === S.area) || AREAS[0];
  if (S.route === "sok" && S.view === "lista") {
    const box = document.querySelector(".spotlist");
    if (box) {
      box.innerHTML = list.length ? list.map(spotRow).join("") : emptyHTML();
      const h = document.querySelector("#sokBody h3");
      if (h) h.textContent = list.length + " " + t("free_spots");
    } else render();
  } else {
    const note = document.querySelector(".mapui.bl .mapnote");
    if (note) note.textContent = list.length + " " + t("free_spots");
    const card = document.getElementById("mcard"); if (card) card.innerHTML = "";
    S.selSpot = null;
  }
  if (PMap.alive()) PMap.setSpots(list, makeStateOf(list), S.selSpot);
}
function toggleFav(id) {
  const i = FAVS.indexOf(id);
  if (i < 0) { FAVS.push(id); toast("Sparad", "heart"); } else { FAVS.splice(i, 1); toast("Borttagen", "heart"); }
  persist(); refreshResults();
}
function addWatch() {
  const a = AREAS.find(x => x.id === S.area);
  if (!WATCH.includes(a.id)) { WATCH.push(a.id); persist(); }
  toast("Bevakning skapad för " + a.name, "bell");
}

/* ---- karta ---- */
function mountMap(id, opts) {
  opts = opts || {};
  const el = document.getElementById(id || "lmap");
  if (!el || typeof L === "undefined") return;
  const area = AREAS.find(a => a.id === S.area) || AREAS[0];
  PMap.init(el, S.near || area.c, S.near ? (S.partZoom || 14) : area.z, { onPick: opts.onPick || pickSpot });
  PMap.setMode(SET.mapMode);
  const list = baseList();
  PMap.setSpots(list, makeStateOf(list), S.selSpot);
  if (S.near) PMap.showMe(S.near);
  if (opts.fit) setTimeout(() => PMap.fitSpots(list, opts.pad || 40), 140);
}
/* Startsidans karta: ett tryck på ett pris öppnar platsen direkt. */
/* Var vill du parkera? Egen position, stad, och sedan stadsdel. */
function placeLabel() {
  if (S.nearLabel) return S.nearLabel;
  const a = AREAS.find(x => x.id === S.area) || AREAS[0];
  return S.part ? a.name.split(" ")[0] + " · " + S.part : a.name;
}
function openPlacePicker() {
  const a = AREAS.find(x => x.id === S.area) || AREAS[0];
  const parts = (typeof PARTS !== "undefined" && PARTS[S.area]) || [];
  openSheet(sheetHead("Var vill du parkera?") + `<div class="sheet-b stack">
    <button class="btn btn-p btn-block btn-lg" onclick="usePlacePos()">
      ${I("target", 18)} Använd min plats</button>
    <p class="muted small center" style="margin-top:-4px">Vi frågar din telefon om din position – inget sparas.</p>

    <div class="rule"></div>
    <div class="field"><label>Stad eller område</label>
      <div class="chips" style="flex-wrap:wrap;overflow:visible">
        ${AREAS.map(x => `<button class="chip ${x.id === S.area ? "on" : ""}"
          onclick="pickCity('${x.id}')">${esc(x.name.split(" ")[0])}</button>`).join("")}
      </div></div>

    ${parts.length ? `<div class="field"><label>Var i ${esc(a.name.split(" ")[0])}?</label>
      <div class="chips" style="flex-wrap:wrap;overflow:visible">
        ${parts.map((p, i) => `<button class="chip ${(S.part || parts[0][0]) === p[0] ? "on" : ""}"
          onclick="pickPart(${i})">${esc(p[0])}</button>`).join("")}
      </div></div>` : ""}

    <button class="btn btn-p btn-block btn-lg" onclick="closeSheet();render()">Visa platserna</button>
  </div>`);
}
function usePlacePos() {
  toast("Letar upp var du är …", "target");
  PMap.locate((ll, err) => {
    if (!ll) { toast(err || "Kunde inte hitta dig. Tillåt platstjänster i webbläsaren.", "info"); return; }
    S.near = ll; S.nearLabel = "Nära mig"; S.part = null; S.sort = "avstand";
    closeSheet(); render(); toast("Visar platser nära dig", "check");
  });
}
function pickCity(id) {
  S.area = id; SET.city = id; saveSettings();
  S.near = null; S.nearLabel = ""; S.part = null; S.selSpot = null;
  openPlacePicker();
}
function pickPart(i) {
  const parts = PARTS[S.area] || []; const p = parts[i]; if (!p) return;
  S.part = i === 0 ? null : p[0];
  S.near = i === 0 ? null : p[1];
  S.nearLabel = ""; S.partZoom = p[2];
  openPlacePicker();
}

function setAreaOnMap(id, btn) {
  S.area = id; SET.city = id; saveSettings();
  S.near = null; S.nearLabel = ""; S.selSpot = null;
  if (btn) { btn.parentElement.querySelectorAll(".chip").forEach(c => c.classList.remove("on")); btn.classList.add("on"); }
  const area = AREAS.find(a => a.id === id);
  const box = document.getElementById("mapq"); if (box) box.value = "";
  PMap.flyTo(area.c, area.z);
  refreshResults();
}
function setMapMode(m) {
  SET.mapMode = m; saveSettings(); PMap.setMode(m);
  document.querySelectorAll(".mseg button").forEach((b, k) => b.classList.toggle("on", (k === 0) === (m !== "satellit")));
}
function fitAll() { PMap.fitSpots(baseList(), 60); toast("Visar alla platser", "layers"); }
function locateMe() {
  toast("Letar upp var du är …", "target");
  PMap.locate((ll, err) => {
    if (!ll) { toast(err || "Kunde inte hitta dig", "info"); return; }
    S.near = ll; S.nearLabel = "Min position"; S.sort = "avstand";
    const box = document.getElementById("mapq"); if (box) box.value = "Min position";
    refreshResults(); toast("Sorterat efter närmast dig", "check");
  });
}
function pickSpot(id) {
  S.selSpot = id;
  const s = SPOTS.find(x => x.id === id); if (!s) return;
  const _l = baseList(); PMap.setSpots(_l, makeStateOf(_l), id);
  PMap.flyTo(s.ll, Math.max(15, 15));
  const box = document.getElementById("mcard");
  if (!box) return;
  box.innerHTML = `<div class="mcard" onclick="openSpot(${s.id})">
    <span class="thumb">${kindIcon(s.kind, 26)}</span>
    <div style="min-width:0">
      <div class="nm">${esc(s.nm)}</div>
      <div class="ad">${esc(s.ad)}</div>
      <div class="tags"><span class="tag">${esc(s.type)}</span>${s.charge ? `<span class="tag green">${I("bolt", 11)} Laddbox</span>` : ""}${ratingHTML(s)}</div>
    </div>
    <div class="pr"><b>${num(priceFor(s, S.mode))} ${sym()}</b><span>${esc(unitShort(S.mode))}</span></div>
  </div>`;
}
function onMapSearch(v) {
  S.q = v;
  const box = document.getElementById("mres");
  const wrap = document.querySelector(".msearch");
  if (wrap) wrap.classList.toggle("filled", !!v);
  if (!box) return;
  if (!v || v.length < 3) { box.innerHTML = ""; refreshResults(); return; }
  box.innerHTML = `<div style="padding:14px 15px" class="muted small">Söker …</div>`;
  PMap.geocode(v, rows => {
    const inApp = SPOTS.filter(s => (s.nm + " " + s.ad).toLowerCase().includes(v.toLowerCase())).slice(0, 3);
    if (!rows.length && !inApp.length) { box.innerHTML = `<div style="padding:14px 15px" class="muted small">Inga träffar. Prova ett gatunamn eller en stad.</div>`; return; }
    box.innerHTML =
      inApp.map(s => `<button onclick="jumpSpot(${s.id})"><span class="ic">${I("pin", 17)}</span>
        <span style="min-width:0"><b>${esc(s.nm)}</b><span>${esc(s.ad)}</span></span></button>`).join("") +
      rows.map((r, k) => `<button onclick="jumpGeo(${k})"><span class="ic">${I("search", 17)}</span>
        <span style="min-width:0"><b>${esc(r.label)}</b><span>${esc(r.full)}</span></span></button>`).join("");
    window._geo = rows;
  });
}
function jumpGeo(k) {
  const r = (window._geo || [])[k]; if (!r) return;
  S.near = r.ll; S.nearLabel = r.label; S.q = ""; S.sort = "avstand";
  document.getElementById("mres").innerHTML = "";
  const box = document.getElementById("mapq"); if (box) { box.value = r.label; box.blur(); }
  PMap.showMe(r.ll); PMap.flyTo(r.ll, 15);
  refreshResults();
  toast("Visar platser nära " + r.label.split(",")[0], "pin");
}
function jumpSpot(id) {
  document.getElementById("mres").innerHTML = "";
  const box = document.getElementById("mapq"); if (box) box.blur();
  S.q = ""; refreshResults(); pickSpot(id);
}
function clearSearch() {
  S.q = ""; S.near = null; S.nearLabel = ""; S.sort = "pris";
  const box = document.getElementById("mapq"); if (box) box.value = "";
  const r = document.getElementById("mres"); if (r) r.innerHTML = "";
  document.querySelector(".msearch").classList.remove("filled");
  const area = AREAS.find(a => a.id === S.area) || AREAS[0];
  PMap.flyTo(area.c, area.z);
  refreshResults();
}

/* ---- filter-sheet med laggfritt reglage ---- */
function openFilters() {
  const all = SPOTS.filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
  const prices = all.map(s => priceFor(s, S.mode));
  const lo = prices.length ? Math.min.apply(null, prices) : 0;
  const hi = prices.length ? Math.max.apply(null, prices) : 100;
  const cur = S.maxPrice || hi;
  openSheet(sheetHead(t("filters")) + `<div class="sheet-b stack">
    <div class="field"><label>Var vill du parkera?</label>
      <button class="placebtn" onclick="openPlacePicker()">${I("pin", 19)}<span>${esc(placeLabel())}</span>${I("chevron", 16, "flip90")}</button>
    </div>
    <div class="slider">
      <div class="top"><span class="lbl">Högsta pris ${esc(unitLong(S.mode))}</span>
        <span class="val" id="mpv">${num(cur)} ${sym()}</span></div>
      <input type="range" id="mpr" min="${lo}" max="${hi}" step="${hi > 900 ? 10 : 1}" value="${cur}"
        style="--pct:${((cur - lo) / Math.max(1, hi - lo) * 100)}%"
        oninput="onPriceSlide(this,${lo},${hi})" onchange="S.maxPrice=+this.value===${hi}?0:+this.value">
      <div class="scale"><span>${num(lo)} ${sym()}</span><span>${num(hi)} ${sym()}</span></div>
    </div>
    <div class="rule"></div>
    ${[["fCharge", "bolt", "Laddbox", "Du kan ladda elbilen där"],
       ["fGarage", "garage", "Tak eller garage", "Bilen står torrt och snöfritt"],
       ["fSecure", "lock", "Låst eller bevakad", "Grind, portkod eller kamera"],
       ["fBig", "truck", "Stor bil", "SUV, husbil, släp eller buss"]]
      .map(([k, ic, tt, ss]) => `<div class="setrow"><span style="color:var(--ink-45)">${I(ic, 20)}</span>
        <div class="t"><b>${tt}</b><span>${ss}</span></div>
        <div class="switch ${S[k] ? "on" : ""}" role="switch" onclick="S['${k}']=!S['${k}'];this.classList.toggle('on')"></div></div>`).join("")}
    <button class="btn btn-p btn-block btn-lg" onclick="closeSheet();render()">Visa platserna</button>
    <button class="btn btn-block" onclick="clearFilters();closeSheet()">${esc(t("clear"))} allt</button>
  </div>`);
}
function onPriceSlide(inp, lo, hi) {
  const v = +inp.value;
  inp.style.setProperty("--pct", ((v - lo) / Math.max(1, hi - lo) * 100) + "%");
  const out = document.getElementById("mpv");
  if (out) out.textContent = num(v) + " " + sym();
}

/* ============================================================
   PLATSDETALJ + BOKNING
   ============================================================ */
function openSpot(id) {
  const s = SPOTS.find(x => x.id === id); if (!s) return;
  S.selSpot = id;
  const p = priceFor(s, S.mode) || s.d || s.m;
  const f = feeSplit(p, S.mode);
  const revs = (typeof reviewsWithMine === "function") ? reviewsWithMine(id) : reviewsFor(id);
  const sim = SPOTS.filter(x => x.area === s.area && x.id !== s.id && priceFor(x, S.mode) > 0).slice(0, 3);
  openSheet(sheetHead(s.nm) + `<div class="sheet-b">
    <div class="gallery">${["driveway", "camera", "map", "moon"].map(g => `<div class="g">${I(g, 40)}</div>`).join("")}</div>
    <div class="row wrap" style="margin-top:14px">
      <span class="tag">${esc(s.type)}</span>
      ${s.charge ? `<span class="tag green">${I("bolt", 11)} Laddbox</span>` : ""}
      ${s.walk ? `<span class="tag">${s.walk} min att gå</span>` : ""}
      ${ratingHTML(s)}
    </div>
    <p class="dim small" style="margin-top:11px">${esc(s.ad)} · Passar ${esc(s.size)}</p>
    <div class="row wrap" style="margin-top:9px">${s.feat.map(x => `<span class="tag">${esc(x)}</span>`).join("")}</div>
    <button class="btn btn-sm" style="margin-top:14px" onclick="shareSpot(${s.id})">${I("share", 15)} Dela platsen</button>

    <div class="panel pad" style="margin-top:18px;background:var(--paper-2)">
      <div class="row"><span class="rev-av av" style="width:38px;height:38px;border-radius:50%;background:var(--pine);color:var(--on-dark);display:grid;place-items:center;font-weight:600">${esc(s.host[0])}</span>
        <div><b>${esc(s.host)}</b><div class="muted small">Värd sedan ${s.hostSince} · svarar oftast inom 10 minuter</div></div></div>
      <p class="quote" style="margin:14px 0 0">${esc(s.instr)}</p>
      <button class="btn btn-sm" style="margin-top:14px" onclick="closeSheet();go('meddelanden')">${I("message", 15)} Ställ en fråga</button>
    </div>

    <div class="panel pad" style="margin-top:16px">
      <div class="spread"><span class="lbl">Pris ${esc(unitLong(S.mode))}</span><b class="mono">${kr(f.base)}</b></div>
      <div style="margin-top:12px">
        <div class="kv"><span>Serviceavgift</span><b>${kr(f.service)}</b></div>
        <div class="kv"><span>Trygghetsgaranti ${num(FEES.garantiBelopp)} ${sym()}</span><b>${kr(f.trygg)}</b></div>
        <div class="tot"><span>Du betalar</span><span>${kr(f.driverTotal)}</span></div>
      </div>
      <p class="muted small" style="margin-top:11px">Avboka gratis fram till 24 timmar innan. Ingen p-bot kan utfärdas – det är privat mark.</p>
    </div>

    <h4 style="margin:22px 0 8px">Lediga dagar</h4>
    ${calendarHTML(s)}

    <h4 style="margin:22px 0 2px">Vad andra säger</h4>
    <div>${revs.map(r => `<div class="rev">
      <div class="who"><span class="av">${esc(r.who[0])}</span><b>${esc(r.who)}</b>
      <span style="margin-left:auto;color:var(--brass);display:flex;gap:1px">${IF("star", 12).repeat(r.r)}</span></div>
      <p>${esc(r.t)}</p><span class="d">${esc(r.d)}</span></div>`).join("")}</div>

    ${sim.length ? `<h4 style="margin:22px 0 4px">Liknande i närheten</h4>
      <div class="spotlist">${sim.map(spotRow).join("")}</div>` : ""}

    <div class="sticky-cta">
      <button class="btn btn-p btn-block btn-lg" onclick="startBooking(${s.id})">
        Boka – ${kr(f.driverTotal)}${I("arrow", 17, "arw")}</button>
    </div>
  </div>`);
}
function calendarHTML(s) {
  const today = new Date(), days = ["M","T","O","T","F","L","S"];
  const start = new Date(today); start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  let cells = "";
  for (let i = 0; i < 28; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const busy = (s.id * 7 + i * 3) % 11 === 0;
    cells += `<div class="d ${busy ? "busy" : "free"}">${d.getDate()}</div>`;
  }
  return `<div class="panel pad">
    <div class="cal">${days.map(d => `<div class="h">${d}</div>`).join("")}</div>
    <div class="cal" style="margin-top:5px">${cells}</div>
    <div class="row" style="margin-top:14px"><span class="tag green">Ledigt</span><span class="tag">Upptaget</span></div>
  </div>`;
}

/* ---- bokning ---- */
function startBooking(id) {
  S.bk = { id, step: 1, qty: 1, charge: false, extraCar: false, code: "", pay: "swish",
           reg: LS.get("lastreg", ""), date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) };
  renderBooking();
}
function bkTotals() {
  const s = SPOTS.find(x => x.id === S.bk.id), b = S.bk;
  const unit = priceFor(s, S.mode) || s.d || s.m;
  const base = unit * b.qty;
  const chargeCost = b.charge ? (S.mode === "manad" ? 380 : 55) * b.qty : 0;
  const extraCost = b.extraCar ? Math.round(base * 0.6) : 0;
  const sub = base + chargeCost + extraCost;
  const disc = b.code.toUpperCase() === "PARKLA50" ? Math.round(sub * .5) : b.code.toUpperCase() === "GRANNE" ? 100 : 0;
  return Object.assign({ unit, base, chargeCost, extraCost, disc }, feeSplit(sub - disc, S.mode));
}
const PRESETS  = { timme:[1,2,4,8], dygn:[1,2,3,7], vecka:[1,2,4], manad:[1,3,6,12], evenemang:[1,2,3] };
const QTY_WORD = { timme:"timmar", dygn:"dygn", vecka:"veckor", manad:"m\u00e5nader", evenemang:"platser" };
const QTY_ONE  = { timme:"timme",  dygn:"dygn", vecka:"vecka",  manad:"m\u00e5nad",   evenemang:"plats" };

function renderBooking() {
  const s = SPOTS.find(x => x.id === S.bk.id), b = S.bk, T = bkTotals();
  const word = QTY_WORD[S.mode] || "dygn", one = QTY_ONE[S.mode] || "dygn";
  const dots = n => `<div class="progress">${[1,2,3].map(k => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</div>`;

  /* ---------- Steg 1: n\u00e4r? ---------- */
  if (b.step === 1) {
    openSheet(sheetHead(s.nm) + `<div class="sheet-b stack">
      ${dots(1)}
      <div>
        <h3 style="font-size:1.3rem">N\u00e4r vill du parkera?</h3>
        <p class="muted small" style="margin-top:5px">Tv\u00e5 steg. Du betalar f\u00f6rst n\u00e4r v\u00e4rden sagt ja.</p>
      </div>

      <div class="field"><label>Fr\u00e5n vilken dag?</label>
        <input class="inp" type="date" id="bkdate" value="${esc(b.date)}" onchange="S.bk.date=this.value"></div>

      <div class="field"><label>Hur ${S.mode === "evenemang" ? "m\u00e5nga platser" : "l\u00e4nge"}?</label>
        <div class="chips" id="bkpre" style="margin-bottom:12px">
          ${(PRESETS[S.mode] || [1,2,3]).map(n => `<button class="chip ${b.qty === n ? "on" : ""}" data-n="${n}"
            onclick="bkPreset(${n})">${n} ${n === 1 ? one : word}</button>`).join("")}
        </div>
        <div class="row" style="justify-content:space-between">
          <div class="stepper">
            <button onclick="bkQty(-1)" ${b.qty <= 1 ? "disabled" : ""} aria-label="F\u00e4rre">${I("minus", 18)}</button>
            <span class="v" id="bkq">${b.qty}</span>
            <button onclick="bkQty(1)" aria-label="Fler">${I("plus", 18)}</button>
          </div>
          <span class="muted small">${word}</span>
        </div></div>

      <div class="bigprice" id="bkbig">${bigPriceHTML(T)}</div>

      <div class="sticky-cta">
        <button class="btn btn-p btn-block btn-lg" onclick="bkStep(2)">Forts\u00e4tt${I("arrow", 17, "arw")}</button>
      </div>
    </div>`);
    return;
  }

  /* ---------- Steg 2: betala ---------- */
  const pays = [["swish","swish","Swish"],["kort","card","Kort"],["klarna","receipt","Klarna"],["faktura","bank","Faktura"]];
  openSheet(`<div class="sheet-h">
      <button class="x" onclick="bkStep(1)" aria-label="${t("back")}"><span class="flip">${I("chevron", 16)}</span></button>
      <h3>N\u00e4stan klart</h3>
      <button class="x" onclick="closeSheet()" aria-label="${t("close")}">${I("close", 16)}</button>
    </div><div class="sheet-b stack">
    ${dots(2)}

    <div class="recap">
      <span class="ic">${kindIcon(s.kind, 22)}</span>
      <div class="t"><b>${esc(s.nm)}</b><span>${b.qty} ${b.qty === 1 ? one : word} fr\u00e5n ${esc(b.date)}</span></div>
      <button class="btn btn-sm" onclick="bkStep(1)">\u00c4ndra</button>
    </div>

    <div class="field"><label>Bilens registreringsnummer</label>
      <input class="inp plate" id="regnr" placeholder="ABC 123" maxlength="8"
        value="${esc(b.reg)}" oninput="S.bk.reg=this.value" autocomplete="off"></div>

    <div>
      <div class="lbl" style="margin-bottom:9px">Hur vill du betala?</div>
      <div class="paygrid">
        ${pays.map(([k, ic, l]) => `<button class="paycard ${b.pay === k ? "on" : ""}" data-pay="${k}"
          onclick="bkPay('${k}')">${I(ic, 22)}<span>${l}</span></button>`).join("")}
      </div></div>

    <button class="morebtn ${(b.charge || b.extraCar || b.code) ? "open" : ""}" onclick="bkMore(this)">
      ${I("plus", 15)} Laddning, en bil till eller rabattkod</button>
    <div class="moreblock" id="bkmore" ${(b.charge || b.extraCar || b.code) ? "" : "hidden"}>
      ${s.charge ? `<div class="setrow"><span style="color:var(--green)">${I("bolt", 20)}</span>
        <div class="t"><b>Ladda elbilen</b><span>${S.mode === "manad" ? kr(380) + " i m\u00e5naden" : kr(55) + " per g\u00e5ng"}</span></div>
        <div class="switch ${b.charge ? "on" : ""}" role="switch" onclick="bkTog('charge',this)"></div></div>` : ""}
      <div class="setrow"><span style="color:var(--ink-45)">${I("car", 20)}</span>
        <div class="t"><b>En bil till</b><span>Om platsen rymmer tv\u00e5 fordon</span></div>
        <div class="switch ${b.extraCar ? "on" : ""}" role="switch" onclick="bkTog('extraCar',this)"></div></div>
      <div class="field" style="margin-top:14px"><label>Rabattkod</label>
        <div class="row"><input class="inp" id="bkcode" placeholder="Till exempel GRANNE" value="${esc(b.code)}">
        <button class="btn" onclick="S.bk.code=document.getElementById('bkcode').value;renderBooking()">Anv\u00e4nd</button></div></div>
    </div>

    <div class="panel pad" id="bksum">${bkSumHTML(T)}</div>

    <div class="sticky-cta">
      <button class="btn btn-p btn-block btn-lg" onclick="confirmBooking()">${I("shield", 18)} ${esc(t("book"))}</button>
      <p class="muted small center" style="margin-top:10px">Avboka gratis fram till 24 timmar innan.</p>
    </div>
  </div>`);
}

function bigPriceHTML(T) {
  return `<span class="lbl">Du betalar</span>
    <b>${kr(T.driverTotal)}</b>
    <span class="muted small">${num(T.unit)} ${sym()} ${esc(unitLong(S.mode))}, avgifter inr\u00e4knade</span>`;
}
function bkStep(n) {
  const d = document.getElementById("bkdate"); if (d && d.value) S.bk.date = d.value;
  const r = document.getElementById("regnr");  if (r) S.bk.reg = r.value;
  S.bk.step = n; renderBooking();
}
function bkPreset(n) { S.bk.qty = n; patchBkSum(); }
function bkMore(btn) {
  const m = document.getElementById("bkmore");
  m.hidden = !m.hidden;
  btn.classList.toggle("open", !m.hidden);
}

function bkSumHTML(T) {
  return `<div class="kv"><span>${num(T.unit)} ${sym()} × ${S.bk.qty}</span><b>${kr(T.base)}</b></div>
    ${T.chargeCost ? `<div class="kv"><span>Laddning</span><b>${kr(T.chargeCost)}</b></div>` : ""}
    ${T.extraCost ? `<div class="kv"><span>En bil till</span><b>${kr(T.extraCost)}</b></div>` : ""}
    ${T.disc ? `<div class="kv"><span style="color:var(--green)">Rabatt</span><b style="color:var(--green)">−${kr(T.disc)}</b></div>` : ""}
    <div class="kv"><span>Serviceavgift</span><b>${kr(T.service)}</b></div>
    <div class="kv"><span>Trygghetsgaranti</span><b>${kr(T.trygg)}</b></div>
    <div class="tot"><span>Totalt</span><span>${kr(T.driverTotal)}</span></div>`;
}
function patchBkSum() {
  const T = bkTotals();
  const box = document.getElementById("bksum");
  if (box) { box.innerHTML = bkSumHTML(T); box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash"); }
  const big = document.getElementById("bkbig"); if (big) big.innerHTML = bigPriceHTML(T);
  const q = document.getElementById("bkq"); if (q) q.textContent = S.bk.qty;
  const minus = document.querySelector(".stepper button:first-child");
  if (minus) minus.disabled = S.bk.qty <= 1;
  document.querySelectorAll("#bkpre .chip").forEach(c => c.classList.toggle("on", +c.dataset.n === S.bk.qty));
}
function bkQty(d) { S.bk.qty = clamp(S.bk.qty + d, 1, 24); patchBkSum(); }
function bkTog(k, el) { S.bk[k] = !S.bk[k]; el.classList.toggle("on"); patchBkSum(); }
function bkPay(k) {
  S.bk.pay = k;
  document.querySelectorAll(".paycard").forEach(c => c.classList.toggle("on", c.dataset.pay === k));
}

function confirmBooking() {
  const el = document.getElementById("regnr");
  const reg = (el ? el.value : S.bk.reg) || "";
  if (reg.trim().length < 5) { toast("Fyll i registreringsnumret", "info"); if (el) el.focus(); return; }
  const date = S.bk.date || "";
  LS.set("lastreg", reg.toUpperCase().trim());
  openSheet(`<div class="bankid">
    <div class="ring"></div>
    <h3>Öppna BankID</h3>
    <p class="dim small" style="margin-top:10px;max-width:34ch;margin-inline:auto">Legitimera dig i BankID-appen så är bokningen klar.</p>
    <p class="muted small" style="margin-top:18px">Det här är en demo – ingen riktig legitimering sker.</p>
  </div>`);
  setTimeout(() => finishBooking(reg.toUpperCase().trim(), date), 1700);
}
function finishBooking(reg, date) {
  const s = SPOTS.find(x => x.id === S.bk.id), T = bkTotals();
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const bk = { id: Date.now(), spotId: s.id, spot: s.nm, addr: s.ad, area: s.area, reg, mode: S.mode,
    qty: S.bk.qty, total: T.driverTotal, host: s.host, date: date || new Date().toISOString().slice(0, 10),
    code, charge: S.bk.charge, pay: S.bk.pay, instr: s.instr, status: "kommande" };
  BOOKINGS.unshift(bk);
  NOTIS.unshift({ id: "n" + Date.now(), ic: "check", t: "Bokningen är klar", s: `${s.nm} · ${bk.date} · ${kr(T.driverTotal)}`, unread: true });
  persist();
  openSheet(`<div class="sheet-b center" style="padding-top:36px">
    <div class="tick">${I("check", 32)}</div>
    <h3 style="font-family:var(--serif);font-size:1.7rem">Platsen är din</h3>
    <p class="dim" style="margin-top:8px">${esc(s.nm)} · ${esc(bk.date)}</p>
    <div class="code" style="margin-top:22px">${code}</div>
    <p class="muted small" style="margin-top:10px">Koden till grinden. Den finns alltid under Mitt.</p>
    <div class="callout" style="margin-top:18px;text-align:left">${I("info", 16)} ${esc(s.instr)}</div>
    <button class="btn btn-p btn-block btn-lg" style="margin-top:22px" onclick="closeSheet();go('mina')">Till mina bokningar</button>
    <button class="btn btn-block" style="margin-top:10px" onclick="closeSheet()">${esc(t("close"))}</button>
  </div>`);
}

/* ============================================================
   VY: HYR UT
   ============================================================ */
function calcNumbers() {
  const c = S.calc, sug = priceSuggest(c.city, c.type, c.walk, c.charger, c.gated);
  const gross = sug.month;
  const net = gross - Math.round(gross * FEES.hostPctMonthly);
  const year = net * 12;
  const taxable = Math.max(0, year - FEES.schablon);
  return { sug, gross, net, year, taxFree: Math.min(year, FEES.schablon), taxable,
    tax: Math.round(taxable * .3), pct: clamp(year / FEES.schablon * 100, 0, 100),
    dyn: c.dyn ? Math.round(gross * .14) : 0 };
}
function viewHyrut() {
  const c = S.calc, N = calcNumbers();
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>Räknare</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Vad är din plats värd?</h1>
  <p class="lede" style="margin-top:16px" data-reveal>Svara på tre frågor. Du behöver inget konto.</p>

  <div class="split" style="margin-top:34px;gap:44px">
    <div class="stack loose">
      <div class="panel pad">
        <div class="grid g2" style="gap:16px">
          <div class="field"><label>1 · Var ligger platsen?</label>
            <select class="inp" onchange="S.calc.city=this.value;patchCalc()">
              ${Object.keys(CITY_BASE).map(k => `<option ${k === c.city ? "selected" : ""}>${k}</option>`).join("")}
            </select></div>
          <div class="field"><label>2 · Vad för slags plats?</label>
            <select class="inp" onchange="S.calc.type=this.value;patchCalc()">
              ${Object.keys(TYPE_MULT).map(k => `<option ${k === c.type ? "selected" : ""}>${k}</option>`).join("")}
            </select></div>
        </div>
        <div class="slider" style="margin-top:20px">
          <div class="top"><span class="lbl">3 · Hur långt är det att gå till centrum eller stationen?</span>
            <span class="val"><span id="walkv">${c.walk}</span> min</span></div>
          <input type="range" min="1" max="25" value="${c.walk}" style="--pct:${(c.walk - 1) / 24 * 100}%"
            oninput="onWalk(this)">
          <div class="scale"><span>1 min</span><span>25 min</span></div>
        </div>
        <div class="row wrap" style="margin-top:18px">
          <button class="chip ${c.charger ? "on" : ""}" onclick="calcTog('charger',this)">${I("bolt", 15)} Laddbox finns</button>
          <button class="chip ${c.gated ? "on" : ""}" onclick="calcTog('gated',this)">${I("lock", 15)} Låst eller grind</button>
          <button class="chip ${c.dyn ? "on" : ""}" onclick="calcTog('dyn',this)">${I("chart", 15)} Höj priset vid matcher</button>
        </div>
      </div>

      <div class="panel pad" id="taxbox">${taxBoxHTML(N)}</div>

      <div class="panel pad">
        <h3>Vad kostar det mig?</h3>
        <div style="margin-top:12px">
          <div class="kv"><span>Lägga upp platsen</span><b style="color:var(--green)">${kr(0)}</b></div>
          <div class="kv"><span>Månadsavgift</span><b style="color:var(--green)">${kr(0)}</b></div>
          <div class="kv"><span>Bindningstid</span><b style="color:var(--green)">Ingen</b></div>
          <div class="kv"><span>Vi tar av månadshyran</span><b>${Math.round(FEES.hostPctMonthly * 100)} %</b></div>
          <div class="kv"><span>Vi tar av korttidshyran</span><b>${Math.round(FEES.hostPct * 100)} %</b></div>
        </div>
        <p class="dim small" style="margin-top:12px">Vi tjänar pengar först när du gör det. Trygghetsgaranti, BankID, betalning och bärgning ingår.</p>
      </div>
    </div>

    <div style="position:sticky;top:88px">
      <div class="panel pad-lg lift" id="pricebox" style="background:var(--pine);color:var(--on-dark);border-color:transparent">
        ${priceBoxHTML(N)}
      </div>
      <button class="btn btn-p btn-block btn-lg" style="margin-top:16px" onclick="openWizard()">
        ${I("plus", 18)} Lägg upp min plats</button>
      <p class="muted small center" style="margin-top:10px">Tar ungefär två minuter. Du kan pausa när du vill.</p>
    </div>
  </div>
</div></section>
${footerHTML()}`;
}
function priceBoxHTML(N) {
  return `<div class="k" style="font-family:var(--mono);font-size:.63rem;letter-spacing:.15em;text-transform:uppercase;opacity:.62">Vi föreslår</div>
    <div style="font-family:var(--serif);font-size:clamp(2.6rem,6vw,3.6rem);line-height:1;margin-top:10px;letter-spacing:-.03em;font-variant-numeric:tabular-nums">
      <span id="pbGross">${num(N.gross)}</span> ${sym()}<span style="font-size:1.05rem;opacity:.66"> /mån</span></div>
    <p style="margin-top:12px;opacity:.82;font-size:.92rem">Du får <b id="pbNet">${kr(N.net)}</b> efter vår avgift.</p>
    ${N.dyn ? `<div style="margin-top:14px;background:rgba(244,241,233,.11);border-radius:var(--r-sm);padding:11px 13px;font-size:.85rem">
      ${I("chart", 15)} Vid matcher och högsäsong höjs priset automatiskt: <b>+<span id="pbDyn">${num(N.dyn)}</span> ${sym()}/mån</b> i snitt.</div>` : ""}
    <div class="grid g2 keep" style="margin-top:20px;gap:1px;background:rgba(244,241,233,.16)">
      ${[["Per timme", N.sug.hour ? num(N.sug.hour) + " " + sym() : "–", "pbH"],
         ["Per dygn", num(N.sug.day) + " " + sym(), "pbD"],
         ["Per vecka", num(N.sug.week) + " " + sym(), "pbW"],
         ["Per match", num(N.sug.event) + " " + sym(), "pbE"]]
        .map(([l, v, id]) => `<div style="background:var(--pine);padding:13px 14px">
          <div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;opacity:.6">${l}</div>
          <div id="${id}" style="font-family:var(--serif);font-size:1.32rem;margin-top:4px;font-variant-numeric:tabular-nums">${v}</div></div>`).join("")}
    </div>`;
}
function taxBoxHTML(N) {
  return `<div class="spread"><h3>Hur mycket skatt betalar jag?</h3><span class="tag green">Oftast noll</span></div>
    <p class="dim small" style="margin-top:8px">Du får tjäna <b>${num(FEES.schablon)} ${sym()}</b> per bostad och år på att hyra ut utan att betala skatt. Det kallas schablonavdrag.</p>
    <div class="meter ${N.pct > 90 ? "warn" : ""}" style="margin-top:16px"><i id="txBar" style="width:${N.pct}%"></i></div>
    <div class="spread" style="margin-top:8px"><span class="micro" id="txYear">${num(N.year)} ${sym()} per år</span><span class="micro">Gränsen ${num(FEES.schablon)} ${sym()}</span></div>
    <div style="margin-top:18px">
      <div class="kv"><span>Du får in</span><b id="txIn">${kr(N.year)}</b></div>
      <div class="kv"><span>Skattefritt</span><b id="txFree" style="color:var(--green)">${kr(N.taxFree)}</b></div>
      <div class="kv"><span>Du betalar skatt på</span><b id="txAble">${kr(N.taxable)}</b></div>
      <div class="tot"><span>Kvar i handen</span><span id="txNet">${kr(N.year - N.tax)}</span></div>
    </div>
    <p class="muted small" style="margin-top:12px">Vi rapporterar till Skatteverket åt dig och skickar ett färdigt underlag i januari.</p>
    <button class="btn btn-sm" style="margin-top:12px" data-go="skatt">Läs mer om skatten${I("arrow", 15, "arw")}</button>`;
}
/* patchar bara siffrorna → inget hack när man drar */
function patchCalc() {
  const N = calcNumbers();
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("pbGross", num(N.gross)); set("pbNet", kr(N.net)); set("pbDyn", num(N.dyn));
  set("pbH", N.sug.hour ? num(N.sug.hour) + " " + sym() : "–");
  set("pbD", num(N.sug.day) + " " + sym());
  set("pbW", num(N.sug.week) + " " + sym());
  set("pbE", num(N.sug.event) + " " + sym());
  set("txYear", num(N.year) + " " + sym() + " per år");
  set("txIn", kr(N.year)); set("txFree", kr(N.taxFree)); set("txAble", kr(N.taxable));
  set("txNet", kr(N.year - N.tax));
  const bar = document.getElementById("txBar"); if (bar) bar.style.width = N.pct + "%";
}
/* Uppdaterar bara de tolv siffrorna – aldrig hela vyn. Mätt till under 1 ms per drag. */
function onWalk(inp) {
  const v = +inp.value;
  if (v === S.calc.walk) return;
  S.calc.walk = v;
  inp.style.setProperty("--pct", (v - 1) / 24 * 100 + "%");
  const lbl = document.getElementById("walkv"); if (lbl) lbl.textContent = v;
  patchCalc();
}
function calcTog(k, el) {
  S.calc[k] = !S.calc[k]; el.classList.toggle("on");
  if (k === "dyn") { const box = document.getElementById("pricebox"); if (box) box.innerHTML = priceBoxHTML(calcNumbers()); }
  else patchCalc();
}

/* ---- annonsguide ---- */
function openWizard(edit) {
  if (edit != null) {
    const l = LISTINGS.find(x => x.id === edit);
    if (l) S.wizard = Object.assign({}, l, { step: 0, editId: edit });
  } else {
    const sug = priceSuggest(S.calc.city, S.calc.type, S.calc.walk, S.calc.charger, S.calc.gated);
    S.wizard = { step: 0, ad: "", type: S.calc.type, size: "Personbil", pris: sug.month, tid: "Alltid",
                 info: "", charger: S.calc.charger, gated: S.calc.gated, cam: false, dyn: true, editId: null };
  }
  renderWizard();
}
function renderWizard() {
  const w = S.wizard;
  const titles = ["Var ligger platsen?", "Vad för slags plats?", "När är den ledig?", "Vad ska den kosta?", "Klart att lägga upp"];
  const bodies = [
    `<div class="field"><label>Adress</label><input class="inp" id="w_ad" value="${esc(w.ad)}" placeholder="Ringvägen 41, Stockholm"></div>
     <div class="hint">${I("lock", 17)}<div>Exakt adress visas först efter bokning. I listan syns bara gatan och stadsdelen.</div></div>`,
    `<div class="field"><label>Typ av plats</label><select class="inp" id="w_type">
       ${Object.keys(TYPE_MULT).map(k => `<option ${k === w.type ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     <div class="field"><label>Vad får plats?</label><select class="inp" id="w_size">
       ${["Personbil", "Personbil + SUV", "Personbil, husbil", "Personbil, släp", "Buss eller lastbil"].map(k => `<option ${k === w.size ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     ${[["charger", "bolt", "Laddbox", "Man kan ladda elbil"], ["gated", "lock", "Låst eller grind", "Port, bom eller grind"], ["cam", "camera", "Kamera", "Platsen är bevakad"]]
       .map(([k, ic, tt, ss]) => `<div class="setrow"><span style="color:var(--ink-45)">${I(ic, 20)}</span>
         <div class="t"><b>${tt}</b><span>${ss}</span></div>
         <div class="switch ${w[k] ? "on" : ""}" role="switch" onclick="S.wizard['${k}']=!S.wizard['${k}'];this.classList.toggle('on')"></div></div>`).join("")}`,
    `<div class="field"><label>När får folk parkera?</label><select class="inp" id="w_tid">
       ${["Alltid", "Vardagar 08–17", "Kvällar och helger", "Bara vid matcher", "Bara långtid (månad)"].map(k => `<option ${k === w.tid ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     <div class="field"><label>Vad behöver föraren veta?</label>
       <textarea class="inp" id="w_info" rows="3" placeholder="Kör in från gatan, plats närmast garaget. Vänd bilen så nosen pekar ut.">${esc(w.info)}</textarea></div>`,
    `<div class="field"><label>Pris per månad (${sym()})</label>
       <input class="inp mono" id="w_pris" value="${w.pris}" inputmode="numeric" style="font-size:1.4rem" oninput="wizPrice(this)"></div>
     <div class="setrow"><span style="color:var(--green)">${I("chart", 20)}</span>
       <div class="t"><b>Höj priset automatiskt</b><span>Vid matcher och högsäsong. Aldrig under ditt pris.</span></div>
       <div class="switch ${w.dyn ? "on" : ""}" role="switch" onclick="S.wizard.dyn=!S.wizard.dyn;this.classList.toggle('on')"></div></div>
     <div class="callout" id="wizCalc">Du får <b>${kr(Math.round(w.pris * (1 - FEES.hostPctMonthly)))}</b> i månaden, alltså <b>${kr(Math.round(w.pris * (1 - FEES.hostPctMonthly) * 12))}</b> på ett år.</div>`,
    `<div class="center"><div class="tick">${I("check", 30)}</div>
       <h3 style="font-family:var(--serif);font-size:1.5rem">Redo att lägga upp</h3>
       <p class="dim small" style="margin-top:8px">${esc(w.ad || "Din adress")} · ${esc(w.type)} · ${num(w.pris)} ${sym()}/mån</p></div>
     <div class="hint" style="margin-top:18px">${I("info", 17)}<div>I skarpt läge kommer här: BankID, foto på platsen, ditt kontonummer och – om du bor i bostadsrätt – en färdig fråga till styrelsen som vi skickar åt dig.</div></div>`
  ];
  openSheet(sheetHead(titles[w.step]) + `<div class="sheet-b stack">
    <div class="progress">${titles.map((_, k) => `<i class="${k <= w.step ? "on" : ""}"></i>`).join("")}</div>
    ${bodies[w.step]}
    <div class="row" style="margin-top:8px">
      ${w.step > 0 ? `<button class="btn" onclick="wizBack()">${I("chevron", 15)} ${esc(t("back"))}</button>` : ""}
      <button class="btn btn-p" style="flex:1" onclick="wizNext()">${w.step === 4 ? "Lägg upp platsen" : esc(t("next"))}${I("arrow", 16, "arw")}</button>
    </div>
  </div>`);
}
function wizPrice(inp) {
  const v = +inp.value || 0;
  S.wizard.pris = v;
  const box = document.getElementById("wizCalc");
  if (box) box.innerHTML = `Du får <b>${kr(Math.round(v * (1 - FEES.hostPctMonthly)))}</b> i månaden, alltså <b>${kr(Math.round(v * (1 - FEES.hostPctMonthly) * 12))}</b> på ett år.`;
}
function grabWizard() {
  const g = id => (document.getElementById(id) || {}).value, w = S.wizard;
  if (w.step === 0 && g("w_ad") != null) w.ad = g("w_ad");
  if (w.step === 1) { w.type = g("w_type") || w.type; w.size = g("w_size") || w.size; }
  if (w.step === 2) { w.tid = g("w_tid") || w.tid; w.info = g("w_info") || w.info; }
  if (w.step === 3) w.pris = +g("w_pris") || w.pris;
}
function wizBack() { grabWizard(); S.wizard.step--; renderWizard(); }
function wizNext() {
  grabWizard(); const w = S.wizard;
  if (w.step === 0 && w.ad.trim().length < 4) { toast("Skriv adressen först", "info"); return; }
  if (w.step === 3 && (!w.pris || w.pris < 50)) { toast("Sätt ett rimligt pris", "info"); return; }
  if (w.step < 4) { w.step++; renderWizard(); return; }
  saveListing();
}
function saveListing() {
  const w = S.wizard;
  const rec = { id: w.editId || Date.now(), ad: w.ad.trim(), type: w.type, size: w.size, pris: w.pris,
    tid: w.tid, info: w.info, charger: w.charger, gated: w.gated, cam: w.cam, dyn: w.dyn,
    paused: false, since: new Date().toISOString().slice(0, 10) };
  const i = LISTINGS.findIndex(x => x.id === rec.id);
  if (i >= 0) LISTINGS[i] = rec; else LISTINGS.unshift(rec);
  EARNED = Math.round(LISTINGS.reduce((a, l) => a + l.pris * (1 - FEES.hostPctMonthly), 0) * 3.4);
  persist(); closeSheet();
  toast(i >= 0 ? "Ändringen är sparad" : "Platsen är upplagd", "check");
  setTimeout(() => go("mina"), 450);
}

/* ============================================================
   VY: MITT
   ============================================================ */
function viewMina() {
  const gross = LISTINGS.filter(l => !l.paused).reduce((a, l) => a + l.pris, 0);
  const net = Math.round(gross * (1 - FEES.hostPctMonthly));
  const year = net * 12, pct = clamp(EARNED / FEES.schablon * 100, 0, 100);
  const hist = [.6, .72, .81, .79, .9, .95, 1, 1].map(x => Math.round(net * x));
  const months = ["jan", "mar", "maj", "jul", "aug", "sep", "okt", "nov"];
  const favs = SPOTS.filter(s => FAVS.includes(s.id));
  const mx = Math.max.apply(null, hist.concat([1]));
  return `
<section class="tight"><div class="wrap">
  <div class="spread"><h1 style="font-size:clamp(2rem,4.6vw,3rem)">Mitt</h1>
    <button class="btn btn-sm" data-go="installningar">${I("sliders", 15)} ${esc(t("settings"))}</button></div>

  ${LISTINGS.length ? `
  <div class="split" style="margin-top:28px;gap:34px">
    <div class="panel pad-lg">
      <div class="spread"><span class="kicker plain muted">Dina pengar</span><span class="tag green">Utbetalning den 25:e</span></div>
      <div class="figure" style="margin-top:14px">${kr(net)}<span style="font-family:var(--sans);font-size:1rem;color:var(--ink-45)"> /mån</span></div>
      <p class="muted small" style="margin-top:6px">${kr(year)} på ett år · ${LISTINGS.filter(l => !l.paused).length} plats(er) uthyrda</p>
      <div class="chartwrap" style="margin-top:22px"><div class="chart">
        ${hist.map((v, i) => `<div class="b ${i === hist.length - 1 ? "on" : ""}" style="height:${Math.max(4, v / mx * 100)}%" title="${kr(v)}"><span>${months[i]}</span></div>`).join("")}
      </div></div>
      <div class="row wrap" style="margin-top:10px">
        <button class="btn btn-sm" onclick="openPayouts()">${I("bank", 15)} Utbetalningar</button>
        <button class="btn btn-sm" data-go="bjudin">${I("gift", 15)} Bjud in en vän</button>
      </div>
    </div>
    <div class="panel pad-lg">
      <div class="spread"><span class="kicker plain muted">Skattefritt kvar</span><span class="tag ${pct > 90 ? "clay" : "green"}">${Math.round(100 - pct)} % kvar</span></div>
      <div class="figure" style="margin-top:14px">${kr(EARNED)}</div>
      <p class="muted small" style="margin-top:6px">av ${kr(FEES.schablon)} du får tjäna skattefritt</p>
      <div class="meter ${pct > 90 ? "warn" : ""}" style="margin-top:18px"><i style="width:${pct}%"></i></div>
      <p class="dim small" style="margin-top:16px">Vi skickar ett färdigt underlag i januari och rapporterar till Skatteverket åt dig.</p>
      <button class="btn btn-sm" style="margin-top:12px" onclick="toast('Underlaget är skickat till din e-post','download')">${I("download", 15)} Hämta underlag</button>
    </div>
  </div>

  <h3 style="margin:36px 0 4px">Mina platser</h3>
  <div class="stack" style="margin-top:14px">${LISTINGS.map(l => `
    <div class="panel pad">
      <div class="spread"><b style="font-size:1.02rem">${esc(l.ad)}</b>
        <span class="tag ${l.paused ? "" : "green"}">${l.paused ? "Pausad" : "Aktiv"}</span></div>
      <p class="muted small" style="margin-top:5px">${esc(l.type)} · ${esc(l.size)} · ${esc(l.tid)}${l.charger ? " · Laddbox" : ""}${l.dyn ? " · Höjer priset vid matcher" : ""}</p>
      <div class="grid g3 keep" style="margin-top:16px;gap:1px;background:var(--rule);border-radius:var(--r-sm);overflow:hidden">
        ${[["Pris", num(l.pris) + " " + sym()], ["Du får", num(Math.round(l.pris * (1 - FEES.hostPctMonthly))) + " " + sym()], ["På ett år", num(Math.round(l.pris * (1 - FEES.hostPctMonthly) * 12)) + " " + sym()]]
          .map(([a, b]) => `<div style="background:var(--card);padding:12px 14px">
            <div class="micro">${a}</div><div style="font-family:var(--serif);font-size:1.3rem;margin-top:3px;font-variant-numeric:tabular-nums">${b}</div></div>`).join("")}
      </div>
      <div class="row wrap" style="margin-top:16px">
        <button class="btn btn-sm" onclick="togglePause(${l.id})">${I(l.paused ? "play" : "minus", 15)} ${l.paused ? "Aktivera" : "Pausa"}</button>
        <button class="btn btn-sm" onclick="openWizard(${l.id})">${I("sliders", 15)} Ändra</button>
        <button class="btn btn-sm" onclick="openSchedule(${l.id})">${I("calendar", 15)} Tider</button>
        <button class="btn btn-sm btn-d" onclick="kickCar()">${I("door", 15)} Flytta bilen</button>
      </div>
    </div>`).join("")}</div>
  <button class="btn btn-block" style="margin-top:14px" onclick="openWizard()">${I("plus", 17)} Lägg upp en till plats</button>
  ` : `
  <div class="empty" style="margin-top:26px">
    <div class="ic">${I("wallet", 36)}</div>
    <h3>Du hyr inte ut något än</h3>
    <p class="dim small" style="margin-top:8px;max-width:36ch;margin-inline:auto">Har du en uppfart, carport, garageplats eller innergård? Se vad den kan ge dig.</p>
    <button class="btn btn-p" style="margin-top:18px" data-go="hyrut">Räkna ut mitt pris${I("arrow", 16, "arw")}</button>
  </div>`}

  ${typeof hostRequestsHTML === "function" ? hostRequestsHTML() : ""}

  <h3 style="margin:38px 0 4px">Mina bokningar</h3>
  ${BOOKINGS.length ? `<div class="stack" style="margin-top:14px">${BOOKINGS.map(b => `
    <div class="panel pad">
      <div class="spread"><b style="font-size:1.02rem">${esc(b.spot)}</b><span class="tag green">Bekräftad</span></div>
      <p class="muted small" style="margin-top:5px">${esc(b.reg)} · ${b.qty} ${esc(b.mode)} · ${esc(b.date)} · värd ${esc(b.host)}</p>
      <div class="row wrap" style="margin-top:14px">
        <span style="font-family:var(--serif);font-size:1.35rem;margin-right:auto;font-variant-numeric:tabular-nums">${kr(b.total)}</span>
        <button class="btn btn-sm btn-p" onclick="openAccess(${b.id})">${I("key", 15)} Öppna</button>
        <button class="btn btn-sm" onclick="extendBooking(${b.id})">${I("clock", 15)} Förläng</button>
        <button class="btn btn-sm" onclick="receipt(${b.id})">${I("receipt", 15)} Kvitto</button>
        ${b.rating ? `<span class="rate">${IF("star", 13)}${b.rating} av 5</span>`
          : `<button class="btn btn-sm" onclick="rateBooking(${b.id})">${I("star", 15)} Betygsätt</button>`}
        <button class="btn btn-sm" onclick="cancelBooking(${b.id})">Avboka</button>
      </div>
    </div>`).join("")}</div>`
    : `<div class="empty" style="margin-top:14px"><div class="ic">${I("pin", 34)}</div>
       <h3>Inga bokningar än</h3>
       <button class="btn btn-sm btn-p" style="margin-top:16px" data-go="sok">Hitta en plats${I("arrow", 15, "arw")}</button></div>`}

  ${favs.length ? `<h3 style="margin:38px 0 10px">Sparade platser</h3><div class="spotlist">${favs.map(spotRow).join("")}</div>` : ""}
  ${WATCH.length ? `<h3 style="margin:38px 0 10px">Mina bevakningar</h3>
    <div class="row wrap">${WATCH.map(id => { const a = AREAS.find(x => x.id === id);
      return a ? `<span class="tag green">${esc(a.name)}<button onclick="WATCH=WATCH.filter(w=>w!=='${id}');persist();render()" style="margin-left:5px;display:flex">${I("close", 11)}</button></span>` : ""; }).join("")}</div>` : ""}
</div></section>
${footerHTML()}`;
}
function togglePause(id) { const l = LISTINGS.find(x => x.id === id); if (l) { l.paused = !l.paused; persist(); toast(l.paused ? "Pausad" : "Aktiv igen", "check"); render(); } }
function cancelBooking(id) { BOOKINGS = BOOKINGS.filter(b => b.id !== id); persist(); toast("Avbokad – du får tillbaka alla pengar", "check"); render(); }
function extendBooking(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const spot = SPOTS.find(s => s.id === b.spotId);
  const unit = spot ? (priceFor(spot, b.mode) || spot.d) : Math.round(b.total / b.qty);
  openSheet(sheetHead("Förläng bokningen") + `<div class="sheet-b stack">
    <p class="dim">${esc(b.spot)} · ${esc(b.reg)}</p>
    <div class="field"><label>Lägg till</label><select class="inp" id="ext">
      ${[1, 2, 3, 6, 12].map(n => `<option value="${n}">${n} ${b.mode === "manad" ? "månad(er)" : b.mode === "timme" ? "timme/timmar" : "dygn"}</option>`).join("")}
    </select></div>
    <div class="callout">Priset är ${kr(unit)} per gång. Värden svarar inom 30 minuter.</div>
    <button class="btn btn-p btn-block btn-lg" onclick="doExtend(${id},${unit})">Förläng</button>
  </div>`);
}
function doExtend(id, unit) {
  const n = +(document.getElementById("ext") || {}).value || 1;
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const f = feeSplit(unit * n, b.mode);
  b.qty += n; b.total += f.driverTotal;
  persist(); closeSheet(); toast("Förlängd – " + kr(f.driverTotal) + " tillkommer", "clock"); render();
}
function openAccess(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  openSheet(sheetHead("Din plats") + `<div class="sheet-b center">
    <div class="tick" style="background:var(--pine)">${I("key", 28)}</div>
    <h3 style="font-family:var(--serif);font-size:1.5rem">${esc(b.spot)}</h3>
    <p class="dim small" style="margin-top:6px">${esc(b.addr || "")}</p>
    <div class="code" style="margin-top:22px">${esc(b.code)}</div>
    <p class="muted small" style="margin-top:10px">Koden till grinden, porten eller nyckelskåpet</p>
    <div class="callout" style="margin-top:18px;text-align:left">${I("info", 16)} ${esc(b.instr || "")}</div>
    ${typeof photoBlockHTML === "function" ? photoBlockHTML(b) : ""}
    <button class="btn btn-p btn-block btn-lg" style="margin-top:20px" onclick="toast('Grinden öppnas …','key')">${I("door", 18)} Öppna grinden</button>
    <button class="btn btn-block" style="margin-top:10px" onclick="closeSheet();go('meddelanden')">${I("message", 16)} Skriv till ${esc(b.host)}</button>
  </div>`);
}
function receipt(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const f = feeSplit(Math.round(b.total / 1.13), b.mode);
  openSheet(sheetHead("Kvitto") + `<div class="sheet-b">
    <p class="dim small">${esc(b.spot)} · ${esc(b.date)} · ${esc(b.reg)}</p>
    <div style="margin-top:16px">
      <div class="kv"><span>Hyra (${b.qty} ${esc(b.mode)})</span><b>${kr(f.base)}</b></div>
      <div class="kv"><span>Serviceavgift</span><b>${kr(f.service)}</b></div>
      <div class="kv"><span>Trygghetsgaranti</span><b>${kr(f.trygg)}</b></div>
      <div class="tot"><span>Betalt med ${esc(b.pay || "Swish")}</span><span>${kr(b.total)}</span></div>
    </div>
    <p class="muted small" style="margin-top:14px">Kvittonummer PK-${b.id}. Uthyrning av parkeringsplats av privatperson – ingen moms redovisas.</p>
    <button class="btn btn-block" style="margin-top:16px" onclick="toast('Kvittot är skickat','download')">${I("download", 16)} Skicka till e-post</button>
  </div>`);
}
function openPayouts() {
  const net = Math.round(LISTINGS.filter(l => !l.paused).reduce((a, l) => a + l.pris, 0) * (1 - FEES.hostPctMonthly));
  const rows = [["25 aug 2026", net, "På väg"], ["25 jul 2026", Math.round(net * .95), "Utbetald"],
                ["25 jun 2026", Math.round(net * .9), "Utbetald"], ["25 maj 2026", Math.round(net * .81), "Utbetald"]];
  openSheet(sheetHead("Utbetalningar") + `<div class="sheet-b">
    <div class="tblwrap"><table class="tbl">
      <thead><tr><th>Datum</th><th class="r">Belopp</th><th class="r">Status</th></tr></thead>
      <tbody>${rows.map(([d, v, s]) => `<tr><td>${d}</td><td class="r">${kr(v)}</td>
        <td class="r"><span class="tag ${s === "Utbetald" ? "green" : "brass"}">${s}</span></td></tr>`).join("")}</tbody>
    </table></div>
    <div class="callout" style="margin-top:16px">Pengarna kommer den 25:e varje månad. Vid korttidsuthyrning betalas de ut ett dygn efter att bokningen är slut.</div>
  </div>`);
}
function openSchedule(id) {
  const l = LISTINGS.find(x => x.id === id); if (!l) return;
  const days = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
  l.sched = l.sched || days.map(() => ({ on: true, from: "00:00", to: "23:59" }));
  openSheet(sheetHead("När är platsen ledig?") + `<div class="sheet-b stack">
    <p class="dim small">Slå av de dagar du behöver platsen själv.</p>
    ${days.map((d, i) => `<div class="setrow"><div class="t"><b>${d}</b><span>${l.sched[i].on ? "Ledig hela dagen" : "Stängd"}</span></div>
      <div class="switch ${l.sched[i].on ? "on" : ""}" role="switch" onclick="toggleDay(${id},${i},this)"></div></div>`).join("")}
    <button class="btn btn-p btn-block btn-lg" onclick="persist();closeSheet();toast('Tiderna är sparade','check')">${esc(t("save"))}</button>
  </div>`);
}
function toggleDay(id, i, el) {
  const l = LISTINGS.find(x => x.id === id); if (!l) return;
  l.sched[i].on = !l.sched[i].on; el.classList.toggle("on");
  el.parentElement.querySelector(".t span").textContent = l.sched[i].on ? "Ledig hela dagen" : "Stängd";
}
function kickCar() {
  openSheet(sheetHead("Bilen står kvar") + `<div class="sheet-b stack">
    <p class="dim">Tryck på knappen så tar vi över. Du behöver inte prata med någon.</p>
    <ul class="numlist">
      ${[["Vi ringer föraren", "Inom 60 sekunder, dygnet runt."],
         ["Föraren får betala extra", `${kr(FEES.overtidPerTimme)} för varje påbörjad timme. Alla pengarna går till dig.`],
         ["Efter tre timmar bärgar vi bilen", "Vi betalar och sköter kontakten med bärgare och polis."]]
        .map(([a, b], k) => `<li><span class="n">0${k + 1}</span><div><b>${a}</b><p>${b}</p></div></li>`).join("")}
    </ul>
    <button class="btn btn-c btn-block btn-lg" onclick="closeSheet();toast('Vi ringer föraren nu','door')">${I("door", 18)} Kontakta föraren nu</button>
    <button class="btn btn-block" onclick="closeSheet()">${esc(t("cancel"))}</button>
  </div>`);
}

/* ============================================================
   VY: EVENEMANG
   ============================================================ */
function viewEvenemang() {
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>Evenemang</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Parkera nära.<br><em>Kom hem först.</em></h1>
  <p class="lede" style="margin-top:16px" data-reveal>Arenaparkeringen kostar 250–400 kr och du står 40 minuter i kö ut. En uppfart 400 meter bort kostar mindre – och du är hemma före alla andra.</p>

  <div class="stack" style="margin-top:34px">
    ${EVENTS.map((e, k) => {
      const near = SPOTS.filter(s => s.area === e.area && s.ev > 0);
      const from = near.length ? Math.min.apply(null, near.map(s => s.ev)) : 0;
      return `<div class="panel pad" data-reveal style="--d:${k * 50}ms">
        <div class="row top" style="gap:18px;flex-wrap:wrap">
          <span class="tag clay">${esc(e.kind)}</span>
          <div style="flex:1;min-width:200px">
            <b style="font-size:1.06rem;display:block">${esc(e.name)}</b>
            <div class="muted small" style="margin-top:3px">${esc(e.venue)} · ${esc(e.date)} kl ${esc(e.time)} · ${e.crowd.toLocaleString("sv-SE")} personer</div>
          </div>
          <div class="row" style="gap:8px">
            ${near.length ? `<span class="tag green">${near.length} platser · från ${kr(from)}</span>
              <button class="btn btn-sm btn-p" onclick="S.area='${e.area}';S.mode='evenemang';go('sok')">Hitta plats${I("arrow", 15, "arw")}</button>`
              : `<span class="tag brass">Inga platser än – bli först</span>
                 <button class="btn btn-sm" onclick="S.calc.city='Nära arena';go('hyrut')">Hyr ut min</button>`}
          </div>
        </div>
      </div>`;
    }).join("")}
  </div>

  <div class="panel pad-lg" style="margin-top:26px;background:var(--green-wash);border-color:transparent" data-reveal>
    <h3>Bor du nära en arena?</h3>
    <p class="dim" style="margin-top:8px;max-width:56ch">Sex hemmamatcher och fyra konserter på ett år är ungefär ${kr(2500)} extra – för en uppfart som ändå står tom. Slår du på automatisk prishöjning sköter appen det åt dig.</p>
    <button class="btn btn-p" style="margin-top:18px" data-go="hyrut">Räkna på min plats${I("arrow", 16, "arw")}</button>
  </div>
</div></section>
${footerHTML()}`;
}

/* ============================================================
   VY: MEDDELANDEN & AVISERINGAR
   ============================================================ */
function msgHTML() {
  return MSGS.map(m => `<div class="msg ${m.me ? "me" : ""}"><div class="bub">${esc(m.t)}</div><span class="tm">${esc(m.tm)}</span></div>`).join("");
}
function viewMeddelanden() {
  return `
<section class="tight"><div class="wrap" style="max-width:720px">
  <h1 style="font-size:clamp(2rem,4.6vw,3rem)">Meddelanden</h1>
  <div class="panel pad" style="margin-top:22px">
    <div class="row" style="padding-bottom:14px;border-bottom:1px solid var(--rule)">
      <span style="width:38px;height:38px;border-radius:50%;background:var(--pine);color:var(--on-dark);display:grid;place-items:center;font-weight:600">L</span>
      <div><b>Lena</b><div class="muted small">Uppfart i Märsta · svarar oftast inom 10 minuter</div></div>
    </div>
    <div id="msgbox" style="padding-top:18px;max-height:46vh;overflow-y:auto">${msgHTML()}</div>
    <div class="row" style="margin-top:16px">
      <input class="inp" id="msginp" placeholder="Skriv något …" onkeydown="if(event.key==='Enter')sendMsg()">
      <button class="btn btn-p" onclick="sendMsg()" aria-label="Skicka">${I("arrow", 18)}</button>
    </div>
  </div>
  <div class="hint" style="margin-top:18px">${I("lock", 17)}<div>All kontakt sker här i appen. Vi lämnar aldrig ut ditt telefonnummer, och blir det tvist har vi hela historiken.</div></div>
</div></section>
${footerHTML()}`;
}
function sendMsg() {
  const el = document.getElementById("msginp"), v = (el.value || "").trim();
  if (!v) return;
  const now = new Date(), hh = String(now.getHours()).padStart(2, "0");
  MSGS.push({ me: true, t: v, tm: hh + ":" + String(now.getMinutes()).padStart(2, "0") });
  persist(); el.value = "";
  const box = document.getElementById("msgbox");
  box.innerHTML = msgHTML(); box.scrollTop = box.scrollHeight;
  setTimeout(() => {
    MSGS.push({ me: false, t: "Absolut, det löser vi!", tm: hh + ":" + String(now.getMinutes() + 1).padStart(2, "0") });
    persist();
    const b2 = document.getElementById("msgbox");
    if (b2) { b2.innerHTML = msgHTML(); b2.scrollTop = b2.scrollHeight; }
  }, 1100);
}
function openNotis() {
  openSheet(sheetHead("Aviseringar") + `<div class="sheet-b">
    ${NOTIS.length ? NOTIS.map(n => `<button class="notif ${n.unread ? "unread" : ""}" onclick="readNotis('${n.id}')">
      <span class="ic">${I(n.ic, 18)}</span><span class="t"><b>${esc(n.t)}</b><span>${esc(n.s)}</span></span>
      ${n.unread ? '<span class="tag green" style="align-self:center">Ny</span>' : ""}</button>`).join("")
      : `<div class="empty"><div class="ic">${I("bell", 32)}</div><p class="dim small" style="margin-top:10px">Inget nytt just nu.</p></div>`}
    ${NOTIS.length ? `<div class="row" style="margin-top:18px">
      <button class="btn btn-sm" onclick="NOTIS.forEach(n=>n.unread=false);persist();openNotis();render()">Markera alla som lästa</button>
      <button class="btn btn-sm" onclick="NOTIS=[];persist();openNotis();render()">Rensa</button></div>` : ""}
  </div>`);
}
function readNotis(id) { const n = NOTIS.find(x => x.id === id); if (n) { n.unread = false; persist(); openNotis(); render(); } }

/* ============================================================
   INNEHÅLLSSIDOR
   ============================================================ */
function entriesHTML(items) {
  return items.map(([ic, h, p, note], k) => `<div class="entry" data-reveal style="--d:${k * 45}ms">
    <span class="ic">${I(ic, 24)}</span>
    <div><h3>${h}</h3><p>${p}</p>${note ? `<div class="callout" style="margin-top:12px">${note}</div>` : ""}</div>
  </div>`).join("");
}
function viewTrygg() {
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>Trygghet</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Vi tog bort varje<br><em>anledning att tveka.</em></h1>
  <p class="lede" style="margin-top:18px" data-reveal>Det svåra är inte pengarna. Det är tanken på en främmande bil på tomten. Så här löser vi det.</p>
  <div style="margin-top:34px">${entriesHTML([
    ["shield", "Alla legitimerar sig med BankID", "Ingen kan boka anonymt. Vi kontrollerar också att registreringsnumret finns i fordonsregistret. Missköter sig någon stängs kontot av för alltid – vi matchar på personnummer, inte e-post."],
    ["shield", `Vi ersätter upp till ${num(FEES.garantiBelopp)} ${sym()}`, `Det ingår i varje bokning (${kr(FEES.tryggShort)} vid korttid, ${kr(FEES.tryggMonthly)} i månaden vid månadshyra). Går uppfarten, grinden, garageporten, fasaden eller belysningen sönder betalar vi. Du betalar ingen självrisk.`,
     "Bra att veta: förarens egen bil täcks av förarens bilförsäkring. Din hemförsäkring gäller bara om <b>du</b> orsakat skadan. Det är precis den luckan vi fyller."],
    ["door", "Flyttar inte bilen? Tryck på knappen.", `Vi ringer föraren inom 60 sekunder, tar ${kr(FEES.overtidPerTimme)} för varje påbörjad timme – alla pengarna går till dig – och bekostar bärgning efter tre timmar. Du behöver aldrig bråka med någon.`],
    ["camera", "Foto före och efter", "Båda tar ett kort på platsen. Bilderna får en tidsstämpel och sparas i 90 dagar. Blir det tvist tittar vi på bevis, inte påståenden."],
    ["star", "Betyg åt båda håll", "Förare betygsätts också. Under 4,3 i snitt och man förlorar tillgång till de bästa platserna. Du kan kräva minst 4,5 för att någon ska få boka direkt."],
    ["message", "All kontakt sker i appen", "Vi lämnar aldrig ut ditt telefonnummer. Samtal kopplas via ett växelnummer och chatten sparas."],
    ["building", "Bor du i bostadsrätt?", "Då måste styrelsen säga ja – en utomhusplats är juridiskt ett lägenhetsarrende. Vi skickar en färdig fråga åt dig. Säger de ja en gång gäller det för alla i föreningen, och föreningen kan ta 10 % av intäkterna till kassan."]
  ])}</div>
  <button class="btn" style="margin-top:26px" data-go="brf">Läs mer för bostadsrättsföreningar${I("arrow", 16, "arw")}</button>
</div></section>
${footerHTML()}`;
}
function viewPriser() {
  const ex = [["En timme på Södermalm", 29, "timme"], ["Ett dygn i Märsta vid Arlanda", 69, "dygn"],
              ["En månad i Vasastan", 2650, "manad"], ["En match vid Friends Arena", 249, "evenemang"]];
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>Priser</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Vi tjänar pengar<br><em>först när du gör det.</em></h1>
  <p class="lede" style="margin-top:18px" data-reveal>Ingen startavgift, ingen månadsavgift, ingen bindningstid. Allt vi tar syns innan du klickar.</p>

  <div class="tblwrap" style="margin-top:32px" data-reveal>
    <table class="tbl">
      <thead><tr><th></th><th class="r">Korttid</th><th class="r">Månadshyra</th></tr></thead>
      <tbody>
        <tr><td>Serviceavgift, föraren</td><td class="r">${Math.round(FEES.driverPct * 100)} %</td><td class="r">${Math.round(FEES.driverPctMonthly * 100)} %</td></tr>
        <tr><td>Vi tar av värdens hyra</td><td class="r">${Math.round(FEES.hostPct * 100)} %</td><td class="r">${Math.round(FEES.hostPctMonthly * 100)} %</td></tr>
        <tr><td>Trygghetsgaranti</td><td class="r">${kr(FEES.tryggShort)}</td><td class="r">${kr(FEES.tryggMonthly)}/mån</td></tr>
        <tr><td><b>Totalt till Parkla</b></td><td class="r"><b>${Math.round((FEES.driverPct + FEES.hostPct) * 100)} %</b></td><td class="r"><b>${Math.round((FEES.driverPctMonthly + FEES.hostPctMonthly) * 100)} %</b></td></tr>
      </tbody></table>
  </div>
  <p class="muted small" style="margin-top:10px">Lägre avgift på månadshyra – de kräver mindre support och konkurrerar direkt med boendeparkering.</p>

  <h2 style="margin:44px 0 18px" data-reveal>Räkneexempel</h2>
  <div class="grid g2">
    ${ex.map(([n, p, m], k) => { const f = feeSplit(p, m); return `
      <div class="panel pad" data-reveal style="--d:${k * 50}ms">
        <b>${n}</b>
        <div style="margin-top:12px">
          <div class="kv"><span>Värdens pris</span><b>${kr(f.base)}</b></div>
          <div class="kv"><span>Serviceavgift</span><b>+${kr(f.service)}</b></div>
          <div class="kv"><span>Trygghetsgaranti</span><b>+${kr(f.trygg)}</b></div>
          <div class="kv"><span><b>Föraren betalar</b></span><b>${kr(f.driverTotal)}</b></div>
          <div class="kv"><span>Värden får</span><b style="color:var(--green)">${kr(f.hostNet)}</b></div>
          <div class="kv"><span class="muted">Parkla behåller</span><b class="muted">${kr(f.service + f.hostFee)}</b></div>
        </div>
      </div>`; }).join("")}
  </div>

  <div class="split" style="margin-top:44px">
    <div class="panel pad-lg" data-reveal>
      <h3>Varför ingen månadsavgift?</h3>
      <p class="dim" style="margin-top:10px">Vi har räknat på det. En abonnemangsavgift dödar en marknadsplats innan den kommit igång – varje krona i inträde är en anledning att låta bli. Vi tar betalt per bokning, och säljer abonnemang till dem som har råd: bostadsrättsföreningar och fastighetsägare.</p>
      <button class="btn btn-sm" style="margin-top:16px" data-go="affar">Se hela affärsmodellen${I("arrow", 15, "arw")}</button>
    </div>
    <div class="panel pad-lg" data-reveal>
      <h3>Ingen reklam i appen</h3>
      <p class="dim" style="margin-top:10px">En tjänst som bygger på förtroende mellan grannar tål inte banners. Vi tar in samarbeten på ett enda sätt: billigare laddbox, försäkring och biltvätt som faktiskt gör platsen bättre. Aldrig som annonsyta.</p>
    </div>
  </div>
</div></section>
${footerHTML()}`;
}
function viewSkatt() {
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>Skatt och regler</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Så funkar skatten</h1>
  <div class="callout brass" style="margin-top:22px;display:flex;gap:12px" data-reveal>${I("info", 18)}
    <div>Det här är en sammanfattning, inte skatterådgivning. Kolla alltid mot Skatteverket och din kommun.</div></div>
  <div style="margin-top:26px">${entriesHTML([
    ["receipt", "1 · Du får tjäna 40 000 kr skattefritt", "Hyr du ut en plats som hör till din bostad beskattas det som kapitalinkomst, och du får ett schablonavdrag på 40 000 kr. Bor du i småhus får du dessutom dra av 20 % av hyran. I praktiken blir de flesta uppfartsuthyrningar helt skattefria.",
     "Viktigt: du får <b>ett</b> schablonavdrag per bostad och år – även om du både hyr ut rum, säljer solel och hyr ut p-platsen."],
    ["roof", "2 · Bygglov behövs oftast inte", "Du behöver inget bygglov för en p-plats som är till för fastighetens eget behov, på mark där det redan står ett en- eller tvåbostadshus. Bygglov krävs om ytan tillsammans med andra p-platser blir större än 50 m² inom detaljplan (100 m² utanför). Börjar det likna kommersiell parkeringsverksamhet kan kommunen se det som ändrad användning – håll dig till din befintliga uppfart."],
    ["building", "3 · Bor du i bostadsrätt eller hyresrätt? Fråga först.", "En p-plats utomhus är juridiskt ett lägenhetsarrende. Du får inte hyra ut den i andra hand utan föreningens tillstånd, och styrelsen får säga nej. Samma sak gäller hyresrätt. Vi skickar en färdig fråga till styrelsen åt dig."],
    ["info", "4 · Moms – håll koll på 2027", "Att upplåta en parkeringsplats är i grunden momspliktigt. Som privatperson under omsättningsgränsen behöver du inte momsregistrera dig. Skatteverket har ändrat ställning kring moms på p-platser (tillämpning framflyttad till 1 april 2027) och regeringen tillsatte i mars 2026 en utredning. Vi bevakar och säger till."],
    ["shield", "5 · Vi rapporterar åt dig", "Parkla är en rapporteringsskyldig plattform enligt EU:s DAC7-regler. Vi rapporterar dina intäkter till Skatteverket senast 31 januari varje år och skickar dig samma underlag. Du slipper räkna och slipper överraskningar."],
    ["chart", "6 · Om det blir näringsverksamhet", "Hyr du ut många platser, anlägger nya ytor eller driver det i större skala kan det bedömas som näringsverksamhet – då gäller andra regler. Skattemätaren i appen varnar dig i god tid."]
  ])}</div>
</div></section>
${footerHTML()}`;
}
function viewBrf() {
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>För föreningar och fastighetsägare</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Ni har tomma platser.<br><em>Vi har kön.</em></h1>
  <p class="lede" style="margin-top:18px" data-reveal>Av Svenska Bostäders 10 328 p-platser i Stockholm står nästan 1 500 tomma – samtidigt som garageköerna hos andra är flera år långa. Det är inte brist. Det är att utbud och efterfrågan inte hittar varandra.</p>
  <div class="grid g2" style="margin-top:34px">
    ${[["Fyll de tomma platserna", "Vi lägger ut era lediga platser mot vår efterfrågan – timme, dygn eller månad. Ni bestämmer vem som släpps in och till vilket pris."],
       ["Slipp allt pappersarbete", "Kontrakt, betalning, kö och avslut sköts i Parkla. Styrelsen behöver inte lägga en enda kväll på p-listan."],
       ["Medlemmarna får hyra ut lagligt", "Godkänn andrahandsuthyrning en gång. Föreningen kan välja att ta 10 % av medlemmarnas intäkter till kassan."],
       ["Laddning blir en intäkt", "Har ni laddboxar sitter ni på en guldgruva. Elbilsägare utan hemmaladdning betalar 28 % mer."]]
      .map(([h, p], k) => `<div class="panel pad-lg" data-reveal style="--d:${k * 50}ms"><h3>${h}</h3><p class="dim" style="margin-top:10px">${p}</p></div>`).join("")}
  </div>
  <div class="panel pad-lg" style="margin-top:26px" data-reveal>
    <h3>Vad kostar det?</h3>
    <div class="tblwrap" style="margin-top:16px"><table class="tbl">
      <thead><tr><th>Paket</th><th>Passar</th><th class="r">Pris</th></tr></thead>
      <tbody>
        <tr><td><b>Föreningen</b></td><td>Upp till 30 platser</td><td class="r">${kr(990)}/mån</td></tr>
        <tr><td><b>Fastighet</b></td><td>30–200 platser</td><td class="r">${kr(2900)}/mån</td></tr>
        <tr><td><b>Portfölj</b></td><td>200+ platser med API</td><td class="r">${kr(4900)}/mån</td></tr>
      </tbody></table></div>
    <p class="muted small" style="margin-top:12px">Inklusive automatisk prissättning, digitala kontrakt, betalning, kundtjänst och rapportering. Ingen provision på era egna månadshyresgäster.</p>
    <button class="btn btn-p" style="margin-top:18px" onclick="toast('Vi hör av oss inom en arbetsdag','message')">Boka en genomgång${I("arrow", 16, "arw")}</button>
  </div>
</div></section>
${footerHTML()}`;
}
function viewAffar() {
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>Affärsmodell</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Fyra intäktslager<br><em>– inte ett.</em></h1>
  <p class="lede" style="margin-top:18px" data-reveal>De svenska försöken hittills säger alla samma sak: ”helt gratis”. Därför har ingen råd att lösa problemet, och därför är de tomma. Vi tar betalt från dag ett – men bara när någon tjänar pengar.</p>
  <div style="margin-top:34px">${entriesHTML([
    ["chart", "1 · Transaktionen", `${Math.round(FEES.driverPct * 100)} % från föraren plus ${Math.round(FEES.hostPct * 100)} % från värden = ${Math.round((FEES.driverPct + FEES.hostPct) * 100)} % på korttid, ${Math.round((FEES.driverPctMonthly + FEES.hostPctMonthly) * 100)} % på månadshyra. Jämför: Airbnb tar ungefär 15–17 %, Getaround 25–40 %, JustPark 3 % av värden plus bokningsavgift av föraren.`],
    ["shield", "2 · Trygghetsgarantin", `${kr(FEES.tryggShort)} per bokning eller ${kr(FEES.tryggMonthly)} i månaden för skadegaranti upp till ${kr(FEES.garantiBelopp)} och bärgning. Hög marginal – men framför allt: <b>det är detta som får folk att våga.</b> Ingen svensk konkurrent har det.`],
    ["building", "3 · Föreningar och fastighetsägare", "990–4 900 kr i månaden. Löser samtidigt utbudsproblemet: en enda förening kan ge 40 platser på en dag. Det är här de riktiga pengarna finns – och här konkurrenterna inte ens försöker."],
    ["bolt", "4 · Laddning", `${FEES.laddOrePerKwh} öre per kWh ovanpå när platsen har laddbox, plus provision på laddboxförsäljning. Sverige har extremt många elbilar och hundratusentals lägenhetsboende som inte kan ladda hemma.`]
  ])}</div>

  <h2 style="margin:48px 0 18px" data-reveal>Vad vi valt bort</h2>
  <div class="grid g3">
    ${[["Månadsavgift för privatpersoner", "Dödar tjänsten innan den kommit igång."],
       ["Reklam i appen", "Kräver 100 000 användare för att ge något – och förstör förtroendet."],
       ["Hela Sverige på en gång", "Så dog alla föregångare: tomma överallt i stället för fulla någonstans."]]
      .map(([h, p], k) => `<div class="panel pad" data-reveal style="--d:${k * 50}ms"><b>${h}</b><p class="dim small" style="margin-top:6px">${p}</p></div>`).join("")}
  </div>

  <h2 style="margin:48px 0 18px" data-reveal>I vilken ordning vi lanserar</h2>
  <ul class="numlist" data-reveal>
    ${[["Arlanda-korridoren", "Märsta, Sigtuna, Rosersberg och Upplands Väsby. Officiell parkering kostar 1 495–1 995 kr i veckan. En uppfart för 399 kr är självklart bättre för båda. Bokningarna planeras i förväg och varar länge."],
       ["Månadshyra i Stockholms innerstad", "Boendeparkering 1 100 kr i månaden och fleråriga garageköer. Få byter, mycket värde per kund."],
       ["Evenemang", "Friends, Tele2, Avicii, Ullevi, Malmö Arena. Extrem topplast och gratis uppmärksamhet varje matchdag."],
       ["Göteborg, Malmö, Uppsala, Lund", "Samma recept. Först när Stockholm är fullt."],
       ["Norden och sedan Europa", "Oslo, Köpenhamn, Helsingfors. Samma juridik, samma betalvanor."]]
      .map(([a, b], k) => `<li><span class="n">0${k + 1}</span><div><b>${a}</b><p>${b}</p></div></li>`).join("")}
  </ul>

  <div class="panel pad-lg" style="margin-top:34px" data-reveal>
    <h3>Konkurrenterna</h3>
    <p class="dim" style="margin-top:10px">Idén finns redan i Sverige – men ingen har vunnit. Hyruto (fortfarande i beta), Park Direkt (Stockholm, ”helt gratis”), Wace, ApParkingSpot (från 2021, partner till APCOA och Telia), GaragePlatsen och Parko. Alla har samma tre problem: gratis affärsmodell, ingen skadegaranti och för brett geografiskt fokus.</p>
    <div class="callout" style="margin-top:16px">Det är goda nyheter. Efterfrågan är bevisad – marknaden är bara olöst. Den som först gör den <b>trygg</b> och <b>tät på ett ställe</b> tar hela kategorin.</div>
  </div>
</div></section>
${footerHTML()}`;
}
function viewBjudin() {
  const code = "PARKLA-" + (LS.get("refcode", null) || (() => { const c = Math.random().toString(36).slice(2, 7).toUpperCase(); LS.set("refcode", c); return c; })());
  return `
<section class="tight"><div class="wrap" style="max-width:760px">
  <span class="kicker" data-reveal>Bjud in</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Ge ${num(FEES.refForare)} ${sym()},<br><em>få ${num(FEES.refVard)} ${sym()}.</em></h1>
  <p class="lede" style="margin-top:18px" data-reveal>Din granne har också en uppfart. Bjud in hen – när första bokningen är klar får du ${kr(FEES.refVard)} och hen får ${kr(FEES.refForare)} att parkera för.</p>
  <div class="panel pad-lg center" style="margin-top:30px" data-reveal>
    <div class="code">${code}</div>
    <div class="row" style="justify-content:center;margin-top:20px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="copyRef('${code}')">${I("copy", 16)} Kopiera koden</button>
      <button class="btn" onclick="shareRef('${code}')">${I("share", 16)} Dela</button>
    </div>
  </div>
  <div class="grid g3" style="margin-top:26px">
    ${[["users", "Grannar", "En gata med tio uppfarter blir sin egen lilla parkeringszon."],
       ["building", "Din förening", "Tipsa styrelsen – föreningen kan ta 10 % av medlemmarnas intäkter."],
       ["car", "Kollegor", "Alla som pendlar in till stan letar efter en plats."]]
      .map(([ic, h, p], k) => `<div class="panel pad" data-reveal style="--d:${k * 50}ms">
        <span style="color:var(--green)">${I(ic, 24)}</span><h4 style="margin-top:12px">${h}</h4>
        <p class="dim small" style="margin-top:6px">${p}</p></div>`).join("")}
  </div>
</div></section>
${footerHTML()}`;
}
function copyRef(c) {
  if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast("Koden är kopierad", "copy"), () => toast(c));
  else toast(c);
}
function shareRef(c) {
  const txt = c ? `Jag hyr ut min uppfart på Parkla och tjänar pengar på den. Använd koden ${c} så får du ${FEES.refForare} kr att parkera för.` : "Parkla – hyr ut din uppfart.";
  if (navigator.share) navigator.share({ title: "Parkla", text: txt, url: location.origin + location.pathname }).catch(() => {});
  else copyRef(txt);
}

/* ============================================================
   VY: INSTÄLLNINGAR
   ============================================================ */
function viewInstallningar() {
  return `
<section class="tight"><div class="wrap" style="max-width:760px">
  <h1 style="font-size:clamp(2rem,4.6vw,3rem)">${esc(t("settings"))}</h1>

  <div class="panel pad-lg" style="margin-top:24px">
    <h3>Utseende</h3>
    <div class="field" style="margin-top:14px"><label>${esc(t("theme"))}</label>
      <div class="seg">${[["system", "monitor", "Automatiskt"], ["light", "sun", "Ljust"], ["dark", "moon", "Mörkt"]]
        .map(([k, ic, l]) => `<button class="${SET.theme === k ? "on" : ""}" onclick="SET.theme='${k}';saveSettings();render()">${I(ic, 15)} ${l}</button>`).join("")}</div></div>
    <div class="field" style="margin-top:18px"><label>Typsnitt</label>
      <div class="fontpick">
        ${[["instrument","Instrument Sans","Ren och samtida"],
           ["onest","Onest","Mjukare, varmare"],
           ["host","Host Grotesk","Stramare, teknisk"],
           ["familjen","Familjen Grotesk","Svensk, karaktärsfull"]]
          .map(([k,n,d]) => `<button class="fontcard ${SET.font === k ? "on" : ""}" onclick="setFont('${k}')"
            style="font-family:'${n}',sans-serif"><b>${n}</b><span>${d}</span>
            <i>Din uppfart står tom</i></button>`).join("")}
      </div>
      <p class="muted small" style="margin-top:10px">Byts direkt. Välj det som känns bäst.</p></div>
    <div class="setrow" style="margin-top:12px"><span style="color:var(--ink-45)">${I("eye", 20)}</span>
      <div class="t"><b>Större text</b><span>Lättare att läsa i solen</span></div>
      <div class="switch ${SET.bigText ? "on" : ""}" role="switch" onclick="SET.bigText=!SET.bigText;saveSettings();render()"></div></div>
  </div>

  <div class="panel pad-lg" style="margin-top:18px">
    <h3>Språk och valuta</h3>
    <div class="grid g2" style="margin-top:14px">
      <div class="field"><label>${esc(t("language"))}</label>
        <select class="inp" onchange="SET.lang=this.value;saveSettings();render()">
          <option value="sv" ${SET.lang === "sv" ? "selected" : ""}>Svenska</option>
          <option value="en" ${SET.lang === "en" ? "selected" : ""}>English</option>
        </select></div>
      <div class="field"><label>${esc(t("currency"))}</label>
        <select class="inp" onchange="SET.currency=this.value;saveSettings();render()">
          ${Object.keys(CURRENCIES).map(k => `<option value="${k}" ${SET.currency === k ? "selected" : ""}>${k} · ${CURRENCIES[k].name}</option>`).join("")}
        </select></div>
    </div>
    <p class="muted small" style="margin-top:12px">Sverige först, sedan Norden och Europa. Valutakurserna i demon är ungefärliga.</p>
  </div>

  <div class="panel pad-lg" style="margin-top:18px">
    <h3>Var letar du oftast?</h3>
    <div class="field" style="margin-top:14px">
      <select class="inp" onchange="SET.city=this.value;S.area=this.value;saveSettings();toast('Sparat','check')">
        ${AREAS.map(a => `<option value="${a.id}" ${SET.city === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
      </select></div>
  </div>

  <div class="panel pad-lg" style="margin-top:18px">
    <h3>Vad vill du få veta?</h3>
    <div style="margin-top:8px">
      ${[["bokning", "receipt", "Bokningar", "Bekräftelser och påminnelser"],
         ["betalning", "wallet", "Pengar", "Utbetalningar och kvitton"],
         ["pris", "chart", "Prisförslag", "När du kan ta mer betalt"],
         ["evenemang", "ticket", "Matcher nära dig", "Tillfällen som ger extra pengar"],
         ["nyheter", "message", "Nyheter från Parkla", "Högst ett mejl i månaden"]]
        .map(([k, ic, tt, ss]) => `<div class="setrow"><span style="color:var(--ink-45)">${I(ic, 20)}</span>
          <div class="t"><b>${tt}</b><span>${ss}</span></div>
          <div class="switch ${SET.notis[k] ? "on" : ""}" role="switch" onclick="SET.notis['${k}']=!SET.notis['${k}'];saveSettings();this.classList.toggle('on')"></div></div>`).join("")}
    </div>
  </div>

  <div class="panel pad-lg" style="margin-top:18px">
    <h3>Konto</h3>
    <div style="margin-top:8px">
      <div class="setrow"><span style="color:var(--green)">${I("shield", 20)}</span>
        <div class="t"><b>Legitimering</b><span>BankID – simulerad i demon</span></div><span class="tag green">Klar</span></div>
      <div class="setrow"><span style="color:var(--ink-45)">${I("bank", 20)}</span>
        <div class="t"><b>Konto för utbetalning</b><span>SEB · ****4471 (demo)</span></div>
        <button class="btn btn-sm" onclick="toast('Ändras med BankID i skarpt läge','info')">Ändra</button></div>
      <div class="setrow"><span style="color:var(--ink-45)">${I("download", 20)}</span>
        <div class="t"><b>Hämta mina uppgifter</b><span>Allt du lagt in, som fil</span></div>
        <button class="btn btn-sm" onclick="exportData()">Hämta</button></div>
      <div class="setrow"><span style="color:var(--clay)">${I("refresh", 20)}</span>
        <div class="t"><b>Börja om</b><span>Raderar bokningar, platser och sparat</span></div>
        <button class="btn btn-sm btn-d" onclick="resetAll()">Nollställ</button></div>
    </div>
  </div>

  <div class="panel pad-lg" style="margin-top:18px">
    <h3>Om appen</h3>
    <p class="dim small" style="margin-top:10px">Parkla ${VERSION}. Lägg till den på hemskärmen så fungerar den som en vanlig app: tryck på dela-knappen och välj ”Lägg till på hemskärmen”.</p>
    <div class="row wrap" style="margin-top:14px">
      <button class="btn btn-sm btn-p" onclick="startTour()">${I("play", 15)} Visa rundturen igen</button>
      <button class="btn btn-sm" onclick="shareRef('')">${I("share", 15)} Dela appen</button>
      <button class="btn btn-sm" data-go="mer">Vanliga frågor</button>
    </div>
  </div>
</div></section>
${footerHTML()}`;
}
function exportData() {
  const json = JSON.stringify({ version: VERSION, settings: SET, bookings: BOOKINGS, listings: LISTINGS, favs: FAVS, watch: WATCH }, null, 2);
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = "parkla-data.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Filen är hämtad", "download");
  } catch (e) {
    openSheet(sheetHead("Dina uppgifter") + `<div class="sheet-b"><textarea class="inp mono" rows="14" readonly style="font-size:12px">${esc(json)}</textarea></div>`);
  }
}
function resetAll() {
  openSheet(sheetHead("Börja om?") + `<div class="sheet-b stack">
    <p class="dim">Det här raderar dina bokningar, platser och sparade favoriter i den här webbläsaren. Det går inte att ångra.</p>
    <button class="btn btn-c btn-block btn-lg" onclick="localStorage.clear();location.hash='';location.reload()">Ja, nollställ</button>
    <button class="btn btn-block" onclick="closeSheet()">${esc(t("cancel"))}</button></div>`);
}

/* ============================================================
   VY: MER
   ============================================================ */
function viewMer() {
  const unread = NOTIS.filter(n => n.unread).length;
  const links = [
    ["installningar", "sliders", t("settings"), "Utseende, språk, valuta, aviseringar"],
    ["evenemang", "ticket", "Evenemang", "Matcher och konserter nära dig"],
    ["meddelanden", "message", "Meddelanden", "Skriv till värdar och förare"],
    ["trygg", "shield", t("nav_trust"), "BankID, skadegaranti, flytta bilen"],
    ["priser", "wallet", t("nav_price"), "Exakt vad vi tar, och varför"],
    ["skatt", "receipt", "Skatt och regler", "40 000 kr skattefritt, bygglov, förening"],
    ["brf", "building", "För föreningar", "Fyll era tomma platser"],
    ["bjudin", "gift", "Bjud in en vän", `Ge ${num(FEES.refForare)} ${sym()}, få ${num(FEES.refVard)} ${sym()}`],
    ["affar", "chart", "Affärsmodell", "Hur Parkla tjänar pengar"]
  ];
  const faq = [
    ["Vad händer om någon inte flyttar bilen?", `Du trycker på ”Flytta bilen”. Vi ringer föraren inom 60 sekunder, tar ${kr(FEES.overtidPerTimme)} för varje påbörjad timme – alla pengarna går till dig – och bekostar bärgning efter tre timmar.`],
    ["Kan jag få p-bot på en Parkla-plats?", "Nej. Platsen är privat mark och du har ett giltigt avtal. Skulle du ändå få en kontrollavgift bestrider vi den åt dig och betalar om vi förlorar."],
    ["Måste jag vara hemma när någon parkerar?", "Nej. De flesta uthyrningar sker utan att ni ens träffas. Kod, karta och instruktioner finns i appen."],
    ["Hur mycket kan jag tjäna?", "En uppfart i Stockholms innerstad: 1 800–2 500 kr i månaden. Märsta nära Arlanda: 1 200–1 700 kr. Förort: 400–900 kr. Med laddbox ungefär 28 % mer."],
    ["Måste jag betala skatt?", "Oftast inte. Du får tjäna 40 000 kr per bostad och år skattefritt. Appen har en mätare, och vi skickar underlag i januari."],
    ["Jag bor i bostadsrätt – får jag hyra ut?", "Bara med styrelsens tillstånd. Vi skickar en färdig fråga åt dig."],
    ["Vad skiljer Parkla från de som redan finns?", "De är gratis och därför tomma – ingen har råd att lösa problemet. Vi tar betalt från dag ett, satsar allt på ett område i taget och är ensamma om en riktig skadegaranti."],
    ["Vad händer om min bil blir skadad där?", "Din egen bilförsäkring gäller som vanligt. Vår garanti täcker det omvända: skador som din bil orsakar på värdens uppfart eller garage."],
    ["Kan jag hyra ut när jag är bortrest?", "Ja – det är själva poängen. Ställ in dina resdagar eller lägg upp platsen bara när du vet att du är borta."],
    ["När kommer appen till App Store?", "Webben först. Den fungerar redan på mobilen – lägg till den på hemskärmen. Appbutikerna när första området är fullt."]
  ];
  return `
<section class="tight"><div class="wrap" style="max-width:760px">
  <h1 style="font-size:clamp(2rem,4.6vw,3rem)">${esc(t("nav_more"))}</h1>

  <button class="linkrow" style="margin-top:20px;border-top:1px solid var(--rule)" onclick="openNotis()">
    <span class="ic">${I("bell", 22)}</span>
    <span class="t"><b>Aviseringar</b><span>${unread ? unread + " olästa" : "Inget nytt"}</span></span>
    ${unread ? `<span class="tag clay">${unread}</span>` : `<span class="arw">${I("chevron", 17)}</span>`}
  </button>
  ${links.map(([r, ic, tt, ss]) => `<button class="linkrow" data-go="${r}">
    <span class="ic">${I(ic, 22)}</span><span class="t"><b>${tt}</b><span>${ss}</span></span>
    <span class="arw">${I("chevron", 17)}</span></button>`).join("")}

  <h2 style="margin:46px 0 8px">Vanliga frågor</h2>
  <div>${faq.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><div class="a">${a}</div></details>`).join("")}</div>

  <div class="panel pad-lg" style="margin-top:34px">
    <h3>Om Parkla</h3>
    <p class="dim small" style="margin-top:10px">Parkla är en prototyp och ett arbetsunderlag. All data i appen är påhittad. Version ${VERSION}.</p>
    <div class="row wrap" style="margin-top:14px">
      <button class="btn btn-sm btn-p" onclick="startTour()">${I("play", 15)} Visa rundturen</button>
      <button class="btn btn-sm" data-go="installningar">${esc(t("settings"))}</button>
      <button class="btn btn-sm" onclick="shareRef('')">${I("share", 15)} Dela</button>
    </div>
  </div>
</div></section>
${footerHTML()}`;
}

/* ============================================================
   RUNDTUR
   ============================================================ */
function tourSteps() {
  const mob = window.innerWidth < 981;
  return [
    { title: "Välkommen till Parkla", body: "Här hyr vanliga människor ut sin uppfart till andra som behöver parkera. Vi visar var allt finns – det tar 30 sekunder.", sel: null },
    { title: "Här hittar du parkering", body: "Tryck här för att söka. Du kan dra i kartan, skriva en adress eller trycka på ett pris för att se platsen.",
      sel: mob ? '#tabbar button[data-go="sok"]' : '.nav a[data-go="sok"]', route: null, radius: 999, place: mob ? "top" : "bottom" },
    { title: "Här räknar du ut vad din plats är värd", body: "Har du en uppfart, carport eller garageplats? Svara på tre frågor så säger vi vad du kan ta betalt.",
      sel: mob ? '#tabbar button[data-go="hyrut"]' : '.nav a[data-go="hyrut"]', radius: 999, place: mob ? "top" : "bottom" },
    { title: "Här ligger dina pengar", body: "Dina bokningar, dina platser, dina utbetalningar och hur mycket du får tjäna skattefritt.",
      sel: mob ? '#tabbar button[data-go="mina"]' : '.nav a[data-go="mina"]', radius: 999, place: mob ? "top" : "bottom" },
    { title: "Och här är allt annat", body: "Inställningar, trygghet, priser, skatteregler och vanliga frågor. Du hittar alltid tillbaka hit.",
      sel: mob ? '#tabbar button[data-go="mer"]' : '.nav a[data-go="priser"]', radius: 999, place: mob ? "top" : "bottom" },
    { title: "Nu kör vi", body: "Testa gärna att boka en plats – det kostar ingenting, allt i demon är påhittat.", sel: null }
  ];
}
function startTour() {
  if (typeof Tour === "undefined") return;
  Tour.start(tourSteps(), fin => {
    LS.set("tour", true);
    if (fin) { toast("Nu kan du allt", "check"); go("sok"); }
  });
}

/* ============================================================
   RENDERING
   ============================================================ */
const VIEWS = {
  start: viewStart, sok: viewSok, hyrut: viewHyrut, mina: viewMina, mer: viewMer,
  trygg: viewTrygg, priser: viewPriser, skatt: viewSkatt, brf: viewBrf, affar: viewAffar,
  evenemang: viewEvenemang, meddelanden: viewMeddelanden, installningar: viewInstallningar, bjudin: viewBjudin
};

let io = null, revealTimer = null;
function observeReveals() {
  const els = document.querySelectorAll("[data-reveal]");
  els.forEach((el, i) => { if (!el.style.getPropertyValue("--d")) el.style.setProperty("--d", Math.min(i * 45, 260) + "ms"); });

  /* Utan IntersectionObserver: visa allt direkt hellre än att dölja innehåll. */
  if (!("IntersectionObserver" in window)) { els.forEach(el => el.classList.add("seen")); return; }

  if (io) io.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -6% 0px", threshold: .02 });
  els.forEach(el => io.observe(el));

  /* Säkerhetsnät: allt som ligger i vyn visas direkt, och inget får bli hängande osynligt. */
  const showVisible = () => document.querySelectorAll("[data-reveal]:not(.seen)").forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 1.05 && r.bottom > -40) el.classList.add("seen");
  });
  requestAnimationFrame(showVisible);
  setTimeout(showVisible, 90);
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => document.querySelectorAll("[data-reveal]").forEach(el => {
    el.classList.add("seen");
    /* tvinga fram synlighet även om övergångar är pausade i miljön */
    el.style.opacity = "1"; el.style.transform = "none"; el.style.filter = "none";
  }), 2500);
}
function countUps() {
  document.querySelectorAll(".countup").forEach(el => {
    const target = +el.dataset.count; if (!target || target > 1e7) return;
    const dur = 900, t0 = performance.now(), fmt = n => Math.round(n).toLocaleString(loc());
    function step(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
function render() {
  document.getElementById("app").innerHTML = (VIEWS[S.route] || viewStart)();
  document.getElementById("nav").innerHTML = navHTML();
  document.getElementById("tabbar").innerHTML = tabbarHTML();
  const dot = document.getElementById("notisDot");
  if (dot) dot.classList.toggle("on", NOTIS.some(n => n.unread));
  document.documentElement.lang = SET.lang;
  observeReveals();
  countUps();
  if (S.route === "sok") setTimeout(() => mountMap("lmap", { fit: S.view === "lista", pad: 30 }), 40);
  if (S.route === "start") setTimeout(() => mountMap("hmap", { fit: true, pad: 46, onPick: openSpot }), 60);
  if (typeof Tour !== "undefined" && Tour.active()) setTimeout(Tour.place, 120);
}

/* ---------- händelser ---------- */
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const b = e.target.closest(".btn, .chip, .linkrow, .railcard, .mbtn");
  if (b && !b.classList.contains("has-rip")) rip(b, e);
  else if (b) rip(b, e);
});
function rip(el, e) {
  const r = el.getBoundingClientRect();
  el.classList.add("has-rip");
  const s = document.createElement("span");
  const d = Math.max(r.width, r.height);
  s.className = "ripple";
  s.style.width = s.style.height = d + "px";
  s.style.left = (e.clientX - r.left - d / 2) + "px";
  s.style.top = (e.clientY - r.top - d / 2) + "px";
  el.appendChild(s);
  setTimeout(() => s.remove(), 640);
}
document.getElementById("scrim").addEventListener("click", closeSheet);
document.getElementById("btnNotis").addEventListener("click", openNotis);
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); if (Tour.active()) Tour.stop(); } });
window.addEventListener("hashchange", () => {
  const r = location.hash.replace("#", "") || "start";
  if (r !== S.route) { PMap.destroy(); S.route = r; render(); }
});
window.addEventListener("scroll", () => {
  document.getElementById("top").classList.toggle("stuck", window.scrollY > 8);
}, { passive: true });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (SET.theme === "system" && PMap.alive()) PMap.setMode(SET.mapMode);
});

/* ---------- start ---------- */
applyTheme();
render();
if (!LS.get("seen", false)) {
  LS.set("seen", true);
  setTimeout(() => openSheet(`<div class="sheet-b center" style="padding-top:34px">
    ${logoSVG(52)}
    <h3 style="font-family:var(--serif);font-size:1.9rem;margin-top:18px">Välkommen till Parkla</h3>
    <p class="dim" style="margin-top:10px;max-width:34ch;margin-inline:auto">Här hyr vanliga människor ut sin uppfart till andra som behöver parkera.</p>
    <div class="stack tight" style="margin-top:26px">
      <button class="btn btn-p btn-block btn-lg" onclick="closeSheet();startTour()">${I("play", 18)} Visa mig hur det funkar</button>
      <button class="btn btn-block btn-lg" onclick="closeSheet();go('hyrut')">${I("wallet", 18)} Jag har en plats att hyra ut</button>
      <button class="btn btn-block btn-lg" onclick="closeSheet();go('sok')">${I("search", 18)} Jag letar efter parkering</button>
      <button class="btn btn-block" onclick="closeSheet()">Bara titta runt</button>
    </div>
    <p class="muted small" style="margin-top:18px">Demo med påhittade platser. Du behöver inget konto.</p>
  </div>`), 650);
}
