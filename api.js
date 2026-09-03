/* ============================================================
   Parkla — riktig backend + riktiga betalningar

   Allt här använder BARA publika nycklar. Den hemliga
   Stripe-nyckeln finns aldrig i den här filen, aldrig i
   webbläsaren och aldrig i git — den bor som en secret i
   Supabase och lämnar aldrig servern.

   Är backend inte konfigurerad kör appen precis som förut,
   lokalt i telefonen, utan att något går sönder.
   ============================================================ */
(function () {
  "use strict";

  var NYCKLAR = "parkla.v3.cfg";
  /* OBS: appens parkeringssession ligger pa parkla.v3.session —
   inloggningen MASTE ha en egen nyckel, annars skriver de over varandra. */
  var SESSION = "parkla.v3.auth";

  /* Skarp config bakad i koden -> ALLA besökare når backend, ingen localStorage krävs.
     Alla tre värden är publika (Supabase publishable + Stripe publishable) och hör hemma i appen.
     localStorage.parkla.v3.cfg kan fortfarande överstyra (t.ex. test mot annan backend/nycklar).
     OBS: pk är Stripe TESTLÄGE -> byt till pk_live_... här vid skarp betalning (efter företagsverifiering). */
  var CFG_DEFAULT = {
    url: "https://nzbgjxccaldhjwxllsma.supabase.co",
    anon: "sb_publishable_0-AopBcKT_tiJ_k8wAMDbA_Gh2kH0fk",
    pk: "pk_test_51UAscOR2PolOyeMIoIG7P50FrCoe5QN05XijNOijQAHZFTNI4Ya0hCqxkq3uRVkqEK98FcEjgTpTB25BtrwA5jSb00fOvLBv4C"
  };
  function cfg() {
    try { return Object.assign({}, CFG_DEFAULT, JSON.parse(localStorage.getItem(NYCKLAR)) || {}); }
    catch (e) { return Object.assign({}, CFG_DEFAULT); }
  }
  function setCfg(c) {
    localStorage.setItem(NYCKLAR, JSON.stringify(c));
    stripeJs = null;
  }
  function pa() {
    var c = cfg();
    return !!(c.url && c.anon && c.pk);
  }

  /* ── Inloggning ───────────────────────────────────────── */

  function sess() {
    try { return JSON.parse(localStorage.getItem(SESSION)) || null; }
    catch (e) { return null; }
  }
  function setSess(s) {
    if (s) localStorage.setItem(SESSION, JSON.stringify(s));
    else localStorage.removeItem(SESSION);
  }

  function gotrue(vag, kropp) {
    var c = cfg();
    return fetch(c.url + "/auth/v1/" + vag, {
      method: "POST",
      headers: { "apikey": c.anon, "Content-Type": "application/json" },
      body: JSON.stringify(kropp)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || j.error || "Något gick fel");
        return j;
      });
    });
  }

  /* Vart bekräftelse- och återställningslänkarna ska landa. */
  function returAdress() {
    return location.origin + location.pathname;
  }

  /* Anrop som bär ett eget token (återställningslänkens). */
  function gotrueMed(vag, kropp, metod, bearer) {
    var c = cfg();
    return fetch(c.url + "/auth/v1/" + vag, {
      method: metod || "POST",
      headers: { "apikey": c.anon, "Authorization": "Bearer " + bearer, "Content-Type": "application/json" },
      body: JSON.stringify(kropp)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || j.error || "Något gick fel");
        return j;
      });
    });
  }

  /* ── Konto med lösenord ─────────────────────────────── */

  function registrera(epost, losen, namn) {
    return gotrue("signup?redirect_to=" + encodeURIComponent(returAdress()), {
      email: epost, password: losen, data: { namn: namn || "" }
    }).then(function (j) {
      /* Är mejlbekräftelse avstängd kommer en session direkt. */
      if (j.access_token) {
        setSess({ token: j.access_token, refresh: j.refresh_token,
          gar_ut: Date.now() + (j.expires_in - 60) * 1000, user: j.user });
        return { klar: true, user: j.user };
      }
      return { klar: false, user: j.user || j };   /* bekräftelse krävs */
    });
  }

  function loggaIn(epost, losen) {
    return gotrue("token?grant_type=password", { email: epost, password: losen })
      .then(function (j) {
        setSess({ token: j.access_token, refresh: j.refresh_token,
          gar_ut: Date.now() + (j.expires_in - 60) * 1000, user: j.user });
        return j.user;
      });
  }

  function glomtLosen(epost) {
    return gotrue("recover?redirect_to=" + encodeURIComponent(returAdress()), { email: epost });
  }

  function sattNyttLosen(nytt, bearer) {
    return gotrueMed("user", { password: nytt }, "PUT", bearer);
  }

  /* Sessionen fran en mejllank saknar user-objektet — hamta det. */
  function hamtaMig() {
    var s = sess();
    if (!s || s.user) return Promise.resolve(s ? s.user : null);
    var c = cfg();
    return fetch(c.url + "/auth/v1/user", {
      headers: { "apikey": c.anon, "Authorization": "Bearer " + s.token }
    }).then(function (r) { return r.json(); }).then(function (u) {
      if (u && u.id) { s.user = u; setSess(s); return u; }
      return null;
    }).catch(function () { return null; });
  }

  function skickaBekraftelseIgen(epost) {
    return gotrue("resend", { type: "signup", email: epost,
      options: { email_redirect_to: returAdress() } });
  }

  /* Sexsiffrig kod till mejlen — reservväg utan lösenord. */
  function skickaKod(epost) {
    return gotrue("otp", { email: epost, create_user: true });
  }

  function verifieraKod(epost, kod) {
    return gotrue("verify", { email: epost, token: kod, type: "email" })
      .then(function (j) {
        setSess({
          token: j.access_token,
          refresh: j.refresh_token,
          gar_ut: Date.now() + (j.expires_in - 60) * 1000,
          user: j.user
        });
        return j.user;
      });
  }

  function loggaUt() { setSess(null); }

  function jag() {
    var s = sess();
    return s ? s.user : null;
  }

  /* Färskt token, förnyas automatiskt. */
  function token() {
    var s = sess();
    if (!s) return Promise.resolve(null);
    if (Date.now() < s.gar_ut) return Promise.resolve(s.token);
    return gotrue("token?grant_type=refresh_token", { refresh_token: s.refresh })
      .then(function (j) {
        setSess({
          token: j.access_token, refresh: j.refresh_token,
          gar_ut: Date.now() + (j.expires_in - 60) * 1000, user: j.user
        });
        return j.access_token;
      })
      .catch(function () { setSess(null); return null; });
  }

  /* ── Databas ──────────────────────────────────────────── */

  function rest(vag, opt) {
    opt = opt || {};
    var c = cfg();
    return token().then(function (t) {
      var h = {
        "apikey": c.anon,
        "Authorization": "Bearer " + (t || c.anon),
        "Content-Type": "application/json"
      };
      if (opt.retur) h["Prefer"] = "return=representation";
      return fetch(c.url + "/rest/v1/" + vag, {
        method: opt.method || "GET",
        headers: h,
        body: opt.body ? JSON.stringify(opt.body) : undefined
      });
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.message || j.hint || "Databasfel");
        return j;
      });
    });
  }

  /* ── Serverfunktioner (där pengarna räknas) ───────────── */

  function fn(namn, kropp) {
    var c = cfg();
    return token().then(function (t) {
      if (!t) throw new Error("Du måste logga in först");
      return fetch(c.url + "/functions/v1/" + namn, {
        method: "POST",
        headers: {
          "apikey": c.anon,
          "Authorization": "Bearer " + t,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(kropp || {})
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.fel || "Något gick fel");
        return j;
      });
    });
  }

  /* ── Platser ──────────────────────────────────────────── */

  function platserIRutan(syd, vast, nord, ost) {
    return rest("rpc/platser_i_rutan", {
      method: "POST",
      body: { syd: syd, vast: vast, nord: nord, ost: ost }
    });
  }

  function minaPlatser() {
    var u = jag();
    if (!u) return Promise.resolve([]);
    return rest("listings?host_id=eq." + u.id + "&order=skapad.desc");
  }

  function sparaPlats(p) {
    var u = jag();
    if (!u) return Promise.reject(new Error("Logga in först"));
    p.host_id = u.id;
    if (p.id) {
      return rest("listings?id=eq." + p.id, { method: "PATCH", body: p, retur: true })
        .then(function (r) { return r[0]; });
    }
    return rest("listings", { method: "POST", body: p, retur: true })
      .then(function (r) { return r[0]; });
  }

  function taBortPlats(id) {
    return rest("listings?id=eq." + id, { method: "DELETE" });
  }

  function blockeraDag(listing_id, dag, pa_) {
    if (pa_) {
      return rest("blocks", { method: "POST", body: { listing_id: listing_id, dag: dag } });
    }
    return rest("blocks?listing_id=eq." + listing_id + "&dag=eq." + dag, { method: "DELETE" });
  }

  function sattDagspris(listing_id, dag, pris_kr) {
    if (pris_kr == null) {
      return rest("day_prices?listing_id=eq." + listing_id + "&dag=eq." + dag, { method: "DELETE" });
    }
    return rest("day_prices?on_conflict=listing_id,dag", {
      method: "POST",
      body: { listing_id: listing_id, dag: dag, pris_kr: pris_kr }
    });
  }

  function minaBokningar() {
    var u = jag();
    if (!u) return Promise.resolve([]);
    return rest("bookings?or=(driver_id.eq." + u.id + ",host_id.eq." + u.id +
      ")&order=borjar.desc&limit=50");
  }

  /* ── Stripe ───────────────────────────────────────────── */

  var stripeJs = null;

  function laddaStripe() {
    if (stripeJs) return stripeJs;
    stripeJs = new Promise(function (ok, nej) {
      if (window.Stripe) return ok(window.Stripe(cfg().pk));
      var s = document.createElement("script");
      s.src = "https://js.stripe.com/v3/";
      s.onload = function () { ok(window.Stripe(cfg().pk)); };
      s.onerror = function () { nej(new Error("Kunde inte ladda betalningen")); };
      document.head.appendChild(s);
    });
    return stripeJs;
  }

  /* Öppnar betalningsrutan och löser ut när kortet gått igenom. */
  function betala(client_secret, rubrik, undertext) {
    return laddaStripe().then(function (stripe) {
      return new Promise(function (klart, avbrutet) {
        var el = document.createElement("div");
        el.className = "paysheet";
        el.innerHTML =
          '<div class="paysheet-in">' +
          '<button class="paysheet-x" aria-label="Stäng">' + (window.I ? I("close", 20) : "×") + '</button>' +
          '<h2>' + (rubrik || "Betala") + '</h2>' +
          (undertext ? '<p class="paysheet-sub">' + undertext + '</p>' : "") +
          '<div id="pay-el"></div>' +
          '<div class="paysheet-fel" hidden></div>' +
          '<button class="paysheet-ok btn-primary">Betala</button>' +
          '<p class="paysheet-trygg">' +
          'Kortuppgifterna går direkt till Stripe. Parkla ser dem aldrig.</p>' +
          '</div>';
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("pa"); });

        /* Temat måste matcha arket. Appen har både ljust och mörkt läge —
           läs de faktiska färgerna ur CSS-variablerna så Stripe aldrig blir
           mörk text på mörk bakgrund (eller tvärtom). */
        var css = getComputedStyle(document.documentElement);
        var cvar = function (n, f) { var x = css.getPropertyValue(n).trim(); return x || f; };
        function lum(hex) {
          hex = (hex || "").replace("#", "");
          if (hex.length === 3) hex = hex.replace(/./g, "$&$&");
          var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
          return isNaN(r) ? 1 : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        }
        var kort = cvar("--card", "#FFFFFF");
        var moerkt = lum(kort) < 0.5;
        var groen = cvar("--green", moerkt ? "#10B981" : "#00875A");
        var linje = cvar("--rule", moerkt ? "#232A29" : "#E2E7E5");
        var text = cvar("--ink", moerkt ? "#EDF0EF" : "#0A0F0E");
        var elements = stripe.elements({
          clientSecret: client_secret,
          locale: "sv",
          appearance: {
            theme: moerkt ? "night" : "flat",
            variables: {
              colorPrimary: groen,
              colorBackground: kort,
              colorText: text,
              colorTextSecondary: cvar("--ink-45", "#7F8A88"),
              colorDanger: "#E5484D",
              fontFamily: "Instrument Sans, system-ui, sans-serif",
              borderRadius: "14px",
              spacingUnit: "5px"
            },
            rules: {
              ".Label": { color: text, fontWeight: "500" },
              ".Input": { border: "1px solid " + linje, boxShadow: "none", color: text },
              ".Input:focus": { border: "1px solid " + groen, boxShadow: "0 0 0 3px rgba(16,185,129,.18)" },
              ".Tab": { border: "1px solid " + linje },
              ".Tab--selected": { borderColor: groen },
              ".Tab:hover": { color: text }
            }
          }
        });
        elements.create("payment", {
          layout: "tabs",
          /* Ingen Link-inloggning — den ber om SMS-kod och krånglar till det.
             Vi vill ha den enklaste vägen: kort, Klarna, Swish rakt av. */
          wallets: { link: "never" }
        }).mount("#pay-el");

        var knapp = el.querySelector(".paysheet-ok");
        var felruta = el.querySelector(".paysheet-fel");

        function stang(resultat, avbryt) {
          el.classList.remove("pa");
          setTimeout(function () { el.remove(); }, 220);
          if (avbryt) avbrutet(new Error("avbruten"));
          else klart(resultat);
        }

        el.querySelector(".paysheet-x").onclick = function () { stang(null, true); };

        function visaFel(msg) {
          felruta.textContent = msg || "Betalningen gick inte igenom. Kontrollera kortuppgifterna och försök igen.";
          felruta.hidden = false;
          knapp.disabled = false;
          knapp.textContent = "Betala";
          try { felruta.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
        }
        knapp.onclick = function () {
          knapp.disabled = true;
          knapp.textContent = "Betalar…";
          felruta.hidden = true;
          stripe.confirmPayment({
            elements: elements,
            confirmParams: { return_url: location.href.split("#")[0] },
            redirect: "if_required"
          }).then(function (res) {
            /* Validerings- och kortfel kommer som res.error — visa dem, frys aldrig knappen. */
            if (res.error) { visaFel(res.error.message); return; }
            if (res.paymentIntent && res.paymentIntent.status === "succeeded") { stang(res.paymentIntent); return; }
            /* requires_action/processing m.m. — betalningen slutfördes inte i rutan. */
            visaFel("Betalningen slutfördes inte. Försök igen.");
          }).catch(function (e) {
            /* Utan detta .catch frös knappen på "Betalar…" om confirmPayment kastade. */
            visaFel((e && e.message) || "Något gick fel med betalningen. Försök igen.");
          });
        };
      });
    });
  }

  /* ── Boka i förväg ────────────────────────────────────── */

  function boka(listing_id, borjar, slutar, lage) {
    return fn("booking-intent", {
      listing_id: listing_id, borjar: borjar, slutar: slutar, lage: lage
    }).then(function (r) {
      if (r.godkannande) return r;                 // värden ska säga ja först
      return betala(r.client_secret, "Bekräfta bokningen",
        kr(r.total_ore) + " totalt").then(function () { return r; });
    });
  }

  /* ── Kör in utan bokning ──────────────────────────────── */

  function korInStart(listing_id) {
    return fn("session-start", { listing_id: listing_id }).then(function (r) {
      return betala(
        r.client_secret,
        "Reservera platsen",
        "Vi reserverar " + kr(r.reserv_ore) + " på kortet. Du betalar bara " +
        "för tiden du faktiskt står — resten släpps direkt när du åker."
      ).then(function () { return r; });
    });
  }

  function korInAnlant(session_id) {
    return fn("session-update", { session_id: session_id, action: "anlant" });
  }
  function korInAvbryt(session_id) {
    return fn("session-update", { session_id: session_id, action: "avbryt" });
  }
  function korInAvsluta(session_id) {
    return fn("session-update", { session_id: session_id, action: "avsluta" });
  }

  function minSession() {
    var u = jag();
    if (!u) return Promise.resolve(null);
    return rest("sessions?driver_id=eq." + u.id +
      "&state=in.(pahagg,star)&select=*,listings(*)&limit=1")
      .then(function (r) { return r && r[0] ? r[0] : null; });
  }

  /* ── Värdens utbetalning ──────────────────────────────── */

  function kopplaUtbetalning() {
    return fn("connect-onboard", { retur_url: location.href })
      .then(function (r) {
        if (r.klar) return true;
        location.href = r.url;      // Stripes egen verifiering
        return false;
      });
  }

  function utbetalningKlar() {
    var u = jag();
    if (!u) return Promise.resolve(false);
    return rest("profiles?id=eq." + u.id + "&select=utbetalning_klar")
      .then(function (r) { return !!(r && r[0] && r[0].utbetalning_klar); });
  }

  /* ── Hjälp ────────────────────────────────────────────── */

  function kr(ore) {
    return (ore / 100).toLocaleString("sv-SE", {
      minimumFractionDigits: ore % 100 ? 2 : 0,
      maximumFractionDigits: 2
    }) + " kr";
  }

  /* Bekräftelse- och återställningslänkar landar med tokens i #hash.
     Fånga dem här — api.js laddar före appens router. */
  (function () {
    var h = location.hash || "";
    if (h.indexOf("access_token=") === -1 && h.indexOf("error=") === -1) return;
    var p = {};
    h.replace(/^#/, "").split("&").forEach(function (par) {
      var i = par.indexOf("=");
      if (i > 0) p[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1));
    });
    window.__AUTH = p;
    /* Städa adressraden så tokens inte blir kvar i historiken. */
    history.replaceState(null, "", location.pathname + location.search);
    if (p.type !== "recovery" && p.access_token) {
      /* Bekräftad mejl → sessionen gäller direkt. */
      setSess({ token: p.access_token, refresh: p.refresh_token || "",
        gar_ut: Date.now() + ((+p.expires_in || 3600) - 60) * 1000, user: null });
    }
  })();

  window.PAPI = {
    pa: pa, cfg: cfg, setCfg: setCfg,
    skickaKod: skickaKod, verifieraKod: verifieraKod, loggaUt: loggaUt, jag: jag,
    registrera: registrera, loggaIn: loggaIn, glomtLosen: glomtLosen,
    sattNyttLosen: sattNyttLosen, skickaBekraftelseIgen: skickaBekraftelseIgen,
    setSessRaw: setSess, hamtaMig: hamtaMig,
    platserIRutan: platserIRutan, minaPlatser: minaPlatser,
    sparaPlats: sparaPlats, taBortPlats: taBortPlats,
    blockeraDag: blockeraDag, sattDagspris: sattDagspris,
    minaBokningar: minaBokningar, minSession: minSession,
    boka: boka,
    korInStart: korInStart, korInAnlant: korInAnlant,
    korInAvbryt: korInAvbryt, korInAvsluta: korInAvsluta,
    kopplaUtbetalning: kopplaUtbetalning, utbetalningKlar: utbetalningKlar,
    betala: betala, kr: kr
  };
})();
