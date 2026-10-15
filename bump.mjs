// Bumpar ALLA versionsställen i ett svep (granskning v4 A1, 2026-10-15): data.js VERSION, version.json, sw.js CACHE och
// alla ?v= i index.html. version.json och data.js måste ALLTID vara samma, annars laddar flows.js om sidan för varje besökare.
// Kör: node bump.mjs            (dagens datum, nästa byggnummer)
//      node bump.mjs --check    (bara kontroll: avslutar med fel om versionerna skiljer sig)
import fs from "fs";

const read = (f) => fs.readFileSync(f, "utf8");
const dataV = /const VERSION = "([^"]+)"/.exec(read("data.js"))[1];
const jsonV = JSON.parse(read("version.json")).v;
const swN = Number(/const CACHE = "parkla-v(\d+)"/.exec(read("sw.js"))[1]);
const qs = [...new Set([...read("index.html").matchAll(/\?v=(\d+)/g)].map((m) => m[1]))];

if (process.argv.includes("--check")) {
  const fel = [];
  if (dataV !== jsonV) fel.push(`data.js ${dataV} men version.json ${jsonV}`);
  if (qs.length !== 1 || Number(qs[0]) !== swN) fel.push(`sw.js parkla-v${swN} men index.html ?v=${qs.join(",")}`);
  if (fel.length) { console.error("VERSIONER STÄMMER INTE: " + fel.join("; ")); process.exit(1); }
  console.log(`OK: ${dataV}, cache parkla-v${swN}`);
  process.exit(0);
}

const idag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const bygg = dataV.startsWith(idag) ? Number(dataV.split(".").pop()) + 1 : 1;
const ny = `${idag}.${bygg}`;
const n = Math.max(swN, ...qs.map(Number)) + 1;
fs.writeFileSync("data.js", read("data.js").replace(/const VERSION = "[^"]+"/, `const VERSION = "${ny}"`));
fs.writeFileSync("version.json", JSON.stringify({ v: ny }) + "\n");
fs.writeFileSync("sw.js", read("sw.js").replace(/const CACHE = "parkla-v\d+"/, `const CACHE = "parkla-v${n}"`));
fs.writeFileSync("index.html", read("index.html").replace(/\?v=\d+/g, `?v=${n}`));
console.log(`Version ${ny}, cache och ?v= ${n}`);
