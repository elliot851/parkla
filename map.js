/* ============================================================
   Parkla — kartlager (Leaflet)
   Dragbar karta, satellitläge, adressökning, prisnålar.
   ============================================================ */
"use strict";

const PMap = (function () {
  let map = null, markers = {}, layers = {}, mode = "karta", meMarker = null, onPick = null;

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
  const LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

  function isDark() {
    const a = document.documentElement.getAttribute("data-theme");
    if (a === "dark") return true;
    if (a === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function baseFor(m) {
    if (m === "satellit") {
      const g = L.layerGroup([
        L.tileLayer(TILES.satellit.url, { maxZoom: TILES.satellit.max, attribution: TILES.satellit.attr }),
        L.tileLayer(LABELS, { maxZoom: 19, opacity: .9 })
      ]);
      return g;
    }
    const t = isDark() ? TILES.morker : TILES.karta;
    return L.tileLayer(t.url, { maxZoom: t.max, subdomains: t.sub, attribution: t.attr, detectRetina: true });
  }

  /* Prisnål som HTML → helt stylad i CSS */
  function priceIcon(label, selected, charge) {
    return L.divIcon({
      className: "",
      html: `<div class="mpin${selected ? " on" : ""}">${charge ? '<i class="b"></i>' : ""}<span>${label}</span></div>`,
      iconSize: null, iconAnchor: [0, 0]
    });
  }

  function init(el, center, zoom, opts) {
    opts = opts || {};
    destroy();
    map = L.map(el, {
      center, zoom,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      dragging: true,
      tap: true,
      inertia: true,
      inertiaDeceleration: 2600,
      zoomSnap: .25,
      wheelPxPerZoomLevel: 110,
      worldCopyJump: true
    });
    layers.base = baseFor(mode).addTo(map);
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
  }
  function getMode() { return mode; }

  function setSpots(list, priceOf, selectedId) {
    if (!map) return;
    Object.keys(markers).forEach(k => map.removeLayer(markers[k]));
    markers = {};
    list.forEach(s => {
      const mk = L.marker(s.ll, { icon: priceIcon(priceOf(s), s.id === selectedId, s.charge), riseOnHover: true });
      mk.on("click", () => { if (onPick) onPick(s.id); });
      mk.addTo(map);
      markers[s.id] = mk;
    });
  }

  function fitSpots(list, pad) {
    if (!map || !list.length) return;
    if (list.length === 1) { map.flyTo(list[0].ll, 15, { duration: .8 }); return; }
    map.flyToBounds(L.latLngBounds(list.map(s => s.ll)), { padding: [pad || 56, pad || 56], duration: .85, maxZoom: 15 });
  }
  function flyTo(ll, z) { if (map) map.flyTo(ll, z || 15, { duration: .9 }); }
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

  return { init, setMode, getMode, setSpots, fitSpots, flyTo, invalidate, locate, geocode, showMe, destroy, alive };
})();

/* Avstånd i km mellan två koordinater */
function distKm(a, b) {
  const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
