import { groupWeeklyStreak } from "../domain/streaks.js";
import type { DateRange } from "../domain/week.js";
import { calculateWeeklyProgress } from "../domain/weekly-progress.js";
import type { ActivityRepository } from "../storage/activity-repository.js";
import type { GroupStatusInput } from "./progress-messages.js";

export interface WeeklyStatusSettings {
  groupMemberCount: number;
  weeklyParticipantGoal: number;
  weeklyMinutesGoal: number;
}

export function buildWeeklyStatus(
  repository: Pick<ActivityRepository, "listThrough">,
  range: DateRange,
  settings: WeeklyStatusSettings,
): GroupStatusInput {
  const activities = repository.listThrough(range.end);
  const goals = {
    participantGoal: settings.weeklyParticipantGoal,
    minutesGoal: settings.weeklyMinutesGoal,
  };
  return {
    range,
    progress: calculateWeeklyProgress(activities.filter((activity) => activity.activityDate >= range.start)),
    memberCount: settings.groupMemberCount,
    ...goals,
    groupStreak: groupWeeklyStreak(activities, range, goals),
  };
}
