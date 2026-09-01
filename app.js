/* ============================================================
   Parkla — applogik
   ============================================================ */
"use strict";

/* ---------------- Lagring ---------------- */
const NS = "parkla.v3.";
const LS = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};

const DEFAULT_SETTINGS = {
  theme: "system", lang: "sv", currency: "SEK", font: "instrument",
  live: false, formUrl: "", metaPixel: "",
  city: "sthlm", mapMode: "satellit",
  notis: { bokning: true, betalning: true, pris: true, evenemang: true, nyheter: false },
  bigText: false
};
let SET = Object.assign({}, DEFAULT_SETTINGS, LS.get("settings", {}));
SET.notis = Object.assign({}, DEFAULT_SETTINGS.notis, SET.notis || {});
/* Engångsflytt: satellit blev standard, och typsnittet är nu valbart. */
if (!SET.v5) { SET.v5 = 1; SET.mapMode = "satellit"; SET.font = SET.font || "instrument"; LS.set("settings", SET); }
function setFont(k) { SET.font = k; saveSettings(); render(); toast("Typsnitt: " + k, "eye"); }
/* Skarpt läge: inga påhittade platser går att boka, bara intresseanmälan. */
const isLive = () => !!SET.live;
function saveSettings() { LS.set("settings", SET); applyTheme(); }

/* ── Meta-pixel (betald FB/IG) ─────────────────────────────
   Laddas BARA om du satt ett Pixel-ID i Inställningar. Utan ID
   sker ingen spårning alls. OBS: pixeln är en marknadsföringscookie
   – uppdatera integritetspolicyn och lägg en samtyckesruta innan
   du kör skarpt (se not i koden och i FACEBOOK-ANNONSER.md). */
function initMetaPixel() {
  const id = (SET.metaPixel || "").trim();
  if (!/^\d{6,20}$/.test(id) || window.__fbqLoaded) return;
  if (CONSENT !== "yes") return;   /* ingen spårning utan samtycke */
  window.__fbqLoaded = true;
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
  fbq("init", id);
  fbq("track", "PageView");
}
function pixelLead(typ) {
  if (window.fbq) try { fbq("track", "Lead", { content_name: typ === "vard" ? "host_waitlist" : "driver_waitlist" }); } catch (e) {}
}

/* ── Samtyckesruta ─────────────────────────────────────────
   Visas BARA om ett Meta Pixel-ID är satt och inget val gjorts.
   Inget spårar förrän man aktivt tryckt Godkänn. Neka är lika
   lätt som Godkänn (GDPR). */
function needConsent() { return !!(SET.metaPixel || "").trim() && CONSENT === null; }
function renderConsent() {
  let el = document.getElementById("consentbar");
  if (!needConsent()) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "consentbar"; document.body.appendChild(el); }
  el.className = "consentbar";
  el.innerHTML = `<div class="consent-in">
    <p>Vi vill använda en pixel från Meta (Facebook) för att mäta hur våra annonser fungerar. Du bestämmer – appen fungerar lika bra utan.
      <button class="lnk" onclick="setConsent(null);go('integritet')">Läs mer</button></p>
    <div class="consent-btns">
      <button class="btn btn-sm" onclick="setConsent('no')">Neka</button>
      <button class="btn btn-sm consent-ok" onclick="setConsent('yes')">Godkänn</button>
    </div>
  </div>`;
}
function setConsent(v) {
  if (v === null) { const e = document.getElementById("consentbar"); if (e) e.remove(); return; }
  CONSENT = v; LS.set("consent", v);
  const e = document.getElementById("consentbar"); if (e) e.remove();
  if (v === "yes") initMetaPixel();
  toast(v === "yes" ? "Tack – du kan ändra dig i integritetspolicyn" : "Ingen spårning – noterat", "check");
}
function applyTheme() {
  const el = document.documentElement;
  if (SET.theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", SET.theme);
  el.setAttribute("data-font", SET.font || "instrument");
  /* rem räknas mot <html>, inte <body> — skalan måste sitta på roten. */
  el.style.fontSize = SET.bigText ? "18px" : "";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#F5F7F6";
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
  route: (location.hash.replace("#", "").split("?")[0]) || "hem",
  area: SET.city, mode: "manad", view: "karta",
  q: "", near: null, nearLabel: "", part: null, partZoom: null, maxPrice: 0,
  fNu: false, fCharge: false, fGarage: false, fSecure: false, fBig: false,
  sort: "pris", selSpot: null,
  season: "kort", blockFor: null, calMode: "stang",
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

const priceFor = (s, m) => m === "sasong" ? seasonPrice(s, S.season) : m === "evenemang" ? s.ev : m === "timme" ? s.h : m === "dygn" ? s.d : m === "vecka" ? s.w : s.m;
const unitLong  = m => m === "sasong" ? "för hela säsongen" : m === "evenemang" ? t("per_event") : m === "timme" ? t("per_hour") : m === "dygn" ? t("per_day") : m === "vecka" ? t("per_week") : t("per_month");
const unitShort = m => m === "sasong" ? "/säsong" : m === "evenemang" ? t("u_event") : m === "timme" ? t("u_hour") : m === "dygn" ? t("u_day") : m === "vecka" ? t("u_week") : t("u_month");
const reviewsFor = id => REVIEWS[id] || DEFAULT_REVIEWS;

/* Ett id i ett onclick-attribut: tal skrivs rakt av, strangar (UUID i skarpt
   lage) maste citeras — annars blir onclick="openSpot(3f2a-...)" ett syntaxfel
   och VARJE platsknapp dor. */
function idArg(id) {
  return typeof id === "number" ? id : "'" + String(id).replace(/'/g, "\\'") + "'";
}

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
  if (!s.n) return `<span class="tag green">Ny plats</span>`;
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
  /* Stanger man BankID-rutan ska bokningen INTE ga igenom tva sekunder senare. */
  if (S.bk && S.bk._t) { clearTimeout(S.bk._t); S.bk._t = null; }
  /* Blockera-kalenderns tillstand far inte lacka in i nasta kalender. */
  S.blockFor = null;
}
function sheetHead(title) {
  return `<div class="sheet-h"><h3>${esc(title)}</h3><button class="x" onclick="closeSheet()" aria-label="${t("close")}">${I("close", 16)}</button></div>`;
}
function go(r) {
  if (r === S.route) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  PMap.destroy();
  S.route = r;
  /* pushState via hash — annars lamnar bakatknappen hela appen direkt */
  location.hash = r;
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
  const items = [["hem", "home", t("tab_start"), 0], ["sok", "search", t("tab_search"), 0],
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
      <li><a href="#vinterforvar" data-go="vinterforvar">Vinterförvar</a></li>
      <li><a href="#trygg" data-go="trygg">Så fungerar det</a></li>
      <li><a href="#priser" data-go="priser">Priser</a></li></ul></div>
    <div><h5>För värdar</h5><ul>
      <li><a href="#hyrut" data-go="hyrut">Hyr ut din plats</a></li>
      <li><a href="#skatt" data-go="skatt">Skatt och regler</a></li>
      <li><a href="#brf" data-go="brf">BRF och fastighet</a></li>
      <li><a href="#bjudin" data-go="bjudin">Bjud in en vän</a></li></ul></div>
    <div><h5>Parkla</h5><ul>
      <li><a href="#installningar" data-go="installningar">Inställningar</a></li>
      <li><a href="#mer" data-go="mer">Vanliga frågor</a></li>
      <li><a href="#villkor" data-go="villkor">Användarvillkor</a></li>
      <li><a href="#integritet" data-go="integritet">Integritetspolicy</a></li>
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
${liveBanner()}
<div class="hero"><div class="wrap"><div class="hero-grid">
  <div>
    <h1 data-reveal style="--d:60ms">Din uppfart står tom.<br>Den kan ge dig <em>${num(FEES.schablon)} ${sym()}</em> om året.</h1>
    <p class="lede" style="margin-top:26px" data-reveal>Har du en ledig plats framför huset? Lägg upp den. Någon som behöver parkera betalar dig varje månad. Vi sköter pengarna, legitimeringen och tryggheten.</p>
    <div class="hero-cta" data-reveal style="--d:120ms">
      <button class="btn btn-p btn-lg" data-go="hyrut">${I("wallet", 18)}Se vad min plats är värd${I("arrow", 17, "arw")}</button>
      <button class="btn btn-lg" data-go="sok">${I("search", 18)}Se lediga platser</button>
    </div>
    <div class="trustrow" data-reveal style="--d:150ms">
      <span>${I("shield", 16)} BankID vid lansering</span>
      <span>${I("swish", 16)} Betala med Swish</span>
      <button class="asbtn" data-go="trygg">${I("lock", 16)} Vi ersätter skador på din plats
        <b>upp till ${num(FEES.garantiBelopp)} ${sym()}</b> ${I("chevron", 13)}</button>
    </div>
    <div class="figures" data-reveal style="--d:210ms">
      <div><b><span class="countup" data-count="${Math.round(sug.month * (CURRENCIES[SET.currency] || CURRENCIES.SEK).rate)}">${num(sug.month)}</span><i class="u">${sym()}</i></b><span>i snitt per månad i Stockholm</span></div>
      <div><b><span class="countup" data-count="${Math.round(FEES.schablon * (CURRENCIES[SET.currency] || CURRENCIES.SEK).rate)}">${num(FEES.schablon)}</span><i class="u">${sym()}</i></b><span>får du tjäna skattefritt varje år</span></div>
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

<section class="snug"><div class="wrap">
  <div class="doors">
    <button class="door" onclick="${'isLive() ? openLeadDriver() : document.getElementById(\'kartan\').scrollIntoView({behavior:\'smooth\',block:\'start\'})'}">
      <span class="ic">${I("search", 30)}</span>
      <b>Jag behöver parkera</b>
      <span class="d">Hitta en plats nära dig. Från ${kr(12)} i timmen.</span>
      <span class="go">Visa lediga platser ${I("arrow", 17, "arw")}</span>
    </button>
    <button class="door alt" onclick="${'isLive() ? openLeadHost() : go(\'hyrut\')'}">
      <span class="ic">${I("wallet", 30)}</span>
      <b>Jag har en plats att hyra ut</b>
      <span class="d">Se vad din uppfart eller ditt garage kan ge dig.</span>
      <span class="go">Räkna ut mitt pris ${I("arrow", 17, "arw")}</span>
    </button>
  </div>
</div></section>

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
      <button class="mbtn" onclick="locateMe()" aria-label="Visa var jag är" title="Var är jag?">${I("target", 19)}</button>
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
         ["Säg ja till föraren", "Du ser registreringsnumret innan du svarar. Vid lansering har alla dessutom legitimerat sig med BankID."],
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
      <div class="cnt">${allSpots().filter(s => s.area === a.id).length} platser ${I("arrow", 14, "arw")}</div>
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
         ["door", "Flyttar inte bilen?", `Tryck på en knapp. Vi kontaktar föraren, och övertid kostar ${num(FEES.overtidPerTimme)} ${sym()} i timmen – hela beloppet till dig.`],
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
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/* Värdens egen annons blir en sökbar plats, så att det värden stänger
   faktiskt syns för den som letar. */
function listingToSpot(l) {
  const d = Math.max(20, Math.round(l.pris / 22 * 1.6));
  const feat = [];
  if (l.charger) feat.push("Laddbox");
  if (l.gated) feat.push("Låst");
  if (l.cam) feat.push("Kamera");
  if (l.vinter) feat.push("Vinterförvar");
  return {
    id: l.id, mine: true, area: l.area || SET.city, kind: TYPE_KIND[l.type] || "uppfart",
    nm: l.ad, ad: "Din plats · " + esc(l.tid), type: l.type,
    h: Math.max(5, Math.round(d / 8)), d: d, w: Math.round(d * 4.6 / 10) * 10,
    m: l.pris, ev: l.vinter ? Math.round(d * 1.9 / 10) * 10 : Math.round(d * 1.9 / 10) * 10,
    rate: 5, n: 0, host: "Du", hostSince: new Date().getFullYear(),
    charge: !!l.charger, feat: feat.length ? feat : ["Ny plats"], size: l.size || "Personbil",
    walk: 0, ll: l.ll || (AREAS.find(a => a.id === (l.area || SET.city)) || AREAS[0]).c,
    instr: l.info || "Instruktion saknas ännu.", paused: l.paused, grundare: !!l.grundare, photo: l.photo || null
  };
}
function allSpots() {
  const mina = LISTINGS.filter(l => !l.paused).map(listingToSpot);
  return mina.concat(SPOTS);
}

/* Är platsen ledig just nu, så att någon kan svänga in?
   Kräver: timpris finns, dagen är inte stängd, veckoschemat tillåter, och
   ingen annan står där. */
function nowFree(sp) {
  if (!sp) return false;
  /* Upptagna demoplatser (roda pa kartan) ar inte "lediga nu" i listan. */
  if (!sp.mine && !spotFree(sp)) return false;
  if (SESSION && SESSION.spotId === sp.id) return false;
  /* Kräver värden godkännande är det per definition inte kör-in. */
  if (!sp.mine && APPROVAL_IDS.indexOf(sp.id) > -1) return false;
  if (sp.mine) { const li = LISTINGS.find(x => x.id === sp.id); if (li && li.instant === false) return false; }
  const nu = new Date();
  if (!(priceOnDate(sp, isoOf(nu.getFullYear(), nu.getMonth(), nu.getDate()), "timme") || sp.h)) return false;
  if (dayIsBooked(sp, nu.getFullYear(), nu.getMonth(), nu.getDate())) return false;
  if (sp.mine) {
    const l = LISTINGS.find(x => x.id === sp.id);
    if (!l || l.paused || l.nu === false) return false;
    if (l.sched) { const wd = (nu.getDay() + 6) % 7; if (!l.sched[wd].on) return false; }
  }
  const h = nu.getHours();
  return h >= OPEN_HOURS.from && h < OPEN_HOURS.to;
}
function timPris(sp) {
  const nu = new Date();
  return priceOnDate(sp, isoOf(nu.getFullYear(), nu.getMonth(), nu.getDate()), "timme") || sp.h || 0;
}
/* Minuter → kronor. Första timmen alltid, därefter påbörjad halvtimme. */
function sessionKostnad(sp, minuter) {
  const tim = timPris(sp);
  const deb = Math.max(MIN_DEBITERING, Math.ceil(minuter / STEG_MINUTER) * STEG_MINUTER);
  return Math.round(tim * deb / 60);
}
function minuterSedan(ts) { return Math.max(0, Math.floor((Date.now() - ts) / 60000)); }
function tidText(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} tim ${m} min` : `${m} min`;
}

/* Evenemang som ligger nära en plats och som inte redan varit. */
function eventsNear(sp) {
  if (!sp || !sp.ll) return [];
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  return EVENTS
    .map(e => Object.assign({ km: distKm(sp.ll, e.ll) }, e))
    .filter(e => e.km <= EVENT_RADIE_KM && new Date(e.date) >= idag)
    .sort((a, b) => a.date < b.date ? -1 : 1);
}
function eventOn(sp, iso) { return eventsNear(sp).find(e => e.date === iso) || null; }

/* Förslag på dagspris när det är evenemang.
   Skalar med hur många som kommer, men aldrig mer än 2,5 gånger ordinarie –
   över det uppfattas det som ocker och folk bokar inte. */
function eventPrice(l, ev) {
  const bas = baseDayPrice(l);
  const takt = ev.crowd >= 30000 ? 2.5 : ev.crowd >= 15000 ? 2.0 : 1.6;
  const närhet = ev.km <= 1 ? 1 : ev.km <= 3 ? 0.9 : 0.78;
  return Math.round(bas * takt * närhet / 10) * 10;
}
function kmText(km) { return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km"; }

/* Ordinarie dygnspris för en egen annons. */
function baseDayPrice(l) { return Math.max(20, Math.round(l.pris / 22 * 1.6)); }
/* Priset för en bestämd dag – värdens specialpris om det finns, annars ordinarie. */
function dayPriceFor(l, iso) {
  return (l.prices && l.prices[iso]) ? l.prices[iso] : baseDayPrice(l);
}
/* Vad kostar platsen den valda dagen, i det läge man tittar i? */
function priceOnDate(sp, iso, mode) {
  if (!sp || !sp.mine || !iso) return priceFor(sp, mode);
  const l = LISTINGS.find(x => x.id === sp.id);
  if (!l) return priceFor(sp, mode);
  const dyg = dayPriceFor(l, iso);
  if (mode === "dygn") return dyg;
  if (mode === "timme") return Math.max(5, Math.round(dyg / 8));
  if (mode === "evenemang") return Math.round(dyg * 1.9 / 10) * 10;
  if (mode === "vecka") return Math.round(dyg * 4.6 / 10) * 10;
  return priceFor(sp, mode);
}
/* Har värden satt olika priser? Då visar vi "från". */
function hasVaryingPrice(sp) {
  if (!sp || !sp.mine) return false;
  const l = LISTINGS.find(x => x.id === sp.id);
  return !!(l && l.prices && Object.keys(l.prices).length);
}

/* Är dagen upptagen? För egna annonser styrs det av vad värden stängt. */
function dayIsBooked(sp, y, m, d) {
  if (sp && sp.mine) {
    const l = LISTINGS.find(x => x.id === sp.id);
    return !!(l && l.blocked && l.blocked.indexOf(isoOf(y, m, d)) > -1);
  }
  return dayBooked(sp.id, y, m, d);
}
function freeLeft(sp, y, m, fromDay) {
  const dagar = new Date(y, m + 1, 0).getDate();
  let n = 0;
  for (let d = Math.max(1, fromDay); d <= dagar; d++) if (!dayIsBooked(sp, y, m, d)) n++;
  return n;
}

function baseList() {
  let list = allSpots().filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
  if (S.q.trim()) {
    const q = S.q.toLowerCase();
    list = list.filter(s => (s.nm + " " + s.ad + " " + s.type + " " + s.feat.join(" ")).toLowerCase().includes(q));
  }
  if (S.fCharge) list = list.filter(s => s.charge);
  if (S.fGarage) list = list.filter(s => s.kind === "garage" || s.kind === "carport");
  if (S.fSecure) list = list.filter(s => s.feat.some(f => /Kamera|Låst|Grind|Portkod/.test(f)));
  if (S.fBig)    list = list.filter(s => /SUV|husbil|buss|husvagn|släp/i.test(s.size));
  if (S.fNu)     list = list.filter(nowFree);
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
  /* Samma regel som listans "Ledig nu"-tagg — annars sager kartan
     Upptagen dar listan sager Ledig, om exakt samma plats. */
  const free = list.filter(nowFree);
  const pool = free.length ? free : list;
  let best = null, min = Infinity;
  pool.forEach(x => { const p = priceFor(x, S.mode); if (p && p < min) { min = p; best = x.id; } });
  return s => ({ label: num(priceFor(s, S.mode)) + " " + sym(), free: nowFree(s), best: s.id === best });
}

function activeFilterCount() { return [S.fNu, S.fCharge, S.fGarage, S.fSecure, S.fBig, !!S.maxPrice].filter(Boolean).length; }

/* ============================================================
   Kart-först hemskärm — appen öppnar direkt i en karta som ser
   var du är och rekommenderar platser nära dig. Enkelt som en
   parkeringsapp: sök område, klicka på kartan, boka.
   ============================================================ */
function viewHem() {
  const list = baseList();
  const near = list.slice(0, 6);
  return `
<div class="wrap" style="padding-top:14px">
  <div class="spread" style="align-items:flex-start;gap:12px">
    <div>
      <h2 style="font-family:var(--display);font-size:1.5rem;margin:0;line-height:1.15">Hitta parkering nära dig</h2>
      <p class="muted small" style="margin:3px 0 0">${esc(placeLabel())} · ${list.length} platser</p>
    </div>
    <button class="btn btn-sm" onclick="go('sok')">${I("filter", 15)} Filter</button>
  </div>

  <div class="mapwrap full" style="margin-top:12px">
    <div id="lmap" class="leafletmap"></div>
    <div class="mapui tl">
      <div class="msearch ${S.q || S.nearLabel ? "filled" : ""}">
        <span class="mi">${I("search", 18)}</span>
        <input id="mapq" value="${esc(S.nearLabel || S.q)}" placeholder="Vart vill du parkera?"
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
      <button class="mbtn" onclick="locateMe()" aria-label="Var är jag?" title="Var är jag?">${I("target", 19)}</button>
      <button class="mbtn" onclick="fitAll()" aria-label="Visa alla platser" title="Visa alla">${I("layers", 19)}</button>
    </div>
    <div class="maplegend">
      <span class="l-free"><i></i>Ledig nu</span>
      <span class="l-busy"><i></i>Upptagen</span>
      <span class="l-best"><i></i>Billigast</span>
    </div>
    <div id="mcard"></div>
  </div>

  <div class="spread" style="margin:20px 0 8px">
    <b>Nära dig</b>
    <button class="lnk" onclick="go('sok')">Se alla ${I("arrow", 14, "arw")}</button>
  </div>
  <div class="spotlist">${near.length ? near.map(spotRow).join("") : emptyHTML()}</div>

  <p class="muted small center" style="margin-top:20px">
    Ny här? <button class="lnk" onclick="go('start')">Så funkar Parkla</button>
    · <button class="lnk" onclick="go('hyrut')">Hyr ut din plats</button>
  </p>
</div>`;
}

/* Fråga om position EN gång när hemkartan öppnas — nekad = behåll områdesvyn. */
function autoLocateHem() {
  if (S._located || S.near) return;
  S._located = true;
  if (!navigator.geolocation) return;
  PMap.locate((ll) => {
    if (!ll) return;
    satPosition(ll, "Min position");
    const box = document.getElementById("mapq"); if (box) box.value = "Min position";
    refreshResults();
  });
}

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
      <select class="inp sortsel" style="min-height:38px;padding:6px 30px 6px 12px;width:auto"
        onchange="S.sort=this.value;refreshResults()">
        <option value="pris" ${S.sort === "pris" ? "selected" : ""}>${esc(t("sort_price"))}</option>
        <option value="betyg" ${S.sort === "betyg" ? "selected" : ""}>${esc(t("sort_rating"))}</option>
        <option value="avstand" ${S.sort === "avstand" ? "selected" : ""}>${esc(t("sort_dist"))}</option>
      </select>
    </div>
  </div>

  <div class="askrow"><b>Hur länge behöver du plats?</b>
    <button class="helplink" onclick="startTour()">${I("info", 15)} Visa hur appen funkar</button></div>
  <div class="seg" style="margin-top:10px" id="modeSeg">
    ${[["timme", t("hour")], ["dygn", t("day")], ["vecka", t("week")], ["manad", t("month")], ["evenemang", t("event")], ["sasong", "Vinterförvar"]]
      .map(([k, l]) => `<button class="${S.mode === k ? "on" : ""}" onclick="setMode('${k}')">${esc(l)}</button>`).join("")}
  </div>

  <div class="chips" style="margin-top:11px">
    <button class="chip ${S.fNu ? "on" : ""}" onclick="tog('fNu',this)">${I("car", 15)} Ledig nu</button>
    <button class="chip ${S.fCharge ? "on" : ""}" onclick="tog('fCharge',this)">${I("bolt", 15)} Laddbox</button>
    <button class="chip ${S.fGarage ? "on" : ""}" onclick="tog('fGarage',this)">${I("garage", 15)} Tak eller garage</button>
    <button class="chip ${S.fSecure ? "on" : ""}" onclick="tog('fSecure',this)">${I("lock", 15)} Låst</button>
    <button class="chip ${S.fBig ? "on" : ""}" onclick="tog('fBig',this)">${I("truck", 15)} Stor bil</button>
    ${nf ? `<button class="chip" onclick="clearFilters()">${I("close", 14)} ${esc(t("clear"))}</button>` : ""}
  </div>
</div>

${S.mode === "sasong" ? `<div class="wrap" style="margin-top:14px"><div class="seasonbar">
  <span class="ic">${I("moon", 20)}</span>
  <div class="t"><b>Vinterförvar · ${esc(SEASON[S.season].period)}</b>
    <span>${SEASON[S.season].months} månader. Bara garage, carport, inhägnad tomt och låst innergård – öppna uppfarter visas inte.</span></div>
  <div class="seg" style="max-width:190px">
    ${Object.values(SEASON).map(x => `<button class="${S.season === x.id ? "on" : ""}"
      onclick="S.season='${x.id}';if(S.route==='sok'){refreshResults()}else{render()}">${x.months} mån</button>`).join("")}
  </div>
  <button class="btn btn-sm" data-go="vinterforvar">Så funkar det</button>
</div></div>` : ""}
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
    <p class="muted small center" style="margin-top:12px">Dra i kartan för att flytta den. Nyp med två fingrar för att zooma. Tryck på ett pris för att se platsen.</p>`;
  }
  return `
  <div class="mapwrap short" style="margin-bottom:18px">
    <div id="lmap" class="leafletmap"></div>
    <div class="mapui bl"><span class="mapnote" style="position:static">${esc(area.name)}</span></div>
    <div class="mapui tr"><button class="mbtn" onclick="setView('karta')" aria-label="Öppna stora kartan" title="Öppna stor karta">${I("external", 18)}</button></div>
  </div>
  <div class="spread" style="margin-bottom:6px">
    <h3>${list.length} ${esc(t("free_spots"))}</h3>
    <span class="tag brass">${esc(area.ref)}</span>
  </div>
  ${list.length ? prisnotisHTML() : ""}
  <div class="spotlist">${list.length ? list.map(spotRow).join("") : emptyHTML()}</div>
  ${savingsHTML(list, area)}
  <div class="hint" style="margin-top:18px">${I("info", 17)}
    <div><b>Hittar du inget?</b> Skapa en bevakning så hör vi av oss när något blir ledigt.
    <button class="btn btn-sm" style="margin-top:9px" onclick="addWatch()">Bevaka ${esc(area.name)}</button></div>
  </div>`;
}

/* Grundare = en av de första värdarna. Guldbadge, syns som social proof. */
function isGrundare(s) { return !!(s && s.grundare); }
function grundareBadge() { return `<span class="tag grundare">${I("leaf", 11)} Grundare</span>`; }

function spotRow(s, mode) {
  /* map(spotRow) skickar index som andra argument — bara strangar raknas */
  const lage = typeof mode === "string" ? mode : null;
  const p = priceFor(s, S.mode);
  const fav = FAVS.includes(s.id);
  return `<button class="spot ${S.selSpot === s.id ? "sel" : ""}" onclick="${lage ? `S.mode='${lage}';` : ""}openSpot(${idArg(s.id)})">
    <span class="thumb">${s.photo ? `<img src="${s.photo}" alt="">` : kindIcon(s.kind, 28)}</span>
    <span class="body">
      <span class="nm">${s.mine ? '<span class="tag green" style="margin-right:6px">Din plats</span>' : demoBadge()}${esc(s.nm)}</span>
      <span class="ad">${esc(s.ad)}</span>
      <span class="tags">
        <span class="tag">${esc(s.type)}</span>
        ${nowFree(s) ? `<span class="tag green nu">${I("car", 11)} Ledig nu</span>`
          : needsApproval(s, S.mode) ? `<span class="tag">${I("clock", 11)} Värden svarar</span>`
          : `<span class="tag green">${I("bolt", 11)} Boka direkt</span>`}
        ${isGrundare(s) ? grundareBadge() : ""}
        ${s.charge ? `<span class="tag">${I("bolt", 11)} Laddbox</span>` : ""}
        ${s._km != null ? `<span class="tag">${s._km < 1 ? Math.round(s._km * 1000) + " m" : s._km.toFixed(1).replace(".", ",") + " km"}</span>` : ""}
        ${ratingHTML(s)}
      </span>
    </span>
    <span class="price">${hasVaryingPrice(s) ? '<i class="fran">från</i>' : ""}<b>${num(p)} ${sym()}</b><span>${esc(unitShort(S.mode))}</span></span>
    <span class="fav ${fav ? "on" : ""}" onclick="event.stopPropagation();toggleFav(${idArg(s.id)},this)" role="button"
      aria-label="Spara">${fav ? IF("heart", 17) : I("heart", 17)}</span>
  </button>`;
}
function emptyHTML() {
  /* Står användaren där Parkla inte finns är det inte filtren som är fel.
     Då ska appen säga var vi faktiskt finns – inte "inga platser matchar". */
  if (S.utanfor && S.utanfor.omrade && S.near) {
    const a = S.utanfor.omrade, bevakad = WATCH.includes(a.id);
    return `<div class="empty"><div class="ic">${I("pin", 34)}</div>
      <h3>Parkla finns inte här än</h3>
      <p class="dim small" style="margin-top:8px">Närmaste område är <b>${esc(a.name)}</b>,
        ungefär ${S.utanfor.km} km bort. Vi öppnar en stad i taget, och börjar där
        flest står i kö.</p>
      <div class="row wrap" style="margin-top:18px;justify-content:center">
        <button class="btn btn-sm ${bevakad ? "" : "btn-p"}" onclick="bevakaHar()">
          ${I("bell", 15)} ${bevakad ? "Du bevakar redan" : "Säg till när ni öppnar här"}</button>
        <button class="btn btn-sm" onclick="S.utanfor=null;S.near=null;S.nearLabel='';render()">
          Visa ${esc(a.name)} ändå</button>
      </div>
      <p class="muted small" style="margin-top:16px">Har du själv en uppfart här?
        <button class="lnk" onclick="go('hyrut')">Lägg ut den</button> – den första på orten
        får alla förare som redan väntar.</p></div>`;
  }
  return `<div class="empty"><div class="ic">${I("search", 34)}</div>
    <h3>Inga platser matchar</h3>
    <p class="dim small" style="margin-top:8px">Ta bort ett filter eller byt tidsläge.</p>
    <button class="btn btn-sm btn-p" style="margin-top:16px" onclick="clearFilters()">Rensa filter</button></div>`;
}

/* Bevaka orten man faktiskt står på, inte den man råkar titta på. */
function bevakaHar() {
  const a = (S.utanfor && S.utanfor.omrade) || AREAS.find(x => x.id === S.area);
  if (!a) return;
  if (!WATCH.includes(a.id)) { WATCH.push(a.id); persist(); }
  toast("Vi hör av oss när " + a.name + " öppnar", "bell");
  render();
}
/* Prissidan lovar att allt vi tar syns innan man klickar. Då måste det
   också stå här, ovanför listan – inte först inne på platsen. */
function prisnotisHTML() {
  return `<p class="muted small" style="margin:2px 0 12px">
    Priserna är värdens. Till kommer ${Math.round(FEES.driverPct * 100)} % serviceavgift
    och ${kr(FEES.tryggShort)} trygghetsgaranti – vid månadshyra
    ${Math.round(FEES.driverPctMonthly * 100)} % och ${kr(FEES.tryggMonthly)}.</p>`;
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
    b.classList.toggle("on", ["timme", "dygn", "vecka", "manad", "evenemang", "sasong"][k] === m));
  refreshResults();
}
function tog(k, btn) { S[k] = !S[k]; btn.classList.toggle("on"); refreshResults(); }
function clearFilters() {
  S.fNu = S.fCharge = S.fGarage = S.fSecure = S.fBig = false; S.maxPrice = 0; S.q = "";
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
    const mw2 = document.querySelector(".mapwrap"); if (mw2) mw2.classList.remove("has-card");
    S.selSpot = null;
  }
  if (S.route === "hem") {
    const hb = document.querySelector(".spotlist");
    if (hb) hb.innerHTML = list.length ? list.slice(0, 6).map(spotRow).join("") : emptyHTML();
  }
  if (PMap.alive()) PMap.setSpots(list, makeStateOf(list), S.selSpot);
}
function toggleFav(id, btn) {
  const i = FAVS.indexOf(id);
  if (i < 0) { FAVS.push(id); toast("Sparad", "heart"); } else { FAVS.splice(i, 1); toast("Borttagen", "heart"); }
  persist(); refreshResults();
}
/* ============================================================
   Frågan till styrelsen

   Appen lovade på fyra ställen att vi skickar en färdig fråga
   åt värden. Det gjorde vi inte. Nu finns den på riktigt.
   ============================================================ */
