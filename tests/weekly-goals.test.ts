import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { App } from "@slack/bolt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyGoalRepository } from "../src/storage/weekly-goal-repository.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { ReportRepository } from "../src/storage/report-repository.js";
import { TeamRepository } from "../src/storage/team-repository.js";
import { buildWeeklyStatus } from "../src/slack/weekly-status.js";
import { registerSlackHandlers } from "../src/slack/register-handlers.js";
import { WeeklyArchive } from "../src/weekly-archive.js";
import { nextWeekStart } from "../src/domain/weekly-goals.js";
import { loadConfig } from "../src/config.js";

const initial = { participantGoal: 2, minutesGoal: 60 };
type Handler = (args: any) => Promise<void>;

describe("persistent weekly goals", () => {
  let folder: string, path: string, now: Date;
  let goals: WeeklyGoalRepository;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "pust-goals-")); path = join(folder, "test.sqlite");
    now = new Date("2026-10-01T10:00:00Z");
    goals = new WeeklyGoalRepository(path, "C1", initial, ["UADMIN"], () => now);
  });
  afterEach(() => { goals.close(); rmSync(folder, { recursive: true, force: true }); vi.unstubAllEnvs(); });

  it("changes future Mondays, preserves previous goals and ignores new environment defaults after restart", () => {
    const revision = goals.revision();
    goals.schedule("2026-10-05", { participantGoal: 3, minutesGoal: 90 }, "UADMIN", revision, "request");
    goals.schedule("2026-10-05", { participantGoal: 3, minutesGoal: 90 }, "UADMIN", revision, "request");
    expect(goals.history()).toHaveLength(1);
    expect(goals.history()[0]).toMatchObject({ actorId: "UADMIN", effectiveWeek: "2026-10-05", changedAt: now.toISOString() });
    expect(goals.forWeek("2026-09-28")).toEqual(initial);
    goals.close();
    goals = new WeeklyGoalRepository(path, "C1", { participantGoal: 99, minutesGoal: 9999 }, ["UADMIN"], () => now);
    expect(goals.forWeek("2026-10-05")).toEqual({ participantGoal: 3, minutesGoal: 90 });
    expect(goals.forWeek("2026-09-28")).toEqual(initial);
    const other = new WeeklyGoalRepository(path, "C2", { participantGoal: 8, minutesGoal: 1200 }, [], () => now);
    expect(other.forWeek("2026-10-05").participantGoal).toBe(8);
    other.close();
  });

  it("checks authorization, date boundaries, validation and stale edits inside the write transaction", () => {
    expect(() => goals.schedule("2026-10-05", initial, "UOTHER", goals.revision(), "denied")).toThrow("Pust-voktere");
    for (const date of ["2026-09-28", "2026-10-06", "2026-02-30", "bad"]) {
      expect(() => goals.schedule(date, initial, "UADMIN", goals.revision(), date)).toThrow();
    }
    expect(() => goals.schedule("2026-10-05", { ...initial, minutesGoal: 0 }, "UADMIN", goals.revision(), "zero")).toThrow();
    const stale = goals.revision();
    goals.schedule("2026-10-05", initial, "UADMIN", stale, "first");
    expect(() => goals.schedule("2026-10-12", initial, "UADMIN", stale, "stale")).toThrow("endret");
    now = new Date("2026-10-04T22:00:00Z");
    expect(() => goals.schedule("2026-10-05", initial, "UADMIN", goals.revision(), "late")).toThrow("mandag");
  });

  it("uses each week's goals for status, archive and the group streak", () => {
    const activities = new ActivityRepository(path);
    const reports = new ReportRepository(path, "C1");
    try {
      goals.schedule("2026-10-05", { participantGoal: 3, minutesGoal: 90 }, "UADMIN", goals.revision(), "next");
      for (const date of ["2026-09-28", "2026-10-05"]) for (const user of date === "2026-09-28" ? ["U1", "U2"] : ["U1", "U2", "U3"]) {
        activities.create({ participantSlackId: user, registeredBySlackId: user, type: "walk_hike", minutes: 30, activityDate: date });
      }
      const settings = { groupMemberCount: 14, weeklyParticipantGoal: 99, weeklyMinutesGoal: 9999, weeklyGoals: goals };
      const range = { start: "2026-10-05", end: "2026-10-11" };
      const status = buildWeeklyStatus(activities, range, settings);
      expect(status).toMatchObject({ participantGoal: 3, minutesGoal: 90, groupStreak: 2 });
      const archive = new WeeklyArchive(reports, activities, settings);
      const captured = archive.capture(range, new Date("2026-10-11T20:00:00Z"));
      expect(captured.goals).toMatchObject({ participantGoal: 3, minutesGoal: 90, groupStreak: 2 });
      goals.schedule("2026-10-12", { participantGoal: 8, minutesGoal: 1200 }, "UADMIN", goals.revision(), "later");
      expect(buildWeeklyStatus(activities, range, settings).groupStreak).toBe(2);
      expect(reports.find(range.start)).toEqual(captured);
    } finally { activities.close(); reports.close(); }
  });

  it("imports known archived goals on the first migration without changing report snapshots", () => {
    const importPath = join(folder, "import.sqlite");
    const reports = new ReportRepository(importPath, "C1");
    const report = reports.save({ version: 1, kind: "scheduled", range: { start: "2026-09-21", end: "2026-09-27" },
      scheduledAt: "2026-09-27T20:00:00Z", generatedAt: "2026-09-27T20:00:00Z",
      progress: { participants: 4, totalMinutes: 240, activityCount: 4, byType: [], distanceKm: 0 },
      goals: { participantGoal: 4, minutesGoal: 240, memberCount: 14, groupStreak: 3 } });
    const imported = new WeeklyGoalRepository(importPath, "C1", { participantGoal: 8, minutesGoal: 1200 }, ["UADMIN"], () => now);
    expect(imported.forWeek("2026-09-21")).toEqual({ participantGoal: 4, minutesGoal: 240 });
    expect(imported.forWeek("2026-09-28")).toEqual({ participantGoal: 8, minutesGoal: 1200 });
    expect(reports.find("2026-09-21")).toEqual(report);
    imported.close(); reports.close();
  });

  it("opens compact admin controls only for configured users and rechecks authorization on submit", async () => {
    const activities = new ActivityRepository(path), teams = new TeamRepository(path, () => now);
    const views = new Map<string, Handler>(); let command: Handler;
    const app = { action: vi.fn(), view: (id: string, fn: Handler) => views.set(id, fn), command: (_: string, fn: Handler) => { command = fn; } } as unknown as App;
    registerSlackHandlers(app, { repository: activities, teams, pustChannelId: "C1", groupMemberCount: 14, weeklyParticipantGoal: 8, weeklyMinutesGoal: 1200, weeklyGoals: goals });
    const client = { views: { open: vi.fn() } }, respond = vi.fn();
    const args = (user_id: string) => ({ ack: vi.fn(), command: { text: "admin", user_id, trigger_id: "t" }, client, respond });
    await command!(args("UOTHER"));
    expect(client.views.open).not.toHaveBeenCalled();
    await command!(args("UADMIN"));
    const form = client.views.open.mock.calls[0]![0].view;
    expect(form.blocks.filter((b: any) => b.type === "input")).toHaveLength(3);
    const view = { ...form, state: { values: { effective: { value: { selected_date: "2026-10-05" } }, participants: { value: { value: "8" } }, minutes: { value: { value: "1200" } } } } };
    const ack = vi.fn(), logger = { error: vi.fn() };
    await views.get("pust_goal_save")!({ ack, view, body: { user: { id: "UOTHER" } }, logger });
    expect(ack.mock.calls[0]![0].response_action).toBe("errors");
    expect(goals.history()).toHaveLength(0);
    await views.get("pust_goal_save")!({ ack, view, body: { user: { id: "UADMIN" } }, logger });
    expect(goals.forWeek("2026-10-05")).toEqual({ participantGoal: 8, minutesGoal: 1200 });
    activities.close(); teams.close();
  });

  it("loads an explicit admin allowlist, with no admins by default", () => {
    for (const key of ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_PUST_CHANNEL_ID"]) vi.stubEnv(key, "test");
    vi.stubEnv("PUST_ADMIN_USER_IDS", "");
    expect(loadConfig().pustAdminUserIds).toEqual([]);
    vi.stubEnv("PUST_ADMIN_USER_IDS", "UADMIN, UOTHER,UADMIN");
    expect(loadConfig().pustAdminUserIds).toEqual(["UADMIN", "UOTHER"]);
    vi.stubEnv("PUST_ADMIN_USER_IDS", "@someone");
    expect(() => loadConfig()).toThrow("Slack-bruker-ID");
  });
});

