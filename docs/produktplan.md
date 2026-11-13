# Produktplan for Pust

## 1. Produktidé

Pust er en Slack-bot for Gnists kanal `#pust`. Den skal gjøre registrering av
treningsaktivitet svært enkelt, gi positiv forsterkning og bruke spill-elementer
uten å rangere kolleger mot hverandre.

Pust kombinerer tre former for progresjon:

1. **Personlig progresjon:** Sparks, nivåer, prestasjoner, personlige rekorder og ukentlig streak.
2. **Små fellesskap:** Frivillige Pustelag med samarbeidsbaserte mål.
3. **Hele Gnist:** Adaptive mål for deltakelse og aktivitetsminutter i `#pust`.

En aktivitet kan dermed bidra til personlig streak, alle aktuelle Pustelag og
Gnists felles Pust samtidig.

## 2. Produktprinsipper

- Samarbeid fremfor individuell konkurranse.
- All bevegelse teller, uavhengig av tempo og intensitet.
- Ingen offentlige individuelle topplister.
- Personer sammenlignes bare med sin egen historikk.
- Gruppen måles både på deltakelse og samlet bevegelse.
- Tonen skal være energisk, inkluderende og inspirert av norsk friluftsliv.
- Rolige uker, sykdom og ferie skal aldri omtales som nederlag.
- Opptjente Sparks, nivåer og prestasjoner forsvinner ikke i rolige perioder.
- Ingen integrasjoner med klokker eller eksterne treningstjenester i MVP.

## 3. Målgruppe og rammer

- Én Slack-kanal: `#pust`.
- 14 medlemmer ved oppstart.
- Dagens forventede deltakelse: 3–4 personer per uke.
- Medlemskap i `#pust` betyr aktiv deltakelse i løsningen.
- Botbrukere, gjester og deaktiverte kontoer skal ikke inngå i gruppemål.
- All kommunikasjon og alle kommandoer skal være på norsk bokmål.

## 4. Aktivitetsregistrering

### 4.1 Hva teller?

En kvalifiserende aktivitet er minst 10 minutter med intensjonell bevegelse.
Aktivitetene kan blant annet være:

- Gåtur eller fottur
- Løping
- Sykling
- Styrketrening
- Yoga eller bevegelighet
- Lagidrett
- Ski
- Annet

Aktiviteter under 10 minutter kan få en positiv respons, men gir ikke Sparks og
bidrar ikke til gruppemål.

### 4.2 Registreringsfelter

- Person som utførte aktiviteten
- Aktivitetstype
- Varighet i timer og minutter
- Distanse i kilometer når relevant
- Valgfri kommentar
- Dato, med i dag som standard

Alle registrerte detaljer publiseres i `#pust`. Distanse skal særlig brukes for
gåtur/fottur, løping og sykling, men skal ikke gi ekstra Sparks.

### 4.3 Registrering for andre

Alle medlemmer i `#pust` kan registrere aktivitet på vegne av et annet medlem.

- Aktiviteten teller umiddelbart og krever ikke godkjenning.
- Kanalinnlegget viser hvem som hjalp med registreringen.
- Personen som utførte aktiviteten får en privat melding.
- Personen kan redigere eller slette aktiviteten.
- Hjelperen kan trekke registreringen, men ikke endre den i skjul.
- Både deltaker og registrerende person lagres i revisjonshistorikken.

## 5. Personlig progresjon

### 5.1 Sparks

- Ett kvalifiserende aktivitetsminutt gir én Spark.
- Sparks tilhører personen som utførte aktiviteten.
- Det er ingen øvre grense for personlige Sparks.
- Kilometer, intensitet og aktivitetstype gir ikke multiplikator i MVP.
- Sparks brukes aldri i en offentlig rangering.

### 5.2 Nivåer

Foreløpig nivåkurve:

| Nivå | Navn | Totalt antall Sparks |
| ---: | --- | ---: |
| 1 | Første Gnist | 10 |
| 2 | Medvind | 100 |
| 3 | Stifinner | 300 |
| 4 | Turkamerat | 700 |
| 5 | Bålvokter | 1 500 |
| 6 | Fjellgeit | 3 000 |
| 7 | Pustemester | 6 000 |
| 8 | Tindevandrer | 9 000 |
| 9 | Gnistlegende | 15 000 |

Gnistlegende er høyeste nivå foreløpig. Sparks fortsetter å øke etter 15 000.

### 5.3 Personlig streak

En personlig streak fortsetter når medlemmet registrerer minst én kvalifiserende
aktivitet i løpet av uken. Streaken er ukentlig, ikke daglig. En avsluttet streak
fjerner aldri Sparks, nivå eller prestasjoner.

### 5.4 Personlige rekorder i Pust

Personlige rekorder synliggjør fremgang i egen aktivitetshistorikk og skal
oppmuntre til bevegelse uavhengig av tempo og intensitet. Hver person har to
mulige rekorder per aktivitetstype:

- Lengste distanse i én aktivitet, målt i registrerte kilometer.
- Lengste økt, målt i registrerte minutter.

Rekordene heter «Personlige rekorder i Pust», siden grunnlaget er aktivitetene
personen har registrert her. En løpetur sammenlignes bare med personens andre
løpeturer. Lengste økt gjelder alle aktivitetstyper, og distanserekord finnes
bare når distanse er registrert. Rekordene gir ingen ekstra Sparks.

Registrering skjer som før med `/pust logg`, uten nye felter. Når en aktivitet
slår en rekord, får det eksisterende kanalinnlegget en kort feiring med ny og
tidligere verdi. Én aktivitet kan slå begge rekordene. Eksempel:

> Ny personlig rekord i løping! Lengste distanse: 8 km. Tidligere rekord: 6,5 km.

Gjeldende rekorder vises i `/pust meg` og i den private fremdriftsmeldingen
etter egen registrering. Første registrerte verdi for hver rekord etablerer
utgangspunktet, uten en rekordfeiring. Lik verdi utløser heller ingen ny feiring.

Eksisterende aktiviteter inngår i rekordgrunnlaget når funksjonen tas i bruk,
uten å sende feiringer for gammel historikk. Redigering og sletting oppdaterer
gjeldende rekorder. Rekorden tilhører personen som utførte aktiviteten, også når
en kollega registrerer den. Rolige perioder nullstiller ikke rekordene.

Etterregistrering sammenlignes med alle allerede registrerte aktiviteter frem
til dagens dato. Fremtidsdaterte aktiviteter inngår først på aktivitetsdatoen
i Oslo-tid, uten en forsinket feiring. Redigering og sletting sender ingen nye
rekordfeiringer. Ved redigering erstattes aktivitetens innlegg uten den gamle
feiringen. Andre tidligere innlegg beholdes som feiringer fra registreringen,
mens `/pust meg` alltid viser gjeldende rekorder.

## 6. Gruppens Pust

Gruppen har to parallelle ukesmål:

1. Antall medlemmer som har registrert minst én kvalifiserende aktivitet.
2. Samlet antall kvalifiserende aktivitetsminutter.

Begge målene må nås for å videreføre gruppens streak. Ved oppstart foreslås:

- Deltakelse: 4 av 14 medlemmer.
- Aktivitet: 240 minutter totalt.
- Alle registrerte minutter teller mot gruppens minuttmål, uten grense per person.
- Alle minutter gir fortsatt personlige Sparks.

Status viser minutter per aktivitetstype og registrert distanse der den finnes,
sortert etter flest minutter. Oppsummeringen viser antall aktiviteter, antall
aktivitetstyper og samlet tid og distanse. Deltakelsesmålet krever fortsatt at
flere medlemmer bidrar. Gruppestreak beregnes med samme regel uten minuttgrense
også for tidligere uker; allerede publiserte søndagssammendrag endres ikke.

### 6.1 Adaptive mål

De første fire ukene brukes som prøve- og kalibreringsperiode. Deretter brukes et
rullerende vindu på fire uker:

- Når begge mål nås i minst tre av fire uker, kan målene økes forsiktig.
- Deltakelsesmålet økes med maksimalt én person om gangen.
- Minuttmålet økes med maksimalt 10 prosent om gangen.
- Etter roligere perioder kan målet justeres forsiktig ned.
- Pust-voktere kan pause tilpasningen ved ferie og høytider.
- Alle endringer skal forklares positivt og transparent i kanalen.

## 7. Pustelag

Pustelag er frivillige, samarbeidsbaserte grupper innenfor `#pust`. Første versjon
bruker én utfordring per lag med valgt start- og sluttdato, begge inklusive i
`Europe/Oslo`. Helgeutfordringer og lengre perioder støttes. Det er ingen ukentlig
nullstilling eller lagstreak i denne versjonen.

- `/pust lag` åpner oversikten over åpne og avsluttede utfordringer.
- Oppretteren velger navn, datoer og ett mål for hele perioden: deltakelse i
  prosent (100 betyr alle) eller samlet antall minutter. Deltakelse er standard.
- Oppretteren velger alle aktivitetstyper eller én bestemt type. Bare
  aktiviteter som passer valget teller mot mål og lagets totaler. Regelen vises
  i oversikten, status, opprettelsesbekreftelsen og delte kanalinnlegg.
  Eksisterende lag beholder alle aktivitetstyper.
- Oppretteren blir medlem ved opprettelse. Andre melder seg inn selv. Det er
  ingen øvre medlemsgrense; minst to medlemmer kreves for å nå et lagmål.
- Et medlem kan være med i flere lag. Aktivitet logges som vanlig og teller
  én gang per aktuelt lag, og fortsatt bare én gang i kanalens og personens tall.
- Innmelding og utmelding er åpen til og med sluttdatoen. Nåværende medlemmers
  aktiviteter som passer lagets regel teller fra hele perioden, også fra før innmelding.
- Ved utmelding tas personens aktiviteter ut av lagets fremdrift. De beholdes
  i personens historikk og kanalens tall. Ved ny innmelding teller de igjen.
- Deltakelsesmålet følger nåværende medlemsliste og rundes opp til hele personer.
  75 prosent av fem medlemmer betyr fire deltakere. Minuttmålet endres ikke
  ved inn- eller utmelding, og har ingen grense per person.
- Oppretteren kan endre navn, aktivitetstype, datoer og mål før startdatoen.
  Deretter er de låst.
- Underveis vises fremdrift med dagens medlemsliste. Etter sluttdatoen låses
  medlemslisten og status viser resultatet. Etterregistrering, redigering og
  sletting av aktiviteter kan fortsatt oppdatere tallene; dette er ikke et
  lagret øyeblikksbilde som kanalens søndagssammendrag.
- Status viser medlemmer, minutter og registrert distanse per aktivitetstype,
  antall aktiviteter og samlet tid og distanse. Ingen individuell rangering.
- «Del status i #pust» poster et øyeblikksbilde med en knapp for å åpne laget.
  Opprettelse og medlemsendringer poster ikke automatisk i kanalen.

Ukentlige lagmål, lagstreak, pauser, distansemål og automatiske laginnlegg er
utsatt til senere versjoner.

## 8. Prestasjoner og samarbeidsopplevelser

Implementerte personlige prestasjoner:

- **Første pust:** Registrer første aktivitet.
- **Fire på rad:** Oppnå en personlig streak på fire uker.
- **Ny sti:** Registrer tre ulike aktivitetstyper.
- **Medhjelper:** Registrer en aktivitet for en kollega.
- **Initiativtaker:** Opprett ditt første Pustelag. Låses opp ved opprettelse,
  uten krav om flere medlemmer eller fullført mål. Meldingen vises i lagets
  bekreftelse én gang. Eksisterende lagopprettere kvalifiserer også, og
  prestasjonen beholdes etter utmelding og avslutning av laget.

Mulige senere gruppeprestasjoner:

- **Alle med:** Nå kanalens deltakelsesmål.
- **Langtur:** Nå en felles distansemilepæl.