function brfBrevText(namn, adress) {
  const n = (namn || "").trim() || "[ditt namn]";
  const a = (adress || "").trim() || "[din adress]";
  return "Hej,\n\n" +
    "Jag heter " + n + " och bor på " + a + ".\n\n" +
    "Jag vill fråga om tillåtelse att hyra ut min parkeringsplats de tider jag inte " +
    "använder den själv, via tjänsten Parkla.\n\n" +
    "Några saker som kan vara bra att veta för styrelsen:\n\n" +
    "• En parkeringsplats utomhus är juridiskt ett lägenhetsarrende. Uthyrning i andra " +
    "hand kräver därför föreningens tillstånd, och det är därför jag frågar.\n" +
    "• Alla förare legitimerar sig innan de kan boka. Ingen kan parkera anonymt.\n" +
    "• Varje bokning omfattas av Parklas trygghetsgaranti, som ersätter skador på " +
    "egendom upp till 25 000 kr utan självrisk.\n" +
    "• Jag använder bara min egen plats, aldrig gemensamma ytor.\n" +
    "• Säger styrelsen ja kan beslutet gälla alla i föreningen, och föreningen kan " +
    "välja att ta en andel av intäkterna till kassan.\n\n" +
    "Jag svarar gärna på frågor, och kan ta upp det på nästa möte om ni vill.\n\n" +
    "Med vänlig hälsning\n" + n;
}

function openBrfBrev(franWizard) {
  openSheet(sheetHead("Frågan till styrelsen") + `<div class="sheet-b stack">
    ${franWizard ? `<button class="btn btn-sm" style="align-self:flex-start" onclick="closeSheet();renderWizard()">${I("arrow", 14)} Tillbaka till annonsen</button>` : ""}
    <p class="dim">Bor du i bostadsrätt behöver du styrelsens ja. Här är en färdig
      fråga – fyll i namn och adress, så skriver vi resten.</p>
    <div class="field"><label>Ditt namn</label>
      <input class="inp" id="brf-namn" placeholder="Anna Andersson" oninput="brfUppdatera()"></div>
    <div class="field"><label>Din adress</label>
      <input class="inp" id="brf-adr" placeholder="Storgatan 1, Stockholm" oninput="brfUppdatera()"></div>
    <div class="field"><label>Brevet</label>
      <textarea class="inp" id="brf-text" rows="12" oninput="this.dataset.rord='1'"
        style="line-height:1.55;resize:vertical">${esc(brfBrevText("", ""))}</textarea></div>
    <button class="btn btn-p btn-block btn-lg" onclick="brfKopiera()">${I("copy", 17)} Kopiera texten</button>
    <button class="btn btn-block" onclick="brfMejla()">${I("message", 16)} Öppna i mejlprogrammet</button>
    <p class="muted small">Texten är din – ändra den precis som du vill innan du skickar.</p>
  </div>`);
}

/* Har värden själv skrivit i brevet skriver vi aldrig över det. */
function brfUppdatera() {
  const t = document.getElementById("brf-text");
  if (!t || t.dataset.rord === "1") return;
  t.value = brfBrevText(document.getElementById("brf-namn").value,
                        document.getElementById("brf-adr").value);
}

function brfKopiera() {
  const t = document.getElementById("brf-text");
  navigator.clipboard.writeText(t.value)
    .then(() => toast("Kopierat – klistra in i mejlet", "check"))
    .catch(() => { t.select(); toast("Markerat – kopiera med Ctrl+C", "info"); });
}

function brfMejla() {
  const t = document.getElementById("brf-text");
  location.href = "mailto:?subject=" +
    encodeURIComponent("Fråga om uthyrning av min parkeringsplats") +
    "&body=" + encodeURIComponent(t.value);
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
    <div class="field"><label>Välj stad</label>
      <div class="pickrows">
        ${AREAS.map(x => `<button class="pickrow ${x.id === S.area ? "on" : ""}" onclick="pickCity('${x.id}')">
          <span class="mark">${I("check", 15)}</span>
          <span class="t"><b>${esc(x.name)}</b><span>${allSpots().filter(z => z.area === x.id).length} platser</span></span>
          ${x.id === S.area ? '<span class="tag green">Vald</span>' : ""}</button>`).join("")}
      </div></div>

    ${parts.length ? `<div class="field"><label>Var i ${esc(a.name.split(" ")[0])}?</label>
      <div class="pickrows">
        ${parts.map((p, i) => {
          const on = (S.part || parts[0][0]) === p[0];
          return `<button class="pickrow ${on ? "on" : ""}" onclick="pickPart(${i})">
            <span class="mark">${I("check", 15)}</span>
            <span class="t"><b>${esc(p[0])}</b></span>
            ${on ? '<span class="tag green">Vald</span>' : ""}</button>`; }).join("")}
      </div></div>` : ""}

    <button class="btn btn-p btn-block btn-lg" onclick="closeSheet();render()">Visa platserna</button>
  </div>`);
}
/* Vilket område ligger närmast en punkt, och hur långt bort? */
function narmasteOmrade(ll) {
  let bast = null, km = Infinity;
  AREAS.forEach(a => { const d = distKm(ll, a.c); if (d < km) { km = d; bast = a; } });
  return { omrade: bast, km: Math.round(km) };
}

/* Längre bort än så här räcker det inte att sortera –
   då finns Parkla helt enkelt inte där användaren står. */
const UTANFOR_KM = 45;

function satPosition(ll, etikett) {
  const n = narmasteOmrade(ll);
  S.near = ll; S.nearLabel = etikett; S.part = null; S.sort = "avstand";
  S.utanfor = n.km > UTANFOR_KM ? n : null;
  /* Listan och kartan MÅSTE visa samma stad. */
  if (n.omrade) S.area = n.omrade.id;
  return n;
}

function usePlacePos() {
  toast("Letar upp var du är …", "target");
  PMap.locate((ll, err) => {
    if (!ll) { toast(err || "Kunde inte hitta dig. Tillåt platstjänster i webbläsaren.", "info"); return; }
    const n = satPosition(ll, "Nära mig");
    closeSheet(); render();
    toast(S.utanfor
      ? "Närmast dig är " + n.omrade.name + ", " + n.km + " km bort"
      : "Visar platser nära dig", S.utanfor ? "info" : "check");
  });
}
function pickCity(id) {
  S.area = id; SET.city = id; S.utanfor = null; saveSettings();
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
    const n = satPosition(ll, "Min position");
    const box = document.getElementById("mapq"); if (box) box.value = "Min position";
    refreshResults();
    toast(S.utanfor
      ? "Parkla finns inte här än – närmast är " + n.omrade.name
      : "Sorterat efter närmast dig", S.utanfor ? "info" : "check");
  });
}
function pickSpot(id) {
  S.selSpot = id;
  const s = allSpots().find(x => x.id === id); if (!s) return;
  const _l = baseList(); PMap.setSpots(_l, makeStateOf(_l), id);
  PMap.flyTo(s.ll, Math.max(15, 15));
  const box = document.getElementById("mcard");
  if (!box) return;
  const mw = document.querySelector(".mapwrap"); if (mw) mw.classList.add("has-card");
  box.innerHTML = `<div class="mcard" onclick="openSpot(${idArg(s.id)})">
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
    const inApp = allSpots().filter(s => (s.nm + " " + s.ad).toLowerCase().includes(v.toLowerCase())).slice(0, 3);
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
  satPosition(r.ll, r.label); S.q = "";
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
  S.q = ""; S.near = null; S.nearLabel = ""; S.sort = "pris"; S.utanfor = null;
  const box = document.getElementById("mapq"); if (box) box.value = "";
  const r = document.getElementById("mres"); if (r) r.innerHTML = "";
  const ms = document.querySelector(".msearch"); if (ms) ms.classList.remove("filled");
  const area = AREAS.find(a => a.id === S.area) || AREAS[0];
  PMap.flyTo(area.c, area.z);
  refreshResults();
}

