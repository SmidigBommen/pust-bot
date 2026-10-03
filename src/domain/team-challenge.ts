import { isActivityType, type Activity, type ActivityType } from "./activity.js";
import { calculateWeeklyProgress } from "./weekly-progress.js";

export type TeamGoal = { kind: "participation"; target: number } | { kind: "minutes"; target: number };

export interface TeamInput {
  name: string;
  startDate: string;
  endDate: string;
  goal: TeamGoal;
  activityType: ActivityType | null;
}

export interface TeamChallenge extends TeamInput {
  id: string;
  creatorId: string;
  memberIds: string[];
  revision: number;
}

export class TeamRuleError extends Error {
  constructor(message: string, readonly field = "name") { super(message); }
}

export function osloDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateTeam(input: TeamInput, today: string): void {
  if (input.activityType !== null && !isActivityType(input.activityType)) {
    throw new TeamRuleError("Velg alle aktivitetstyper eller én gyldig aktivitetstype.", "activity_type");
  }
  if (!input.name.trim() || input.name.trim().length > 80 || /[\r\n]/.test(input.name)) {
    throw new TeamRuleError("Navnet må være mellom 1 og 80 tegn på én linje.");
  }
  if (!validDate(input.startDate) || input.startDate < today) {
    throw new TeamRuleError("Velg i dag eller en senere startdato.", "start");
  }
  if (!validDate(input.endDate) || input.endDate < input.startDate) {
    throw new TeamRuleError("Sluttdato må være på eller etter startdato.", "end");
  }
  if (input.goal.kind !== "participation" && input.goal.kind !== "minutes") {
    throw new TeamRuleError("Velg deltakelse eller minutter.", "goal");
  }
  if (!Number.isSafeInteger(input.goal.target) || input.goal.target < 1 ||
      (input.goal.kind === "participation" && input.goal.target > 100)) {
    throw new TeamRuleError(input.goal.kind === "participation"
      ? "Velg en hel prosent fra 1 til 100. 100 betyr alle."
      : "Velg et positivt, helt antall minutter.", input.goal.kind);
  }
}

export function teamProgress(team: TeamChallenge, activities: readonly Activity[], today: string) {
  const members = new Set(team.memberIds);
  const progress = calculateWeeklyProgress(activities.filter(activity =>
    members.has(activity.participantSlackId) && activity.activityDate >= team.startDate &&
    activity.activityDate <= team.endDate && activity.activityDate <= today &&
    (team.activityType === null || activity.type === team.activityType)));
  const target = team.goal.kind === "participation"
    ? Math.ceil(members.size * team.goal.target / 100) : team.goal.target;
  const value = team.goal.kind === "participation" ? progress.participants : progress.totalMinutes;
  const phase = today < team.startDate ? "upcoming" : today > team.endDate ? "closed" : "active";
  return { progress, target, value, phase, reached: members.size >= 2 && value >= target };
}
