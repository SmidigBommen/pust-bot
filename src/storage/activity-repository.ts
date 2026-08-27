import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Activity, ActivityInput, ActivityType } from "../domain/activity.js";

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
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS activities_participant_date
      ON activities (participant_slack_id, activity_date);
    `);
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

  totalSparksForParticipant(participantSlackId: string): number {
    const row = this.database.prepare(`
      SELECT COALESCE(SUM(minutes), 0) AS total
      FROM activities
      WHERE participant_slack_id = ?
    `).get(participantSlackId) as { total: number };
    return row.total;
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
  };
}
