/* ============================================================
   Parkla — data och konfiguration
   ============================================================ */
"use strict";

const VERSION = "2026-08-24.35";

/* ---------- Avgiftsmodell ---------- */
const FEES = {
  driverPct: 0.12, driverPctMonthly: 0.06,
  hostPct: 0.10,   hostPctMonthly: 0.08,
  tryggShort: 9,   tryggMonthly: 49,
  overtidPerTimme: 150,
  schablon: 40000,
  garantiBelopp: 25000,
  refVard: 200, refForare: 100,
  laddOrePerKwh: 10
};

/* ---------- Valutor (demokurser) ---------- */
const CURRENCIES = {
  SEK: { sym:"kr", rate:1,     after:true,  name:"Svenska kronor" },
  EUR: { sym:"€",  rate:0.087, after:false, name:"Euro" },
  USD: { sym:"$",  rate:0.095, after:false, name:"US-dollar" },
  NOK: { sym:"kr", rate:1.02,  after:true,  name:"Norska kronor" },
  DKK: { sym:"kr", rate:0.65,  after:true,  name:"Danska kronor" },
  GBP: { sym:"£",  rate:0.075, after:false, name:"Brittiska pund" }
};

/* ---------- Områden. c = kartcentrum, z = zoomnivå ---------- */
const AREAS = [
  { id:"sthlm",   code:"STO", name:"Stockholm innerstad",   sub:"Södermalm · Vasastan · Östermalm", ref:"Boendeparkering 1 100 kr/mån",   c:[59.3251,18.0711], z:13 },
  { id:"arn",     code:"ARN", name:"Arlanda & Märsta",      sub:"Flygplatsparkering",               ref:"Officiell P: 1 495–1 995 kr/v",  c:[59.6180,17.8480], z:11 },
  { id:"gbg",     code:"GBG", name:"Göteborg",              sub:"Linné · Majorna · Centrum",        ref:"P-hus 1 200–1 900 kr/mån",       c:[57.7010,11.9640], z:13 },
  { id:"solna",   code:"SOL", name:"Solna & Friends Arena", sub:"Evenemang och arenor",             ref:"Arenaparkering 250–400 kr",      c:[59.3648,18.0000], z:14 },
  { id:"malmo",   code:"MMX", name:"Malmö",                 sub:"Västra hamnen · Möllan",           ref:"P-hus 900–1 400 kr/mån",         c:[55.5960,12.9950], z:13 },
  { id:"uppsala", code:"UPP", name:"Uppsala",               sub:"Centrum · Luthagen",               ref:"P-hus 900–1 300 kr/mån",         c:[59.8590,17.6420], z:13 },
  { id:"lund",    code:"LUN", name:"Lund",                  sub:"Centrum · Universitetet",          ref:"P-hus 800–1 200 kr/mån",         c:[55.7030,13.1870], z:14 },
  { id:"vasteras", code:"VST", name:"Västerås",             sub:"Centrum · Hamnen",                 ref:"P-hus 600–900 kr/mån",           c:[59.6050,16.5500], z:13 }
];

