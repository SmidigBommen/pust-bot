import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { ReportRepository } from "../src/storage/report-repository.js";
import { WeeklyArchive, startWeeklyArchive } from "../src/weekly-archive.js";
import { startWeeklyRecap } from "../src/weekly-recap.js";
import { createBackup } from "../src/backup.js";

const settings = { groupMemberCount: 14, weeklyParticipantGoal: 4, weeklyMinutesGoal: 240 };
const before = new Date("2026-10-25T20:59:30Z"); // Oslo has just switched to winter time.
const due = new Date("2026-10-25T21:00:00Z");
const range = { start: "2026-10-19", end: "2026-10-25" };

describe("permanent weekly archive", () => {
  let folder: string;
  let path: string;
  let activities: ActivityRepository;
  let reports: ReportRepository;
  let archive: WeeklyArchive;
  let stops: Array<() => void | Promise<void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(before);
    folder = mkdtempSync(join(tmpdir(), "pust-archive-"));
    path = join(folder, "pust.sqlite");
    activities = new ActivityRepository(path);
    reports = new ReportRepository(path, "CPUST");
    archive = new WeeklyArchive(reports, activities, settings);
    stops = [];
  });
  afterEach(async () => {
    for (const stop of stops) await stop();
    reports.close();
    activities.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    rmSync(folder, { recursive: true, force: true });
  });
  function log(date = range.end, minutes = 60) {
    return activities.create({ participantSlackId: "PRIVATE-PERSON", registeredBySlackId: "PRIVATE-HELPER",
      type: "walk_hike", minutes, distanceKm: 4.5, comment: "PRIVATE-COMMENT", activityDate: date });
  }
  const logger = () => ({ info: vi.fn(), error: vi.fn() });

  it("imports all due weeks including gaps, without inventing historical goals or publishing this week early", () => {
    log("2026-09-28");
    log("2026-10-12");
    log();
    archive.initialize(before);
    expect(reports.list().map(row => row.range.start)).toEqual(["2026-10-12", "2026-10-05", "2026-09-28"]);
    expect(reports.find("2026-10-05")?.progress.activityCount).toBe(0);
    expect(reports.list().every(row => row.kind === "reconstructed" && row.goals === null)).toBe(true);
    expect(() => archive.capture(range, before)).toThrow("før søndag");
    expect(reports.list()).toHaveLength(3);
  });

  it("never reimports on restart, including older backdated activity", () => {
    log("2026-10-12");
    archive.initialize(before);
    const original = reports.list();
    log("2026-10-12", 90);
    log("2026-09-01");
    archive.initialize(due);
    expect(reports.list()).toEqual(original);
  });

  it("saves only aggregates and freezes data, goals and streak after edits, deletion and restart", () => {
    const activity = log();
    archive.initialize(before);
    const snapshot = archive.capture(range, due);
    expect(snapshot).toMatchObject({ kind: "scheduled", progress: { participants: 1, totalMinutes: 60 },
      goals: { memberCount: 14, participantGoal: 4, minutesGoal: 240 }, scheduledAt: due.toISOString() });
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE|participantSlackId|registeredBySlackId|slackImageFileId|comment/);
    activities.updateForParticipant(activity.id, activity.participantSlackId, { ...activity, minutes: 120 });
    activities.deleteControlledBy(activity.id, activity.participantSlackId);
    log(range.end, 400);
    const second = new ReportRepository(path, "CPUST");
    try {
      const restarted = new WeeklyArchive(second, activities, { ...settings, weeklyMinutesGoal: 600 });
      expect(restarted.capture(range, new Date("2026-10-26T12:00:00Z"))).toEqual(snapshot);
    } finally { second.close(); }
  });

  it("keeps channels separate and lets only the first writer choose a week's contents", () => {
    log();
    const original = archive.capture(range, due);
    const otherConnection = new ReportRepository(path, "CPUST");
    const otherChannel = new ReportRepository(path, "COTHER");
    try {
      expect(otherConnection.save({ ...original, kind: "late" })).toEqual(original);
      expect(otherChannel.list()).toEqual([]);
    } finally { otherConnection.close(); otherChannel.close(); }
  });

  it("archives empty weeks on schedule without Slack being enabled and does no work between deadlines", async () => {
    const read = vi.spyOn(activities, "listThrough");
    const state = vi.spyOn(reports, "state");
    stops.push(startWeeklyArchive(archive, logger()));
    expect(reports.list()).toEqual([]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reports.find(range.start)).toMatchObject({ kind: "scheduled", progress: { totalMinutes: 0, participants: 0 } });
    read.mockClear(); state.mockClear();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(read).not.toHaveBeenCalled();
    expect(state).not.toHaveBeenCalled();
  });

  it("recovers every missing week after downtime, labels it late, and retains known snapshots", () => {
    log();
    archive.initialize(before);
    const original = archive.capture(range, due);
    log("2026-11-01", 90);
    archive.catchUp(new Date("2026-11-09T08:00:00Z"));
    expect(reports.list().map(row => row.range.start)).toEqual(["2026-11-02", "2026-10-26", "2026-10-19"]);
    expect(reports.find("2026-10-26")).toMatchObject({ kind: "late", goals: null,
      generatedAt: "2026-11-09T08:00:00.000Z", progress: { totalMinutes: 90 } });
    expect(reports.find("2026-11-02")?.progress.totalMinutes).toBe(0);
    expect(reports.find(range.start)).toEqual(original);
  });

  it("recovers a delayed timer and retries an archive write failure without sending Slack", async () => {
    log();
    let clock = before;
    const logs = logger();
    stops.push(startWeeklyArchive(archive, logs, () => clock));
    const save = vi.spyOn(reports, "save");
    save.mockImplementationOnce(() => { throw new Error("disk full"); });
    clock = due;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
    expect(reports.list()).toEqual([]);
    clock = new Date(due.getTime() + 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reports.find(range.start)?.kind).toBe("late");
  });

  it.each([true, false])("Slack and archive share one frozen snapshot, archive timer first=%s", async archiveFirst => {
    log();
    archive.initialize(before);
    const logs = logger();
    const send = vi.fn(async (_channel: string, text: string) => {
      expect(reports.find(range.start)?.progress.totalMinutes).toBe(60);
      expect(text).toContain("60/240 minutter");
      expect(text).toContain("https://pust.smidigbommen.no/uker/2026-10-19");
      log(range.end, 300); // Subsequent writes must not affect the archived or sent report.
      return "123.456";
    });
    const startArchive = () => stops.push(startWeeklyArchive(archive, logs));
    if (archiveFirst) startArchive();
    stops.push(startWeeklyRecap({ ...settings, repository: activities, channelId: "CPUST", send, logger: logs,
      archive, archiveUrl: "https://pust.smidigbommen.no" }));
    if (!archiveFirst) startArchive();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(reports.find(range.start)?.progress.totalMinutes).toBe(60);
    expect(reports.list()).toHaveLength(1);
  });

  it("keeps the report when Slack fails and never sends a catch-up message after restart", async () => {
    log();
    archive.initialize(before);
    const send = vi.fn(async () => { throw new Error("Slack unavailable"); });
    const stop = startWeeklyRecap({ ...settings, repository: activities, channelId: "CPUST", send, logger: logger(), archive });
    stops.push(stop);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reports.find(range.start)?.kind).toBe("scheduled");
    expect(send).toHaveBeenCalledTimes(1);
    await stop();
    vi.setSystemTime("2026-11-02T08:00:00Z");
    stops.push(startWeeklyArchive(archive, logger()));
    stops.push(startWeeklyRecap({ ...settings, repository: activities, channelId: "CPUST", send, logger: logger(), archive }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(reports.find("2026-10-26")?.kind).toBe("late");
  });

  it("includes reports and import state in an integrity-checked SQLite backup", async () => {
    log();
    archive.initialize(before);
    archive.capture(range, due);
    const destination = await createBackup(path, join(folder, "backups"), due);
    const restored = new ReportRepository(destination, "CPUST");
    try {
      expect(restored.list()).toEqual(reports.list());
      expect(restored.state()).toEqual(reports.state());
    } finally { restored.close(); }
  });
});