/* ---- filter-sheet med laggfritt reglage ---- */
function openFilters() {
  const all = allSpots().filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
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
  S.bk = null; S.blockFor = null;
  const s = allSpots().find(x => x.id === id); if (!s) return;
  S.selSpot = id;
  const p = priceFor(s, S.mode) || s.d || s.m;
  const f = feeSplit(p, S.mode);
  const revs = (typeof reviewsWithMine === "function") ? reviewsWithMine(id) : reviewsFor(id);
  const sim = allSpots().filter(x => x.area === s.area && x.id !== s.id && priceFor(x, S.mode) > 0).slice(0, 3);
  openSheet(sheetHead(s.nm) + `<div class="sheet-b">
    <div class="gallery">${s.photo
      ? `<div class="g photo"><img src="${s.photo}" alt="Foto på ${esc(s.nm)}"></div>`
      : ["driveway", "camera", "map", "moon"].map(g => `<div class="g">${I(g, 40)}</div>`).join("")}</div>
    <div class="row wrap" style="margin-top:14px">
      <span class="tag">${esc(s.type)}</span>
      ${s.charge ? `<span class="tag green">${I("bolt", 11)} Laddbox</span>` : ""}
      ${s.walk ? `<span class="tag">${s.walk} min att gå</span>` : ""}
      ${ratingHTML(s)}
    </div>
    <p class="dim small" style="margin-top:11px">${esc(s.ad)} · Passar ${esc(s.size)}</p>
    <div class="row wrap" style="margin-top:9px">${s.feat.map(x => `<span class="tag">${esc(x)}</span>`).join("")}</div>
    <button class="btn btn-sm" style="margin-top:14px" onclick="shareSpot(${idArg(s.id)})">${I("share", 15)} Dela platsen</button>

    <div class="panel pad" style="margin-top:18px;background:var(--paper-2)">
      <div class="row"><span class="rev-av av" style="width:38px;height:38px;border-radius:50%;background:var(--pine);color:var(--on-dark);display:grid;place-items:center;font-weight:600">${esc(s.host[0])}</span>
        <div><b>${esc(s.host)}</b>${isGrundare(s) ? " " + grundareBadge() : ""}<div class="muted small">Värd sedan ${s.hostSince} · svarar oftast inom 10 minuter</div></div></div>
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

    <h4 style="margin:22px 0 8px">Vilka dagar är lediga?</h4>
    <div id="calbox">${(S.cal = null, calendarHTML(s))}</div>

    <h4 style="margin:22px 0 2px">Vad andra säger</h4>
    <div>${revs.map(r => `<div class="rev">
      <div class="who"><span class="av">${esc(r.who[0])}</span><b>${esc(r.who)}</b>
      <span style="margin-left:auto;color:var(--brass);display:flex;gap:1px">${IF("star", 12).repeat(r.r)}</span></div>
      <p>${esc(r.t)}</p><span class="d">${esc(r.d)}</span></div>`).join("")}</div>

    ${sim.length ? `<h4 style="margin:22px 0 4px">Liknande i närheten</h4>
      <div class="spotlist">${sim.map(spotRow).join("")}</div>` : ""}

    <div class="sticky-cta">
      ${nowFree(s) && !isLive() ? `
        <button class="btn btn-g btn-block btn-lg" onclick="startNow(${idArg(s.id)})">
          ${I("car", 19)} Parkera här nu · ${kr(timPris(s))}/tim</button>
        <p class="muted small center" style="margin-top:8px">Ingen bokning, ingen väntan. Vi håller platsen i ${HALL_MINUTER} minuter medan du kör dit.</p>
        <div class="rule" style="margin:16px 0"></div>` : ""}
      ${isLive() && !s.mine
        ? `<button class="btn btn-p btn-block btn-lg" onclick="openLeadDriver()">
             ${I("bell", 17)} Säg till när det finns platser här</button>
           <p class="muted small center" style="margin-top:10px">Den här platsen är ett exempel på hur en annons ser ut. Vi öppnar för bokning när utbudet finns på plats.</p>`
        : `<button class="btn btn-p btn-block btn-lg" onclick="startBooking(${idArg(s.id)})">
             Boka – ${kr(f.driverTotal)}${I("arrow", 17, "arw")}</button>`}
    </div>
  </div>`);
}
function calendarHTML(s, opts) {
  opts = opts || {};
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  if (!S.cal) S.cal = { y: idag.getFullYear(), m: idag.getMonth() };
  const y = S.cal.y, m = S.cal.m;

  const forsta = new Date(y, m, 1);
  const antalDagar = new Date(y, m + 1, 0).getDate();
  const start = (forsta.getDay() + 6) % 7;              /* måndag först */
  const manad = forsta.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
  const veckodagar = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  /* Går det att backa? Aldrig till en månad som redan passerat. */
  const kanBaka = new Date(y, m, 1) > new Date(idag.getFullYear(), idag.getMonth(), 1);

  let rutor = "";
  for (let i = 0; i < start; i++) rutor += '<span class="d tom"></span>';
  for (let d = 1; d <= antalDagar; d++) {
    const datum = new Date(y, m, d);
    const passerad = datum < idag;
    const upptagen = !passerad && dayIsBooked(s, y, m, d);
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const vald = opts.pick && S.bk && S.bk.date === iso;
    const kl = passerad ? "d passerad" : upptagen ? "d upptagen" : vald ? "d ledig vald" : "d ledig";
    if (opts.block) {
      const l = LISTINGS.find(x => x.id === opts.listingId);
      const special = l && l.prices && l.prices[iso];
      const dagpris = l ? dayPriceFor(l, iso) : 0;
      const ev = opts.spot ? eventOn(opts.spot, iso) : null;
      const kl2 = (passerad ? "d passerad" : upptagen ? "d stangd" : "d ledig")
        + (special && !upptagen && !passerad ? " special" : "")
        + (ev && !passerad ? " harevent" : "") + " medpris";
      const inne = `<i>${d}</i>${passerad ? "" : `<u>${num(dagpris)}</u>`}${ev && !passerad ? '<b class="evdot"></b>' : ""}`;
      rutor += passerad
        ? `<span class="${kl2}">${inne}</span>`
        : `<button class="${kl2}" onclick="${S.calMode === "pris" ? `openDayPrice(${opts.listingId},'${iso}')` : `toggleDay2(${opts.listingId},'${iso}')`}"
             aria-label="${d} ${manad}, ${upptagen ? "stängd" : dagpris + " kronor"}">${inne}</button>`;
    } else {
      const klickbar = opts.pick && !passerad && !upptagen;
      rutor += klickbar
        ? `<button class="${kl}" onclick="pickDay('${iso}')" aria-label="${d} ${manad}, ledig">${d}</button>`
        : `<span class="${kl}" aria-label="${d} ${manad}, ${passerad ? "passerad" : upptagen ? "upptagen" : "ledig"}">${d}</span>`;
    }
  }

  const lediga = freeLeft(s, y, m, (y === idag.getFullYear() && m === idag.getMonth()) ? idag.getDate() : 1);

  return `<div class="cal2">
    ${opts.block ? `<div class="seg calmode">
      <button class="${S.calMode !== "pris" ? "on" : ""}" onclick="S.calMode='stang';redrawCal()">${I("lock", 15)} Stäng dagar</button>
      <button class="${S.calMode === "pris" ? "on" : ""}" onclick="S.calMode='pris';redrawCal()">${I("wallet", 15)} Sätt pris</button>
    </div>` : ""}
    <div class="cal2-h">
      <button class="nav" onclick="calStep(-1)" ${kanBaka ? "" : "disabled"} aria-label="Föregående månad">${I("chevron", 16)}</button>
      <b>${manad.charAt(0).toUpperCase() + manad.slice(1)}</b>
      <button class="nav next" onclick="calStep(1)" aria-label="Nästa månad">${I("chevron", 16)}</button>
    </div>
    <div class="cal2-w">${veckodagar.map(d => `<span>${d}</span>`).join("")}</div>
    <div class="cal2-g">${rutor}</div>
    ${opts.block && S.calMode === "pris" ? `<div class="calquick">
      <button class="btn btn-sm" onclick="setMonthPrice(${opts.listingId},'helg')">${I("spark", 14)} Höj helgpriset 25 %</button>
      <button class="btn btn-sm" onclick="setMonthPrice(${opts.listingId},'alla')">Sätt pris för hela månaden</button>
      <button class="btn btn-sm" onclick="applyAllEventPrices(${opts.listingId})">${I("ticket", 14)} Matchdagar</button>
      <button class="btn btn-sm" onclick="setMonthPrice(${opts.listingId},'rensa')">Återställ</button>
    </div>` : ""}
    <div class="cal2-sum">${opts.block
      ? (S.calMode === "pris"
          ? `Ordinarie pris <b>${kr(baseDayPrice(LISTINGS.find(x => x.id === opts.listingId) || { pris: 0 }))}</b> per dygn. Tryck på en dag för att ändra.`
          : (lediga > 0 ? `Du har <b>${lediga} dagar öppna</b> den här månaden` : `Du har <b>stängt hela månaden</b>`))
      : (lediga > 0 ? `<b>${lediga} lediga dagar</b> kvar den här månaden`
                    : `<b>Inga lediga dagar</b> kvar den här månaden – prova nästa`)}</div>
    <div class="cal2-l">
      <span><i class="l-ledig"></i>${opts.block ? "Öppen" : "Ledig"}</span>
      <span><i class="l-upptagen"></i>${opts.block ? "Du har stängt" : "Upptagen"}</span>
      ${opts.block && S.calMode === "pris" ? '<span><i class="l-special"></i>Eget pris</span>' : ""}
      ${opts.block ? '<span><i class="l-event"></i>Evenemang</span>' : ""}
      ${opts.pick ? '<span><i class="l-vald"></i>Vald</span>' : ""}
    </div>
  </div>`;
}
function calStep(d) {
  if (!S.cal) return;
  let m = S.cal.m + d, y = S.cal.y;
  if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
  S.cal = { y, m };
  redrawCal();
}
function pickDay(iso) {
  if (!S.bk) return;
  S.bk.date = iso;
  redrawCal();
  patchBkSum();
  const d = new Date(iso);
  toast("Vald dag: " + d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" }), "calendar");
}
function redrawCal() {
  const box = document.getElementById("calbox");
  if (!box) return;
  if (S.blockFor != null) {
    const l = LISTINGS.find(x => x.id === S.blockFor);
    if (l) box.innerHTML = calendarHTML(listingToSpot(l), { block: true, listingId: l.id, spot: listingToSpot(l) });
    return;
  }
  const id = S.bk ? S.bk.id : S.selSpot;
  const sp = allSpots().find(x => x.id === id);
  if (sp) box.innerHTML = calendarHTML(sp, { pick: !!S.bk });
}

/* Värden stänger eller öppnar en dag. */
function toggleDay2(listingId, iso) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  l.blocked = l.blocked || [];
  const i = l.blocked.indexOf(iso);
  if (i > -1) l.blocked.splice(i, 1); else l.blocked.push(iso);
  persist(); redrawCal();
  const d = new Date(iso).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  toast(i > -1 ? "Öppnade " + d : "Stängde " + d, i > -1 ? "check" : "lock");
}

/* Värdens kalender – samma vy som föraren ser, fast redigerbar. */
function openBlockCal(listingId) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  S.blockFor = listingId; S.cal = null;
  const antal = (l.blocked || []).filter(d => new Date(d) >= new Date(new Date().toDateString())).length;
  openSheet(sheetHead("Dina dagar och priser") + `<div class="sheet-b stack">
    <p class="dim">${esc(l.ad)}</p>
    ${eventTipsHTML(l)}
    <div class="hint" id="calhint">${I("info", 17)}<div>Välj läge ovanför kalendern: stäng dagar du behöver själv, eller sätt ett eget pris på enskilda dagar.</div></div>
    <div id="calbox">${calendarHTML(listingToSpot(l), { block: true, listingId: l.id, spot: listingToSpot(l) })}</div>
    ${antal ? `<div class="callout">Du har stängt <b>${antal} dagar</b> framåt.
      <button class="btn btn-sm" style="margin-top:10px" onclick="clearBlocks(${l.id})">Öppna alla igen</button></div>` : ""}
    <button class="btn btn-p btn-block btn-lg" onclick="S.blockFor=null;closeSheet();render()">Klart</button>
  </div>`);
}
/* Tips till värden om evenemang som är värda att höja priset inför. */
function eventTipsHTML(l) {
  const sp = listingToSpot(l);
  const evs = eventsNear(sp);
  if (!evs.length) return "";
  const kvar = evs.filter(e => (l.prices || {})[e.date] !== eventPrice(l, e));
  const total = evs.reduce((a, e) => a + Math.max(0, eventPrice(l, e) - baseDayPrice(l)), 0);
  return `<div class="evtips">
    <div class="row" style="align-items:flex-start;gap:12px">
      <span class="ic">${I("ticket", 20)}</span>
      <div style="flex:1;min-width:0">
        <b>${evs.length} evenemang nära din plats</b>
        <span>De dagarna är folk beredda att betala mer. Höjer du priset på alla kan du tjäna
        <b>${kr(total)}</b> extra.</span>
      </div>
    </div>
    <div class="evlist">
      ${evs.map(e => {
        const p = eventPrice(l, e);
        const satt = (l.prices || {})[e.date] === p;
        return `<div class="evrow">
          <div class="t"><b>${esc(e.name)}</b>
            <span>${esc(e.date)} · ${esc(e.venue)}, ${kmText(e.km)} · ${e.crowd.toLocaleString("sv-SE")} personer</span></div>
          ${satt ? `<span class="tag green">${kr(p)} satt</span>`
                 : `<button class="btn btn-sm btn-g" onclick="applyEventPrice(${l.id},'${e.id}')">Höj till ${kr(p)}</button>`}
        </div>`; }).join("")}
    </div>
    ${kvar.length > 1 ? `<button class="btn btn-p btn-block btn-sm" style="margin-top:12px"
      onclick="applyAllEventPrices(${l.id})">Höj priset alla ${kvar.length} dagarna</button>` : ""}
  </div>`;
}
function applyEventPrice(listingId, eventId) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  const ev = eventsNear(listingToSpot(l)).find(e => e.id === eventId); if (!ev) return;
  l.prices = l.prices || {};
  l.prices[ev.date] = eventPrice(l, ev);
  persist(); openBlockCal(listingId);
  toast(esc(ev.name) + ": " + kr(l.prices[ev.date]), "ticket");
}
function applyAllEventPrices(listingId) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  const evs = eventsNear(listingToSpot(l));
  l.prices = l.prices || {};
  let n = 0, extra = 0;
  evs.forEach(e => {
    const p = eventPrice(l, e);
    if (l.prices[e.date] !== p) { extra += Math.max(0, p - baseDayPrice(l)); n++; }
    l.prices[e.date] = p;
  });
  persist(); openBlockCal(listingId);
  toast(n + " evenemangsdagar höjda, " + kr(extra) + " extra", "spark");
}

/* Sätt pris för en enskild dag. */
function openDayPrice(listingId, iso) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  const bas = baseDayPrice(l), nu = dayPriceFor(l, iso);
  const d = new Date(iso);
  const namn = d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  const ev = eventOn(listingToSpot(l), iso);
  const evPris = ev ? eventPrice(l, ev) : 0;
  openSheet(sheetHead(namn.charAt(0).toUpperCase() + namn.slice(1)) + `<div class="sheet-b stack">
    ${ev ? `<div class="evbanner">
      <span class="ic">${I("ticket", 20)}</span>
      <div><b>${esc(ev.name)}</b>
      <span>${esc(ev.venue)}, ${kmText(ev.km)} härifrån · ${ev.crowd.toLocaleString("sv-SE")} personer kl ${esc(ev.time)}</span></div>
      <button class="btn btn-sm btn-g" onclick="document.getElementById('dp').value=${evPris};dpHint(${bas})">${kr(evPris)}</button>
    </div>` : ""}
    <div class="field"><label>Pris för den här dagen (kr)</label>
      <input class="inp mono" id="dp" value="${nu}" inputmode="numeric" style="font-size:1.5rem;text-align:center"
        oninput="dpHint(${bas})"></div>
    <p class="muted small center" id="dphint">${nu === bas ? "Samma som ditt ordinarie pris" : nu > bas ? `${Math.round((nu / bas - 1) * 100)} % över ordinarie ${kr(bas)}` : `${Math.round((1 - nu / bas) * 100)} % under ordinarie ${kr(bas)}`}</p>
    <div class="row wrap" style="justify-content:center">
      ${[["Ordinarie", bas], ["+25 %", Math.round(bas * 1.25 / 5) * 5], ["+50 %", Math.round(bas * 1.5 / 5) * 5], ["Dubbelt", bas * 2]]
        .concat(ev ? [["Matchpris", evPris]] : [])
        .map(([t2, v]) => `<button class="chip" onclick="document.getElementById('dp').value=${v};dpHint(${bas})">${t2}</button>`).join("")}
    </div>
    <div class="hint">${I("info", 17)}<div>Matchdagar och storhelger är värda mer. Höjer du priset de dagarna tjänar du mer utan att platsen står tom fler dagar.</div></div>
    <button class="btn btn-p btn-block btn-lg" onclick="saveDayPrice(${listingId},'${iso}',${bas})">Spara priset</button>
    ${(l.prices && l.prices[iso]) ? `<button class="btn btn-block" onclick="clearDayPrice(${listingId},'${iso}')">Ta bort specialpriset</button>` : ""}
  </div>`);
}
function dpHint(bas) {
  const v = +(document.getElementById("dp") || {}).value || 0;
  const h = document.getElementById("dphint"); if (!h) return;
  h.textContent = !v ? "Skriv ett pris"
    : v === bas ? "Samma som ditt ordinarie pris"
    : v > bas ? Math.round((v / bas - 1) * 100) + " % över ordinarie " + kr(bas)
    : Math.round((1 - v / bas) * 100) + " % under ordinarie " + kr(bas);
}
function saveDayPrice(listingId, iso, bas) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  const v = +(document.getElementById("dp") || {}).value || 0;
  if (v < 10) { toast("Sätt ett rimligt pris", "info"); return; }
  l.prices = l.prices || {};
  if (v === bas) delete l.prices[iso]; else l.prices[iso] = v;
  persist(); openBlockCal(listingId);
  toast("Priset är sparat: " + kr(v), "wallet");
}
function clearDayPrice(listingId, iso) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  if (l.prices) delete l.prices[iso];
  persist(); openBlockCal(listingId); toast("Tillbaka till ordinarie pris", "check");
}
/* Snabbval för hela den månad man tittar på. */
function setMonthPrice(listingId, vad) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  const y = S.cal.y, m = S.cal.m, dagar = new Date(y, m + 1, 0).getDate();
  const bas = baseDayPrice(l);
  l.prices = l.prices || {};
  if (vad === "rensa") {
    for (let d = 1; d <= dagar; d++) delete l.prices[isoOf(y, m, d)];
    persist(); openBlockCal(listingId); toast("Månaden är återställd", "check"); return;
  }
  if (vad === "helg") {
    let n = 0;
    for (let d = 1; d <= dagar; d++) {
      const wd = new Date(y, m, d).getDay();
      if (wd === 0 || wd === 6) { l.prices[isoOf(y, m, d)] = Math.round(bas * 1.25 / 5) * 5; n++; }
    }
    persist(); openBlockCal(listingId); toast(n + " helgdagar höjda 25 %", "spark"); return;
  }
  openSheet(sheetHead("Pris för hela månaden") + `<div class="sheet-b stack">
    <div class="field"><label>Pris per dygn (kr)</label>
      <input class="inp mono" id="mp" value="${bas}" inputmode="numeric" style="font-size:1.5rem;text-align:center"></div>
    <p class="muted small center">Gäller alla dagar i ${new Date(y, m, 1).toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}.</p>
    <button class="btn btn-p btn-block btn-lg" onclick="applyMonthPrice(${listingId})">Sätt priset</button>
  </div>`);
}
function applyMonthPrice(listingId) {
  const l = LISTINGS.find(x => x.id === listingId); if (!l) return;
  const v = +(document.getElementById("mp") || {}).value || 0;
  if (v < 10) { toast("Sätt ett rimligt pris", "info"); return; }
  const y = S.cal.y, m = S.cal.m, dagar = new Date(y, m + 1, 0).getDate();
  const bas = baseDayPrice(l);
  l.prices = l.prices || {};
  for (let d = 1; d <= dagar; d++) {
    const iso = isoOf(y, m, d);
    if (v === bas) delete l.prices[iso]; else l.prices[iso] = v;
  }
  persist(); openBlockCal(listingId); toast("Priset gäller hela månaden", "wallet");
}

function clearBlocks(id) {
  const l = LISTINGS.find(x => x.id === id); if (!l) return;
  l.blocked = []; persist(); openBlockCal(id); toast("Alla dagar är öppna igen", "check");
}