/* ---------- Platser ----------
   h/d/w/m/ev = pris per timme/dygn/vecka/månad/evenemang (0 = erbjuds ej)
   ll = [lat, lng]   kind = uppfart|garage|carport|innergard|tomt
------------------------------------------------------------------ */
const SPOTS = [
  /* Stockholm innerstad */
  {id:1,  area:"sthlm", kind:"uppfart",   nm:"Uppfart, Ringvägen",            ad:"Södermalm · 300 m från Skanstull",        type:"Uppfart",   h:29,d:139,w:590,m:2190,ev:0,   rate:4.9,n:64, host:"Anna",    hostSince:2024, charge:false, feat:["Kamera","Egen infart","Bred plats"],            size:"Personbil + SUV", walk:4,  ll:[59.3086,18.0762], instr:"Kör in från gatan, ställ bilen närmast häcken. Vänd nosen utåt."},
  {id:2,  area:"sthlm", kind:"garage",    nm:"Garageplats, Odengatan",        ad:"Vasastan · 120 m från Odenplan",          type:"Garage",    h:39,d:189,w:790,m:2650,ev:0,   rate:5.0,n:41, host:"Mikael",  hostSince:2023, charge:true,  feat:["Uppvärmt","Laddbox 11 kW","Portkod"],           size:"Personbil",       walk:2,  ll:[59.3428,18.0490], instr:"Portkod 1974. Plats 12, andra raden till höger."},
  {id:3,  area:"sthlm", kind:"innergard", nm:"Innergård, Katarina Bangata",   ad:"Södermalm · 5 min till Medborgarplatsen", type:"Innergård", h:25,d:119,w:490,m:1790,ev:0,   rate:4.7,n:88, host:"Sara",    hostSince:2024, charge:false, feat:["Grind","Belyst"],                               size:"Personbil",       walk:6,  ll:[59.3115,18.0810], instr:"Grinden öppnas med koden i appen. Parkera vid cykelstället."},
  {id:4,  area:"sthlm", kind:"carport",   nm:"Carport, Hornsgatan",           ad:"Södermalm · 400 m från Zinkensdamm",      type:"Carport",   h:27,d:129,w:540,m:1950,ev:0,   rate:4.8,n:33, host:"Jonas",   hostSince:2025, charge:true,  feat:["Tak","Laddbox 7,4 kW"],                         size:"Personbil + SUV", walk:5,  ll:[59.3175,18.0490], instr:"Carporten längst till vänster. Laddkabel hänger på väggen."},
  {id:5,  area:"sthlm", kind:"uppfart",   nm:"Uppfart, Valhallavägen",        ad:"Östermalm · 200 m från Karlaplan",        type:"Uppfart",   h:35,d:165,w:690,m:2490,ev:0,   rate:4.6,n:19, host:"Peter",   hostSince:2025, charge:false, feat:["Egen infart"],                                  size:"Personbil",       walk:3,  ll:[59.3383,18.0900], instr:"Backa in, annars kommer inte grannen ut."},
  {id:6,  area:"sthlm", kind:"garage",    nm:"Garage, Kungsholmen",           ad:"Kungsholmen · 350 m från Fridhemsplan",   type:"Garage",    h:33,d:159,w:660,m:2350,ev:0,   rate:4.8,n:52, host:"Ulrika",  hostSince:2024, charge:true,  feat:["Låst","Laddbox 22 kW","Uppvärmt"],              size:"Personbil + SUV", walk:5,  ll:[59.3336,18.0290], instr:"Fjärrkontroll hämtas i nyckelskåpet, kod i appen."},
  {id:7,  area:"sthlm", kind:"innergard", nm:"Innergård, Bondegatan",         ad:"Södermalm · 600 m från Nytorget",         type:"Innergård", h:23,d:109,w:450,m:1690,ev:0,   rate:4.5,n:27, host:"Ali",     hostSince:2025, charge:false, feat:["Grind","Sopsortering intill"],                  size:"Personbil",       walk:8,  ll:[59.3132,18.0838], instr:"Plats 3, markerad med gul linje."},
  {id:8,  area:"sthlm", kind:"uppfart",   nm:"Uppfart, Danderyd",             ad:"Danderyd · 12 min till Östermalm",        type:"Uppfart",   h:15,d:79, w:340,m:1190,ev:0,   rate:4.7,n:44, host:"Berit",   hostSince:2023, charge:true,  feat:["Laddbox 11 kW","Två platser","Nära tunnelbana"],size:"Personbil + SUV", walk:14, ll:[59.4050,18.0400], instr:"Höger sida av uppfarten. Laddbox på garageväggen."},

  /* Arlanda & Märsta */
  {id:10, area:"arn", kind:"uppfart", nm:"Uppfart i Märsta",         ad:"9 min bil till Arlanda Terminal 5",        type:"Uppfart", h:0,d:69,w:399,m:1490,ev:0, rate:4.9,n:212, host:"Lena",   hostSince:2023, charge:false, feat:["Skjuts till terminalen","Kamera","Plats för 2 bilar"], size:"Personbil + SUV",       walk:0, ll:[59.6200,17.8550], instr:"Ring 20 min innan ankomst så möter jag upp. Skjuts ingår."},
  {id:11, area:"arn", kind:"garage",  nm:"Garage i Sigtuna",         ad:"14 min bil till Arlanda",                  type:"Garage",  h:0,d:89,w:490,m:1790,ev:0, rate:5.0,n:96,  host:"Bo",     hostSince:2022, charge:true,  feat:["Låst garage","Laddbox 11 kW","Skjuts"],                size:"Personbil",             walk:0, ll:[59.6170,17.7230], instr:"Garaget är låst hela tiden. Skjuts bokas i chatten."},
  {id:12, area:"arn", kind:"tomt",    nm:"Grusplan, Rosersberg",     ad:"11 min bil till Arlanda",                  type:"Tomt",    h:0,d:55,w:319,m:1190,ev:0, rate:4.5,n:58,  host:"Kent",   hostSince:2024, charge:false, feat:["Plats för 4 bilar","Belyst","Husbil OK"],              size:"Personbil, husbil, släp",walk:0, ll:[59.5940,17.8880], instr:"Kör in genom grinden, parkera längs staketet."},
  {id:13, area:"arn", kind:"uppfart", nm:"Uppfart, Upplands Väsby",  ad:"18 min till Arlanda · 4 min till pendeln", type:"Uppfart", h:0,d:49,w:279,m:990, ev:0, rate:4.7,n:34,  host:"Ingrid", hostSince:2025, charge:false, feat:["Pendeltåg 400 m"],                                     size:"Personbil",             walk:0, ll:[59.5190,17.9280], instr:"Parkera bakom bilen som redan står där."},
  {id:14, area:"arn", kind:"garage",  nm:"Dubbelgarage, Knivsta",    ad:"16 min till Arlanda · 25 min till Uppsala",type:"Garage",  h:0,d:79,w:449,m:1590,ev:0, rate:4.8,n:41,  host:"Håkan",  hostSince:2024, charge:true,  feat:["Låst","Laddbox 11 kW","Bilvård kan bokas"],            size:"Personbil + SUV",       walk:0, ll:[59.7250,17.7900], instr:"Nyckelskåp vid ytterdörren, kod i appen."},
  {id:15, area:"arn", kind:"uppfart", nm:"Uppfart, Arlandastad",     ad:"6 min bil till Arlanda",                   type:"Uppfart", h:0,d:75,w:429,m:1590,ev:0, rate:4.9,n:127, host:"Marie",  hostSince:2023, charge:false, feat:["Närmast flygplatsen","Kamera","Skjuts"],               size:"Personbil",             walk:0, ll:[59.6350,17.9100], instr:"Skjuts ingår, ring när du landat."},

  /* Göteborg */
  {id:20, area:"gbg", kind:"uppfart",   nm:"Uppfart, Linnégatan",    ad:"Linné · 350 m från Järntorget",      type:"Uppfart",   h:24,d:115,w:470,m:1590,ev:0,   rate:4.8,n:52, host:"Elin",   hostSince:2024, charge:false, feat:["Egen infart","Belyst"],            size:"Personbil",       walk:5,  ll:[57.6980,11.9530], instr:"Kör in från gårdssidan, inte gatan."},
  {id:21, area:"gbg", kind:"garage",    nm:"Garage, Majorna",        ad:"600 m från Stigbergstorget",         type:"Garage",    h:29,d:139,w:590,m:1890,ev:0,   rate:4.9,n:37, host:"Hasse",  hostSince:2023, charge:true,  feat:["Laddbox 11 kW","Uppvärmt"],        size:"Personbil + SUV", walk:7,  ll:[57.6975,11.9310], instr:"Fjärrkontroll i brevlådan."},
  {id:22, area:"gbg", kind:"innergard", nm:"Innergård, Vasastan GBG",ad:"200 m från Vasaplatsen",             type:"Innergård", h:22,d:105,w:430,m:1450,ev:0,   rate:4.6,n:71, host:"Nina",   hostSince:2024, charge:false, feat:["Grind"],                           size:"Personbil",       walk:3,  ll:[57.6980,11.9720], instr:"Grindkod finns i appen."},
  {id:23, area:"gbg", kind:"uppfart",   nm:"Uppfart, Örgryte",       ad:"1,2 km från Ullevi",                 type:"Uppfart",   h:20,d:95, w:390,m:1290,ev:199, rate:4.7,n:63, host:"Stefan", hostSince:2023, charge:false, feat:["Evenemang","Ullevi 15 min gång"],  size:"Personbil + SUV", walk:15, ll:[57.7060,11.9930], instr:"Vid matchdag: kör in bakvägen, gatan är avstängd."},
  {id:24, area:"gbg", kind:"carport",   nm:"Carport, Hisingen",      ad:"Lindholmen · 700 m från piren",      type:"Carport",   h:18,d:89, w:360,m:1190,ev:0,   rate:4.5,n:29, host:"Yusuf",  hostSince:2025, charge:true,  feat:["Tak","Laddbox 7,4 kW"],            size:"Personbil",       walk:9,  ll:[57.7070,11.9380], instr:"Carport nummer 4."},

  /* Solna & arenor */
  {id:30, area:"solna", kind:"uppfart", nm:"Uppfart 400 m från Friends Arena", ad:"Råsunda · 5 min promenad",   type:"Uppfart", h:0, d:0,  w:0,  m:0,   ev:249, rate:4.9,n:143, host:"Tobias", hostSince:2022, charge:false, feat:["Evenemang","5 min promenad","Enkel utfart"], size:"Personbil + SUV", walk:5,  ll:[59.3690,18.0030], instr:"Kör in före kl 18 – gatan stängs vid stora matcher."},
  {id:31, area:"solna", kind:"garage",  nm:"Garageplats, Solna Centrum",       ad:"900 m från Friends Arena",   type:"Garage",  h:35,d:169,w:0,  m:2290,ev:299, rate:5.0,n:64,  host:"Malin",  hostSince:2023, charge:true,  feat:["Evenemang","Laddbox","Låst"],                size:"Personbil",       walk:11, ll:[59.3600,18.0010], instr:"Garage B, plats 44."},
  {id:32, area:"solna", kind:"tomt",    nm:"Tomt, Huvudsta",                   ad:"1,4 km från Friends Arena",  type:"Tomt",    h:0, d:0,  w:0,  m:0,   ev:179, rate:4.4,n:28,  host:"Ove",    hostSince:2024, charge:false, feat:["Evenemang","Plats för 6 bilar","Buss OK"],   size:"Personbil, buss", walk:17, ll:[59.3550,17.9800], instr:"Följ skyltarna, jag står och vinkar in er."},
  {id:33, area:"solna", kind:"uppfart", nm:"Uppfart, Hagalund",                ad:"1,1 km från arenan · Solna station 5 min", type:"Uppfart", h:22,d:105,w:430,m:1490,ev:229, rate:4.8,n:86, host:"Frida", hostSince:2023, charge:true, feat:["Evenemang","Laddbox 11 kW","Pendeltåg nära"], size:"Personbil + SUV", walk:13, ll:[59.3660,18.0100], instr:"Plats till höger om garaget."},

  /* Malmö */
  {id:40, area:"malmo", kind:"uppfart",   nm:"Uppfart, Västra hamnen", ad:"250 m från Turning Torso",  type:"Uppfart",   h:22,d:99, w:420,m:1290,ev:0,   rate:4.8,n:45, host:"Karim",  hostSince:2024, charge:true,  feat:["Laddbox 11 kW","Havsutsikt"], size:"Personbil",       walk:4,  ll:[55.6140,12.9760], instr:"Parkera med nosen mot vattnet."},
  {id:41, area:"malmo", kind:"garage",    nm:"Garage, Möllevången",    ad:"150 m från Möllevångstorget",type:"Garage",    h:25,d:115,w:470,m:1490,ev:0,   rate:4.7,n:39, host:"Fatima", hostSince:2023, charge:false, feat:["Låst","Kamera"],              size:"Personbil",       walk:2,  ll:[55.5900,13.0090], instr:"Garageport öppnas med kod."},
  {id:42, area:"malmo", kind:"innergard", nm:"Innergård, Davidshall",  ad:"400 m från Triangeln",      type:"Innergård", h:20,d:95, w:390,m:1190,ev:0,   rate:4.6,n:31, host:"Jesper", hostSince:2025, charge:false, feat:["Grind","Belyst"],             size:"Personbil",       walk:5,  ll:[55.5940,13.0010], instr:"Grinden är tung, dra ordentligt."},
  {id:43, area:"malmo", kind:"uppfart",   nm:"Uppfart, Limhamn",       ad:"2 km från Malmö Arena",     type:"Uppfart",   h:16,d:79, w:320,m:990, ev:159, rate:4.5,n:22, host:"Lotta",  hostSince:2025, charge:false, feat:["Evenemang","Två platser"],    size:"Personbil + SUV", walk:22, ll:[55.5750,12.9250], instr:"Uppfarten rymmer två bilar bakom varandra."},

  /* Uppsala */
  {id:50, area:"uppsala", kind:"uppfart", nm:"Uppfart, Luthagen",   ad:"800 m från Uppsala C",  type:"Uppfart", h:19,d:89,w:380,m:1190,ev:0, rate:4.9,n:57, host:"Erik",     hostSince:2023, charge:false, feat:["Egen infart"],           size:"Personbil", walk:9,  ll:[59.8620,17.6280], instr:"Vänster sida, framför häcken."},
  {id:51, area:"uppsala", kind:"carport", nm:"Carport, Kungsängen", ad:"400 m från Uppsala C",  type:"Carport", h:21,d:99,w:410,m:1290,ev:0, rate:4.6,n:24, host:"Malin",    hostSince:2024, charge:true,  feat:["Tak","Laddbox 7,4 kW"],  size:"Personbil", walk:5,  ll:[59.8540,17.6420], instr:"Carport 7."},
  {id:52, area:"uppsala", kind:"garage",  nm:"Garage, Fålhagen",    ad:"1,1 km från Uppsala C", type:"Garage",  h:18,d:85,w:350,m:1090,ev:0, rate:4.7,n:33, host:"Gunilla",  hostSince:2024, charge:false, feat:["Låst","Uppvärmt"],       size:"Personbil", walk:12, ll:[59.8570,17.6560], instr:"Nyckel i nyckelskåp vid dörren."},

  /* Lund */
  {id:60, area:"lund", kind:"uppfart", nm:"Uppfart, Professorsstaden", ad:"600 m från Lundagård", type:"Uppfart", h:17,d:82,w:340,m:1090,ev:0, rate:4.8,n:38, host:"Anders",  hostSince:2024, charge:false, feat:["Egen infart","Belyst"],  size:"Personbil", walk:7,  ll:[55.7010,13.1900], instr:"Parkera på grusytan, inte gräsmattan."},
  {id:61, area:"lund", kind:"garage",  nm:"Garage, Väster",            ad:"900 m från Lund C",    type:"Garage",  h:20,d:95,w:390,m:1250,ev:0, rate:4.6,n:26, host:"Camilla", hostSince:2025, charge:true,  feat:["Laddbox 11 kW","Låst"],  size:"Personbil", walk:10, ll:[55.7050,13.1830], instr:"Fjärrkontroll lämnas i brevlådan."},

  /* Västerås */
  {id:70, area:"vasteras", kind:"uppfart", nm:"Uppfart, Centrum", ad:"500 m från Stora torget",       type:"Uppfart", h:14,d:69,w:280,m:790,ev:0, rate:4.7,n:19, host:"Rolf",     hostSince:2025, charge:false, feat:["Egen infart"],                        size:"Personbil + SUV",   walk:6,  ll:[59.6100,16.5450], instr:"Kör in från Kopparbergsvägen."},
  {id:71, area:"vasteras", kind:"carport", nm:"Carport, Hamnen",  ad:"1,3 km från centrum · gästhamnen",type:"Carport", h:12,d:59,w:250,m:690,ev:0, rate:4.5,n:14, host:"Susanne", hostSince:2025, charge:true,  feat:["Tak","Laddbox 7,4 kW","Båtplats intill"], size:"Personbil, husvagn", walk:15, ll:[59.5980,16.5560], instr:"Carport längst bort mot vattnet."}
];

