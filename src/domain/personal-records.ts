import { activityTypes, isQualifyingActivity, type Activity, type ActivityType } from "./activity.js";

export interface PersonalRecords {
  type: ActivityType;
  minutes: number;
  distanceKm?: number;
}

export interface BrokenPersonalRecord {
  metric: "minutes" | "distanceKm";
  value: number;
  previousValue: number;
}

export function personalRecords(
  activities: readonly Activity[],
  slackId: string,
  throughDate: string,
): PersonalRecords[] {
  const byType = new Map<ActivityType, PersonalRecords>();
  for (const activity of activities) {
    if (activity.participantSlackId !== slackId || activity.activityDate > throughDate ||
        !isQualifyingActivity(activity.minutes)) continue;

    const record = byType.get(activity.type) ?? { type: activity.type, minutes: activity.minutes };
    record.minutes = Math.max(record.minutes, activity.minutes);
    if (activity.distanceKm !== undefined && Number.isFinite(activity.distanceKm) && activity.distanceKm > 0) {
      record.distanceKm = Math.max(record.distanceKm ?? 0, activity.distanceKm);
    }
    byType.set(activity.type, record);
  }
  return activityTypes.flatMap(type => {
    const record = byType.get(type);
    return record ? [record] : [];
  });
}

/** Compare at registration time, including backdated logs, but never the new activity itself. */
export function brokenPersonalRecords(
  activity: Activity,
  activities: readonly Activity[],
  throughDate: string,
): BrokenPersonalRecord[] {
  if (activity.activityDate > throughDate || !isQualifyingActivity(activity.minutes)) return [];
  const previous = personalRecords(
    activities.filter(candidate => candidate.id !== activity.id),
    activity.participantSlackId,
    throughDate,
  ).find(record => record.type === activity.type);
  if (!previous) return [];

  const broken: BrokenPersonalRecord[] = [];
  for (const metric of ["distanceKm", "minutes"] as const) {
    const value = activity[metric];
    const previousValue = previous[metric];
    if (value !== undefined && Number.isFinite(value) && previousValue !== undefined && value > previousValue) {
      broken.push({ metric, value, previousValue });
    }
  }
  return broken;
}
