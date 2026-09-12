import type { ModalView } from "@slack/types";
import { activityLabels } from "../domain/activity.js";

export const LOG_ACTIVITY_CALLBACK_ID = "pust_log_activity";

export function activityModal(defaultParticipant: string, today: string): ModalView {
  return {
    type: "modal",
    callback_id: LOG_ACTIVITY_CALLBACK_ID,
    title: { type: "plain_text", text: "Registrer aktivitet" },
    submit: { type: "plain_text", text: "Tenn Sparks" },
    close: { type: "plain_text", text: "Avbryt" },
    blocks: [
      {
        type: "input",
        block_id: "participant",
        label: { type: "plain_text", text: "Hvem utførte aktiviteten?" },
        element: {
          type: "users_select",
          action_id: "value",
          initial_user: defaultParticipant,
        },
      },
      {
        type: "input",
        block_id: "activity_type",
        label: { type: "plain_text", text: "Aktivitet" },
        element: {
          type: "static_select",
          action_id: "value",
          options: Object.entries(activityLabels).map(([value, text]) => ({
            text: { type: "plain_text", text },
            value,
          })),
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
        },
      },
      {
        type: "input",
        block_id: "image",
        optional: true,
        label: { type: "plain_text", text: "Bilde fra aktiviteten (valgfritt)" },
        hint: { type: "plain_text", text: "Last opp ett JPG-, PNG- eller GIF-bilde. Det vises i #pust." },
        element: {
          type: "file_input",
          action_id: "value",
          filetypes: ["jpg", "jpeg", "png", "gif"],
          max_files: 1,
        },
      },
      {
        type: "input",
        block_id: "activity_date",
        label: { type: "plain_text", text: "Dato" },
        element: {
          type: "datepicker",
          action_id: "value",
          initial_date: today,
        },
      },
    ],
  };
}
