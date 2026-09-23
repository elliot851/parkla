# Parkla — parkla.se

Svensk P2P-parkeringsmarknadsplats (som JustPark/UK). Privatpersoner hyr ut
uppfart/garage/carport ("Värdar") till andra som behöver parkera ("Förare").
Ägs av **EEFS AB** (org.nr 559585-9694, bytt från Westros Digital Retail AB
under 2026 — se fälla 9). Webben är en ren PWA, inget bundlingsteg. Repot
innehåller ÄVEN en Capacitor-wrapper (`app/`) för att paketera samma webb som
native Android/iOS-app.

## 1. Arkitektur — vad varje fil/mapp gör

**Repo-roten = webbroten** (GitHub Pages serverar direkt härifrån):

- `index.html` — enda HTML-sidan i SPA:n. Laddar CSS/JS, `<main id="app">`
  fylls av JS, hash-routing. Butiksvidarestyrning (App Store/Play-redirect
  för QR-besökare) inline i `<head>`.
- `app.js` (~4000+ rader) — hela appen: state (`S`), routing
  (`go(route)`/`render()` på `location.hash`), alla `view*()`-funktioner
  (viewStart, viewSok, viewHyrut, viewMina, viewVillkor, viewIntegritet …),
  wizard för att lägga upp plats (`openWizard`/`saveListing` — kräver INGEN
  Stripe-koppling, bara adress/pris/foto/konto; Stripe kopplas separat efteråt
  på Min sida), admin-flagga (`adminPa()`), lead-capture/väntelista
  (`openLeadHost`/`openLeadDriver`/`bevakaHar()`/`WATCH`).
- `data.js` — `VERSION`, `AREAS`, `FEES`, `TYPE_MULT`, **demo-data** (`SPOTS`,
  fejkade platser — ENDAST i icke-skarpt läge), översättningar (`t()`).
- `api.js` — Supabase/Stripe-koppling. `CFG_DEFAULT` har publika nycklar
  inbakade (Supabase-URL, Supabase publishable-nyckel, Stripe `pk_live_...`).
  `skarptPa()` avgör demo vs. skarpt.
- `live.js` — kopplar på riktig Supabase-data i skarpt läge. **Viktigast:**
  `window.allSpots` skrivs om så `DBSPOTS` HELT ersätter demo-`SPOTS` i skarpt
  läge — ingen fejkad plats kan visas för en riktig användare (se fälla 4).
- `map.js`/`map.css` — Leaflet-karta. `flows.js`/`flows.css` — boka/betala/
  kör-in. `tour.js`/`tour.css` — produkttur. `book.css` — bokningsskärm.
  `icons.js` — SVG-ikoner (`I("namn", storlek)`).
- `sw.js` — service worker/PWA-cache. `CACHE` MÅSTE bumpas varje deploy.
- `manifest.webmanifest`, `icon.svg`, `icon-180/512.png`, `share.png` — PWA.
- `radera-konto.html` — fristående sida, Apples krav på kontoradering.
- `integritet/`, `villkor/`, `support/` — fristående sidor (egna mappar =
  rena URL:er), byggda av `../build_legal_and_icon.py` (script UTANFÖR repot).
- `omrade/<slug>/index.html` — SEO-landningssidor per lanseringszon (t.ex.
  `omrade/vasteras-sjukhuset/`), byggda av `../build_zone_pages.py` (script
  UTANFÖR repot). Återanvänder `app.css`-klasserna, ingen egen stil.
- `version.json` — `{"v": "<datum>.<byggnr>"}`.
- `CNAME` — `parkla.se` (GitHub Pages custom domain). `.nojekyll` — stänger
  av Jekyll-processering (annars ignoreras mappar som börjar med `_`).
- `google<hash>.html` — Google Search Console-verifieringsfil, rör den inte.
- **`app/`** — Capacitor 6-wrapper som paketerar EXAKT samma webb (repo-roten
  kopieras in som `app/www` vid bygge) till native iOS/Android/Huawei.
  `capacitor.config.json` (appId `se.parkla.app`), `package.json`,
  `assets/icon.png`+`splash.png` (källbilder), `BYGG-APPEN.txt` (manuell
  lokal build-guide), `KONTON-CHECKLISTA.txt` (guide för Play/Apple/Huawei-
  konton — **skriven innan bolagsbytet, se fälla 9**).
- **`.github/workflows/build-app.yml`** — GitHub Actions, bygger osignerad
  Android-debug-APK (artifact, installerbar direkt) + iOS-arkiv på
  `macos-14`-runner. Triggas manuellt (`workflow_dispatch`) eller på push till
  `app/**`/`site`-filer/workflow-filen.
- **`codemagic.yaml`** — Codemagic-molnbygge, tre workflows: `android-debug`
  (ingen signering krävs), `android-release` (signerad AAB, kräver keystore
  uppladdad i Codemagic), `ios-release` (signerad IPA, kräver App Store
  Connect-integration i Codemagic, klart först när Apple godkänt EEFS AB).

