# Requirements: Flightlotten — lottningsprogram för golfgrupper

## 1. Syfte

Ungefär 30 spelare deltar i en återkommande golfaktivitet (t.ex. varje vecka). Grupperna (flighter) lottas manuellt idag, vilket är tidskrävande och gör det svårt att hålla koll på regler som vilka spelare som ska eller inte ska spela ihop, handicaptak och variation mellan veckorna. Detta program ska automatisera lottningen så att den:

- respekterar hårda regler (aldrig bryts),
- gör ett bästa möjliga försök att uppfylla mjuka regler (prioritetsordning vid konflikt),
- och håller koll på historik mellan veckor för att skapa variation över säsongen.

Detta dokument beskriver **vad** programmet ska göra, inte hur det ska byggas (språk/plattform bestäms senare).

## 2. Definitioner

| Begrepp | Betydelse |
|---|---|
| Spelare | En person i spelarregistret, med handicap och ev. flaggor |
| Flight / grupp | En delmängd av veckans anmälda spelare som spelar tillsammans, normalt 3 spelare |
| Flight-ordning | Flighternas numrering (Flight 1, 2, 3, …) motsvarar startordningen — Flight 1 startar först |
| Spelvecka | Ett enskilt lottningstillfälle med en lista av anmälda spelare |
| Säsong | Perioden över vilken flera spelveckor räknas för rotationshistorik |
| Golfbil | Elbil (cart) som två spelare kan dela under rundan |
| Spelarrelation | En regel mellan två specifika spelare: alltid tillsammans, aldrig tillsammans, startordning (den ena startar alltid före den andra), eller flightavstånd (max 3 flighter mellan dem) |

## 3. Datamodell

### Spelare
- Namn / spelar-ID
- Handicap (numeriskt)
- Relationer till andra spelare — en spelare kan ha flera relationer, till olika spelare (listor med spelar-referenser):
  - **Alltid tillsammans med** — dessa spelare ska alltid hamna i samma flight som denna spelare (ömsesidigt — gäller automatiskt åt båda hållen)
  - **Aldrig tillsammans med** — dessa spelare får aldrig hamna i samma flight som denna spelare (ömsesidigt — gäller automatiskt åt båda hållen)
  - **Startar före** — dessa spelare ska denna spelare alltid hamna i en tidigare flight än (motsatsen, "startar efter", gäller automatiskt för den andra spelaren i relationen)
  - **Inom tre flighter** — dessa spelare får aldrig hamna mer än 3 flighter (flight-nummer) ifrån denna spelare (ömsesidigt — gäller automatiskt åt båda hållen). T.ex. Flight 1 och Flight 4 är tillåtet (skillnad 3), Flight 1 och Flight 5 är det inte.

  Samma par av spelare kan bara ha en av dessa fyra relationstyper mellan sig åt gången (t.ex. inte både "alltid tillsammans" och "aldrig tillsammans" mellan samma två spelare).
- Flagga: "långsam spelare" (manuellt satt av admin)
- Flagga: "behöver golfbil" (manuellt satt av admin)
- Starttidspreferens (manuellt satt av admin): **Ingen preferens** (standard) / **Vill starta tidigt** / **Vill starta sent** — spelaren bör hamna i en av de tidigare respektive senare flighterna

Not: "Behöver golfbil" avser golfbil (cart) under rundan, inte skjuts till banan. Alla spelare kan köra en golfbil, så det räcker med en flagga per spelare — ingen separat "kan köra"-flagga behövs.

### Spelvecka
- Datum
- Lista över anmälda spelare den veckan (varierar vecka till vecka — inte alla ~30 spelare deltar varje gång)
- Resulterande flight-indelning (output från lottningen)

### Historik
- Per tidigare spelvecka: vilka spelare som ingick i samma flight
- Används för att räkna ut hur många gånger varje par av spelare har spelat ihop under säsongen (rotationsregeln)

## 4. Regler

### 4.1 Hårda krav (får aldrig brytas)
1. **Aldrig tillsammans** — två spelare med relationen "aldrig tillsammans" får aldrig hamna i samma flight.
2. **Alltid tillsammans** — två spelare med relationen "alltid tillsammans" måste alltid hamna i samma flight.
3. **Startordning** — om en spelare har relationen "startar före" till en annan spelare, måste den förstnämnda alltid hamna i en tidigare flight (lägre flight-nummer) än den andra.
4. **Flightavstånd** — två spelare med relationen "inom tre flighter" får aldrig hamna mer än 3 flighter ifrån varandra.
5. **Handicaptak** — summan av handicap för spelarna i en flight får aldrig överstiga 110.
6. **Flightstorlek** — flighter ska normalt bestå av 3 spelare. Om antalet anmälda inte är jämnt delbart med 3, se avsnitt 6.

Om lottningen inte kan uppfylla samtliga hårda krav samtidigt (t.ex. om handicaptaket gör en viss flightindelning omöjlig) sparas veckan inte automatiskt — se avsnitt 6.

### 4.2 Mjuka krav (bästa möjliga uppfyllelse, i prioritetsordning)
Vid konflikt mellan mjuka krav gäller denna ordning, högst prioritet först:

1. **Golfbilsdelning** — spelare flaggade "behöver golfbil" ska grupperas parvis (2 och 2) inom samma flight så de kan dela bil.
2. **Starttidspreferens** — spelare med preferensen "vill starta tidigt" bör hamna i en av de tidigare flighterna, och spelare med "vill starta sent" bör hamna i en av de senare flighterna.
3. **Undvik långsamma spelare ihop** — flighter bör inte innehålla fler än en spelare flaggad som "långsam", om det går att undvika.
4. **Rotation / variation** — lottningen ska minimera antalet gånger samma två spelare hamnar i samma flight, sett över säsongens historik. Om flera lottningar uppfyller kraven ovan lika bra väljs den som ger mest variation jämfört med tidigare veckor.

