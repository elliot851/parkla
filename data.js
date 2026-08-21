/* ============================================================
   Parkla – data, konfiguration och översättningar
   ============================================================ */
"use strict";

const VERSION = "2026-08-21.2";

/* ---------- Avgiftsmodell: Parklas intäktsmotor ---------- */
const FEES = {
  driverPct: 0.12,        // serviceavgift från föraren, ovanpå värdens pris (korttid)
  driverPctMonthly: 0.06, // ... på månadskontrakt
  hostPct: 0.10,          // provision från värden (korttid)
  hostPctMonthly: 0.08,   // ... på månadskontrakt
  tryggShort: 9,          // Parkla Trygg per bokning, kr
  tryggMonthly: 49,       // Parkla Trygg per månad, kr
  overtidPerTimme: 150,   // avgift till föraren om bilen står kvar
  schablon: 40000,        // Skatteverkets schablonavdrag per bostad och år
  garantiBelopp: 25000,   // skadegaranti per händelse
  refVard: 200,           // värvningsbonus, värd
  refForare: 100,         // värvningsbonus, förare
  laddOrePerKwh: 10       // Parklas påslag på laddning, öre/kWh
};

/* ---------- Valutor (demokurser) ---------- */
const CURRENCIES = {
  SEK: { sym: "kr", rate: 1,      after: true,  name: "Svenska kronor" },
  EUR: { sym: "€",  rate: 0.087,  after: false, name: "Euro" },
  USD: { sym: "$",  rate: 0.095,  after: false, name: "US-dollar" },
  NOK: { sym: "kr", rate: 1.02,   after: true,  name: "Norska kronor" },
  DKK: { sym: "kr", rate: 0.65,   after: true,  name: "Danska kronor" },
  GBP: { sym: "£",  rate: 0.075,  after: false, name: "Brittiska pund" }
};

/* ---------- Områden ---------- */
const AREAS = [
  { id:"sthlm",   name:"Stockholm innerstad",   sub:"Södermalm, Vasastan, Östermalm", ref:"Boendeparkering 1 100 kr/mån", icon:"🏙️", me:[52,54] },
  { id:"arn",     name:"Arlanda / Märsta",      sub:"Flygplatsparkering",             ref:"Officiell P: 1 495–1 995 kr/v", icon:"✈️",  me:[44,60] },
  { id:"gbg",     name:"Göteborg",              sub:"Linné, Majorna, Centrum",        ref:"P-hus 1 200–1 900 kr/mån",     icon:"⚓",  me:[50,50] },
  { id:"solna",   name:"Solna / Friends Arena", sub:"Evenemang och arenor",           ref:"Arenaparkering 250–400 kr",    icon:"🏟️", me:[48,46] },
  { id:"malmo",   name:"Malmö",                 sub:"Västra hamnen, Möllan",          ref:"P-hus 900–1 400 kr/mån",       icon:"🌉",  me:[55,52] },
  { id:"uppsala", name:"Uppsala",               sub:"Centrum, Luthagen",              ref:"P-hus 900–1 300 kr/mån",       icon:"🎓",  me:[46,55] },
  { id:"lund",    name:"Lund",                  sub:"Centrum, Universitetet",         ref:"P-hus 800–1 200 kr/mån",       icon:"📚",  me:[50,48] },
  { id:"vasteras",name:"Västerås",              sub:"Centrum, Hamnen",                ref:"P-hus 600–900 kr/mån",         icon:"🏭",  me:[52,50] }
];