/* ---------- Beläggning ----------
   Samma plats ska visa samma lediga dagar varje gång man öppnar den.
   Därför en fröad pseudoslump i stället för Math.random(). */
function seedRand(n) { const x = Math.sin(n) * 10000; return x - Math.floor(x); }
function dayBooked(spotId, y, m, d) {
  const k = spotId * 10007 + y * 373 + (m + 1) * 31 + d;
  const täthet = (typeof BUSY_IDS !== "undefined" && BUSY_IDS.indexOf(spotId) > -1) ? 0.55 : 0.18;
  return seedRand(k) < täthet;
}
/* Hur många lediga dagar som är kvar den här månaden */
function freeDaysLeft(spotId, y, m, fromDay) {
  const dagar = new Date(y, m + 1, 0).getDate();
  let n = 0;
  for (let d = Math.max(1, fromDay); d <= dagar; d++) if (!dayBooked(spotId, y, m, d)) n++;
  return n;
}

/* ---------- Direktbokning kontra godkännande ----------
   Regel: korttid bokas DIREKT, annars är produkten död. Ingen som behöver en plats
   om tio minuter väntar på ett svar. Långa åtaganden (månad, vinterförvar) går alltid
   via godkännande – där är det rimligt att värden vill veta vem som kommer. */
const APPROVAL_IDS = [5, 8, 14, 30, 31, 32];   /* värdar som vill godkänna även korttid */
const LONG_MODES = ["manad", "sasong"];
function needsApproval(s, mode) {
  /* Vardens egen "lat folk boka direkt"-switch (instant:false) maste
     respekteras — den lagrades men ingen laste den vid bokning. */
  if (s && s.mine && typeof LISTINGS !== "undefined") {
    const l = LISTINGS.find(x => x.id === s.id);
    if (l && l.instant === false) return true;
  }
  return LONG_MODES.indexOf(mode) > -1 || APPROVAL_IDS.indexOf(s.id) > -1;
}