/* ---- bokning ---- */
function startBooking(id) {
  S.blockFor = null;
  S.bk = { id, step: 1, qty: 1, min: 135, start: "09:00", attest: false, charge: false, extraCar: false, code: "", pay: "swish",
           reg: LS.get("lastreg", ""), date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) };
  renderBooking();
}
function bkTotals() {
  const s = allSpots().find(x => x.id === S.bk.id), b = S.bk;
  const unit = priceOnDate(s, b.date, S.mode) || priceFor(s, S.mode) || s.d || s.m;
  let base, chargeCost;
  if (S.mode === "sasong") { base = unit; chargeCost = 0; }
  else if (S.mode === "timme") {
    /* Minutbaserat: första timmen alltid, sedan påbörjad halvtimme. Samma regel som kör-in. */
    const min = b.min || 135;
    const deb = Math.max(60, Math.ceil(min / 30) * 30);
    base = Math.round(unit * deb / 60);
    chargeCost = b.charge ? 55 * Math.ceil(min / 60) : 0;
  } else {
    base = unit * b.qty;
    chargeCost = b.charge ? (S.mode === "manad" ? 380 : 55) * b.qty : 0;
  }
  const extraCost = b.extraCar ? Math.round(base * 0.6) : 0;
  const sub = base + chargeCost + extraCost;
  const råDisc = b.code.toUpperCase() === "PARKLA50" ? Math.round(sub * .5) : b.code.toUpperCase() === "GRANNE" ? 100 : 0;
  const disc = Math.min(sub, råDisc);   /* aldrig under noll — en 23-kronorsparkering med GRANNE gav -77 kr */
  return Object.assign({ unit, base, chargeCost, extraCost, disc }, feeSplit(sub - disc, S.mode));
}
const PRESETS  = { timme:[1,2,4,8], dygn:[1,2,3,7], vecka:[1,2,4], manad:[1,3,6,12], evenemang:[1,2,3] };
const QTY_WORD = { timme:"timmar", dygn:"dygn", vecka:"veckor", manad:"m\u00e5nader", sasong:"s\u00e4songer", evenemang:"platser" };
const QTY_ONE  = { timme:"timme",  dygn:"dygn", vecka:"vecka",  manad:"m\u00e5nad", sasong:"s\u00e4song", evenemang:"plats" };

/* "3 manad" i bokningskortet var lagesnamnet, inte ett ord. */
function qtyText(b) {
  if ((b.mode || S.mode) === "timme" && b.min) return tidText(b.min);
  const n = b.qty || 1;
  return n + " " + (n === 1 ? (QTY_ONE[b.mode] || "dygn") : (QTY_WORD[b.mode] || "dygn"));
}

