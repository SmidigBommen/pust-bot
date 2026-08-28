export const MINIMUM_ACTIVITY_MINUTES = 10;
export const GROUP_MINUTES_CAP_PER_PERSON = 150;

export const activityTypes = [
  "walk_hike",
  "run",
  "cycle",
  "strength",
  "mobility",
  "team_sport",
  "ski",
  "other",
] as const;

export type ActivityType = (typeof activityTypes)[number];

export function isActivityType(value: string): value is ActivityType {
  return activityTypes.includes(value as ActivityType);
}

export const activityLabels: Record<ActivityType, string> = {
  walk_hike: "Gåtur eller fottur",
  run: "Løping",
  cycle: "Sykling",
  strength: "Styrketrening",
  mobility: "Yoga eller bevegelighet",
  team_sport: "Lagidrett",
  ski: "Ski",
  other: "Annet",
};

export interface ActivityInput {
  participantSlackId: string;
  registeredBySlackId: string;
  type: ActivityType;
  minutes: number;
  distanceKm?: number;
  comment?: string;
  activityDate: string;
}

export interface Activity extends ActivityInput {
  id: string;
  createdAt: string;
  slackMessageTs?: string;
}

export function isQualifyingActivity(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= MINIMUM_ACTIVITY_MINUTES;
}

export function sparksForActivity(minutes: number): number {
  return isQualifyingActivity(minutes) ? minutes : 0;
}

export function validateActivity(input: ActivityInput): string[] {
  const errors: string[] = [];

  if (!input.participantSlackId) errors.push("Velg hvem som utførte aktiviteten.");
  if (!isQualifyingActivity(input.minutes)) {
    errors.push(`Aktiviteten må vare minst ${MINIMUM_ACTIVITY_MINUTES} minutter.`);
  }
  if (input.distanceKm !== undefined && input.distanceKm <= 0) {
    errors.push("Distanse må være større enn null.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.activityDate)) {
    errors.push("Dato må være på formatet ÅÅÅÅ-MM-DD.");
  }

  return errors;
}