/* Tider en plats får bokas. Värden målar sitt fönster en gång. */
const OPEN_HOURS = { from: 6, to: 23 };
const DURATIONS = [
  { h: 1, label: "1 timme" }, { h: 2, label: "2 timmar" }, { h: 3, label: "3 timmar" },
  { h: 4, label: "4 timmar" }, { h: 8, label: "Hela arbetsdagen" }
];

/* ---------- Vinterförvar ----------
   Juridiskt viktigt: detta är en UPPLÅTELSE AV YTA, inte förvaring.
   Tar värden emot fordonet för förvaring uppstår vårdplikt (depositionsavtal)
   och då blir värden ansvarig. Därför: värden har aldrig nyckeln, och
   fordonsägarens egen försäkring gäller. Se viewVinter() i app.js. */
const SEASON = {
  kort: { id:"kort", label:"Vintersäsong", period:"1 november – 31 mars", months:5 },
  lang: { id:"lang", label:"Lång säsong",  period:"1 oktober – 30 april",  months:7 }
};
const SEASON_RABATT = 0.85;   /* 15 % rabatt mot att betala månad för månad */

/* Bara skyddade eller inhägnade platser får erbjuda vinterförvar.
   En öppen uppfart duger inte – bilen ska stå bakom grind, tak eller staket. */
