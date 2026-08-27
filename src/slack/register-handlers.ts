import type { App } from "@slack/bolt";
import { isActivityType, validateActivity, type ActivityInput } from "../domain/activity.js";
import type { ActivityRepository } from "../storage/activity-repository.js";
import { calculateWeeklyProgress } from "../domain/weekly-progress.js";
import { osloWeek } from "../domain/week.js";
import { activityMessage } from "./activity-message.js";
import { activityModal, LOG_ACTIVITY_CALLBACK_ID } from "./activity-modal.js";
import { groupStatusMessage, personalStatusMessage } from "./progress-messages.js";

function osloDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface HandlerDependencies {
  repository: ActivityRepository;
  pustChannelId: string;
  groupMemberCount: number;
  weeklyParticipantGoal: number;
  weeklyMinutesGoal: number;
}

export function registerSlackHandlers(app: App, dependencies: HandlerDependencies): void {
  app.command("/pust", async ({ ack, command, client, respond }) => {
    await ack();

    const subcommand = command.text.trim().toLocaleLowerCase("nb-NO");
    if (subcommand === "" || subcommand === "logg") {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: activityModal(command.user_id, osloDate()),
      });
      return;
    }

    if (subcommand === "status") {
      const range = osloWeek();
      const progress = calculateWeeklyProgress(
        dependencies.repository.listBetween(range.start, range.end),
      );
      await respond({
        response_type: "in_channel",
        text: groupStatusMessage({
          progress,
          range,
          memberCount: dependencies.groupMemberCount,
          participantGoal: dependencies.weeklyParticipantGoal,
          minutesGoal: dependencies.weeklyMinutesGoal,
        }),
      });
      return;
    }

    if (subcommand === "meg") {
      await respond({
        response_type: "ephemeral",
        text: personalStatusMessage(
          dependencies.repository.totalSparksForParticipant(command.user_id),
        ),
      });
      return;
    }

    await respond({
      response_type: "ephemeral",
      text: "🌬️ Bruk `/pust logg` for å registrere aktivitet. Flere valg kommer snart.",
    });
  });

  app.view(LOG_ACTIVITY_CALLBACK_ID, async ({ ack, body, view, client, logger }) => {
    const values = view.state.values;
    const typeValue = values.activity_type?.value?.selected_option?.value ?? "";
    const minutes = Number(values.minutes?.value?.value);
    const distanceValue = values.distance?.value?.value;

    if (!isActivityType(typeValue)) {
      await ack({ response_action: "errors", errors: { activity_type: "Velg en aktivitet." } });
      return;
    }

    const input: ActivityInput = {
      participantSlackId: values.participant?.value?.selected_user ?? "",
      registeredBySlackId: body.user.id,
      type: typeValue,
      minutes,
      ...(distanceValue ? { distanceKm: Number(distanceValue) } : {}),
      ...(values.comment?.value?.value ? { comment: values.comment.value.value.trim() } : {}),
      activityDate: values.activity_date?.value?.selected_date ?? "",
    };
    const errors = validateActivity(input);

    if (errors.length > 0) {
      await ack({ response_action: "errors", errors: { minutes: errors.join(" ") } });
      return;
    }

    await ack();
    const activity = dependencies.repository.create(input);

    try {
      await client.chat.postMessage({
        channel: dependencies.pustChannelId,
        text: activityMessage(activity),
      });

      if (activity.participantSlackId !== activity.registeredBySlackId) {
        await client.chat.postMessage({
          channel: activity.participantSlackId,
          text: `<@${activity.registeredBySlackId}> registrerte ${activity.minutes} minutter aktivitet for deg i #pust. Aktiviteten ga deg ${activity.minutes} Sparks.`,
        });
      }
    } catch (error) {
      logger.error("Aktiviteten ble lagret, men Slack-meldingen feilet", error);
    }
  });
}
