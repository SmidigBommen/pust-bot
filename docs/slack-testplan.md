# Slack-testplan for Pust

Bruk denne sjekklisten i `#pust` før en ny versjon regnes som klar.

## Oppstart

- Legg til bot-scopet `files:read` og reinstaller Slack-appen før versjonen med bildeopplasting deployes.
- Kjør `docker compose up --build`.
- Bekreft at loggen viser `Pust er i gang` uten token- eller Socket Mode-feil.
- Bekreft at boten bare brukes i `#pust`.

## Kommandoer

- `/pust hjelp` viser alle tilgjengelige kommandoer privat.
- En ukjent kommando viser hjelp uten å poste i kanalen.
- `/pust status` poster ukens deltakere, minutter, kilometer og gruppestreak.
- `/pust meg` viser personlige Sparks, nivå, streak, prestasjoner og rekorder privat.

## Registrering

- `/pust logg` åpner modal med dagens dato og innlogget bruker valgt.
- Aktivitet under 10 minutter avvises.
- Aktivitet uten distanse og kommentar kan lagres.
- Aktivitet med desimaldistanse og kommentar kan lagres.
- Kanalinnlegget viser riktig aktivitet, minutter, kilometer og Sparks.
- Registrering for en kollega viser hjelperen og sender kollegaen en privat melding.
- Første registrering låser opp `Første pust` én gang, ikke ved hver aktivitet.
- Registrer for deg selv, med og uten bilde. Etter lagring vises personlig
  fremdrift privat i `#pust`. Sammenlign med `/pust meg`: begge skal vise de
  oppdaterte Sparks-, nivå-, streak- og prestasjonstallene.
- Registrer for en kollega. Ingen automatisk personlig fremdriftsmelding skal
  sendes til noen av dere. Den eksisterende private registreringsbeskjeden til
  kollegaen skal fortsatt komme.
- Ugyldig registrering, redigering og sletting skal ikke sende denne
  fremdriftsmeldingen. Bildevarsler kan fortsatt vises ved bildefeil.

## Bilder

- `/pust logg` lar brukeren laste opp ett nytt JPG-, PNG- eller GIF-bilde, eller sende inn uten bilde.
- Registrer med bilde fra Slack på både datamaskin og mobil. Bekreft at bildet vises under tekst og prestasjoner i botens innlegg.
- En annen bruker i `#pust` kan se bildet, ikke bare den som lastet det opp.
- Andre filtyper og flere bilder avvises uten at aktiviteten lagres.
- Avbryt skjemaet etter opplasting. Ingen aktivitet eller botmelding skal opprettes.
- Registrer med bilde for en kollega. Bildet vises i kanalen og hjelperen er fortsatt synlig.
- Rediger en aktivitet med bilde etter omstart av boten. Bildet beholdes, og teksten oppdateres.
- Slett en aktivitet med bilde. Innlegget viser slettemeldingen uten bilde. Filen slettes ikke fra Slack.
- Slett selve bildet i Slack og rediger aktiviteten. Hvis Slack avviser bildereferansen, oppdateres teksten uten bilde og brukeren får beskjed.

## Automatisk ukessammendrag

- Oppstartsloggen viser om ukessammendrag er aktivert. Lokal Compose skal vise `av`.
- I produksjon skal første ordinære søndagsinnlegg ha tittelen `Ukens trening søndag kl. 22:00`, korrekt ukesperiode og ingen kanalvarsling.
- Ukens tall skal samsvare med `/pust status` ved utsending. Et manuelt statusinnlegg skal ikke undertrykke sammendraget.
- Senere registrering, redigering og sletting skal ikke endre sammendraget.
- Utsending, tom uke, passert tidspunkt og feil skal være synlige i botens logger når boten kjører. Ingen ettersending skal skje ved omstart.
- Tester med simulert klokke dekker sommertid, vintertid, forsinkelse, omstart, samtidige kontroller og Slack-feil. Ikke endre produksjonsserverens klokke for å teste dette.

## Redigering og sletting

