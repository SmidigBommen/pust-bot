import type { Activity } from "./activity.js";
import { calculateWeeklyProgress } from "./weekly-progress.js";
import { previousWeek, weekContaining, type DateRange } from "./week.js";

export function personalWeeklyStreak(
  activities: readonly Activity[],
  participantSlackId: string,
  currentWeek: DateRange,
): number {
  const activeWeeks = new Set(
    activities
      .filter((activity) => activity.participantSlackId === participantSlackId)
      .map((activity) => weekContaining(activity.activityDate).start),
  );
  let week = activeWeeks.has(currentWeek.start) ? currentWeek : previousWeek(currentWeek);
  let streak = 0;

  while (activeWeeks.has(week.start)) {
    streak += 1;
    week = previousWeek(week);
  }
  return streak;
}

interface GroupStreakGoals {
  participantGoal: number;
  minutesGoal: number;
}

export function groupWeeklyStreak(
  activities: readonly Activity[],
  currentWeek: DateRange,
  goals: GroupStreakGoals,
): number {
  const successful = (range: DateRange): boolean => {
    const progress = calculateWeeklyProgress(
      activities.filter(
        (activity) => activity.activityDate >= range.start && activity.activityDate <= range.end,
      ),
    );
    return (
      progress.participants >= goals.participantGoal &&
      progress.qualifyingMinutes >= goals.minutesGoal
    );
  };
  let week = successful(currentWeek) ? currentWeek : previousWeek(currentWeek);
  let streak = 0;

  while (successful(week)) {
    streak += 1;
    week = previousWeek(week);
  }
  return streak;
}