Fullständig prioritetsordning vid konflikt (hög till låg):
**Aldrig/alltid tillsammans / startordning / flightavstånd → Handicaptak → Golfbilsdelning → Starttidspreferens → Undvik långsamma ihop → Rotation/variation**

De fem första (spelarrelationerna och handicaptaket) är absoluta krav och får aldrig kompromissas. De fyra sista löses i angiven ordning — om det är omöjligt att uppfylla alla samtidigt prioriteras det som står högst.

## 5. Output

För varje spelvecka: en lista av flighter, där varje flight visar vilka spelare som ingår, samt (för spårbarhet) flight-summan av handicap.

### Dela via mail
Lottningen ska kunna skickas som text via mail med ett enda knapptryck. Knappen öppnar enhetens standard-mailprogram (via en `mailto:`-länk, kräver ingen backend) med ämnet förifyllt (t.ex. "Flightlotten 2026-07-19") och texten formaterad med en starttid per flight (flightnumren har ersatts av klockslag, med 10 minuters mellanrum mellan flighterna):

```
Flight 9:00
Namn 1
Namn 2
Namn 3

Flight 9:10
Namn 4
Namn 5
Namn 6
```

Starttiden för den första flighten väljs av användaren i lottningsfliken (ett tidsfält bredvid datumfältet, förvalt till 09:00) och kan ändras för varje spelvecka. Mottagarfältet lämnas tomt — användaren väljer mottagare själv varje gång. Funktionen gäller den aktuella lottningen (inte historiska veckor).

### Antal valda spelare

Vid val av vilka spelare som deltar en given vecka (i lottningsfliken) ska gränssnittet visa hur många spelare som är valda, i formatet "X av Y valda" (X = antal markerade denna vecka, Y = totalt antal spelare i registret), t.ex. "Deltagare denna vecka (14 av 28 valda)". Antalet ska uppdateras direkt när en spelare markeras eller avmarkeras (inklusive vid "Markera alla" / "Avmarkera alla").

## 6. Beslutade edge cases

- **Ojämnt antal anmälda**: Om antalet anmälda inte är jämnt delbart med 3 skapas en flight med 4 spelare (om resten är 1) eller en flight med 2 spelare (om resten är 2), övriga flighter har 3 spelare.
- **Udda antal golfbils-flaggade i en flight**: Bästa möjliga parning — lottningen försöker minimera antalet flighter med ett udda antal golfbils-flaggade spelare, men en ensam spelare utan bilpartner är tillåtet om det inte går att undvika.
- **Omöjlig flight pga. handicaptak eller spelarrelationer**: Lottningen sparas aldrig om något hårt krav bryts (handicaptak, spelare som ska hållas isär/ihop, startordning, eller flightavstånd mellan spelare). Om ingen giltig lösning hittas automatiskt flaggas det tydligt i gränssnittet, och admin får byta plats på spelare manuellt (tryck-för-att-byta-plats) tills det är giltigt.
- **Motstridiga relationer**: Om relationerna mellan spelare skapar en omöjlig situation (t.ex. en kedja av "alltid tillsammans"-relationer som omfattar fler spelare än flightstorleken tillåter, eller relationer som annars gör en giltig lottning omöjlig) flaggas detta tydligt i gränssnittet, på samma sätt som andra omöjliga flighter ovan.

## 7. Migrering av tidigare data

Tidigare version av datamodellen använde ett Make/maka-fält med en enda koppling per spelare och en preferens (hålls isär / spelar alltid tillsammans / startar före/efter respektive). Detta fält ersätts av de fria relationslistorna i avsnitt 3.

Första gången den nya versionen av appen körs ska befintlig sparad spelardata migreras automatiskt till det nya formatet:
- Preferens "hålls isär" (standard) → migreras till relationen "aldrig tillsammans" mellan de två kopplade spelarna.
- Preferens "spelar alltid tillsammans" → migreras till relationen "alltid tillsammans".
- Preferens "startar före respektive" → migreras till relationen "startar före", med samma riktning som tidigare.

Efter migreringen sparas data enbart i det nya formatet — Make/maka-fältet och den gamla preferensen tas bort och skrivs inte längre till lagringen. Migreringen ska bara köras en gång per installation (t.ex. styrd av en versionsflagga i den sparade datan) och ska inte köras om vid varje appstart.

## 8. Icke-mål

- Ingen inloggning/behörighetshantering
- Ingen integration mot externt handicapsystem (handicap matas in manuellt eller importeras via fil)
- Ingen backend/server — appen körs helt i webbläsaren (HTML/JS), data sparas lokalt

## 9. Status och framtida steg

Grundapplikationen (spelarregister, lottningslogik för hårda/mjuka krav, historik/rotation, delning via mail) är implementerad som en webbapp (`index.html`, `app.js`, `lottery.js`, `styles.css`) som körs helt i webbläsaren.

Kvarstående steg utifrån detta dokuments senaste ändringar:
- Implementera relationsmodellen i avsnitt 3 (alltid/aldrig tillsammans, startordning) i kodbasen, som ersättning för dagens `spouseId`/`spousePreference`-fält i `app.js` och `lottery.js`.
- Implementera engångsmigreringen beskriven i avsnitt 7.
- Implementera räknaren "X av Y valda" beskriven i avsnitt 5.
