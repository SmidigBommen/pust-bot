# Slack-testplan for Pust

Bruk denne sjekklisten i `#pust` før en ny versjon regnes som klar.

## Oppstart

- Kjør `docker compose up --build`.
- Bekreft at loggen viser `Pust er i gang` uten token- eller Socket Mode-feil.
- Bekreft at boten bare brukes i `#pust`.

## Kommandoer

- `/pust hjelp` viser alle tilgjengelige kommandoer privat.
- En ukjent kommando viser hjelp uten å poste i kanalen.
- `/pust status` poster ukens deltakere, minutter, kilometer og gruppestreak.
- `/pust meg` viser personlige Sparks, nivå, streak og prestasjoner privat.

## Registrering

- `/pust logg` åpner modal med dagens dato og innlogget bruker valgt.
- Aktivitet under 10 minutter avvises.
- Aktivitet uten distanse og kommentar kan lagres.
- Aktivitet med desimaldistanse og kommentar kan lagres.
- Kanalinnlegget viser riktig aktivitet, minutter, kilometer og Sparks.
- Registrering for en kollega viser hjelperen og sender kollegaen en privat melding.
- Første registrering låser opp `Første pust` én gang, ikke ved hver aktivitet.

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

## Persistens

- Stopp med `docker compose down` uten `-v`.
- Start på nytt og bekreft at aktiviteter, Sparks og prestasjoner fortsatt finnes.
- Bekreft at `.env` ikke vises i `git status`.

