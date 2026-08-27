import { describe, expect, it } from "vitest";
import { sparksForActivity } from "../src/domain/activity.js";
import { levelProgress } from "../src/domain/levels.js";
import { calculateWeeklyProgress } from "../src/domain/weekly-progress.js";
import { activityMessage } from "../src/slack/activity-message.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { osloWeek } from "../src/domain/week.js";
import { groupStatusMessage, personalStatusMessage } from "../src/slack/progress-messages.js";

describe("Sparks", () => {
  it("awards one Spark per qualifying minute", () => {
    expect(sparksForActivity(45)).toBe(45);
  });

  it("does not award Sparks below ten minutes", () => {
    expect(sparksForActivity(9)).toBe(0);
  });
});

describe("levels", () => {
  it("reports current and next level", () => {
    expect(levelProgress(350)).toEqual({
      current: { number: 3, name: "Stifinner", minimumSparks: 300 },
      next: { number: 4, name: "Turkamerat", minimumSparks: 700 },
      sparksUntilNext: 350,
    });
  });
});

describe("weekly group progress", () => {
  it("caps group minutes per person without capping actual minutes", () => {
    const activities = [
      {
        id: "one",
        participantSlackId: "U1",
        registeredBySlackId: "U1",
        type: "cycle" as const,
        minutes: 200,
        distanceKm: 50,
        activityDate: "2026-08-27",
        createdAt: "2026-08-27T12:00:00Z",
      },
      {
        id: "two",
        participantSlackId: "U2",
        registeredBySlackId: "U1",
        type: "walk_hike" as const,
        minutes: 30,
        distanceKm: 2.5,
        activityDate: "2026-08-27",
        createdAt: "2026-08-27T13:00:00Z",
      },
    ];

    expect(calculateWeeklyProgress(activities)).toEqual({
      participants: 2,
      totalMinutes: 230,
      qualifyingMinutes: 180,
      distanceKm: 52.5,
    });
  });
});

describe("activity persistence and messaging", () => {
  it("stores an assisted activity and makes the helper transparent", () => {
    const repository = new ActivityRepository(":memory:");
    const activity = repository.create({
      participantSlackId: "U2",
      registeredBySlackId: "U1",
      type: "walk_hike",
      minutes: 40,
      distanceKm: 3.8,
      comment: "Frisk luft",
      activityDate: "2026-08-27",
    });

    expect(repository.findById(activity.id)).toEqual(activity);
    expect(activityMessage(activity)).toContain("Registrert med hjelp fra <@U1>");
    expect(activityMessage(activity)).toContain("+40 Sparks");
    expect(repository.listBetween("2026-08-24", "2026-08-30")).toEqual([activity]);
    expect(repository.totalSparksForParticipant("U2")).toBe(40);
  });
});

describe("status", () => {
  it("uses Monday through Sunday in Oslo", () => {
    expect(osloWeek(new Date("2026-08-27T12:00:00Z"))).toEqual({
      start: "2026-08-24",
      end: "2026-08-30",
    });
  });

  it("shows cooperative group and personal progress", () => {
    const message = groupStatusMessage({
      progress: { participants: 3, totalMinutes: 210, qualifyingMinutes: 190, distanceKm: 12.5 },
      range: { start: "2026-08-24", end: "2026-08-30" },
      memberCount: 14,
      participantGoal: 4,
      minutesGoal: 240,
    });
    expect(message).toContain("3/4 deltakere");
    expect(message).toContain("190/240 minutter");
    expect(personalStatusMessage(350)).toContain("Stifinner");
  });
});