- `/pust rediger` viser bare aktivitetene til brukeren som kjørte kommandoen.
- Redigering oppdaterer det opprinnelige kanalinnlegget.
- Sparks og `/pust status` endres etter redigering.
- `/pust slett` viser aktiviteter brukeren utførte eller hjalp med å registrere.
- Sletting krever eksplisitt innsending av modal.
- Sletting markerer det opprinnelige kanalinnlegget som slettet.
- Sparks og `/pust status` endres etter sletting.

## Streaks og prestasjoner

- Én aktivitet per uke viderefører personlig streak.
- En pågående uke uten aktivitet bryter ikke forrige streak for tidlig.
- Gruppestreak krever både deltaker- og minuttmålet.
- `Ny sti` låses opp etter tre ulike aktivitetstyper.
- `Fire på rad` låses opp etter fire sammenhengende uker.
- `Medhjelper` låses opp når noen registrerer for en kollega.
- `Initiativtaker` vises i bekreftelsen når en bruker oppretter sitt første
  Pustelag, og i `/pust meg`. Et nytt lag eller gjentatt innsending skal ikke
  vise opplåsingen på nytt. Innmelding i andres lag gir ikke prestasjonen.
- Eksisterende lagopprettere skal se `Initiativtaker` i personlig status,
  også etter at de har forlatt laget eller utfordringen er avsluttet.
- Nivå 8 er `Tindevandrer` ved 9 000 Sparks, og nivå 9 er `Gnistlegende` ved
  15 000. Kontroller neste nivå og gjenstående Sparks i `/pust meg` og etter
  egenregistrering. Automatiserte tester dekker selve nivågrensene.

## Personlige rekorder

- `/pust meg` viser lengste økt og registrerte distanse per aktivitetstype fra
  eksisterende historikk. En person uten aktiviteter har ingen rekordliste.
- Første økt i en type etablerer utgangspunktet uten rekordfeiring. Første
  distanse gjør det samme, også når typen allerede har økter uten distanse.
- Registrer en lengre økt og distanse i samme type. Begge rekordene feires med
  nye og tidligere verdier i aktivitetsinnlegget. Gjenta med bilde og kontroller
  at feiringen vises over bildet. Rekordbonusen vises separat: 10 Sparks for én
  rekord, 20 for begge. Kontroller samme tillegg i `/pust meg` og nivået.
- Registrer lik eller lavere verdi. Ingen ny rekordfeiring skal vises.
- Kontroller at sykkelrekorder ikke påvirker løping, og at en kollegas rekord
  ikke påvirker din. Ved registrering for andre tilhører rekorden deltakeren.
- Sammenlign rekordene i den private meldingen etter egenregistrering med
  `/pust meg`. De skal være like, også når bare minutter er registrert.
- Rediger en rekord ned, fjern distansen eller bytt aktivitetstype. Kontroller
  at `/pust meg` viser riktig gjenværende rekord og at det redigerte innlegget
  ikke beholder gammel rekordfeiring. Ingen ny feiring sendes ved redigering.
- Slett rekordaktiviteten. Forrige gjenværende rekord overtar. Slett siste økt
  i en type og kontroller at typen forsvinner fra rekordlisten.
- Etterregistrer en aktivitet og kontroller at den sammenlignes med hele
  historikken frem til i dag, også økter med senere aktivitetsdato.
- Automatiserte tester dekker at fremtidsdaterte aktiviteter inngår fra sin
  dato i Oslo-tid, uten forsinket feiring. Ikke endre produksjonsklokken.
- Gamle registreringer skal beholde Sparks uten rekordbonus etter oppgradering,
  også når de redigeres til en høyere verdi. Første verdier og like verdier skal
  heller ikke gi bonus. Automatiserte tester dekker migrering og omstart.
- En ny PR skal beholde bonusen når en senere PR slås. Rediger den første
  PR-en uten å gå under sammenligningsverdien, og kontroller at bonusen består.
- Korriger begge rekordverdiene ned til eller under de opprinnelig slåtte
  verdiene. Bonusen skal forsvinne fra innlegget og personlig Sparks-total.
  Rediger opp igjen: bonusen skal ikke gjenopprettes. Bytte av aktivitetstype
  eller flytting til en dato etter bonusdagen fjerner også bonusen.
