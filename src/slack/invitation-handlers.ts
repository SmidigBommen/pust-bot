import type { MessageSender } from "./message-sender.js";
import { randomUUID } from "node:crypto";
import type { App, BlockButtonAction } from "@slack/bolt";
import type { ModalView } from "@slack/types";
import { InvitationError, validateInvitation } from "../domain/invitation.js";
import { osloDate } from "../domain/week.js";
import type { InvitationRepository } from "../storage/invitation-repository.js";
import { activityModal } from "./activity-modal.js";
import { invitationAttendees, invitationDetail, invitationForm, invitationList, invitationPost, parseInvitation, type InvitationMetadata } from "./invitation-views.js";

export function invitationOverview(invitations: InvitationRepository, page = 0, notice?: string): ModalView {
  const result = invitations.list(page);
  return invitationList(result.invitations, result.hasMore, page, notice);
}

export function registerInvitationHandlers(app: App, invitations: InvitationRepository, channelId: string, send: MessageSender): void {
  // Keep updates to one channel post ordered. RSVP counts live in the detail modal.
  const updates = new Map<string, Promise<void>>();
  const syncPost = (id: string, client: App["client"]): Promise<void> => {
    const pending = (updates.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const current = invitations.require(id);
      if (current.messageTs) await client.chat.update({ channel: channelId, ts: current.messageTs, ...invitationPost(current, invitations.currentTime()) });
    });
    updates.set(id, pending);
    void pending.finally(() => { if (updates.get(id) === pending) updates.delete(id); }).catch(() => {});
    return pending;
  };

  app.action<BlockButtonAction>(/^pust_invite_(create|list|open|going|maybe|declined|edit|cancel|log|attendees)$/, async ({ ack, body, action, client, logger }) => {
    await ack();
    const viewer = body.user.id;
    const value = action.value ?? "";
    const [id = "", rawRevision] = value.split(":");
    let view: ModalView;
    let push = false;
    try {
      switch (action.action_id) {
        case "pust_invite_create":
          view = invitationForm({ requestId: randomUUID() }, { title: "", activityType: "walk_hike", date: osloDate(invitations.currentTime()), time: "12:00", minutes: 30, place: "", description: "" });
          break;
        case "pust_invite_list": {
          const page = Number(value);
          view = invitationOverview(invitations, Number.isSafeInteger(page) && page >= 0 ? page : 0);
          break;
        }
        case "pust_invite_edit": {
          const invitation = invitations.require(id);
          if (invitation.creatorId !== viewer || invitation.cancelled || invitations.currentTime().toISOString() >= invitation.startsAt) throw new InvitationError("Bare arrangøren kan redigere før start.");
          view = invitationForm({ id, revision: invitation.revision, requestId: randomUUID() }, invitation);
          break;
        }
        case "pust_invite_going":
        case "pust_invite_maybe":
        case "pust_invite_declined": {
          const response = action.action_id === "pust_invite_going" ? "going" : action.action_id === "pust_invite_maybe" ? "maybe" : "declined";
          const invitation = invitations.respond(id, viewer, response, Number(rawRevision));
          view = invitationDetail(invitation, viewer, invitations.currentTime(), response === "declined" ? "Du er meldt av." : "Svaret er lagret.");
          break;
        }
        case "pust_invite_cancel": {
          const invitation = invitations.cancel(id, viewer, Number(rawRevision));
          let notice = "Aktiviteten er avlyst.";
          try { await syncPost(id, client); }
          catch (error) { logger.error("Avlysning lagret, men kanalinnlegget kunne ikke oppdateres", error); notice += " Kanalinnlegget kunne ikke oppdateres."; }
          view = invitationDetail(invitation, viewer, invitations.currentTime(), notice);
          break;
        }
        case "pust_invite_log": {
          const invitation = invitations.require(id);
          if (invitation.cancelled || invitations.currentTime().toISOString() < invitation.endsAt) throw new InvitationError("Logging åpnes etter aktiviteten. Avlyste aktiviteter kan ikke logges her.");
          view = activityModal(viewer, invitation.date, { activityType: invitation.activityType, minutes: invitation.minutes });
          push = Boolean(body.view);
          break;
        }
        case "pust_invite_attendees":
          view = invitationAttendees(invitations.require(id));
          push = Boolean(body.view);
          break;
        default:
          view = invitationDetail(invitations.require(id), viewer, invitations.currentTime());
      }
    } catch (error) {
      if (!(error instanceof InvitationError)) logger.error("Invitasjonshandlingen feilet", error);
      view = invitationOverview(invitations, 0, error instanceof InvitationError ? error.message : "Kunne ikke fullføre. Åpne invitasjonen på nytt.");
    }
    try {
      if (push) await client.views.push({ trigger_id: body.trigger_id, view });
      else if (body.view) await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
      else await client.views.open({ trigger_id: body.trigger_id, view });
    } catch (error) { logger.error("Invitasjonsvisningen kunne ikke åpnes", error); }
  });

  app.view("pust_invite_save", async ({ ack, body, view, client, logger }) => {
    let id: string;
    let editing: boolean;
    try {
      const metadata = JSON.parse(view.private_metadata) as InvitationMetadata;
      const input = parseInvitation(view.state);
      validateInvitation(input, invitations.currentTime());
      const invitation = metadata.id
        ? invitations.edit(metadata.id, body.user.id, metadata.revision!, input)
        : invitations.create(input, body.user.id, metadata.requestId);
      id = invitation.id;
      editing = Boolean(metadata.id);
      await ack({ response_action: "update", view: invitationDetail(invitation, body.user.id, invitations.currentTime(), "Invitasjonen er lagret.") });
    } catch (error) {
      if (!(error instanceof InvitationError)) logger.error("Invitasjonen kunne ikke lagres", error);
      await ack({ response_action: "errors", errors: { [error instanceof InvitationError ? error.field : "title"]: error instanceof InvitationError ? error.message : "Kunne ikke lagre. Åpne /pust inviter på nytt." } });
      return;
    }
    let notice = editing ? "Invitasjonen er oppdatert." : "Invitasjonen er delt i #pust.";
    try {
      if (!editing && invitations.claimPublication(id)) {
        const post = invitationPost(invitations.require(id), invitations.currentTime());
        const ts = await send(channelId, post.text, post.blocks);
        invitations.finishPublication(id, ts);
      }
      await syncPost(id, client);
      if (invitations.require(id).publication !== "sent") notice = "Invitasjonen er lagret. Publisering kunne ikke bekreftes.";
    } catch (error) {
      if (!editing && invitations.require(id).publication === "attempted") invitations.finishPublication(id, null);
      logger.error("Invitasjonen er lagret, men Slack-innlegget kunne ikke oppdateres", error);
      notice = "Lagret, men kanalinnlegget kunne ikke bekreftes. Kontroller #pust.";
    }
    try { await client.views.update({ view_id: view.id, view: invitationDetail(invitations.require(id), body.user.id, invitations.currentTime(), notice) }); }
    catch (error) { logger.error("Invitasjonen er lagret, men skjemaet kunne ikke oppdateres", error); }
  });
}
