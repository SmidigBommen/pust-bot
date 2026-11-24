import type { MessageSender } from "./slack/message-sender.js";
import type { InvitationRepository } from "./storage/invitation-repository.js";
import { button, escape, section } from "./slack/compact-ui.js";

interface Logger { error(message: string, error?: unknown): void }

/** Claim before sending: restarts and Slack timeouts cannot duplicate a private prompt. */
export async function sendInvitationFollowups(invitations: InvitationRepository, send: MessageSender, logger: Logger): Promise<void> {
  for (const due of invitations.dueFollowups()) {
    if (!invitations.claimFollowup(due.invitationId, due.userId)) continue;
    try {
      const invitation = invitations.require(due.invitationId);
      const text = `Var du med på *${escape(invitation.title)}*? Logg det du faktisk gjorde.`;
      await send(due.userId, text, [section(text), { type: "actions", elements: [button("Logg aktivitet", "pust_invite_log", invitation.id)] }]);
      invitations.finishFollowup(invitation.id, due.userId, "sent");
    } catch (error) {
      invitations.finishFollowup(due.invitationId, due.userId, "failed");
      logger.error("Loggpåminnelse feilet; sender ikke automatisk på nytt", error);
    }
  }
}

export function startInvitationFollowups(invitations: InvitationRepository, send: MessageSender, logger: Logger): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let active = Promise.resolve();
  const schedule = () => {
    timer = setTimeout(() => {
      active = sendInvitationFollowups(invitations, send, logger)
        .catch(error => logger.error("Kontroll av loggpåminnelser feilet", error))
        .finally(() => { if (!stopped) schedule(); });
    }, 60_000);
  };
  schedule();
  return async () => { stopped = true; clearTimeout(timer); await active; };
}