- Korriger bare én av to slåtte rekorder. Bonusen skal gå fra 20 til 10 Sparks.
  Rediger verdien opp igjen: de fjernede 10 Sparks skal ikke gjenopprettes.
- Slett en aktivitet med bonus og kontroller at både minutter og bonus trekkes
  fra personlige Sparks. Gruppe- og lagmål skal bare miste aktivitetsminuttene.
- Registrer en PR for en kollega. Den private beskjeden skal inkludere bonusen
  i totalen og forklare tillegget. Hjelperen skal ikke få bonusen.

## Pustelag

- `/pust lag` åpner oversikten privat på både mobil og datamaskin.
- Opprett et lag fra fredag til søndag med standardmålet om at alle deltar.
  Kontroller datoer og mål på «Se over» før «Opprett». Ingen kanalpost sendes.
- Opprett ett lag for alle aktivitetstyper og ett for bare løping. Regelen skal
  vises i laglisten, status, «Se over» og delte kanalinnlegg. Bytt måltype i
  skjemaet og gå tilbake fra «Se over»: aktivitetsvalget skal beholdes.
- Registrer løping og styrke. Løpelaget skal bare telle løping i minutter,
  kilometer, antall aktiviteter og deltakelse. Det andre laget og kanalens
  status skal telle begge. Gjenta med både minuttmål og deltakelsesmål.
- Endre aktivitetstypen på en registrering. Lagets fremdrift skal følge den nye
  typen. En sen innmelding tar med tidligere aktiviteter som passer lagets regel.
- Endre lagets aktivitetstype før start. Etter start skal valget være låst.
  Eksisterende lag skal vise «Alle aktivitetstyper teller» og beholde tallene.
- Bytt mellom deltakelse og minutter i skjemaet. Navn og datoer beholdes, og
  riktig målfelt vises. Ugyldige datoer, prosent eller minutter avvises.
- Del status i `#pust`. En annen bruker kan åpne laget fra knappen og melde seg
  inn. Nytt klikk eller nytt forsøk skal ikke opprette dobbelt medlemskap.
- Kontroller at en sen innmelding tar med tidligere aktiviteter i perioden.
  En registrering gjort av en hjelper teller for deltakeren, ikke hjelperen.
- Med tre av tre deltakere skal en fjerde innmelding endre fremdriften til tre
  av fire, med mindre den nye personen allerede har aktivitet i perioden.
- 75 prosent av fem medlemmer krever fire deltakere. Minuttmålet endres ikke
  ved innmelding. Alle registrerte minutter som passer lagets regel teller.
- Forlat laget og bekreft dialogen. Bidraget forsvinner bare fra dette laget.
  Bli med igjen og bekreft at hele periodens aktiviteter teller igjen.
- Bli med på to lag med overlappende perioder. Aktiviteten bidrar til begge,
  men telles fortsatt bare én gang av `/pust status` og `/pust meg`.
- Rediger mål før start som oppretter. Andre brukere har ikke redigeringsknapp.
  En utfordring som har startet kan ikke endres via et tidligere åpnet skjema.
- Oppdater lagstatus etter endring eller sletting av en aktivitet. Tallene og
  aktivitetstypene skal endres riktig.
- Åpne avsluttede utfordringer. Innmelding, utmelding og redigering er låst,
  mens resultatet fortsatt kan korrigeres gjennom aktivitetsloggen.
- Tester med simulert klokke dekker start/slutt ved Oslo-midnatt og sommertid.
  Ikke endre produksjonsklokken for å prøve datoavgrensningene.
- Start boten på nytt og kontroller at lag, mål og medlemskap er bevart.

## Persistens

- Stopp med `docker compose down` uten `-v`.
- Start på nytt og bekreft at aktiviteter, Sparks og prestasjoner fortsatt finnes.
- Bekreft at `.env` ikke vises i `git status`.


## Ukearkiv på nett

- Aktiver `PUST_ARCHIVE_ENABLED` og kontroller logglinjen «Offentlig ukearkiv».
- Åpne forsiden uten innlogging på mobil og datamaskin. Ingen navn, kommentarer,
  individuelle aktivitetsrader eller opplastede bilder skal finnes der.
