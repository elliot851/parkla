/* ============================================================
   Parkla – applogik
   ============================================================ */
"use strict";

/* ---------------- Lagring ---------------- */
const NS = "parkla.v2.";
const LS = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(NS + k); } catch (e) {} }
};

/* ---------------- Inställningar ---------------- */
const DEFAULT_SETTINGS = {
  theme: "system", lang: "sv", currency: "SEK", unit: "km",
  city: "sthlm", role: null,
  notis: { bokning: true, betalning: true, pris: true, evenemang: true, nyheter: false },
  bigText: false, reduceMotion: false
};
let SET = Object.assign({}, DEFAULT_SETTINGS, LS.get("settings", {}));
SET.notis = Object.assign({}, DEFAULT_SETTINGS.notis, SET.notis || {});
function saveSettings() { LS.set("settings", SET); applyTheme(); }
function applyTheme() {
  const el = document.documentElement;
  if (SET.theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", SET.theme);
  document.body.style.fontSize = SET.bigText ? "17.5px" : "";
}

/* ---------------- Persistent data ---------------- */
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
  area: SET.city, mode: "manad", view: "lista",
  q: "", maxPrice: 0, filterCharge: false, filterGarage: false, filterSecure: false,
  filterBig: false, sort: "pris",
  calc: { city: "Stockholm innerstad", type: "Uppfart", walk: 5, charger: false, gated: false, dyn: true },
  wizard: { step: 0, ad: "", type: "Uppfart", size: "Personbil", pris: 0, tid: "Alltid", info: "", charger: false, gated: false, cam: false, dyn: true },
  bk: null, selSpot: null
};

/* ---------------- Hjälpare ---------------- */
const t = k => (I18N[SET.lang] && I18N[SET.lang][k]) || I18N.sv[k] || k;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function money(sek, opts) {
  const c = CURRENCIES[SET.currency] || CURRENCIES.SEK;
  const v = sek * c.rate;
  const dec = (c.rate < 0.5 && v < 100 && !(opts && opts.round)) ? (v % 1 !== 0 ? 2 : 0) : 0;
  const n = v.toLocaleString(SET.lang === "sv" ? "sv-SE" : "en-GB", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return c.after ? `${n} ${c.sym}` : `${c.sym}${n}`;
}
const kr = money;
function moneyPlain(sek) {
  const c = CURRENCIES[SET.currency] || CURRENCIES.SEK;
  return Math.round(sek * c.rate).toLocaleString(SET.lang === "sv" ? "sv-SE" : "en-GB");
}
function curSym() { return (CURRENCIES[SET.currency] || CURRENCIES.SEK).sym; }

function priceFor(sp, mode) { return mode === "evenemang" ? sp.ev : mode === "timme" ? sp.h : mode === "dygn" ? sp.d : mode === "vecka" ? sp.w : sp.m; }
function unitFor(mode) { return mode === "evenemang" ? t("per_event") : mode === "timme" ? t("per_hour") : mode === "dygn" ? t("per_day") : mode === "vecka" ? t("per_week") : t("per_month"); }
function stars(r) { return "★ " + r.toFixed(1).replace(".", SET.lang === "sv" ? "," : "."); }
function reviewsFor(id) { return REVIEWS[id] || DEFAULT_REVIEWS; }

function feeSplit(base, mode) {
  const monthly = mode === "manad";
  const service = Math.round(base * (monthly ? FEES.driverPctMonthly : FEES.driverPct));
  const hostFee = Math.round(base * (monthly ? FEES.hostPctMonthly : FEES.hostPct));
  const trygg = monthly ? FEES.tryggMonthly : FEES.tryggShort;
  return { base, service, trygg, hostFee, hostNet: base - hostFee, driverTotal: base + service + trygg };
}

function priceSuggest(city, type, walk, charger, gated) {
  const b = CITY_BASE[city] || CITY_BASE["Övrig stad/tätort"];
  const m = TYPE_MULT[type] || 1;
  const walkMult = walk <= 3 ? 1.18 : walk <= 6 ? 1.08 : walk <= 10 ? 1.0 : walk <= 15 ? 0.88 : 0.70;
  const f = m * walkMult * (charger ? 1.28 : 1) * (gated ? 1.07 : 1);
  return {
    month: Math.round(b.m * f / 10) * 10,
    day: Math.round(b.d * f / 5) * 5,
    hour: b.h ? Math.max(5, Math.round(b.h * f)) : 0,
    week: Math.round(b.d * f * 4.6 / 10) * 10,
    event: Math.round(b.d * f * 1.9 / 10) * 10
  };
}

/* ---------------- UI-primitiver ---------------- */
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("on");
  clearTimeout(el._x); el._x = setTimeout(() => el.classList.remove("on"), 2600);
}
function openSheet(html) {
  document.getElementById("sheetContent").innerHTML = html;
  document.getElementById("sheet").classList.add("on");
  document.getElementById("scrim").classList.add("on");
  document.getElementById("sheet").scrollTop = 0;
}
function closeSheet() {
  document.getElementById("sheet").classList.remove("on");
  document.getElementById("scrim").classList.remove("on");
}
function go(r) {
  if (r === S.route) { window.scrollTo(0, 0); return; }
  S.route = r; history.replaceState(null, "", "#" + r);
  window.scrollTo(0, 0); render();
}
function sheetHead(title) {
  return `<div class="sheet-h"><h3>${esc(title)}</h3><button class="x" onclick="closeSheet()" aria-label="${t("close")}">✕</button></div>`;
}

/* ---------------- Sidfot & meny ---------------- */
function navHTML() {
  const items = [["sok", t("nav_find")], ["hyrut", t("nav_rent")], ["evenemang", "Evenemang"],
                 ["trygg", t("nav_trust")], ["priser", t("nav_price")], ["mina", t("nav_me")]];
  return items.map(([r, l]) => `<a href="#${r}" data-go="${r}" class="${S.route === r ? "on" : ""}">${esc(l)}</a>`).join("")
    + `<a href="#sok" data-go="sok" class="cta">${esc(t("nav_cta"))}</a>`;
}
function tabbarHTML() {
  const unread = NOTIS.filter(n => n.unread).length;
  const items = [["start", "🏠", t("tab_start"), 0], ["sok", "🔍", t("tab_search"), 0],
                 ["hyrut", "💰", t("tab_rent"), 0], ["mina", "🧾", t("tab_me"), BOOKINGS.length],
                 ["mer", "⋯", t("tab_more"), unread]];
  return items.map(([r, i, l, b]) => `<button data-go="${r}" class="${S.route === r ? "on" : ""}">
    <span class="ic" aria-hidden="true">${i}</span>${esc(l)}${b ? `<span class="badge">${b}</span>` : ""}</button>`).join("");
}
function footerHTML() {
  return `
<footer><div class="wrap">
  <div class="fgrid">
    <div>
      <div class="row" style="gap:9px;margin-bottom:10px">
        <svg viewBox="0 0 40 40" style="width:30px;height:30px;border-radius:9px"><rect width="40" height="40" rx="11" fill="var(--green)"/><path d="M7 19.5 20 9l13 10.5" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 31V18.5h6.6a4.6 4.6 0 0 1 0 9.2H15" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <b style="font-size:19px;letter-spacing:-.03em">Parkla</b>
      </div>
      <p class="muted" style="font-size:14px;max-width:32ch">Sveriges marknadsplats för privata parkeringsplatser. Din uppfart står tom 22 timmar om dygnet.</p>
      <p class="muted" style="font-size:12.5px;margin-top:12px">Prototyp med demodata · v${VERSION}</p>
    </div>
    <div><h5>För förare</h5><ul>
      <li><a href="#sok" data-go="sok">Hitta parkering</a></li>
      <li><a href="#evenemang" data-go="evenemang">Evenemang</a></li>
      <li><a href="#trygg" data-go="trygg">Så fungerar det</a></li>
      <li><a href="#priser" data-go="priser">Priser</a></li></ul></div>
    <div><h5>För värdar</h5><ul>
      <li><a href="#hyrut" data-go="hyrut">Hyr ut din plats</a></li>
      <li><a href="#skatt" data-go="skatt">Skatt &amp; regler</a></li>
      <li><a href="#brf" data-go="brf">BRF &amp; fastighetsägare</a></li>
      <li><a href="#bjudin" data-go="bjudin">Bjud in en vän</a></li></ul></div>
    <div><h5>Parkla</h5><ul>
      <li><a href="#affar" data-go="affar">Affärsmodell</a></li>
      <li><a href="#installningar" data-go="installningar">Inställningar</a></li>
      <li><a href="#mer" data-go="mer">Vanliga frågor</a></li>
      <li>hej@parkla.se</li></ul></div>
  </div>
</div></footer>`;
}

/* ============================================================
   VY: START
   ============================================================ */
function viewStart() {
  const sug = priceSuggest("Stockholm innerstad", "Uppfart", 5, false, false);
  const nextEvent = EVENTS[0];
  return `
<div class="hero"><div class="wrap"><div class="hero-grid">
  <div>
    <span class="pill green" style="margin-bottom:15px">🇸🇪 Byggd för Sverige · BankID · Swish</span>
    <h1>Din uppfart står tom. Den kan ge dig <span style="color:var(--green)">${moneyPlain(FEES.schablon)} ${curSym()}</span> skattefritt om året.</h1>
    <p class="lead">Parkla kopplar ihop dig som har en ledig p-plats, uppfart eller garage med grannar och besökare som desperat behöver en. Du sätter priset. Vi sköter betalning, trygghetsgaranti och legitimering.</p>
    <div class="hero-cta">
      <button class="btn btn-p btn-lg" data-go="hyrut">💰 Räkna ut vad din plats ger</button>
      <button class="btn btn-g btn-lg" data-go="sok">Hitta parkering</button>
    </div>
    <div class="hero-stats">
      <div><b class="num">${kr(sug.month)}</b><span>Snittintäkt/mån, Sthlm innerstad</span></div>
      <div><b class="num">${kr(FEES.schablon)}</b><span>Skattefritt per bostad och år</span></div>
      <div><b class="num">${SPOTS.length}</b><span>Platser i demon, ${AREAS.length} områden</span></div>
    </div>
  </div>
  <div>
    <div class="phone">
      <div class="phone-top">
        <div class="t">Nästa utbetalning</div>
        <div style="font-size:31px;font-weight:800;letter-spacing:-.03em;margin-top:4px">${kr(2015)}</div>
        <div style="font-size:12.5px;opacity:.85;margin-top:2px">Ringvägen 41 · månadskontrakt · 25 aug</div>
      </div>
      <div class="phone-body">
        <div class="mini"><div class="ph">🚘</div><div><div class="nm">ABC 123 · Volvo XC40</div><div class="sub">Står nu · till 31 aug</div></div><div class="pr" style="color:var(--green)">Aktiv</div></div>
        <div class="mini"><div class="ph">⚡</div><div><div class="nm">Laddning</div><div class="sub">18,4 kWh denna vecka</div></div><div class="pr">+${kr(92)}</div></div>
        <div class="mini"><div class="ph">🧾</div><div><div class="nm">Skattefritt kvar i år</div><div class="sub">${moneyPlain(14820)} av ${moneyPlain(FEES.schablon)} ${curSym()} använt</div></div><div class="pr">63 %</div></div>
        <div style="padding:2px 2px 4px"><div class="meter"><i style="width:37%"></i></div></div>
      </div>
    </div>
  </div>
</div></div></div>

<section style="padding-top:18px"><div class="wrap">
  <div class="banner"><b>Så här ligger det till:</b> officiell parkering vid Arlanda kostar 1 495–1 995 kr per vecka. Boendeparkering i centrala Stockholm är 1 100 kr/mån och garageköerna är flera år långa. Samtidigt står tusentals uppfarter tomma varje dag.</div>
</div></section>

<section style="padding-top:8px"><div class="wrap">
  <div class="card pad" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <div style="font-size:34px">${nextEvent.icon}</div>
    <div style="flex:1;min-width:190px">
      <span class="pill amber">Nästa stora evenemang</span>
      <h3 style="margin-top:7px">${esc(nextEvent.name)}</h3>
      <p class="muted" style="font-size:14px">${esc(nextEvent.venue)} · ${esc(nextEvent.date)} kl ${esc(nextEvent.time)} · ${nextEvent.crowd.toLocaleString("sv-SE")} besökare</p>
    </div>
    <button class="btn btn-p" onclick="S.area='${nextEvent.area}';S.mode='evenemang';go('sok')">Hitta plats nära →</button>
  </div>
</div></section>

<section><div class="wrap">
  <span class="eyebrow">Så funkar det</span>
  <h2 style="margin:8px 0 6px">Två minuter att lägga upp. Pengarna kommer varje månad.</h2>
  <p class="dim" style="max-width:60ch">Ingen startavgift, ingen månadsavgift. Parkla tjänar bara pengar när du gör det.</p>
  <div class="grid g2" style="margin-top:22px">
    <div class="card pad">
      <span class="pill green">För dig som hyr ut</span>
      <div class="steps" style="margin-top:6px">
        ${[["Lägg upp platsen","Adress, foto, storlek. Vi föreslår ett pris baserat på området."],
           ["Välj när den är ledig","Alltid, vardagar 8–17, bara vid evenemang – du bestämmer."],
           ["Godkänn förarna","Alla är BankID-verifierade och bokar med registreringsnummer."],
           ["Få betalt","Utbetalning den 25:e varje månad. Vi rapporterar till Skatteverket åt dig."]]
          .map(([a,b])=>`<div class="step"><span class="n"></span><div><b>${a}</b><div class="dim" style="font-size:14.5px">${b}</div></div></div>`).join("")}
      </div>
    </div>
    <div class="card pad">
      <span class="pill amber">För dig som söker plats</span>
      <div class="steps" style="margin-top:6px">
        ${[["Sök på adress eller karta","Filtrera på pris, laddbox, garage, storlek."],
           ["Boka direkt","Timme, dygn, vecka, månad – eller bara till matchen."],
           ["Kör dit","Vägbeskrivning, portkod och kontakt i appen. Ingen p-automat."],
           ["Slipp p-böter","Platsen är din. Ingen kontrollavgift, ingen flyttning."]]
          .map(([a,b])=>`<div class="step"><span class="n"></span><div><b>${a}</b><div class="dim" style="font-size:14.5px">${b}</div></div></div>`).join("")}
      </div>
    </div>
  </div>
</div></section>

<section style="background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap">
  <span class="eyebrow">Där det behövs mest</span>
  <h2 style="margin:8px 0 18px">Vi startar där smärtan är störst</h2>
  <div class="grid g4">
    ${AREAS.map(a => `<button class="card pad" style="text-align:left" onclick="S.area='${a.id}';go('sok')">
      <div style="font-size:25px">${a.icon}</div>
      <h4 style="margin-top:7px">${esc(a.name)}</h4>
      <div class="muted" style="font-size:13px">${esc(a.sub)}</div>
      <div class="pill amber" style="margin-top:9px;font-size:11.5px">${esc(a.ref)}</div>
      <div style="margin-top:11px;font-size:14px;font-weight:700;color:var(--green)">${SPOTS.filter(s => s.area === a.id).length} platser →</div>
    </button>`).join("")}
  </div>
</div></section>

<section><div class="wrap narrow center">
  <span class="eyebrow">Trygghet</span>
  <h2 style="margin:8px 0 12px">Det svåra med att släppa in en främmande bil på tomten</h2>
  <p class="dim">Det är därför de flesta aldrig hyr ut. Parkla löser det – annars fungerar inte tjänsten.</p>
  <div class="grid g2" style="margin-top:20px;text-align:left">
    ${[["🇸🇪","BankID på båda sidor","Ingen anonymitet. Varje bokning är knuten till en verklig person och ett registreringsnummer."],
       ["🛡️",`Parkla Trygg: ${moneyPlain(FEES.garantiBelopp)} ${curSym()}`,"Täcker skador på din uppfart, grind eller garageport. Ingår i varje bokning."],
       ["🚪","”Flytta bilen”-knappen",`Står bilen kvar? En knapptryckning – vi kontaktar föraren, debiterar ${moneyPlain(FEES.overtidPerTimme)} ${curSym()}/timme och bekostar bärgning.`],
       ["📷","Foto in och ut","Båda parter fotar vid in- och utcheckning. Bevis om något händer."]]
      .map(([i,h,p])=>`<div class="card pad"><div style="font-size:22px">${i}</div><h4 style="margin-top:8px">${h}</h4><p class="dim" style="font-size:14.5px;margin-top:4px">${p}</p></div>`).join("")}
  </div>
  <button class="btn btn-g" style="margin-top:20px" data-go="trygg">Läs mer om trygghet</button>
</div></section>

<section style="background:var(--green);color:#fff"><div class="wrap narrow center">
  <h2 style="color:#fff">Vad är din uppfart värd?</h2>
  <p style="opacity:.9;margin-top:10px">Räkna ut det på 20 sekunder. Ingen inloggning.</p>
  <button class="btn btn-a btn-lg" style="margin-top:16px" data-go="hyrut">Öppna intäktsräknaren</button>
</div></section>
${footerHTML()}`;
}

