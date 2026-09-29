import type { Button, InputBlock, KnownBlock, ModalView, PlainTextElement } from "@slack/types";
import type { ViewOutput } from "@slack/bolt";
import { teamProgress, type TeamChallenge, type TeamInput } from "../domain/team-challenge.js";
import type { Activity } from "../domain/activity.js";
import { activitySummary } from "./activity-summary.js";

const plain = (text: string): PlainTextElement => ({ type: "plain_text", text });
const section = (text: string): KnownBlock => ({ type: "section", text: { type: "mrkdwn", text } });
const button = (text: string, action_id: string, value: string): Button => ({ type: "button", text: plain(text), action_id, value });
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const date = (value: string) => value.split("-").reverse().join(".");

export interface TeamFormMetadata { id?: string; revision?: number; requestId: string }
export interface TeamConfirmation extends TeamFormMetadata { input: TeamInput }

export function goalText(input: TeamInput): string {
  if (input.goal.kind === "minutes") return `${input.goal.target} minutter sammen i hele perioden`;
  return input.goal.target === 100 ? "Alle registrerer minst én aktivitet i perioden"
    : `${input.goal.target} % av medlemmene registrerer minst én aktivitet i perioden`;
}

export function teamStatusText(team: TeamChallenge, activities: readonly Activity[], today: string): string {
  const status = teamProgress(team, activities, today);
  const state = status.phase === "upcoming" ? "Starter snart" : status.phase === "closed" ? "Avsluttet" : "Pågår";
  const result = status.phase === "upcoming" ? "Aktiviteter teller fra startdatoen."
    : team.memberIds.length < 2 ? "Laget trenger minst to medlemmer for å nå målet."
    : status.phase === "closed" ? (status.reached ? "🎉 *Målet er nådd sammen!*" : "Takk for bevegelsen dere fikk til sammen!")
    : status.reached ? "Målet er nådd med dagens medlemsliste. Resultatet vises når perioden er over."
    : "Hver aktivitet fra 10 minutter bidrar.";
  return [
    `🌬️ *${escape(team.name)}*`,
    `${date(team.startDate)}–${date(team.endDate)} · ${state}`,
    `*Mål:* ${goalText(team)}`,
    team.goal.kind === "minutes" ? `⚡ *${status.value}/${status.target} minutter*`
      : `👥 *${status.value}/${team.memberIds.length} har deltatt* · målet er ${status.target} ${status.target === 1 ? "person" : "personer"}`,
    `${team.memberIds.length} medlemmer`,
    ...activitySummary(status.progress, "I perioden", "Aktiviteter i perioden"),
    "", result,
  ].join("\n");
}

export function teamListView(teams: TeamChallenge[], viewer: string, closed: boolean, page: number, hasMore: boolean, notice?: string): ModalView {
  const blocks: KnownBlock[] = [
    section("*Pustelag*\nVelg et lag eller opprett en utfordring. Logg som vanlig med `/pust logg`. Du kan være med på flere lag."),
    { type: "actions", elements: [button("Opprett lag", "pust_team_create", "new"),
      button(closed ? "Åpne utfordringer" : "Avsluttede utfordringer", "pust_team_list", `${!closed}:0`)] },
  ];
  if (notice) blocks.push(section(escape(notice)));
  if (!teams.length) blocks.push(section(closed ? "Ingen avsluttede utfordringer ennå." : "Ingen åpne utfordringer ennå. Opprett det første laget!"));
  for (const team of teams) blocks.push({
    type: "section", text: { type: "mrkdwn", text: `*${escape(team.name)}*${team.memberIds.includes(viewer) ? " · Du er med" : ""}\n${date(team.startDate)}–${date(team.endDate)} · ${team.memberIds.length} medlemmer\n${goalText(team)}` },
    accessory: button("Se lag", "pust_team_open", team.id),
  });
  const navigation: Button[] = [];
  if (page > 0) navigation.push(button("Forrige", "pust_team_list", `${closed}:${page - 1}`));
  if (hasMore) navigation.push(button("Neste", "pust_team_list", `${closed}:${page + 1}`));
  for (const item of navigation) blocks.push({ type: "actions", elements: [item] });
  return { type: "modal", title: plain("Pustelag"), close: plain("Lukk"), blocks };
}

