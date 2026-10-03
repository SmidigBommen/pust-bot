import { randomUUID } from "node:crypto";
import type { App, BlockButtonAction, BlockStaticSelectAction } from "@slack/bolt";
import type { ModalView } from "@slack/types";
import { achievements } from "../domain/achievements.js";
import { TeamRuleError, validateTeam, type TeamInput } from "../domain/team-challenge.js";
import type { ActivityRepository } from "../storage/activity-repository.js";
import type { TeamRepository } from "../storage/team-repository.js";
import {
  parseTeamInput, teamConfirmView, teamDetailView, teamFormView, teamListView, teamStatusText,
  type TeamConfirmation, type TeamFormMetadata,
} from "./team-views.js";

interface Dependencies { teams: TeamRepository; repository: ActivityRepository; pustChannelId: string }

export function teamOverview(teams: TeamRepository, viewer: string, closed = false, page = 0, notice?: string): ModalView {
  const result = teams.list(closed, page);
  return teamListView(result.teams, viewer, closed, page, result.hasMore, notice);
}

export function registerTeamHandlers(app: App, { teams, repository, pustChannelId }: Dependencies): void {
  const detail = (id: string, viewer: string, notice?: string) => {
    const team = teams.find(id);
    if (!team) throw new TeamRuleError("Laget finnes ikke.");
    return teamDetailView(team, repository.listBetween(team.startDate, team.endDate), viewer, teams.today(), notice);
  };

  app.action<BlockButtonAction>(/^pust_team_(create|list|open|join|leave|edit|share|revise)$/, async ({ ack, body, action, client, logger }) => {
    await ack();
    const viewer = body.user.id;
    const id = action.value ?? "";
    let view: ModalView;
    try {
      switch (action.action_id) {
        case "pust_team_create":
          view = teamFormView({ requestId: randomUUID() }, {
            name: "", startDate: teams.today(), endDate: teams.today(), goal: { kind: "participation", target: 100 }, activityType: null,
          });
          break;
        case "pust_team_list": {
          const [closed, rawPage] = id.split(":");
          const page = Number(rawPage);
          view = teamOverview(teams, viewer, closed === "true", Number.isSafeInteger(page) && page >= 0 ? page : 0);
          break;
        }
        case "pust_team_revise": {
          const data = JSON.parse(body.view!.private_metadata) as TeamConfirmation;
          view = teamFormView(data, data.input);
          break;
        }
        case "pust_team_edit": {
          const team = teams.find(id);
          if (!team || team.creatorId !== viewer) throw new TeamRuleError("Bare den som opprettet laget kan endre utfordringen.");
          if (teams.today() >= team.startDate) throw new TeamRuleError("Utfordringen har startet. Aktivitetstype, mål og datoer er låst.");
          view = teamFormView({ id, revision: team.revision, requestId: randomUUID() }, team);
          break;
        }
        case "pust_team_join":
        case "pust_team_leave": {
          const join = action.action_id === "pust_team_join";
          teams.membership(id, viewer, join);
          view = detail(id, viewer, join ? "Du er med! Logg som vanlig med /pust logg." : "Du har forlatt laget.");
          break;
        }
        case "pust_team_share": {
          const team = teams.find(id);
          if (!team) throw new TeamRuleError("Laget finnes ikke.");
          const text = teamStatusText(team, repository.listBetween(team.startDate, team.endDate), teams.today());
          await client.chat.postMessage({ channel: pustChannelId, text,
            blocks: [
              { type: "section", text: { type: "mrkdwn", text } },
              { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Se Pustelag" }, action_id: "pust_team_open", value: id }] },
            ],
          });
          view = detail(id, viewer, "Status er delt i #pust.");
          break;
        }
        default: view = detail(id, viewer);
      }
    } catch (error) {
      if (!(error instanceof TeamRuleError)) logger.error("Pustelag-handlingen feilet", error);
      view = teamOverview(teams, viewer, false, 0, error instanceof TeamRuleError ? error.message : "Handlingen kunne ikke fullføres. Åpne laget og kontroller status før du prøver igjen.");
    }
    try {
      if (body.view) await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
      else await client.views.open({ trigger_id: body.trigger_id, view });
    } catch (error) { logger.error("Pustelag-visningen kunne ikke oppdateres", error); }
  });

  app.action<BlockStaticSelectAction>("pust_team_goal", async ({ ack, body, action, client, logger }) => {
    await ack();
    if (!body.view) return;
    try {
      const metadata = JSON.parse(body.view.private_metadata) as TeamFormMetadata;
      const draft = parseTeamInput(body.view.state);
      const kind = action.selected_option.value;
      if (kind !== "participation" && kind !== "minutes") return;
      const input: TeamInput = {
        ...draft, startDate: draft.startDate || teams.today(), endDate: draft.endDate || teams.today(),
        goal: { kind, target: kind === "participation" ? 100 : 300 },
      };
      await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: teamFormView(metadata, input) });
    } catch (error) { logger.error("Målvalget kunne ikke oppdateres", error); }
  });

  app.view("pust_team_form", async ({ ack, view, logger }) => {
    try {
      const input = parseTeamInput(view.state);
      validateTeam(input, teams.today());
      const metadata = JSON.parse(view.private_metadata) as TeamFormMetadata;
      await ack({ response_action: "update", view: teamConfirmView({ ...metadata, input }) });
    } catch (error) {
      if (!(error instanceof TeamRuleError)) logger.error("Pustelag-skjemaet feilet", error);
      await ack({ response_action: "errors", errors: {
        [error instanceof TeamRuleError ? error.field : "name"]: error instanceof TeamRuleError ? error.message : "Skjemaet kunne ikke leses. Åpne /pust lag på nytt.",
      } });
    }
  });

  app.view("pust_team_confirm", async ({ ack, body, view, logger }) => {
    let result: ModalView;
    try {
      const data = JSON.parse(view.private_metadata) as TeamConfirmation;
      // A review opened before this field was introduced still means all activities.
      data.input.activityType ??= null;
      const team = data.id
        ? teams.edit(data.id, body.user.id, data.revision!, data.input)
        : teams.create(data.input, body.user.id, data.requestId);
      let notice = data.id ? "Utfordringen er oppdatert." : "Laget er opprettet! Del status for å invitere flere.";
      if (!data.id) {
        try {
          if (repository.awardAchievement(body.user.id, "team_starter")) {
            notice += `\n🏅 Prestasjon låst opp: ${achievements.team_starter.name} — ${achievements.team_starter.description}.`;
          }
        } catch (error) {
          logger.error("Laget ble opprettet, men prestasjonen kunne ikke lagres", error);
        }
      }
      result = detail(team.id, body.user.id, notice);
    } catch (error) {
      if (!(error instanceof TeamRuleError)) logger.error("Lagring av Pustelag feilet", error);
      result = teamOverview(teams, body.user.id, false, 0, error instanceof TeamRuleError ? error.message : "Lagringen kunne ikke fullføres. Kontroller laglisten før du prøver igjen.");
    }
    await ack({ response_action: "update", view: result });
  });
}
