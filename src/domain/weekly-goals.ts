import { osloWeek } from "./week.js";

export interface WeeklyGoals { participantGoal: number; minutesGoal: number }
export interface WeeklyGoalSource { forWeek(weekStart: string): WeeklyGoals }

export function nextWeekStart(now = new Date()): string {
  const monday = new Date(`${osloWeek(now).start}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday.toISOString().slice(0, 10);
}

export class GoalRuleError extends Error {
  constructor(message: string, readonly field = "effective") { super(message); }
}

export function validateGoals(goals: WeeklyGoals): void {
  for (const [field, value] of [["participants", goals.participantGoal], ["minutes", goals.minutesGoal]] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new GoalRuleError("Velg et positivt heltall.", field);
  }
}
