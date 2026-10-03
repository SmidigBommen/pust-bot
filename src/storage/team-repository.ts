import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { activityTypes } from "../domain/activity.js";
import { osloDate, TeamRuleError, validateTeam, type TeamChallenge, type TeamInput } from "../domain/team-challenge.js";

interface TeamRow {
  id: string; creator_id: string; name: string; start_date: string; end_date: string;
  goal_kind: TeamInput["goal"]["kind"]; goal_target: number; revision: number;
  activity_type: TeamInput["activityType"];
}

/** Owns team rules and atomic membership changes; activities remain in the existing log. */
export class TeamRepository {
  private readonly database: DatabaseSync;

  constructor(path: string, private readonly now: () => Date = () => new Date()) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS team_challenges (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        creator_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL CHECK (end_date >= start_date),
        goal_kind TEXT NOT NULL CHECK (goal_kind IN ('participation', 'minutes')),
        goal_target INTEGER NOT NULL CHECK (goal_target > 0 AND (goal_kind = 'minutes' OR goal_target <= 100)),
        revision INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS team_members (
        team_id TEXT NOT NULL REFERENCES team_challenges(id),
        slack_id TEXT NOT NULL,
        PRIMARY KEY (team_id, slack_id)
      );
    `);
    const columns = this.database.prepare("PRAGMA table_info(team_challenges)").all() as { name: string }[];
    if (!columns.some(column => column.name === "activity_type")) {
      // NULL preserves the all-activities rule for every existing team.
      this.database.exec(`ALTER TABLE team_challenges ADD COLUMN activity_type TEXT
        CHECK (activity_type IS NULL OR activity_type IN (${activityTypes.map(type => `'${type}'`).join(", ")}))`);
    }
  }

  close(): void { this.database.close(); }
  today(): string { return osloDate(this.now()); }

  find(id: string): TeamChallenge | null {
    const row = this.database.prepare("SELECT * FROM team_challenges WHERE id = ?").get(id) as unknown as TeamRow | undefined;
    if (!row) return null;
    const members = this.database.prepare("SELECT slack_id FROM team_members WHERE team_id = ? ORDER BY slack_id").all(id) as unknown as { slack_id: string }[];
    return {
      id: row.id, creatorId: row.creator_id, name: row.name, startDate: row.start_date,
      endDate: row.end_date, goal: { kind: row.goal_kind, target: row.goal_target },
      activityType: row.activity_type,
      memberIds: members.map(member => member.slack_id), revision: row.revision,
    };
  }

  list(closed = false, page = 0): { teams: TeamChallenge[]; hasMore: boolean } {
    const rows = this.database.prepare(`SELECT id FROM team_challenges
      WHERE end_date ${closed ? "<" : ">="} ? ORDER BY start_date ${closed ? "DESC" : "ASC"}, id
      LIMIT 11 OFFSET ?`).all(this.today(), Math.max(0, page) * 10) as unknown as { id: string }[];
    return { teams: rows.slice(0, 10).map(row => this.find(row.id)!), hasMore: rows.length > 10 };
  }

  create(input: TeamInput, creatorId: string, requestId: string = randomUUID()): TeamChallenge {
    return this.transaction(() => {
      const prior = this.database.prepare("SELECT id FROM team_challenges WHERE request_id = ? AND creator_id = ?").get(requestId, creatorId) as { id: string } | undefined;
      if (prior) return this.find(prior.id)!;
      validateTeam(input, this.today());
      const id = randomUUID();
      this.database.prepare(`INSERT INTO team_challenges
        (id, request_id, creator_id, name, start_date, end_date, goal_kind, goal_target, activity_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, requestId, creatorId, input.name.trim(), input.startDate, input.endDate, input.goal.kind, input.goal.target, input.activityType);
      this.database.prepare("INSERT INTO team_members (team_id, slack_id) VALUES (?, ?)").run(id, creatorId);
      return this.find(id)!;
    });
  }

  edit(id: string, actorId: string, revision: number, input: TeamInput): TeamChallenge {
    return this.transaction(() => {
      const team = this.requireTeam(id);
      if (team.creatorId !== actorId) throw new TeamRuleError("Bare den som opprettet laget kan endre utfordringen.");
      if (this.today() >= team.startDate) throw new TeamRuleError("Utfordringen har startet. Aktivitetstype, mål og datoer er låst.");
      if (team.revision !== revision) throw new TeamRuleError("Utfordringen er endret siden skjemaet ble åpnet. Åpne laget på nytt.");
      validateTeam(input, this.today());
      this.database.prepare(`UPDATE team_challenges SET name = ?, start_date = ?, end_date = ?, goal_kind = ?, goal_target = ?, activity_type = ?, revision = revision + 1 WHERE id = ?`)
        .run(input.name.trim(), input.startDate, input.endDate, input.goal.kind, input.goal.target, input.activityType, id);
      return this.find(id)!;
    });
  }

  membership(id: string, actorId: string, join: boolean): TeamChallenge {
    return this.transaction(() => {
      const team = this.requireTeam(id);
      if (this.today() > team.endDate) throw new TeamRuleError("Utfordringen er avsluttet. Medlemslisten er låst.");
      if (join) this.database.prepare("INSERT OR IGNORE INTO team_members (team_id, slack_id) VALUES (?, ?)").run(id, actorId);
      else this.database.prepare("DELETE FROM team_members WHERE team_id = ? AND slack_id = ?").run(id, actorId);
      return this.find(id)!;
    });
  }

  private requireTeam(id: string): TeamChallenge {
    const team = this.find(id);
    if (!team) throw new TeamRuleError("Laget finnes ikke.");
    return team;
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
