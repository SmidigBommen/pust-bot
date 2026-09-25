# Pust

Pust er en norskspråklig Slack-bot for treningsglede i Gnist. Den gjør det enkelt å
registrere aktivitet, bygger personlige spill-elementer og lar hele `#pust` jobbe
mot positive, inkluderende gruppemål.

Produktretning, MVP og videre utvikling er dokumentert i
[produktplanen](docs/produktplan.md).

## Lokal utvikling

Hele utviklingsmiljøet kjører i Docker. Node, npm-pakker og SQLite-data holdes i
containere og navngitte Docker-volumer.

```bash
cp .env.example .env
docker compose up --build
```

Kjør kvalitetssjekkene uten lokal Node-installasjon:

```bash
docker compose run --rm app npm test
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run build
```

Stopp appen med `docker compose down`. Ikke bruk `-v` med mindre også de lokalt
lagrede Pust-dataene med vilje skal slettes.

Slack-appen opprettes fra `slack-manifest.json`. Lokal kjøring bruker Socket Mode,
slik at det ikke kreves en offentlig HTTP-adresse.

## Bilder i aktivitetsinnlegg

`/pust logg` har et valgfritt felt for å laste opp ett nytt JPG-, PNG- eller
GIF-bilde. Bildet vises under aktivitetsteksten og eventuelle prestasjoner i
botens innlegg i `#pust`. Eksisterende Slack-filer kan ikke velges i skjemaet.

Bildet lagres i Slack. Pust laster ikke ned bildefilen og lagrer bare Slack-filens
ID i SQLite, slik at bildet beholdes når aktiviteten redigeres. Sletting av en
aktivitet fjerner bildet fra botens innlegg, men sletter ikke filen fra Slack.
Hvis Slack avviser bildet, postes aktiviteten uten bilde og brukeren får en
privat beskjed i kanalen.

Før denne versjonen deployes må en administrator legge til `files:read` under
Slack-appens **OAuth & Permissions → Bot Token Scopes** og reinstallere appen
i arbeidsområdet. Scopet er lagt til i `slack-manifest.json`, men en Git-push
oppdaterer ikke den installerte Slack-appens tillatelser. Behold de eksisterende
scopene. Hvis reinstallasjonen gir et nytt bot-token, oppdater
`SLACK_BOT_TOKEN` i Coolify før deploy.

Slack krever dette scopet for [filopplasting i modaler](https://docs.slack.dev/reference/block-kit/block-elements/file-input-element/).
Ingen kameraknapp eller valg av tidligere opplastede bilder inngår i denne versjonen.

## Automatisk ukessammendrag

`/pust status` og søndagssammendraget viser minutter per aktivitetstype, med
kilometer der distanse er registrert. Listen sorteres etter flest minutter.
To linjer oppsummerer antall aktiviteter og aktivitetstyper, og samlet tid
i timer og minutter samt registrert distanse. Alle minutter teller mot
ukesmålet, uten grense per person. Dette gjelder også beregning av gruppestreak
for tidligere uker, men endrer ikke allerede publiserte øyeblikksbilder.

Pust poster ukens status i `#pust` søndag kl. 22:00 i `Europe/Oslo`, med tittelen
«Ukens trening søndag kl. 22:00». Sammendraget bruker samme beregning som
`/pust status`, uten kanalvarsling. Uker uten registrert aktivitet hoppes over.
Innlegget beholdes som et øyeblikksbilde selv om aktiviteter senere registreres,
redigeres eller slettes. Manuelle statusinnlegg påvirker ikke utsendingen.

En timer i boten sjekker klokken ved hvert minutt, uten databaseoppslag før
sammendraget skal sendes. En allerede kjørende bot kan sende i løpet av minuttet
22:00:00–22:00:59. Hvis boten starter etter fristen, eller timeren blir forsinket
utover dette minuttet, blir det ingen ettersending.

Pust registrerer ett forsøk per kanal og uke i SQLite før den kontakter Slack.
Sendingen har ti sekunders timeout og ingen automatiske nye forsøk, heller ikke
ved ratebegrensning. Feil logges. Et avbrudd etter at forsøket er registrert kan
derfor føre til at ukens innlegg uteblir.

`PUST_WEEKLY_RECAP_ENABLED` må være `true` eller `false`. Standardverdien i appen
er `false`. `compose.yaml` slår funksjonen av for lokal utvikling, mens
`compose.coolify.yaml` aktiverer den som standard i produksjon. Sett variabelen
til `false` i Coolify og deploy på nytt for å slå av automatiske innlegg.

Bruk [Slack-testplanen](docs/slack-testplan.md) ved manuell verifisering av en ny
versjon.

Se [Coolify-runbooken](docs/coolify-deployment.md) for produksjonsoppsett,
hemmeligheter, vedvarende SQLite-lagring, backup og deploy-prosedyre.
