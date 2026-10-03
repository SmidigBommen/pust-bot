import { earnedAchievements } from "../domain/achievements.js";
import { personalWeeklyStreak } from "../domain/streaks.js";
import { osloWeek, type DateRange } from "../domain/week.js";
import type { ActivityRepository } from "../storage/activity-repository.js";
import type { TeamRepository } from "../storage/team-repository.js";
import { personalStatusMessage } from "./progress-messages.js";

export function buildPersonalStatusMessage(
  repository: Pick<ActivityRepository, "listThrough" | "totalSparksForParticipant">,
  teams: Pick<TeamRepository, "hasCreatedTeam">,
  slackId: string,
  range: DateRange = osloWeek(),
): string {
  const activities = repository.listThrough(range.end);
  return personalStatusMessage(
    repository.totalSparksForParticipant(slackId),
    personalWeeklyStreak(activities, slackId, range),
    earnedAchievements(activities, slackId, range, teams.hasCreatedTeam(slackId)),
  );
}