/* ---------- Platser ---------- */
/* h=timme d=dygn w=vecka m=månad ev=evenemang  (0 = erbjuds ej)  xy=kartposition % */
const SPOTS = [
  // --- Stockholm innerstad ---
  {id:1, area:"sthlm", nm:"Uppfart, Ringvägen", ad:"Södermalm · 300 m från Skanstull", type:"Uppfart", h:29, d:139, w:590, m:2190, ev:0, rate:4.9, n:64, host:"Anna", hostSince:2024, ev_charge:false, feat:["Kamera","Egen infart","Bred plats"], size:"Personbil + SUV", icon:"🏡", xy:[24,36], walk:4, instr:"Kör in från gatan, ställ bilen närmast häcken. Vänd nosen utåt."},
  {id:2, area:"sthlm", nm:"Garageplats, Odengatan", ad:"Vasastan · 120 m från Odenplan", type:"Garage", h:39, d:189, w:790, m:2650, ev:0, rate:5.0, n:41, host:"Mikael", hostSince:2023, ev_charge:true, feat:["Uppvärmt","Laddbox 11 kW","Portkod"], size:"Personbil", icon:"🚗", xy:[58,24], walk:2, instr:"Portkod 1974. Plats 12, andra raden till höger."},
  {id:3, area:"sthlm", nm:"Innergård, Katarina Bangata", ad:"Södermalm · 5 min till Medborgarplatsen", type:"Innergård", h:25, d:119, w:490, m:1790, ev:0, rate:4.7, n:88, host:"Sara", hostSince:2024, ev_charge:false, feat:["Grind","Belyst"], size:"Personbil", icon:"🌳", xy:[72,58], walk:6, instr:"Grinden öppnas med koden i appen. Parkera vid cykelstället."},
  {id:4, area:"sthlm", nm:"Carport, Hornsgatan", ad:"Södermalm · 400 m från Zinkensdamm", type:"Carport", h:27, d:129, w:540, m:1950, ev:0, rate:4.8, n:33, host:"Jonas", hostSince:2025, ev_charge:true, feat:["Tak","Laddbox 7,4 kW"], size:"Personbil + SUV", icon:"🛡️", xy:[36,68], walk:5, instr:"Carporten längst till vänster. Laddkabel hänger på väggen."},
  {id:5, area:"sthlm", nm:"Uppfart, Valhallavägen", ad:"Östermalm · 200 m från Karlaplan", type:"Uppfart", h:35, d:165, w:690, m:2490, ev:0, rate:4.6, n:19, host:"Peter", hostSince:2025, ev_charge:false, feat:["Egen infart"], size:"Personbil", icon:"🏡", xy:[80,32], walk:3, instr:"Backa in, annars kommer inte grannen ut."},
  {id:6, area:"sthlm", nm:"Garage, Kungsholmen", ad:"Kungsholmen · 350 m från Fridhemsplan", type:"Garage", h:33, d:159, w:660, m:2350, ev:0, rate:4.8, n:52, host:"Ulrika", hostSince:2024, ev_charge:true, feat:["Låst","Laddbox 22 kW","Uppvärmt"], size:"Personbil + SUV", icon:"🔐", xy:[15,50], walk:5, instr:"Fjärrkontroll hämtas i nyckelskåpet, kod i appen."},
  {id:7, area:"sthlm", nm:"Innergård, Bondegatan", ad:"Södermalm · 600 m från Nytorget", type:"Innergård", h:23, d:109, w:450, m:1690, ev:0, rate:4.5, n:27, host:"Ali", hostSince:2025, ev_charge:false, feat:["Grind","Sopsortering intill"], size:"Personbil", icon:"🌳", xy:[64,76], walk:8, instr:"Plats 3, markerad med gul linje."},
  {id:8, area:"sthlm", nm:"Uppfart, Danderyd", ad:"Danderyd · 12 min till Östermalm", type:"Uppfart", h:15, d:79, w:340, m:1190, ev:0, rate:4.7, n:44, host:"Berit", hostSince:2023, ev_charge:true, feat:["Laddbox 11 kW","Två platser","Nära tunnelbana"], size:"Personbil + SUV", icon:"🏡", xy:[88,14], walk:14, instr:"Höger sida av uppfarten. Laddbox på garageväggen."},

  // --- Arlanda / Märsta ---
  {id:10, area:"arn", nm:"Uppfart i Märsta", ad:"9 min bil till Arlanda Terminal 5", type:"Uppfart", h:0, d:69, w:399, m:1490, ev:0, rate:4.9, n:212, host:"Lena", hostSince:2023, ev_charge:false, feat:["Skjuts till terminalen","Kamera","Plats för 2 bilar"], size:"Personbil + SUV", icon:"✈️", xy:[42,44], walk:0, instr:"Ring 20 min innan ankomst så möter jag upp. Skjuts ingår."},
  {id:11, area:"arn", nm:"Garage i Sigtuna", ad:"14 min bil till Arlanda", type:"Garage", h:0, d:89, w:490, m:1790, ev:0, rate:5.0, n:96, host:"Bo", hostSince:2022, ev_charge:true, feat:["Låst garage","Laddbox 11 kW","Skjuts"], size:"Personbil", icon:"🔐", xy:[26,30], walk:0, instr:"Garaget är låst hela tiden. Skjuts bokas i chatten."},
  {id:12, area:"arn", nm:"Grusplan, Rosersberg", ad:"11 min bil till Arlanda", type:"Tomt", h:0, d:55, w:319, m:1190, ev:0, rate:4.5, n:58, host:"Kent", hostSince:2024, ev_charge:false, feat:["Plats för 4 bilar","Belyst","Husbil OK"], size:"Personbil, husbil, släp", icon:"🚛", xy:[62,60], walk:0, instr:"Kör in genom grinden, parkera längs staketet."},
  {id:13, area:"arn", nm:"Uppfart, Upplands Väsby", ad:"18 min till Arlanda · 4 min till pendeln", type:"Uppfart", h:0, d:49, w:279, m:990, ev:0, rate:4.7, n:34, host:"Ingrid", hostSince:2025, ev_charge:false, feat:["Pendeltåg 400 m"], size:"Personbil", icon:"🚆", xy:[70,20], walk:0, instr:"Parkera bakom bilen som redan står där."},
  {id:14, area:"arn", nm:"Dubbelgarage, Knivsta", ad:"16 min till Arlanda · 25 min till Uppsala", type:"Garage", h:0, d:79, w:449, m:1590, ev:0, rate:4.8, n:41, host:"Håkan", hostSince:2024, ev_charge:true, feat:["Låst","Laddbox 11 kW","Bilvård kan bokas"], size:"Personbil + SUV", icon:"🔐", xy:[34,68], walk:0, instr:"Nyckelskåp vid ytterdörren, kod i appen."},
  {id:15, area:"arn", nm:"Uppfart, Arlandastad", ad:"6 min bil till Arlanda", type:"Uppfart", h:0, d:75, w:429, m:1590, ev:0, rate:4.9, n:127, host:"Marie", hostSince:2023, ev_charge:false, feat:["Närmast flygplatsen","Kamera","Skjuts"], size:"Personbil", icon:"✈️", xy:[52,14], walk:0, instr:"Skjuts ingår, ring när du landat."},

  // --- Göteborg ---
  {id:20, area:"gbg", nm:"Uppfart, Linnégatan", ad:"Linné · 350 m från Järntorget", type:"Uppfart", h:24, d:115, w:470, m:1590, ev:0, rate:4.8, n:52, host:"Elin", hostSince:2024, ev_charge:false, feat:["Egen infart","Belyst"], size:"Personbil", icon:"🏡", xy:[30,44], walk:5, instr:"Kör in från gårdssidan, inte gatan."},
  {id:21, area:"gbg", nm:"Garage, Majorna", ad:"600 m från Stigbergstorget", type:"Garage", h:29, d:139, w:590, m:1890, ev:0, rate:4.9, n:37, host:"Hasse", hostSince:2023, ev_charge:true, feat:["Laddbox 11 kW","Uppvärmt"], size:"Personbil + SUV", icon:"🚗", xy:[62,58], walk:7, instr:"Fjärrkontroll i brevlådan."},
  {id:22, area:"gbg", nm:"Innergård, Vasastan GBG", ad:"200 m från Vasaplatsen", type:"Innergård", h:22, d:105, w:430, m:1450, ev:0, rate:4.6, n:71, host:"Nina", hostSince:2024, ev_charge:false, feat:["Grind"], size:"Personbil", icon:"🌳", xy:[46,28], walk:3, instr:"Grindkod finns i appen."},
  {id:23, area:"gbg", nm:"Uppfart, Örgryte", ad:"1,2 km från Ullevi", type:"Uppfart", h:20, d:95, w:390, m:1290, ev:199, rate:4.7, n:63, host:"Stefan", hostSince:2023, ev_charge:false, feat:["Evenemang","Ullevi 15 min promenad"], size:"Personbil + SUV", icon:"🏟️", xy:[76,40], walk:15, instr:"Vid matchdag: kör in bakvägen, gatan är avstängd."},
  {id:24, area:"gbg", nm:"Carport, Hisingen", ad:"Lindholmen · 700 m från Lindholmspiren", type:"Carport", h:18, d:89, w:360, m:1190, ev:0, rate:4.5, n:29, host:"Yusuf", hostSince:2025, ev_charge:true, feat:["Tak","Laddbox 7,4 kW"], size:"Personbil", icon:"🛡️", xy:[18,68], walk:9, instr:"Carport nummer 4."},

  // --- Solna / arenor ---
  {id:30, area:"solna", nm:"Uppfart 400 m från Friends Arena", ad:"Råsunda · 5 min promenad", type:"Uppfart", h:0, d:0, w:0, m:0, ev:249, rate:4.9, n:143, host:"Tobias", hostSince:2022, ev_charge:false, feat:["Evenemang","5 min promenad","Enkel utfart"], size:"Personbil + SUV", icon:"🏟️", xy:[46,40], walk:5, instr:"Kör in före kl 18 – gatan stängs vid stora matcher."},
  {id:31, area:"solna", nm:"Garageplats, Solna Centrum", ad:"900 m från Friends Arena", type:"Garage", h:35, d:169, w:0, m:2290, ev:299, rate:5.0, n:64, host:"Malin", hostSince:2023, ev_charge:true, feat:["Evenemang","Laddbox","Låst"], size:"Personbil", icon:"🔐", xy:[62,30], walk:11, instr:"Garage B, plats 44."},
  {id:32, area:"solna", nm:"Tomt, Huvudsta", ad:"1,4 km från Friends Arena", type:"Tomt", h:0, d:0, w:0, m:0, ev:179, rate:4.4, n:28, host:"Ove", hostSince:2024, ev_charge:false, feat:["Evenemang","Plats för 6 bilar","Buss OK"], size:"Personbil, buss", icon:"🚛", xy:[28,58], walk:17, instr:"Följ skyltarna, jag står och vinkar in er."},
  {id:33, area:"solna", nm:"Uppfart, Hagalund", ad:"1,1 km från Friends Arena · Solna station 5 min", type:"Uppfart", h:22, d:105, w:430, m:1490, ev:229, rate:4.8, n:86, host:"Frida", hostSince:2023, ev_charge:true, feat:["Evenemang","Laddbox 11 kW","Pendeltåg nära"], size:"Personbil + SUV", icon:"🏡", xy:[70,64], walk:13, instr:"Plats till höger om garaget."},

  // --- Malmö ---
  {id:40, area:"malmo", nm:"Uppfart, Västra hamnen", ad:"250 m från Turning Torso", type:"Uppfart", h:22, d:99, w:420, m:1290, ev:0, rate:4.8, n:45, host:"Karim", hostSince:2024, ev_charge:true, feat:["Laddbox 11 kW","Havsutsikt"], size:"Personbil", icon:"🌉", xy:[38,30], walk:4, instr:"Parkera med nosen mot vattnet."},
  {id:41, area:"malmo", nm:"Garage, Möllevången", ad:"150 m från Möllevångstorget", type:"Garage", h:25, d:115, w:470, m:1490, ev:0, rate:4.7, n:39, host:"Fatima", hostSince:2023, ev_charge:false, feat:["Låst","Kamera"], size:"Personbil", icon:"🚗", xy:[60,54], walk:2, instr:"Garageport öppnas med kod."},
  {id:42, area:"malmo", nm:"Innergård, Davidshall", ad:"400 m från Triangeln", type:"Innergård", h:20, d:95, w:390, m:1190, ev:0, rate:4.6, n:31, host:"Jesper", hostSince:2025, ev_charge:false, feat:["Grind","Belyst"], size:"Personbil", icon:"🌳", xy:[48,68], walk:5, instr:"Grinden är tung, dra ordentligt."},
  {id:43, area:"malmo", nm:"Uppfart, Limhamn", ad:"2 km från Malmö Arena", type:"Uppfart", h:16, d:79, w:320, m:990, ev:159, rate:4.5, n:22, host:"Lotta", hostSince:2025, ev_charge:false, feat:["Evenemang","Två platser"], size:"Personbil + SUV", icon:"🏡", xy:[22,60], walk:22, instr:"Uppfarten rymmer två bilar bakom varandra."},

  // --- Uppsala ---
  {id:50, area:"uppsala", nm:"Uppfart, Luthagen", ad:"800 m från Uppsala C", type:"Uppfart", h:19, d:89, w:380, m:1190, ev:0, rate:4.9, n:57, host:"Erik", hostSince:2023, ev_charge:false, feat:["Egen infart"], size:"Personbil", icon:"🏡", xy:[34,38], walk:9, instr:"Vänster sida, framför häcken."},
  {id:51, area:"uppsala", nm:"Carport, Kungsängen", ad:"400 m från Uppsala C", type:"Carport", h:21, d:99, w:410, m:1290, ev:0, rate:4.6, n:24, host:"Malin", hostSince:2024, ev_charge:true, feat:["Tak","Laddbox 7,4 kW"], size:"Personbil", icon:"🛡️", xy:[58,50], walk:5, instr:"Carport 7."},
  {id:52, area:"uppsala", nm:"Garage, Fålhagen", ad:"1,1 km från Uppsala C", type:"Garage", h:18, d:85, w:350, m:1090, ev:0, rate:4.7, n:33, host:"Gunilla", hostSince:2024, ev_charge:false, feat:["Låst","Uppvärmt"], size:"Personbil", icon:"🔐", xy:[70,66], walk:12, instr:"Nyckel i nyckelskåp vid dörren."},

  // --- Lund ---
  {id:60, area:"lund", nm:"Uppfart, Professorsstaden", ad:"600 m från Lundagård", type:"Uppfart", h:17, d:82, w:340, m:1090, ev:0, rate:4.8, n:38, host:"Anders", hostSince:2024, ev_charge:false, feat:["Egen infart","Belyst"], size:"Personbil", icon:"🏡", xy:[40,42], walk:7, instr:"Parkera på grusytan, inte gräsmattan."},
  {id:61, area:"lund", nm:"Garage, Väster", ad:"900 m från Lund C", type:"Garage", h:20, d:95, w:390, m:1250, ev:0, rate:4.6, n:26, host:"Camilla", hostSince:2025, ev_charge:true, feat:["Laddbox 11 kW","Låst"], size:"Personbil", icon:"🔐", xy:[64,56], walk:10, instr:"Fjärrkontroll lämnas i brevlådan."},

  // --- Västerås ---
  {id:70, area:"vasteras", nm:"Uppfart, Centrum", ad:"500 m från Stora torget", type:"Uppfart", h:14, d:69, w:280, m:790, ev:0, rate:4.7, n:19, host:"Rolf", hostSince:2025, ev_charge:false, feat:["Egen infart"], size:"Personbil + SUV", icon:"🏡", xy:[44,46], walk:6, instr:"Kör in från Kopparbergsvägen."},
  {id:71, area:"vasteras", nm:"Carport, Hamnen", ad:"1,3 km från centrum · nära gästhamnen", type:"Carport", h:12, d:59, w:250, m:690, ev:0, rate:4.5, n:14, host:"Susanne", hostSince:2025, ev_charge:true, feat:["Tak","Laddbox 7,4 kW","Båtplats intill"], size:"Personbil, husvagn", icon:"🛡️", xy:[62,62], walk:15, instr:"Carport längst bort mot vattnet."}
];