Senere kan Pust få samarbeidseventer som «Dørstokkmila», virtuelle langturer,
sesongutfordringer og flere skjulte prestasjoner. Fysiske arrangementer skal ikke
gi ekstra Sparks, slik at fjernarbeidere, omsorgspersoner og personer med ulike
funksjonsnivåer har like progresjonsmuligheter.

## 9. Arrangementer

Alle medlemmer skal kunne opprette et fysisk, virtuelt eller samarbeidsbasert
arrangement. Et arrangement kan inneholde:

- Tittel og beskrivelse
- Type arrangement
- Dato, tidspunkt og sted eller lenke
- Aktivitetstype og forventet intensitet
- Informasjon om tilgjengelighet
- Valgfri deltakergrense og påminnelse
- Valgfri kobling til et Pustelag

Medlemmer kan svare «Blir med», «Kanskje» eller «Kan ikke». Oppretteren kan
redigere eller avlyse, og Pust-voktere kan fjerne arrangementer. Etterpå kan Pust
tilby deltakerne en forhåndsutfylt aktivitetsregistrering.

Arrangementer inngår i andre leveranse.

## 10. Slack-opplevelse

Foreslåtte kommandoer:

- `/pust logg`
- `/pust status`
- `/pust meg`
- `/pust rediger`
- `/pust slett`
- `/pust lag`
- `/pust arrangement`
- `/pust hjelp`

MVP bruker strukturerte Slack-modaler. Fritekst som «@Pust logg 30 min gåtur for
@Ola» kan vurderes senere.

### 10.1 Meldingsrytme

- Eget kanalinnlegg for hver registrerte aktivitet.
- Umiddelbar markering av nivåer og viktige prestasjoner.
- Nytt ukesmål mandag.
- Relevant oppmuntring torsdag, ikke et fast mas.
- Påminnelse om aktuelle arrangementer fredag.
- Ukesoppsummering søndag kveld.
- Private påminnelser bare når medlemmet har valgt dem aktivt.

Med dagens lave volum er egne aktivitetsinnlegg ønskelig. Dette bør vurderes på
nytt dersom aktivitetsnivået øker betydelig.

## 11. Samtykke og kontroll

Velkomstmeldingen forklarer at medlemskap i `#pust` innebærer aktiv deltakelse,
og at aktivt registrerte detaljer publiseres i kanalen.

- Pust henter ingen informasjon fra eksterne treningstjenester.
- Brukere kan redigere og slette egne aktiviteter.
- Sletting oppdaterer Sparks, nivåer, prestasjoner og gruppetall.
- Når noen forlater kanalen, stopper varsler og fremtidig deltakelse.
- Historiske Slack-innlegg blir stående, mens lagrede aktivitetsdata kan slettes
  på forespørsel.
- Pust skal ikke be om eller lagre skader, vekt, kalorier, diagnoser eller andre
  helseopplysninger.

## 12. Pust-voktere

Slack-administratorene utpeker to eller tre Pust-voktere. De kan:

- Justere eller pause adaptive ukesmål.
- Håndtere feilregistreringer og sletting.
- Fjerne arrangementer.
- Pause streaks ved ferie og høytider.
- Se enkel bruks- og gruppestatistikk.
- Endre botens meldingsfrekvens.

Administrative endringer skal ha et revisjonsspor. Rollen skal ikke gi tilgang
til skjulte personopplysninger eller mulighet til å endre Sparks vilkårlig.

## 13. Leveranseplan

### Leveranse 1: Fokusert MVP

- Norsk Slack-opplevelse i `#pust`.
- Velkomst og tydelig informasjon om synlighet.
- Registrering for seg selv og andre.
- Kanalinnlegg og privat varsel ved assistert registrering.
- Redigering og sletting.
- Sparks og de første nivåene.
- Personlig ukentlig streak.
- Gruppemål for deltakelse og minutter.
- Mandagsstart og søndagsoppsummering.
- Fire til seks enkle prestasjoner.
- Grunnleggende administrasjon for Pust-voktere.

### Leveranse 2: Fellesskap

