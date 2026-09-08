import { activityLabels, sparksForActivity, type Activity } from "../domain/activity.js";

const activityEmoji: Record<Activity["type"], string> = {
  walk_hike: "🥾",
  run: "🏃",
  cycle: "🚴",
  strength: "🏋️",
  mobility: "🧘",
  team_sport: "🤾",
  ski: "⛷️",
  other: "⚡",
};

export function activityMessage(activity: Activity): string {
  const assisted = activity.participantSlackId !== activity.registeredBySlackId;
  const details = [`${activity.minutes} minutter`];
  if (activity.distanceKm !== undefined) details.push(`${formatDistance(activity.distanceKm)} km`);
  details.push(`⚡ *+${sparksForActivity(activity.minutes)} Sparks*`);
  if (activity.comment) details.push(`«${activity.comment.replace(/\s*\r?\n\s*/g, " ")}»`);
  if (assisted) details.push(`Registrert med hjelp fra <@${activity.registeredBySlackId}>`);

  return [
    `${activityEmoji[activity.type]} *<@${activity.participantSlackId}> har registrert ${activityLabels[activity.type].toLocaleLowerCase("nb-NO")}!*`,
    details.join(" · "),
  ].join("\n");
}

function formatDistance(distanceKm: number): string {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(distanceKm);
}