/* ============================================================
   VY: SÖK
   ============================================================ */
function filteredSpots() {
  let list = SPOTS.filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
  if (S.q.trim()) {
    const q = S.q.toLowerCase();
    list = list.filter(s => (s.nm + " " + s.ad + " " + s.type + " " + s.feat.join(" ")).toLowerCase().includes(q));
  }
  if (S.filterCharge) list = list.filter(s => s.ev_charge);
  if (S.filterGarage) list = list.filter(s => s.type === "Garage" || s.type === "Carport");
  if (S.filterSecure) list = list.filter(s => s.feat.some(f => /Kamera|Låst|Grind|Portkod/.test(f)));
  if (S.filterBig)    list = list.filter(s => /SUV|husbil|buss|husvagn|släp/i.test(s.size));
  if (S.maxPrice)     list = list.filter(s => priceFor(s, S.mode) <= S.maxPrice);
  const sorters = {
    pris: (a, b) => priceFor(a, S.mode) - priceFor(b, S.mode),
    betyg: (a, b) => b.rate - a.rate || b.n - a.n,
    avstand: (a, b) => (a.walk || 0) - (b.walk || 0)
  };
  return list.slice().sort(sorters[S.sort] || sorters.pris);
}

function viewSok() {
  const area = AREAS.find(a => a.id === S.area) || AREAS[0];
  const list = filteredSpots();
  const all = SPOTS.filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
  const prices = all.map(s => priceFor(s, S.mode));
  const maxP = prices.length ? Math.max.apply(null, prices) : 100;
  const activeFilters = [S.filterCharge, S.filterGarage, S.filterSecure, S.filterBig, !!S.maxPrice].filter(Boolean).length;

  return `
<section style="padding:18px 0 8px"><div class="wrap">
  <div class="grid g2" style="gap:10px">
    <div class="field"><label>${esc(t("search_where"))}</label>
      <select class="inp" onchange="S.area=this.value;SET.city=this.value;saveSettings();render()">
        ${AREAS.map(a => `<option value="${a.id}" ${a.id === S.area ? "selected" : ""}>${esc(a.name)} – ${esc(a.sub)}</option>`).join("")}
      </select></div>
    <div class="field"><label>Sök på gata, typ eller egenskap</label>
      <input class="inp" id="qbox" value="${esc(S.q)}" placeholder="t.ex. garage, laddbox, Odengatan"
        oninput="S.q=this.value;renderResultsOnly()"></div>
  </div>

  <div class="seg" style="margin-top:11px">
    ${[["timme", t("hour")], ["dygn", t("day")], ["vecka", t("week")], ["manad", t("month")], ["evenemang", t("event")]]
      .map(([k, l]) => `<button class="${S.mode === k ? "on" : ""}" onclick="S.mode='${k}';S.maxPrice=0;render()">${esc(l)}</button>`).join("")}
  </div>

  <div class="chips" style="margin-top:11px">
    <button class="chip ${S.filterCharge ? "on" : ""}" onclick="S.filterCharge=!S.filterCharge;renderResultsOnly()">⚡ Laddbox</button>
    <button class="chip ${S.filterGarage ? "on" : ""}" onclick="S.filterGarage=!S.filterGarage;renderResultsOnly()">🚗 Tak/garage</button>
    <button class="chip ${S.filterSecure ? "on" : ""}" onclick="S.filterSecure=!S.filterSecure;renderResultsOnly()">🔒 Låst/bevakad</button>
    <button class="chip ${S.filterBig ? "on" : ""}" onclick="S.filterBig=!S.filterBig;renderResultsOnly()">🚛 Stort fordon</button>
    <button class="chip" onclick="openFilters()">⚙️ ${esc(t("filters"))}${activeFilters ? " (" + activeFilters + ")" : ""}</button>
    ${activeFilters ? `<button class="chip" onclick="clearFilters()">✕ ${esc(t("clear"))}</button>` : ""}
  </div>

  <div class="spread" style="margin-top:13px">
    <div class="seg" style="max-width:210px">
      <button class="${S.view === "lista" ? "on" : ""}" onclick="S.view='lista';render()">Lista</button>
      <button class="${S.view === "karta" ? "on" : ""}" onclick="S.view='karta';render()">Karta</button>
    </div>
    <select class="inp" style="max-width:190px;min-height:40px;padding:8px 32px 8px 12px;font-size:14px"
      onchange="S.sort=this.value;renderResultsOnly()">
      <option value="pris" ${S.sort === "pris" ? "selected" : ""}>${esc(t("sort_price"))}</option>
      <option value="betyg" ${S.sort === "betyg" ? "selected" : ""}>${esc(t("sort_rating"))}</option>
      <option value="avstand" ${S.sort === "avstand" ? "selected" : ""}>${esc(t("sort_dist"))}</option>
    </select>
  </div>

  <div id="results">${resultsHTML(list, area, maxP)}</div>
</div></section>
${footerHTML()}`;
}

function resultsHTML(list, area, maxP) {
  const mapPart = S.view === "karta" ? `
    <div class="mapbox tall" style="margin-top:14px">
      <div class="mapme" style="left:${area.me[0]}%;top:${area.me[1]}%" title="Du är här"></div>
      ${list.map((s, i) => `<button class="pin ${S.selSpot === s.id ? "hot" : ""}" style="left:${s.xy[0]}%;top:${s.xy[1]}%"
        onclick="S.selSpot=${s.id};renderResultsOnly()">${moneyPlain(priceFor(s, S.mode))} ${curSym()}</button>`).join("")}
      <div class="mapnote">${list.length} ${esc(t("free_spots"))} · ${esc(area.name)}</div>
    </div>
    ${S.selSpot && list.some(s => s.id === S.selSpot) ? `<div style="margin-top:12px">${spotCardHTML(SPOTS.find(s => s.id === S.selSpot))}</div>` : `<p class="muted center" style="margin-top:12px;font-size:14px">Tryck på en prisbubbla för att se platsen.</p>`}
  ` : `
    <div class="mapbox" style="margin-top:14px">
      <div class="mapme" style="left:${area.me[0]}%;top:${area.me[1]}%"></div>
      ${list.slice(0, 8).map((s, i) => `<button class="pin ${i === 0 ? "hot" : ""}" style="left:${s.xy[0]}%;top:${s.xy[1]}%"
        onclick="openSpot(${s.id})">${moneyPlain(priceFor(s, S.mode))} ${curSym()}</button>`).join("")}
      <div class="mapnote">${list.length} ${esc(t("free_spots"))} · ${esc(area.name)}</div>
    </div>
    <div class="spread" style="margin:16px 0 11px">
      <h3>${list.length} ${esc(t("free_spots"))}</h3>
      <span class="pill amber">${esc(area.ref)}</span>
    </div>
    <div class="stack">${list.length ? list.map(spotCardHTML).join("") : emptyHTML()}</div>
    ${list.length ? savingsHTML(list, area) : ""}
    <div class="note" style="margin-top:16px">💡 <b>Hittar du inget?</b> Lägg en bevakning – vi hör av oss så fort en plats blir ledig i området.
      <button class="btn btn-sm btn-g" style="margin-top:9px" onclick="addWatch()">Bevaka ${esc(area.name)}</button></div>
  `;
  return mapPart;
}

function spotCardHTML(s) {
  const p = priceFor(s, S.mode);
  const fav = FAVS.includes(s.id);
  return `<button class="spot ${S.selSpot === s.id ? "sel" : ""}" onclick="openSpot(${s.id})">
    <div class="thumb">${s.icon}</div>
    <div class="body">
      <div class="nm">${esc(s.nm)}</div>
      <div class="ad">${esc(s.ad)}</div>
      <div class="tags">
        <span class="pill">${esc(s.type)}</span>
        ${s.ev_charge ? '<span class="pill green">⚡ Laddbox</span>' : ""}
        ${s.walk ? `<span class="pill">🚶 ${s.walk} min</span>` : ""}
        <span class="pill"><span class="stars">${stars(s.rate)}</span> (${s.n})</span>
      </div>
    </div>
    <div class="price"><b class="num">${moneyPlain(p)} ${curSym()}</b><span>${esc(unitFor(S.mode))}</span></div>
    <span class="fav" onclick="event.stopPropagation();toggleFav(${s.id})" role="button" aria-label="Spara favorit">${fav ? "❤️" : "🤍"}</span>
  </button>`;
}

function emptyHTML() {
  return `<div class="card empty"><div class="e">🔍</div>
    <h3 style="margin-top:8px">Inga platser matchar</h3>
    <p class="dim" style="margin-top:6px">Prova att ta bort ett filter eller byta tidsläge.</p>
    <button class="btn btn-sm btn-p" style="margin-top:12px" onclick="clearFilters()">${esc(t("clear"))} filter</button></div>`;
}

function savingsHTML(list, area) {
  if (S.mode !== "manad") return "";
  const cheapest = Math.min.apply(null, list.map(s => s.m));
  const refMap = { sthlm: 1100, gbg: 1500, malmo: 1100, uppsala: 1050, lund: 950, vasteras: 750, solna: 1200, arn: 1400 };
  const ref = refMap[area.id] || 1000;
  const diff = ref - cheapest;
  if (diff <= 0) return "";
  return `<div class="card pad" style="margin-top:14px;background:var(--green-soft);border-color:transparent">
    <b>Du sparar ${kr(diff * 12)} om året</b>
    <p class="dim" style="font-size:14.5px;margin-top:4px">Billigaste platsen här kostar ${kr(cheapest)}/mån. Kommunens boendeparkering eller p-huset ligger på cirka ${kr(ref)}/mån.</p>
  </div>`;
}