- Første oppstart importerer eldre uker én gang og merker dem som rekonstruert.
  Historiske mål og gruppestreak skal vises som ukjente.
- Kontroller forrige/neste uke, permanente lenker, årsgrupper og klikkbare søyler.
  Diagrammene skal slutte ved valgt uke og vise maksimalt åtte uker.
- Åpne tabellen under diagrammene med tastatur. Tall og rapportgrunnlag skal
  være lesbare uten farger eller peker. Ingen horisontal sidescrolling på mobil.
- Ved ordinær søndagspublisering skal Slack-lenken åpne rapporten med nøyaktig
  samme tall. En senere endring i aktivitetsloggen skal ikke endre rapporten.
- Tom uke gir en rapport med nulltall og ingen Slack-post.
- Ukjent uke gir 404 med lenke til arkivet. `robots.txt` og `X-Robots-Tag` ber
  søkemotorer om ikke å indeksere nettstedet.
- Automatiserte tester dekker feil i Slack, nedetid, forsinket arkivskriving,
  omstart, uforanderlige rapporter og backup. Ikke endre produksjonsklokken.
- Stopp og start boten igjen. Rapportene og merkingene skal være bevart.

## Ukesmål for Pust-voktere

- `/pust admin` avviser en bruker utenfor `PUST_ADMIN_USER_IDS` privat.
- En Pust-vokter ser gjeldende mål og tre felt. Ingen horisontal scrolling på mobil.
- Lagre nye mål for neste mandag. Denne ukens status og historiske rapporter endres ikke.
- «Planlagte mål» viser bare siste beslutning per startuke. «Historikk» viser også erstattede beslutninger og hvem som lagret dem.
- To åpne skjemaer kan ikke overskrive hverandre; det eldste må åpnes på nytt.
- Etter omstart beholdes lagrede mål selv om miljøets startverdier endres.
- Automatiserte tester dekker ukegrensen i Oslo og streak over uker med ulike mål. Ikke endre produksjonsklokken.

## Kilometer i Pustelag

- Velg «Kilometer sammen», sett 12,5 km og velg bare gåtur. Valget beholdes gjennom oppsummering og lagring.
- Bare registrerte gangkilometer teller. Sykling og økter uten distanse øker ikke distansetallet.
- Kilometer oppdateres ved redigering, sletting, innmelding og utmelding. Målet står fast.
- Del status på mobil. Kanalinnlegget er kort; aktivitetstotalene vises under «Se Pustelag».
- Kontroller et eksisterende lag etter migreringen. Medlemmer, aktivitetsfilter og mål er bevart.

## Invitasjoner på mobil

- `/pust inviter` viser fem invitasjoner per side. Opprett en invitasjon med kort tittel og møtested.
- Kanalinnlegget viser tittel, tid, varighet, sted og arrangør, med «Blir med», «Kanskje» og «Detaljer».
- Test i Slack på telefon. Knappene er lesbare og eventuell linjebryting fungerer. Beskrivelse og deltakerliste åpnes separat.
- Svar med to brukere og endre svar til «Kan ikke». Ingen aktiviteter eller Sparks opprettes ved påmelding.
- Bare arrangøren kan redigere og avlyse før start. Endringer oppdaterer samme kanalinnlegg.
- Endret tid eller sted setter andre deltakere til «Kanskje». Et gammelt RSVP-trykk avvises til detaljene åpnes på nytt.
- Etter slutt får bare «Blir med»-deltakere én privat loggpåminnelse. «Kanskje» og avmeldte får ingen.
- «Logg aktivitet» har riktig person, dato, type og varighet. Distanse er tom. Avbryt skjemaet og kontroller at ingenting logges.
- Bekreft skjemaet og kontroller at vanlig registrering, Sparks og personlige rekorder fungerer.
- Avlys en annen invitasjon. Innlegget merkes avlyst, påmelding stenges og loggpåminnelse uteblir.
- Tester dekker duplikate innsendelser, omstart, klokkeomstilling og Slack-feil. Ved usikker publisering beholdes invitasjonen uten automatisk nytt sendeforsøk.
