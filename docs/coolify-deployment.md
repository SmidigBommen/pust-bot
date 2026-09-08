# Deployere Pust med Coolify

Pust bruker Slack Socket Mode og kjører derfor som en bakgrunnsprosess. Serveren
trenger utgående HTTPS/WebSocket-tilgang til Slack på port 443, men Pust trenger
ikke et offentlig domene, en inngående port eller en reverse proxy-rute.

## Eksisterende ressurs og automatisk deploy

Verifisert 8. september 2026:

- Coolify: `https://coolify.smidigbommen.no`.
- Applikasjon: `pust-bot:main-todcnoob5xfedhjehtdiad4e`.
- UUID: `rp9shkdgtpcc10vccy5xyna5`.
- Repository: `SmidigBommen/pust-bot`, branch `main`.
- Build pack: Docker Compose, fil `/compose.coolify.yaml`.
- Ressursen kjører allerede med vedvarende data. Bruk denne ressursen ved deploy.

Auto Deploy er aktivert, og GitHub-signaturhemmeligheten er konfigurert i Coolify.
GitHub-webhooken er lagret med følgende oppsett:

- Repository → Settings → Webhooks → Add webhook.
- Payload URL: `https://coolify.smidigbommen.no/webhooks/source/github/events/manual`.
- Content type: `application/json`.
- Secret: samme signaturhemmelighet som i Coolify, aldri API-tokenet.
- Behold SSL-verifisering, velg bare push-hendelser og aktiver webhooken.
- Hvis denne URL-en allerede finnes som webhook, oppdater den eksisterende.

Kjør typesjekk og tester før push til `main`. Webhooken venter ikke på CI.
En vellykket verifisering krever en deployment for den pushede commit-en med
`is_webhook: true`, `is_api: false`, status `finished` og appstatus
`running:healthy`. Compose kontrollerer `/health` internt i containeren.
Slack-funksjonene verifiseres med Slack-testplanen.

API-tilgang fra denne Mac-en bruker `COOLIFY_API_TOKEN` fra et nytt interaktivt
zsh-login-shell. Tokenet skal ikke lagres i repoet. Bruk
`GET /api/v1/deployments/applications/rp9shkdgtpcc10vccy5xyna5?take=3` for å
finne jobben, og `GET /api/v1/deployments/{deployment_uuid}` for å følge den.
Ikke start en egen API-deploy for å verifisere webhooken.