function seasonOK(s) {
  if (s.kind === "garage" || s.kind === "carport" || s.kind === "tomt") return true;
  if (s.kind === "innergard") return s.feat.some(f => /Grind|Låst|Portkod|Kamera/.test(f));
  return false;
}
function seasonPrice(s, key) {
  if (!seasonOK(s) || !s.m) return 0;
  const m = (SEASON[key] || SEASON.kort).months;
  return Math.round(s.m * m * SEASON_RABATT / 10) * 10;
}

/* Stadsdelar — andra nivån i platsväljaren */
const PARTS = {
  sthlm:[["Hela innerstaden",[59.3251,18.0711],13],["Södermalm",[59.3130,18.0760],14],["Vasastan",[59.3428,18.0490],14],
         ["Östermalm",[59.3383,18.0900],14],["Kungsholmen",[59.3336,18.0290],14],["Danderyd",[59.4050,18.0400],13]],
  arn:  [["Hela området",[59.6180,17.8480],11],["Märsta",[59.6200,17.8550],13],["Sigtuna",[59.6170,17.7230],13],
         ["Rosersberg",[59.5940,17.8880],13],["Upplands Väsby",[59.5190,17.9280],13],["Knivsta",[59.7250,17.7900],13]],
  gbg:  [["Hela Göteborg",[57.7010,11.9640],13],["Linné",[57.6980,11.9530],14],["Majorna",[57.6975,11.9310],14],
         ["Vasastan",[57.6980,11.9720],14],["Örgryte",[57.7060,11.9930],14],["Hisingen",[57.7070,11.9380],14]],
  solna:[["Hela Solna",[59.3648,18.0000],14],["Råsunda",[59.3690,18.0030],15],["Solna Centrum",[59.3600,18.0010],15],
         ["Huvudsta",[59.3550,17.9800],15],["Hagalund",[59.3660,18.0100],15]],
  malmo:[["Hela Malmö",[55.5960,12.9950],13],["Västra hamnen",[55.6140,12.9760],14],["Möllevången",[55.5900,13.0090],14],
         ["Davidshall",[55.5940,13.0010],14],["Limhamn",[55.5750,12.9250],14]],
  uppsala:[["Hela Uppsala",[59.8590,17.6420],13],["Luthagen",[59.8620,17.6280],14],["Kungsängen",[59.8540,17.6420],14],
         ["Fålhagen",[59.8570,17.6560],14]],
  lund: [["Hela Lund",[55.7030,13.1870],14],["Professorsstaden",[55.7010,13.1900],15],["Väster",[55.7050,13.1830],15]],
  vasteras:[["Hela Västerås",[59.6050,16.5500],13],["Centrum",[59.6100,16.5450],14],["Hamnen",[59.5980,16.5560],14],
         ["Bäckby",[59.6180,16.4900],14],["Skiljebo",[59.6300,16.5800],14]]
};