- Pustelag med veiledede, men ikke begrensede størrelser.
- Arrangementer som alle kan opprette.
- Adaptive mål basert på fire ukers historikk.
- Flere prestasjoner og samarbeidseventer.
- Virtuelle distansereiser og sesonginnhold.

### Senere muligheter

- Naturlig språk for registrering.
- Flere kanaler eller organisasjoner.
- Valgbare språk.
- Eventuelle eksterne integrasjoner, bare dersom reell bruk viser behov.

## 14. Suksesskriterier for prøveperioden

Etter fire uker vurderes MVP-en ut fra:

- Minst 4 av 14 medlemmer registrerer aktivitet i en typisk uke.
- Flere medlemmer har prøvd Pust enn de 3–4 som poster i dag.
- En aktivitet kan registreres uten forklaring fra en utvikler.
- Assistert registrering oppleves som trygg og forståelig.
- Medlemmene forstår forskjellen mellom Sparks, personlig streak og gruppens Pust.
- Kanalinnleggene oppleves som oppmuntrende og ikke støyende.
- Ingen opplever offentlig rangering eller press til å dele helseopplysninger.
- Pust-voktere kan rette feil uten utviklerhjelp.

## 15. Neste utviklingssteg

1. Velg teknisk plattform, datalager og driftsmiljø.
2. Definer Slack-appens tillatelser og hendelser etter minste-tilgang-prinsippet.
3. Modellér medlemmer, aktiviteter, Sparks, nivåer, streaks og prestasjoner.
4. Lag aktivitetsmodalen og publisering til `#pust`.
5. Implementer redigering, sletting og assistert registrering.
6. Implementer beregning av personlig og felles ukentlig streak.
7. Legg til planlagte mandags- og søndagsmeldinger.
8. Kjør en intern prøveperiode på fire uker før leveranse 2 prioriteres.

## 16. Teknisk grunnretning

- TypeScript på en støttet Node.js LTS-versjon.
- Slack Bolt for JavaScript med Socket Mode under lokal utvikling.
- SQLite som første datalager.
- Domeneregler holdes adskilt fra Slack-håndtering og datalagring.
- Docker Compose er den eneste påkrevde lokale utviklingsavhengigheten.
- Node, npm-avhengigheter og SQLite-data ligger i containere eller navngitte
  Docker-volumer.
- Kildekode monteres inn i utviklingscontaineren for rask tilbakemelding.
- Hemmeligheter lagres bare i en ignorert `.env`-fil og aldri i Git.


## 17. Offentlig ukearkiv

Første nettversjon viser kanalens samlede ukesrapporter på
`https://pust.smidigbommen.no`. Den er offentlig, lesbar uten innlogging og ber
søkemotorer om ikke å indeksere sidene. Ingen navn, individuelle resultater,
kommentarer eller aktivitetsbilder publiseres på nettstedet.

- Rapporter fryses søndag kl. 22:00 Oslo-tid, og Slack beholder hele sin
  oppsummering med en lenke til samme rapport.
- Siste rapport er forsiden. Uker har permanente lenker, forrige/neste-navigasjon
  og et arkiv gruppert etter år.
- Tid, deltakelse og kjente mål står sentralt. Aktivitetstyper har egne
  minutt- og distansetall. Ingen felles distansemål eller individuelle topplister.
- Åtte ukers trend viser minutter og deltakelse med nøytrale farger.
- Tomme uker får rapport, men ingen Slack-post.
- Historisk import merkes som rekonstruert fra dagens aktivitetslogg. Ukjente
  mål, medlemstall og gruppestreak vises ikke.
- Manglende rapporter etter nedetid opprettes senere med tydelig merking og
  faktisk opprettelsestid. Slack får ingen ettersending.
- Lagrede rapporter endres ikke etter senere endringer i aktivitetsloggen.

Neste separate leveranse kan legge til Slack-innlogging og kontroll av
medlemskap i `#pust`. Det vil begrense fremtidig tilgang, men kan ikke trekke
tilbake tidligere delte kopier av offentlige rapporter.
