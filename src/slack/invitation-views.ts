import type { ViewOutput } from "@slack/bolt";
import type { KnownBlock, ModalView } from "@slack/types";
import { activityLabels, activityTypes, type ActivityType } from "../domain/activity.js";
import type { Invitation, InvitationInput } from "../domain/invitation.js";
import { activityEmoji } from "./activity-message.js";
import { plain, section, input, button, escape, shortDate } from "./compact-ui.js";

export interface InvitationMetadata { id?: string; revision?: number; requestId: string }
export const invitationValue = (invitation: Invitation): string => `${invitation.id}:${invitation.revision}`;

export function invitationText(invitation: Invitation): string {
  return [
    `${activityEmoji[invitation.activityType]} *${escape(invitation.title)}*${invitation.cancelled ? " · Avlyst" : invitation.revision > 0 ? " · Oppdatert" : ""}`,
    `${shortDate(invitation.date)} kl. ${invitation.time} · ${invitation.minutes} min · Oslo-tid`,
    `📍 ${escape(invitation.place)}`,
    `Arrangør: <@${invitation.creatorId}>`,
  ].join("\n");
}

export function invitationPost(invitation: Invitation, now: Date): { text: string; blocks: KnownBlock[] } {
  const text = invitationText(invitation);
  const open = button("Detaljer", "pust_invite_open", invitation.id);
  const active = !invitation.cancelled && now.toISOString() < invitation.startsAt;
  return { text, blocks: [section(text), { type: "actions", elements: active
    ? [button("Blir med", "pust_invite_going", invitationValue(invitation)), button("Kanskje", "pust_invite_maybe", invitationValue(invitation)), open] : [open] }] };
}

export function invitationForm(metadata: InvitationMetadata, draft: InvitationInput): ModalView {
  const options = activityTypes.map(value => ({ text: plain(`${activityEmoji[value]} ${activityLabels[value]}`), value }));
  return {
    type: "modal", callback_id: "pust_invite_save", title: plain(metadata.id ? "Rediger invitasjon" : "Inviter til aktivitet"),
    submit: plain(metadata.id ? "Lagre" : "Inviter i #pust"), close: plain("Avbryt"), private_metadata: JSON.stringify(metadata),
    blocks: [
      input("title", "Tittel", { type: "plain_text_input", action_id: "value", max_length: 60, ...(draft.title ? { initial_value: draft.title } : {}) }),
      input("activity_type", "Aktivitet", { type: "static_select", action_id: "value", options, initial_option: options.find(option => option.value === draft.activityType)! }),
      input("date", "Dato", { type: "datepicker", action_id: "value", initial_date: draft.date }),
      input("time", "Klokkeslett (Oslo)", { type: "timepicker", action_id: "value", initial_time: draft.time }),
      input("minutes", "Varighet (min)", { type: "number_input", action_id: "value", is_decimal_allowed: false, min_value: "10", max_value: "720", initial_value: String(draft.minutes) }),
      input("place", "Møtested eller lenke", { type: "plain_text_input", action_id: "value", max_length: 100, ...(draft.place ? { initial_value: draft.place } : {}) }),
      input("description", "Kort beskrivelse", { type: "plain_text_input", action_id: "value", max_length: 280, ...(draft.description ? { initial_value: draft.description } : {}) }, true),
      section(metadata.id
        ? "Endret tid, sted eller aktivitet setter andres svar til Kanskje. De må bekrefte på nytt."
        : "Du blir påmeldt. Påmeldte får én privat loggpåminnelse etterpå. Ingen aktivitet logges automatisk."),
    ],
  };
}

export function parseInvitation(state: ViewOutput["state"]): InvitationInput {
  const values = state.values;
  return {
    title: values.title?.value?.value?.trim() ?? "", place: values.place?.value?.value?.trim() ?? "",
    description: values.description?.value?.value?.trim() ?? "",
    activityType: values.activity_type?.value?.selected_option?.value as ActivityType,
    date: values.date?.value?.selected_date ?? "", time: values.time?.value?.selected_time ?? "",
    minutes: Number(values.minutes?.value?.value),
  };
}

