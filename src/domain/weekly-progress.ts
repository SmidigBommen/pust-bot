import { GROUP_MINUTES_CAP_PER_PERSON, type Activity } from "./activity.js";

export interface WeeklyProgress {
  participants: number;
  totalMinutes: number;
  qualifyingMinutes: number;
  distanceKm: number;
}

export function calculateWeeklyProgress(activities: readonly Activity[]): WeeklyProgress {
  const minutesByParticipant = new Map<string, number>();
  let totalMinutes = 0;
  let distanceKm = 0;

  for (const activity of activities) {
    totalMinutes += activity.minutes;
    distanceKm += activity.distanceKm ?? 0;
    minutesByParticipant.set(
      activity.participantSlackId,
      (minutesByParticipant.get(activity.participantSlackId) ?? 0) + activity.minutes,
    );
  }

  const qualifyingMinutes = [...minutesByParticipant.values()].reduce(
    (sum, minutes) => sum + Math.min(minutes, GROUP_MINUTES_CAP_PER_PERSON),
    0,
  );

  return {
    participants: minutesByParticipant.size,
    totalMinutes,
    qualifyingMinutes,
    distanceKm,
  };
}

