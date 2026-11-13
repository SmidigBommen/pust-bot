export function helpMessage(): string {
  return [
    "🌬️ *Pust hjelper Gnist å bygge bevegelsesglede sammen.*",
    "",
    "*Kommandoer*",
    "• `/pust logg` — registrer aktivitet for deg selv eller en kollega",
    "• `/pust status` — del ukens felles fremdrift i #pust",
    "• `/pust lag` — opprett eller bli med i et lag for alle aktivitetstyper eller én valgt type",
    "• `/pust meg` — se dine Sparks, nivå og personlige rekorder privat",
    "• `/pust rediger` — rediger en nylig aktivitet",
    "• `/pust slett` — slett en nylig aktivitet",
    "• `/pust hjelp` — vis denne hjelpen",
    "",
    "Når du logger for deg selv, får du også oppdatert personlig fremdrift privat i #pust.",
    "En ny registrering gir 10 Sparks per personlig rekord: lengste økt eller distanse. Slår du begge, får du 20 ekstra Sparks. Tidligere registreringer får ingen bonus i etterkant.",
    "",
    "Aktivitet fra 10 minutter gir én Spark per minutt. Det finnes ingen individuell toppliste—hver aktivitet styrker både deg og fellesskapet.",
  ].join("\n");
}