## 2. Köra lokalt

**Webben** (ingen build): `python -m http.server 8080` i repo-roten, öppna
`http://localhost:8080`. Demo-läge som standard (fejkad `SPOTS`-data).

**Native app-wrappern** (`app/`) kräver Node 18+, och Android Studio/Xcode
lokalt om man vill bygga själv — annars sköter Codemagic/GitHub Actions det
i molnet, se `app/BYGG-APPEN.txt`.

Inget testramverk. Syntaxkolla `app.js` innan deploy:
```
pip install esprima
python -c "import esprima; esprima.parseScript(open('app.js',encoding='utf-8').read())"
```

## 3. EXAKT deploy-flöde

**Webben/PWA** (det som faktiskt är live på parkla.se idag):
Hosting = GitHub Pages, repo `elliot851/parkla`, branch `main`, custom domain
`parkla.se` (CNAME-filen). Bygger om ~30–90 s efter varje ändring på `main`.

1. Ändra filerna.
2. Bumpa version i SAMMA commit: `data.js` (`VERSION`), `sw.js` (`CACHE`),
   `version.json`, och ALLA `?v=`-querystrings i `index.html`.
3. Syntaxkolla `app.js` om ändrad (se avsnitt 2).
4. `git push origin main`, ELLER `../deploy-files.sh <fil1> <fil2> …` (PUT:ar
   namngivna filer via GitHub Contents API, skapar en commit per fil, kräver
   GitHub-token via `git credential fill`). **ALDRIG `../deploy.py`** (avvecklad).
5. Verifiera live: `curl -s "https://parkla.se/version.json?cb=$RANDOM"`,
   poll tills `v` matchar.

**Native app** (Android/iOS/Huawei): inte lanserad ännu. Byggs via Codemagic
(`codemagic.yaml`) eller GitHub Actions (`.github/workflows/build-app.yml`)
när det är dags — se `app/BYGG-APPEN.txt` för kontokrav.

## 4. Miljövariabler / hemligheter (namn, ALDRIG värden här)

Publika nycklar, avsiktligt i klientkoden (`api.js` `CFG_DEFAULT`):
Supabase-URL, Supabase publishable-nyckel, Stripe `pk_live_...`.

Riktiga hemligheter, INTE i repot:
- **Supabase**: `STRIPE_SECRET_KEY` i edge functions-config (måste vara
  `sk_live_...` för att matcha klientens `pk_live_...`), ev. Stripe webhook-
  signeringshemlighet. Edge functions (`booking-intent`, `session-start`,
  `session-update`, `connect-onboard`) kräver användarens JWT.
- **Codemagic**: Android-keystore (för `android-release`), App Store Connect-
  API-nyckel (för `ios-release`, kopplas när Apple godkänt EEFS AB).
- **GitHub deploy-token**: hämtas lokalt via `git credential fill`.

## 5. Databas och schemaändringar

Backend = Supabase (Postgres + edge functions). Publik läsvy: `platser_publik`
(REST, anon-nyckel räcker, det är den förar-vyn läser i skarpt läge).
Skrivningar går via edge functions med användarens JWT, RLS-skyddat — ingen
admin-genväg i klienten (se fälla 5). Inget migrations-verktyg i repot,
schemat hanteras i Supabase-dashboarden — kolla alltid vilka edge functions
och vilken `platser_publik`-vy som läser/skriver innan du ändrar en kolumn.

## 6. Allt som finns UTANFÖR repot

- **DNS**: `parkla.se` pekar på GitHub Pages hos domänleverantören (CNAME-
  filen i repot + Pages-inställningen i GitHub Settings måste båda stämma).
- **Supabase-projektet**: databas, edge functions, RLS, Stripe-hemligheten.
- **Stripe-kontot** "Parkla" (acct_1UAscOR2PolOyeMI), Connect-konfiguration
  ("Välj affärsmodell") i Stripe Dashboard.
- **Apple Developer-kontot**: EEFS AB, Team ID 8KJ3M84HUU, medlemskap aktivt
  och betalt (förnyas 2027-09-18). Ingen app skapad i App Store Connect än.
