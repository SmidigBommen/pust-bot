import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Activity, ActivityInput, ActivityType } from "../domain/activity.js";
import type { AchievementKey } from "../domain/achievements.js";

interface ActivityRow {
  id: string;
  participant_slack_id: string;
  registered_by_slack_id: string;
  activity_type: ActivityType;
  minutes: number;
  distance_km: number | null;
  comment: string | null;
  activity_date: string;
  created_at: string;
  slack_message_ts: string | null;
  slack_image_file_id: string | null;
}

export class ActivityRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        participant_slack_id TEXT NOT NULL,
        registered_by_slack_id TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        minutes INTEGER NOT NULL CHECK (minutes >= 10),
        distance_km REAL,
        comment TEXT,
        activity_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        slack_message_ts TEXT
      );

      CREATE INDEX IF NOT EXISTS activities_participant_date
      ON activities (participant_slack_id, activity_date);

      CREATE TABLE IF NOT EXISTS achievement_awards (
        slack_id TEXT NOT NULL,
        achievement_key TEXT NOT NULL,
        awarded_at TEXT NOT NULL,
        PRIMARY KEY (slack_id, achievement_key)
      );
    `);

    const columns = this.database.prepare("PRAGMA table_info(activities)").all() as unknown as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === "slack_message_ts")) {
      this.database.exec("ALTER TABLE activities ADD COLUMN slack_message_ts TEXT;");
    }
    if (!columns.some((column) => column.name === "slack_image_file_id")) {
      this.database.exec("ALTER TABLE activities ADD COLUMN slack_image_file_id TEXT;");
    }
  }

  create(input: ActivityInput): Activity {
    const activity: Activity = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.database.prepare(`
      INSERT INTO activities (
        id, participant_slack_id, registered_by_slack_id, activity_type,
        minutes, distance_km, comment, activity_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      activity.id,
      activity.participantSlackId,
      activity.registeredBySlackId,
      activity.type,
      activity.minutes,
      activity.distanceKm ?? null,
      activity.comment ?? null,
      activity.activityDate,
      activity.createdAt,
    );

    return activity;
  }

  findById(id: string): Activity | null {
    const row = this.database.prepare("SELECT * FROM activities WHERE id = ?").get(id) as
      | ActivityRow
      | undefined;
    return row ? mapRow(row) : null;
  }

  listBetween(startDate: string, endDate: string): Activity[] {
    const rows = this.database.prepare(`
      SELECT * FROM activities
      WHERE activity_date BETWEEN ? AND ?
      ORDER BY activity_date, created_at
    `).all(startDate, endDate) as unknown as ActivityRow[];
    return rows.map(mapRow);
  }

  listThrough(endDate: string): Activity[] {
    const rows = this.database.prepare(`
      SELECT * FROM activities
      WHERE activity_date <= ?
      ORDER BY activity_date, created_at
    `).all(endDate) as unknown as ActivityRow[];
    return rows.map(mapRow);
  }

  totalSparksForParticipant(participantSlackId: string): number {
    const row = this.database.prepare(`
      SELECT COALESCE(SUM(minutes), 0) AS total
      FROM activities
      WHERE participant_slack_id = ?
    `).get(participantSlackId) as { total: number };
    return row.total;
  }

  setSlackMessageTs(id: string, slackMessageTs: string, slackImageFileId?: string): void {
    this.database.prepare("UPDATE activities SET slack_message_ts = ?, slack_image_file_id = ? WHERE id = ?").run(
      slackMessageTs,
      slackImageFileId ?? null,
      id,
    );
  }

  listRecentControlledBy(slackId: string, limit = 10): Activity[] {
    const rows = this.database.prepare(`
      SELECT * FROM activities
      WHERE participant_slack_id = ? OR registered_by_slack_id = ?
      ORDER BY activity_date DESC, created_at DESC
      LIMIT ?
    `).all(slackId, slackId, limit) as unknown as ActivityRow[];
    return rows.map(mapRow);
  }

  listRecentForParticipant(slackId: string, limit = 10): Activity[] {
    const rows = this.database.prepare(`
      SELECT * FROM activities
      WHERE participant_slack_id = ?
      ORDER BY activity_date DESC, created_at DESC
      LIMIT ?
    `).all(slackId, limit) as unknown as ActivityRow[];
    return rows.map(mapRow);
  }

  updateForParticipant(id: string, slackId: string, input: ActivityInput): Activity | null {
    const existing = this.findById(id);
    if (!existing || existing.participantSlackId !== slackId) return null;

    this.database.prepare(`
      UPDATE activities SET
        activity_type = ?, minutes = ?, distance_km = ?, comment = ?, activity_date = ?
      WHERE id = ? AND participant_slack_id = ?
    `).run(
      input.type,
      input.minutes,
      input.distanceKm ?? null,
      input.comment ?? null,
      input.activityDate,
      id,
      slackId,
    );
    return this.findById(id);
  }

  deleteControlledBy(id: string, slackId: string): Activity | null {
    const activity = this.findById(id);
    if (
      !activity ||
      (activity.participantSlackId !== slackId && activity.registeredBySlackId !== slackId)
    ) {
      return null;
    }

    this.database.prepare(`
      DELETE FROM activities
      WHERE id = ? AND (participant_slack_id = ? OR registered_by_slack_id = ?)
    `).run(id, slackId, slackId);
    return activity;
  }

  awardAchievement(slackId: string, achievementKey: AchievementKey): boolean {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO achievement_awards (slack_id, achievement_key, awarded_at)
      VALUES (?, ?, ?)
    `).run(slackId, achievementKey, new Date().toISOString());
    return Number(result.changes) === 1;
  }
}

function mapRow(row: ActivityRow): Activity {
  return {
    id: row.id,
    participantSlackId: row.participant_slack_id,
    registeredBySlackId: row.registered_by_slack_id,
    type: row.activity_type,
    minutes: row.minutes,
    ...(row.distance_km === null ? {} : { distanceKm: row.distance_km }),
    ...(row.comment === null ? {} : { comment: row.comment }),
    activityDate: row.activity_date,
    createdAt: row.created_at,
    ...(row.slack_message_ts === null ? {} : { slackMessageTs: row.slack_message_ts }),
    ...(row.slack_image_file_id === null ? {} : { slackImageFileId: row.slack_image_file_id }),
  };
}
