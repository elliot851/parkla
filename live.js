/* ============================================================
   Parkla — skarpt läge

   Kopplar knapparna till riktig databas och riktiga pengar.
   Är skarpt läge av händer ingenting här: appen kör vidare
   som demo, precis som förut.

   En regel styr allt i den här filen:
   ── med riktiga pengar på går det bara att boka platser som
      en riktig värd har lagt upp. De 34 demoplatserna
      försvinner. Ingen ska kunna betala för en uppfart som
      inte finns.
   ============================================================ */
(function () {
  "use strict";

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function pa() { return typeof skarptPa === "function" && skarptPa(); }
  function inne() { return pa() && PAPI.jag(); }

  /* ── DB-rad → den form resten av appen redan förstår ────── */

  function dbTillSpot(r) {
    var f = r.funktioner || {};
    var feat = [];
    if (f.laddbox) feat.push("Laddbox");
    if (f.grind) feat.push("Låst eller grind");
    if (f.kamera) feat.push("Kamera");
    if (f.tak) feat.push("Tak");
    if (f.uppvarmt) feat.push("Uppvärmt");

    var mig = PAPI.jag();
    return {
      id: r.id,
      mine: !!(mig && r.host_id === mig.id),
      area: r.omrade || SET.city,
      kind: r.typ === "pplats" ? "uppfart" : r.typ,
      nm: r.titel,
      ad: r.adress,
      type: r.typ.charAt(0).toUpperCase() + r.typ.slice(1),
      h: r.pris_timme_kr, d: r.pris_dag_kr, m: r.pris_manad_kr,
      w: Math.round(r.pris_dag_kr * 4.6 / 10) * 10,
      ev: Math.round(r.pris_dag_kr * 1.9 / 10) * 10,
      rate: 5, n: 0,
      host: "Värd", hostSince: new Date(r.skapad).getFullYear(),
      charge: !!f.laddbox,
      feat: feat.length ? feat : ["Ny plats"],
      size: f.storlek || "Personbil",
      walk: 0,
      ll: [r.lat, r.lng],
      /* Kartan visar ett ungefärligt läge. Exakt adress och portkod
         lämnas ut först när man faktiskt bokat — de finns inte ens
         i det svar servern skickar hit. */
      ungefarligt: r.ungefarligt !== false,
      instr: "Exakt adress och kod visas när du bokat.",
      paused: r.pausad,
      direkt: r.direktbokning !== false,
      korin: r.korin !== false,
      db: true
    };
  }

  var DBSPOTS = null;

  window.laddaPlatser = function () {
    if (!pa()) { DBSPOTS = null; return Promise.resolve(); }
    return PAPI.platserIRutan(55.0, 10.0, 69.5, 24.5)
      .then(function (rows) {
        DBSPOTS = (rows || []).map(dbTillSpot);
        if (typeof render === "function") render();
      })
      .catch(function (e) {
        DBSPOTS = [];
        toast("Kunde inte hämta platser: " + e.message, "info");
      });
  };

  /* Med skarpt läge på ersätter databasen demoplatserna helt. */
  var demoAllSpots = window.allSpots;
  window.allSpots = function () {
    if (!pa()) return demoAllSpots();
    return DBSPOTS || [];
  };

  /* ── Kör in utan bokning ──────────────────────────────── */

  var demoStart = window.startNow;
  window.startNow = function (id) {
    if (!pa()) return demoStart(id);
    if (!UUID.test(String(id))) {
      return toast("Den här platsen finns bara i demon", "info");
    }
    kravInlogg(function () {
      var sp = allSpots().find(function (x) { return x.id === id; });
      if (!sp) return;
      if (SESSION) return toast("Du står redan på en plats", "info");

      PAPI.korInStart(id).then(function (r) {
        SESSION = {
          spotId: id, sid: r.session_id, state: "pahagg",
          hold: new Date(r.hall_till).getTime(), start: null, reserv: r.reserv_ore
        };
        saveSession(); closeSheet(); render();
        openSheet('<div class="sheet-b center" style="padding-top:34px">' +
          '<div class="tick" style="background:var(--green)">' + I("car", 30) + '</div>' +
          '<h3 style="font-family:var(--display);font-size:1.5rem">Platsen är din</h3>' +
          '<p class="dim" style="margin-top:8px">' + esc(sp.nm) + '</p>' +
          (r.grindkod ? '<div class="code" style="margin-top:20px">' + esc(r.grindkod) + '</div>' +
            '<p class="muted small" style="margin-top:8px">Kod till grind eller port</p>' : "") +
          '<div class="callout" style="margin-top:18px;text-align:left">' + I("info", 16) + " " + esc(sp.instr) + '</div>' +
          '<div class="callout brass" style="margin-top:12px;text-align:left">' + I("clock", 16) +
          ' Vi reserverade <b>' + PAPI.kr(r.reserv_ore) + '</b> på kortet. Du betalar bara för tiden du står – resten släpps när du åker.</div>' +
          '<button class="btn btn-p btn-block btn-lg" style="margin-top:20px" onclick="arrivedNow()">Jag står här</button>' +
          '<button class="btn btn-block" style="margin-top:10px" onclick="cancelNow()">Ändrade mig</button>' +
          '</div>');
      }).catch(function (e) {
        if (e.message !== "avbruten") toast(e.message, "info");
      });
    });
  };

  var demoArrived = window.arrivedNow;
  window.arrivedNow = function () {
    if (!pa() || !SESSION || !SESSION.sid) return demoArrived();
    PAPI.korInAnlant(SESSION.sid).then(function (r) {
      SESSION.state = "star";
      SESSION.start = new Date(r.startad).getTime();
      saveSession(); closeSheet(); render();
      toast("Klockan går. Tryck Jag åker nu när du lämnar.", "clock");
    }).catch(function (e) {
      toast(e.message, "info");
      if (/gick ut/.test(e.message)) { SESSION = null; saveSession(); closeSheet(); render(); }
    });
  };

  var demoCancel = window.cancelNow;
  window.cancelNow = function () {
    if (!pa() || !SESSION || !SESSION.sid) return demoCancel();
    var sid = SESSION.sid;
    PAPI.korInAvbryt(sid).then(function () {
      SESSION = null; saveSession(); closeSheet(); render();
      toast("Avbrutet – inga pengar drogs", "check");
    }).catch(function (e) { toast(e.message, "info"); });
  };

  var demoEnd = window.endNow;
  window.endNow = function () {
    if (!pa() || !SESSION || !SESSION.sid) return demoEnd();
    var sp = allSpots().find(function (x) { return x.id === SESSION.spotId; }) || { nm: "Platsen" };
    var sid = SESSION.sid;

    PAPI.korInAvsluta(sid).then(function (r) {
      SESSION = null; saveSession(); render();
      openSheet('<div class="sheet-b center" style="padding-top:34px">' +
        '<div class="tick">' + I("check", 30) + '</div>' +
        '<h3 style="font-family:var(--display);font-size:1.5rem">Tack för den här gången</h3>' +
        '<p class="dim" style="margin-top:8px">' + esc(sp.nm) + '</p>' +
        '<div style="margin-top:22px;text-align:left">' +
        '<div class="kv"><span>Du stod</span><b>' + tidText(r.minuter) + '</b></div>' +
        '<div class="kv"><span>Parkering</span><b>' + PAPI.kr(r.bas_ore) + '</b></div>' +
        '<div class="kv"><span>Serviceavgift</span><b>' + PAPI.kr(r.avgift_forare_ore) + '</b></div>' +
        '<div class="kv"><span>Trygghetsgaranti</span><b>' + PAPI.kr(r.trygg_ore || 0) + '</b></div>' +
        '<div class="tot"><span>Draget från kortet</span><span>' + PAPI.kr(r.debiterat_ore) + '</span></div>' +
        (r.slappt_ore > 0 ? '<p class="muted small" style="margin-top:10px">' +
          PAPI.kr(r.slappt_ore) + ' av reservationen släpptes. Banken visar det inom några dagar.</p>' : "") +
        (r.takbelopp_natt ? '<div class="callout brass" style="margin-top:12px;text-align:left">' + I("info", 16) +
          ' Du stod längre än reservationen räckte till. Vi debiterade takbeloppet.</div>' : "") +
        '</div>' +
        '<button class="btn btn-p btn-block btn-lg" style="margin-top:22px" onclick="closeSheet();go(\'mina\')">Klart</button>' +
        '</div>');
    }).catch(function (e) { toast(e.message, "info"); });
  };

  /* ── Boka i förväg ────────────────────────────────────── */

  var demoConfirm = window.confirmBooking;
  window.confirmBooking = function () {
    if (!pa()) return demoConfirm();

    var el = document.getElementById("regnr");
    var reg = (el ? el.value : S.bk.reg) || "";
    if (reg.trim().length < 5) {
      toast("Fyll i registreringsnumret", "info");
      if (el) el.focus(); return;
    }
    LS.set("lastreg", reg.toUpperCase().trim());

    var id = S.bk.id;
    if (!UUID.test(String(id))) return toast("Den här platsen finns bara i demon", "info");

    kravInlogg(function () {
      var iv = bokningsIntervall();
      PAPI.boka(id, iv.borjar, iv.slutar, iv.lage).then(function (r) {
        if (r.godkannande) {
          openSheet('<div class="sheet-b center" style="padding-top:36px">' +
            '<div class="tick" style="background:var(--brass)">' + I("clock", 32) + '</div>' +
            '<h3 style="font-family:var(--display);font-size:1.6rem">Förfrågan skickad</h3>' +
            '<p class="dim" style="margin-top:8px">Värden svarar oftast inom en timme. Pengarna dras först när svaret kommit.</p>' +
            '<button class="btn btn-p btn-block btn-lg" style="margin-top:22px" onclick="closeSheet();go(\'mina\')">Till mina bokningar</button>' +
            '</div>');
          return;
        }
        openSheet('<div class="sheet-b center" style="padding-top:36px">' +
          '<div class="tick">' + I("check", 32) + '</div>' +
          '<h3 style="font-family:var(--display);font-size:1.6rem">Platsen är din</h3>' +
          '<p class="dim" style="margin-top:8px">' + PAPI.kr(r.total_ore) + ' är betalt.</p>' +
          '<p class="muted small" style="margin-top:14px">Kod och instruktioner finns under Mitt.</p>' +
          '<button class="btn btn-p btn-block btn-lg" style="margin-top:22px" onclick="closeSheet();go(\'mina\')">Till mina bokningar</button>' +
          '</div>');
      }).catch(function (e) {
        if (e.message !== "avbruten") toast(e.message, "info");
      });
    });
  };

  /* Appens sex lagen -> de tre servern prissatter. */
  var SERVERLAGE = { timme: "timme", evenemang: "timme",
                     dygn: "dag", vecka: "dag",
                     manad: "manad", sasong: "manad" };

  /* Bokningsvyns val -> tva tidpunkter servern kan rakna pa.
     Faltet heter S.bk.start, inte .tid. Lagena heter timme/dygn/vecka/
     manad/sasong/evenemang - inte "dag". Fel har blir fel pris. */
  function bokningsIntervall() {
    var d = S.bk.date || new Date().toISOString().slice(0, 10);
    var start = new Date(d + "T" + (S.bk.start || "09:00") + ":00");
    if (isNaN(+start)) start = new Date();

    var slut = new Date(start);
    var n = Math.max(1, S.bk.qty || 1);

    switch (S.mode) {
      case "manad":     slut.setMonth(slut.getMonth() + n); break;
      case "sasong":    slut.setMonth(slut.getMonth() + 6 * n); break;
      case "vecka":     slut.setDate(slut.getDate() + 7 * n); break;
      case "dygn":      slut.setDate(slut.getDate() + n); break;
      case "evenemang": slut.setHours(slut.getHours() + 6); break;
      default:          slut.setMinutes(slut.getMinutes() + (S.bk.minuter || n * 60));
    }
    return { borjar: start.toISOString(), slutar: slut.toISOString(),
             lage: SERVERLAGE[S.mode] || "timme" };
  }

  /* ── Värdens utbetalning ──────────────────────────────── */

  window.kopplaUtbetalning = function () {
    if (!pa()) return toast("Slå på skarpt läge först", "info");
    kravInlogg(function () {
      toast("Öppnar Stripe…", "clock");
      PAPI.kopplaUtbetalning().then(function (klar) {
        if (klar) { toast("Utbetalning är redan klar", "check"); render(); }
      }).catch(function (e) { toast(e.message, "info"); });
    });
  };

  /* ── Vid start: hämta platser och ev. pågående parkering ── */

  function boot() {
    if (!pa()) return;
    laddaPlatser();
    if (!inne()) return;

    PAPI.minSession().then(function (s) {
      if (!s) return;
      SESSION = {
        spotId: s.listing_id, sid: s.id, state: s.state,
        hold: new Date(s.hall_till).getTime(),
        start: s.startad ? new Date(s.startad).getTime() : null,
        reserv: s.reserv_ore
      };
      saveSession(); render();
    }).catch(function () {});
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 40);
  } else {
    window.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 40); });
  }

  /* Byter man nycklar i inställningarna ska allt laddas om. */
  var demoSpara = window.sparaSkarpt;
  window.sparaSkarpt = function () {
    demoSpara();
    SESSION = null; saveSession();
    setTimeout(boot, 60);
  };
})();
