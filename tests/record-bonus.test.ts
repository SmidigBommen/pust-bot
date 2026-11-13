import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityInput } from "../src/domain/activity.js";
import { calculateWeeklyProgress } from "../src/domain/weekly-progress.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";

const input: ActivityInput = {
  participantSlackId: "U1", registeredBySlackId: "U1", type: "run",
  minutes: 30, distanceKm: 5, activityDate: "2026-11-13",
};

describe("record bonus persistence", () => {
  let repository: ActivityRepository;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    repository = new ActivityRepository(":memory:");
  });
  afterEach(() => { repository.close(); vi.useRealTimers(); });

  it("awards ten Sparks per record, but none for baselines or ties", () => {
    expect(repository.create(input).recordBonus).toBeUndefined();
    expect(repository.create(input).recordBonus).toBeUndefined();
    const distance = repository.create({ ...input, distanceKm: 6 });
    expect(distance.recordBonus?.sparks).toBe(10);
    const duration = repository.create({ ...input, minutes: 40 });
    expect(duration.recordBonus?.sparks).toBe(10);
    const both = repository.create({ ...input, minutes: 50, distanceKm: 7 });
    expect(both.recordBonus?.sparks).toBe(20);
    expect(both.recordBonus?.records).toHaveLength(2);
    expect(repository.totalSparksForParticipant("U1")).toBe(220);
    expect(calculateWeeklyProgress(repository.listThrough("2026-11-13")).totalMinutes).toBe(180);
  });

  it("does not award the first distance when duration has an existing baseline", () => {
    const { distanceKm: _, ...withoutDistance } = input;
    repository.create(withoutDistance);
    expect(repository.create(input).recordBonus).toBeUndefined();
  });

  it("does not copy a bonus when an awarded activity is reused as registration input", () => {
    repository.create(input);
    const record = repository.create({ ...input, minutes: 40 });
    const duplicate = repository.create(record);
    expect(duplicate.recordBonus).toBeUndefined();
    expect(repository.findById(duplicate.id)).toEqual(duplicate);
    expect(repository.totalSparksForParticipant("U1")).toBe(120);
  });

  it("retains an award against its original baseline after a later PR and repeated edits", () => {
    repository.create(input);
    const first = repository.create({ ...input, minutes: 40, distanceKm: 6 });
    repository.create({ ...input, minutes: 50, distanceKm: 7 });
    for (let i = 0; i < 3; i++) {
      const edited = repository.updateForParticipant(first.id, "U1", { ...input, minutes: 35, comment: "Korrigert" });
      expect(edited?.recordBonus?.sparks).toBe(10);
      expect(repository.totalSparksForParticipant("U1")).toBe(145);
    }
  });

  it.each([
    [{ minutes: 30, distanceKm: 6 }, "distanceKm"],
    [{ minutes: 40, distanceKm: 5 }, "minutes"],
  ] as const)("removes only the corrected record's bonus and never restores it: %j", (correction, retainedMetric) => {
    repository.create(input);
    const record = repository.create({ ...input, minutes: 40, distanceKm: 6 });
    expect(record.recordBonus?.sparks).toBe(20);
    const corrected = repository.updateForParticipant(record.id, "U1", { ...input, ...correction });
    expect(corrected?.recordBonus?.sparks).toBe(10);
    expect(corrected?.recordBonus?.records.map(value => value.metric)).toEqual([retainedMetric]);
    for (let i = 0; i < 2; i++) {
      const edited = repository.updateForParticipant(record.id, "U1", { ...input, minutes: 40, distanceKm: 6 });
      expect(edited?.recordBonus?.sparks).toBe(10);
      expect(repository.totalSparksForParticipant("U1")).toBe(80);
    }
    const onlyRevokedRecord = retainedMetric === "minutes" ? { minutes: 30, distanceKm: 6 } : { minutes: 40, distanceKm: 5 };
    expect(repository.updateForParticipant(record.id, "U1", { ...input, ...onlyRevokedRecord })?.recordBonus).toBeUndefined();
  });

  it("revokes a corrected award permanently, even if later edits beat a record", () => {
    repository.create(input);
    const record = repository.create({ ...input, minutes: 40, distanceKm: 6 });
    expect(repository.updateForParticipant(record.id, "U1", input)?.recordBonus).toBeUndefined();
    expect(repository.totalSparksForParticipant("U1")).toBe(60);
    expect(repository.updateForParticipant(record.id, "U1", { ...input, minutes: 60, distanceKm: 10 })?.recordBonus).toBeUndefined();
    expect(repository.totalSparksForParticipant("U1")).toBe(90);
  });

  it.each([
    { type: "cycle" as const },
    { activityDate: "2026-11-14" },
  ])("revokes an award after changing its type or moving its date beyond the award date: %j", change => {
    repository.create(input);
    const record = repository.create({ ...input, minutes: 40 });
    expect(repository.updateForParticipant(record.id, "U1", { ...input, minutes: 40, ...change })?.recordBonus).toBeUndefined();
    expect(repository.totalSparksForParticipant("U1")).toBe(70);
  });

  it("deletes the bonus with its activity, for the participant or helper", () => {
    repository.create(input);
    const record = repository.create({ ...input, minutes: 40, registeredBySlackId: "U2" });
    expect(repository.totalSparksForParticipant("U1")).toBe(80);
    expect(repository.totalSparksForParticipant("U2")).toBe(0);
    expect(repository.deleteControlledBy(record.id, "U3")).toBeNull();
    expect(repository.deleteControlledBy(record.id, "U2")?.recordBonus?.sparks).toBe(10);
    expect(repository.totalSparksForParticipant("U1")).toBe(30);
  });

  it("does not award future entries later, or when they are edited", () => {
    repository.create(input);
    const future = repository.create({ ...input, minutes: 60, activityDate: "2026-11-14" });
    expect(future.recordBonus).toBeUndefined();
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
    expect(repository.updateForParticipant(future.id, "U1", { ...future, minutes: 70 })?.recordBonus).toBeUndefined();
    expect(repository.totalSparksForParticipant("U1")).toBe(100);
  });

  it("awards new backdated registrations against all currently recorded history", () => {
    repository.create(input);
    expect(repository.create({ ...input, minutes: 40, activityDate: "2026-10-01" }).recordBonus?.sparks).toBe(10);
  });

  it("rolls back a failed registration without losing the ability to award the next PR", () => {
    repository.create(input);
    expect(() => repository.create({ ...input, minutes: 5 })).toThrow();
    expect(repository.totalSparksForParticipant("U1")).toBe(30);
    expect(repository.create({ ...input, minutes: 40 }).recordBonus?.sparks).toBe(10);
  });

  it("migrates without historical bonuses, never awards old edits, and preserves new awards across restarts", () => {
    const directory = mkdtempSync(join(tmpdir(), "pust-record-bonus-"));
    const path = join(directory, "pust.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE activities (
      id TEXT PRIMARY KEY, participant_slack_id TEXT NOT NULL, registered_by_slack_id TEXT NOT NULL,
      activity_type TEXT NOT NULL, minutes INTEGER NOT NULL CHECK (minutes >= 10), distance_km REAL,
      comment TEXT, activity_date TEXT NOT NULL, created_at TEXT NOT NULL, slack_message_ts TEXT
    );
    INSERT INTO activities VALUES ('old-first', 'U1', 'U1', 'run', 30, 5, NULL, '2026-11-11', '2026-11-11T10:00:00Z', NULL);
    INSERT INTO activities VALUES ('old-record', 'U1', 'U1', 'run', 40, 6, NULL, '2026-11-12', '2026-11-12T10:00:00Z', NULL);`);
    legacy.close();
    let migrated: ActivityRepository | undefined;
    try {
      migrated = new ActivityRepository(path);
      expect(migrated.totalSparksForParticipant("U1")).toBe(70);
      expect(migrated.findById("old-record")?.recordBonus).toBeUndefined();
      expect(migrated.updateForParticipant("old-record", "U1", { ...input, minutes: 50, distanceKm: 7 })?.recordBonus).toBeUndefined();
      const fresh = migrated.create({ ...input, minutes: 60, distanceKm: 8 });
      expect(fresh.recordBonus?.sparks).toBe(20);
      expect(migrated.totalSparksForParticipant("U1")).toBe(160);
      migrated.close();
      migrated = new ActivityRepository(path);
      expect(migrated.findById(fresh.id)?.recordBonus).toEqual(fresh.recordBonus);
      expect(migrated.totalSparksForParticipant("U1")).toBe(160);
      expect(migrated.updateForParticipant(fresh.id, "U1", { ...input, minutes: 60, distanceKm: 8, comment: "Etter omstart" })?.recordBonus?.sparks).toBe(20);
      expect(migrated.totalSparksForParticipant("U1")).toBe(160);
    } finally {
      migrated?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
