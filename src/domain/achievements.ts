import type { Activity } from "./activity.js";
import { personalWeeklyStreak } from "./streaks.js";
import type { DateRange } from "./week.js";

export const achievements = {
  first_breath: { name: "Første pust", description: "Registrerte sin første aktivitet" },
  new_trail: { name: "Ny sti", description: "Har prøvd tre ulike aktivitetstyper" },
  four_in_a_row: { name: "Fire på rad", description: "Har en personlig streak på fire uker" },
  helper: { name: "Medhjelper", description: "Har hjulpet en kollega med registrering" },
} as const;

export type AchievementKey = keyof typeof achievements;

export function earnedAchievements(
  activities: readonly Activity[],
  slackId: string,
  currentWeek: DateRange,
): AchievementKey[] {
  const ownActivities = activities.filter(
    (activity) => activity.participantSlackId === slackId,
  );
  const earned: AchievementKey[] = [];
  if (ownActivities.length > 0) earned.push("first_breath");
  if (new Set(ownActivities.map((activity) => activity.type)).size >= 3) earned.push("new_trail");
  if (personalWeeklyStreak(activities, slackId, currentWeek) >= 4) earned.push("four_in_a_row");
  if (
    activities.some(
      (activity) =>
        activity.registeredBySlackId === slackId && activity.participantSlackId !== slackId,
    )
  ) {
    earned.push("helper");
  }
  return earned;
}

