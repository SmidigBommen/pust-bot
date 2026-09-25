import { describe, expect, it } from "vitest";
import type { Activity, ActivityType } from "../src/domain/activity.js";
import { groupStatusMessage } from "../src/slack/progress-messages.js";
import { buildWeeklyStatus } from "../src/slack/weekly-status.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";

const range = { start: "2026-09-21", end: "2026-09-27" };
const settings = { groupMemberCount: 14, weeklyParticipantGoal: 4, weeklyMinutesGoal: 240 };

function activity(type: ActivityType, minutes: number, distanceKm?: number): Activity {
  return {
    id: "test", participantSlackId: "U1", registeredBySlackId: "U1",
    type, minutes, distanceKm, activityDate: range.start, createdAt: `${range.start}T12:00:00Z`,
  };
}

function status(activities: Activity[]) {
  return buildWeeklyStatus({ listThrough: () => activities }, range, settings);
}

describe("weekly activity summary", () => {
  it("summarizes repeated activity types and all minutes with the requested totals", () => {
    const input = status([
      activity("mobility", 30), activity("mobility", 30),
      activity("strength", 60), activity("strength", 30), activity("strength", 30),
      activity("cycle", 90, 12), activity("cycle", 30, 10),
      activity("walk_hike", 60, 5), activity("walk_hike", 30, 3), activity("walk_hike", 30, 2),
    ]);
    const message = groupStatusMessage(input);
    expect(input.progress.participants).toBe(1);
    expect(message).toContain("420/240 minutter");
    expect(message).not.toContain("Full pust!"); // Participation goal still matters.
    expect(message).toContain([
      "🥾 Gåtur eller fottur: *120 min · 10 km*",
      "🚴 Sykling: *120 min · 22 km*",
      "🏋️ Styrketrening: *120 min*",
      "🧘 Yoga eller bevegelighet: *60 min*",
    ].join("\n"));
    expect(message).toContain("Denne uken: 10 aktiviteter · 4 aktivitetstyper");
    expect(message).toContain("Totalt *7 timer i bevegelse · 32 km*");
    expect(message).not.toContain("Løping:");
  });

  it("sorts by minutes and sums only recorded distances without estimating missing ones", () => {
    const message = groupStatusMessage(status([
      activity("run", 30, 4.25), activity("run", 20),
      activity("ski", 80, 8.5), activity("other", 20),
    ]));
    expect(message).toContain("Løping: *50 min · 4,25 km*");
    expect(message).toContain("Ski: *80 min · 8,5 km*");
    expect(message.indexOf("Ski:")).toBeLessThan(message.indexOf("Løping:"));
    expect(message).toContain("Annet: *20 min*");
    expect(message).toContain("Totalt *2 timer og 30 minutter i bevegelse · 12,75 km*");
  });

  it.each([
    [30, "30 minutter"], [60, "1 time"], [61, "1 time og 1 minutt"],
    [75, "1 time og 15 minutter"], [120, "2 timer"],
  ])("formats %i minutes without losing remainder minutes", (minutes, expected) => {
    const message = groupStatusMessage(status([activity("strength", minutes)]));
    expect(message).toContain("Denne uken: 1 aktivitet · 1 aktivitetstype");
    expect(message).toContain(`Totalt *${expected} i bevegelse*`);
    expect(message).not.toContain(" km");
  });

  it("handles an empty manual status", () => {
    const message = groupStatusMessage(status([]));
    expect(message).toContain("Denne uken: 0 aktiviteter · 0 aktivitetstyper");
    expect(message).toContain("Totalt *0 minutter i bevegelse*");
    expect(message).not.toContain("*Ukens aktiviteter*");
    expect(message).not.toContain(" km");
  });

  it("uses uncapped minutes for current and historical streaks and updates summaries after edits and deletion", () => {
    const repository = new ActivityRepository(":memory:");
    for (const activityDate of ["2026-09-14", range.start]) {
      repository.create({ ...activity("cycle", 240, 30), activityDate });
      for (const participantSlackId of ["U2", "U3", "U4"]) {
        repository.create({ ...activity("strength", 10), participantSlackId, activityDate });
      }
    }
    repository.create({ ...activity("ski", 500, 100), activityDate: "2026-09-28" });
    const read = () => buildWeeklyStatus(repository, range, settings);
    expect(read().groupStreak).toBe(2);
    expect(read().progress.totalMinutes).toBe(270);
    expect(groupStatusMessage(read())).toContain("Full pust!");
    expect(groupStatusMessage(read())).toContain("Denne uken: 4 aktiviteter · 2 aktivitetstyper");
    const cycling = repository.listBetween(range.start, range.end).find(a => a.type === "cycle")!;
    repository.updateForParticipant(cycling.id, "U1", { ...cycling, type: "run", minutes: 60, distanceKm: 8 });
    expect(read().progress.totalMinutes).toBe(90);
    expect(groupStatusMessage(read())).toContain("Løping: *60 min · 8 km*");
    expect(groupStatusMessage(read())).not.toContain("Sykling:");
    repository.deleteControlledBy(cycling.id, "U1");
    expect(groupStatusMessage(read())).toContain("Denne uken: 3 aktiviteter · 1 aktivitetstype");
    expect(groupStatusMessage(read())).not.toContain(" km");
  });
});
