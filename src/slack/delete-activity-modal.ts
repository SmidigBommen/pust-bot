import type { ModalView } from "@slack/types";
import { activityLabels, type Activity } from "../domain/activity.js";

export const DELETE_ACTIVITY_CALLBACK_ID = "pust_delete_activity";

export function deleteActivityModal(activities: readonly Activity[]): ModalView {
  return {
    type: "modal",
    callback_id: DELETE_ACTIVITY_CALLBACK_ID,
    title: { type: "plain_text", text: "Slett aktivitet" },
    submit: { type: "plain_text", text: "Slett" },
    close: { type: "plain_text", text: "Avbryt" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Velg aktiviteten som skal slettes. Sparks og gruppestatus beregnes på nytt automatisk.",
        },
      },
      {
        type: "input",
        block_id: "activity",
        label: { type: "plain_text", text: "Nylige aktiviteter" },
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

function activityOptionLabel(activity: Activity): string {
  const distance = activity.distanceKm === undefined ? "" : ` · ${activity.distanceKm} km`;
  return `${activity.activityDate} · ${activityLabels[activity.type]} · ${activity.minutes} min${distance}`.slice(
    0,
    75,
  );
}

