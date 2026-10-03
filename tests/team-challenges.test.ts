import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { osloDate, teamProgress, validateTeam, type TeamInput } from "../src/domain/team-challenge.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { TeamRepository } from "../src/storage/team-repository.js";
import { teamStatusText } from "../src/slack/team-views.js";
import { createBackup } from "../src/backup.js";

const input: TeamInput = { activityType: null, name: "Helgepust", startDate: "2026-10-02", endDate: "2026-10-04", goal: { kind: "participation", target: 100 } };

describe("date-range Pustelag", () => {
  let folder: string;
  let path: string;
  let clock: Date;
  let teams: TeamRepository;
  let activities: ActivityRepository;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "pust-teams-"));
    path = join(folder, "pust.sqlite");
    clock = new Date("2026-10-01T10:00:00Z");
    activities = new ActivityRepository(path);
    teams = new TeamRepository(path, () => clock);
  });
  afterEach(() => { teams.close(); rmSync(folder, { recursive: true, force: true }); });
  const now = (value: string) => { clock = new Date(value); };
  function log(user: string, date = "2026-10-02", minutes = 30, registeredBy = user) {
    return activities.create({ participantSlackId: user, registeredBySlackId: registeredBy, type: "walk_hike", minutes, distanceKm: 2.5, activityDate: date });
  }
  function progress(id: string) {
    const team = teams.find(id)!;
    return teamProgress(team, activities.listBetween(team.startDate, team.endDate), teams.today());
  }

  it("creates a team with its creator and handles duplicate submissions and joins once", () => {
    const team = teams.create(input, "U1", "submission");
    expect(teams.create(input, "U1", "submission").id).toBe(team.id);
    expect(teams.list().teams).toHaveLength(1);
    teams.membership(team.id, "U2", true);
    teams.membership(team.id, "U2", true);
    expect(teams.find(team.id)?.memberIds).toEqual(["U1", "U2"]);
  });

  it("updates everyone-participates progress on late joining, counting earlier activities", () => {
    const team = teams.create(input, "U1");
    for (const user of ["U2", "U3"]) teams.membership(team.id, user, true);
    for (const user of ["U1", "U2", "U3"]) log(user);
    now("2026-10-04T10:00:00Z");
    expect(progress(team.id)).toMatchObject({ target: 3, value: 3, reached: true, phase: "active" });
    teams.membership(team.id, "U4", true);
    expect(progress(team.id)).toMatchObject({ target: 4, value: 3, reached: false });
    log("U4", "2026-10-02", 40, "HELPER");
    expect(progress(team.id)).toMatchObject({ target: 4, value: 4, reached: true });
    const text = teamStatusText(teams.find(team.id)!, activities.listThrough("2026-10-04"), teams.today());
    expect(text).toContain("dagens medlemsliste");
    expect(text).not.toContain("🎉");
    now("2026-10-05T10:00:00Z");
    expect(teamStatusText(teams.find(team.id)!, activities.listThrough("2026-10-04"), teams.today())).toContain("🎉");
  });

  it("rounds percentage targets up and recalculates them when people join and leave", () => {
    const team = teams.create({ ...input, goal: { kind: "participation", target: 75 } }, "U1");
    for (const user of ["U2", "U3", "U4", "U5"]) teams.membership(team.id, user, true);
    for (const user of ["U1", "U2", "U3"]) log(user);
    now("2026-10-04T10:00:00Z");
    expect(progress(team.id)).toMatchObject({ target: 4, value: 3, reached: false });
    teams.membership(team.id, "U5", false);
    expect(progress(team.id)).toMatchObject({ target: 3, value: 3, reached: true });
  });

  it("keeps a minutes goal fixed and counts all minutes without doubling channel totals", () => {
    const team = teams.create({ ...input, goal: { kind: "minutes", target: 300 } }, "U1");
    const second = teams.create(input, "U1");
    teams.membership(team.id, "U2", true);
    log("U1", "2026-10-02", 350);
    now("2026-10-03T10:00:00Z");
    expect(progress(team.id)).toMatchObject({ target: 300, value: 350, reached: true });
    expect(progress(second.id).progress.totalMinutes).toBe(350);
    teams.membership(team.id, "U3", true);
    expect(progress(team.id).target).toBe(300);
    teams.membership(team.id, "U1", false);
    expect(progress(team.id).value).toBe(0);
    expect(activities.totalSparksForParticipant("U1")).toBe(350);
    expect(activities.listBetween(input.startDate, input.endDate)).toHaveLength(1);
    teams.membership(team.id, "U1", true);
    expect(progress(team.id).value).toBe(350);
  });

  it("counts inclusive dates across the weekend, excludes outsiders and future activity, and follows edits", () => {
    const team = teams.create(input, "U1");
    teams.membership(team.id, "U2", true);
    log("U1", "2026-10-01");
    const first = log("U1", "2026-10-02");
    log("U2", "2026-10-04");
    log("U1", "2026-10-05");
    log("OUTSIDER", "2026-10-02");
    now("2026-10-03T10:00:00Z");
    expect(progress(team.id).progress.activityCount).toBe(1);
    now("2026-10-04T10:00:00Z");
    expect(progress(team.id).progress.activityCount).toBe(2);
    activities.updateForParticipant(first.id, "U1", { ...first, minutes: 90, type: "run" });
    expect(progress(team.id).progress.totalMinutes).toBe(120);
    activities.updateForParticipant(first.id, "U1", { ...first, activityDate: "2026-10-01" });
    expect(progress(team.id).progress.activityCount).toBe(1);
    activities.deleteControlledBy(first.id, "U1");
    expect(progress(team.id).progress.totalMinutes).toBe(30);
  });

  it("locks membership only after Oslo's inclusive end date and preserves it after reopening", () => {
    const team = teams.create(input, "U1");
    now("2026-10-04T21:59:59Z");
    teams.membership(team.id, "U2", true);
    now("2026-10-04T22:00:00Z");
    expect(() => teams.membership(team.id, "U3", true)).toThrow("avsluttet");
    expect(() => teams.membership(team.id, "U1", false)).toThrow("avsluttet");
    teams.close();
    teams = new TeamRepository(path, () => clock);
    expect(teams.find(team.id)?.memberIds).toEqual(["U1", "U2"]);
    expect(teams.list().teams).toHaveLength(0);
    expect(teams.list(true).teams[0]?.id).toBe(team.id);
  });

  it("allows only the creator to edit before the start and rejects stale revisions", () => {
    const team = teams.create(input, "U1");
    const changed: TeamInput = { ...input, goal: { kind: "minutes", target: 600 } };
    expect(() => teams.edit(team.id, "U2", team.revision, changed)).toThrow("Bare");
    const updated = teams.edit(team.id, "U1", team.revision, changed);
    expect(updated.goal).toEqual(changed.goal);
    expect(() => teams.edit(team.id, "U1", team.revision, input)).toThrow("endret siden");
    now("2026-10-01T22:00:00Z");
    expect(() => teams.edit(team.id, "U1", updated.revision, { ...input, startDate: "2026-10-03" })).toThrow("låst");
    expect(teams.find(team.id)?.goal).toEqual(changed.goal);
  });

  it("does not mark empty or one-person teams as successful", () => {
    const team = teams.create(input, "U1");
    log("U1");
    now("2026-10-03T10:00:00Z");
    expect(progress(team.id).reached).toBe(false);
    teams.membership(team.id, "U1", false);
    expect(progress(team.id)).toMatchObject({ target: 0, value: 0, reached: false });
    expect(teamStatusText(teams.find(team.id)!, [], teams.today())).toContain("minst to medlemmer");
  });

  it("keeps membership changes from two connections and backs up teams with activities", async () => {
    const existing = log("U1");
    const team = teams.create(input, "U1");
    const other = new TeamRepository(path, () => clock);
    try {
      teams.membership(team.id, "U2", true);
      other.membership(team.id, "U3", true);
      expect(other.find(team.id)?.memberIds).toEqual(["U1", "U2", "U3"]);
      expect(activities.findById(existing.id)).toEqual(existing);
      const backupPath = await createBackup(path, join(folder, "backup"), clock);
      const backup = new DatabaseSync(backupPath, { readOnly: true });
      expect(backup.prepare("SELECT COUNT(*) AS count FROM team_members").get()?.count).toBe(3);
      expect(backup.prepare("SELECT COUNT(*) AS count FROM activities").get()?.count).toBe(1);
      backup.close();
    } finally { other.close(); }
  });

  it("adds team tables to an existing activity database without changing its records", () => {
    const legacyPath = join(folder, "existing.sqlite");
    const legacy = new ActivityRepository(legacyPath);
    const existing = legacy.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "run", minutes: 80, activityDate: "2026-09-29" });
    legacy.setSlackMessageTs(existing.id, "123.456", "FIMAGE");
    const before = legacy.findById(existing.id);
    const migrated = new TeamRepository(legacyPath, () => clock);
    try {
      expect(legacy.findById(existing.id)).toEqual(before);
      expect(migrated.list().teams).toEqual([]);
      expect(migrated.create(input, "U1").memberIds).toEqual(["U1"]);
    } finally { migrated.close(); }
  });

  it("paginates every challenge without imposing a team limit", () => {
    for (let i = 0; i < 23; i++) teams.create({ ...input, name: `Lag ${i}` }, "U1");
    const pages = [teams.list(false, 0), teams.list(false, 1), teams.list(false, 2)];
    expect(pages.map(page => page.hasMore)).toEqual([true, true, false]);
    expect(new Set(pages.flatMap(page => page.teams.map(team => team.id))).size).toBe(23);
  });

  it.each(["minutes", "participation"] as const)("counts only matching activity for a %s goal, including on late joining", kind => {
    const team = teams.create({ ...input, activityType: "run", goal: { kind, target: kind === "minutes" ? 60 : 100 } }, "U1");
    const unrestricted = teams.create(input, "U1");
    log("U1", "2026-10-02", 200);
    const run = activities.create({ participantSlackId: "U2", registeredBySlackId: "HELPER", type: "run", minutes: 60, distanceKm: 8, activityDate: "2026-10-02" });
    now("2026-10-04T10:00:00Z");
    expect(progress(team.id).progress.activityCount).toBe(0);
    teams.membership(team.id, "U2", true);
    expect(progress(team.id)).toMatchObject({
      value: kind === "minutes" ? 60 : 1, target: kind === "minutes" ? 60 : 2,
      reached: kind === "minutes",
      progress: { participants: 1, totalMinutes: 60, distanceKm: 8, activityCount: 1,
        byType: [{ type: "run", minutes: 60, distanceKm: 8 }] },
    });
    expect(progress(unrestricted.id).progress.totalMinutes).toBe(200);
    expect(activities.totalSparksForParticipant("U1")).toBe(200);
    expect(activities.listBetween(input.startDate, input.endDate)).toHaveLength(2);
    activities.updateForParticipant(run.id, "U2", { ...run, type: "cycle" });
    expect(progress(team.id).progress.totalMinutes).toBe(0);
    activities.updateForParticipant(run.id, "U2", { ...run, minutes: 80 });
    expect(progress(team.id).progress.totalMinutes).toBe(80);
    teams.membership(team.id, "U2", false);
    expect(progress(team.id).progress.totalMinutes).toBe(0);
    teams.membership(team.id, "U2", true);
    expect(progress(team.id).progress.totalMinutes).toBe(80);
    activities.deleteControlledBy(run.id, "U2");
    expect(progress(team.id).progress.participants).toBe(0);
  });

  it("allows the creator to change the activity rule only before the start and persists it", () => {
    const team = teams.create(input, "U1");
    const restricted = { ...input, activityType: "ski" as const };
    expect(() => teams.edit(team.id, "U2", team.revision, restricted)).toThrow("Bare");
    const updated = teams.edit(team.id, "U1", team.revision, restricted);
    teams.close();
    teams = new TeamRepository(path, () => clock);
    expect(teams.find(team.id)?.activityType).toBe("ski");
    expect(() => teams.edit(team.id, "U1", team.revision, input)).toThrow("endret siden");
    const all = teams.edit(team.id, "U1", updated.revision, input);
    expect(all.activityType).toBeNull();
    now("2026-10-02T10:00:00Z");
    expect(() => teams.edit(team.id, "U1", all.revision, restricted)).toThrow("låst");
    expect(teams.find(team.id)?.activityType).toBeNull();
  });

  it("migrates existing teams to all activities and preserves memberships, dates, goals and totals", () => {
    const legacyPath = join(folder, "legacy-teams.sqlite");
    const legacyActivities = new ActivityRepository(legacyPath);
    for (const type of ["run", "strength"] as const) legacyActivities.create({ participantSlackId: "U1", registeredBySlackId: "U1", type, minutes: 30, activityDate: input.startDate });
    const database = new DatabaseSync(legacyPath);
    database.exec(`
      CREATE TABLE team_challenges (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE,
        creator_id TEXT NOT NULL, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
        goal_kind TEXT NOT NULL, goal_target INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE team_members (team_id TEXT NOT NULL, slack_id TEXT NOT NULL, PRIMARY KEY(team_id, slack_id));
      INSERT INTO team_challenges VALUES ('old', 'request', 'U1', 'Helgepust', '2026-10-02', '2026-10-04', 'participation', 100, 2);
      INSERT INTO team_members VALUES ('old', 'U1'), ('old', 'U2');
    `);
    database.close();
    for (let attempt = 0; attempt < 2; attempt++) {
      const migrated = new TeamRepository(legacyPath, () => clock);
      try {
        const team = migrated.find("old")!;
        expect(team).toEqual({ ...input, id: "old", creatorId: "U1", memberIds: ["U1", "U2"], revision: 2 });
        const result = teamProgress(team, legacyActivities.listThrough(input.endDate), input.endDate);
        expect(result.progress.totalMinutes).toBe(60);
        expect(result.progress.byType).toHaveLength(2);
      } finally { migrated.close(); }
    }
  });
});

