# Requirements: Lottningsprogram för golfgrupper

## 1. Syfte

Ungefär 30 spelare deltar i en återkommande golfaktivitet (t.ex. varje vecka). Grupperna (flighter) lottas manuellt idag, vilket är tidskrävande och gör det svårt att hålla koll på regler som gifta par, handicaptak och variation mellan veckorna. Detta program ska automatisera lottningen så att den:

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

## 3. Datamodell

### Spelare
- Namn / spelar-ID
- Handicap (numeriskt)
- Make/maka-koppling — referens till en annan spelares ID
- Preferens för gift par (per koppling, gäller båda i paret symmetriskt):
  - **Hålls isär** (standard) — får aldrig hamna i samma flight
  - **Spelar alltid tillsammans** — ska alltid hamna i samma flight (undantag från standardregeln, för par som själva vill spela ihop)
  - **Startar före / startar efter respektive** — hålls isär som standard, men den ena ska alltid hamna i en tidigare flight än den andra (för par som t.ex. samåker och vill kunna värma upp i olika ordning)
- Flagga: "långsam spelare" (manuellt satt av admin)
- Flagga: "behöver golfbil" (manuellt satt av admin)
- Flagga: "vill starta tidigt" (manuellt satt av admin) — spelaren bör hamna i en av de tidigare flighterna

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
1. **Gifta par isär** — två spelare som är kopplade som gift par, och vars preferens är "hålls isär" (standard) eller "startar före/efter", får aldrig hamna i samma flight.
2. **Gifta par som alltid ska spela ihop** — spelare med preferensen "spelar alltid tillsammans" måste alltid hamna i samma flight.
3. **Startordning för par med den preferensen** — om en spelare har preferensen "startar före respektive" måste den spelaren alltid hamna i en tidigare flight (lägre flight-nummer) än sin respektive.
4. **Handicaptak** — summan av handicap för spelarna i en flight får aldrig överstiga 110.
5. **Flightstorlek** — flighter ska normalt bestå av 3 spelare. Om antalet anmälda inte är jämnt delbart med 3, se avsnitt 6.

Om lottningen inte kan uppfylla samtliga hårda krav samtidigt (t.ex. om handicaptaket gör en viss flightindelning omöjlig) sparas veckan inte automatiskt — se avsnitt 6.

### 4.2 Mjuka krav (bästa möjliga uppfyllelse, i prioritetsordning)
Vid konflikt mellan mjuka krav gäller denna ordning, högst prioritet först:

1. **Golfbilsdelning** — spelare flaggade "behöver golfbil" ska grupperas parvis (2 och 2) inom samma flight så de kan dela bil.
2. **Tidiga starter** — spelare flaggade "vill starta tidigt" bör hamna i en av de tidigare flighterna.
3. **Undvik långsamma spelare ihop** — flighter bör inte innehålla fler än en spelare flaggad som "långsam", om det går att undvika.
4. **Rotation / variation** — lottningen ska minimera antalet gånger samma två spelare hamnar i samma flight, sett över säsongens historik. Om flera lottningar uppfyller kraven ovan lika bra väljs den som ger mest variation jämfört med tidigare veckor.

Fullständig prioritetsordning vid konflikt (hög till låg):
**Gifta par isär / ihop / startordning → Handicaptak → Golfbilsdelning → Tidiga starter → Undvik långsamma ihop → Rotation/variation**

De fyra första (gifta par-reglerna och handicaptaket) är absoluta krav och får aldrig kompromissas. De fyra sista löses i angiven ordning — om det är omöjligt att uppfylla alla samtidigt prioriteras det som står högst.

## 5. Output

För varje spelvecka: en lista av flighter, där varje flight visar vilka spelare som ingår, samt (för spårbarhet) flight-summan av handicap.

### Dela via mail
Lottningen ska kunna skickas som text via mail med ett enda knapptryck. Knappen öppnar enhetens standard-mailprogram (via en `mailto:`-länk, kräver ingen backend) med ämnet förifyllt (t.ex. "Golfgrupper 2026-07-19") och texten formaterad med en starttid per flight (flightnumren har ersatts av klockslag, med 10 minuters mellanrum mellan flighterna):

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

## 6. Beslutade edge cases

- **Ojämnt antal anmälda**: Om antalet anmälda inte är jämnt delbart med 3 skapas en flight med 4 spelare (om resten är 1) eller en flight med 2 spelare (om resten är 2), övriga flighter har 3 spelare.
- **Udda antal golfbils-flaggade i en flight**: Bästa möjliga parning — lottningen försöker minimera antalet flighter med ett udda antal golfbils-flaggade spelare, men en ensam spelare utan bilpartner är tillåtet om det inte går att undvika.
- **Omöjlig flight pga. handicaptak eller gifta par-regler**: Lottningen sparas aldrig om något hårt krav bryts (handicaptak, gifta par som ska hållas isär/ihop, eller startordning för ett par). Om ingen giltig lösning hittas automatiskt flaggas det tydligt i gränssnittet, och admin får byta plats på spelare manuellt (tryck-för-att-byta-plats) tills det är giltigt.

## 7. Icke-mål (för denna fas)

- Inget användargränssnitt
- Ingen inloggning/behörighetshantering
- Ingen integration mot externt handicapsystem (handicap matas in manuellt eller importeras separat)
- Ren regel-/datamodell och lottningslogik — inte en färdig applikation

## 8. Framtida steg

Nästa fas är att implementera själva lottningsprogrammet som realiserar reglerna ovan. Val av språk/plattform är inte bestämt ännu.
