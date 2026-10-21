import type { DateRange } from "./week.js";
import type { WeeklyProgress } from "./weekly-progress.js";

/** Public, immutable aggregate. Never put activity records or Slack identities here. */
export interface WeeklyReport {
  version: 1;
  range: DateRange;
  scheduledAt: string;
  generatedAt: string;
  kind: "scheduled" | "reconstructed" | "late";
  progress: WeeklyProgress;
  goals: {
    memberCount: number;
    participantGoal: number;
    minutesGoal: number;
    groupStreak: number;
  } | null;
}

export function reportPath(weekStart: string): string {
  return `/uker/${weekStart}`;
}
