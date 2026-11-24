import { randomUUID } from "node:crypto";
import type { App, BlockButtonAction } from "@slack/bolt";
import type { KnownBlock, ModalView } from "@slack/types";
import { GoalRuleError } from "../domain/weekly-goals.js";
import { previousWeek, weekContaining } from "../domain/week.js";
import type { WeeklyGoalRepository } from "../storage/weekly-goal-repository.js";
import { plain, section, input, button, shortDate, number } from "./compact-ui.js";

export function weeklyGoalView(goals: WeeklyGoalRepository): ModalView {
  const nextWeek = goals.nextWeek();
  const current = goals.forWeek(previousWeek(weekContaining(nextWeek)).start);
  const next = goals.forWeek(nextWeek);
  return {
    type: "modal", callback_id: "pust_goal_save", title: plain("Ukesmål"), submit: plain("Lagre"), close: plain("Lukk"),
    private_metadata: JSON.stringify({ revision: goals.revision(), requestId: randomUUID() }),
    blocks: [
      section(`*Denne uken* · ${current.participantGoal} deltakere · ${number(current.minutesGoal)} min\n*Neste uke* · ${next.participantGoal} deltakere · ${number(next.minutesGoal)} min`),
      input("effective", "Gjelder fra mandag", { type: "datepicker", action_id: "value", initial_date: nextWeek }),
      input("participants", "Deltakere", { type: "number_input", action_id: "value", is_decimal_allowed: false, min_value: "1", initial_value: String(next.participantGoal) }),
      input("minutes", "Minutter sammen", { type: "number_input", action_id: "value", is_decimal_allowed: false, min_value: "1", initial_value: String(next.minutesGoal) }),
      section("Gjelder fra valgt uke til neste planlagte endring. Tidligere uker beholder sine mål."),
      { type: "actions", elements: [button("Planlagte mål", "pust_goal_plan", "0"), button("Historikk", "pust_goal_history", "0")] },
    ],
  };
}

export function registerWeeklyGoalHandlers(app: App, goals: WeeklyGoalRepository): void {
  app.view("pust_goal_save", async ({ ack, body, view, logger }) => {
    try {
      const metadata = JSON.parse(view.private_metadata) as { revision: number; requestId: string };
      const values = view.state.values;
      const effective = values.effective?.value?.selected_date ?? "";
      goals.schedule(effective, { participantGoal: Number(values.participants?.value?.value), minutesGoal: Number(values.minutes?.value?.value) }, body.user.id, metadata.revision, metadata.requestId);
      await ack({ response_action: "update", view: {
        type: "modal", title: plain("Ukesmål lagret"), close: plain("Lukk"), blocks: [section(`Målene gjelder fra ${shortDate(effective)}.\nÅpne /pust admin for å se planen.`)],
      } });
    } catch (error) {
      if (!(error instanceof GoalRuleError)) logger.error("Lagring av ukesmål feilet", error);
      await ack({ response_action: "errors", errors: { [error instanceof GoalRuleError ? error.field : "effective"]: error instanceof GoalRuleError ? error.message : "Kunne ikke lagre. Åpne /pust admin på nytt." } });
    }
  });
  app.action<BlockButtonAction>(/^pust_goal_(history|plan)$/, async ({ ack, body, action, client, logger }) => {
    await ack();
    if (!goals.canManage(body.user.id)) return;
    try {
      const rawPage = Number(action.value);
      const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? rawPage : 0;
      const planned = action.action_id === "pust_goal_plan";
      const changes = planned ? goals.plan(page) : goals.history(page);
      const blocks: KnownBlock[] = changes.map(change => section(`*Fra ${shortDate(change.effectiveWeek)}* · ${change.participantGoal} deltakere · ${number(change.minutesGoal)} min\n<@${change.actorId}> · ${shortDate(change.changedAt.slice(0, 10))}`));
      if (!changes.length) blocks.push(section(planned ? "Ingen flere planlagte endringer." : "Ingen flere endringer."));
      if (!planned) blocks.unshift(section("Siste endring for samme startuke gjelder."));
      if (page > 0 || changes.length === 10) blocks.push({ type: "actions", elements: [
        ...(page > 0 ? [button("Forrige", action.action_id, String(page - 1))] : []),
        ...(changes.length === 10 ? [button("Neste", action.action_id, String(page + 1))] : []),
      ] });
      const view: ModalView = { type: "modal", title: plain(planned ? "Planlagte mål" : "Målhistorikk"), close: plain("Tilbake"), private_metadata: "goal-list", blocks };
      if (body.view?.private_metadata === "goal-list") await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
      else await client.views.push({ trigger_id: body.trigger_id, view });
    } catch (error) { logger.error("Målhistorikken kunne ikke åpnes", error); }
  });
}