function renderBooking() {
  const s = allSpots().find(x => x.id === S.bk.id), b = S.bk, T = bkTotals();
  const word = QTY_WORD[S.mode] || "dygn", one = QTY_ONE[S.mode] || "dygn";
  const dots = n => `<div class="progress">${[1,2,3].map(k => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</div>`;

  /* ---------- Steg 1: n\u00e4r? ---------- */
  if (b.step === 1) {
    openSheet(sheetHead(s.nm) + `<div class="sheet-b stack">
      ${dots(1)}
      <div>
        <h3 style="font-size:1.3rem">N\u00e4r vill du parkera?</h3>
        <p class="muted small" style="margin-top:5px">${needsApproval(s, S.mode)
          ? "Berätta när du vill stå. Pengarna dras först när värden sagt ja."
          : "Berätta när du vill stå. Betalningen dras direkt och koden kommer på en gång."}</p>
      </div>

      <div class="field"><label>Fr\u00e5n vilken dag?</label>
        <div id="calbox">${(S.cal = null, calendarHTML(s, { pick: true }))}</div>
        </div>

      ${S.mode === "timme" ? `
      <div class="field"><label>Från vilken tid?</label>
        <select class="inp" id="bktime" onchange="S.bk.start=this.value;patchBkSum()">
          ${timeOptions(b.start)}
        </select></div>
      <div class="field"><label>Hur länge?</label>
        <div class="timewheel" id="bkwheel">
          <div class="tw-sel"></div>
          <div class="tw-track" id="twtrack">
            ${DUR_STEPS.map(mi => `<div class="tw-opt" data-min="${mi}">${tidText(mi)}</div>`).join("")}
          </div>
        </div>
        <p class="muted small" style="margin-top:9px" id="bkspan">${timeSpanText(b)}</p>
      </div>` : ""}

      ${S.mode === "sasong" ? `
      <div class="field"><label>Vilken säsong?</label>
        <div class="stack tight">
          ${Object.values(SEASON).map(x => `<button class="seasoncard ${S.season === x.id ? "on" : ""}"
            onclick="pickSeason('${x.id}')">
            <span class="t"><b>${x.label}</b><span>${x.period} · ${x.months} månader</span></span>
            <span class="p">${kr(seasonPrice(s, x.id))}</span></button>`).join("")}
        </div></div>` : `
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
        </div></div>`}

      <div class="bigprice" id="bkbig">${bigPriceHTML(T)}</div>

      <div class="bookmode ${needsApproval(s, S.mode) ? "ask" : "now"}">
        ${needsApproval(s, S.mode) ? I("clock", 19) : I("bolt", 19)}
        <div><b>${needsApproval(s, S.mode) ? "Värden svarar på din förfrågan" : "Du får platsen direkt"}</b>
        <span>${needsApproval(s, S.mode)
          ? "Oftast inom en timme. Du betalar först när värden sagt ja."
          : "Ingen väntan. Koden till platsen kommer så fort du bokat."}</span></div>
      </div>

      <div class="sticky-cta">
        <button class="btn btn-p btn-block btn-lg" onclick="bkStep(2)">Forts\u00e4tt${I("arrow", 17, "arw")}</button>
      </div>
    </div>`);
    setTimeout(initTimeWheel, 30);
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
      <div class="t"><b>${esc(s.nm)}</b><span>${S.mode === "timme" ? tidText(b.min || 135) : b.qty + " " + (b.qty === 1 ? one : word)} fr\u00e5n ${esc(b.date)}</span></div>
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

    ${S.mode === "sasong" ? `
    <div class="attest ${b.attest ? "on" : ""}" onclick="bkAttest(this)" role="checkbox" aria-checked="${!!b.attest}">
      <span class="box">${I("check", 15)}</span>
      <span class="t"><b>Jag intygar att fordonet är försäkrat</b>
      <span>Du hyr en yta – du lämnar inte in bilen. Värden tar aldrig emot fordonet och har aldrig nyckeln.
      Brand, stöld och skadegörelse på fordonet går på din egen försäkring. Är bilen avställd räcker en avställningsförsäkring.</span></span>
    </div>
    <button class="btn btn-sm" style="align-self:flex-start" data-go="vinterforvar">Läs hela ansvarsfördelningen</button>` : ""}

    <div class="panel pad" id="bksum">${bkSumHTML(T)}</div>

    <div class="sticky-cta">
      <button class="btn btn-p btn-block btn-lg" ${S.mode === "sasong" && !b.attest ? "disabled" : ""}
        onclick="confirmBooking()">${I("shield", 18)} ${esc(t("book"))}</button>
      <p class="muted small center" style="margin-top:10px">${S.mode === "sasong"
        ? (b.attest ? "Uppställningsavtalet skickas till din e-post." : "Kryssa i intyget ovan för att kunna boka.")
        : "Avboka gratis fram till 24 timmar innan."}</p>
    </div>
  </div>`);
}

function bigPriceHTML(T) {
  return `<span class="lbl">Du betalar</span>
    <b>${kr(T.driverTotal)}</b>
    <span class="muted small">${num(T.unit)} ${sym()} ${esc(unitLong(S.mode))}, avgifter inr\u00e4knade</span>`;
}
function bkStep(n) {
  /* S.bk.date ar enda sanningen — hidden-inputen som skrev over den ar borta. */
  const r = document.getElementById("regnr");  if (r) S.bk.reg = r.value;
  S.bk.step = n; renderBooking();
}
/* EasyPark-tidshjul: minuter i 15-min-steg, från 30 min till 12 tim. */
const DUR_STEPS = (function () { const a = []; for (let mi = 30; mi <= 720; mi += 15) a.push(mi); return a; })();
function initTimeWheel() {
  const track = document.getElementById("twtrack"); if (!track) return;
  const opts = [...track.children], H = 44;
  const paint = i => opts.forEach((o, k) => o.classList.toggle("on", k === i));
  let cur = DUR_STEPS.indexOf(S.bk.min || 135); if (cur < 0) cur = DUR_STEPS.indexOf(135);
  track.scrollTop = cur * H; paint(cur);
  const update = () => {
    const i = clamp(Math.round(track.scrollTop / H), 0, opts.length - 1);
    paint(i);
    const min = +opts[i].dataset.min;
    if (min !== S.bk.min) { S.bk.min = min; patchBkSum(); }
  };
  track.addEventListener("scroll", () => { clearTimeout(track._t); track._t = setTimeout(update, 40); }, { passive: true });
}
function bkPreset(n) { S.bk.qty = n; patchBkSum(); }
function pickSeason(id) { S.season = id; renderBooking(); }

/* Starttider i halvtimmessteg inom värdens öppettider. */
function timeOptions(sel) {
  let out = "";
  for (let h = OPEN_HOURS.from; h <= OPEN_HOURS.to; h++) {
    for (const m of ["00", "30"]) {
      const v = String(h).padStart(2, "0") + ":" + m;
      out += `<option value="${v}" ${v === sel ? "selected" : ""}>${v}</option>`;
    }
  }
  return out;
}
function timeSpanText(b) {
  const [h, m] = (b.start || "09:00").split(":").map(Number);
  const durMin = S.mode === "timme" ? (b.min || 135) : b.qty * 60;
  const end = new Date(2000, 0, 1, h, m + durMin);
  const endTxt = String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0");
  const over = end.getDate() > 1 ? " (dagen efter)" : "";
  return `Du står från ${b.start || "09:00"} till ${endTxt}${over}.`;
}
function bkAttest(el) {
  S.bk.attest = !S.bk.attest;
  el.classList.toggle("on", S.bk.attest);
  el.setAttribute("aria-checked", String(!!S.bk.attest));
  const cta = document.querySelector(".sticky-cta .btn-p");
  if (cta) cta.disabled = !S.bk.attest;
  const note = document.querySelector(".sticky-cta p");
  if (note) note.textContent = S.bk.attest ? "Uppställningsavtalet skickas till din e-post."
    : "Kryssa i intyget ovan för att kunna boka.";
}
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
  const span = document.getElementById("bkspan"); if (span) span.textContent = timeSpanText(S.bk);
  document.querySelectorAll("#bkdur .chip").forEach(c => {
    const n = parseInt(c.textContent, 10);
    c.classList.toggle("on", (isNaN(n) ? 8 : n) === S.bk.qty);
  });
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
  /* Forvalet ar "imorgon" — men imorgon kan vara upptagen. Spärra fore betalning. */
  {
    const sp = allSpots().find(x => x.id === S.bk.id);
    if (sp && S.bk.date) {
      const [y, m, d] = S.bk.date.split("-").map(Number);
      if (dayIsBooked(sp, y, m - 1, d)) {
        toast("Den dagen \u00e4r upptagen \u2013 v\u00e4lj en annan i kalendern", "info");
        return bkStep(1);
      }
    }
  }
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
  S.bk._t = setTimeout(() => { S.bk._t = null; finishBooking(reg.toUpperCase().trim(), date); }, 1700);
}
function finishBooking(reg, date) {
  const s = allSpots().find(x => x.id === S.bk.id), T = bkTotals();
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const bk = { id: Date.now(), spotId: s.id, spot: s.nm, addr: s.ad, area: s.area, reg, mode: S.mode,
    qty: S.bk.qty, min: S.bk.min, total: T.driverTotal, host: s.host, date: date || new Date().toISOString().slice(0, 10),
    code, charge: S.bk.charge, pay: S.bk.pay, instr: s.instr,
    /* Spara delbeloppen — kvittot ska visa det som faktiskt betalades,
       inte en baklangesrakning som inte gar ihop. */
    base: T.base, service: T.service, trygg: T.trygg, disc: T.disc,
    chargeCost: T.chargeCost, extraCost: T.extraCost,
    /* Kraver varden godkannande ar bokningen INTE bekraftad an. */
    status: needsApproval(s, S.mode) ? "vantar" : "kommande" };
  BOOKINGS.unshift(bk);
  const vantar = needsApproval(s, S.mode);
  NOTIS.unshift(vantar
    ? { id: "n" + Date.now(), ic: "clock", t: "Förfrågan skickad", s: `${s.nm} · ${bk.date} · inga pengar dras än`, unread: true }
    : { id: "n" + Date.now(), ic: "check", t: "Bokningen är klar", s: `${s.nm} · ${bk.date} · ${kr(T.driverTotal)}`, unread: true });
  persist();
  openSheet(`<div class="sheet-b center" style="padding-top:36px">
    <div class="tick"${vantar ? ' style="background:var(--brass)"' : ""}>${I(vantar ? "clock" : "check", 32)}</div>
    <h3 style="font-family:var(--display);font-size:1.6rem">${vantar ? "Förfrågan skickad" : "Platsen är din"}</h3>
    <p class="dim" style="margin-top:8px">${esc(s.nm)} · ${esc(bk.date)}</p>
    ${vantar ? `<div class="callout brass" style="margin-top:20px;text-align:left">
      ${I("clock", 16)} ${esc(s.host)} svarar oftast inom en timme. Du får en avisering, och pengarna dras först när svaret kommit.</div>`
    : `<div class="code" style="margin-top:22px">${code}</div>
    <p class="muted small" style="margin-top:10px">Koden till grinden. Den finns alltid under Mitt.</p>`}
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
        <p class="dim small" style="margin-top:12px">Vi tjänar pengar först när du gör det. Betalning, kvitton och utbetalning ingår.</p>
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
                 info: "", charger: S.calc.charger, gated: S.calc.gated, cam: false, vinter: false, dyn: true, editId: null };
  }
  renderWizard();
}
function renderWizard() {
  const w = S.wizard;
  const titles = ["Var ligger platsen?", "Vad för slags plats?", "När är den ledig?", "Vad ska den kosta?", "Klart att lägga upp"];
  const bodies = [
    `<div class="field"><label>Adress</label><input class="inp" id="w_ad" value="${esc(w.ad)}" placeholder="Ringvägen 41, Stockholm"></div>
     <div class="hint">${I("lock", 17)}<div>Exakt adress visas först efter bokning. I listan syns bara gatan och stadsdelen.</div></div>`,
    `<div class="field"><label>Foto på platsen</label>
       <div id="w_photofield">${photoFieldHTML(w)}</div>
       <p class="muted small" style="margin-top:6px">Förare väljer oftare en plats de kan se. Ett foto på uppfarten räcker.</p></div>
     <div class="field"><label>Typ av plats</label><select class="inp" id="w_type">
       ${Object.keys(TYPE_MULT).map(k => `<option ${k === w.type ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     <div class="field"><label>Vad får plats?</label><select class="inp" id="w_size">
       ${["Personbil", "Personbil + SUV", "Personbil, husbil", "Personbil, släp", "Buss eller lastbil"].map(k => `<option ${k === w.size ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     ${[["charger", "bolt", "Laddbox", "Man kan ladda elbil"], ["gated", "lock", "Låst eller grind", "Port, bom eller grind"], ["cam", "camera", "Kamera", "Platsen är bevakad"], ["vinter", "moon", "Erbjud vinterförvar", "Kräver garage, carport, inhägnad tomt eller låst innergård"]]
       .map(([k, ic, tt, ss]) => `<div class="setrow"><span style="color:var(--ink-45)">${I(ic, 20)}</span>
         <div class="t"><b>${tt}</b><span>${ss}</span></div>
         <div class="switch ${w[k] ? "on" : ""}" role="switch" onclick="S.wizard['${k}']=!S.wizard['${k}'];this.classList.toggle('on')"></div></div>`).join("")}`,
    `<div class="field"><label>När får folk parkera?</label><select class="inp" id="w_tid">
       ${["Alltid", "Vardagar 08–17", "Kvällar och helger", "Bara vid matcher", "Bara långtid (månad)"].map(k => `<option ${k === w.tid ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     <div class="setrow"><span style="color:var(--green)">${I("bolt", 20)}</span>
       <div class="t"><b>Låt folk boka direkt</b><span>Utan att du godkänner varje gång. Krävs för att korttidsbokningar ska funka – annars hinner de tröttna.</span></div>
       <div class="switch ${w.instant !== false ? "on" : ""}" role="switch" onclick="S.wizard.instant=!(S.wizard.instant!==false);this.classList.toggle('on')"></div></div>
     <div class="hint" style="margin-top:12px">${I("info", 17)}<div>Månadsuthyrning och vinterförvar går alltid via ditt godkännande, oavsett den här inställningen.</div></div>
     <div class="field" style="margin-top:14px"><label>Vad behöver föraren veta?</label>
       <textarea class="inp" id="w_info" rows="3" placeholder="Kör in från gatan, plats närmast garaget. Vänd bilen så nosen pekar ut.">${esc(w.info)}</textarea></div>`,
    `<div class="field"><label>Pris per månad (kr)</label>
       <input class="inp mono" id="w_pris" value="${w.pris}" inputmode="numeric" style="font-size:1.4rem" oninput="wizPrice(this)"></div>
     <div class="setrow"><span style="color:var(--green)">${I("chart", 20)}</span>
       <div class="t"><b>Höj priset automatiskt</b><span>Vid matcher och högsäsong. Aldrig under ditt pris.</span></div>
       <div class="switch ${w.dyn ? "on" : ""}" role="switch" onclick="S.wizard.dyn=!S.wizard.dyn;this.classList.toggle('on')"></div></div>
     <div class="callout" id="wizCalc">Du får <b>${kr(Math.round(w.pris * (1 - FEES.hostPctMonthly)))}</b> i månaden, alltså <b>${kr(Math.round(w.pris * (1 - FEES.hostPctMonthly) * 12))}</b> på ett år.</div>`,
    `<div class="center"><div class="tick">${I("check", 30)}</div>
       <h3 style="font-family:var(--serif);font-size:1.5rem">Redo att lägga upp</h3>
       <p class="dim small" style="margin-top:8px">${esc(w.ad || "Din adress")} · ${esc(w.type)} · ${num(w.pris)} ${sym()}/mån</p></div>
     <div class="hint" style="margin-top:18px">${I("info", 17)}<div>I skarpt läge kommer här: BankID, foto på platsen, ditt kontonummer och – om du bor i bostadsrätt – styrelsens ja. <button class="lnk" onclick="openBrfBrev(1)">Hämta den färdiga frågan</button></div></div>`
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
/* Foto på platsen: skala ner till max 1000 px och JPEG så localStorage inte sprängs. */
function photoFieldHTML(w) {
  return w.photo
    ? `<div class="photoprev"><img src="${w.photo}" alt="Foto på platsen">
         <button class="photodel" type="button" onclick="wizPhotoDel()" aria-label="Ta bort foto">${I("close", 16)}</button></div>`
    : `<label class="photodrop">${I("camera", 26)}<span>Ladda upp ett foto</span>
         <input type="file" accept="image/*" onchange="wizPhoto(this)" hidden></label>`;
}
function wizPhoto(input) {
  const file = input.files && input.files[0]; if (!file) return;
  if (!/^image\//.test(file.type)) { toast("Välj en bildfil", "info"); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const max = 1000, sc = Math.min(1, max / Math.max(img.width, img.height));
      const cw = Math.round(img.width * sc), ch = Math.round(img.height * sc);
      const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
      S.wizard.photo = cv.toDataURL("image/jpeg", 0.78);
      renderWizard();
      toast("Foto tillagt", "camera");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function wizPhotoDel() { S.wizard.photo = null; renderWizard(); }
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
  const rec = { id: w.editId || Date.now(), ad: w.ad.trim(), type: w.type, size: w.size, pris: w.pris, photo: w.photo || null,
    tid: w.tid, info: w.info, charger: w.charger, gated: w.gated, cam: w.cam, vinter: w.vinter, dyn: w.dyn,
    instant: w.instant !== false,   /* vardens "boka direkt"-val ska foljas, inte bara lagras */
    /* Alla som lagger upp nu ar grundare. Behall flaggan vid redigering. */
    grundare: w.editId ? ((LISTINGS.find(x => x.id === w.editId) || {}).grundare !== false) : true,
    paused: false, since: new Date().toISOString().slice(0, 10) };
  rec.area = (LISTINGS.find(x => x.id === rec.id) || {}).area || SET.city;
  rec.blocked = (LISTINGS.find(x => x.id === rec.id) || {}).blocked || [];
  rec.ll = (LISTINGS.find(x => x.id === rec.id) || {}).ll || null;
  const i = LISTINGS.findIndex(x => x.id === rec.id);
  if (i >= 0) LISTINGS[i] = rec; else LISTINGS.unshift(rec);
  /* Slå upp adressen så platsen hamnar på rätt ställe på kartan. */
  if (!rec.ll && rec.ad) {
    PMap.geocode(rec.ad, rows => {
      if (!rows || !rows.length) return;
      const hit = LISTINGS.find(x => x.id === rec.id); if (!hit) return;
      hit.ll = rows[0].ll;
      let bast = AREAS[0], min = Infinity;
      AREAS.forEach(a => { const km = distKm(a.c, hit.ll); if (km < min) { min = km; bast = a; } });
      hit.area = bast.id;
      persist();
      if (S.route === "sok" || S.route === "start") render();
    });
  }
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
  const favs = allSpots().filter(s => FAVS.includes(s.id));
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
      <p class="muted small" style="margin-top:5px">${(l.blocked || []).filter(d => new Date(d) >= new Date(new Date().toDateString())).length
          ? `<span style="color:var(--clay)">${(l.blocked || []).filter(d => new Date(d) >= new Date(new Date().toDateString())).length} dagar stängda</span> · ` : ""}${esc(l.type)} · ${esc(l.size)} · ${esc(l.tid)}${l.charger ? " · Laddbox" : ""}${l.vinter ? " · Vinterförvar" : ""}${l.dyn ? " · Höjer priset vid matcher" : ""}</p>
      <div class="grid g3 keep" style="margin-top:16px;gap:1px;background:var(--rule);border-radius:var(--r-sm);overflow:hidden">
        ${[["Pris", num(l.pris) + " " + sym()], ["Du får", num(Math.round(l.pris * (1 - FEES.hostPctMonthly))) + " " + sym()], ["På ett år", num(Math.round(l.pris * (1 - FEES.hostPctMonthly) * 12)) + " " + sym()]]
          .map(([a, b]) => `<div style="background:var(--card);padding:12px 14px">
            <div class="micro">${a}</div><div style="font-family:var(--serif);font-size:1.3rem;margin-top:3px;font-variant-numeric:tabular-nums">${b}</div></div>`).join("")}
      </div>
      <div class="row wrap" style="margin-top:16px">
        <button class="btn btn-sm" onclick="togglePause(${l.id})">${I(l.paused ? "play" : "minus", 15)} ${l.paused ? "Aktivera" : "Pausa"}</button>
        <button class="btn btn-sm" onclick="openWizard(${l.id})">${I("sliders", 15)} Ändra</button>
        <button class="btn btn-sm ${l.nu === false ? "" : "btn-g"}" onclick="toggleNu(${l.id})">${I("car", 15)} ${l.nu === false ? "Stängd nu" : "Ledig nu"}</button>
        <button class="btn btn-sm" onclick="openBlockCal(${l.id})">${I("calendar", 15)} Dagar och priser</button>
        <button class="btn btn-sm" onclick="openSchedule(${l.id})">${I("clock", 15)} Veckotider</button>
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
      ${(() => { const st = BK_STATUS[b.status] || BK_STATUS.kommande;
        const aktiv  = b.status !== "klar" && b.status !== "avbokad";
        const vantar = b.status === "vantar";
        return `
      <div class="spread"><b style="font-size:1.02rem">${esc(b.spot)}</b>
        <span class="tag ${st.cls}">${st.txt}</span></div>
      <p class="muted small" style="margin-top:5px">${esc(b.reg)} \u00b7 ${qtyText(b)} \u00b7 ${esc(b.date)} \u00b7 v\u00e4rd ${esc(b.host)}</p>
      <div class="row wrap" style="margin-top:14px">
        <span style="font-family:var(--serif);font-size:1.35rem;margin-right:auto;font-variant-numeric:tabular-nums">${kr(b.total)}</span>
        ${vantar ? `<span class="dim small">V\u00e4rden svarar oftast inom en timme</span>`
          : aktiv ? `<button class="btn btn-sm btn-p" onclick="openAccess(${b.id})">${I("key", 15)} \u00d6ppna</button>
        <button class="btn btn-sm" onclick="extendBooking(${b.id})">${I("clock", 15)} F\u00f6rl\u00e4ng</button>` : ""}
        <button class="btn btn-sm" onclick="receipt(${b.id})">${I("receipt", 15)} Kvitto</button>
        ${b.rating ? `<span class="rate">${IF("star", 13)}${b.rating} av 5</span>`
          : b.status === "klar" ? `<button class="btn btn-sm" onclick="rateBooking(${b.id})">${I("star", 15)} Betygs\u00e4tt</button>` : ""}
      </div>
      ${aktiv ? `<div style="margin-top:12px;border-top:1px solid var(--rule);padding-top:12px">
        <button class="btn btn-sm" style="min-height:44px" onclick="cancelBooking(${b.id})">Avboka bokningen</button></div>` : ""}`;
      })()}
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
function toggleNu(id) {
  const l = LISTINGS.find(x => x.id === id); if (!l) return;
  l.nu = l.nu === false ? true : false;
  persist(); render();
  toast(l.nu === false ? "Ingen kan svänga in just nu" : "Nu kan folk svänga in", l.nu === false ? "lock" : "car");
}
function togglePause(id) { const l = LISTINGS.find(x => x.id === id); if (l) { l.paused = !l.paused; persist(); toast(l.paused ? "Pausad" : "Aktiv igen", "check"); render(); } }
/* Fraga alltid innan nagot inte gar att angra. */
let BEKRAFTA_JA = null;
function bekrafta(o) {
  BEKRAFTA_JA = o.ja;
  openSheet(sheetHead(o.titel) + `<div class="sheet-b stack">
    <p class="dim">${o.text}</p>
    <button class="btn btn-block btn-lg ${o.farlig ? "btn-c" : "btn-p"}"
      onclick="closeSheet();if(BEKRAFTA_JA)BEKRAFTA_JA();BEKRAFTA_JA=null">${esc(o.jaText)}</button>
    <button class="btn btn-block" onclick="closeSheet();BEKRAFTA_JA=null">Nej, beh\u00e5ll</button>
  </div>`);
}

function cancelBooking(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  if (b.status === "klar")    return toast("Den h\u00e4r parkeringen \u00e4r redan avslutad", "info");
  if (b.status === "avbokad") return toast("Redan avbokad", "info");

  /* En obesvarad forfragan har inga dragna pengar — sag det, inte "aterbetalning". */
  if (b.status === "vantar") {
    return bekrafta({
      titel: "Dra tillbaka förfrågan?",
      text: "Värden har inte svarat än och inga pengar har dragits.",
      jaText: "Ja, dra tillbaka", farlig: true,
      ja: function () { b.status = "avbokad"; persist(); toast("Förfrågan är tillbakadragen", "check"); render(); }
    });
  }
  const tim = (new Date(b.date + "T12:00") - Date.now()) / 3600000;
  bekrafta({
    titel: "Avboka " + b.spot + "?",
    text: tim < 24
      ? "Det \u00e4r mindre \u00e4n ett dygn kvar. Du f\u00e5r tillbaka halva beloppet, " +
        kr(Math.round(b.total / 2)) + "."
      : "Du f\u00e5r tillbaka hela beloppet, " + kr(b.total) + ". Koden slutar fungera direkt.",
    jaText: "Ja, avboka", farlig: true,
    ja: function () {
      b.status = "avbokad"; persist();
      toast(tim < 24 ? "Avbokad \u2013 halva beloppet tillbaka" : "Avbokad \u2013 alla pengar tillbaka", "check");
      render();
    }
  });
}

/* Etiketten maste folja bokningens verkliga tillstand. */
const BK_STATUS = {
  vantar:   { txt: "V\u00e4ntar p\u00e5 svar", cls: "brass" },
  kommande: { txt: "Bekr\u00e4ftad",           cls: "green" },
  klar:     { txt: "Avslutad",                  cls: "" },
  avbokad:  { txt: "Avbokad",                   cls: "" }
};
function extendBooking(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const spot = allSpots().find(s => s.id === b.spotId);
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
  /* Sparade delbelopp om de finns; annars visas bara totalen —
     hellre en rad som stammer an fyra som inte summerar. */
  const harDelar = b.base != null;
  openSheet(sheetHead("Kvitto") + `<div class="sheet-b">
    <p class="dim small">${esc(b.spot)} · ${esc(b.date)} · ${esc(b.reg)}</p>
    <div style="margin-top:16px">
      ${harDelar ? `
      <div class="kv"><span>Hyra (${qtyText(b)})</span><b>${kr(b.base)}</b></div>
      ${b.chargeCost ? `<div class="kv"><span>Laddning</span><b>${kr(b.chargeCost)}</b></div>` : ""}
      ${b.extraCost ? `<div class="kv"><span>Extra fordon</span><b>${kr(b.extraCost)}</b></div>` : ""}
      ${b.disc ? `<div class="kv"><span>Rabatt</span><b>−${kr(b.disc)}</b></div>` : ""}
      <div class="kv"><span>Serviceavgift</span><b>${kr(b.service)}</b></div>
      <div class="kv"><span>Trygghetsgaranti</span><b>${kr(b.trygg)}</b></div>` : ""}
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
         ["Parkeringen avslutas direkt", "Tiden stoppas på sekunden – du väntar inte på någon."],
         ["Efter fyrtiofem minuter börjar övertid löpa", `${kr(FEES.overtidPerTimme)} per påbörjad timme, hela beloppet till dig.`]]
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
      const near = allSpots().filter(s => s.area === e.area && s.ev > 0);
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
    const d2 = new Date();   /* rakna om — minut 59 + 1 far inte bli ":60" */
    MSGS.push({ me: false, t: "Absolut, det löser vi!", tm: String(d2.getHours()).padStart(2, "0") + ":" + String(d2.getMinutes()).padStart(2, "0") });
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
  <h1 style="margin:14px 0 0;font-size:clamp(2.1rem,5vw,3.6rem)" data-reveal>Vad som skyddar dig –<br><em>och vad som inte gör det än.</em></h1>
  <p class="lede" style="margin-top:18px" data-reveal>Det svåra är inte pengarna. Det är tanken på en främmande bil på tomten. Här står båda listorna, utan att vi snyggar till den andra.</p>
  <div class="panel pad-lg" style="margin-top:30px;border-color:var(--brass)" data-reveal>
    <div class="row"><span style="color:var(--brass)">${I("info", 22)}</span>
      <h3 style="margin:0">Parkla har inte öppnat än</h3></div>
    <p class="dim" style="margin-top:10px;max-width:64ch">Det du ser nu är en förhandsvisning med påhittade
      platser. Inga pengar rör sig. På den här sidan står bara sådant som faktiskt är byggt –
      och, längre ner, exakt vad som byggs innan vi öppnar. Vi tycker det är rimligt att du
      får veta skillnaden.</p>
  </div>

  <h2 style="margin:38px 0 4px" data-reveal>Det här finns i dag</h2>
  <div style="margin-top:22px">${entriesHTML([
    ["shield", "Din adress syns inte förrän någon bokat",
      "Kartan visar ett ungefärligt läge, ungefär hundrafemtio meter fel. Exakt adress och portkod " +
      "lämnas ut först till den som har en aktiv bokning på just din plats, och bara under den tiden. " +
      "Ingen kan bläddra fram var du bor."],
    ["lock", "Priset räknas på vår server, aldrig i telefonen",
      "Beloppet bestäms av öppettider, ditt pris och den tid som faktiskt gått. Ingen kan ändra siffran " +
      "i sin egen telefon och parkera för en krona."],
    ["car", "Två personer kan aldrig hamna på samma plats",
      "Regeln ligger i databasen, inte i appen. Trycker två personer i exakt samma sekund förlorar den ena, " +
      "varje gång."],
    ["wallet", "Vi reserverar, vi drar inte i efterhand",
      `Som en bensinmack: ett takbelopp spärras när du svänger in, och när du åker dras bara den tid du ` +
      `faktiskt stod. Resten släpps direkt. Kortuppgifterna går till Stripe – Parkla ser dem aldrig.`],
    ["receipt", "Kvitto på varje parkering",
      "Uppdelat på parkering, serviceavgift och trygghetsavgift. Samma summa som du fick se innan du " +
      "tryckte. Värden ser sin utbetalning i samma rad."],
    ["building", "Bor du i bostadsrätt?",
      "Då måste styrelsen säga ja – en utomhusplats är juridiskt ett lägenhetsarrende. " +
      "<button class=\"lnk\" onclick=\"openBrfBrev()\">Hämta en färdig fråga att skicka</button>. " +
      "Säger de ja en gång gäller det för alla i föreningen, och föreningen kan ta en andel av " +
      "intäkterna till kassan."]
  ])}</div>

  <h2 style="margin:44px 0 4px" data-reveal>Det här byggs innan vi öppnar</h2>
  <p class="dim small" style="margin-top:8px;max-width:60ch" data-reveal>Ingenting av detta finns än.
    Vi skriver ut det hellre än att låta dig tro att det redan gäller.</p>
  <div class="panel pad-lg" style="margin-top:20px" data-reveal>
    ${[["shield", "Legitimering med BankID",
        "I dag loggar man in med en kod till mejlen. Innan vi tar emot en enda riktig krona ska varje " +
        "konto vara knutet till en person via BankID."],
       ["shield", `Trygghetsgarantin – tre delar för ${kr(FEES.tryggShort)}`,
        `Skadegaranti till värden upp till ${num(FEES.garantiBelopp)} ${sym()} utan självrisk. ` +
        `Betalningsgaranti: kan föraren inte betala är det vår förlust, inte värdens. ` +
        `Platsgaranti till föraren: är platsen blockerad när du kommer får du alla pengar tillbaka. ` +
        `Processen för att betala ut en skada är inte byggd än – därför gäller garantin först när vi öppnar.`],
       ["camera", "Foto före och efter, sparat hos oss",
        "I dag ligger bilderna bara i din egen telefon. De ska ligga på vår server med tidsstämpel, " +
        "annars är de inget bevis i en tvist."],
       ["door", "Knappen ”jag behöver platsen nu”",
        `Värden ska kunna avsluta en parkering på sekunden, och övertid ska kosta ` +
        `${kr(FEES.overtidPerTimme)} per påbörjad timme – hela beloppet till värden, ingenting till Parkla. ` +
        `Knappen finns i gränssnittet men gör ännu ingenting.`],
       ["star", "Betyg åt båda håll",
        "Betygen och omdömena du ser i dag är påhittade exempel, så att du ser hur det kommer att se ut. Riktiga betyg – åt båda håll och omöjliga att radera – byggs innan vi öppnar."],
       ["message", "Samtal via växelnummer",
        "Ditt telefonnummer ska aldrig lämnas ut. Tills den kopplingen finns visar vi inga nummer alls."]
      ].map(([ic, t, p], k) => `<div class="setrow" style="align-items:flex-start">
        <span style="color:var(--ink-45);margin-top:2px">${I(ic, 20)}</span>
        <div class="t" style="flex:1"><b>${t}</b>
          <span style="display:block;margin-top:4px;line-height:1.5">${p}</span></div>
        <span class="tag" style="flex:none">Byggs</span>
      </div>`).join("")}
  </div>

  <div class="callout" style="margin-top:20px" data-reveal>${I("info", 16)}
    <div><b>En sak vi inte tänker lova:</b> att bärga bilen åt dig. Att flytta ett fordon från
    privat tomtmark är enligt lagen om flyttning av fordon en fråga för kommunen eller Polisen,
    på markägarens begäran. Parkla är inte markägare och kan inte beställa det åt dig. Andra
    tjänster lovar det ändå. Vi gör det inte.</div></div>
  <div class="panel pad-lg" style="margin-top:34px;border-color:var(--brass)" data-reveal>
    <div class="row"><span style="color:var(--brass)">${I("bank", 24)}</span><h3>Vem betalar egentligen?</h3></div>
    <p class="dim" style="margin-top:12px;max-width:64ch">De ${kr(FEES.tryggShort)} per bokning köper
      tre saker: skadegaranti till värden, betalningsgaranti till värden och platsgaranti till
      föraren. Så här hänger de ihop.</p>
    <ul class="numlist" style="margin-top:14px">
      <li><span class="n">01</span><div><b>Föraren är ansvarig enligt lag</b>
        <p>Kör någon sönder din grind är det hen som är skadeståndsskyldig. Det gäller oavsett Parkla.</p></div></li>
      <li><span class="n">02</span><div><b>Vi betalar dig direkt – du slipper jaga någon</b>
        <p>Du anmäler i appen, vi bedömer på foton och betalar ut inom fem arbetsdagar. Upp till ${kr(FEES.garantiBelopp)} per händelse, ingen självrisk för dig.
        <b>Så här är det tänkt att fungera – steg två är inte byggt än och gäller först när vi öppnar.</b></p></div></li>
      <li><span class="n">03</span><div><b>Sedan kräver vi föraren</b>
        <p>Vi tar över kravet. Kan föraren inte betala är det <b>vår förlust, inte din</b>. Det är precis det du betalar trygghetsavgiften för: ${kr(FEES.tryggShort)} per bokning eller ${kr(FEES.tryggMonthly)} i månaden.</p></div></li>
    </ul>
    <div style="margin-top:18px;border-top:1px solid var(--rule);padding-top:16px">
      <b>Det här ingår inte</b>
      <p class="dim small" style="margin-top:8px;max-width:64ch">Din egen bil – den täcks av din
        bilförsäkring, precis som på gatan. Stöld ur bilen. Bärgning. Snö och halka. Skador som
        fanns före bokningen – det är därför förefotot finns. Vi skriver hellre listan här än i
        det finstilta.</p>
    </div>
    <div class="callout brass" style="margin-top:16px"><b>Viktigt att vara korrekt med:</b> det här är en <b>garanti från Parkla</b>, inte en försäkring. Att kalla något försäkring kräver tillstånd från Finansinspektionen. Garantin ska backas av en riktig försäkringspartner innan vi öppnar.</div>
  </div>

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
    ["building", "3 · Bor du i bostadsrätt eller hyresrätt? Fråga först.", "En p-plats utomhus är juridiskt ett lägenhetsarrende. Du får inte hyra ut den i andra hand utan föreningens tillstånd, och styrelsen får säga nej. Samma sak gäller hyresrätt. <button class=\"lnk\" onclick=\"openBrfBrev()\">Hämta en färdig fråga till styrelsen</button>."],
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
    ["shield", "2 · Trygghetsgarantin", `${kr(FEES.tryggShort)} per bokning eller ${kr(FEES.tryggMonthly)} i månaden för skadegaranti upp till ${kr(FEES.garantiBelopp)}. Hög marginal – men framför allt: <b>det är detta som får folk att våga.</b> Ingen svensk konkurrent har det.`],
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

  ${skarptPanelHTML()}

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
          <option value="sv" selected>Svenska</option>
        </select></div>
      <p class="muted small" style="margin-top:6px">Fler spr\u00e5k kommer n\u00e4r hela appen \u00e4r \u00f6versatt \u2013 inte halvvägs.</p>
      <div class="field"><label>${esc(t("currency"))}</label>
        <select class="inp" onchange="SET.currency=this.value;saveSettings();render()">
          ${Object.keys(CURRENCIES).map(k => `<option value="${k}" ${SET.currency === k ? "selected" : ""}>${k} · ${CURRENCIES[k].name}</option>`).join("")}
        </select></div>
    </div>
    <p class="muted small" style="margin-top:12px">Sverige först, sedan Norden och Europa. Valutakurserna i demon är ungefärliga.</p>
  </div>

  <div class="panel pad-lg" style="margin-top:18px">
    <h3>Lansering</h3>
    <div class="setrow" style="margin-top:8px"><span style="color:var(--green)">${I("spark", 20)}</span>
      <div class="t"><b>Lanseringsläge</b><span>Döljer bokning av exempelplatserna och visar intresseanmälan i stället – påverkar inte betalningar. Slå på innan du delar länken publikt.</span></div>
      <div class="switch ${SET.live ? "on" : ""}" role="switch" onclick="SET.live=!SET.live;saveSettings();render()"></div></div>
    <div class="field" style="margin-top:14px"><label>Formulärlänk för anmälningar (frivilligt)</label>
      <input class="inp mono" id="formurl" placeholder="https://formspree.io/f/xxxx" value="${esc(SET.formUrl || "")}"></div>
    <p class="muted small" style="margin-top:8px">Skapa ett gratisformulär hos Formspree eller Tally, klistra in adressen här, så skickas varje anmälan dit automatiskt. Utan länk sparas de på den här enheten.</p>
    <div class="row wrap" style="margin-top:12px">
      <button class="btn btn-sm btn-p" onclick="SET.formUrl=(document.getElementById('formurl').value||'').trim();saveSettings();toast('Sparat','check')">Spara länken</button>
      <button class="btn btn-sm" onclick="copyLeads()">${I("copy", 15)} Kopiera anmälningar (${typeof LEADS !== "undefined" ? LEADS.length : 0})</button>
    </div>
    <div class="field" style="margin-top:16px;border-top:1px solid var(--rule);padding-top:16px"><label>Meta Pixel-ID för Facebook-annonser (frivilligt)</label>
      <input class="inp mono" id="metapixel" placeholder="t.ex. 123456789012345" value="${esc(SET.metaPixel || "")}"></div>
    <p class="muted small" style="margin-top:8px">Skapa en pixel i Meta Events Manager, klistra in ID:t här, så mäts besök och anmälningar (Lead) för dina annonser. <b>Obs:</b> pixeln är en marknadsföringscookie – uppdatera integritetspolicyn och lägg en samtyckesruta innan du kör skarpt.</p>
    <div class="row wrap" style="margin-top:12px">
      <button class="btn btn-sm btn-p" onclick="SET.metaPixel=(document.getElementById('metapixel').value||'').replace(/\D/g,'');saveSettings();renderConsent();initMetaPixel();toast(SET.metaPixel?'Pixel sparad':'Pixel avstängd','check')">Spara pixeln</button>
    </div>
  </div>

  <div class="panel pad-lg" style="margin-top:18px">
    <h3>Satellitbilder</h3>
    <p class="dim small" style="margin-top:8px">Utan nyckel använder vi Esris öppna flygbilder. De räcker till zoom 18 – i svenska bostadsområden är de ungefär en meter per bildpunkt, så vi stannar där i stället för att visa uppskalad gröt.</p>
    <p class="dim small" style="margin-top:8px">Med en egen <b>Mapbox-nyckel</b> blir bilderna skarpa hela vägen till zoom 22 och du kan se enskilda uppfarter. Mapbox har 50 000 kartvisningar i månaden gratis. Skapa ett konto på mapbox.com, kopiera din <i>public access token</i> och klistra in den här.</p>
    <div class="field" style="margin-top:14px"><label>Mapbox access token (frivilligt)</label>
      <input class="inp mono" id="satkey" placeholder="pk.eyJ1Ijoi…"
        value="${esc(SET.satKey || "")}"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn btn-p btn-sm" onclick="saveSatKey()">Spara nyckel</button>
      ${SET.satKey ? `<button class="btn btn-sm" onclick="SET.satKey='';saveSettings();render();toast('Nyckeln är borttagen','close')">Ta bort</button>` : ""}
      ${SET.satKey ? `<span class="tag green">Skarp satellit aktiv</span>` : `<span class="tag">Esri, upp till zoom 18</span>`}
    </div>
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
function saveSatKey() {
  const v = (document.getElementById("satkey") || {}).value || "";
  const k = v.trim();
  if (k && !/^pk\./.test(k)) { toast("En Mapbox-token börjar med pk.", "info"); return; }
  SET.satKey = k; SET.satProvider = "mapbox"; saveSettings();
  toast(k ? "Nyckeln är sparad – satelliten blir skarp nu" : "Nyckeln är borttagen", "check");
  render();
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
    openSheet(sheetHead("Dina uppgifter") + `<div class="sheet-b"><textarea class="inp mono dump" rows="14" readonly>${esc(json)}</textarea></div>`);
  }
}
/* Rensa BARA parkla.v3.* — ALDRIG hela localStorage (andra appar delar origin). */
function doResetAll() {
  Object.keys(localStorage)
    .filter(k => k.indexOf("parkla.v3.") === 0 && k !== "parkla.v3.cfg")
    .forEach(k => localStorage.removeItem(k));
  location.hash = ""; location.reload();
}
function resetAll() {
  openSheet(sheetHead("Börja om?") + `<div class="sheet-b stack">
    <p class="dim">Det här raderar dina bokningar, platser och sparade favoriter i den här webbläsaren. Det går inte att ångra.</p>
    <button class="btn btn-c btn-block btn-lg" onclick="doResetAll()">Ja, nollställ</button>
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
    ["vinterforvar", "moon", "Vinterförvar", "Ställ undan bilen över vintern"],
    ["meddelanden", "message", "Meddelanden", "Skriv till värdar och förare"],
    ["trygg", "shield", t("nav_trust"), "BankID, skadegaranti, flytta bilen"],
    ["priser", "wallet", t("nav_price"), "Exakt vad vi tar, och varför"],
    ["skatt", "receipt", "Skatt och regler", "40 000 kr skattefritt, bygglov, förening"],
    ["brf", "building", "För föreningar", "Fyll era tomma platser"],
    ["bjudin", "gift", "Bjud in en vän", `Ge ${num(FEES.refForare)} ${sym()}, få ${num(FEES.refVard)} ${sym()}`],
  ];
  const faq = [
    ["Vad händer om någon inte flyttar bilen?", `Du trycker på ”Flytta bilen”. Vi kontaktar föraren, parkeringen avslutas på sekunden, och står bilen kvar efter fyrtiofem minuter kostar det ${kr(FEES.overtidPerTimme)} per påbörjad timme – hela beloppet till dig. Bärgning kan vi inte lova: att flytta ett fordon från tomtmark är kommunens eller Polisens sak, på markägarens begäran.`],
    ["Kan jag få p-bot på en Parkla-plats?", "Nej. Platsen är privat mark och du har ett giltigt avtal. Skulle du ändå få en kontrollavgift bestrider vi den åt dig och betalar om vi förlorar."],
    ["Måste jag vara hemma när någon parkerar?", "Nej. De flesta uthyrningar sker utan att ni ens träffas. Kod, karta och instruktioner finns i appen."],
    ["Hur mycket kan jag tjäna?", "En uppfart i Stockholms innerstad: 1 800–2 500 kr i månaden. Märsta nära Arlanda: 1 200–1 700 kr. Förort: 400–900 kr. Med laddbox ungefär 28 % mer."],
    ["Måste jag betala skatt?", "Oftast inte. Du får tjäna 40 000 kr per bostad och år skattefritt. Appen har en mätare, och vi skickar underlag i januari."],
    ["Jag bor i bostadsrätt – får jag hyra ut?", "Bara med styrelsens tillstånd. <button class=\"lnk\" onclick=\"openBrfBrev()\">Hämta en färdig fråga åt dig</button>."],
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
   VY: VINTERFÖRVAR
   ============================================================ */
function withMode(m, fn) { const old = S.mode; S.mode = m; try { return fn(); } finally { S.mode = old; } }

function viewVinter() {
  const ex = allSpots().filter(seasonOK).filter(x => x.m).sort((a, b) => seasonPrice(a, "kort") - seasonPrice(b, "kort")).slice(0, 4);
  return `
<section class="tight"><div class="wrap">
  <span class="kicker" data-reveal>Vinterförvar</span>
  <h1 style="margin:14px 0 0;font-size:clamp(2rem,4.4vw,3.2rem)" data-reveal>Ställ undan bilen<br><em>över vintern.</em></h1>
  <p class="lede" style="margin-top:18px" data-reveal>Har du en sommarbil, husvagn eller motorcykel som ska stå still i fem månader? Hyr en plats hos någon som har ett garage över. Betydligt billigare än en förvaringsfirma, och du vet var bilen står.</p>

  <div class="grid g2" style="margin-top:34px">
    <div class="panel pad-lg" data-reveal>
      <h3>Två säsonger</h3>
      <div style="margin-top:14px">
        ${Object.values(SEASON).map(x => `<div class="kv"><span style="font-weight:600">${x.label}
          <span class="muted small" style="display:block;font-weight:400">${x.period}</span></span>
          <b>${x.months} mån</b></div>`).join("")}
      </div>
      <p class="dim small" style="margin-top:14px">Du får ${Math.round((1 - SEASON_RABATT) * 100)} % rabatt jämfört med att betala månad för månad, mot att du bokar hela säsongen.</p>
    </div>
    <div class="panel pad-lg" data-reveal>
      <h3>Vad som får hyras ut</h3>
      <p class="dim" style="margin-top:10px">Bilen ska stå skyddad. Därför får bara dessa platser erbjuda vinterförvar:</p>
      <div class="row wrap" style="margin-top:14px">
        <span class="tag green">Garage</span><span class="tag green">Carport</span>
        <span class="tag green">Inhägnad tomt</span><span class="tag green">Låst innergård</span>
      </div>
      <p class="dim small" style="margin-top:14px">En öppen uppfart duger inte och visas aldrig i det här läget.</p>
    </div>
  </div>

  <div class="panel pad-lg" style="margin-top:22px;border-color:var(--brass)" data-reveal>
    <div class="row"><span style="color:var(--brass)">${I("shield", 24)}</span><h3>Vem ansvarar för vad?</h3></div>
    <p class="dim" style="margin-top:12px;max-width:64ch">Det här är det viktigaste att förstå, och vi är tydliga med det innan du bokar. <b>Du hyr en yta – du lämnar inte in bilen.</b> Värden tar aldrig emot fordonet, har aldrig nyckeln och sköter det inte. Det gör att ingen vårdplikt uppstår för värden, precis som när du hyr en förrådsbox.</p>
    <div class="tblwrap" style="margin-top:18px"><table class="tbl">
      <thead><tr><th>Vad som händer</th><th>Vem som står för det</th></tr></thead>
      <tbody>
        <tr><td>Brand, stöld eller skadegörelse på fordonet</td><td><b>Fordonsägarens egen försäkring</b></td></tr>
        <tr><td>Fordonet skadar garaget, porten eller staketet</td><td><b>Parkla Trygg</b>, upp till ${kr(FEES.garantiBelopp)}</td></tr>
        <tr><td>Fordonet står kvar efter säsongens slut</td><td>Övertidsavgift ${kr(FEES.overtidPerTimme)}/timme, hela beloppet till värden</td></tr>
        <tr><td>Vattenläcka eller takras i värdens byggnad</td><td>Värdens fastighetsförsäkring</td></tr>
        <tr><td>Nycklar och tillsyn</td><td>Ingen – värden rör aldrig fordonet</td></tr>
      </tbody></table></div>
    <div class="callout brass" style="margin-top:16px">Innan du bokar måste du intyga att fordonet är försäkrat. Är bilen avställd räcker en avställnings- eller garageförsäkring – den täcker brand och stöld men inte trafik.</div>
  </div>

  <h2 style="margin:44px 0 18px" data-reveal>Så går det till</h2>
  <ul class="numlist" data-reveal>
    ${[["Välj säsong och plats", "Fem eller sju månader. S\u00e4songspriset visas direkt \u2013 serviceavgift och trygghetsgaranti l\u00e4ggs till i kassan innan du bekr\u00e4ftar."],
       ["Intyga att fordonet är försäkrat", "En ruta att kryssa i. Vi sparar intyget tillsammans med avtalet."],
       ["Kör dit och lås", "Du parkerar själv och behåller nyckeln. Värden öppnar bara grinden eller porten."],
       ["Hämta när säsongen är slut", "Vi påminner två veckor innan. Vill du förlänga gör du det i appen."]]
      .map(([a, b], k) => `<li><span class="n">0${k + 1}</span><div><b>${a}</b><p>${b}</p></div></li>`).join("")}
  </ul>

  ${ex.length ? `<h2 style="margin:44px 0 18px" data-reveal>Billigast just nu</h2>
    <div class="spotlist" data-reveal>${withMode("sasong", () => ex.map(x => spotRow(x, "sasong")).join(""))}</div>
    <button class="btn btn-p" style="margin-top:20px" onclick="S.mode='sasong';go('sok')">Se alla platser${I("arrow", 16, "arw")}</button>` : ""}

  <div class="panel pad-lg" style="margin-top:34px;background:var(--green-wash);border-color:transparent" data-reveal>
    <h3>Har du ett garage som står tomt i vinter?</h3>
    <p class="dim" style="margin-top:10px;max-width:58ch">Ett garage som annars står oanvänt mellan november och mars kan ge ${kr(9000)}–${kr(12000)} för säsongen. Du behöver inte göra något mer än att öppna porten två gånger.</p>
    <button class="btn btn-p" style="margin-top:18px" data-go="hyrut">Räkna på mitt garage${I("arrow", 16, "arw")}</button>
  </div>
</div></section>
${footerHTML()}`;
}


/* ============================================================
   TIDIG TILLGÅNG — det som faktiskt kan släppas innan betalning finns
   ============================================================ */
let LEADS = LS.get("leads", []);
let CONSENT = LS.get("consent", null);   /* "yes" | "no" | null */
let SESSION = LS.get("session", null);   /* { spotId, state:"pahagg"|"star", start, hold } */
function saveSession() { LS.set("session", SESSION); }

function liveBanner() {
  if (!isLive()) return "";
  return `<div class="livebar">
    ${I("spark", 17)}
    <div><b>Parkla öppnar snart</b>
    <span>Vi bygger upp utbudet område för område. Anmäl din plats eller ditt intresse så hör vi av oss innan vi öppnar.</span></div>
  </div>`;
}
function demoBadge() {
  return isLive() ? '<span class="tag brass" style="margin-right:6px">Exempel</span>' : "";
}

/* ---------- anmälan: jag har en plats ---------- */
function openLeadHost() {
  openSheet(sheetHead("Anmäl din plats") + `<div class="sheet-b stack">
    <p class="dim">Vi öppnar område för område. Har du en plats hör vi av oss innan vi drar igång där du bor.</p>
    <div class="field"><label>Adress</label><input class="inp" id="lh_ad" placeholder="Ringvägen 41, Stockholm"></div>
    <div class="grid g2" style="gap:12px">
      <div class="field"><label>Typ av plats</label><select class="inp" id="lh_type">
        ${Object.keys(TYPE_MULT).map(k => `<option>${k}</option>`).join("")}</select></div>
      <div class="field"><label>Önskat pris per månad (kr)</label>
        <input class="inp mono" id="lh_pris" inputmode="numeric" placeholder="1500"></div>
    </div>
    <div class="field"><label>Ditt namn</label><input class="inp" id="lh_namn" placeholder="Förnamn Efternamn"></div>
    <div class="field"><label>E-post</label><input class="inp" type="email" id="lh_mail" placeholder="du@exempel.se"></div>
    <div class="field"><label>Telefon (frivilligt)</label><input class="inp" type="tel" id="lh_tel" placeholder="070-123 45 67"></div>
    <div class="hint">${I("lock", 17)}<div>Vi använder uppgifterna bara för att kontakta dig om Parkla. Du kan när som helst be oss radera dem.</div></div>
    <button class="btn btn-p btn-block btn-lg" onclick="saveLead('vard')">Skicka anmälan</button>
  </div>`);
}

/* ---------- anmälan: jag söker parkering ---------- */
function openLeadDriver() {
  openSheet(sheetHead("Säg till när det finns platser") + `<div class="sheet-b stack">
    <p class="dim">Skriv var du behöver parkera så hör vi av oss när vi öppnar där.</p>
    <div class="field"><label>Var behöver du parkera?</label>
      <input class="inp" id="ld_var" placeholder="Märsta, eller Södermalm"></div>
    <div class="field"><label>Hur ofta?</label><select class="inp" id="ld_hur">
      <option>Varje dag</option><option>Några gånger i veckan</option>
      <option>Vid resor till Arlanda</option><option>Vid matcher och evenemang</option>
      <option>Vinterförvar</option></select></div>
    <div class="field"><label>E-post</label><input class="inp" type="email" id="ld_mail" placeholder="du@exempel.se"></div>
    <div class="hint">${I("lock", 17)}<div>Bara för att säga till när vi öppnar. Inget nyhetsbrev.</div></div>
    <button class="btn btn-p btn-block btn-lg" onclick="saveLead('forare')">Skicka</button>
  </div>`);
}

function saveLead(typ) {
  const v = id => ((document.getElementById(id) || {}).value || "").trim();
  const rec = typ === "vard"
    ? { typ, ad: v("lh_ad"), plats: v("lh_type"), pris: v("lh_pris"), namn: v("lh_namn"), mail: v("lh_mail"), tel: v("lh_tel") }
    : { typ, omrade: v("ld_var"), hur: v("ld_hur"), mail: v("ld_mail") };
  if (!rec.mail || rec.mail.indexOf("@") < 1) { toast("Fyll i din e-post", "info"); return; }
  if (typ === "vard" && rec.ad.length < 4) { toast("Fyll i adressen", "info"); return; }
  if (typ === "forare" && rec.omrade.length < 2) { toast("Skriv var du behöver parkera", "info"); return; }
  rec.tid = new Date().toISOString();

  LEADS.unshift(rec); LS.set("leads", LEADS);
  pixelLead(typ);   /* konvertering för annonsoptimering */

  /* FormData + Accept = "enkel" CORS-request utan preflight. Funkar med
     Formspree, Tally, Google Forms m.fl. — JSON tvingar fram en preflight
     som en del endpoints inte svarar rätt på och POST:en blockeras. */
  const skicka = SET.formUrl
    ? (function () {
        const fd = new FormData();
        Object.keys(rec).forEach(k => fd.append(k, rec[k]));
        return fetch(SET.formUrl, { method: "POST", headers: { "Accept": "application/json" }, body: fd })
          .then(r => r.ok).catch(() => false);
      })()
    : Promise.resolve(null);

  skicka.then(ok => {
    closeSheet();
    openSheet(`<div class="sheet-b center" style="padding-top:36px">
      <div class="tick">${I("check", 32)}</div>
      <h3 style="font-family:var(--display);font-size:1.5rem">Tack!</h3>
      <p class="dim" style="margin-top:10px;max-width:34ch;margin-inline:auto">
        ${typ === "vard" ? "Vi hör av oss innan vi öppnar där du bor." : "Vi säger till så fort det finns platser nära dig."}</p>
      ${ok === null ? `<div class="callout brass" style="margin-top:20px;text-align:left">
        ${I("info", 16)} Anmälan är sparad på den här enheten. Koppla ett formulär i Inställningar så skickas den vidare automatiskt.
        <button class="btn btn-sm" style="margin-top:10px" onclick="copyLeads()">Kopiera anmälningarna</button></div>`
      : ok === false ? `<div class="callout clay" style="margin-top:20px;text-align:left">
        ${I("info", 16)} Vi kunde inte nå formuläret just nu, men anmälan är sparad här och skickas när du kopierar den.</div>` : ""}
      <button class="btn btn-p btn-block btn-lg" style="margin-top:22px" onclick="closeSheet()">Klart</button>
    </div>`);
    toast("Anmälan mottagen", "check");
  });
}
function copyLeads() {
  const txt = JSON.stringify(LEADS, null, 2);
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast(LEADS.length + " anmälningar kopierade", "copy"));
  else openSheet(sheetHead("Anmälningar") + `<div class="sheet-b"><textarea class="inp mono dump" rows="16" readonly>${esc(txt)}</textarea></div>`);
}


/* ============================================================
   PARKERA NU — svänga in utan att boka
   ============================================================ */
function startNow(id) {
  const sp = allSpots().find(x => x.id === id); if (!sp) return;
  if (SESSION) { toast("Du står redan på en plats", "info"); return; }
  /* Koden MASTE ligga i sessionen. Lag den bara i arket forsvann den
     sa fort man stangde det - och da star foraren vid en last grind. */
  SESSION = { spotId: id, state: "pahagg", hold: Date.now() + HALL_MINUTER * 60000, start: null,
              code: String(1000 + (sp.id % 9000)), instr: sp.instr, nm: sp.nm };
  saveSession(); closeSheet(); render();
  openSheet(`<div class="sheet-b center" style="padding-top:34px">
    <div class="tick" style="background:var(--green)">${I("car", 30)}</div>
    <h3 style="font-family:var(--display);font-size:1.5rem">Platsen är din</h3>
    <p class="dim" style="margin-top:8px">${esc(sp.nm)}</p>
    <div class="code" style="margin-top:20px">${String(1000 + (sp.id % 9000))}</div>
    <p class="muted small" style="margin-top:8px">Kod till grind eller port</p>
    <div class="callout" style="margin-top:18px;text-align:left">${I("info", 16)} ${esc(sp.instr)}</div>
    <div class="callout brass" style="margin-top:12px;text-align:left">
      ${I("clock", 16)} Vi håller platsen i ${HALL_MINUTER} minuter. Kör dit och tryck <b>Jag står här</b> när du parkerat.</div>
    <button class="btn btn-p btn-block btn-lg" style="margin-top:20px" onclick="arrivedNow()">Jag står här</button>
    <button class="btn btn-block" style="margin-top:10px" onclick="cancelNow()">Ändrade mig</button>
  </div>`);
}
function arrivedNow() {
  if (!SESSION) return;
  SESSION.state = "star"; SESSION.start = Date.now(); saveSession();
  closeSheet(); render(); toast("Klockan går. Tryck Jag åker nu när du lämnar.", "clock");
}
function cancelNow() {
  SESSION = null; saveSession(); closeSheet(); render(); toast("Avbrutet – platsen är fri igen", "check");
}
function endNow() {
  if (!SESSION || SESSION.state !== "star") return;
  const sp = allSpots().find(x => x.id === SESSION.spotId);
  const min = minuterSedan(SESSION.start);
  const pris = sessionKostnad(sp, min);
  const f = feeSplit(pris, "timme");
  BOOKINGS.unshift({ id: Date.now(), spotId: sp.id, spot: sp.nm, addr: sp.ad, area: sp.area,
    reg: LS.get("lastreg", "—"), mode: "timme", qty: Math.max(1, Math.ceil(min / 60)),
    base: f.base, service: f.service, trygg: f.trygg, disc: 0, chargeCost: 0, extraCost: 0,
    total: f.driverTotal, host: sp.host, date: new Date().toISOString().slice(0, 10),
    code: String(1000 + (sp.id % 9000)), pay: "swish", instr: sp.instr, status: "klar" });
  SESSION = null; saveSession(); persist();
  openSheet(`<div class="sheet-b center" style="padding-top:34px">
    <div class="tick">${I("check", 30)}</div>
    <h3 style="font-family:var(--display);font-size:1.5rem">Tack för den här gången</h3>
    <p class="dim" style="margin-top:8px">${esc(sp.nm)}</p>
    <div style="margin-top:22px;text-align:left">
      <div class="kv"><span>Du stod</span><b>${tidText(min)}</b></div>
      <div class="kv"><span>${kr(timPris(sp))} per timme, minst en timme</span><b>${kr(pris)}</b></div>
      <div class="kv"><span>Serviceavgift</span><b>${kr(f.service)}</b></div>
      <div class="kv"><span>Trygghetsgaranti</span><b>${kr(f.trygg)}</b></div>
      <div class="tot"><span>Dras via Swish</span><span>${kr(f.driverTotal)}</span></div>
    </div>
    <button class="btn btn-p btn-block btn-lg" style="margin-top:22px" onclick="closeSheet();go('mina')">Klart</button>
  </div>`);
  render();
}

/* Raden som ligger kvar längst ned så länge man står på en plats. */
let sessionTimer = null;
function sessionBarHTML() {
  if (!SESSION) return "";
  const sp = allSpots().find(x => x.id === SESSION.spotId);
  if (!sp) { SESSION = null; saveSession(); return ""; }
  if (SESSION.state === "pahagg") {
    const kvar = Math.max(0, Math.ceil((SESSION.hold - Date.now()) / 60000));
    if (kvar <= 0) { SESSION = null; saveSession(); return ""; }
    return `<div class="sessbar hold">
      <span class="ic">${I("clock", 19)}</span>
      <div class="t"><b>Platsen hålls åt dig</b><span>${esc(sp.nm)} · ${kvar} min kvar</span></div>
      <button class="btn btn-sm btn-p" onclick="arrivedNow()">Jag står här</button>
    </div>`;
  }
  const min = minuterSedan(SESSION.start);
  return `<div class="sessbar">
    <span class="ic">${I("car", 19)}</span>
    <div class="t"><b>Du står på ${esc(sp.nm)}</b><span id="sesstid">${tidText(min)} · ${kr(sessionKostnad(sp, min))}</span></div>
    <button class="btn btn-sm btn-c" onclick="endNow()">Jag åker nu</button>
  </div>`;
}
function tickSession() {
  clearInterval(sessionTimer);
  if (!SESSION) return;
  sessionTimer = setInterval(() => {
    const bar = document.getElementById("sessbox");
    if (!bar) return clearInterval(sessionTimer);
    /* SESSION kan bli null mellan tva tick - kolla FORE, inte efter. */
    if (!SESSION) return clearInterval(sessionTimer);
    const sp = allSpots().find(x => x.id === SESSION.spotId);
    if (!sp) return clearInterval(sessionTimer);
    if (SESSION.state === "star") {
      const el = document.getElementById("sesstid");
      const min = minuterSedan(SESSION.start);
      if (el) el.textContent = tidText(min) + " · " + kr(sessionKostnad(sp, min));
    } else {
      bar.innerHTML = sessionBarHTML();
    }
  }, 20000);
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

/* ══════════════════════════════════════════════════════════
   SKARPT LÄGE — riktig databas och riktiga betalningar

   De tre nycklarna här är alla publika. Den hemliga
   Stripe-nyckeln finns aldrig i appen; den bor som en secret
   på servern och lämnar den aldrig.
   ══════════════════════════════════════════════════════════ */

function skarptPa() { return typeof PAPI !== "undefined" && PAPI.pa(); }
function inloggad()  { return skarptPa() && PAPI.jag(); }

function skarptPanelHTML() {
  const c = typeof PAPI !== "undefined" ? PAPI.cfg() : {};
  const pa = skarptPa(), u = inloggad();
  const live = /^pk_live_/.test(c.pk || "");

  return `
  <div class="panel pad-lg" style="margin-top:24px">
    <div class="row" style="justify-content:space-between;align-items:flex-start;gap:14px">
      <div><h3>Skarpt läge</h3>
        <p class="dim small" style="margin-top:6px">Databas, inloggning och riktiga betalningar.</p></div>
      <span class="tag ${pa ? (live ? "red" : "green") : ""}">${pa ? (live ? "Riktiga pengar" : "Testläge") : "Demo"}</span>
    </div>

    ${pa ? "" : `<p class="dim small" style="margin-top:14px">Utan nycklar kör appen som demo: allt sparas bara
      i den här telefonen och inga pengar rör sig. Klistra in de tre publika nycklarna nedan för att koppla på
      riktigt. <b>Klistra aldrig in en nyckel som börjar på <span class="mono">sk_</span></b> — den ska bara
      finnas på servern.</p>`}

    <div class="field" style="margin-top:16px"><label>Supabase URL</label>
      <input class="inp mono" id="cfg-url" placeholder="https://xxxxxxxx.supabase.co" value="${esc(c.url || "")}"></div>
    <div class="field" style="margin-top:12px"><label>Supabase anon key</label>
      <input class="inp mono" id="cfg-anon" placeholder="eyJhbGciOi…" value="${esc(c.anon || "")}"></div>
    <div class="field" style="margin-top:12px"><label>Stripe publishable key</label>
      <input class="inp mono" id="cfg-pk" placeholder="pk_test_…" value="${esc(c.pk || "")}"></div>
    <div class="paysheet-fel" id="cfg-fel" hidden></div>

    <div class="row wrap" style="margin-top:14px">
      <button class="btn btn-p btn-sm" onclick="sparaSkarpt()">${I("check", 15)} Koppla på</button>
      ${pa ? `<button class="btn btn-sm" onclick="stangSkarpt()">Tillbaka till demo</button>` : ""}
    </div>

    ${pa ? `<div style="margin-top:18px;border-top:1px solid var(--rule);padding-top:16px">
      ${u ? `<div class="setrow"><span style="color:var(--green)">${I("check", 20)}</span>
          <div class="t"><b>Inloggad</b><span>${esc(u.email || "")}</span></div>
          <button class="btn btn-sm" onclick="PAPI.loggaUt();render()">Logga ut</button></div>`
        : `<div class="setrow"><span style="color:var(--ink-45)">${I("users", 20)}</span>
          <div class="t"><b>Inte inloggad</b><span>Krävs för att boka och hyra ut</span></div>
          <div class="row" style="gap:8px">
            <button class="btn btn-p btn-sm" onclick="openLogin()">Logga in</button>
            <button class="btn btn-sm" onclick="openSkapaKonto()">Skapa konto</button>
          </div></div>`}
    </div>` : ""}
  </div>`;
}

function sparaSkarpt() {
  const url  = (document.getElementById("cfg-url").value  || "").trim().replace(/\/+$/, "");
  const anon = (document.getElementById("cfg-anon").value || "").trim();
  const pk   = (document.getElementById("cfg-pk").value   || "").trim();
  const fel  = document.getElementById("cfg-fel");
  const visa = m => { fel.textContent = m; fel.hidden = false; return false; };

  /* Skydd mot det farligaste misstaget: hemlig nyckel i webbläsaren. */
  if (/^(sk|rk)_/.test(pk) || /^(sk|rk)_/.test(anon)) {
    return visa("Det där är en hemlig nyckel. Den får aldrig ligga i appen – bara på servern. " +
                "Använd den som börjar på pk_.");
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return visa("Supabase-adressen ser inte rätt ut.");
  if (!/^eyJ/.test(anon)) return visa("Anon-nyckeln ska börja på eyJ.");
  if (!/^pk_(test|live)_/.test(pk)) return visa("Stripe-nyckeln ska börja på pk_test_ eller pk_live_.");

  PAPI.setCfg({ url: url, anon: anon, pk: pk });
  toast(/^pk_live_/.test(pk) ? "Skarpt läge – riktiga pengar" : "Skarpt läge – testkort", "check");
  render();
  return true;
}

function stangSkarpt() {
  PAPI.setCfg({}); PAPI.loggaUt();
  toast("Tillbaka till demo", "check"); render();
}

/* ── Inloggning: sexsiffrig kod till mejlen ───────────────── */

let LOGIN_EFTER = null, LOGIN_EPOST = "";

function loginFel(m) {
  const f = document.getElementById("log-fel");
  if (f) { f.textContent = m; f.hidden = false; }
}

/* ══════════════════════════════════════════════════════════
   KONTO — e-post och lösenord

   Skapa konto → bekräftelsemejl → logga in.
   Ögat visar lösenordet. Glömt lösenord skickar en länk som
   landar här igen och öppnar "välj nytt lösenord".
   ══════════════════════════════════════════════════════════ */

/* Fältet med ögat. type växlas mellan password och text. */
function losenFalt(id, label, autocomplete) {
  return `<div class="field"><label>${label}</label>
    <div class="pwwrap">
      <input class="inp" id="${id}" type="password" autocomplete="${autocomplete}"
        placeholder="Minst 8 tecken">
      <button type="button" class="pweye" aria-label="Visa lösenordet"
        onclick="togglaLosen('${id}', this)">${I("eye", 18)}</button>
    </div></div>`;
}

function togglaLosen(id, knapp) {
  const f = document.getElementById(id); if (!f) return;
  const visas = f.type === "text";
  f.type = visas ? "password" : "text";
  knapp.classList.toggle("on", !visas);
  knapp.setAttribute("aria-label", visas ? "Visa lösenordet" : "Dölj lösenordet");
  f.focus();
}

function epostOk(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

/* ── Logga in ── */
function openLogin(efterat) {
  LOGIN_EFTER = typeof efterat === "function" ? efterat : null;
  openSheet(sheetHead("Logga in") + `<div class="sheet-b stack">
    <div class="field"><label>E-post</label>
      <input class="inp" id="log-epost" type="email" inputmode="email" autocomplete="email"
        placeholder="du@exempel.se" value="${esc(LOGIN_EPOST)}"></div>
    ${losenFalt("log-losen", "Lösenord", "current-password")}
    <div class="paysheet-fel" id="log-fel" hidden></div>
    <button class="btn btn-p btn-lg" style="width:100%" onclick="loggaInNu(this)">Logga in</button>
    <div class="row" style="justify-content:space-between">
      <button class="lnk" onclick="openGlomt()">Glömt lösenordet?</button>
      <button class="lnk" onclick="openSkapaKonto(LOGIN_EFTER)">Ny här? Skapa konto</button>
    </div>
  </div>`);
  const lf = document.getElementById("log-losen");
  if (lf) lf.addEventListener("keydown", e => { if (e.key === "Enter") loggaInNu(); });
  setTimeout(() => { const e = document.getElementById("log-epost"); if (e && !e.value) e.focus(); }, 260);
}

function loggaInNu(knapp) {
  const e = (document.getElementById("log-epost").value || "").trim();
  const p = document.getElementById("log-losen").value || "";
  if (!epostOk(e)) return loginFel("Skriv en riktig mejladress.");
  if (!p) return loginFel("Skriv ditt lösenord.");
  LOGIN_EPOST = e;
  if (knapp) { knapp.disabled = true; knapp.textContent = "Loggar in…"; }
  PAPI.loggaIn(e, p).then(() => {
    closeSheet(); toast("Inloggad", "check");
    const f = LOGIN_EFTER; LOGIN_EFTER = null;
    render(); if (typeof f === "function") setTimeout(f, 120);
  }).catch(err => {
    if (knapp) { knapp.disabled = false; knapp.textContent = "Logga in"; }
    if (/not confirmed/i.test(err.message)) {
      return loginFelMedKnapp("Mejlen är inte bekräftad än. Kolla inkorgen – eller",
        "Skicka bekräftelsen igen", () => skickaBekraftelse(e));
    }
    loginFel(/invalid/i.test(err.message)
      ? "Fel mejl eller lösenord. Försök igen."
      : err.message);
  });
}

function loginFelMedKnapp(text, knappText, fn) {
  const f = document.getElementById("log-fel"); if (!f) return;
  f.innerHTML = esc(text) + ' <button class="lnk" id="log-fel-btn">' + esc(knappText) + "</button>";
  f.hidden = false;
  document.getElementById("log-fel-btn").onclick = fn;
}

function skickaBekraftelse(e) {
  PAPI.skickaBekraftelseIgen(e)
    .then(() => toast("Skickat – kolla inkorgen", "check"))
    .catch(err => toast(err.message, "info"));
}

/* ── Skapa konto ── */
function openSkapaKonto(efterat) {
  LOGIN_EFTER = typeof efterat === "function" ? efterat : null;
  openSheet(sheetHead("Skapa konto") + `<div class="sheet-b stack">
    <div class="field"><label>Namn</label>
      <input class="inp" id="reg-namn" autocomplete="name" placeholder="För- och efternamn"></div>
    <div class="field"><label>E-post</label>
      <input class="inp" id="reg-epost" type="email" inputmode="email" autocomplete="email"
        placeholder="du@exempel.se"></div>
    ${losenFalt("reg-losen", "Välj lösenord", "new-password")}
    <div class="paysheet-fel" id="log-fel" hidden></div>
    <button class="btn btn-p btn-lg" style="width:100%" onclick="skapaKontoNu(this)">Skapa kontot</button>
    <button class="lnk" style="align-self:center" onclick="openLogin(LOGIN_EFTER)">Har du redan ett konto? Logga in</button>
  </div>`);
  setTimeout(() => { const n = document.getElementById("reg-namn"); if (n) n.focus(); }, 260);
}

function skapaKontoNu(knapp) {
  const namn = (document.getElementById("reg-namn").value || "").trim();
  const e = (document.getElementById("reg-epost").value || "").trim();
  const p = document.getElementById("reg-losen").value || "";
  if (namn.length < 2) return loginFel("Skriv ditt namn.");
  if (!epostOk(e)) return loginFel("Skriv en riktig mejladress.");
  if (p.length < 8) return loginFel("Lösenordet behöver minst 8 tecken.");
  LOGIN_EPOST = e;
  if (knapp) { knapp.disabled = true; knapp.textContent = "Skapar kontot…"; }
  PAPI.registrera(e, p, namn).then(r => {
    if (r.klar) {
      closeSheet(); toast("Välkommen till Parkla", "check");
      const f = LOGIN_EFTER; LOGIN_EFTER = null;
      render(); if (typeof f === "function") setTimeout(f, 120);
      return;
    }
    openSheet(sheetHead("Bekräfta din mejl") + `<div class="sheet-b center" style="padding-top:26px">
      <div class="tick" style="background:var(--pine)">${I("message", 28)}</div>
      <h3 style="font-family:var(--display);font-size:1.4rem;margin-top:16px">Ett mejl är på väg</h3>
      <p class="dim" style="margin-top:10px;max-width:38ch;margin-inline:auto">Vi skickade en länk till
        <b>${esc(e)}</b>. Tryck på den så är kontot klart – sedan loggar du in här.</p>
      <button class="btn btn-p btn-block btn-lg" style="margin-top:22px" onclick="openLogin(LOGIN_EFTER)">Till inloggningen</button>
      <button class="lnk" style="margin-top:12px" onclick="skickaBekraftelse('${esc(e)}')">Fick du inget mejl? Skicka igen</button>
    </div>`);
  }).catch(err => {
    if (knapp) { knapp.disabled = false; knapp.textContent = "Skapa kontot"; }
    loginFel(/already registered|already been registered/i.test(err.message)
      ? "Den mejladressen har redan ett konto. Logga in i stället."
      : err.message);
  });
}

/* ── Glömt lösenordet ── */
function openGlomt() {
  openSheet(sheetHead("Glömt lösenordet") + `<div class="sheet-b stack">
    <p class="dim">Skriv din mejladress så skickar vi en länk där du väljer ett nytt.</p>
    <div class="field"><label>E-post</label>
      <input class="inp" id="glm-epost" type="email" inputmode="email" autocomplete="email"
        placeholder="du@exempel.se" value="${esc(LOGIN_EPOST)}"></div>
    <div class="paysheet-fel" id="log-fel" hidden></div>
    <button class="btn btn-p btn-lg" style="width:100%" onclick="glomtSkicka(this)">Skicka länken</button>
    <button class="lnk" style="align-self:center" onclick="openLogin(LOGIN_EFTER)">Tillbaka till inloggningen</button>
  </div>`);
  setTimeout(() => { const e = document.getElementById("glm-epost"); if (e && !e.value) e.focus(); }, 260);
}

function glomtSkicka(knapp) {
  const e = (document.getElementById("glm-epost").value || "").trim();
  if (!epostOk(e)) return loginFel("Skriv en riktig mejladress.");
  LOGIN_EPOST = e;
  if (knapp) { knapp.disabled = true; knapp.textContent = "Skickar…"; }
  PAPI.glomtLosen(e).then(() => {
    openSheet(sheetHead("Kolla mejlen") + `<div class="sheet-b center" style="padding-top:26px">
      <div class="tick" style="background:var(--pine)">${I("message", 28)}</div>
      <p class="dim" style="margin-top:16px;max-width:38ch;margin-inline:auto">Finns det ett konto på
        <b>${esc(e)}</b> ligger en återställningslänk i inkorgen inom någon minut.</p>
      <button class="btn btn-block" style="margin-top:22px" onclick="closeSheet()">Stäng</button>
    </div>`);
  }).catch(err => {
    if (knapp) { knapp.disabled = false; knapp.textContent = "Skicka länken"; }
    loginFel(err.message);
  });
}

/* ── Nytt lösenord — hit landar återställningslänken ── */
function openNyttLosen(bearer) {
  openSheet(sheetHead("Välj nytt lösenord") + `<div class="sheet-b stack">
    ${losenFalt("nyl-losen", "Nytt lösenord", "new-password")}
    ${losenFalt("nyl-losen2", "Samma en gång till", "new-password")}
    <div class="paysheet-fel" id="log-fel" hidden></div>
    <button class="btn btn-p btn-lg" style="width:100%" onclick="sparaNyttLosen(this, '${esc(bearer)}')">Byt lösenordet</button>
  </div>`);
  setTimeout(() => { const f = document.getElementById("nyl-losen"); if (f) f.focus(); }, 260);
}

function sparaNyttLosen(knapp, bearer) {
  const p1 = document.getElementById("nyl-losen").value || "";
  const p2 = document.getElementById("nyl-losen2").value || "";
  if (p1.length < 8) return loginFel("Minst 8 tecken.");
  if (p1 !== p2) return loginFel("Lösenorden är inte likadana.");
  if (knapp) { knapp.disabled = true; knapp.textContent = "Byter…"; }
  PAPI.sattNyttLosen(p1, bearer).then(u => {
    /* Återställningstokenet ÄR en session — logga in direkt. */
    PAPI.setSessRaw({ token: bearer, refresh: (window.__AUTH || {}).refresh_token || "",
      gar_ut: Date.now() + 3000 * 1000, user: u });
    window.__AUTH = null;
    closeSheet(); toast("Lösenordet är bytt – du är inloggad", "check"); render();
  }).catch(err => {
    if (knapp) { knapp.disabled = false; knapp.textContent = "Byt lösenordet"; }
    loginFel(err.message);
  });
}

/* Kräv inloggning innan något som kostar pengar. I demo krävs inget. */
function kravInlogg(fortsatt) {
  if (!skarptPa()) return fortsatt();
  if (PAPI.jag()) return fortsatt();
  openLogin(fortsatt);
}


/* ============================================================
   JURIDIK — utkast, granskas juridiskt innan skarp lansering.
   Genererade ur legal/*.md. Andra dar, inte har.
   ============================================================ */
function legalPage(title, body) {
  return `
<section class="tight"><div class="wrap" style="max-width:820px">
  <span class="kicker" data-reveal>Juridik</span>
  <h1 style="margin:14px 0 18px;font-size:clamp(1.9rem,4.4vw,3rem)">${title}</h1>
  ${body}
  <p class="muted small" style="margin-top:26px">Har du en fraga om villkoren? Mejla hej@parkla.se.</p>
</div></section>
${footerHTML()}`;
}
function viewVillkor() { return legalPage("Användarvillkor", `<div class="callout brass"><b>UTKAST — måste granskas av jurist innan publicering.</b></div><div class="callout" style="margin-top:10px">Det här är ett arbetsutkast, inte färdiga villkor. Det är anpassat efter hur Parkla fungerar men ersätter inte juridisk rådgivning. Låt en jurist granska och komplettera innan tjänsten släpps skarpt — särskilt kapitlen om betalning, ansvar, Parkla Trygg och konsumenträtt.</div><h2 style="font-size:1.15rem;margin:26px 0 8px">1. Om Parkla och dessa villkor</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">1.1 Parkla ("<b>Parkla</b>", "<b>vi</b>", "<b>oss</b>") drivs av Westros Digital Retail AB, org.nr 559499-1035, med adress Slakterigatan 10, 721 32 Västerås och e-post hej@parkla.se.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">1.2 Parkla är en <b>förmedlingstjänst</b>. Vi tillhandahåller en digital marknadsplats där en privatperson som förfogar över en parkeringsyta ("<b>Värd</b>") kan erbjuda den till en annan användare som behöver parkera ("<b>Förare</b>"). Vi tillhandahåller även betalningshantering och kringtjänster.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">1.3 <b>Parkla är inte part i avtalet mellan Värd och Förare.</b> Själva upplåtelsen av parkeringsytan är ett avtal som ingås direkt mellan Värd och Förare. Parkla förmedlar kontakten och hanterar betalningen, men äger, hyr, kontrollerar eller ansvarar inte för själva parkeringsplatserna.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">1.4 Genom att skapa ett konto eller använda Parkla godkänner du dessa villkor. Godkänner du dem inte ska du inte använda tjänsten.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">2. Definitioner</h2><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Plats</b> – den parkeringsyta en Värd lägger upp (uppfart, carport, garage,</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">innergård eller tomt).</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Bokning</b> – en Förares reservation av en Plats för en bestämd tid.</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Kör-in</b> – att en Förare ställer sig på en Plats som är öppen just nu, utan</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">bokning i förväg, och betalar för den tid hen faktiskt står.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Parkla Trygg</b> – Parklas egen trygghetsgaranti enligt kapitel 9. Det är en</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">garanti från Parkla, <b>inte en försäkring</b>.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Avgifter</b> – de belopp Parkla tar ut enligt kapitel 6 och den vid var tid</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">gällande prislistan i tjänsten.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">3. Vem får använda Parkla</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">3.1 Du måste vara <b>minst 18 år</b> och ha rättslig handlingsförmåga.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">3.2 Du ansvarar för att uppgifterna du lämnar är korrekta och hålls uppdaterade, och för all aktivitet som sker via ditt konto. Du ska skydda ditt lösenord och genast meddela oss vid misstänkt obehörig användning.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">3.3 Vid skarp lansering kan Parkla kräva legitimering med BankID innan du kan boka eller lägga upp en Plats. Parkla får neka eller stänga av en användare som lämnar felaktiga uppgifter, missbrukar tjänsten eller bryter mot dessa villkor.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">4. Att lägga upp en Plats (Värd)</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">4.1 Du får bara lägga upp en Plats som du <b>själv förfogar över</b>. Bor du i bostadsrätt eller hyresrätt, eller ingår Platsen i en samfällighet, krävs tillstånd från föreningen, hyresvärden eller samfälligheten innan du hyr ut. Du ansvarar för att sådant tillstånd finns.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">4.2 Du ansvarar för att din information om Platsen är korrekt – läge, mått, tillgänglighet, pris och instruktioner – och för att Platsen är användbar och säker att köra in på under bokad tid.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">4.3 <b>Upplåtelsen avser en yta, inte förvaring av fordon.</b> Värden tar aldrig emot fordonet, har inte hand om nyckeln och åtar sig ingen tillsyn eller vård av fordonet. Därmed uppstår ingen vårdplikt för Värden. Föraren parkerar på egen risk, precis som på gatan.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">4.4 Du ansvarar själv för att uthyrningen är tillåten enligt lag och regler som gäller för din fastighet, till exempel plan- och bygglagen och detaljplanebestämmelser. Se informationen under *Skatt och regler* i tjänsten.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">5. Att boka och parkera (Förare)</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">5.1 När du bokar en Plats, eller kör in på en Plats som är öppen, ingår du ett avtal med Värden om att få nyttja ytan under angiven tid mot betalning.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">5.2 Du ska lämna Platsen senast vid bokningens sluttid, följa Värdens instruktioner och inte använda Platsen till annat än att parkera det fordon du angett. Du får inte överlåta din bokning till någon annan.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">5.3 <b>Ditt fordon är ditt ansvar.</b> Skador på, stöld av eller ur ditt eget fordon täcks av din egen fordons- eller vagnskadeförsäkring, inte av Värden eller Parkla.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">5.4 Står du kvar efter sluttiden tillkommer en övertidsersättning enligt den prislista som visas innan du bokar (se kapitel 6). Övertidsersättning är en i förväg avtalad ersättning för fortsatt nyttjande – <b>inte</b> en kontrollavgift enligt lagen om kontrollavgift vid olovlig parkering.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">6. Priser, avgifter och betalning</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">6.1 Värden bestämmer sitt pris. Ovanpå Värdens pris tar Parkla ut de avgifter som framgår av prislistan i tjänsten – i dagsläget en serviceavgift från Föraren, en andel av Värdens hyra samt en avgift för Parkla Trygg. Samtliga belopp visas för Föraren innan bokningen bekräftas.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">6.2 Betalning sker via vår betalningspartner <b>Stripe</b>. Genom att betala godkänner du även Stripes villkor. Parkla lagrar aldrig dina fullständiga kortuppgifter.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">6.3 <b>Utbetalning till Värd.</b> Värdens andel betalas ut via Stripe till det konto Värden kopplat. För att kunna ta emot betalning måste Värden slutföra Stripes identitets- och kontokontroll. Parkla håller inte Värdens pengar och gör inga manuella utbetalningar.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">6.4 <b>Kör-in och reservation.</b> Vid kör-in reserveras ett takbelopp på Förarens kort när parkeringen påbörjas. När Föraren avslutar dras endast beloppet för den tid som faktiskt stått, och resten av reservationen släpps.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">6.5 <b>Avbokning och återbetalning.</b> En bokning kan avbokas enligt de villkor som visas vid bokningstillfället. I dagsläget: avbokning tidigare än 24 timmar före start ger hela beloppet åter, senare än så halva beloppet. En bokning som kräver Värdens godkännande debiteras inte förrän Värden tackat ja.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">7. Ångerrätt (konsument)</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">7.1 Vid distansavtal har en konsument som huvudregel 14 dagars ångerrätt enligt lagen om distansavtal och avtal utanför affärslokaler.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">7.2 Ångerrätten gäller <b>inte</b> för en tjänst som ska utföras en bestämd dag eller under en bestämd tidsperiod (t.ex. en parkering en viss dag eller en säsong), när du uttryckligen begärt att tjänsten ska påbörjas. Du bekräftar detta i samband med bokningen. *(Denna punkt måste granskas av jurist mot gällande konsumenträtt.)*</p><h2 style="font-size:1.15rem;margin:26px 0 8px">8. Uppförande och otillåten användning</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Du får inte: lägga upp en Plats du inte förfogar över; lämna vilseledande uppgifter; kringgå Parkla för att undvika avgifter; använda tjänsten för något olagligt; trakassera andra användare; eller försöka störa eller kringgå tjänstens säkerhet. Brott mot detta kan leda till avstängning och, i allvarliga fall, polisanmälan.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">9. Parkla Trygg (trygghetsgaranti)</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">9.1 Parkla Trygg är en <b>frivillig garanti från Parkla</b>, inte en försäkring. Parkla ersätter ur egen ficka enligt dessa villkor och tar därefter över kravet mot den som orsakat skadan. Ordet "försäkring" används inte, eftersom försäkringsverksamhet kräver tillstånd från Finansinspektionen.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">9.2 När garantin är i drift ersätter den en Värd för skada som en Förare orsakat på Värdens egendom under en bokning – upp till det belopp och enligt de villkor som anges i tjänsten (bl.a. anmälan inom viss tid samt foto före och efter).</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">9.3 Garantin omfattar <b>inte</b>: Förarens eget fordon; stöld ur eller av fordon; bärgning eller flyttning av fordon; skador av snö, halka eller väder; skador som fanns före bokningen; eller skada som Värden själv orsakat.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">9.4 Garantins tak och exakta villkor framgår av tjänsten och kan komma att ändras. Tills garantin backas av en försäkringspartner bär Parkla risken själv med ett lägre tak per händelse.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">10. Bärgning och fordon som lämnas kvar</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Parkla bärgar eller flyttar inte fordon. Flyttning av fordon från tomtmark är enligt lagen om flyttning av fordon en fråga för kommunen eller Polismyndigheten på markägarens begäran. Vid fara för liv eller egendom ska 112 kontaktas.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">11. Skatt</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Värden ansvarar själv för att redovisa och betala eventuell skatt på sina intäkter. Parkla är en rapporteringsskyldig plattform enligt EU:s DAC7-regler och rapporterar Värdens ersättning till Skatteverket samt lämnar Värden motsvarande underlag. Informationen under *Skatt och regler* är en sammanfattning, inte skatterådgivning.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">12. Parklas ansvar</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">12.1 Parkla tillhandahåller en förmedlings- och betaltjänst. Vi ansvarar inte för Värdars eller Förares agerande, för Platsers skick eller tillgänglighet, eller för avtalet dem emellan.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">12.2 Parkla ansvarar inte för indirekta skador eller följdskador. Parklas sammanlagda ansvar gentemot en användare för en enskild bokning är, i den mån lag tillåter, begränsat till de avgifter Parkla tagit ut för just den bokningen. Inget i dessa villkor begränsar ansvar som enligt tvingande lag inte får begränsas, t.ex. vid uppsåt eller grov vårdslöshet, eller en konsuments tvingande rättigheter.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">12.3 Parkla ansvarar inte för avbrott eller fel som beror på omständigheter utanför vår rimliga kontroll (force majeure).</p><h2 style="font-size:1.15rem;margin:26px 0 8px">13. Ändringar, uppsägning och giltighet</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">13.1 Vi kan uppdatera dessa villkor. Väsentliga ändringar meddelas i tjänsten eller via e-post i skälig tid innan de träder i kraft.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">13.2 Du kan när som helst avsluta ditt konto. Vi kan säga upp eller stänga av ett konto vid brott mot villkoren eller om det krävs enligt lag. Bokningar och betalningar som redan genomförts påverkas inte.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">14. Tillämplig lag och tvist</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">14.1 Svensk lag gäller.</p><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">14.2 Är du konsument kan du vända dig till Allmänna reklamationsnämnden (ARN), Box 174, 101 23 Stockholm, arn.se, eller till EU:s plattform för tvistlösning online. Tvist kan även prövas av allmän domstol.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">15. Kontakt</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Westros Digital Retail AB · org.nr 559499-1035 · Slakterigatan 10, 721 32 Västerås · hej@parkla.se</p>`); }
function viewIntegritet() { return legalPage("Integritetspolicy", `<div class="callout brass"><b>UTKAST — måste granskas av jurist/dataskyddsexpert innan publicering.</b></div><div class="callout" style="margin-top:10px">Arbetsutkast enligt EU:s dataskyddsförordning (GDPR). Anpassat efter hur Parkla är byggt, men ska granskas och kompletteras – särskilt med personuppgiftsbiträdesavtal och en slutlig lista över mottagare – innan tjänsten släpps skarpt.</div><h2 style="font-size:1.15rem;margin:26px 0 8px">1. Personuppgiftsansvarig</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Westros Digital Retail AB, org.nr 559499-1035, Slakterigatan 10, 721 32 Västerås, ansvarar för behandlingen av dina personuppgifter i Parkla. Kontakt i dataskyddsfrågor: hej@parkla.se.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">2. Vilka uppgifter vi behandlar</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Beroende på hur du använder Parkla behandlar vi:</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Kontouppgifter</b> – namn, e-postadress, lösenord (krypterat) och, vid skarp</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">lansering, legitimering via BankID.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Kontaktuppgifter</b> – telefonnummer om du anger det.</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Uppgifter om en Plats</b> (Värd) – adress och läge, beskrivning, pris och</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">öppettider. Exakt adress visas för en Förare först vid en aktiv bokning.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Bokningsuppgifter</b> – vilka platser, tider och belopp, samt fordonets</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">registreringsnummer.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Betaluppgifter</b> – hanteras av vår betalningspartner Stripe. Parkla lagrar</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">aldrig dina fullständiga kortuppgifter, endast referens och status.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Platsdata</b> – ungefärlig eller exakt position om du väljer att aktivera</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">platstjänster i din enhet. Detta är frivilligt.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Kommunikation</b> – meddelanden mellan användare och med vår kundtjänst.</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Teknisk data</b> – enhet, webbläsare, IP-adress och loggar, för säkerhet och</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">drift.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">3. Varför vi behandlar uppgifterna och med vilken laglig grund</h2><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Ändamål</span><b style="text-align:right;max-width:24ch">Laglig grund</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Skapa och hantera ditt konto, genomföra bokningar och betalningar</span><b style="text-align:right;max-width:24ch">Fullgörande av avtal</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Ta ut avgifter och betala ut till Värd</span><b style="text-align:right;max-width:24ch">Fullgörande av avtal</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Förebygga bedrägeri och missbruk, hålla tjänsten säker</span><b style="text-align:right;max-width:24ch">Berättigat intresse</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Kundtjänst och support</span><b style="text-align:right;max-width:24ch">Fullgörande av avtal / berättigat intresse</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Bokföring</span><b style="text-align:right;max-width:24ch">Rättslig förpliktelse (bokföringslagen)</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Rapportering av Värdars ersättning till Skatteverket</span><b style="text-align:right;max-width:24ch">Rättslig förpliktelse (DAC7)</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Platstjänster i appen</span><b style="text-align:right;max-width:24ch">Samtycke (kan återkallas när som helst)</b></div><div class="kv" style="align-items:flex-start"><span style="max-width:52ch">Utskick om nyheter, om du valt det</span><b style="text-align:right;max-width:24ch">Samtycke</b></div><h2 style="font-size:1.15rem;margin:26px 0 8px">4. Vilka som får del av uppgifterna</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Vi säljer aldrig dina uppgifter. Vi delar dem endast med:</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Andra användare i den utsträckning en bokning kräver</b> – en Värd ser</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Förarens namn och registreringsnummer för en bokning; en Förare ser Platsens uppgifter och, vid aktiv bokning, exakt adress och eventuell portkod. Ditt telefonnummer lämnas inte ut.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Personuppgiftsbiträden</b> som behandlar uppgifter för vår räkning, bland annat:</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Stripe</b> – betalningar och utbetalningar.</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Supabase</b> – databas och drift (servrar inom EU, Stockholm).</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">E-postleverantör för aviseringar och inloggningsmejl.</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Myndigheter</b> när lag kräver det, t.ex. Skatteverket enligt DAC7.</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Med varje biträde finns eller ska finnas ett personuppgiftsbiträdesavtal.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">5. Överföring utanför EU/EES</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Vi strävar efter att behandla uppgifter inom EU/EES. Databasen ligger i EU (Stockholm). Vissa leverantörer, t.ex. Stripe, kan behandla uppgifter i tredje land; det sker i så fall med lagens skyddsåtgärder, som EU-kommissionens standardavtalsklausuler.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">6. Hur länge vi sparar uppgifterna</h2><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Kontouppgifter</b> – så länge du har ett konto. Avslutar du kontot raderar</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">eller anonymiserar vi uppgifterna.</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch"><b>Boknings- och betalningsunderlag</b> – sparas så länge det krävs enligt</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">bokföringslagen (sju år).</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">När vi anonymiserar behåller vi ekonomiska poster utan koppling till dig som</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">person.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">7. Dina rättigheter</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Du har rätt att:</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">få veta vilka uppgifter vi behandlar om dig (registerutdrag),</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">få felaktiga uppgifter rättade,</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">få uppgifter raderade ("rätten att bli bortglömd"), i den mån vi inte måste</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">behålla dem enligt lag,</p><ul class="numlist2" style="margin:0 0 10px"><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">begära begränsning av eller invända mot viss behandling,</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">få ut uppgifter du lämnat i ett maskinläsbart format (dataportabilitet),</li><li style="margin:0 0 6px;line-height:1.55;max-width:68ch">återkalla ett samtycke när som helst.</li></ul><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Kontakta oss på hej@parkla.se. Du har också rätt att klaga till <b>Integritetsskyddsmyndigheten (IMY)</b>, Box 8114, 104 20 Stockholm, imy.se.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">8. Cookies och lokal lagring</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Parkla sparar inställningar och sessionsdata lokalt i din webbläsare (localStorage) för att appen ska fungera – det är inte spårningscookies för marknadsföring. Om du samtycker kan vi använda en pixel från Meta (Facebook) för att mäta hur våra annonser fungerar; den är avstängd tills du aktivt tackat ja, och du kan alltid tacka nej. Kartan använder en kart­tjänst som kan hämta kartrutor från en extern leverantör. En fullständig cookie- och lagringsförteckning läggs till innan skarp lansering.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">9. Säkerhet</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Vi använder tekniska och organisatoriska åtgärder för att skydda dina uppgifter, bland annat krypterad överföring, åtkomstkontroll på databasnivå och att känsliga uppgifter som portkoder och exakt adress bara lämnas ut till den som har en aktiv bokning.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">10. Barn</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Parkla riktar sig inte till personer under 18 år och vi behandlar inte medvetet uppgifter om barn.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">11. Ändringar</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Vi kan uppdatera denna policy. Väsentliga ändringar meddelas i tjänsten eller via e-post.</p><h2 style="font-size:1.15rem;margin:26px 0 8px">12. Kontakt</h2><p class="dim" style="margin:0 0 10px;line-height:1.6;max-width:70ch">Westros Digital Retail AB · org.nr 559499-1035 · Slakterigatan 10, 721 32 Västerås · hej@parkla.se</p>`); }

const VIEWS = {
  hem: viewHem, start: viewStart, sok: viewSok, hyrut: viewHyrut, mina: viewMina, mer: viewMer,
  trygg: viewTrygg, priser: viewPriser, skatt: viewSkatt, brf: viewBrf, affar: viewAffar,
  villkor: viewVillkor, integritet: viewIntegritet,
  evenemang: viewEvenemang, meddelanden: viewMeddelanden, installningar: viewInstallningar, bjudin: viewBjudin,
  vinterforvar: viewVinter
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
  let sb = document.getElementById("sessbox");
  if (!sb) { sb = document.createElement("div"); sb.id = "sessbox"; document.body.appendChild(sb); }
  sb.innerHTML = sessionBarHTML();
  document.body.classList.toggle("harsession", !!SESSION);
  tickSession();
  const dot = document.getElementById("notisDot");
  if (dot) dot.classList.toggle("on", NOTIS.some(n => n.unread));
  document.documentElement.lang = SET.lang;
  observeReveals();
  countUps();
  renderConsent();
  if (S.route === "hem") setTimeout(() => { mountMap("lmap", { fit: true, pad: 40 }); autoLocateHem(); }, 40);
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

/* Alltid en väg till hjälpen, oavsett var man är. */
(function helpFab() {
  const b = document.createElement("button");
  b.className = "helpfab";
  b.setAttribute("aria-label", "Hjälp – visa hur appen funkar");
  b.innerHTML = I("info", 20) + "<span>Hjälp</span>";
  b.onclick = () => openSheet(sheetHead("Behöver du hjälp?") + `<div class="sheet-b stack">
    <button class="helpcard" onclick="closeSheet();startTour()">
      <span class="ic">${I("play", 22)}</span>
      <span class="t"><b>Visa mig hur appen funkar</b><span>En snabb rundtur, 30 sekunder</span></span></button>
    <button class="helpcard" onclick="closeSheet();go('sok')">
      <span class="ic">${I("search", 22)}</span>
      <span class="t"><b>Jag vill hitta en parkering</b><span>Sök på karta eller adress</span></span></button>
    <button class="helpcard" onclick="closeSheet();go('hyrut')">
      <span class="ic">${I("wallet", 22)}</span>
      <span class="t"><b>Jag vill hyra ut min plats</b><span>Räkna ut vad den är värd</span></span></button>
    <button class="helpcard" onclick="closeSheet();go('mer')">
      <span class="ic">${I("message", 22)}</span>
      <span class="t"><b>Vanliga frågor</b><span>Svar på det folk brukar undra</span></span></button>
    <div class="hint">${I("info", 17)}<div>Texten kan göras större under Inställningar om den känns liten.</div></div>
  </div>`);
  document.body.appendChild(b);
})();
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
initMetaPixel();
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
