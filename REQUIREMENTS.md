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
| Spelvecka | Ett enskilt lottningstillfälle med en lista av anmälda spelare |
| Säsong | Perioden över vilken flera spelveckor räknas för rotationshistorik |
| Golfbil | Elbil (cart) som två spelare kan dela under rundan |

## 3. Datamodell

### Spelare
- Namn / spelar-ID
- Handicap (numeriskt)
- Make/maka-koppling — referens till en annan spelares ID, om gift par som inte får spela ihop
- Flagga: "långsam spelare" (manuellt satt av admin)
- Flagga: "behöver golfbil" (manuellt satt av admin)

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
1. **Gifta par isär** — två spelare som är kopplade som gift par får aldrig hamna i samma flight.
2. **Handicaptak** — summan av handicap för spelarna i en flight får aldrig överstiga 110.
3. **Flightstorlek** — flighter ska normalt bestå av 3 spelare. Om antalet anmälda inte är jämnt delbart med 3, se öppen fråga i avsnitt 6.

### 4.2 Mjuka krav (bästa möjliga uppfyllelse, i prioritetsordning)
Vid konflikt mellan mjuka krav gäller denna ordning, högst prioritet först:

1. **Golfbilsdelning** — spelare flaggade "behöver golfbil" ska grupperas parvis (2 och 2) inom samma flight så de kan dela bil.
2. **Undvik långsamma spelare ihop** — flighter bör inte innehålla fler än en spelare flaggad som "långsam", om det går att undvika.
3. **Rotation / variation** — lottningen ska minimera antalet gånger samma två spelare hamnar i samma flight, sett över säsongens historik. Om flera lottningar uppfyller kraven ovan lika bra väljs den som ger mest variation jämfört med tidigare veckor.

Fullständig prioritetsordning vid konflikt (hög till låg):
**Gifta par isär → Handicaptak → Golfbilsdelning → Undvik långsamma ihop → Rotation/variation**

De två första är absoluta krav och får aldrig kompromissas. De tre sista löses i angiven ordning — om det är omöjligt att uppfylla alla samtidigt prioriteras det som står högst.

## 5. Output

För varje spelvecka: en lista av flighter, där varje flight visar vilka spelare som ingår, samt (för spårbarhet) flight-summan av handicap.

## 6. Öppna frågor / edge cases

Dessa behöver beslutas innan eller under implementation:

- **Ojämnt antal anmälda**: Om antalet anmälda spelare inte är jämnt delbart med 3, hur ska resten hanteras? (T.ex. en flight med 2 eller 4 spelare istället.)
- **Udda antal golfbils-flaggade i en flight**: Om en flight har ett udda antal spelare som behöver golfbil (t.ex. 1 eller 3 av 3), går det inte att para ihop exakt 2 och 2. Hur ska detta hanteras — tillåts en spelare köra ensam, eller ska lottningen försöka omfördela mellan flighter?
- **Omöjlig flight pga. handicaptak**: Om de kvarvarande ihoplottade spelarna mot slutet av processen har för hög sammanlagd handicap för att bilda en giltig flight, vad ska hända? (T.ex. manuell justering, eller att programmet flaggar veckan som olösbar och ber om admin-ingrepp.)

## 7. Icke-mål (för denna fas)

- Inget användargränssnitt
- Ingen inloggning/behörighetshantering
- Ingen integration mot externt handicapsystem (handicap matas in manuellt eller importeras separat)
- Ren regel-/datamodell och lottningslogik — inte en färdig applikation

## 8. Framtida steg

Nästa fas är att implementera själva lottningsprogrammet som realiserar reglerna ovan. Val av språk/plattform är inte bestämt ännu.
