import type { ModalView } from "@slack/types";
import { activityLabels, type Activity } from "../domain/activity.js";

export const SELECT_EDIT_ACTIVITY_CALLBACK_ID = "pust_select_edit_activity";
export const EDIT_ACTIVITY_CALLBACK_ID = "pust_edit_activity";

export function selectEditActivityModal(activities: readonly Activity[]): ModalView {
  return {
    type: "modal",
    callback_id: SELECT_EDIT_ACTIVITY_CALLBACK_ID,
    title: { type: "plain_text", text: "Rediger aktivitet" },
    submit: { type: "plain_text", text: "Neste" },
    close: { type: "plain_text", text: "Avbryt" },
    blocks: [
      {
        type: "input",
        block_id: "activity",
        label: { type: "plain_text", text: "Dine nylige aktiviteter" },
        element: {
          type: "static_select",
          action_id: "value",
          placeholder: { type: "plain_text", text: "Velg aktivitet" },
          options: activities.map((activity) => ({
            text: { type: "plain_text", text: activityOptionLabel(activity) },
            value: activity.id,
          })),
        },
      },
    ],
  };
}

export function editActivityModal(activity: Activity): ModalView {
  const options = Object.entries(activityLabels).map(([value, text]) => ({
    text: { type: "plain_text" as const, text },
    value,
  }));
  const initialOption = options.find((option) => option.value === activity.type);

  return {
    type: "modal",
    callback_id: EDIT_ACTIVITY_CALLBACK_ID,
    private_metadata: activity.id,
    title: { type: "plain_text", text: "Rediger aktivitet" },
    submit: { type: "plain_text", text: "Lagre" },
    close: { type: "plain_text", text: "Avbryt" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `Aktiviteten tilhører <@${activity.participantSlackId}>.` },
      },
      {
        type: "input",
        block_id: "activity_type",
        label: { type: "plain_text", text: "Aktivitet" },
        element: {
          type: "static_select",
          action_id: "value",
          options,
          ...(initialOption ? { initial_option: initialOption } : {}),
        },
      },
      {
        type: "input",
        block_id: "minutes",
        label: { type: "plain_text", text: "Varighet i minutter" },
        element: {
          type: "number_input",
          action_id: "value",
          is_decimal_allowed: false,
          min_value: "10",
          initial_value: String(activity.minutes),
        },
      },
      {
        type: "input",
        block_id: "distance",
        optional: true,
        label: { type: "plain_text", text: "Distanse i kilometer (valgfritt)" },
        element: {
          type: "number_input",
          action_id: "value",
          is_decimal_allowed: true,
          min_value: "0.1",
          ...(activity.distanceKm === undefined
            ? {}
            : { initial_value: String(activity.distanceKm) }),
        },
      },
      {
        type: "input",
        block_id: "comment",
        optional: true,
        label: { type: "plain_text", text: "Kommentar (valgfritt)" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          max_length: 280,
          ...(activity.comment === undefined ? {} : { initial_value: activity.comment }),
        },
      },
      {
        type: "input",
        block_id: "activity_date",
        label: { type: "plain_text", text: "Dato" },
        element: {
          type: "datepicker",
          action_id: "value",
          initial_date: activity.activityDate,
        },
      },
    ],
  };
}

function activityOptionLabel(activity: Activity): string {
  return `${activity.activityDate} · ${activityLabels[activity.type]} · ${activity.minutes} min`.slice(0, 75);
}