it.each([
  ["2026-10-25T22:59:59Z", "2026-10-26"], ["2026-10-25T23:00:00Z", "2026-11-02"],
  ["2026-12-31T12:00:00Z", "2027-01-04"],
])("defaults to next Monday in Oslo at %s", (now, expected) => {
  expect(nextWeekStart(new Date(now))).toBe(expected);
});

it("shows only the latest decision per future week in the plan while retaining the full audit", () => {
  const now = () => new Date("2026-10-01T10:00:00Z");
  const goals = new WeeklyGoalRepository(":memory:", "C1", initial, ["UADMIN"], now);
  try {
    goals.schedule("2026-10-12", { participantGoal: 5, minutesGoal: 500 }, "UADMIN", goals.revision(), "later");
    goals.schedule("2026-10-05", { participantGoal: 3, minutesGoal: 300 }, "UADMIN", goals.revision(), "next");
    goals.schedule("2026-10-05", { participantGoal: 4, minutesGoal: 400 }, "UADMIN", goals.revision(), "correction");
    expect(goals.plan().map(c => [c.effectiveWeek, c.participantGoal])).toEqual([["2026-10-05", 4], ["2026-10-12", 5]]);
    expect(goals.history()).toHaveLength(3);
    expect(goals.forWeek("2026-10-05").participantGoal).toBe(4);
    expect(goals.forWeek("2026-10-12").participantGoal).toBe(5);
  } finally { goals.close(); }
});
