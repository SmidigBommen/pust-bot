import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sparksForActivity } from "../src/domain/activity.js";
import { levelProgress } from "../src/domain/levels.js";
import { calculateWeeklyProgress } from "../src/domain/weekly-progress.js";
import { activityMessage } from "../src/slack/activity-message.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { osloWeek } from "../src/domain/week.js";
import { groupStatusMessage, personalStatusMessage } from "../src/slack/progress-messages.js";
import { helpMessage } from "../src/slack/help-message.js";
import { deleteActivityModal } from "../src/slack/delete-activity-modal.js";
import { editActivityModal, selectEditActivityModal } from "../src/slack/edit-activity-modal.js";
import { groupWeeklyStreak, personalWeeklyStreak } from "../src/domain/streaks.js";
import { earnedAchievements } from "../src/domain/achievements.js";
import { createBackup } from "../src/backup.js";
import { startHealthServer, stopHealthServer } from "../src/health-server.js";

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
      groupStreak: 2,
    });
    expect(message).toContain("3/4 deltakere");
    expect(message).toContain("190/240 minutter");
    expect(message).toContain("Gruppestreak");
    expect(personalStatusMessage(350, 3)).toContain("Personlig streak");
  });
});

describe("help", () => {
  it("documents the available Slack commands and the inclusive rules", () => {
    expect(helpMessage()).toContain("`/pust logg`");
    expect(helpMessage()).toContain("`/pust status`");
    expect(helpMessage()).toContain("ingen individuell toppliste");
  });
});

describe("activity deletion", () => {
  it("lets the participant remove an activity and recalculates Sparks", () => {
    const repository = new ActivityRepository(":memory:");
    const activity = repository.create({
      participantSlackId: "U2",
      registeredBySlackId: "U1",
      type: "cycle",
      minutes: 45,
      activityDate: "2026-08-28",
    });
    repository.setSlackMessageTs(activity.id, "123.456");

    expect(deleteActivityModal(repository.listRecentControlledBy("U2")).blocks).toHaveLength(2);
    expect(repository.deleteControlledBy(activity.id, "U3")).toBeNull();
    expect(repository.deleteControlledBy(activity.id, "U2")?.slackMessageTs).toBe("123.456");
    expect(repository.totalSparksForParticipant("U2")).toBe(0);
  });
});

describe("activity editing", () => {
  it("only lets the participant edit and preserves message identity", () => {
    const repository = new ActivityRepository(":memory:");
    const activity = repository.create({
      participantSlackId: "U2",
      registeredBySlackId: "U1",
      type: "run",
      minutes: 30,
      activityDate: "2026-08-28",
    });
    repository.setSlackMessageTs(activity.id, "456.789");

    expect(selectEditActivityModal(repository.listRecentForParticipant("U2")).blocks).toHaveLength(1);
    expect(repository.updateForParticipant(activity.id, "U1", { ...activity, minutes: 40 })).toBeNull();
    const updated = repository.updateForParticipant(activity.id, "U2", {
      ...activity,
      minutes: 40,
      distanceKm: 5,
    });
    expect(updated?.minutes).toBe(40);
    expect(updated?.slackMessageTs).toBe("456.789");
    expect(editActivityModal(updated!).private_metadata).toBe(activity.id);
    expect(repository.totalSparksForParticipant("U2")).toBe(40);
  });
});

describe("weekly streaks", () => {
  const activity = (id: string, participant: string, date: string, minutes = 60) => ({
    id,
    participantSlackId: participant,
    registeredBySlackId: participant,
    type: "walk_hike" as const,
    minutes,
    activityDate: date,
    createdAt: `${date}T12:00:00Z`,
  });
  const currentWeek = { start: "2026-08-24", end: "2026-08-30" };

  it("keeps a personal streak alive while the current week is still open", () => {
    const activities = [
      activity("1", "U1", "2026-08-17"),
      activity("2", "U1", "2026-08-10"),
    ];
    expect(personalWeeklyStreak(activities, "U1", currentWeek)).toBe(2);
  });

  it("counts consecutive successful group weeks", () => {
    const activities = [
      activity("1", "U1", "2026-08-17", 120),
      activity("2", "U2", "2026-08-18", 120),
      activity("3", "U1", "2026-08-10", 120),
      activity("4", "U2", "2026-08-11", 120),
    ];
    expect(
      groupWeeklyStreak(activities, currentWeek, { participantGoal: 2, minutesGoal: 240 }),
    ).toBe(2);
  });
});

describe("achievements", () => {
  it("derives personal achievements and persists each award once", () => {
    const repository = new ActivityRepository(":memory:");
    const inputs = [
      ["walk_hike", "2026-08-03"],
      ["run", "2026-08-10"],
      ["cycle", "2026-08-17"],
      ["walk_hike", "2026-08-24"],
    ] as const;
    for (const [type, activityDate] of inputs) {
      repository.create({
        participantSlackId: "U1",
        registeredBySlackId: "U1",
        type,
        minutes: 30,
        activityDate,
      });
    }
    const earned = earnedAchievements(
      repository.listThrough("2026-08-30"),
      "U1",
      { start: "2026-08-24", end: "2026-08-30" },
    );
    expect(earned).toEqual(["first_breath", "new_trail", "four_in_a_row"]);
    expect(repository.awardAchievement("U1", "first_breath")).toBe(true);
    expect(repository.awardAchievement("U1", "first_breath")).toBe(false);
  });
});

describe("production operations", () => {
  it("serves an internal health response", async () => {
    const server = await startHealthServer(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Mangler testport");
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      await stopHealthServer(server);
    }
  });

  it("creates an integrity-checked SQLite backup", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pust-backup-test-"));
    try {
      const databasePath = join(directory, "pust.sqlite");
      const repository = new ActivityRepository(databasePath);
      repository.create({
        participantSlackId: "U1",
        registeredBySlackId: "U1",
        type: "walk_hike",
        minutes: 30,
        activityDate: "2026-08-29",
      });
      const destination = await createBackup(
        databasePath,
        join(directory, "backups"),
        new Date("2026-08-29T12:00:00Z"),
      );
      expect(destination).toContain("pust-2026-08-29T12-00-00Z.sqlite");
      expect(new ActivityRepository(destination).totalSparksForParticipant("U1")).toBe(30);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
