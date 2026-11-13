import { describe, expect, it } from "vitest";
import { activityTypes, type Activity } from "../src/domain/activity.js";
import { brokenPersonalRecords, personalRecords } from "../src/domain/personal-records.js";

const today = "2026-10-01";
function activity(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id, participantSlackId: "U1", registeredBySlackId: "U1", type: "run",
    minutes: 40, distanceKm: 6.5, activityDate: today, createdAt: `${today}T10:00:00Z`,
    ...overrides,
  };
}

describe("personal records", () => {
  it("finds independent session maxima per person and activity type, regardless of input order", () => {
    const activities = [
      activity("shorter", { minutes: 30, distanceKm: 8 }),
      activity("other-person", { participantSlackId: "U2", minutes: 200, distanceKm: 100 }),
      activity("bike", { type: "cycle", minutes: 180, distanceKm: 60 }),
      activity("older", { minutes: 60, distanceKm: 7, activityDate: "2025-01-01" }),
    ];
    const expected = [
      { type: "run", minutes: 60, distanceKm: 8 },
      { type: "cycle", minutes: 180, distanceKm: 60 },
    ];
    expect(personalRecords(activities, "U1", today)).toEqual(expected);
    expect(personalRecords([...activities].reverse(), "U1", today)).toEqual(expected);
    expect(personalRecords(activities, "U3", today)).toEqual([]);
  });

  it.each(activityTypes)("establishes a duration baseline for %s without needing distance or celebrating", type => {
    const first = activity("first", { type });
    delete first.distanceKm;
    expect(personalRecords([first], "U1", today)).toEqual([{ type, minutes: 40 }]);
    expect(brokenPersonalRecords(first, [first], today)).toEqual([]);
  });

  it("celebrates both strict improvements and excludes the saved activity itself", () => {
    const previous = activity("previous");
    const next = activity("next", { minutes: 45, distanceKm: 8.25 });
    expect(brokenPersonalRecords(next, [previous, next], today)).toEqual([
      { metric: "distanceKm", value: 8.25, previousValue: 6.5 },
      { metric: "minutes", value: 45, previousValue: 40 },
    ]);
    expect(brokenPersonalRecords(activity("tie"), [previous], today)).toEqual([]);
    expect(brokenPersonalRecords(activity("less", { minutes: 30, distanceKm: 5 }), [previous], today)).toEqual([]);
  });

  it("establishes the first distance separately from duration and ignores other people's records", () => {
    const previous = activity("previous");
    delete previous.distanceKm;
    const next = activity("next", { minutes: 45 });
    expect(brokenPersonalRecords(next, [previous, activity("other", { participantSlackId: "U2" })], today)).toEqual([
      { metric: "minutes", value: 45, previousValue: 40 },
    ]);
    expect(brokenPersonalRecords(next, [activity("bike", { type: "cycle" })], today)).toEqual([]);
  });

  it("compares backdated entries with all already logged eligible history", () => {
    const backdated = activity("backdated", { activityDate: "2026-09-01", minutes: 50, distanceKm: 9 });
    expect(brokenPersonalRecords(backdated, [activity("recent")], today)).toHaveLength(2);
    expect(brokenPersonalRecords(backdated, [activity("recent", { minutes: 60, distanceKm: 10 })], today)).toEqual([]);
  });

  it("ignores future activities until their date, and activities below the qualifying duration", () => {
    const future = activity("future", { activityDate: "2026-10-02", minutes: 100, distanceKm: 20 });
    const short = activity("short", { minutes: 5, distanceKm: 100 });
    const previous = activity("previous");
    expect(personalRecords([previous, future, short], "U1", today)).toEqual([{ type: "run", minutes: 40, distanceKm: 6.5 }]);
    expect(personalRecords([previous, future], "U1", "2026-10-02")).toEqual([{ type: "run", minutes: 100, distanceKm: 20 }]);
    expect(brokenPersonalRecords(future, [previous], today)).toEqual([]);
    expect(brokenPersonalRecords(short, [previous], today)).toEqual([]);
  });
});