describe("challenge input rules", () => {
  it.each([
    { ...input, name: " " }, { ...input, name: "x".repeat(81) },
    { ...input, startDate: "2026-02-30" }, { ...input, startDate: "2026-09-30" },
    { ...input, endDate: "2026-10-01" }, { ...input, endDate: "2026-11-31" },
    { ...input, goal: { kind: "participation", target: 0 } },
    { ...input, goal: { kind: "participation", target: 101 } },
    { ...input, goal: { kind: "minutes", target: 1.5 } },
    { ...input, goal: { kind: "minutes", target: NaN } },
    { ...input, activityType: "unknown" },
  ] as TeamInput[])("rejects invalid input %#", invalid => {
    expect(() => validateTeam(invalid, "2026-10-01")).toThrow();
  });
  it("allows same-day challenges and dates spanning a year boundary", () => {
    expect(() => validateTeam({ ...input, endDate: input.startDate }, "2026-10-02")).not.toThrow();
    expect(() => validateTeam({ ...input, startDate: "2026-12-31", endDate: "2027-01-02" }, "2026-10-01")).not.toThrow();
  });
  it.each([
    ["2026-10-24T21:59:59Z", "2026-10-24"], ["2026-10-24T22:00:00Z", "2026-10-25"],
    ["2026-10-25T22:59:59Z", "2026-10-25"], ["2026-10-25T23:00:00Z", "2026-10-26"],
  ])("uses Oslo dates across the clock change at %s", (instant, expected) => {
    expect(osloDate(new Date(instant))).toBe(expected);
  });
});
