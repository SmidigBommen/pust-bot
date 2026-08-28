export function helpMessage(): string {
  return [
    "🌬️ *Pust hjelper Gnist å bygge bevegelsesglede sammen.*",
    "",
    "*Kommandoer*",
    "• `/pust logg` — registrer aktivitet for deg selv eller en kollega",
    "• `/pust status` — del ukens felles fremdrift i #pust",
    "• `/pust meg` — se dine Sparks og ditt nivå privat",
    "• `/pust rediger` — rediger en nylig aktivitet",
    "• `/pust slett` — slett en nylig aktivitet",
    "• `/pust hjelp` — vis denne hjelpen",
    "",
    "Aktivitet fra 10 minutter gir én Spark per minutt. Det finnes ingen individuell toppliste—hver aktivitet styrker både deg og fellesskapet.",
  ].join("\n");
}
