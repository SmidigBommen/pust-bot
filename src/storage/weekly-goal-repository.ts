import { DatabaseSync } from "node:sqlite";
import { GoalRuleError, nextWeekStart, validateGoals, type WeeklyGoals, type WeeklyGoalSource } from "../domain/weekly-goals.js";
import { weekContaining } from "../domain/week.js";

interface Change extends WeeklyGoals { id: number; effectiveWeek: string; actorId: string; changedAt: string }

/** Append-only goal decisions. Environment values seed the database once. */
export class WeeklyGoalRepository implements WeeklyGoalSource {
  private readonly database: DatabaseSync;
  constructor(path: string, private readonly channelId: string, initial: WeeklyGoals,
    private readonly adminIds: readonly string[], private readonly now: () => Date = () => new Date()) {
    this.database = new DatabaseSync(path);
    this.database.exec(`PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS weekly_goal_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, effective_week TEXT NOT NULL,
        participant_goal INTEGER NOT NULL CHECK(participant_goal > 0), minutes_goal INTEGER NOT NULL CHECK(minutes_goal > 0),
        actor_id TEXT NOT NULL, changed_at TEXT NOT NULL, request_id TEXT NOT NULL,
        UNIQUE(channel_id, request_id));
      CREATE INDEX IF NOT EXISTS weekly_goal_dates ON weekly_goal_changes(channel_id, effective_week, id);
      CREATE TABLE IF NOT EXISTS historical_weekly_goals (
        channel_id TEXT NOT NULL, week_start TEXT NOT NULL, participant_goal INTEGER NOT NULL, minutes_goal INTEGER NOT NULL,
        PRIMARY KEY(channel_id, week_start));`);
    validateGoals(initial);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (!this.revision()) {
        this.insert("0001-01-01", initial, "system", "bootstrap");
        // Import known historical goals without modifying the archived reports.
        const reportsExist = this.database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'weekly_reports'").get();
        if (reportsExist) {
          const rows = this.database.prepare("SELECT week_start, snapshot FROM weekly_reports WHERE channel_id = ?").all(channelId) as { week_start: string; snapshot: string }[];
          for (const row of rows) {
            const report = JSON.parse(row.snapshot) as { goals: WeeklyGoals | null };
            if (report.goals) this.database.prepare("INSERT OR IGNORE INTO historical_weekly_goals VALUES (?, ?, ?, ?)")
              .run(channelId, row.week_start, report.goals.participantGoal, report.goals.minutesGoal);
          }
        }
      }
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  close(): void { this.database.close(); }
  canManage(actor: string): boolean { return this.adminIds.includes(actor); }
  nextWeek(): string { return nextWeekStart(this.now()); }
  revision(): number {
    return (this.database.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM weekly_goal_changes WHERE channel_id = ?").get(this.channelId) as { id: number }).id;
  }
  forWeek(weekStart: string): WeeklyGoals {
    const historical = this.database.prepare("SELECT participant_goal AS participantGoal, minutes_goal AS minutesGoal FROM historical_weekly_goals WHERE channel_id = ? AND week_start = ?").get(this.channelId, weekStart);
    const row = historical ?? this.database.prepare(`SELECT participant_goal AS participantGoal, minutes_goal AS minutesGoal FROM weekly_goal_changes
      WHERE channel_id = ? AND effective_week <= ? ORDER BY effective_week DESC, id DESC LIMIT 1`).get(this.channelId, weekStart);
    if (!row) throw new Error("Ukens mål finnes ikke.");
    return row as unknown as WeeklyGoals;
  }
  history(page = 0): Change[] {
    return this.database.prepare(`SELECT id, effective_week AS effectiveWeek, participant_goal AS participantGoal,
      minutes_goal AS minutesGoal, actor_id AS actorId, changed_at AS changedAt FROM weekly_goal_changes
      WHERE channel_id = ? AND actor_id <> 'system' ORDER BY id DESC LIMIT 10 OFFSET ?`).all(this.channelId, page * 10) as unknown as Change[];
  }
  plan(page = 0): Change[] {
    return this.database.prepare(`SELECT id, effective_week AS effectiveWeek, participant_goal AS participantGoal,
      minutes_goal AS minutesGoal, actor_id AS actorId, changed_at AS changedAt FROM weekly_goal_changes
      WHERE channel_id = ? AND effective_week >= ? AND id IN (
        SELECT MAX(id) FROM weekly_goal_changes WHERE channel_id = ? GROUP BY effective_week)
      ORDER BY effective_week LIMIT 10 OFFSET ?`).all(this.channelId, this.nextWeek(), this.channelId, page * 10) as unknown as Change[];
  }
  schedule(effectiveWeek: string, goals: WeeklyGoals, actor: string, revision: number, requestId: string): void {
    if (!this.canManage(actor)) throw new GoalRuleError("Bare Pust-voktere kan endre ukesmål.");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.database.prepare("SELECT actor_id FROM weekly_goal_changes WHERE channel_id = ? AND request_id = ?").get(this.channelId, requestId) as { actor_id: string } | undefined;
      if (prior?.actor_id === actor) { this.database.exec("COMMIT"); return; }
      if (this.revision() !== revision) throw new GoalRuleError("Målene er endret. Åpne /pust admin på nytt.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveWeek) || !Number.isFinite(Date.parse(effectiveWeek)) ||
          weekContaining(effectiveWeek).start !== effectiveWeek || effectiveWeek < this.nextWeek()) {
        throw new GoalRuleError("Velg en mandag fra neste uke. Tidligere uker er låst.");
      }
      validateGoals(goals);
      this.insert(effectiveWeek, goals, actor, requestId);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  private insert(week: string, goals: WeeklyGoals, actor: string, requestId: string): void {
    this.database.prepare(`INSERT INTO weekly_goal_changes
      (channel_id, effective_week, participant_goal, minutes_goal, actor_id, changed_at, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(this.channelId, week, goals.participantGoal, goals.minutesGoal, actor, this.now().toISOString(), requestId);
  }
}
