# Budsjette

En personlig budsjettapp som følger **lønnsperioden din** – ikke kalendermåneden.
Bygget som en progressiv webapp (PWA) som kan installeres på hjemskjermen og
hostes gratis på GitHub Pages.

> Alle data lagres lokalt i nettleseren din. Ingen konto, ingen server, ingen
> sporing. Du eier dataene, og du tar sikkerhetskopi selv via eksport.

---

## Innhold

- [Hva appen gjør](#hva-appen-gjør)
- [Kom i gang lokalt](#kom-i-gang-lokalt)
- [Publiser på GitHub Pages](#publiser-på-github-pages)
- [Legg appen på hjemskjermen](#legg-appen-på-hjemskjermen)
- [Prosjektstruktur](#prosjektstruktur)
- [Datamodell og regler](#datamodell-og-regler)
- [Testing](#testing)
- [Synkronisering mellom mobil og PC](#synkronisering-mellom-mobil-og-pc-supabase)
- [Personvern og sikkerhet](#personvern-og-sikkerhet)

---

## Hva appen gjør

**Lønnsperioder.** En periode går fra én lønningsdato til dagen før neste
(20. november – 19. desember). Korte måneder håndteres ved at lønningsdag 31
klippes til 28/29/30. Kommer lønnen tidligere eller senere, registrerer du
faktisk dato, og forrige periode avsluttes automatisk dagen før.

**Rask registrering.** Flytende pluss-knapp → beløp, kategori, underkategori,
lagre. Appen husker hva du pleier å registrere og foreslår de mest brukte
underkategoriene først. Favoritter gir registrering med to trykk.

**Riktig økonomisk logikk.** Sparing og gjeldsbetaling reduserer tilgjengelige
penger, men regnes ikke som ordinært forbruk – og holdes utenfor
forbruksdiagrammene. Ekstra inntekt legges til uten å overskrive nettolønnen.

**Budsjett med sliders.** Juster nettolønn og hvert kategoribudsjett med slider
eller nøyaktig beløp. Du ser alltid *nettolønn − budsjetter = ufordelt beløp*, og
får advarsel ved overbudsjettering. Ingen kategorier justeres automatisk bak ryggen din.

**Analyse.** Budsjett mot faktisk, fordeling av forbruk, akkumulert forbruk gjennom
perioden med referanselinje for jevnt forbruk, utvikling over flere perioder,
største underkategorier og sammenligning med forrige periode – målt over like
mange dager, slik at tallene faktisk er sammenlignbare.

**Innsikter.** Regelbaserte, lokale observasjoner («Du har brukt 80 % av
matbudsjettet med 12 dager igjen»). Prognoser er alltid merket som estimat og
vises ikke før datagrunnlaget er godt nok.

**Faste utgifter.** Husleie, strøm og abonnementer med valgfri automatisk
bokføring. Hver forekomst har en unik nøkkel, så samme utgift bokføres aldri to
ganger – uansett hvor mange ganger appen åpnes.

**Lys og mørk modus**, full tastaturnavigasjon, og en fargepalett som er validert
for fargeblindhet og kontrast i begge moduser.

---

## Kom i gang lokalt

Du trenger [Node.js](https://nodejs.org) 20.19 eller nyere.

### 1. Installer pakkene

```bash
npm install
```

### 2. Start utviklingsserveren

```bash
npm run dev
```

Appen kjører på <http://localhost:5173>.

Vil du teste på telefonen i samme nettverk, viser Vite også en nettverksadresse
(`http://192.168.x.x:5173`) du kan åpne direkte på mobilen.

### 3. Bygg produksjonsversjonen

```bash
npm run build      # genererer ikoner, typesjekker og bygger til dist/
npm run preview    # server dist/ lokalt for å teste produksjonsbygget
```

### Øvrige kommandoer

| Kommando | Hva den gjør |
|---|---|
| `npm test` | Kjører hele testsuiten én gang |
| `npm run test:watch` | Kjører testene kontinuerlig |
| `npm run typecheck` | TypeScript uten å bygge |
| `npm run icons` | Regenererer app-ikonene i `public/icons/` |

---

## Publiser på GitHub Pages

### 1. Opprett repositoriet

```bash
git init
git add .
git commit -m "Første versjon av Budsjette"
git branch -M main
```

Opprett et tomt repository på GitHub (uten README), og koble det til:

```bash
git remote add origin https://github.com/<brukernavn>/<repo-navn>.git
git push -u origin main
```

> **Repo-navnet bestemmer adressen.** Hvis repoet heter `budsjette`, blir appen
> liggende på `https://<brukernavn>.github.io/budsjette/`.

### 2. Slå på GitHub Pages

I repositoriet på GitHub:

**Settings → Pages → Build and deployment → Source: GitHub Actions**

### 3. La arbeidsflyten gjøre resten

`.github/workflows/deploy.yml` kjører ved hver push til `main`: den typesjekker,
kjører testene, bygger appen og publiserer `dist/`. Base-pathen settes automatisk
fra repo-navnet, så du slipper å endre noe i koden.

Følg med under **Actions**-fanen. Når jobben er grønn, ligger appen på:

```
https://<brukernavn>.github.io/<repo-navn>/
```

### Hvis du gir repoet et annet navn

Standardverdien i `vite.config.ts` er `/budsjette/`. GitHub Actions overstyrer
den med repo-navnet, så det er bare lokale produksjonsbygg som trenger:

```bash
VITE_BASE=/mitt-repo-navn/ npm run build
```

### Egendefinert domene

Legg filen `public/CNAME` med domenenavnet ditt, og sett `VITE_BASE=/` i
arbeidsflyten.

---

## Legg appen på hjemskjermen

### iPhone (Safari)

1. Åpne adressen i **Safari** (må være Safari, ikke Chrome).
2. Trykk **Del**-knappen (firkanten med pil opp).
3. Velg **Legg til på Hjem-skjerm**.
4. Gi den navn og trykk **Legg til**.

Appen åpnes nå uten adressefelt, med riktig håndtering av safe areas og
hjemindikatoren.

### Android (Chrome)

1. Åpne adressen i Chrome.
2. Trykk på menyen (tre prikker).
3. Velg **Legg til på startsiden** / **Installer app**.

Etter første besøk fungerer grensesnittet også uten nett, siden service workeren
har lagret appen lokalt.

> **Viktig:** Data lagres per nettleser. Appen på hjemskjermen og nettleseren din
> deler som regel lagring på Android, mens iOS kan skille dem. Bruk eksport/import
> hvis du trenger å flytte data mellom enheter.

---

## Prosjektstruktur

```
build/                  Byggeverktøy
  generate-icons.mjs    Genererer PNG-ikoner uten eksterne avhengigheter
  pwa-plugin.ts         Lager service worker og 404.html ved bygg
public/                 Statiske filer (manifest, ikoner)
src/
  app/                  App-skall, bunnmeny og hash-ruting
  features/
    analysis/           Analyseside og diagramkomponenter
    budget/             Budsjett, ny lønnsperiode, faste utgifter, kategorier
    dashboard/          Oversikt med hovedkort, innsikter og kategoristatus
    history/            Søk, filtrering og redigering av transaksjoner
    onboarding/         Førstegangsoppsett i fire steg
    settings/           Innstillinger, eksport og import
    transactions/       Registreringsarket og kategorivelger
  lib/                  Ren logikk uten React
    calc.ts             Budsjettberegninger, tempo og serier til diagrammer
    colors.ts           Validert fargepalett for lys og mørk modus
    date.ts             Datoaritmetikk i UTC, norsk formattering
    insights.ts         Regelbaserte innsikter
    money.ts            Beløp i øre, parsing og formattering
    periods.ts          Lønnsperioder og lønningsdatoer
    recurring.ts        Faste utgifter og idempotent bokføring
    storage.ts          Versjonert lagring og migrering
    transfer.ts         Eksport/import (JSON og CSV)
  state/                Reducer, app-store og demodata
  tests/                Vitest-tester
  ui/                   Gjenbrukbare komponenter (knapper, ark, felt, toast)
  types.ts              Hele datamodellen
```

All forretningslogikk ligger i `src/lib/` som rene funksjoner uten
React-avhengigheter. Det gjør den enkel å teste og gjenbruke – også hvis du
senere legger på en server.

---

## Datamodell og regler

- **Beløp lagres som heltall i øre.** 15 000 kr = 1 500 000 øre. Ingen
  flyttallsfeil i summeringer.
- **Datoer lagres som `YYYY-MM-DD`** og all aritmetikk gjøres i UTC, slik at
  sommertid aldri flytter en transaksjon til feil dag. Dagens dato leses fra
  enhetens lokale tid.
- **Hver periode har sin egen kopi av budsjettet.** Endrer du budsjettet for en
  ny periode, står historiske perioder urørt.
- **Transaksjoner tilhører perioden datoen faller innenfor.** Endrer du datoen
  slik at den havner i en annen periode, flyttes transaksjonen dit automatisk.
- **Redigering i avsluttede perioder er tillatt**, men appen varsler tydelig om
  at det endrer historikken for den perioden.
- **Transaksjonstyper:** `expense` (ordinær utgift), `saving`, `debt`, `income`
  (ekstra inntekt) og `adjustment` (refusjon). Bare `expense` teller som
  ordinært forbruk i diagrammene; `adjustment` trekker fra.
- **Underkategorier** administreres under Budsjett → blyanten ved en kategori.
  Nytt navn følger med til tidligere registreringer, favoritter og faste
  utgifter. Gir du en underkategori navnet til en annen, slås de sammen.
  Sletting fjerner bare forslaget – registreringene beholder navnet sitt.
- **Lagringsformatet er versjonert** (`schemaVersion`). Migreringer kjøres ved
  innlasting og sletter aldri brukerdata. Blir lagrede data uleselige, tas en
  kopi vare på under en egen nøkkel i stedet for å overskrives.

---

## Testing

```bash
npm test
```

Testene dekker de kritiske beregningene:

| Fil | Dekker |
|---|---|
| `money.test.ts` | Parsing av norske beløp, formattering, avrunding |
| `periods.test.ts` | Lønningsdatoer, korte måneder, skuddår, årsskifte, fremdrift |
| `calc.test.ts` | Budsjettberegninger, overforbruk, sparing vs. forbruk, prognoser |
| `reducer.test.ts` | Registrering, redigering, sletting, ny periode, historiske budsjetter |
| `recurring.test.ts` | Gjentakelser og idempotent bokføring uten duplikater |
| `transfer.test.ts` | Eksport/import, validering av ugyldige data, CSV, migrering |
| `sync.test.ts` | Synk mellom enheter: sammenslåing, sletting, konflikter, duplikater |
| `app.smoke.test.tsx` | Hele flyten i DOM: onboarding → registrering, budsjett, underkategorier og analyse |

---

## Synkronisering mellom mobil og PC (Supabase)

Appen fungerer fullt ut uten synk. Settes Supabase opp, kan du logge inn under
**Innstillinger → Synkronisering** (eller på velkomstsiden på en ny enhet) og få
de samme føringene overalt.

**Slik virker det**

- Dataene ligger fortsatt lokalt, så appen er like rask og virker uten nett.
- I tillegg lagres en kopi i tabellen `budsjette_state` – én rad per bruker,
  beskyttet av Row Level Security.
- Appen synker når den åpnes, når du går tilbake til den, når nettet kommer
  tilbake, hvert minutt mens den er åpen og like etter hver endring.
- Endringer gjort på flere enheter samtidig – også uten nett – slås sammen per
  føring (treveis sammenslåing). Ingenting overskrives i stillhet. Samme faste
  utgift bokført på to enheter blir én føring.
- «Slett alle data» mens du er innlogget logger deg ut og tømmer bare enheten.
  Skyen beholdes.

**Oppsett (én gang)**

1. Opprett et gratis prosjekt på <https://supabase.com>.
2. **SQL Editor → New query**: lim inn innholdet i `supabase/schema.sql` og kjør.
3. **Authentication → Users → Add user → Create new user**: e-post og passord,
   huk av for *Auto Confirm User*.
4. **Authentication → Sign In / Providers**: slå av *Allow new users to sign up*,
   så ingen andre kan lage konto.
5. **Project Settings → API**: kopier *Project URL* og *publishable/anon key*.
6. I GitHub-repoet: **Settings → Secrets and variables → Actions → Variables**,
   legg til `SUPABASE_URL` og `SUPABASE_ANON_KEY`. Kjør så arbeidsflyten på nytt.

Lokalt legges de samme verdiene i `.env.local` (sjekkes ikke inn):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Begge verdiene er laget for å ligge i frontend. Tilgangen styres av innlogging
og RLS. **Service role-nøkkelen skal aldri inn i appen eller repoet.**

Koden ligger i `src/lib/sync/` (sammenslåing og skykall) og
`src/state/CloudSync.tsx` (når det synkes).

---

## Personvern og sikkerhet

- Uten innlogging sender appen ingen data noe sted. Alt ligger i `localStorage`
  under nøkkelen `budsjette.v1`. Med synk sendes dataene bare til ditt eget
  Supabase-prosjekt.
- Det finnes ingen API-nøkler eller hemmeligheter i frontend-koden.
- **Legg aldri reelle økonomiske data inn i repositoriet.** `.gitignore`
  utelukker eksportfiler (`budsjette-eksport*.json`, `budsjette-transaksjoner*.csv`).
- Demomodus (Innstillinger → Avansert) fyller appen med oppdiktede eksempeltall.
  En ny bruker starter alltid med tom historikk.
- Sletting av data krever alltid bekreftelse, og import validerer hver enkelt
  transaksjon før noe erstattes.

---

## Lisens

Personlig prosjekt. Bruk det som du vil.