export function teamDetailView(team: TeamChallenge, activities: readonly Activity[], viewer: string, today: string, notice?: string): ModalView {
  const blocks: KnownBlock[] = [section(teamStatusText(team, activities, today))];
  blocks.push(section(`*Medlemmer*\n${team.memberIds.length ? team.memberIds.slice(0, 50).map(id => `<@${id}>`).join(", ") : "Ingen medlemmer akkurat nå."}${team.memberIds.length > 50 ? ` og ${team.memberIds.length - 50} til` : ""}`));
  if (notice) blocks.push(section(escape(notice)));
  const elements = [button("Oppdater", "pust_team_open", team.id), button("Alle lag", "pust_team_list", "false:0")];
  if (today <= team.endDate) {
    const joined = team.memberIds.includes(viewer);
    const membership = button(joined ? "Forlat laget" : "Bli med", joined ? "pust_team_leave" : "pust_team_join", team.id);
    if (joined) membership.confirm = { title: plain("Forlate laget?"), text: plain("Dine aktiviteter tas ut av lagets fremdrift. De beholdes i din egen og kanalens status."), confirm: plain("Forlat"), deny: plain("Avbryt") };
    elements.push(membership);
  }
  if (viewer === team.creatorId && today < team.startDate) elements.push(button("Rediger", "pust_team_edit", team.id));
  elements.push(button("Del status i #pust", "pust_team_share", team.id));
  blocks.push({ type: "actions", elements });
  blocks.push(section(today <= team.endDate
    ? "Alle på laget bidrar med aktivitet fra hele perioden, også fra før de ble med. Ved inn- og utmelding endres lagets fremdrift. Deltakelsesmålet følger medlemslisten og rundes opp."
    : "Medlemslisten er låst. Etterregistrering, redigering og sletting av aktiviteter kan fortsatt oppdatere tallene."));
  return { type: "modal", title: plain("Pustelag"), close: plain("Lukk"), private_metadata: team.id, blocks };
}

export function teamFormView(metadata: TeamFormMetadata, input: TeamInput): ModalView {
  const kind = input.goal.kind;
  const inputBlock = (block_id: string, label: string, element: InputBlock["element"]): InputBlock => ({ type: "input", block_id, label: plain(label), element });
  const options = [
    { text: plain("Deltakelse"), value: "participation" }, { text: plain("Minutter sammen"), value: "minutes" },
  ];
  return {
    type: "modal", callback_id: "pust_team_form", private_metadata: JSON.stringify(metadata),
    title: plain(metadata.id ? "Rediger Pustelag" : "Opprett Pustelag"), submit: plain("Se over"), close: plain("Avbryt"),
    blocks: [
      inputBlock("name", "Lagnavn", { type: "plain_text_input", action_id: "value", max_length: 80, ...(input.name ? { initial_value: input.name } : {}) }),
      inputBlock("start", "Startdato (Oslo)", { type: "datepicker", action_id: "value", initial_date: input.startDate }),
      inputBlock("end", "Sluttdato (inkludert, Oslo)", { type: "datepicker", action_id: "value", initial_date: input.endDate }),
      { ...inputBlock("goal", "Felles mål for hele perioden", { type: "static_select", action_id: "pust_team_goal", options, initial_option: options[kind === "minutes" ? 1 : 0]! }), dispatch_action: true },
      inputBlock(kind, kind === "minutes" ? "Antall minutter sammen" : "Andel som deltar i prosent (100 = alle)", {
        type: "number_input", action_id: "value", is_decimal_allowed: false, min_value: "1",
        ...(kind === "participation" ? { max_value: "100" } : {}), initial_value: String(input.goal.target),
      }),
      section("Én aktivitet fra 10 minutter er nok til å delta. Målet gjelder hele perioden uten ukentlige nullstillinger. Mål og datoer låses på startdatoen. Laget trenger minst to medlemmer for å nå målet."),
    ],
  };
}

export function parseTeamInput(state: ViewOutput["state"]): TeamInput {
  const values = state.values;
  const kind = values.goal?.pust_team_goal?.selected_option?.value;
  return {
    name: values.name?.value?.value ?? "",
    startDate: values.start?.value?.selected_date ?? "",
    endDate: values.end?.value?.selected_date ?? "",
    goal: { kind: kind as TeamInput["goal"]["kind"], target: Number(kind ? values[kind]?.value?.value : NaN) },
  };
}

export function teamConfirmView(data: TeamConfirmation): ModalView {
  return {
    type: "modal", callback_id: "pust_team_confirm", private_metadata: JSON.stringify(data),
    title: plain("Se over utfordringen"), submit: plain(data.id ? "Lagre" : "Opprett"), close: plain("Avbryt"),
    blocks: [
      section(`*${escape(data.input.name)}*\n${date(data.input.startDate)}–${date(data.input.endDate)}\n\n*${goalText(data.input)}*`),
      section("Innmelding er åpen til og med sluttdatoen. Hele periodens aktiviteter teller for nåværende medlemmer. Deltakelsesmålet følger medlemslisten, også ved sen innmelding."),
      section(data.id ? "Endringen gjelder hele utfordringen." : "Du blir selv med på laget når du oppretter det. Andre blir med via `/pust lag`."),
      { type: "actions", elements: [button("Tilbake til skjemaet", "pust_team_revise", "back")] },
    ],
  };
}