/* Upptagna just nu — resten lyser grönt på kartan */
const BUSY_IDS = [5, 7, 12, 22, 32, 41, 52, 61, 71];
const spotFree = s => BUSY_IDS.indexOf(s.id) === -1;

/* ---------- Evenemang ---------- */
const EVENTS = [
  { id:"e1", kind:"Fotboll",  name:"AIK – Djurgården",            venue:"Friends Arena", area:"solna", date:"2026-08-29", time:"19:00", crowd:48000, ll:[59.3727,18.0009] },
  { id:"e2", kind:"Konsert",  name:"Veronica Maggio",             venue:"Avicii Arena",  area:"sthlm", date:"2026-09-05", time:"20:00", crowd:16000, ll:[59.2937,18.0831] },
  { id:"e3", kind:"Hockey",   name:"Frölunda – Skellefteå",       venue:"Scandinavium",  area:"gbg",   date:"2026-09-12", time:"19:00", crowd:12000, ll:[57.7002,11.9866] },
  { id:"e4", kind:"Musik",    name:"Melodifestivalen, deltävling",venue:"Malmö Arena",   area:"malmo", date:"2026-09-19", time:"20:00", crowd:13000, ll:[55.5648,12.9784] },
  { id:"e5", kind:"Landskamp",name:"Sverige – Norge",             venue:"Friends Arena", area:"solna", date:"2026-10-03", time:"18:00", crowd:50000, ll:[59.3727,18.0009] },
  { id:"e6", kind:"Lopp",     name:"Göteborgsvarvet, start",      venue:"Slottsskogen",  area:"gbg",   date:"2026-10-10", time:"09:00", crowd:60000, ll:[57.6839,11.9420] }
];
/* Kör-in-parkering: hur länge vi håller platsen medan du är på väg,
   och hur priset räknas när man bara ställer sig. */