function renderResultsOnly() {
  const area = AREAS.find(a => a.id === S.area) || AREAS[0];
  const list = filteredSpots();
  const all = SPOTS.filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
  const maxP = all.length ? Math.max.apply(null, all.map(s => priceFor(s, S.mode))) : 100;
  const box = document.getElementById("results");
  if (box) box.innerHTML = resultsHTML(list, area, maxP);
  else render();
}
function clearFilters() {
  S.filterCharge = S.filterGarage = S.filterSecure = S.filterBig = false;
  S.maxPrice = 0; S.q = ""; render();
}
function toggleFav(id) {
  const i = FAVS.indexOf(id);
  if (i < 0) { FAVS.push(id); toast("Sparad bland favoriter"); } else { FAVS.splice(i, 1); toast("Borttagen från favoriter"); }
  persist(); renderResultsOnly();
}
function addWatch() {
  const a = AREAS.find(x => x.id === S.area);
  if (!WATCH.includes(a.id)) { WATCH.push(a.id); persist(); }
  toast("Bevakning skapad för " + a.name);
}
function openFilters() {
  const all = SPOTS.filter(s => s.area === S.area && priceFor(s, S.mode) > 0);
  const maxP = all.length ? Math.max.apply(null, all.map(s => priceFor(s, S.mode))) : 100;
  const cur = S.maxPrice || maxP;
  openSheet(sheetHead(t("filters")) + `<div class="sheet-b stack">
    <div class="field">
      <label>Högsta pris: <b class="num" id="mpv">${moneyPlain(cur)} ${curSym()}${esc(unitFor(S.mode))}</b></label>
      <input type="range" min="${Math.floor(Math.min.apply(null, all.map(s => priceFor(s, S.mode))) || 0)}" max="${maxP}" value="${cur}"
        oninput="document.getElementById('mpv').textContent=Math.round(this.value*(CURRENCIES[SET.currency].rate)).toLocaleString('sv-SE')+' ${curSym()}${esc(unitFor(S.mode))}';S.maxPrice=+this.value">
    </div>
    <div class="sep"></div>
    ${[["filterCharge", "⚡ Laddbox", "Elbilsladdning på platsen"],
       ["filterGarage", "🚗 Tak eller garage", "Skydd mot snö och regn"],
       ["filterSecure", "🔒 Låst eller bevakad", "Grind, portkod eller kamera"],
       ["filterBig", "🚛 Stort fordon", "SUV, husbil, släp eller buss"]]
      .map(([k, tt, ss]) => `<div class="setrow"><div class="t"><b>${tt}</b><span>${ss}</span></div>
        <div class="switch ${S[k] ? "on" : ""}" role="switch" onclick="S['${k}']=!S['${k}'];this.classList.toggle('on')"></div></div>`).join("")}
    <button class="btn btn-p btn-block btn-lg" onclick="closeSheet();render()">Visa resultat</button>
    <button class="btn btn-g btn-block" onclick="clearFilters();closeSheet()">${esc(t("clear"))} alla filter</button>
  </div>`);
}

/* ============================================================
   PLATSDETALJ + BOKNING
   ============================================================ */
function openSpot(id) {
  const s = SPOTS.find(x => x.id === id); if (!s) return;
  S.selSpot = id;
  const p = priceFor(s, S.mode) || s.d || s.m;
  const f = feeSplit(p, S.mode);
  const revs = reviewsFor(id);
  const hostPct = Math.round((S.mode === "manad" ? FEES.hostPctMonthly : FEES.hostPct) * 100);
  const sim = SPOTS.filter(x => x.area === s.area && x.id !== s.id && priceFor(x, S.mode) > 0).slice(0, 3);

  openSheet(sheetHead(s.nm) + `<div class="sheet-b">
    <div class="gallery" style="scroll-snap-type:x mandatory">
      ${[s.icon, "📸", "🗺️", "🌙"].map(g => `<div class="g">${g}</div>`).join("")}
    </div>
    <div class="row wrap" style="margin-top:12px">
      <span class="pill">${esc(s.type)}</span>
      <span class="pill"><span class="stars">${stars(s.rate)}</span> · ${s.n} omdömen</span>
      ${s.ev_charge ? '<span class="pill green">⚡ Laddbox</span>' : ""}
      ${s.walk ? `<span class="pill">🚶 ${s.walk} min</span>` : ""}
    </div>
    <p class="dim" style="margin-top:10px">${esc(s.ad)} · Passar: ${esc(s.size)}</p>
    <div class="row wrap" style="margin-top:9px">${s.feat.map(x => `<span class="pill">${esc(x)}</span>`).join("")}</div>

    <div class="card pad flat" style="margin-top:14px;background:var(--surface-2);border-color:transparent">
      <div class="row"><div style="width:38px;height:38px;border-radius:50%;background:var(--green);color:var(--on-green);display:grid;place-items:center;font-weight:800">${esc(s.host[0])}</div>
        <div><b>${esc(s.host)}</b><div class="muted" style="font-size:13px">Värd sedan ${s.hostSince} · svarar oftast inom 10 min</div></div></div>
      <p class="dim" style="font-size:14px;margin-top:10px">”${esc(s.instr)}”</p>
      <button class="btn btn-sm btn-g" style="margin-top:10px" onclick="closeSheet();go('meddelanden')">💬 Skicka fråga</button>
    </div>

    <div class="card pad" style="margin-top:14px">
      <div class="spread"><b>Pris ${esc(unitFor(S.mode).replace("/", " per "))}</b><b class="num">${kr(f.base)}</b></div>
      <div style="margin-top:10px">
        <div class="kv"><span>Serviceavgift Parkla</span><b>${kr(f.service)}</b></div>
        <div class="kv"><span>Parkla Trygg (skadegaranti ${moneyPlain(FEES.garantiBelopp)} ${curSym()})</span><b>${kr(f.trygg)}</b></div>
        <div class="tot"><span>Du betalar</span><span class="num">${kr(f.driverTotal)}</span></div>
      </div>
      <p class="muted" style="font-size:12.5px;margin-top:9px">Avbokning fritt fram till 24 timmar innan. Ingen kontrollavgift kan utfärdas – platsen är privat mark.</p>
    </div>
    <div class="note" style="margin-top:12px">Värden ${esc(s.host)} får ${kr(f.hostNet)} efter Parklas provision på ${hostPct} %.</div>

    <h4 style="margin:18px 0 4px">Tillgänglighet</h4>
    ${calendarHTML(s)}

    <h4 style="margin:18px 0 2px">Omdömen</h4>
    <div>${revs.map(r => `<div class="rev">
      <div class="who"><span class="av">${esc(r.who[0])}</span><b>${esc(r.who)}</b><span class="stars" style="margin-left:auto">${"★".repeat(r.r)}</span></div>
      <p class="dim" style="font-size:14.5px;margin-top:6px">${esc(r.t)}</p>
      <span class="muted" style="font-size:12px">${esc(r.d)}</span></div>`).join("")}</div>

    ${sim.length ? `<h4 style="margin:18px 0 8px">Liknande platser i närheten</h4>
      <div class="stack tight">${sim.map(x => `<button class="spot" onclick="openSpot(${x.id})">
        <div class="thumb" style="width:52px;height:52px;font-size:22px">${x.icon}</div>
        <div class="body"><div class="nm" style="font-size:14.5px">${esc(x.nm)}</div><div class="ad">${esc(x.ad)}</div></div>
        <div class="price"><b class="num" style="font-size:15px">${moneyPlain(priceFor(x, S.mode))} ${curSym()}</b><span>${esc(unitFor(S.mode))}</span></div>
      </button>`).join("")}</div>` : ""}

    <div style="position:sticky;bottom:0;background:var(--surface);padding:14px 0 0;margin-top:18px;border-top:1px solid var(--line)">
      <button class="btn btn-p btn-block btn-lg" onclick="startBooking(${s.id})">Boka – ${kr(f.driverTotal)}</button>
    </div>
  </div>`);
}

function calendarHTML(s) {
  const today = new Date();
  const days = ["M", "T", "O", "T", "F", "L", "S"];
  let start = new Date(today); start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  let cells = "";
  for (let i = 0; i < 28; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const busy = (s.id * 7 + i * 3) % 11 === 0;
    cells += `<div class="d ${busy ? "busy" : "free"}">${d.getDate()}</div>`;
  }
  return `<div class="card pad flat" style="border-color:var(--line)">
    <div class="cal">${days.map(d => `<div class="h">${d}</div>`).join("")}</div>
    <div class="cal" style="margin-top:5px">${cells}</div>
    <div class="row" style="margin-top:11px;font-size:12.5px" class="muted">
      <span class="pill green">Ledigt</span><span class="pill">Bokat</span>
    </div></div>`;
}

/* ---------- Bokningsflöde ---------- */
function startBooking(id) {
  const s = SPOTS.find(x => x.id === id);
  S.bk = { id, qty: 1, charge: false, extraCar: false, code: "", pay: "swish", step: 1 };
  renderBooking();
}
function renderBooking() {
  const s = SPOTS.find(x => x.id === S.bk.id);
  const b = S.bk;
  const unitPrice = priceFor(s, S.mode) || s.d || s.m;
  const base = unitPrice * b.qty;
  const chargeCost = b.charge ? (S.mode === "manad" ? 380 : 55) * b.qty : 0;
  const extraCost = b.extraCar ? Math.round(base * 0.6) : 0;
  const sub = base + chargeCost + extraCost;
  const discount = b.code.toUpperCase() === "PARKLA50" ? Math.round(sub * 0.5) : b.code.toUpperCase() === "GRANNE" ? 100 : 0;
  const f = feeSplit(sub - discount, S.mode);
  const qtyLabel = S.mode === "manad" ? "månader" : S.mode === "timme" ? "timmar" : S.mode === "dygn" ? "dygn" : S.mode === "vecka" ? "veckor" : "platser";

  openSheet(sheetHead("Boka " + s.nm) + `<div class="sheet-b stack">
    <div class="progress"><i class="on"></i><i class="${b.step >= 2 ? "on" : ""}"></i><i class="${b.step >= 3 ? "on" : ""}"></i></div>

    <div class="field"><label>Antal ${qtyLabel}</label>
      <div class="row">
        <button class="btn btn-g" style="width:48px;padding:0" onclick="S.bk.qty=Math.max(1,S.bk.qty-1);renderBooking()">−</button>
        <input class="inp num center" style="text-align:center" value="${b.qty}" readonly>
        <button class="btn btn-g" style="width:48px;padding:0" onclick="S.bk.qty=Math.min(24,S.bk.qty+1);renderBooking()">+</button>
      </div></div>

    <div class="field"><label>Startdatum</label><input class="inp" type="date" id="bkdate" value="${new Date(Date.now() + 864e5).toISOString().slice(0, 10)}"></div>

    <div>
      <div class="lbl" style="margin-bottom:7px">Tillägg</div>
      ${s.ev_charge ? `<div class="setrow"><div class="t"><b>⚡ Elbilsladdning</b><span>${S.mode === "manad" ? kr(380) + "/mån, fri laddning" : kr(55) + " per " + (S.mode === "dygn" ? "dygn" : "tillfälle")}</span></div>
        <div class="switch ${b.charge ? "on" : ""}" role="switch" onclick="S.bk.charge=!S.bk.charge;renderBooking()"></div></div>` : ""}
      <div class="setrow"><div class="t"><b>🚗 Andra bilen</b><span>Om platsen rymmer två fordon (+60 %)</span></div>
        <div class="switch ${b.extraCar ? "on" : ""}" role="switch" onclick="S.bk.extraCar=!S.bk.extraCar;renderBooking()"></div></div>
    </div>

    <div class="field"><label>Rabattkod</label>
      <div class="row"><input class="inp" id="bkcode" placeholder="t.ex. GRANNE" value="${esc(b.code)}">
      <button class="btn btn-g" onclick="S.bk.code=document.getElementById('bkcode').value;renderBooking()">Använd</button></div>
      ${discount ? `<span class="pill green" style="margin-top:6px">Rabatt: −${kr(discount)}</span>` : ""}
    </div>

    <div class="field"><label>Registreringsnummer</label>
      <input class="inp" id="regnr" placeholder="ABC 123" maxlength="8" style="text-transform:uppercase" value="${esc(LS.get("lastreg", ""))}"></div>

    <div>
      <div class="lbl" style="margin-bottom:7px">Betalsätt</div>
      <div class="row wrap">
        ${[["swish", "Swish"], ["kort", "Kort"], ["klarna", "Klarna"], ["faktura", "Faktura"]]
          .map(([k, l]) => `<button class="chip ${b.pay === k ? "on" : ""}" onclick="S.bk.pay='${k}';renderBooking()">${l}</button>`).join("")}
      </div></div>

    <div class="card pad">
      <div class="kv"><span>${moneyPlain(unitPrice)} ${curSym()} × ${b.qty}</span><b>${kr(base)}</b></div>
      ${chargeCost ? `<div class="kv"><span>Elbilsladdning</span><b>${kr(chargeCost)}</b></div>` : ""}
      ${extraCost ? `<div class="kv"><span>Andra bilen</span><b>${kr(extraCost)}</b></div>` : ""}
      ${discount ? `<div class="kv"><span style="color:var(--green)">Rabatt</span><b style="color:var(--green)">−${kr(discount)}</b></div>` : ""}
      <div class="kv"><span>Serviceavgift Parkla</span><b>${kr(f.service)}</b></div>
      <div class="kv"><span>Parkla Trygg</span><b>${kr(f.trygg)}</b></div>
      <div class="tot"><span>Totalt</span><span class="num">${kr(f.driverTotal)}</span></div>
    </div>

    <button class="btn btn-p btn-block btn-lg" onclick="confirmBooking()">${esc(t("book"))}</button>
    <p class="muted center" style="font-size:12.5px">Du debiteras först när värden bekräftat – oftast under en minut.</p>
  </div>`);
}

function confirmBooking() {
  const reg = (document.getElementById("regnr") || {}).value || "";
  if (reg.trim().length < 5) { toast("Fyll i registreringsnummer"); return; }
  const date = (document.getElementById("bkdate") || {}).value || "";
  LS.set("lastreg", reg.toUpperCase().trim());
  openSheet(`<div class="bankid">
    <div class="ring"></div>
    <h3>Öppna BankID</h3>
    <p class="dim" style="margin-top:8px">Legitimera dig i BankID-appen för att slutföra bokningen.</p>
    <p class="muted" style="font-size:12.5px;margin-top:14px">Demoläge – ingen riktig legitimering sker.</p>
  </div>`);
  setTimeout(() => finishBooking(reg.toUpperCase().trim(), date), 1700);
}