export function invitationDetail(invitation: Invitation, viewer: string, now: Date, notice?: string): ModalView {
  const blocks: KnownBlock[] = [section(invitationText(invitation))];
  if (notice) blocks.push(section(escape(notice)));
  if (invitation.description) blocks.push(section(escape(invitation.description)));
  const going = invitation.attendees.filter(a => a.response === "going");
  const maybe = invitation.attendees.filter(a => a.response === "maybe");
  blocks.push(section(`*${going.length} blir med · ${maybe.length} kanskje*`));
  const own = invitation.attendees.find(a => a.userId === viewer);
  const active = !invitation.cancelled && now.toISOString() < invitation.startsAt;
  if (active) {
    blocks.push(section(own ? `Ditt svar: ${own.response === "going" ? "Blir med" : "Kanskje"}` : "Du har ikke meldt deg på."));
    blocks.push({ type: "actions", elements: [button("Blir med", "pust_invite_going", invitationValue(invitation)), button("Kanskje", "pust_invite_maybe", invitationValue(invitation))] });
    if (own) blocks.push({ type: "actions", elements: [button("Kan ikke", "pust_invite_declined", invitationValue(invitation))] });
    blocks.push(section("Påmeldte får én privat loggpåminnelse etterpå."));
  }
  blocks.push({ type: "actions", elements: [button("Deltakere", "pust_invite_attendees", invitation.id), button("Alle invitasjoner", "pust_invite_list", "0")] });
  if (!invitation.cancelled && now.toISOString() >= invitation.endsAt) blocks.push({ type: "actions", elements: [button("Logg aktivitet", "pust_invite_log", invitation.id)] });
  if (active && viewer === invitation.creatorId) {
    const cancel = button("Avlys", "pust_invite_cancel", invitationValue(invitation));
    cancel.confirm = { title: plain("Avlyse aktiviteten?"), text: plain("Innlegget merkes avlyst og loggpåminnelsen stoppes."), confirm: plain("Avlys"), deny: plain("Tilbake") };
    blocks.push({ type: "actions", elements: [button("Rediger", "pust_invite_edit", invitation.id), cancel] });
  }
  if (viewer === invitation.creatorId && invitation.publication !== "sent") blocks.push(section(invitation.publication === "pending"
    ? "Invitasjonen er lagret. Publiserer i #pust."
    : "Publisering kunne ikke bekreftes. Kontroller #pust. Invitasjonen er tilgjengelig i /pust inviter."));
  return { type: "modal", title: plain("Invitasjon"), close: plain("Lukk"), blocks };
}

export function invitationList(invitations: Invitation[], hasMore: boolean, page: number, notice?: string): ModalView {
  const blocks: KnownBlock[] = [{ type: "actions", elements: [button("Ny invitasjon", "pust_invite_create", "new")] }];
  if (notice) blocks.push(section(escape(notice)));
  if (!invitations.length) blocks.push(section("Ingen kommende eller nylige invitasjoner."));
  for (const invitation of invitations) blocks.push({ ...section(`${activityEmoji[invitation.activityType]} *${escape(invitation.title)}*${invitation.cancelled ? " · Avlyst" : ""}\n${shortDate(invitation.date)} kl. ${invitation.time} · ${invitation.minutes} min`), accessory: button("Se", "pust_invite_open", invitation.id) });
  if (page > 0 || hasMore) blocks.push({ type: "actions", elements: [
    ...(page > 0 ? [button("Forrige", "pust_invite_list", String(page - 1))] : []),
    ...(hasMore ? [button("Neste", "pust_invite_list", String(page + 1))] : []),
  ] });
  return { type: "modal", title: plain("Invitasjoner"), close: plain("Lukk"), blocks };
}

export function invitationAttendees(invitation: Invitation): ModalView {
  const blocks: KnownBlock[] = [section(`*${escape(invitation.title)}*`)];
  for (const response of ["going", "maybe"] as const) {
    const attendees = invitation.attendees.filter(a => a.response === response);
    blocks.push(section(`*${response === "going" ? "Blir med" : "Kanskje"} · ${attendees.length}*`));
    // Each section remains below Slack's text limit, even for a larger channel.
    for (let i = 0; i < Math.min(attendees.length, 1000); i += 50) blocks.push(section(attendees.slice(i, i + 50).map(a => `<@${a.userId}>`).join(", ")));
  }
  return { type: "modal", title: plain("Deltakere"), close: plain("Tilbake"), blocks };
}