const HALL_MINUTER = 20;      /* platsen hålls så här länge efter "jag åker hit" */
const MIN_DEBITERING = 60;    /* första timmen alltid, sedan halvtimmar */
const STEG_MINUTER = 30;

/* Hur långt från en arena det är värt att höja priset. */
const EVENT_RADIE_KM = 6;

/* ---------- Omdömen ---------- */
const REVIEWS = {
  1:[{who:"Fredrik",r:5,t:"Perfekt läge, precis som beskrivet. Anna svarade på två minuter.",d:"aug 2026"},
     {who:"Sanna",r:5,t:"Har hyrt i fyra månader nu. Sparar 900 kr i månaden mot p-huset.",d:"jul 2026"},
     {who:"Ove",r:4,t:"Lite trångt om man har husbil, annars toppen.",d:"jun 2026"}],
  10:[{who:"Malin",r:5,t:"Lämnade bilen i två veckor. Skjuts till terminalen ingick – 1 100 kr billigare än Arlandas egen P.",d:"aug 2026"},
      {who:"Johan",r:5,t:"Bättre än långtidsparkering. Bilen stod under tak och var tvättad när jag kom hem.",d:"aug 2026"},
      {who:"Petra",r:5,t:"Lena är fantastisk. Bokar igen i december.",d:"jul 2026"}],
  30:[{who:"Anton",r:5,t:"200 m från arenan och ingen kö ut efteråt. Aldrig mer arenaparkeringen.",d:"aug 2026"},
      {who:"Nadja",r:5,t:"Tobias vinkade in oss. Kändes tryggt med bil full av barn.",d:"maj 2026"}],
  2:[{who:"Karl",r:5,t:"Uppvärmt garage mitt i stan. Laddboxen funkade felfritt.",d:"aug 2026"},
     {who:"Iris",r:5,t:"Bästa 2 650 kronorna jag lägger varje månad.",d:"jul 2026"}]
};
const DEFAULT_REVIEWS = [
  {who:"Emma",   r:5, t:"Precis som på bilderna. Enkel in- och utfart.", d:"aug 2026"},
  {who:"Daniel", r:5, t:"Smidigt hela vägen, värden svarade snabbt.",    d:"jul 2026"},
  {who:"Hanna",  r:4, t:"Bra plats. Lite smal, men fungerar för en vanlig bil.", d:"jun 2026"}
];

