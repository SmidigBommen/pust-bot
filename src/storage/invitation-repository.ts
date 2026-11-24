import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { InvitationError, validateInvitation, type Attendance, type Invitation, type InvitationInput } from "../domain/invitation.js";

interface Row {
  id: string; creator_id: string; input: string; starts_at: string; ends_at: string; revision: number;
  cancelled: number; message_ts: string | null; publication: Invitation["publication"];
}

export class InvitationRepository {
  private readonly database: DatabaseSync;
  constructor(path: string, private readonly channelId: string, private readonly now: () => Date = () => new Date()) {
    this.database = new DatabaseSync(path);
    this.database.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, creator_id TEXT NOT NULL, request_id TEXT NOT NULL,
        input TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
        cancelled INTEGER NOT NULL DEFAULT 0, message_ts TEXT,
        publication TEXT NOT NULL DEFAULT 'pending' CHECK(publication IN ('pending','attempted','sent','failed')),
        UNIQUE(channel_id, creator_id, request_id));
      CREATE INDEX IF NOT EXISTS invitations_dates ON invitations(channel_id, starts_at);
      CREATE TABLE IF NOT EXISTS invitation_attendees (
        invitation_id TEXT NOT NULL REFERENCES invitations(id), user_id TEXT NOT NULL,
        response TEXT NOT NULL CHECK(response IN ('going','maybe')), PRIMARY KEY(invitation_id,user_id));
      CREATE TABLE IF NOT EXISTS invitation_followups (
        invitation_id TEXT NOT NULL REFERENCES invitations(id), user_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('attempted','sent','failed')), PRIMARY KEY(invitation_id,user_id));`);
  }
  close(): void { this.database.close(); }
  currentTime(): Date { return this.now(); }
  find(id: string): Invitation | null {
    const row = this.database.prepare("SELECT * FROM invitations WHERE id = ? AND channel_id = ?").get(id, this.channelId) as unknown as Row | undefined;
    if (!row) return null;
    const attendees = this.database.prepare("SELECT user_id AS userId, response FROM invitation_attendees WHERE invitation_id = ? ORDER BY user_id").all(id) as unknown as Invitation["attendees"];
    return { ...JSON.parse(row.input) as InvitationInput, id: row.id, creatorId: row.creator_id, startsAt: row.starts_at, endsAt: row.ends_at,
      revision: row.revision, cancelled: Boolean(row.cancelled), messageTs: row.message_ts, publication: row.publication, attendees };
  }
  require(id: string): Invitation {
    const invitation = this.find(id);
    if (!invitation) throw new InvitationError("Invitasjonen finnes ikke.");
    return invitation;
  }
  list(page = 0): { invitations: Invitation[]; hasMore: boolean } {
    const since = new Date(this.now().getTime() - 7 * 86_400_000).toISOString();
    const rows = this.database.prepare(`SELECT id FROM invitations WHERE channel_id = ? AND ends_at >= ?
      ORDER BY cancelled, starts_at, id LIMIT 6 OFFSET ?`).all(this.channelId, since, Math.max(0, page) * 5) as { id: string }[];
    return { invitations: rows.slice(0, 5).map(row => this.require(row.id)), hasMore: rows.length > 5 };
  }
  create(input: InvitationInput, actor: string, requestId: string): Invitation {
    return this.transaction(() => {
      const prior = this.database.prepare("SELECT id FROM invitations WHERE channel_id = ? AND creator_id = ? AND request_id = ?").get(this.channelId, actor, requestId) as { id: string } | undefined;
      if (prior) return this.require(prior.id);
      const times = validateInvitation(input, this.now());
      const id = randomUUID();
      this.database.prepare("INSERT INTO invitations (id, channel_id, creator_id, request_id, input, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, this.channelId, actor, requestId, JSON.stringify(input), times.startsAt, times.endsAt);
      this.database.prepare("INSERT INTO invitation_attendees VALUES (?, ?, 'going')").run(id, actor);
      return this.require(id);
    });
  }
  edit(id: string, actor: string, revision: number, input: InvitationInput): Invitation {
    return this.transaction(() => {
      const invitation = this.editable(id, actor, revision);
      const times = validateInvitation(input, this.now());
      this.database.prepare("UPDATE invitations SET input = ?, starts_at = ?, ends_at = ?, revision = revision + 1 WHERE id = ?")
        .run(JSON.stringify(input), times.startsAt, times.endsAt, invitation.id);
      if (input.date !== invitation.date || input.time !== invitation.time || input.minutes !== invitation.minutes ||
          input.place !== invitation.place || input.activityType !== invitation.activityType) {
        // A changed plan needs fresh consent; do not send followups for the old commitment.
        this.database.prepare("UPDATE invitation_attendees SET response = 'maybe' WHERE invitation_id = ? AND user_id <> ?").run(id, actor);
      }
      return this.require(id);
    });
  }
  cancel(id: string, actor: string, revision: number): Invitation {
    return this.transaction(() => {
      this.editable(id, actor, revision);
      this.database.prepare("UPDATE invitations SET cancelled = 1, revision = revision + 1 WHERE id = ?").run(id);
      return this.require(id);
    });
  }
  respond(id: string, actor: string, response: Attendance | "declined", revision: number): Invitation {
    return this.transaction(() => {
      const invitation = this.require(id);
      if (invitation.cancelled || this.now().toISOString() >= invitation.startsAt) throw new InvitationError("Påmeldingen er stengt.");
      if (invitation.revision !== revision) throw new InvitationError("Invitasjonen er endret. Åpne detaljer før du svarer.");
      if (response === "declined") this.database.prepare("DELETE FROM invitation_attendees WHERE invitation_id = ? AND user_id = ?").run(id, actor);
      else if (response === "going" || response === "maybe") this.database.prepare(`INSERT INTO invitation_attendees VALUES (?, ?, ?)
        ON CONFLICT(invitation_id,user_id) DO UPDATE SET response = excluded.response`).run(id, actor, response);
      else throw new InvitationError("Ugyldig svar.");
      return this.require(id);
    });
  }
  claimPublication(id: string): boolean {
    this.require(id);
    return this.database.prepare("UPDATE invitations SET publication = 'attempted' WHERE id = ? AND publication = 'pending'").run(id).changes === 1;
  }
  finishPublication(id: string, ts: string | null): void {
    this.require(id);
    this.database.prepare("UPDATE invitations SET publication = ?, message_ts = ? WHERE id = ?").run(ts ? "sent" : "failed", ts, id);
  }
  dueFollowups(): { invitationId: string; userId: string }[] {
    const now = this.now().toISOString();
    const since = new Date(this.now().getTime() - 86_400_000).toISOString();
    return this.database.prepare(`SELECT i.id AS invitationId, a.user_id AS userId FROM invitations i
      JOIN invitation_attendees a ON a.invitation_id = i.id
      LEFT JOIN invitation_followups f ON f.invitation_id = i.id AND f.user_id = a.user_id
      WHERE i.channel_id = ? AND i.cancelled = 0 AND i.ends_at <= ? AND i.ends_at >= ? AND a.response = 'going' AND f.user_id IS NULL
      ORDER BY i.ends_at, a.user_id LIMIT 100`).all(this.channelId, now, since) as unknown as { invitationId: string; userId: string }[];
  }
  claimFollowup(id: string, user: string): boolean {
    return this.transaction(() => {
      const invitation = this.require(id);
      if (invitation.cancelled || this.now().toISOString() < invitation.endsAt || !invitation.attendees.some(a => a.userId === user && a.response === "going")) return false;
      return this.database.prepare("INSERT OR IGNORE INTO invitation_followups VALUES (?, ?, 'attempted')").run(id, user).changes === 1;
    });
  }
  finishFollowup(id: string, user: string, status: "sent" | "failed"): void {
    this.database.prepare("UPDATE invitation_followups SET status = ? WHERE invitation_id = ? AND user_id = ?").run(status, id, user);
  }
  private editable(id: string, actor: string, revision: number): Invitation {
    const invitation = this.require(id);
    if (invitation.creatorId !== actor) throw new InvitationError("Bare arrangøren kan endre invitasjonen.");
    if (invitation.cancelled || this.now().toISOString() >= invitation.startsAt) throw new InvitationError("Invitasjonen er avlyst eller har startet.");
    if (invitation.revision !== revision) throw new InvitationError("Invitasjonen er endret. Åpne den på nytt.");
    return invitation;
  }
  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.database.exec("COMMIT"); return result; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}