function finishBooking(reg, date) {
  const s = SPOTS.find(x => x.id === S.bk.id);
  const b = S.bk;
  const unitPrice = priceFor(s, S.mode) || s.d || s.m;
  const base = unitPrice * b.qty;
  const chargeCost = b.charge ? (S.mode === "manad" ? 380 : 55) * b.qty : 0;
  const extraCost = b.extraCar ? Math.round(base * 0.6) : 0;
  const sub = base + chargeCost + extraCost;
  const discount = b.code.toUpperCase() === "PARKLA50" ? Math.round(sub * 0.5) : b.code.toUpperCase() === "GRANNE" ? 100 : 0;
  const f = feeSplit(sub - discount, S.mode);
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const bk = {
    id: Date.now(), spotId: s.id, spot: s.nm, addr: s.ad, area: s.area, reg, mode: S.mode, qty: b.qty,
    total: f.driverTotal, host: s.host, date: date || new Date().toISOString().slice(0, 10),
    code, charge: b.charge, pay: b.pay, instr: s.instr, status: "kommande", rated: false
  };
  BOOKINGS.unshift(bk);
  NOTIS.unshift({ id: "n" + Date.now(), ic: "✅", t: "Bokning bekräftad", s: `${s.nm} · ${bk.date} · ${kr(f.driverTotal)}`, unread: true });
  persist();
  openSheet(sheetHead("Bokat!") + `<div class="sheet-b stack center">
    <div style="font-size:46px">🎉</div>
    <h3>Platsen är din</h3>
    <p class="dim">${esc(s.nm)} · ${esc(bk.date)}</p>
    <div class="code">${code}</div>
    <p class="muted" style="font-size:13px">Kod till grind/port. Finns alltid under Min sida.</p>
    <div class="note" style="text-align:left">${esc(s.instr)}</div>
    <button class="btn btn-p btn-block" onclick="closeSheet();go('mina')">Till mina bokningar</button>
    <button class="btn btn-g btn-block" onclick="closeSheet()">${esc(t("close"))}</button>
  </div>`);
}

/* ============================================================
   VY: HYR UT (intäktsräknare)
   ============================================================ */
function viewHyrut() {
  const c = S.calc, sug = priceSuggest(c.city, c.type, c.walk, c.charger, c.gated);
  const gross = sug.month;
  const net = gross - Math.round(gross * FEES.hostPctMonthly);
  const year = net * 12;
  const taxFree = Math.min(year, FEES.schablon);
  const taxable = Math.max(0, year - FEES.schablon);
  const tax = Math.round(taxable * 0.30);
  const pct = clamp(year / FEES.schablon * 100, 0, 100);
  const dynBoost = c.dyn ? Math.round(gross * 0.14) : 0;

  return `
<section style="padding:22px 0 8px"><div class="wrap narrow">
  <span class="eyebrow">Intäktsräknare</span>
  <h1 style="margin:8px 0 8px">Vad är din plats värd?</h1>
  <p class="dim">Baserat på faktiska marknadspriser i området. Ingen inloggning, inget konto.</p>

  <div class="card pad" style="margin-top:18px">
    <div class="grid g2">
      <div class="field"><label>Var ligger platsen?</label>
        <select class="inp" onchange="S.calc.city=this.value;render()">
          ${Object.keys(CITY_BASE).map(k => `<option ${k === c.city ? "selected" : ""}>${k}</option>`).join("")}
        </select></div>
      <div class="field"><label>Vilken typ av plats?</label>
        <select class="inp" onchange="S.calc.type=this.value;render()">
          ${Object.keys(TYPE_MULT).map(k => `<option ${k === c.type ? "selected" : ""}>${k}</option>`).join("")}
        </select></div>
    </div>
    <div class="field" style="margin-top:12px">
      <label>Gångavstånd till centrum, station eller arena: <b class="num">${c.walk} min</b></label>
      <input type="range" min="1" max="25" value="${c.walk}" oninput="S.calc.walk=+this.value;render()">
    </div>
    <div class="row wrap" style="margin-top:4px">
      <button class="chip ${c.charger ? "on" : ""}" onclick="S.calc.charger=!S.calc.charger;render()">⚡ Laddbox finns (+28 %)</button>
      <button class="chip ${c.gated ? "on" : ""}" onclick="S.calc.gated=!S.calc.gated;render()">🔒 Låst eller grind (+7 %)</button>
      <button class="chip ${c.dyn ? "on" : ""}" onclick="S.calc.dyn=!S.calc.dyn;render()">📈 Dynamiskt pris</button>
    </div>
  </div>

  <div class="card pad" style="margin-top:14px;background:var(--green);color:#fff;border:0">
    <div style="font-size:12.5px;opacity:.85;font-weight:800;letter-spacing:.06em;text-transform:uppercase">Rekommenderat månadspris</div>
    <div class="big-num num" style="margin-top:5px">${moneyPlain(gross)} ${curSym()}<span style="font-size:18px;opacity:.8">${esc(t("per_month"))}</span></div>
    <div style="opacity:.92;margin-top:7px;font-size:14.5px">Du får <b>${kr(net)}${esc(t("per_month"))}</b> efter Parklas provision (${Math.round(FEES.hostPctMonthly * 100)} %).</div>
    ${dynBoost ? `<div style="margin-top:9px;font-size:13.5px;background:rgba(255,255,255,.16);border-radius:10px;padding:9px 11px">
      📈 Med dynamiskt pris höjs priset automatiskt vid evenemang och högsäsong: <b>+${kr(dynBoost)}/mån</b> i snitt.</div>` : ""}
    <div class="grid g4 keep" style="margin-top:14px;gap:9px">
      ${[["Per timme", sug.hour ? moneyPlain(sug.hour) + " " + curSym() : "–"],
         ["Per dygn", moneyPlain(sug.day) + " " + curSym()],
         ["Per vecka", moneyPlain(sug.week) + " " + curSym()],
         ["Evenemang", moneyPlain(sug.event) + " " + curSym()]]
        .map(([l, v]) => `<div style="background:rgba(255,255,255,.14);border-radius:12px;padding:10px">
          <div style="font-size:11px;opacity:.85;font-weight:700">${l}</div>
          <div class="num" style="font-size:18px;font-weight:800">${v}</div></div>`).join("")}
    </div>
  </div>

  <div class="card pad" style="margin-top:14px">
    <div class="spread"><h3>Skattemätaren</h3><span class="pill green">Schablonavdrag ${moneyPlain(FEES.schablon)} ${curSym()}</span></div>
    <p class="dim" style="font-size:14.5px;margin-top:6px">Hyr du ut en plats som hör till din privatbostad får du göra ett schablonavdrag på 40 000 kr per bostad och år. Under den gränsen betalar du i praktiken <b>0 kr i skatt</b>.</p>
    <div class="meter ${pct > 95 ? "warn" : ""}" style="margin-top:13px"><i style="width:${pct}%"></i></div>
    <div class="spread" style="margin-top:7px;font-size:13.5px"><span class="muted">${kr(year)}/år</span><span class="muted">Gränsen: ${kr(FEES.schablon)}</span></div>
    <div style="margin-top:14px">
      <div class="kv"><span>Intäkt efter Parklas provision</span><b>${kr(year)}/år</b></div>
      <div class="kv"><span>Skattefritt (schablonavdrag)</span><b style="color:var(--green)">${kr(taxFree)}</b></div>
      <div class="kv"><span>Skattepliktig del</span><b>${kr(taxable)}</b></div>
      <div class="kv"><span>Skatt 30 % i inkomstslaget kapital</span><b>${taxable ? "−" + kr(tax) : kr(0)}</b></div>
      <div class="tot"><span>Kvar i handen</span><span class="num">${kr(year - tax)}/år</span></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:11px">Parkla rapporterar dina intäkter till Skatteverket enligt DAC7 och ger dig ett färdigt deklarationsunderlag i januari.</p>
    <button class="btn btn-g btn-sm" style="margin-top:11px" data-go="skatt">Läs hela skatteguiden</button>
  </div>

  <div class="card pad" style="margin-top:14px">
    <h3>Vad kostar det mig?</h3>
    <div style="margin-top:9px">
      <div class="kv"><span>Att lägga upp platsen</span><b style="color:var(--green)">${kr(0)}</b></div>
      <div class="kv"><span>Månadsavgift</span><b style="color:var(--green)">${kr(0)}</b></div>
      <div class="kv"><span>Bindningstid</span><b style="color:var(--green)">Ingen</b></div>
      <div class="kv"><span>Provision på månadskontrakt</span><b>${Math.round(FEES.hostPctMonthly * 100)} %</b></div>
      <div class="kv"><span>Provision på korttidsbokning</span><b>${Math.round(FEES.hostPct * 100)} %</b></div>
    </div>
    <p class="dim" style="font-size:14px;margin-top:9px">Vi tjänar bara pengar när du gör det. Skadegaranti, BankID-kontroll, betalning och bärgning ingår.</p>
  </div>

  <button class="btn btn-p btn-block btn-lg" style="margin-top:16px" onclick="openWizard()">Lägg upp min plats →</button>
  <p class="muted center" style="font-size:12.5px;margin-top:9px">Tar cirka två minuter. Du kan pausa annonsen när du vill.</p>
</div></section>
${footerHTML()}`;
}

