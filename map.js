/* ============================================================
   Parkla — kartlager (Leaflet)
   Dragbar karta, satellitläge, adressökning, prisnålar.
   ============================================================ */
"use strict";

const PMap = (function () {
  let map = null, markers = {}, layers = {}, mode = "satellit", meMarker = null, onPick = null;

  const TILES = {
    karta: {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      attr: '&copy; OpenStreetMap &copy; CARTO', max: 20, sub: "abcd"
    },
    morker: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attr: '&copy; OpenStreetMap &copy; CARTO', max: 20, sub: "abcd"
    },
    satellit: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attr: 'Bilder &copy; Esri, Maxar, Earthstar Geographics', max: 19
    }
  };
  /* Skarpare satellit när användaren lagt in en egen nyckel (Settings → Karta). */
  const SAT_KEYED = {
    mapbox: {
      url: "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}@2x?access_token={key}",
      attr: '&copy; Mapbox &copy; Maxar', max: 22, tileSize: 512, zoomOffset: -1
    },
    google: {
      url: "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session={session}&key={key}",
      attr: '&copy; Google', max: 22
    }
  };
  const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

  function isDark() {
    const a = document.documentElement.getAttribute("data-theme");
    if (a === "dark") return true;
    if (a === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function satKey() {
    try { return (typeof SET !== "undefined" && SET.satKey) ? String(SET.satKey).trim() : ""; } catch (e) { return ""; }
  }
  function satProvider() {
    try { return (typeof SET !== "undefined" && SET.satProvider) ? SET.satProvider : "mapbox"; } catch (e) { return "mapbox"; }
  }

  function baseFor(m) {
    if (m === "satellit") {
      const key = satKey();
      if (key && satProvider() === "mapbox") {
        /* Mapbox Satellite: 512 px @2x, skarpt hela vägen till zoom 22 */
        return L.layerGroup([
          L.tileLayer(SAT_KEYED.mapbox.url.replace("{key}", key), {
            maxZoom: 22, tileSize: 512, zoomOffset: -1, attribution: SAT_KEYED.mapbox.attr
          })
        ]);
      }
      /* Esri utan nyckel: rutorna slutar på z19 men vi låter kartan zooma till 21
         genom att skala upp sista nivån i stället för att stanna. */
      /* Utan nyckel: Esri har ~0,5–1 m/pixel i svenska bostadsområden och tar slut
         runt zoom 18. Vi stannar där i stället för att visa uppskalad gröt. */
      return L.layerGroup([
        L.tileLayer(TILES.satellit.url, {
          maxZoom: 18, maxNativeZoom: 18, attribution: TILES.satellit.attr, detectRetina: false
        }),
        L.tileLayer(LABELS, { maxZoom: 18, maxNativeZoom: 18, opacity: .72, detectRetina: false })
      ]);
    }
    const t = isDark() ? TILES.morker : TILES.karta;
    return L.tileLayer(t.url, { maxZoom: 21, maxNativeZoom: t.max, subdomains: t.sub,
      attribution: t.attr, detectRetina: true });
  }

  /* Prisnål som HTML → helt stylad i CSS.
     st = { label, free, best, charge, selected } */
  function priceIcon(st) {
    const cls = ["mpin", st.free ? "free" : "busy", st.best ? "best" : "", st.selected ? "on" : ""]
      .filter(Boolean).join(" ");
    return L.divIcon({
      className: "",
      html: `<div class="${cls}"><i class="dot"></i><span>${st.label}</span>` +
            `${st.best ? '<i class="flag">billigast</i>' : ""}` +
            `${st.charge ? '<i class="b" title="Laddbox"></i>' : ""}</div>`,
      iconSize: null, iconAnchor: [0, 0]
    });
  }

  function init(el, center, zoom, opts) {
    opts = opts || {};
    destroy();
    /* UMD-bygget av leaflet-gesture-handling auto-registrerar sig inte —
       koppla in handlern på L.Map en gång innan första kartan skapas. */
    if (window.leafletGestureHandling && !L.Map.prototype._parklaGH) {
      L.Map.addInitHook("addHandler", "gestureHandling", window.leafletGestureHandling.GestureHandling);
      L.Map.prototype._parklaGH = true;
    }
    map = L.map(el, {
      center, zoom,
      zoomControl: false,
      attributionControl: true,
      /* Ett finger scrollar SIDAN, två fingrar flyttar kartan (som inbäddad Google Maps).
         Löser att man "fastnar" i kartan när man egentligen vill scrolla ner på sidan. */
      gestureHandling: !!window.leafletGestureHandling,
      gestureHandlingOptions: {
        text: {
          touch: "Använd två fingrar för att flytta kartan",
          scroll: "Använd Ctrl + rulla för att zooma kartan",
          scrollMac: "Använd ⌘ + rulla för att zooma kartan"
        },
        duration: 1500
      },
      scrollWheelZoom: true,
      dragging: true,
      tap: true,
      inertia: true,
      inertiaDeceleration: 2600,
      zoomSnap: 0,
      zoomDelta: 0.9,
      wheelDebounceTime: 20,
      wheelPxPerZoomLevel: 45,
      zoomAnimationThreshold: 8,
      doubleClickZoom: true,
      touchZoom: true,
      bounceAtZoomLimits: false,
      maxZoom: 21,
      worldCopyJump: true
    });
    layers.base = baseFor(mode).addTo(map);
    map.setMaxZoom((mode === "satellit" && !satKey()) ? 18 : 21);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPrefix("");
    onPick = opts.onPick || null;
    setTimeout(() => map && map.invalidateSize(), 60);
    return map;
  }

  function setMode(m) {
    mode = m;
    if (!map) return;
    if (layers.base) map.removeLayer(layers.base);
    layers.base = baseFor(mode).addTo(map);
    /* Zoomtaket följer lagret: 18 för nyckellös satellit, annars 21–22 */
    const cap = (m === "satellit" && !satKey()) ? 18 : 21;
    map.setMaxZoom(cap);
    if (map.getZoom() > cap) map.setZoom(cap);
  }
  function maxZoomNow() { return (mode === "satellit" && !satKey()) ? 18 : 21; }
  function getMode() { return mode; }

  function setSpots(list, stateOf, selectedId) {
    if (!map) return;
    /* Diffa i stallet for att riva: att ta bort och aterskapa 34 nalar
       vid varje filtertryck far hela kartan att "regna" om. Behall det
       som star kvar, byt bara ikon nar tillstandet andrats. */
    const kvar = {};
    list.forEach(s => {
      const st = stateOf(s);
      st.selected = s.id === selectedId;
      st.charge = s.charge;
      const nyckel = [st.label, st.free, st.best, st.selected, st.charge].join("|");
      const zi = st.selected ? 900 : st.best ? 500 : st.free ? 200 : 0;

      let mk = markers[s.id];
      if (mk) {
        if (mk._pKey !== nyckel) {
          mk.setIcon(priceIcon(st));
          mk.setZIndexOffset(zi);
          mk._pKey = nyckel;
        }
      } else {
        mk = L.marker(s.ll, { icon: priceIcon(st), riseOnHover: true, zIndexOffset: zi });
        mk._pKey = nyckel;
        mk.on("click", () => { if (onPick) onPick(s.id); });
        mk.addTo(map);
      }
      kvar[s.id] = mk;
    });
    Object.keys(markers).forEach(k => { if (!kvar[k]) map.removeLayer(markers[k]); });
    markers = kvar;
  }

  function fitSpots(list, pad) {
    if (!map || !list.length) return;
    if (list.length === 1) { map.flyTo(list[0].ll, 15, { duration: .5 }); return; }
    map.flyToBounds(L.latLngBounds(list.map(s => s.ll)), { padding: [pad || 56, pad || 56], duration: .55, maxZoom: 15 });
  }
  function flyTo(ll, z) { if (map) map.flyTo(ll, z || 15, { duration: .55 }); }
  function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 50); }

  function showMe(ll) {
    if (!map) return;
    if (meMarker) map.removeLayer(meMarker);
    meMarker = L.marker(ll, {
      icon: L.divIcon({ className: "", html: '<div class="mme"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
    }).addTo(map);
  }

  function locate(cb) {
    if (!navigator.geolocation) { cb(null, "Positionering stöds inte i den här webbläsaren."); return; }
    navigator.geolocation.getCurrentPosition(
      p => { const ll = [p.coords.latitude, p.coords.longitude]; showMe(ll); flyTo(ll, 15); cb(ll); },
      () => cb(null, "Kunde inte hämta din position."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  /* Adressökning via Nominatim (OpenStreetMap) */
  let searchTimer = null;
  function geocode(q, cb) {
    clearTimeout(searchTimer);
    if (!q || q.trim().length < 3) { cb([]); return; }
    searchTimer = setTimeout(() => {
      const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1"
        + "&countrycodes=se&q=" + encodeURIComponent(q);
      fetch(url, { headers: { "Accept-Language": "sv" } })
        .then(r => r.ok ? r.json() : [])
        .then(rows => cb(rows.map(r => ({
          label: r.display_name.split(",").slice(0, 3).join(",").trim(),
          full: r.display_name,
          ll: [parseFloat(r.lat), parseFloat(r.lon)]
        }))))
        .catch(() => cb([]));
    }, 380);
  }

  function destroy() {
    if (map) { map.remove(); map = null; }
    markers = {}; layers = {}; meMarker = null;
  }
  function alive() { return !!map; }

  return { init, setMode, getMode, maxZoomNow, setSpots, fitSpots, flyTo, invalidate, locate, geocode, showMe, destroy, alive };
})();

/* Avstånd i km mellan två koordinater */
function distKm(a, b) {
  const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
