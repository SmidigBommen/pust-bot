import { isActivityType, type ActivityType } from "./activity.js";

export interface InvitationInput {
  title: string;
  activityType: ActivityType;
  date: string;
  time: string;
  minutes: number;
  place: string;
  description: string;
}
export type Attendance = "going" | "maybe";
export interface Invitation extends InvitationInput {
  id: string; creatorId: string; startsAt: string; endsAt: string; revision: number;
  cancelled: boolean; messageTs: string | null; publication: "pending" | "attempted" | "sent" | "failed";
  attendees: { userId: string; response: Attendance }[];
}
export class InvitationError extends Error {
  constructor(message: string, readonly field = "title") { super(message); }
}

const localTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Reject ambiguous/nonexistent clock-change times instead of silently moving an event. */
export function invitationInstant(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new InvitationError("Velg gyldig dato og klokkeslett.", "date");
  const wall = Date.parse(`${date}T${time}:00Z`);
  const candidates = [60, 120].map(offset => new Date(wall - offset * 60_000))
    .filter(instant => Number.isFinite(instant.getTime()) && localTime.format(instant) === `${date} ${time}`);
  if (candidates.length !== 1) throw new InvitationError("Dette klokkeslettet er ugyldig eller tvetydig ved klokkeomstilling. Velg et annet.", "time");
  return candidates[0]!;
}

export function validateInvitation(input: InvitationInput, now: Date): { startsAt: string; endsAt: string } {
  for (const [field, value, max] of [["title", input.title, 60], ["place", input.place, 100], ["description", input.description, 280]] as const) {
    if ((field !== "description" && !value.trim()) || value.trim().length > max || /[\r\n]/.test(value)) {
      throw new InvitationError(`Bruk én linje med ${field === "description" ? "maks" : "1–"}${max} tegn.`, field);
    }
  }
  if (!isActivityType(input.activityType)) throw new InvitationError("Velg aktivitet.", "activity_type");
  if (!Number.isSafeInteger(input.minutes) || input.minutes < 10 || input.minutes > 720) throw new InvitationError("Velg 10–720 min.", "minutes");
  const start = invitationInstant(input.date, input.time);
  if (start <= now) throw new InvitationError("Velg et fremtidig tidspunkt.", "date");
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + input.minutes * 60_000).toISOString() };
}
