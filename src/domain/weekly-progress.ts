import { activityTypes, type Activity, type ActivityType } from "./activity.js";

export interface ActivityTypeProgress {
  type: ActivityType;
  minutes: number;
  distanceKm: number;
}

export interface WeeklyProgress {
  participants: number;
  totalMinutes: number;
  distanceKm: number;
  activityCount: number;
  byType: ActivityTypeProgress[];
}

export function calculateWeeklyProgress(activities: readonly Activity[]): WeeklyProgress {
  const participants = new Set<string>();
  const byType = new Map<ActivityType, ActivityTypeProgress>();
  let totalMinutes = 0;
  let distanceKm = 0;

  for (const activity of activities) {
    totalMinutes += activity.minutes;
    distanceKm += activity.distanceKm ?? 0;
    participants.add(activity.participantSlackId);
    const summary = byType.get(activity.type) ?? { type: activity.type, minutes: 0, distanceKm: 0 };
    summary.minutes += activity.minutes;
    summary.distanceKm += activity.distanceKm ?? 0;
    byType.set(activity.type, summary);
  }

  return {
    participants: participants.size,
    totalMinutes,
    distanceKm,
    activityCount: activities.length,
    byType: [...byType.values()].sort((a, b) =>
      b.minutes - a.minutes || activityTypes.indexOf(a.type) - activityTypes.indexOf(b.type)),
  };
}
