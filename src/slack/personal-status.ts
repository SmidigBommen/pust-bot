import { earnedAchievements } from "../domain/achievements.js";
import { personalWeeklyStreak } from "../domain/streaks.js";
import { osloDate, osloWeek, type DateRange } from "../domain/week.js";
import { personalRecords } from "../domain/personal-records.js";
import type { ActivityRepository } from "../storage/activity-repository.js";
import type { TeamRepository } from "../storage/team-repository.js";
import { personalStatusMessage } from "./progress-messages.js";
import { personalRecordsMessage } from "./personal-record-messages.js";

export function buildPersonalStatusMessage(
  repository: Pick<ActivityRepository, "listThrough" | "totalSparksForParticipant">,
  teams: Pick<TeamRepository, "hasCreatedTeam">,
  slackId: string,
  range: DateRange = osloWeek(),
): string {
  const activities = repository.listThrough(range.end);
  const progress = personalStatusMessage(
    repository.totalSparksForParticipant(slackId),
    personalWeeklyStreak(activities, slackId, range),
    earnedAchievements(activities, slackId, range, teams.hasCreatedTeam(slackId)),
  );
  const records = personalRecordsMessage(personalRecords(activities, slackId, osloDate()));
  return [progress, records].filter(Boolean).join("\n\n");
}
