export interface DateRange {
  start: string;
  end: string;
}

export function osloWeek(date = new Date()): DateRange {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const localDate = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  const monday = addUtcDays(localDate, -daysSinceMonday);
  const sunday = addUtcDays(monday, 6);

  return { start: isoDate(monday), end: isoDate(sunday) };
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

