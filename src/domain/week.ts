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

export function previousWeek(range: DateRange): DateRange {
  const start = new Date(`${range.start}T00:00:00Z`);
  const previousMonday = addUtcDays(start, -7);
  return { start: isoDate(previousMonday), end: isoDate(addUtcDays(previousMonday, 6)) };
}

export function weekContaining(date: string): DateRange {
  return osloWeek(new Date(`${date}T12:00:00Z`));
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