Se [Coolifys webhook-guide](https://next.coolify.io/docs/applications/deployments/manual-webhooks).

## Forutsetninger

- En server med Docker og Coolify.
- Utgående tilgang til Slack på port 443.
- Korrekt systemtid på serveren.
- GitHub-repositoriet `SmidigBommen/pust-bot` tilgjengelig for Coolify.
- Slack-appen installert i riktig workspace.
- Gyldig bot-token, app-token og kanal-ID.

## Produksjonskonfigurasjon

Utviklingsfilen `compose.yaml` skal ikke brukes direkte i Coolify. Den monterer
kildekode og kjører utviklingsverktøy. Produksjon skal bruke en separat
`compose.coolify.yaml` som:

- Bygger `production`-steget i `Dockerfile`.
- Kjører den kompilerte appen med `npm start`.
- Ikke monterer kildekoden.
- Bruker et vedvarende volum for `/app/data`.
- Krever Slack-hemmelighetene før deploy starter.
- Starter containeren på nytt ved feil.
- Kjører nøyaktig én instans.

Produksjonsdefinisjonen ligger i `compose.coolify.yaml` og følger denne formen:

```yaml
services:
  app:
    build:
      context: .
      target: production
    environment:
      SLACK_BOT_TOKEN: ${SLACK_BOT_TOKEN:?}
      SLACK_APP_TOKEN: ${SLACK_APP_TOKEN:?}
      SLACK_PUST_CHANNEL_ID: ${SLACK_PUST_CHANNEL_ID:?}
      DATABASE_PATH: /app/data/pust.sqlite
      PUST_GROUP_MEMBER_COUNT: ${PUST_GROUP_MEMBER_COUNT:-14}
      PUST_WEEKLY_PARTICIPANT_GOAL: ${PUST_WEEKLY_PARTICIPANT_GOAL:-4}
      PUST_WEEKLY_MINUTES_GOAL: ${PUST_WEEKLY_MINUTES_GOAL:-240}
    volumes:
      - pust_data:/app/data
    restart: unless-stopped
    init: true

volumes:
  pust_data:
```

Produksjonsimaget oppretter `/app/data` med eierskap til den ikke-priviligerte
`node`-brukeren. Compose inneholder også en intern health check og kontrollert
stopptid. Health-endepunktet bindes bare til `127.0.0.1` inne i containeren og
eksponeres ikke offentlig.

## Publiser Git-repositoriet

De lokale commitene må pushes til GitHub før Coolify kan hente dem. For et privat
repository kobles Coolify til GitHub med enten:

- Coolify GitHub App, eller
- En GitHub deploy key.

Deploy skal følge `main`-branchen.

## Opprett ressursen i Coolify

1. Opprett eller velg prosjekt og produksjonsmiljø.
2. Legg til en ny ressurs fra GitHub-repositoriet.
3. Velg `main` som branch.
4. Velg Docker Compose som build pack.
5. Sett Compose location til `/compose.coolify.yaml`.
6. Ikke konfigurer domene eller offentlig port.
7. Behold én app-instans.

Pust skal ikke skaleres horisontalt mens den bruker SQLite. Flere samtidige
instanser kan behandle samme Slack-hendelse eller konkurrere om datalageret.

## Miljøvariabler i Coolify

Følgende lagres som runtime-variabler i Coolify, aldri i Git:

```text
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_PUST_CHANNEL_ID=C...
PUST_GROUP_MEMBER_COUNT=14
PUST_WEEKLY_PARTICIPANT_GOAL=4
PUST_WEEKLY_MINUTES_GOAL=240
```

Den lokale `.env`-filen skal ikke lastes opp. Den er ignorert av Git.

## Vedvarende lagring og backup

SQLite ligger i `/app/data/pust.sqlite`. Compose-volumet `pust_data` må bevares
ved deploy og omstart. Hvis volumet fjernes, forsvinner aktiviteter, Sparks,
streaks og registrerte prestasjoner.

Før pilotlansering skal det etableres regelmessig backup av volumet eller
SQLite-filen. En restore-prosedyre bør testes minst én gang. Deploy skal aldri
kjøres med `docker compose down -v` mot produksjonsmiljøet.

Opprett en konsistent og integritetskontrollert SQLite-backup med:

```bash
docker compose -f compose.coolify.yaml exec app npm run backup
```

Backupen lagres under `/app/data/backups` i det samme vedvarende volumet. For
katastrofesikring må denne katalogen i tillegg kopieres til ekstern lagring.

## Første deploy

1. Bygg produksjonsimaget lokalt.
2. Kjør automatiserte tester og typesjekk.
3. Push den validerte commit-en til GitHub.
4. Legg inn miljøvariablene i Coolify.
5. Deploy ressursen.
6. Kontroller Coolify-loggene for `Pust er i gang`.
7. Kjør `/pust hjelp`, `/pust logg`, `/pust meg` og `/pust status` i Slack.
8. Start containeren på nytt og bekreft at data fortsatt finnes.
9. Følg den komplette [Slack-testplanen](slack-testplan.md).

## Oppdateringer og rollback

- Deploy bare validerte commits fra `main`.
- Ta backup før databasemigrasjoner eller større versjonsendringer.
- Bruk Coolifys deployment-logg ved feil.
- Rull tilbake til forrige fungerende commit dersom ny versjon ikke starter.
- Ikke slett eller opprett `pust_data` på nytt under rollback.

## Referanser

- [Slack: Using Socket Mode](https://docs.slack.dev/tools/bolt-js/concepts/socket-mode)
- [Coolify: Docker Compose](https://coolify.io/docs/knowledge-base/docker/compose)
- [Coolify: Applications](https://coolify.io/docs/applications/index)
- [Coolify: Environment Variables](https://coolify.io/docs/knowledge-base/environment-variables)
- [Coolify: Persistent Storage](https://coolify.io/docs/knowledge-base/persistent-storage)
