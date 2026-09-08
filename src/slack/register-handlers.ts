import type { App } from "@slack/bolt";
import { isActivityType, validateActivity, type ActivityInput } from "../domain/activity.js";
import type { ActivityRepository } from "../storage/activity-repository.js";
import { calculateWeeklyProgress } from "../domain/weekly-progress.js";
import { osloWeek } from "../domain/week.js";
import { groupWeeklyStreak, personalWeeklyStreak } from "../domain/streaks.js";
import { achievements, earnedAchievements } from "../domain/achievements.js";
import { activityMessage } from "./activity-message.js";
import { activityModal, LOG_ACTIVITY_CALLBACK_ID } from "./activity-modal.js";
import { groupStatusMessage, personalStatusMessage } from "./progress-messages.js";
import { helpMessage } from "./help-message.js";
import { deleteActivityModal, DELETE_ACTIVITY_CALLBACK_ID } from "./delete-activity-modal.js";
import {
  editActivityModal,
  EDIT_ACTIVITY_CALLBACK_ID,
  selectEditActivityModal,
  SELECT_EDIT_ACTIVITY_CALLBACK_ID,
} from "./edit-activity-modal.js";

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
      const allActivities = dependencies.repository.listThrough(range.end);
      const progress = calculateWeeklyProgress(
        allActivities.filter(
          (activity) => activity.activityDate >= range.start && activity.activityDate <= range.end,
        ),
      );
      await respond({
        response_type: "in_channel",
        text: groupStatusMessage({
          progress,
          range,
          memberCount: dependencies.groupMemberCount,
          participantGoal: dependencies.weeklyParticipantGoal,
          minutesGoal: dependencies.weeklyMinutesGoal,
          groupStreak: groupWeeklyStreak(allActivities, range, {
            participantGoal: dependencies.weeklyParticipantGoal,
            minutesGoal: dependencies.weeklyMinutesGoal,
          }),
        }),
      });
      return;
    }

    if (subcommand === "meg") {
      const range = osloWeek();
      const activities = dependencies.repository.listThrough(range.end);
      await respond({
        response_type: "ephemeral",
        text: personalStatusMessage(
          dependencies.repository.totalSparksForParticipant(command.user_id),
          personalWeeklyStreak(activities, command.user_id, range),
          earnedAchievements(activities, command.user_id, range),
        ),
      });
      return;
    }

    if (subcommand === "hjelp") {
      await respond({ response_type: "ephemeral", text: helpMessage() });
      return;
    }

    if (subcommand === "slett") {
      const activities = dependencies.repository.listRecentControlledBy(command.user_id);
      if (activities.length === 0) {
        await respond({
          response_type: "ephemeral",
          text: "Du har ingen aktiviteter som kan slettes ennå.",
        });
        return;
      }
      await client.views.open({
        trigger_id: command.trigger_id,
        view: deleteActivityModal(activities),
      });
      return;
    }

    if (subcommand === "rediger") {
      const activities = dependencies.repository.listRecentForParticipant(command.user_id);
      if (activities.length === 0) {
        await respond({
          response_type: "ephemeral",
          text: "Du har ingen aktiviteter som kan redigeres ennå.",
        });
        return;
      }
      await client.views.open({
        trigger_id: command.trigger_id,
        view: selectEditActivityModal(activities),
      });
      return;
    }

    await respond({
      response_type: "ephemeral",
      text: `Ukjent Pust-kommando.\n\n${helpMessage()}`,
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
    const range = osloWeek();
    const allActivities = dependencies.repository.listThrough(range.end);
    const achievementOwners = new Set([
      activity.participantSlackId,
      activity.registeredBySlackId,
    ]);
    const newAwards = [...achievementOwners].flatMap((slackId) =>
      earnedAchievements(allActivities, slackId, range)
        .filter((key) => dependencies.repository.awardAchievement(slackId, key))
        .map((key) => ({ slackId, key })),
    );
    const awardText = newAwards
      .map(
        ({ slackId, key }) =>
          `🏅 *Prestasjon låst opp: ${achievements[key].name}* for <@${slackId}> — ${achievements[key].description}.`,
      )
      .join("\n");

    try {
      const result = await client.chat.postMessage({
        channel: dependencies.pustChannelId,
        text: [activityMessage(activity), awardText].filter(Boolean).join("\n"),
      });
      if (result.ts) dependencies.repository.setSlackMessageTs(activity.id, result.ts);

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

  app.view(DELETE_ACTIVITY_CALLBACK_ID, async ({ ack, body, view, client, logger }) => {
    const activityId = view.state.values.activity?.value?.selected_option?.value;
    if (!activityId) {
      await ack({ response_action: "errors", errors: { activity: "Velg en aktivitet." } });
      return;
    }

    const activity = dependencies.repository.deleteControlledBy(activityId, body.user.id);
    if (!activity) {
      await ack({
        response_action: "errors",
        errors: { activity: "Aktiviteten finnes ikke, eller du kan ikke slette den." },
      });
      return;
    }

    await ack();
    try {
      if (activity.slackMessageTs) {
        await client.chat.update({
          channel: dependencies.pustChannelId,
          ts: activity.slackMessageTs,
          text: `🧹 Denne aktiviteten ble slettet av <@${body.user.id}>. Sparks og gruppestatus er oppdatert.`,
        });
      } else {
        await client.chat.postMessage({
          channel: dependencies.pustChannelId,
          text: `🧹 <@${body.user.id}> slettet en aktivitet. Sparks og gruppestatus er oppdatert.`,
        });
      }
    } catch (error) {
      logger.error("Aktiviteten ble slettet, men Slack-meldingen kunne ikke oppdateres", error);
    }
  });

  app.view(SELECT_EDIT_ACTIVITY_CALLBACK_ID, async ({ ack, body, view }) => {
    const activityId = view.state.values.activity?.value?.selected_option?.value;
    const activity = activityId ? dependencies.repository.findById(activityId) : null;
    if (!activity || activity.participantSlackId !== body.user.id) {
      await ack({
        response_action: "errors",
        errors: { activity: "Aktiviteten finnes ikke, eller du kan ikke redigere den." },
      });
      return;
    }
    await ack({ response_action: "update", view: editActivityModal(activity) });
  });

  app.view(EDIT_ACTIVITY_CALLBACK_ID, async ({ ack, body, view, client, logger }) => {
    const activityId = view.private_metadata;
    const existing = dependencies.repository.findById(activityId);
    const values = view.state.values;
    const typeValue = values.activity_type?.value?.selected_option?.value ?? "";
    const distanceValue = values.distance?.value?.value;

    if (!existing || existing.participantSlackId !== body.user.id || !isActivityType(typeValue)) {
      await ack({
        response_action: "errors",
        errors: { activity_type: "Aktiviteten finnes ikke, eller verdiene er ugyldige." },
      });
      return;
    }

    const input: ActivityInput = {
      participantSlackId: existing.participantSlackId,
      registeredBySlackId: existing.registeredBySlackId,
      type: typeValue,
      minutes: Number(values.minutes?.value?.value),
      ...(distanceValue ? { distanceKm: Number(distanceValue) } : {}),
      ...(values.comment?.value?.value ? { comment: values.comment.value.value.trim() } : {}),
      activityDate: values.activity_date?.value?.selected_date ?? "",
    };
    const errors = validateActivity(input);
    if (errors.length > 0) {
      await ack({ response_action: "errors", errors: { minutes: errors.join(" ") } });
      return;
    }

    const updated = dependencies.repository.updateForParticipant(activityId, body.user.id, input);
    if (!updated) {
      await ack({ response_action: "errors", errors: { minutes: "Aktiviteten kunne ikke lagres." } });
      return;
    }
    await ack();

    try {
      if (updated.slackMessageTs) {
        await client.chat.update({
          channel: dependencies.pustChannelId,
          ts: updated.slackMessageTs,
          text: `${activityMessage(updated)} · _Redigert av <@${body.user.id}>_`,
        });
      }
    } catch (error) {
      logger.error("Aktiviteten ble redigert, men Slack-meldingen kunne ikke oppdateres", error);
    }
  });
}
