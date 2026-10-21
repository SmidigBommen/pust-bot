import { DatabaseSync } from "node:sqlite";
import type { WeeklyReport } from "../domain/weekly-report.js";

interface ArchiveState { firstWeek: string; startedAt: string }

/** A channel-scoped archive. Inserts cannot overwrite a published week. */
export class ReportRepository {
  private readonly database: DatabaseSync;

  constructor(path: string, private readonly channelId: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS report_archives (
        channel_id TEXT PRIMARY KEY,
        first_week TEXT NOT NULL,
        started_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS weekly_reports (
        channel_id TEXT NOT NULL,
        week_start TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        PRIMARY KEY (channel_id, week_start)
      );
    `);
  }

  close(): void { this.database.close(); }

  state(): ArchiveState | null {
    const row = this.database.prepare("SELECT first_week, started_at FROM report_archives WHERE channel_id = ?")
      .get(this.channelId) as { first_week: string; started_at: string } | undefined;
    return row ? { firstWeek: row.first_week, startedAt: row.started_at } : null;
  }

  initialize(state: ArchiveState, reports: readonly WeeklyReport[]): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (!this.state()) {
        for (const report of reports) this.save(report);
        this.database.prepare("INSERT INTO report_archives (channel_id, first_week, started_at) VALUES (?, ?, ?)")
          .run(this.channelId, state.firstWeek, state.startedAt);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  save(report: WeeklyReport): WeeklyReport {
    this.database.prepare(`INSERT INTO weekly_reports (channel_id, week_start, snapshot) VALUES (?, ?, ?)
      ON CONFLICT (channel_id, week_start) DO NOTHING`)
      .run(this.channelId, report.range.start, JSON.stringify(report));
    return this.find(report.range.start)!;
  }

  find(weekStart: string): WeeklyReport | null {
    const row = this.database.prepare("SELECT snapshot FROM weekly_reports WHERE channel_id = ? AND week_start = ?")
      .get(this.channelId, weekStart) as { snapshot: string } | undefined;
    return row ? JSON.parse(row.snapshot) as WeeklyReport : null;
  }

  list(): WeeklyReport[] {
    const rows = this.database.prepare("SELECT snapshot FROM weekly_reports WHERE channel_id = ? ORDER BY week_start DESC")
      .all(this.channelId) as { snapshot: string }[];
    return rows.map(row => JSON.parse(row.snapshot) as WeeklyReport);
  }
}
