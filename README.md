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

Bruk [Slack-testplanen](docs/slack-testplan.md) ved manuell verifisering av en ny
versjon.

Se [Coolify-runbooken](docs/coolify-deployment.md) for produksjonsoppsett,
hemmeligheter, vedvarende SQLite-lagring, backup og deploy-prosedyre.
