import { osloWeek, type DateRange } from "./week.js";

interface RecapSlot {
  dueAt: Date;
  range: DateRange;
}

const osloHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo",
  hour: "2-digit",
  hourCycle: "h23",
});

function slotForWeek(range: DateRange): RecapSlot {
  // By Sunday noon Oslo's summer/winter clock change has already happened.
  const noon = new Date(`${range.end}T12:00:00Z`);
  const hoursUntilTen = 22 - Number(osloHour.format(noon));
  return { range, dueAt: new Date(noon.getTime() + hoursUntilTen * 3_600_000) };
}

/** Strictly future: starting after the deadline never catches up a missed post. */
export function nextWeeklyRecap(now: Date): RecapSlot {
  const slot = slotForWeek(osloWeek(now));
  if (slot.dueAt.getTime() > now.getTime()) return slot;
  const nextMonday = new Date(`${slot.range.end}T12:00:00Z`);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 1);
  return slotForWeek(osloWeek(nextMonday));
}