/* ---------- Kommande evenemang ---------- */
const EVENTS = [
  { id:"e1", name:"Allsvenskan: AIK – Djurgården", venue:"Friends Arena", area:"solna", date:"2026-08-29", time:"19:00", crowd:48000, icon:"⚽" },
  { id:"e2", name:"Konsert: Veronica Maggio",       venue:"Avicii Arena", area:"solna", date:"2026-09-05", time:"20:00", crowd:16000, icon:"🎤" },
  { id:"e3", name:"Hockey: Frölunda – Skellefteå",  venue:"Scandinavium", area:"gbg",  date:"2026-09-12", time:"19:00", crowd:12000, icon:"🏒" },
  { id:"e4", name:"Melodifestivalen deltävling",     venue:"Malmö Arena",  area:"malmo",date:"2026-09-19", time:"20:00", crowd:13000, icon:"🎶" },
  { id:"e5", name:"Landskamp: Sverige – Norge",      venue:"Friends Arena",area:"solna",date:"2026-10-03", time:"18:00", crowd:50000, icon:"🇸🇪" },
  { id:"e6", name:"Göteborgsvarvet – start",         venue:"Slottsskogen", area:"gbg",  date:"2026-10-10", time:"09:00", crowd:60000, icon:"🏃" }
];

/* ---------- Omdömen ---------- */
const REVIEWS = {
  1:[{who:"Fredrik",r:5,t:"Perfekt läge, precis som beskrivet. Anna svarade på 2 minuter.",d:"aug 2026"},
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
  {who:"Emma", r:5, t:"Precis som på bilderna. Enkel in- och utfart.", d:"aug 2026"},
  {who:"Daniel", r:5, t:"Smidigt hela vägen, värden svarade snabbt.", d:"jul 2026"},
  {who:"Hanna", r:4, t:"Bra plats. Lite smal, men fungerar för en vanlig bil.", d:"jun 2026"}
];

/* ---------- Prismotor: rekommendation till värden ---------- */
const CITY_BASE = {
  "Stockholm innerstad": { m:2100, d:130, h:28 },
  "Stockholm förort":    { m:900,  d:75,  h:16 },
  "Göteborg":            { m:1450, d:110, h:23 },
  "Malmö":               { m:1200, d:95,  h:21 },
  "Uppsala":             { m:1150, d:90,  h:19 },
  "Lund":                { m:1050, d:85,  h:17 },
  "Nära flygplats":      { m:1400, d:65,  h:0  },
  "Nära arena/evenemang":{ m:1100, d:95,  h:20 },
  "Övrig stad/tätort":   { m:650,  d:60,  h:12 }
};
const TYPE_MULT = { "Uppfart":1.0, "Carport":1.10, "Garage":1.32, "Innergård":0.95, "Tomt/gård":0.80 };

/* ---------- Aviseringar (demo) ---------- */
const SEED_NOTIS = [
  { id:"n1", ic:"💸", t:"Utbetalning på väg",     s:"2 015 kr landar på ditt konto den 25 augusti.", unread:true },
  { id:"n2", ic:"🏟️", t:"Stort evenemang nära dig", s:"AIK – Djurgården 29 aug. Höj priset till 249 kr den dagen?", unread:true },
  { id:"n3", ic:"⭐", t:"Nytt omdöme",            s:"Fredrik gav dig 5 av 5: ”Perfekt läge, precis som beskrivet.”", unread:false },
  { id:"n4", ic:"🧾", t:"Skattemätaren",          s:"Du har använt 37 % av ditt schablonavdrag i år.", unread:false }
];

/* ---------- Meddelanden (demo) ---------- */
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
    nav_me:"Min sida", nav_cta:"Sök plats", nav_more:"Mer",
    tab_start:"Start", tab_search:"Sök", tab_rent:"Hyr ut", tab_me:"Min sida", tab_more:"Mer",
    hour:"Timme", day:"Dygn", month:"Månad", event:"Evenemang", week:"Vecka",
    per_hour:"/tim", per_day:"/dygn", per_month:"/mån", per_event:"/tillfälle", per_week:"/vecka",
    book:"Boka med BankID", search_where:"Var vill du parkera?", free_spots:"lediga platser",
    filters:"Filter", clear:"Rensa", sort_price:"Lägst pris", sort_rating:"Högst betyg", sort_dist:"Närmast",
    settings:"Inställningar", theme:"Tema", language:"Språk", currency:"Valuta",
    save:"Spara", cancel:"Avbryt", close:"Stäng", back:"Tillbaka", next:"Nästa", done:"Klart"
  },
  en: {
    nav_find:"Find parking", nav_rent:"Rent out", nav_trust:"Safety", nav_price:"Pricing",
    nav_me:"My page", nav_cta:"Find a spot", nav_more:"More",
    tab_start:"Home", tab_search:"Search", tab_rent:"Rent out", tab_me:"My page", tab_more:"More",
    hour:"Hour", day:"Day", month:"Month", event:"Event", week:"Week",
    per_hour:"/hr", per_day:"/day", per_month:"/mo", per_event:"/event", per_week:"/week",
    book:"Book with BankID", search_where:"Where do you want to park?", free_spots:"spots available",
    filters:"Filters", clear:"Clear", sort_price:"Lowest price", sort_rating:"Highest rated", sort_dist:"Closest",
    settings:"Settings", theme:"Theme", language:"Language", currency:"Currency",
    save:"Save", cancel:"Cancel", close:"Close", back:"Back", next:"Next", done:"Done"
  }
};