/* ---------- Annonsguide ---------- */
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
  const steps = ["Adressen", "Platsen", "Tillgänglighet", "Pris", "Klart"];
  const body = [
    `<div class="field"><label>Adress</label><input class="inp" id="w_ad" value="${esc(w.ad)}" placeholder="Ringvägen 41, Stockholm"></div>
     <div class="note">Exakt adress visas först efter bokning. I sökresultatet syns bara gatan och området.</div>`,

    `<div class="field"><label>Typ av plats</label><select class="inp" id="w_type">
       ${Object.keys(TYPE_MULT).map(k => `<option ${k === w.type ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     <div class="field"><label>Vad får plats?</label><select class="inp" id="w_size">
       ${["Personbil", "Personbil + SUV", "Personbil, husbil", "Personbil, släp", "Buss eller lastbil"].map(k => `<option ${k === w.size ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     <div style="margin-top:6px">
       ${[["charger", "⚡ Laddbox", "Elbilsladdning på platsen"], ["gated", "🔒 Låst eller grind", "Port, bom eller grind"], ["cam", "📷 Kamera", "Bevakning finns"]]
         .map(([k, tt, ss]) => `<div class="setrow"><div class="t"><b>${tt}</b><span>${ss}</span></div>
           <div class="switch ${w[k] ? "on" : ""}" role="switch" onclick="S.wizard['${k}']=!S.wizard['${k}'];this.classList.toggle('on')"></div></div>`).join("")}
     </div>`,

    `<div class="field"><label>När är platsen ledig?</label><select class="inp" id="w_tid">
       ${["Alltid", "Vardagar 08–17", "Kvällar & helger", "Bara vid evenemang", "Bara långtid (månad)"].map(k => `<option ${k === w.tid ? "selected" : ""}>${k}</option>`).join("")}</select></div>
     <div class="field"><label>Instruktion till föraren</label>
       <textarea class="inp" id="w_info" rows="3" placeholder="Kör in från gatan, plats närmast garaget. Vänd bilen så nosen pekar ut.">${esc(w.info)}</textarea></div>`,

    `<div class="field"><label>Månadspris (${curSym()})</label><input class="inp num" id="w_pris" value="${w.pris}" inputmode="numeric"></div>
     <div class="setrow"><div class="t"><b>📈 Dynamiskt pris</b><span>Vi höjer automatiskt vid evenemang och högsäsong, aldrig under ditt golv.</span></div>
       <div class="switch ${w.dyn ? "on" : ""}" role="switch" onclick="S.wizard.dyn=!S.wizard.dyn;this.classList.toggle('on')"></div></div>
     <div class="note">Med ditt pris får du <b>${kr(Math.round(w.pris * (1 - FEES.hostPctMonthly)))}/mån</b> efter provision – ${kr(Math.round(w.pris * (1 - FEES.hostPctMonthly) * 12))} om året.</div>`,

    `<div class="center"><div style="font-size:44px">✅</div>
     <h3 style="margin-top:8px">Redo att publicera</h3>
     <p class="dim" style="margin-top:6px">${esc(w.ad || "Din adress")} · ${esc(w.type)} · ${moneyPlain(w.pris)} ${curSym()}/mån</p></div>
     <div class="note" style="margin-top:12px">I skarpt läge kommer här: BankID-legitimering, foto på platsen, kontonummer för utbetalning och – om du bor i BRF – en färdig fråga till styrelsen som vi skickar åt dig.</div>`
  ][w.step];

  openSheet(sheetHead(steps[w.step]) + `<div class="sheet-b stack">
    <div class="progress">${steps.map((_, i) => `<i class="${i <= w.step ? "on" : ""}"></i>`).join("")}</div>
    ${body}
    <div class="row" style="margin-top:6px">
      ${w.step > 0 ? `<button class="btn btn-g" onclick="wizardBack()">${esc(t("back"))}</button>` : ""}
      <button class="btn btn-p" style="flex:1" onclick="wizardNext()">${w.step === 4 ? "Publicera annonsen" : esc(t("next"))}</button>
    </div>
  </div>`);
}
function grabWizard() {
  const g = id => (document.getElementById(id) || {}).value;
  const w = S.wizard;
  if (w.step === 0 && g("w_ad") != null) w.ad = g("w_ad");
  if (w.step === 1) { w.type = g("w_type") || w.type; w.size = g("w_size") || w.size; }
  if (w.step === 2) { w.tid = g("w_tid") || w.tid; w.info = g("w_info") || w.info; }
  if (w.step === 3) w.pris = +g("w_pris") || w.pris;
}
function wizardBack() { grabWizard(); S.wizard.step--; renderWizard(); }
function wizardNext() {
  grabWizard();
  const w = S.wizard;
  if (w.step === 0 && w.ad.trim().length < 4) { toast("Fyll i adressen"); return; }
  if (w.step === 3 && (!w.pris || w.pris < 50)) { toast("Sätt ett rimligt månadspris"); return; }
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
  persist();
  closeSheet(); toast(i >= 0 ? "Annonsen uppdaterad" : "Annonsen är publicerad");
  setTimeout(() => go("mina"), 500);
}

/* ============================================================
   VY: MIN SIDA
   ============================================================ */
function viewMina() {
  const monthGross = LISTINGS.filter(l => !l.paused).reduce((a, l) => a + l.pris, 0);
  const monthNet = Math.round(monthGross * (1 - FEES.hostPctMonthly));
  const year = monthNet * 12;
  const pct = clamp(EARNED / FEES.schablon * 100, 0, 100);
  const hist = [0.6, 0.72, 0.81, 0.79, 0.9, 0.95, 1, 1].map(x => Math.round(monthNet * x));
  const months = ["jan", "mar", "maj", "jul", "aug", "sep", "okt", "nov"];
  const favs = SPOTS.filter(s => FAVS.includes(s.id));

  return `
<section style="padding:22px 0 8px"><div class="wrap narrow">
  <div class="spread"><h1>${esc(t("nav_me"))}</h1>
    <button class="btn btn-sm btn-g" data-go="installningar">⚙️ ${esc(t("settings"))}</button></div>

  ${LISTINGS.length ? `
  <div class="card pad" style="margin-top:16px">
    <div class="spread"><h3>Intäkter</h3><span class="pill green">Utbetalning 25:e</span></div>
    <div class="big-num num" style="margin-top:8px">${kr(monthNet)}<span style="font-size:17px;color:var(--ink-3)">/mån</span></div>
    <p class="muted" style="font-size:13.5px">${kr(year)} per år efter provision · ${LISTINGS.filter(l => !l.paused).length} aktiv(a) annons(er)</p>
    <div class="chartwrap"><div class="chart">
      ${hist.map((v, i) => `<div class="b ${i === hist.length - 1 ? "on" : ""}" style="height:${Math.max(6, v / Math.max.apply(null, hist) * 100)}%"><span>${months[i]}</span></div>`).join("")}
    </div></div>
    <div class="row wrap" style="margin-top:6px">
      <button class="btn btn-sm btn-g" onclick="openPayouts()">💸 Utbetalningar</button>
      <button class="btn btn-sm btn-g" data-go="bjudin">🎁 Bjud in en vän</button>
    </div>
  </div>

  <div class="card pad" style="margin-top:14px">
    <div class="spread"><h3>Skattefritt kvar i år</h3><span class="pill ${pct > 90 ? "amber" : "green"}">${Math.round(100 - pct)} % kvar</span></div>
    <div class="big-num num" style="margin-top:8px">${kr(EARNED)}</div>
    <p class="muted" style="font-size:13.5px">av ${kr(FEES.schablon)} schablonavdrag</p>
    <div class="meter ${pct > 90 ? "warn" : ""}" style="margin-top:11px"><i style="width:${pct}%"></i></div>
    <p class="dim" style="font-size:14px;margin-top:11px">Vi skickar ett färdigt deklarationsunderlag i januari och rapporterar till Skatteverket enligt DAC7.</p>
    <button class="btn btn-g btn-sm" style="margin-top:9px" onclick="toast('Underlag skickat till din e-post (demo)')">Ladda ner underlag</button>
  </div>

  <h3 style="margin:22px 0 10px">Mina annonser</h3>
  <div class="stack">${LISTINGS.map(l => `
    <div class="card pad">
      <div class="spread"><b>${esc(l.ad)}</b><span class="pill ${l.paused ? "" : "green"}">${l.paused ? "Pausad" : "Aktiv"}</span></div>
      <p class="dim" style="font-size:14px;margin-top:4px">${esc(l.type)} · ${esc(l.size)} · ${esc(l.tid)}${l.charger ? " · ⚡ Laddbox" : ""}${l.dyn ? " · 📈 Dynamiskt pris" : ""}</p>
      <div class="grid g3 keep" style="margin-top:12px;gap:9px">
        <div class="card pad-sm flat"><div class="muted" style="font-size:11.5px;font-weight:700">Månadspris</div><div class="num" style="font-size:19px;font-weight:800">${moneyPlain(l.pris)} ${curSym()}</div></div>
        <div class="card pad-sm flat"><div class="muted" style="font-size:11.5px;font-weight:700">Du får</div><div class="num" style="font-size:19px;font-weight:800;color:var(--green)">${moneyPlain(l.pris * (1 - FEES.hostPctMonthly))} ${curSym()}</div></div>
        <div class="card pad-sm flat"><div class="muted" style="font-size:11.5px;font-weight:700">Per år</div><div class="num" style="font-size:19px;font-weight:800">${moneyPlain(l.pris * (1 - FEES.hostPctMonthly) * 12)} ${curSym()}</div></div>
      </div>
      <div class="row wrap" style="margin-top:12px">
        <button class="btn btn-sm btn-g" onclick="togglePause(${l.id})">${l.paused ? "Aktivera" : "Pausa"}</button>
        <button class="btn btn-sm btn-g" onclick="openWizard(${l.id})">Redigera</button>
        <button class="btn btn-sm btn-g" onclick="openSchedule(${l.id})">🗓️ Schema</button>
        <button class="btn btn-sm btn-d" onclick="kickCar()">🚪 Flytta bilen</button>
        <button class="btn btn-sm btn-g" onclick="removeListing(${l.id})">Ta bort</button>
      </div>
    </div>`).join("")}</div>
  <button class="btn btn-g btn-block" style="margin-top:12px" onclick="openWizard()">+ Lägg upp en till plats</button>
  ` : `
  <div class="card empty" style="margin-top:16px">
    <div class="e">💰</div>
    <h3 style="margin-top:8px">Du hyr inte ut någon plats än</h3>
    <p class="dim" style="margin-top:6px">Har du en uppfart, carport, garageplats eller innergård? Se vad den är värd.</p>
    <button class="btn btn-p" style="margin-top:12px" data-go="hyrut">Räkna ut mitt pris</button>
  </div>`}

  <h3 style="margin:24px 0 10px">Mina bokningar</h3>
  ${BOOKINGS.length ? `<div class="stack">${BOOKINGS.map(b => `
    <div class="card pad">
      <div class="spread"><b>${esc(b.spot)}</b><span class="pill ${b.status === "klar" ? "" : "green"}">${b.status === "klar" ? "Avslutad" : "Bekräftad"}</span></div>
      <div class="dim" style="font-size:14px;margin-top:4px">${esc(b.reg)} · ${esc(b.mode)} × ${b.qty} · ${esc(b.date)} · värd ${esc(b.host)}</div>
      <div class="row wrap" style="margin-top:10px">
        <span class="num" style="font-weight:800;font-size:17px;margin-right:auto">${kr(b.total)}</span>
        <button class="btn btn-sm btn-p" onclick="openAccess(${b.id})">🔓 Öppna</button>
        <button class="btn btn-sm btn-g" onclick="extendBooking(${b.id})">Förläng</button>
        <button class="btn btn-sm btn-g" onclick="receipt(${b.id})">Kvitto</button>
        <button class="btn btn-sm btn-g" onclick="cancelBooking(${b.id})">Avboka</button>
      </div>
    </div>`).join("")}</div>`
    : `<div class="card empty"><div class="e">🅿️</div><h3 style="margin-top:8px">Inga bokningar än</h3>
       <button class="btn btn-sm btn-p" style="margin-top:12px" data-go="sok">Hitta en plats</button></div>`}

  ${favs.length ? `<h3 style="margin:24px 0 10px">Sparade platser</h3>
    <div class="stack">${favs.map(spotCardHTML).join("")}</div>` : ""}

  ${WATCH.length ? `<h3 style="margin:24px 0 10px">Mina bevakningar</h3>
    <div class="card pad"><div class="row wrap">${WATCH.map(id => {
      const a = AREAS.find(x => x.id === id);
      return a ? `<span class="pill green">${a.icon} ${esc(a.name)} <button onclick="WATCH=WATCH.filter(w=>w!=='${id}');persist();render()" style="margin-left:4px">✕</button></span>` : "";
    }).join("")}</div></div>` : ""}
</div></section>
${footerHTML()}`;
}

function togglePause(id) { const l = LISTINGS.find(x => x.id === id); if (l) { l.paused = !l.paused; persist(); toast(l.paused ? "Annonsen pausad" : "Annonsen är aktiv igen"); render(); } }
function removeListing(id) { LISTINGS = LISTINGS.filter(x => x.id !== id); persist(); toast("Annonsen borttagen"); render(); }
function cancelBooking(id) { BOOKINGS = BOOKINGS.filter(b => b.id !== id); persist(); toast("Avbokad – hela beloppet återbetalas"); render(); }
function extendBooking(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const spot = SPOTS.find(s => s.id === b.spotId);
  const unit = spot ? (priceFor(spot, b.mode) || spot.d) : Math.round(b.total / b.qty);
  openSheet(sheetHead("Förläng bokningen") + `<div class="sheet-b stack">
    <p class="dim">${esc(b.spot)} · ${esc(b.reg)}</p>
    <div class="field"><label>Lägg till</label><select class="inp" id="ext">
      ${[1, 2, 3, 6, 12].map(n => `<option value="${n}">${n} ${b.mode === "manad" ? "månad(er)" : b.mode === "timme" ? "timme/timmar" : "dygn"}</option>`).join("")}
    </select></div>
    <div class="note">Priset per enhet är ${kr(unit)}. Värden får svara inom 30 minuter.</div>
    <button class="btn btn-p btn-block" onclick="doExtend(${id},${unit})">Förläng</button>
  </div>`);
}
function doExtend(id, unit) {
  const n = +(document.getElementById("ext") || {}).value || 1;
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const f = feeSplit(unit * n, b.mode);
  b.qty += n; b.total += f.driverTotal;
  persist(); closeSheet(); toast(`Förlängd med ${n} – ${kr(f.driverTotal)} tillkommer`); render();
}
function openAccess(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  openSheet(sheetHead("Din plats") + `<div class="sheet-b stack center">
    <div style="font-size:40px">🔓</div>
    <h3>${esc(b.spot)}</h3>
    <p class="dim">${esc(b.addr || "")}</p>
    <div class="code">${esc(b.code)}</div>
    <p class="muted" style="font-size:13px">Kod till grind, port eller nyckelskåp</p>
    <div class="note" style="text-align:left">${esc(b.instr || "Instruktion från värden visas här.")}</div>
    <button class="btn btn-p btn-block" onclick="toast('Öppnar grinden … (demo)')">Öppna grinden</button>
    <button class="btn btn-g btn-block" onclick="closeSheet();go('meddelanden')">💬 Kontakta ${esc(b.host)}</button>
  </div>`);
}
function receipt(id) {
  const b = BOOKINGS.find(x => x.id === id); if (!b) return;
  const f = feeSplit(Math.round(b.total / 1.13), b.mode);
  openSheet(sheetHead("Kvitto") + `<div class="sheet-b">
    <p class="dim">${esc(b.spot)} · ${esc(b.date)} · ${esc(b.reg)}</p>
    <div style="margin-top:12px">
      <div class="kv"><span>Hyra (${b.qty} × ${esc(b.mode)})</span><b>${kr(f.base)}</b></div>
      <div class="kv"><span>Serviceavgift</span><b>${kr(f.service)}</b></div>
      <div class="kv"><span>Parkla Trygg</span><b>${kr(f.trygg)}</b></div>
      <div class="tot"><span>Betalt med ${esc(b.pay || "Swish")}</span><span class="num">${kr(b.total)}</span></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:12px">Kvittonummer PK-${b.id}. Uthyrning av parkeringsplats av privatperson – ingen moms redovisas.</p>
    <button class="btn btn-g btn-block" style="margin-top:12px" onclick="toast('Kvitto skickat till din e-post (demo)')">Skicka till e-post</button>
  </div>`);
}
function openPayouts() {
  const monthNet = Math.round(LISTINGS.filter(l => !l.paused).reduce((a, l) => a + l.pris, 0) * (1 - FEES.hostPctMonthly));
  const rows = [["25 aug 2026", monthNet, "På väg"], ["25 jul 2026", Math.round(monthNet * .95), "Utbetald"],
                ["25 jun 2026", Math.round(monthNet * .9), "Utbetald"], ["25 maj 2026", Math.round(monthNet * .81), "Utbetald"]];
  openSheet(sheetHead("Utbetalningar") + `<div class="sheet-b">
    <div class="tblwrap"><table class="tbl">
      <thead><tr><th>Datum</th><th class="r">Belopp</th><th class="r">Status</th></tr></thead>
      <tbody>${rows.map(([d, v, s]) => `<tr><td>${d}</td><td class="r">${kr(v)}</td><td class="r"><span class="pill ${s === "Utbetald" ? "green" : "amber"}">${s}</span></td></tr>`).join("")}</tbody>
    </table></div>
    <div class="note" style="margin-top:12px">Utbetalning sker den 25:e varje månad till ditt bankkonto. Vid korttidsuthyrning betalas pengarna ut 24 timmar efter avslutad bokning.</div>
  </div>`);
}
function openSchedule(id) {
  const l = LISTINGS.find(x => x.id === id); if (!l) return;
  const days = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
  l.sched = l.sched || days.map(() => ({ on: true, from: "00:00", to: "23:59" }));
  openSheet(sheetHead("Tillgänglighet") + `<div class="sheet-b stack">
    <p class="dim" style="font-size:14.5px">Välj när platsen får bokas. Du kan alltid blocka enskilda dagar i kalendern.</p>
    ${days.map((d, i) => `<div class="setrow"><div class="t"><b>${d}</b><span>${l.sched[i].on ? l.sched[i].from + "–" + l.sched[i].to : "Stängd"}</span></div>
      <div class="switch ${l.sched[i].on ? "on" : ""}" role="switch" onclick="toggleDay(${id},${i},this)"></div></div>`).join("")}
    <button class="btn btn-p btn-block" onclick="persist();closeSheet();toast('Schemat sparat')">${esc(t("save"))}</button>
  </div>`);
}
function toggleDay(id, i, el) {
  const l = LISTINGS.find(x => x.id === id); if (!l) return;
  l.sched[i].on = !l.sched[i].on; el.classList.toggle("on");
  el.parentElement.querySelector(".t span").textContent = l.sched[i].on ? l.sched[i].from + "–" + l.sched[i].to : "Stängd";
}
function kickCar() {
  openSheet(sheetHead("Flytta bilen") + `<div class="sheet-b stack">
    <div class="banner"><b>Så fungerar det.</b> När du trycker på knappen:</div>
    <div class="steps">
      <div class="step"><span class="n"></span><div><b>Vi ringer och sms:ar föraren direkt</b><div class="dim" style="font-size:14.5px">Inom 60 sekunder, dygnet runt.</div></div></div>
      <div class="step"><span class="n"></span><div><b>Övertidsavgift börjar ticka</b><div class="dim" style="font-size:14.5px">${kr(FEES.overtidPerTimme)} per påbörjad timme – hela beloppet går till dig.</div></div></div>
      <div class="step"><span class="n"></span><div><b>Efter tre timmar bekostar vi bärgning</b><div class="dim" style="font-size:14.5px">Vi hanterar kontakten med bärgare och polis.</div></div></div>
    </div>
    <button class="btn btn-d btn-block btn-lg" onclick="closeSheet();toast('Föraren kontaktad – övertidsavgift påbörjad (demo)')">Kontakta föraren nu</button>
    <button class="btn btn-g btn-block" onclick="closeSheet()">${esc(t("cancel"))}</button>
  </div>`);
}

/* ============================================================
   VY: EVENEMANG
   ============================================================ */
function viewEvenemang() {
  return `
<section style="padding:22px 0 8px"><div class="wrap narrow">
  <span class="eyebrow">Evenemang</span>
  <h1 style="margin:8px 0 8px">Parkera nära, kom hem först</h1>
  <p class="dim">Vid stora matcher och konserter tar arenaparkeringen 250–400 kr – och du står 40 minuter i kö ut. En uppfart 400 meter bort kostar mindre och du är hemma före alla andra.</p>
  <div class="stack" style="margin-top:20px">
    ${EVENTS.map(e => {
      const near = SPOTS.filter(s => s.area === e.area && s.ev > 0);
      const from = near.length ? Math.min.apply(null, near.map(s => s.ev)) : 0;
      return `<div class="card pad">
        <div class="row" style="align-items:flex-start">
          <div style="font-size:30px">${e.icon}</div>
          <div style="flex:1;min-width:0">
            <b>${esc(e.name)}</b>
            <div class="muted" style="font-size:13.5px">${esc(e.venue)} · ${esc(e.date)} kl ${esc(e.time)}</div>
            <div class="row wrap" style="margin-top:7px">
              <span class="pill">${e.crowd.toLocaleString("sv-SE")} besökare</span>
              ${near.length ? `<span class="pill green">${near.length} platser · från ${kr(from)}</span>` : `<span class="pill amber">Inga platser än – bli först</span>`}
            </div>
          </div>
        </div>
        <div class="row wrap" style="margin-top:12px">
          ${near.length ? `<button class="btn btn-sm btn-p" onclick="S.area='${e.area}';S.mode='evenemang';go('sok')">Hitta plats</button>` : ""}
          <button class="btn btn-sm btn-g" onclick="S.calc.city='Nära arena/evenemang';go('hyrut')">Hyr ut min plats den dagen</button>
        </div>
      </div>`;
    }).join("")}
  </div>

  <div class="card pad" style="margin-top:18px;background:var(--green-soft);border-color:transparent">
    <h3>Bor du nära en arena?</h3>
    <p class="dim" style="font-size:14.5px;margin-top:6px">Sex hemmamatcher plus fyra konserter på ett år är cirka ${kr(2500)} extra – för en uppfart som ändå står tom. Slår du på dynamiskt pris höjs priset automatiskt de dagarna.</p>
    <button class="btn btn-p btn-sm" style="margin-top:12px" data-go="hyrut">Räkna på min plats</button>
  </div>
</div></section>
${footerHTML()}`;
}

/* ============================================================
   VY: MEDDELANDEN & AVISERINGAR
   ============================================================ */
function viewMeddelanden() {
  return `
<section style="padding:22px 0 8px"><div class="wrap narrow">
  <h1>Meddelanden</h1>
  <div class="card pad" style="margin-top:16px">
    <div class="row" style="padding-bottom:12px;border-bottom:1px solid var(--line)">
      <div style="width:38px;height:38px;border-radius:50%;background:var(--green);color:var(--on-green);display:grid;place-items:center;font-weight:800">L</div>
      <div><b>Lena</b><div class="muted" style="font-size:13px">Uppfart i Märsta · svarar oftast inom 10 min</div></div>
    </div>
    <div id="msgbox" style="padding-top:14px;max-height:46vh;overflow-y:auto">
      ${MSGS.map(m => `<div class="msg ${m.me ? "me" : ""}"><div class="bub">${esc(m.t)}</div><span class="tm">${esc(m.tm)}</span></div>`).join("")}
    </div>
    <div class="row" style="margin-top:12px">
      <input class="inp" id="msginp" placeholder="Skriv ett meddelande…" onkeydown="if(event.key==='Enter')sendMsg()">
      <button class="btn btn-p" onclick="sendMsg()">Skicka</button>
    </div>
  </div>
  <div class="note" style="margin-top:14px">🔒 All kommunikation sker i Parkla. Vi delar aldrig ditt telefonnummer – och vid en tvist har vi hela historiken.</div>
</div></section>
${footerHTML()}`;
}
function sendMsg() {
  const el = document.getElementById("msginp");
  const v = (el.value || "").trim(); if (!v) return;
  const now = new Date();
  MSGS.push({ me: true, t: v, tm: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") });
  persist(); el.value = "";
  const box = document.getElementById("msgbox");
  box.innerHTML = MSGS.map(m => `<div class="msg ${m.me ? "me" : ""}"><div class="bub">${esc(m.t)}</div><span class="tm">${esc(m.tm)}</span></div>`).join("");
  box.scrollTop = box.scrollHeight;
  setTimeout(() => {
    MSGS.push({ me: false, t: "Absolut, det ordnar vi! 👍", tm: String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes() + 1).padStart(2, "0") });
    persist();
    const b2 = document.getElementById("msgbox");
    if (b2) { b2.innerHTML = MSGS.map(m => `<div class="msg ${m.me ? "me" : ""}"><div class="bub">${esc(m.t)}</div><span class="tm">${esc(m.tm)}</span></div>`).join(""); b2.scrollTop = b2.scrollHeight; }
  }, 1100);
}
function openNotis() {
  openSheet(sheetHead("Aviseringar") + `<div class="sheet-b">
    ${NOTIS.length ? NOTIS.map(n => `<button class="notif ${n.unread ? "unread" : ""}" onclick="readNotis('${n.id}')">
      <span class="ic">${n.ic}</span><span class="t"><b>${esc(n.t)}</b><span>${esc(n.s)}</span></span>
      ${n.unread ? '<span class="pill green" style="align-self:center">Ny</span>' : ""}</button>`).join("")
      : `<div class="empty"><div class="e">🔔</div><p class="dim" style="margin-top:8px">Inga aviseringar just nu.</p></div>`}
    <div class="row" style="margin-top:14px">
      <button class="btn btn-g btn-sm" onclick="NOTIS.forEach(n=>n.unread=false);persist();openNotis();render()">Markera alla som lästa</button>
      <button class="btn btn-g btn-sm" onclick="NOTIS=[];persist();openNotis();render()">Rensa</button>
    </div>
  </div>`);
}
function readNotis(id) { const n = NOTIS.find(x => x.id === id); if (n) { n.unread = false; persist(); openNotis(); render(); } }

/* ============================================================
   VY: INNEHÅLLSSIDOR
   ============================================================ */
function viewTrygg() {
  const items = [
    ["🇸🇪", "BankID krävs av båda parter", "Ingen kan boka anonymt. Vi kontrollerar också att registreringsnumret finns i fordonsregistret. Vid upprepade problem stängs kontot av permanent – vi matchar på personnummer, inte e-post.", ""],
    ["🛡️", `Parkla Trygg – ${moneyPlain(FEES.garantiBelopp)} ${curSym()} per händelse`, `Ingår automatiskt i varje bokning (${kr(FEES.tryggShort)} för korttid, ${kr(FEES.tryggMonthly)}/mån för månadskontrakt). Täcker skador på uppfart, grind, garageport, fasad och belysning orsakade av förarens fordon. Ingen självrisk för dig som värd.`,
     "Viktigt: förarens egen bil täcks av förarens egen bilförsäkring. Din hemförsäkrings ansvarsskydd gäller bara om <b>du</b> orsakat skadan. Det är precis den luckan Parkla Trygg fyller."],
    ["🚪", "”Flytta bilen”-knappen", `Står bilen kvar efter sluttid trycker du på en knapp. Vi ringer föraren inom 60 sekunder, debiterar ${kr(FEES.overtidPerTimme)} per påbörjad timme (hela beloppet till dig) och bekostar bärgning efter tre timmar. Du behöver aldrig själv bråka med någon.`, ""],
    ["📷", "Foto vid in- och utcheckning", "Båda parter fotar platsen. Bilderna tidsstämplas och sparas i 90 dagar. Vid tvist avgör vi på bevis, inte påståenden.", ""],
    ["⭐", "Dubbelriktade omdömen", "Förare betygsätts också. Under 4,3 i snitt och du förlorar tillgång till platser med ”endast toppbetyg”. Du som värd kan kräva minst 4,5 för att någon ska få boka direkt.", ""],
    ["💬", "All kontakt i appen", "Vi delar aldrig ditt telefonnummer. Samtal kopplas via ett växelnummer och chatten sparas som bevis.", ""],
    ["🏢", "BRF-läge", "Bor du i bostadsrätt behöver styrelsen godkänna andrahandsuthyrning av p-platsen – en utomhusplats är juridiskt ett lägenhetsarrende. Vi skickar en färdig fråga till styrelsen åt dig. Godkänner de en gång gäller det för alla medlemmar, och föreningen kan välja att få 10 % av intäkterna till föreningskassan.", ""]
  ];
  return `
<section><div class="wrap narrow">
  <span class="eyebrow">Trygghet</span>
  <h1 style="margin:8px 0 12px">Vi tog bort varje anledning att säga nej</h1>
  <p class="dim">Den största invändningen mot att hyra ut sin uppfart är inte pengarna. Det är tanken på en främmande bil på tomten. Här är exakt vad vi gör åt det.</p>
  <div class="stack" style="margin-top:22px">
    ${items.map(([i, h, p, n]) => `<div class="card pad">
      <div class="row"><span style="font-size:25px">${i}</span><h3>${h}</h3></div>
      <p class="dim" style="margin-top:8px">${p}</p>
      ${n ? `<div class="note" style="margin-top:11px">${n}</div>` : ""}
    </div>`).join("")}
  </div>
  <button class="btn btn-g" style="margin-top:18px" data-go="brf">Läs mer för BRF:er</button>
</div></section>
${footerHTML()}`;
}

function viewPriser() {
  const ex = [["Timme, Södermalm", 29, "timme"], ["Dygn, Märsta (Arlanda)", 69, "dygn"],
              ["Månad, Vasastan", 2650, "manad"], ["Evenemang, Friends Arena", 249, "evenemang"]];
  return `
<section><div class="wrap narrow">
  <span class="eyebrow">Priser &amp; avgifter</span>
  <h1 style="margin:8px 0 12px">Vi tjänar bara pengar när du gör det</h1>
  <p class="dim">Ingen startavgift, ingen månadsavgift, ingen bindningstid – varken för värdar eller förare. Allt vi tar syns i klartext innan du klickar.</p>

  <div class="card pad" style="margin-top:20px">
    <h3>Vad Parkla tar</h3>
    <div class="tblwrap"><table class="tbl" style="margin-top:10px">
      <thead><tr><th></th><th class="r">Korttid</th><th class="r">Månadskontrakt</th></tr></thead>
      <tbody>
        <tr><td>Serviceavgift (förare)</td><td class="r">${Math.round(FEES.driverPct * 100)} %</td><td class="r">${Math.round(FEES.driverPctMonthly * 100)} %</td></tr>
        <tr><td>Provision (värd)</td><td class="r">${Math.round(FEES.hostPct * 100)} %</td><td class="r">${Math.round(FEES.hostPctMonthly * 100)} %</td></tr>
        <tr><td>Parkla Trygg</td><td class="r">${kr(FEES.tryggShort)}/bokning</td><td class="r">${kr(FEES.tryggMonthly)}/mån</td></tr>
        <tr><td><b>Total take rate</b></td><td class="r">${Math.round((FEES.driverPct + FEES.hostPct) * 100)} %</td><td class="r">${Math.round((FEES.driverPctMonthly + FEES.hostPctMonthly) * 100)} %</td></tr>
      </tbody></table></div>
    <p class="muted" style="font-size:12.5px;margin-top:9px">Lägre avgift på månadskontrakt eftersom de kräver mindre support och konkurrerar direkt mot boendeparkering.</p>
  </div>

  <h3 style="margin:24px 0 10px">Exempel</h3>
  <div class="stack">
    ${ex.map(([n, p, m]) => { const f = feeSplit(p, m); return `
    <div class="card pad">
      <b>${n}</b>
      <div style="margin-top:8px">
        <div class="kv"><span>Värdens pris</span><b>${kr(f.base)}</b></div>
        <div class="kv"><span>Serviceavgift</span><b>+${kr(f.service)}</b></div>
        <div class="kv"><span>Parkla Trygg</span><b>+${kr(f.trygg)}</b></div>
        <div class="kv"><span><b>Förare betalar</b></span><b>${kr(f.driverTotal)}</b></div>
        <div class="kv"><span>Värd får ut</span><b style="color:var(--green)">${kr(f.hostNet)}</b></div>
        <div class="kv"><span class="muted">Parkla behåller</span><b class="muted">${kr(f.service + f.hostFee)}</b></div>
      </div>
    </div>`; }).join("")}
  </div>

  <div class="card pad" style="margin-top:18px">
    <h3>Varför ingen månadsprenumeration?</h3>
    <p class="dim" style="margin-top:8px">Vi har provräknat på det. En abonnemangsavgift för konsumenter dödar en marknadsplats innan den har nätverkseffekt – varje krona i inträdesavgift är en anledning att inte lägga upp sin plats. Vi tar betalt per transaktion tills vi är självklara, och säljer i stället abonnemang till dem som har råd: <b>BRF:er och fastighetsägare</b>.</p>
    <button class="btn btn-g btn-sm" style="margin-top:11px" data-go="affar">Se hela affärsmodellen</button>
  </div>

  <div class="card pad" style="margin-top:14px">
    <h3>Ingen reklam i appen</h3>
    <p class="dim" style="margin-top:8px">En marknadsplats som bygger på förtroende mellan grannar tål inte banners. Vi tar in partners på ett enda sätt: rabatterade laddboxar, försäkring och biltvätt som faktiskt gör platsen mer värd – aldrig som annonsyta.</p>
  </div>
</div></section>
${footerHTML()}`;
}

function viewSkatt() {
  const items = [
    ["1. 40 000 kr skattefritt – per bostad och år",
     "Hyr du ut en parkeringsplats som hör till din privatbostad beskattas det i inkomstslaget kapital, och du får göra ett schablonavdrag på 40 000 kr. För småhus får du dessutom dra av 20 % av hyresintäkten. I praktiken betyder det att de flesta uppfartsuthyrningar blir helt skattefria.",
     "Viktigt: du får <b>ett</b> schablonavdrag per bostad och år – även om du både hyr ut rum, säljer el och hyr ut p-platsen."],
    ["2. Bygglov – oftast inte, men kolla",
     "Du behöver inte bygglov för en p-plats avsedd för fastighetens eget behov, på mark där det redan finns ett en- eller tvåbostadshus. Bygglov krävs om ytan tillsammans med övriga p-platser överstiger 50 m² inom detaljplan (100 m² utanför). Börjar uthyrningen likna kommersiell parkeringsverksamhet kan kommunen bedöma det som ändrad användning – håll dig till din befintliga uppfart och några få platser.", ""],
    ["3. Bostadsrätt och hyresrätt – fråga först",
     "En p-plats utomhus är juridiskt ett lägenhetsarrende. Du får inte hyra ut den i andra hand utan föreningens tillstånd, och styrelsen har rätt att säga nej. Samma sak gäller hyresrätt. Parkla skickar en färdig fråga till styrelsen åt dig och föreslår en modell där föreningen får en andel.", ""],
    ["4. Moms – håll koll på 2027",
     "Upplåtelse av parkeringsplats är i grunden momspliktig verksamhet. Som privatperson under omsättningsgränsen behöver du inte momsregistrera dig. Skatteverket har ändrat ställning kring moms på p-platser (tillämpning framflyttad till 1 april 2027) och regeringen tillsatte i mars 2026 en utredning. Vi bevakar och uppdaterar dig automatiskt.", ""],
    ["5. Parkla rapporterar åt dig (DAC7)",
     "Parkla är en rapporteringsskyldig plattformsoperatör enligt EU:s DAC7-direktiv. Vi rapporterar dina intäkter till Skatteverket senast 31 januari varje år och skickar dig samma underlag. Du slipper räkna, och du slipper obehagliga överraskningar.", ""],
    ["6. Om det blir näringsverksamhet",
     "Hyr du ut många platser, anlägger nya ytor eller driver det med vinstsyfte i större skala kan det bedömas som näringsverksamhet – då gäller andra regler (F-skatt, moms, ingen schablon). Skattemätaren i appen varnar dig i god tid innan du närmar dig gränslandet.", ""]
  ];
  return `
<section><div class="wrap narrow">
  <span class="eyebrow">Skatt &amp; regler</span>
  <h1 style="margin:8px 0 12px">Så funkar skatten – på riktigt</h1>
  <div class="banner" style="margin-top:14px">Detta är en sammanfattning, inte skatterådgivning. Kontrollera alltid mot Skatteverket och din kommun.</div>
  <div class="stack" style="margin-top:18px">
    ${items.map(([h, p, n]) => `<div class="card pad"><h3>${h}</h3>
      <p class="dim" style="margin-top:8px">${p}</p>${n ? `<div class="note" style="margin-top:10px">${n}</div>` : ""}</div>`).join("")}
  </div>
</div></section>
${footerHTML()}`;
}

function viewBrf() {
  return `
<section><div class="wrap narrow">
  <span class="eyebrow">För BRF &amp; fastighetsägare</span>
  <h1 style="margin:8px 0 12px">Ni har tomma platser. Vi har kön.</h1>
  <p class="dim">Av Svenska Bostäders 10 328 p-platser i Stockholm står nästan 1 500 tomma – samtidigt som garageköerna hos andra aktörer är flera år långa. Problemet är inte brist. Det är att utbud och efterfrågan inte hittar varandra.</p>
  <div class="grid g2" style="margin-top:20px">
    ${[["Fyll tomma platser", "Vi lägger ut era lediga platser mot vår efterfrågan – timme, dygn eller månad. Ni behåller kontrollen över vilka som släpps in och till vilket pris."],
       ["Slipp administrationen", "Kontrakt, betalning, påfyllning av kön, avslut. Allt sker i Parkla. Styrelsen behöver inte lägga en enda kväll på p-listan."],
       ["Medlemmarna får hyra ut – lagligt", "Godkänn andrahandsuthyrning en gång i vårt BRF-läge. Föreningen kan välja att ta 10 % av medlemmarnas intäkter till föreningskassan."],
       ["Laddning som intäkt", "Har ni laddboxar sitter ni på en guldgruva. Elbilsägare utan hemmaladdning betalar 28 % mer för en plats med laddbox."]]
      .map(([h, p]) => `<div class="card pad"><h3>${h}</h3><p class="dim" style="margin-top:8px">${p}</p></div>`).join("")}
  </div>
  <div class="card pad" style="margin-top:16px">
    <h3>Priser för föreningar och fastighetsägare</h3>
    <div class="tblwrap"><table class="tbl" style="margin-top:10px">
      <thead><tr><th>Paket</th><th>Passar</th><th class="r">Pris</th></tr></thead>
      <tbody>
        <tr><td><b>Föreningen</b></td><td>Upp till 30 platser</td><td class="r">${kr(990)}/mån</td></tr>
        <tr><td><b>Fastighet</b></td><td>30–200 platser</td><td class="r">${kr(2900)}/mån</td></tr>
        <tr><td><b>Portfölj</b></td><td>200+ platser, API</td><td class="r">${kr(4900)}/mån</td></tr>
      </tbody></table></div>
    <p class="muted" style="font-size:12.5px;margin-top:9px">Inklusive dynamisk prissättning, digitala kontrakt, betalning, kundtjänst och rapportering. Ingen provision på era egna månadshyresgäster.</p>
    <button class="btn btn-p" style="margin-top:13px" onclick="toast('Vi hör av oss inom en arbetsdag (demo)')">Boka en genomgång</button>
  </div>
</div></section>
${footerHTML()}`;
}

function viewAffar() {
  return `
<section><div class="wrap narrow">
  <span class="eyebrow">Affärsmodell</span>
  <h1 style="margin:8px 0 12px">Fyra intäktslager – inte ett</h1>
  <p class="dim">De svenska försöken hittills säger alla samma sak: ”helt gratis”. Därför har ingen av dem råd att lösa likviditetsproblemet, och därför är de tomma. Parkla tar betalt från dag ett – men bara när någon tjänar pengar.</p>

  <div class="stack" style="margin-top:20px">
    ${[["1. Transaktion", "green", "Basen",
        `${Math.round(FEES.driverPct * 100)} % från föraren + ${Math.round(FEES.hostPct * 100)} % från värden = ${Math.round((FEES.driverPct + FEES.hostPct) * 100)} % take rate på korttid, ${Math.round((FEES.driverPctMonthly + FEES.hostPctMonthly) * 100)} % på månadskontrakt. Jämförelse: Airbnb cirka 15–17 %, Getaround 25–40 %, JustPark tar 3 % av värden plus bokningsavgift av föraren.`],
       ["2. Parkla Trygg", "amber", "Vallgraven",
        `${kr(FEES.tryggShort)} per bokning eller ${kr(FEES.tryggMonthly)} per månad för skadegaranti upp till ${kr(FEES.garantiBelopp)} och bärgning. Hög marginal – men framför allt: <b>det är detta som får folk att säga ja till att släppa in en främmande bil</b>. Ingen svensk konkurrent har det. Byggs som försäkringsupplägg med en partner.`],
       ["3. Parkla för BRF &amp; fastighet", "green", "Skalan",
        "990–4 900 kr/mån i SaaS. Löser samtidigt utbudsproblemet: en enda BRF kan ge 40 platser på en dag. Det är här de riktiga pengarna finns – och det är här konkurrenterna inte ens försöker."],
       ["4. Laddning", "", "Senare",
        `${FEES.laddOrePerKwh} öre/kWh ovanpå när platsen har laddbox, plus affiliate och återförsäljning av laddboxar. Sverige har extremt hög elbilsandel och hundratusentals lägenhetsboende som inte kan ladda hemma. En uppfart med laddbox är värd 28 % mer.`]]
      .map(([h, c, tag, p]) => `<div class="card pad">
        <div class="spread"><h3>${h}</h3><span class="pill ${c}">${tag}</span></div>
        <p class="dim" style="margin-top:8px">${p}</p></div>`).join("")}
  </div>

  <h3 style="margin:24px 0 10px">Vad vi medvetet valt bort</h3>
  <div class="stack">
    ${[["Månadsabonnemang för konsumenter", "Dödar likviditeten innan nätverket finns. Varje krona i inträdesavgift är en anledning att inte lägga upp sin plats."],
       ["Annonser och sponsorer i appen", "Kräver 100 000+ månadsanvändare för att ge något vettigt, och urholkar förtroendet i exakt den marknad där förtroende är produkten."],
       ["Bred lansering i hela Sverige", "Det är så alla föregångare dött: tomma överallt i stället för fulla någonstans. Vi tar ett område i taget tills det är mättat."]]
      .map(([h, p]) => `<div class="card pad"><b>${h}</b><p class="dim" style="font-size:14.5px;margin-top:4px">${p}</p></div>`).join("")}
  </div>

  <h3 style="margin:24px 0 10px">Lanseringsordning</h3>
  <div class="card pad"><div class="steps">
    ${[["Arlanda-korridoren – Märsta, Sigtuna, Rosersberg, Upplands Väsby", "Officiell P kostar 1 495–1 995 kr/vecka. En uppfart på 399 kr/vecka är en no-brainer för båda parter. Planerade bokningar, lång varaktighet, minimal support."],
       ["Månadskontrakt i Stockholms innerstad", "Boendeparkering 1 100 kr/mån och fleråriga garageköer. Låg churn, hög LTV."],
       ["Evenemang – Friends, Tele2, Avicii, Ullevi, Malmö Arena", "Extrem topplast, hög betalningsvilja, gratis PR varje matchdag."],
       ["Göteborg, Malmö, Uppsala, Lund – samma recept", "Först när Stockholm är mättat."],
       ["Norden, sedan Europa", "Oslo, Köpenhamn, Helsingfors. Samma juridiska logik, samma betalningsvanor."]]
      .map(([h, p]) => `<div class="step"><span class="n"></span><div><b>${h}</b><div class="dim" style="font-size:14.5px">${p}</div></div></div>`).join("")}
  </div></div>

  <h3 style="margin:24px 0 10px">Konkurrenterna</h3>
  <div class="card pad">
    <p class="dim" style="font-size:14.5px">Idén finns redan i Sverige – men ingen har vunnit. Hyruto (fortfarande i beta), Park Direkt (Stockholm, ”helt gratis”), Wace, ApParkingSpot (grundat 2021, partner till APCOA och Telia), GaragePlatsen och Parko. Alla har samma tre problem: gratis affärsmodell, ingen skadegaranti och för brett geografiskt fokus.</p>
    <div class="note" style="margin-top:12px">Det är goda nyheter. Efterfrågan är bevisad – marknaden är bara olöst. Den som först gör den <b>trygg</b> och <b>tät på ett ställe</b> tar hela kategorin.</div>
  </div>
</div></section>
${footerHTML()}`;
}

/* ============================================================
   VY: BJUD IN
   ============================================================ */
function viewBjudin() {
  const code = "PARKLA-" + (LS.get("refcode", null) || (() => { const c = Math.random().toString(36).slice(2, 7).toUpperCase(); LS.set("refcode", c); return c; })());
  return `
<section style="padding:22px 0"><div class="wrap narrow">
  <span class="eyebrow">Bjud in</span>
  <h1 style="margin:8px 0 10px">Ge 100 kr, få ${kr(FEES.refVard)}</h1>
  <p class="dim">Din granne har också en uppfart. Bjud in hen – när första bokningen är genomförd får du ${kr(FEES.refVard)} och hen får ${kr(FEES.refForare)} i parkeringskredit.</p>
  <div class="card pad center" style="margin-top:20px">
    <div class="code">${code}</div>
    <div class="row" style="justify-content:center;margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="copyRef('${code}')">Kopiera koden</button>
      <button class="btn btn-g" onclick="shareRef('${code}')">Dela</button>
    </div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    ${[["🏘️", "Grannar", "En gata med tio uppfarter blir en egen liten parkeringszon."],
       ["🏢", "Din BRF", "Tipsa styrelsen – föreningen kan ta 10 % av medlemmarnas intäkter."],
       ["🚗", "Kollegor", "Alla som pendlar in till stan letar efter en plats."]]
      .map(([i, h, p]) => `<div class="card pad"><div style="font-size:24px">${i}</div><h4 style="margin-top:7px">${h}</h4><p class="dim" style="font-size:14px;margin-top:4px">${p}</p></div>`).join("")}
  </div>
</div></section>
${footerHTML()}`;
}
function copyRef(c) {
  if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast("Koden kopierad"), () => toast(c));
  else toast(c);
}
function shareRef(c) {
  const txt = `Jag hyr ut min uppfart på Parkla och tjänar pengar på den. Använd koden ${c} så får du ${FEES.refForare} kr i parkeringskredit.`;
  if (navigator.share) navigator.share({ title: "Parkla", text: txt, url: location.origin + location.pathname }).catch(() => {});
  else copyRef(txt);
}

/* ============================================================
   VY: INSTÄLLNINGAR
   ============================================================ */
function viewInstallningar() {
  const themes = [["system", "Följ systemet"], ["light", "Ljust"], ["dark", "Mörkt"]];
  return `
<section style="padding:22px 0 8px"><div class="wrap narrow">
  <h1>${esc(t("settings"))}</h1>

  <div class="card pad" style="margin-top:16px">
    <h3>Utseende</h3>
    <div class="field" style="margin-top:11px"><label>${esc(t("theme"))}</label>
      <div class="seg">${themes.map(([k, l]) => `<button class="${SET.theme === k ? "on" : ""}" onclick="SET.theme='${k}';saveSettings();render()">${l}</button>`).join("")}</div></div>
    <div class="setrow" style="margin-top:6px"><div class="t"><b>Större text</b><span>Lättare att läsa i solen</span></div>
      <div class="switch ${SET.bigText ? "on" : ""}" role="switch" onclick="SET.bigText=!SET.bigText;saveSettings();render()"></div></div>
  </div>

  <div class="card pad" style="margin-top:14px">
    <h3>Språk och valuta</h3>
    <div class="grid g2" style="margin-top:11px">
      <div class="field"><label>${esc(t("language"))}</label>
        <select class="inp" onchange="SET.lang=this.value;saveSettings();render()">
          <option value="sv" ${SET.lang === "sv" ? "selected" : ""}>Svenska</option>
          <option value="en" ${SET.lang === "en" ? "selected" : ""}>English</option>
        </select></div>
      <div class="field"><label>${esc(t("currency"))}</label>
        <select class="inp" onchange="SET.currency=this.value;saveSettings();render()">
          ${Object.keys(CURRENCIES).map(k => `<option value="${k}" ${SET.currency === k ? "selected" : ""}>${k} – ${CURRENCIES[k].name}</option>`).join("")}
        </select></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:9px">Sverige först, sedan Norden och Europa. Valutaomräkning använder demokurser.</p>
  </div>

  <div class="card pad" style="margin-top:14px">
    <h3>Standardområde</h3>
    <div class="field" style="margin-top:11px">
      <select class="inp" onchange="SET.city=this.value;S.area=this.value;saveSettings();toast('Sparat')">
        ${AREAS.map(a => `<option value="${a.id}" ${SET.city === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
      </select></div>
  </div>

  <div class="card pad" style="margin-top:14px">
    <h3>Aviseringar</h3>
    <div style="margin-top:6px">
      ${[["bokning", "Bokningar", "Bekräftelser, ändringar och påminnelser"],
         ["betalning", "Betalningar", "Utbetalningar och kvitton"],
         ["pris", "Prisförslag", "När vi ser att du kan ta mer betalt"],
         ["evenemang", "Evenemang nära dig", "Matcher och konserter som ger extra intäkt"],
         ["nyheter", "Nyheter från Parkla", "Högst ett mejl i månaden"]]
        .map(([k, tt, ss]) => `<div class="setrow"><div class="t"><b>${tt}</b><span>${ss}</span></div>
          <div class="switch ${SET.notis[k] ? "on" : ""}" role="switch" onclick="SET.notis['${k}']=!SET.notis['${k}'];saveSettings();this.classList.toggle('on')"></div></div>`).join("")}
    </div>
  </div>

  <div class="card pad" style="margin-top:14px">
    <h3>Konto och data</h3>
    <div style="margin-top:6px">
      <div class="setrow"><div class="t"><b>Legitimering</b><span>BankID – simulerad i demon</span></div><span class="pill green">Verifierad</span></div>
      <div class="setrow"><div class="t"><b>Utbetalningskonto</b><span>SEB · ****4471 (demo)</span></div><button class="btn btn-sm btn-g" onclick="toast('Ändras med BankID i skarpt läge')">Ändra</button></div>
      <div class="setrow"><div class="t"><b>Exportera mina data</b><span>Allt du lagt in, som JSON</span></div><button class="btn btn-sm btn-g" onclick="exportData()">Exportera</button></div>
      <div class="setrow"><div class="t"><b>Nollställ demon</b><span>Raderar bokningar, annonser och favoriter</span></div><button class="btn btn-sm btn-d" onclick="resetAll()">Nollställ</button></div>
    </div>
  </div>

  <div class="card pad" style="margin-top:14px">
    <h3>Om appen</h3>
    <p class="dim" style="font-size:14.5px;margin-top:8px">Parkla ${VERSION} · prototyp med demodata. Lägg till på hemskärmen för att köra den som en app: dela-knappen → ”Lägg till på hemskärmen”.</p>
    <div class="row wrap" style="margin-top:11px">
      <button class="btn btn-sm btn-g" onclick="shareRef('')">Dela appen</button>
      <button class="btn btn-sm btn-g" data-go="affar">Affärsmodell</button>
      <button class="btn btn-sm btn-g" data-go="mer">Vanliga frågor</button>
    </div>
  </div>
</div></section>
${footerHTML()}`;
}
function exportData() {
  const data = { version: VERSION, settings: SET, bookings: BOOKINGS, listings: LISTINGS, favs: FAVS, watch: WATCH };
  const json = JSON.stringify(data, null, 2);
  try {
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "parkla-data.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Data exporterad");
  } catch (e) {
    openSheet(sheetHead("Dina data") + `<div class="sheet-b"><textarea class="inp" rows="14" readonly>${esc(json)}</textarea></div>`);
  }
}
function resetAll() {
  openSheet(sheetHead("Nollställ demon?") + `<div class="sheet-b stack">
    <p class="dim">Detta raderar dina bokningar, annonser, favoriter och inställningar i den här webbläsaren. Går inte att ångra.</p>
    <button class="btn btn-d btn-block" onclick="localStorage.clear();location.hash='';location.reload()">Ja, nollställ</button>
    <button class="btn btn-g btn-block" onclick="closeSheet()">${esc(t("cancel"))}</button></div>`);
}

/* ============================================================
   VY: MER
   ============================================================ */
function viewMer() {
  const unread = NOTIS.filter(n => n.unread).length;
  const links = [
    ["installningar", "⚙️", t("settings"), "Tema, språk, valuta, aviseringar"],
    ["evenemang", "🏟️", "Evenemang", "Matcher och konserter nära dig"],
    ["meddelanden", "💬", "Meddelanden", "Chatta med värdar och förare"],
    ["trygg", "🛡️", t("nav_trust"), "BankID, skadegaranti, flytta bilen"],
    ["priser", "💳", t("nav_price"), "Exakt vad vi tar, och varför"],
    ["skatt", "🧾", "Skatt &amp; regler", "40 000 kr skattefritt, bygglov, BRF, moms"],
    ["brf", "🏢", "För BRF &amp; fastighetsägare", "Fyll tomma platser"],
    ["bjudin", "🎁", "Bjud in en vän", `Ge ${moneyPlain(FEES.refForare)} ${curSym()}, få ${moneyPlain(FEES.refVard)} ${curSym()}`],
    ["affar", "📈", "Affärsmodell", "Hur Parkla tjänar pengar"]
  ];
  const faq = [
    ["Vad händer om någon inte flyttar bilen?", `Du trycker på ”Flytta bilen”. Vi ringer föraren inom 60 sekunder, debiterar ${kr(FEES.overtidPerTimme)} per påbörjad timme (allt till dig) och bekostar bärgning efter tre timmar.`],
    ["Kan jag få parkeringsbot på en Parkla-plats?", "Nej. Platsen är privat mark och du har ett giltigt avtal. Skulle en kontrollavgift ändå utfärdas bestrider vi den åt dig och betalar den om vi förlorar."],
    ["Måste jag vara hemma när någon parkerar?", "Nej. De flesta uthyrningar sker helt utan att ni träffas. Portkod, karta och instruktioner finns i appen."],
    ["Hur mycket kan jag realistiskt tjäna?", "Uppfart i Stockholms innerstad: 1 800–2 500 kr/mån. Märsta nära Arlanda: 1 200–1 700 kr/mån. Förort: 400–900 kr/mån. Med laddbox: cirka 28 % mer."],
    ["Betalar jag skatt på det?", "Oftast inte. Schablonavdraget är 40 000 kr per bostad och år. Vi visar en skattemätare i appen och skickar deklarationsunderlag i januari."],
    ["Jag bor i bostadsrätt – får jag hyra ut min p-plats?", "Bara med styrelsens tillstånd; en utomhusplats är juridiskt ett lägenhetsarrende. Vi skickar en färdig fråga till styrelsen åt dig."],
    ["Vad skiljer Parkla från tjänsterna som redan finns?", "De befintliga är gratis och därför tomma – ingen har råd att lösa likviditeten. Vi tar betalt från dag ett, satsar allt på ett område i taget och är ensamma om en riktig skadegaranti."],
    ["Vad händer om min bil blir skadad medan den står där?", "Din egen bilförsäkring gäller som vanligt. Parkla Trygg täcker det omvända: skador som din bil orsakar på värdens uppfart, grind eller garage."],
    ["Kan jag hyra ut när jag är bortrest?", "Ja – det är själva poängen. Sätt schemat till dina resdagar, eller lägg upp platsen bara när du vet att du är borta."],
    ["När kommer appen?", "Webben först – den fungerar redan på mobilen, lägg till den på hemskärmen. App Store och Google Play när den första korridoren är mättad."]
  ];
  return `
<section style="padding:22px 0 8px"><div class="wrap narrow">
  <h1>${esc(t("nav_more"))}</h1>

  <button class="card pad" style="margin-top:16px;width:100%;text-align:left;display:flex;gap:14px;align-items:center" onclick="openNotis()">
    <span style="font-size:24px">🔔</span>
    <span style="flex:1"><b>Aviseringar</b><div class="muted" style="font-size:13.5px">${unread ? unread + " olästa" : "Inga olästa"}</div></span>
    ${unread ? `<span class="pill red">${unread}</span>` : `<span class="muted">›</span>`}
  </button>

  <div class="stack tight" style="margin-top:10px">
    ${links.map(([r, i, tt, ss]) => `
      <button class="card pad" style="text-align:left;display:flex;gap:14px;align-items:center" data-go="${r}">
        <span style="font-size:23px">${i}</span>
        <span style="flex:1"><b>${tt}</b><div class="muted" style="font-size:13.5px">${ss}</div></span>
        <span class="muted">›</span>
      </button>`).join("")}
  </div>

  <h3 style="margin:24px 0 10px">Vanliga frågor</h3>
  <div class="card pad">${faq.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><div class="a">${a}</div></details>`).join("")}</div>

  <div class="card pad" style="margin-top:18px">
    <h3>Om Parkla</h3>
    <p class="dim" style="margin-top:8px">Parkla är en prototyp och ett arbetsunderlag. All data på sidan är demodata. Version ${VERSION}.</p>
    <div class="row wrap" style="margin-top:11px">
      <button class="btn btn-sm btn-g" data-go="installningar">${esc(t("settings"))}</button>
      <button class="btn btn-sm btn-g" onclick="shareRef('')">Dela</button>
    </div>
  </div>
</div></section>
${footerHTML()}`;
}

/* ============================================================
   ROUTER
   ============================================================ */
const VIEWS = {
  start: viewStart, sok: viewSok, hyrut: viewHyrut, mina: viewMina, mer: viewMer,
  trygg: viewTrygg, priser: viewPriser, skatt: viewSkatt, brf: viewBrf, affar: viewAffar,
  evenemang: viewEvenemang, meddelanden: viewMeddelanden, installningar: viewInstallningar, bjudin: viewBjudin
};

function render() {
  const v = VIEWS[S.route] || viewStart;
  document.getElementById("app").innerHTML = v();
  document.getElementById("nav").innerHTML = navHTML();
  document.getElementById("tabbar").innerHTML = tabbarHTML();
  const dot = document.getElementById("notisDot");
  if (dot) dot.classList.toggle("on", NOTIS.some(n => n.unread));
  document.documentElement.lang = SET.lang;
}

/* ---------- Händelser ---------- */
document.addEventListener("click", e => {
  const t2 = e.target.closest("[data-go]");
  if (t2) { e.preventDefault(); go(t2.dataset.go); }
});
document.getElementById("scrim").addEventListener("click", closeSheet);
document.getElementById("btnNotis").addEventListener("click", openNotis);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
window.addEventListener("hashchange", () => {
  const r = location.hash.replace("#", "") || "start";
  if (r !== S.route) { S.route = r; render(); }
});

/* ---------- Start ---------- */
applyTheme();
render();
if (!LS.get("seen", false)) {
  LS.set("seen", true);
  setTimeout(() => openSheet(sheetHead("Välkommen till Parkla") + `<div class="sheet-b stack">
    <p class="dim">Vad vill du göra först?</p>
    <button class="btn btn-p btn-block btn-lg" onclick="closeSheet();go('hyrut')">💰 Jag har en plats att hyra ut</button>
    <button class="btn btn-g btn-block btn-lg" onclick="closeSheet();go('sok')">🔍 Jag letar efter parkering</button>
    <button class="btn btn-g btn-block" onclick="closeSheet()">Bara titta runt</button>
    <p class="muted center" style="font-size:12.5px">Demo med påhittade platser. Inget konto behövs.</p>
  </div>`), 700);
}