/* ---------- Prismotor ---------- */
const CITY_BASE = {
  "Stockholm innerstad": { m:2100, d:130, h:28 },
  "Stockholm förort":    { m:900,  d:75,  h:16 },
  "Göteborg":            { m:1450, d:110, h:23 },
  "Malmö":               { m:1200, d:95,  h:21 },
  "Uppsala":             { m:1150, d:90,  h:19 },
  "Lund":                { m:1050, d:85,  h:17 },
  "Nära flygplats":      { m:1400, d:65,  h:0  },
  "Nära arena":          { m:1100, d:95,  h:20 },
  "Övrig stad/tätort":   { m:650,  d:60,  h:12 }
};
const TYPE_MULT = { "Uppfart":1.0, "Carport":1.10, "Garage":1.32, "Innergård":0.95, "Tomt/gård":0.80 };
const TYPE_KIND = { "Uppfart":"uppfart","Carport":"carport","Garage":"garage","Innergård":"innergard","Tomt/gård":"tomt" };

/* ---------- Aviseringar & meddelanden (demo) ---------- */
const SEED_NOTIS = [
  { id:"n1", ic:"wallet", t:"Utbetalning på väg",       s:"2 015 kr landar på ditt konto den 25 augusti.", unread:true },
  { id:"n2", ic:"ticket", t:"Stort evenemang nära dig", s:"AIK – Djurgården 29 aug. Höj priset till 249 kr den dagen?", unread:true },
  { id:"n3", ic:"star",   t:"Nytt omdöme",              s:"Fredrik gav dig 5 av 5: ”Perfekt läge, precis som beskrivet.”", unread:false },
  { id:"n4", ic:"receipt",t:"Skattemätaren",            s:"Du har använt 37 % av ditt schablonavdrag i år.", unread:false }
];
const SEED_MSG = [
  { me:false, t:"Hej! Jag landar 22:40 på fredag, går det bra att komma så sent?", tm:"12:04" },
  { me:true,  t:"Absolut, ingen fara. Koden till grinden ligger i appen.", tm:"12:07" },
  { me:false, t:"Toppen, tack! Har du plats för en kombi?", tm:"12:08" },
  { me:true,  t:"Ja, uppfarten tar en Volvo V90 med marginal.", tm:"12:09" }
];

/* ---------- Översättningar ---------- */
const I18N = {
  sv: {
    nav_find:"Hitta parkering", nav_rent:"Hyr ut", nav_trust:"Trygghet", nav_price:"Priser",
    nav_me:"Min sida", nav_cta:"Sök plats", nav_more:"Mer", nav_events:"Evenemang",
    tab_start:"Start", tab_search:"Sök", tab_rent:"Hyr ut", tab_me:"Mitt", tab_more:"Mer",
    hour:"Timme", day:"Dygn", month:"Månad", event:"Match", week:"Vecka",
    per_hour:"per timme", per_day:"per dygn", per_month:"per månad", per_event:"per gång", per_week:"per vecka",
    u_hour:"/tim", u_day:"/dygn", u_month:"/mån", u_event:"/gång", u_week:"/vecka",
    book:"Boka med BankID", search_where:"Var vill du parkera?", free_spots:"lediga platser",
    filters:"Filter", clear:"Rensa", sort_price:"Lägst pris", sort_rating:"Högst betyg", sort_dist:"Närmast",
    settings:"Inställningar", theme:"Utseende", language:"Språk", currency:"Valuta",
    save:"Spara", cancel:"Avbryt", close:"Stäng", back:"Tillbaka", next:"Nästa", done:"Klart",
    map:"Karta", list:"Lista", satellite:"Satellit"
  },
  en: {
    nav_find:"Find parking", nav_rent:"Rent out", nav_trust:"Safety", nav_price:"Pricing",
    nav_me:"My page", nav_cta:"Find a spot", nav_more:"More", nav_events:"Events",
    tab_start:"Home", tab_search:"Search", tab_rent:"Rent out", tab_me:"Mine", tab_more:"More",
    hour:"Hour", day:"Day", month:"Month", event:"Event", week:"Week",
    per_hour:"per hour", per_day:"per day", per_month:"per month", per_event:"per event", per_week:"per week",
    u_hour:"/hr", u_day:"/day", u_month:"/mo", u_event:"/event", u_week:"/wk",
    book:"Book with BankID", search_where:"Where do you want to park?", free_spots:"spots available",
    filters:"Filters", clear:"Clear", sort_price:"Lowest price", sort_rating:"Highest rated", sort_dist:"Closest",
    settings:"Settings", theme:"Appearance", language:"Language", currency:"Currency",
    save:"Save", cancel:"Cancel", close:"Close", back:"Back", next:"Next", done:"Done",
    map:"Map", list:"List", satellite:"Satellite"
  }
};
