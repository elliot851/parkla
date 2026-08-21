/* ============================================================
   Parkla — ikonsystem
   Strecktecknade ikoner på 24-rutnät. Inga emoji någonstans.
   ============================================================ */
"use strict";

const ICON_PATHS = {
  /* navigation */
  home:       '<path d="M3.5 10.4 12 3.6l8.5 6.8V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  search:     '<circle cx="10.8" cy="10.8" r="6.8"/><path d="M15.8 15.8 21 21"/>',
  wallet:     '<rect x="3" y="6" width="18" height="13" rx="2.4"/><path d="M3 10h18"/><circle cx="16.8" cy="14.5" r="1.1"/>',
  receipt:    '<path d="M5.5 21V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v17l-2.3-1.5-2.3 1.5-2.4-1.5L9.2 21l-2.3-1.5z"/><path d="M9 8h6M9 12h6"/>',
  dots:       '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  bell:       '<path d="M6 9.5a6 6 0 1 1 12 0c0 4.6 1.7 5.9 1.7 5.9H4.3S6 14.1 6 9.5Z"/><path d="M10.2 19.5a2 2 0 0 0 3.6 0"/>',
  chevron:    '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  arrow:      '<path d="M4.5 12h15"/><path d="M13.5 6l6 6-6 6"/>',
  arrowUp:    '<path d="M12 19.5v-15"/><path d="M6 10.5 12 4.5l6 6"/>',
  close:      '<path d="M6 6 18 18M18 6 6 18"/>',
  check:      '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  plus:       '<path d="M12 5v14M5 12h14"/>',
  minus:      '<path d="M5 12h14"/>',
  external:   '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',

  /* funktioner */
  bolt:       '<path d="M13.2 2.5 4.8 13.4h6.1L10.8 21.5 19.2 10.6h-6.1z"/>',
  car:        '<path d="M4.5 13.5 6.2 8.6A2 2 0 0 1 8.1 7.2h7.8a2 2 0 0 1 1.9 1.4l1.7 4.9"/><rect x="3" y="13.5" width="18" height="5.5" rx="1.6"/><circle cx="7.2" cy="19" r="1.6"/><circle cx="16.8" cy="19" r="1.6"/>',
  lock:       '<rect x="4.6" y="10.5" width="14.8" height="9.5" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  camera:     '<path d="M3 8.8a1.8 1.8 0 0 1 1.8-1.8h2.4L8.8 4.6h6.4L16.8 7h2.4A1.8 1.8 0 0 1 21 8.8v9.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18.2z"/><circle cx="12" cy="13" r="3.4"/>',
  shield:     '<path d="M12 3 5 5.9v5.6c0 4.5 2.9 7.9 7 9.5 4.1-1.6 7-5 7-9.5V5.9z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
  door:       '<path d="M6.5 20.5V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M3.5 20.5h17"/><circle cx="14.6" cy="12.4" r="1"/>',
  star:       '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
  building:   '<path d="M4 20.5V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15.5"/><path d="M15 10h4a1 1 0 0 1 1 1v9.5"/><path d="M3 20.5h18"/><path d="M7.5 8h4M7.5 12h4M7.5 16h4"/>',
  gift:       '<rect x="3.5" y="8.5" width="17" height="4.5" rx="1"/><path d="M5.2 13v6.5a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V13"/><path d="M12 8.5v12"/><path d="M12 8.5S10.6 4 8.4 4a2.2 2.2 0 0 0 0 4.5zM12 8.5S13.4 4 15.6 4a2.2 2.2 0 0 1 0 4.5z"/>',
  chart:      '<path d="M4 20.5h16"/><rect x="5" y="12" width="3.4" height="6"/><rect x="10.3" y="7.5" width="3.4" height="10.5"/><rect x="15.6" y="10" width="3.4" height="8"/>',
  sliders:    '<path d="M4 7.5h10M18 7.5h2M4 16.5h4M12 16.5h8"/><circle cx="16" cy="7.5" r="2.2"/><circle cx="10" cy="16.5" r="2.2"/>',
  message:    '<path d="M4 5.5h16a1 1 0 0 1 1 1v9.2a1 1 0 0 1-1 1H9.6L4.5 21V6.5a1 1 0 0 1 1-1z" transform="translate(-.5)"/><path d="M8 10h8M8 13h5"/>',
  calendar:   '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/>',
  pin:        '<path d="M12 21s7-6.4 7-11.2A7 7 0 0 0 5 9.8C5 14.6 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.6"/>',
  plane:      '<path d="M21 3 3.5 10.6l6.8 2.9 2.9 6.8z"/><path d="M10.3 13.5 21 3"/>',
  ticket:     '<path d="M4 7.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.2a2.3 2.3 0 0 0 0 4.6v2.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.2a2.3 2.3 0 0 0 0-4.6z"/><path d="M14 6.5v11"/>',
  truck:      '<rect x="2.5" y="7" width="11" height="9.5" rx="1"/><path d="M13.5 10.5h3.8l3.2 3.2v2.8h-7z"/><circle cx="6.5" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
  key:        '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15.5 12v2.2"/>',
  heart:      '<path d="M12 20.2s-7.6-4.6-7.6-9.6A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.6 2.6c0 5-7.6 9.6-7.6 9.6z"/>',
  clock:      '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
  users:      '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.8M17.5 14.5a6.2 6.2 0 0 1 3.7 5.5"/>',
  globe:      '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5s-1.2 6.1-3.4 8.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5z"/>',
  sun:        '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  moon:       '<path d="M20 14.4A8.5 8.5 0 1 1 9.6 4a6.8 6.8 0 0 0 10.4 10.4z"/>',
  monitor:    '<rect x="2.8" y="4.5" width="18.4" height="12" rx="1.8"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  layers:     '<path d="m12 3 8.5 4.6L12 12.2 3.5 7.6z"/><path d="m3.5 12.4 8.5 4.6 8.5-4.6"/><path d="m3.5 16.9 8.5 4.6 8.5-4.6"/>',
  target:     '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.4"/><path d="M12 1.8v3M12 19.2v3M22.2 12h-3M4.8 12h-3"/>',
  filter:     '<path d="M3.5 6.5h17M6.5 12h11M10 17.5h4"/>',
  list:       '<path d="M8.5 7h12M8.5 12h12M8.5 17h12"/><circle cx="4.5" cy="7" r="1.1"/><circle cx="4.5" cy="12" r="1.1"/><circle cx="4.5" cy="17" r="1.1"/>',
  map:        '<path d="m3.5 6.5 5.5-2.4v13.4l-5.5 2.4z"/><path d="M9 4.1 15 6.5v13.4L9 17.5z"/><path d="m15 6.5 5.5-2.4v13.4L15 19.9z"/>',
  play:       '<path d="M7.5 5.2 19 12 7.5 18.8z"/>',
  info:       '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  spark:      '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/><path d="M18.5 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>',
  refresh:    '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L3.5 9"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2L20.5 15"/><path d="M3.5 4.5V9H8M20.5 19.5V15H16"/>',
  download:   '<path d="M12 3.5v11.5"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 18.5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
  share:      '<circle cx="17.5" cy="6" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18" r="2.6"/><path d="m8.8 10.8 6.4-3.5M8.8 13.2l6.4 3.5"/>',
  copy:       '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2"/>',
  logout:     '<path d="M14 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h8"/><path d="M17 8.5 20.5 12 17 15.5M20 12H10"/>',
  bank:       '<path d="M3.5 9.5 12 4l8.5 5.5"/><path d="M5.5 9.5v9M18.5 9.5v9M9.5 9.5v9M14.5 9.5v9"/><path d="M3 20.5h18"/>',
  leaf:       '<path d="M20 4.5C10 4.5 4 9 4 15.5a5.5 5.5 0 0 0 5.5 5.5C16 21 20.5 14.5 20 4.5z"/><path d="M4.5 20.5C7 15 11.5 11 16 9"/>',
  tree:       '<path d="M12 3.5 6.8 12h10.4z"/><path d="M12 8.5 7.6 16h8.8z"/><path d="M12 16v5"/><path d="M9 21h6"/>',
  roof:       '<path d="M3.5 11.5 12 4.5l8.5 7"/><path d="M6.5 21v-6.5h11V21"/>',
  fence:      '<path d="M4 20.5V9l2.5-2.5L9 9v11.5M15 20.5V9l2.5-2.5L20 9v11.5"/><path d="M2.5 12h19M2.5 16h19"/>',
  garage:     '<path d="M3.5 20.5V8.8L12 4l8.5 4.8v11.7"/><rect x="7" y="12" width="10" height="8.5" rx="1"/><path d="M7 15.5h10M7 18.5h10"/>',
  driveway:   '<path d="M4 20.5 9 8.5h6l5 12"/><path d="M11.4 12h1.2M10.6 16h2.8"/><path d="M6.5 5.5 12 2l5.5 3.5"/>',
  carport:    '<path d="M2.5 10 12 4.5 21.5 10"/><path d="M5 10v10.5M19 10v10.5"/><rect x="8" y="14" width="8" height="4.5" rx="1"/>',
  courtyard:  '<rect x="3.5" y="6.5" width="17" height="14" rx="1.5"/><path d="M8 20.5v-4a4 4 0 0 1 8 0v4"/><path d="M12 3.5v3"/>',
  swish:      '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1.5 1.5 5.5 1.5 7 0s-.5-3-3.5-3-5-1.5-3.5-3 5.5-1.5 7 0"/>',
  card:       '<rect x="2.8" y="5.5" width="18.4" height="13" rx="2"/><path d="M2.8 10h18.4"/><path d="M6.5 14.5h3"/>',
  eye:        '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="3"/>'
};

/* Returnerar en inline-SVG. size i px, valfri extra klass. */
function I(name, size, cls) {
  const d = ICON_PATHS[name];
  if (!d) return "";
  const s = size || 20;
  return `<svg class="ico${cls ? " " + cls : ""}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}
/* Fylld variant, används för betyg och favoriter */
function IF(name, size, cls) {
  const d = ICON_PATHS[name];
  if (!d) return "";
  const s = size || 20;
  return `<svg class="ico${cls ? " " + cls : ""}" width="${s}" height="${s}" viewBox="0 0 24 24"
    fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}

/* Platstypernas illustrationer i listan */
const KIND_ICON = {
  uppfart: "driveway", garage: "garage", carport: "carport",
  innergard: "courtyard", tomt: "fence"
};
function kindIcon(kind, size) { return I(KIND_ICON[kind] || "driveway", size || 30); }