- **Google Play Console / Huawei Developer**: inte påbörjade.
- **Codemagic-kontot**: keystore + signeringshemligheter, inte i git.
- **E-post**: `info@parkla.se`/`business@parkla.se` via STRATO webmail.
- **Byggmaterial utanför repot** (`C:\Users\ellio\Downloads\Parkla\`, nivån
  ovanför den här mappen): `build_legal_and_icon.py`, `build_zone_pages.py`,
  `deploy-files.sh`/`deploy.py`, samt `tryck/`, `store/`, `plan/`, `seed/`,
  `legal/` — tryckmaterial, App Store/Play-material, lanseringsplaner,
  dörrknackningsmanus, juridiska källtexter. Rent affärsmaterial, ingen kod
  som körs i produktion, men behövs för att regenerera juridiksidor/zon-
  sidor/ikon.

## 7. Öppet arbete (halvfärdigt eller planerat, 2026-09-23)

- **Stripe Connect-konfiguration** ("Välj affärsmodell") ej slutförd.
  `STRIPE_SECRET_KEY` i Supabase behöver bekräftas som `sk_live_...`.
- **DAC7-registrering** hos Skatteverket (EEFS AB som rapporteringsskyldig
  plattformsoperatör) inte gjord, krävs före första riktiga utbetalning.
- **0 riktiga platser live** i `platser_publik` (verifierat 2026-09-23).
  Lanseringsstrategin: seeda 15–20 riktiga uppfarter runt Västmanlands
  sjukhus i Västerås (första zonen) INNAN marknadsföring riktas dit — se
  `../plan/PARKLA-lanseringsplan-vasteras.pdf` och `../seed/`. Bygg ALDRIG
  in fejkade platser i produktionsdatabasen (bryter fälla 4).
- **App Store Connect**: kontot är klart, men ingen app skapad än. Material
  (7 skärmbilder, ikon, butikstexter) finns i `../store/`.
- **Google Play Console / Huawei**: inte påbörjade. `app/KONTON-CHECKLISTA.txt`
  är skriven innan bolagsbytet till EEFS AB, uppdatera org-uppgifterna där
  innan de kontona skapas (se fälla 9).
- **Native app**: `app/`-wrappern och CI-pipelinen finns, men ingen release-
  build är gjord. Enligt `app/BYGG-APPEN.txt` behöver lanseringen INTE vänta
  på butikerna — PWA:n installeras redan idag via "Lägg till på hemskärmen".
- **Juridiksidorna** (`integritet/`, `villkor/`) omskrivna från interna
  utkast, duger som publika URL:er men bör juristgranskas innan tung trafik.

## 8. Fällor (lärt den hårda vägen — numrerade, med motivering)

1. **Använd `deploy-files.sh`, aldrig `deploy.py`** (avvecklad/farlig för
   den här repostrukturen).
2. **Lokala kloner av det här repot kan vara KRAFTIGT efter.** `deploy-files.sh`
   committar direkt mot GitHub via Contents API (en commit per fil, meddelande
   "uppdatera X") — det kräver INGEN lokal git-synk. En lokal klon som bara
   `git clone`-ades en gång och sedan aldrig `git pull`-ades kan sakna
   dussintals commits (2026-09-23: en lokal klon låg 37+ commits efter och
   saknade `.github/`, `app/`, `codemagic.yaml`, `CNAME` helt). **`git fetch`
   + jämför mot `origin/main` FÖRE varje `git push`, aldrig anta att din
   arbetskatalog är sanningen.**
3. **Bumpa ALLA versionsställen i samma commit** (data.js, sw.js, version.json,
   samtliga `?v=` i index.html) — annars cachar service workern fel.
4. **Demo-data (`SPOTS`) får ALDRIG blandas med riktiga platser.** `live.js`
   skriver om `allSpots()` så DBSPOTS helt ersätter SPOTS i skarpt läge — rör
   inte den logiken utan att förstå varför (annars läcker fejkade platser till
   riktiga användare, eller riktiga platser filtreras bort).
5. **Ingen admin-genväg för att skapa listningar åt en annan användare.** En
   plats måste alltid skapas under ägarens eget konto/JWT (Stripe Connect-
   utbetalningen pekar annars fel). Bygg aldrig en sådan genväg.
6. **Tomt-lägen är medvetet designade, ta inte bort dem.** `emptyHTML()`
   skiljer "hämtar" / "utanför täckning" / "helt ny ort, bli först" /
   "inga träffar på filtret". `thinSupplyHTML()` visar en lugnande banner vid
   1–4 riktiga platser UTAN att gömma dem. Byggt för att lösa cold-start
   (aldrig ett brutalt tomt resultat, aldrig fejkat utbud).
7. **Zon- och juridiksidorna använder sajtens EGNA `app.css`-klasser**, inte
   egen stil (ett tidigare försök med egen CSS underkändes, matchade inte
   utseendet). Bygg vidare på samma mönster.
8. **`platser_publik`-queries: fel kolumnnamn ger ett PostgREST-felobjekt med
   4 nycklar** (`code`/`details`/`hint`/`message`) — lätt att misstolka
   `len()==4` som "4 rader" om man inte läser `code`-fältet.
9. **Bolagsbyte mitt i projektet: Westros Digital Retail AB → EEFS AB.**
   Äldre filer (bl.a. `app/KONTON-CHECKLISTA.txt`, gamla e-postadresser som
   `hej@parkla.se`) refererar fortfarande org.nr 559499-1035/Westros. Den
   LIVE appens juridiksidor (`villkor/`, `integritet/`) och Apple-kontot
   använder korrekt EEFS AB (559585-9694) och `info@parkla.se`. Skriv aldrig
   in gamla Westros-uppgifter i nytt material utan att dubbelkolla.
