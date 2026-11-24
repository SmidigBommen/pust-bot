import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invitationInstant, validateInvitation, type InvitationInput } from "../src/domain/invitation.js";
import { InvitationRepository } from "../src/storage/invitation-repository.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { sendInvitationFollowups, startInvitationFollowups } from "../src/invitation-followups.js";

const input: InvitationInput = { title: "Lunsjtur", activityType: "walk_hike", date: "2026-10-02", time: "12:00", minutes: 30, place: "Inngangen", description: "Rolig tur" };

describe("shared invitations", () => {
  let folder: string, path: string, now: Date;
  let invitations: InvitationRepository;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "pust-invites-")); path = join(folder, "test.sqlite");
    now = new Date("2026-10-01T10:00:00Z");
    invitations = new InvitationRepository(path, "C1", () => now);
  });
  afterEach(() => { invitations.close(); rmSync(folder, { recursive: true, force: true }); vi.useRealTimers(); });

  it("persists invitations and RSVP changes, with no activities created by signing up", () => {
    const activities = new ActivityRepository(path);
    const invite = invitations.create(input, "U1", "request");
    expect(invitations.create(input, "U1", "request").id).toBe(invite.id);
    expect(invite).toMatchObject({ startsAt: "2026-10-02T10:00:00.000Z", endsAt: "2026-10-02T10:30:00.000Z", attendees: [{ userId: "U1", response: "going" }] });
    invitations.respond(invite.id, "U2", "going", 0);
    invitations.respond(invite.id, "U2", "going", 0);
    invitations.respond(invite.id, "U2", "maybe", 0);
    expect(invitations.require(invite.id).attendees).toHaveLength(2);
    expect(invitations.require(invite.id).attendees[1]?.response).toBe("maybe");
    invitations.close(); invitations = new InvitationRepository(path, "C1", () => now);
    expect(invitations.require(invite.id).attendees).toHaveLength(2);
    invitations.respond(invite.id, "U2", "declined", 0);
    expect(invitations.require(invite.id).attendees).toHaveLength(1);
    expect(activities.listThrough("2026-12-31")).toEqual([]);
    expect(activities.totalSparksForParticipant("U1")).toBe(0);
    activities.close();
    const otherChannel = new InvitationRepository(path, "C2", () => now);
    expect(otherChannel.find(invite.id)).toBeNull();
    otherChannel.close();
  });

  it("guards organizer edits, stale forms and old RSVP buttons, and asks for reconfirmation when plans change", () => {
    const invite = invitations.create(input, "U1", "request");
    invitations.respond(invite.id, "U2", "going", 0);
    expect(() => invitations.edit(invite.id, "U2", 0, input)).toThrow("arrangøren");
    expect(() => invitations.cancel(invite.id, "U2", 0)).toThrow("arrangøren");
    const updated = invitations.edit(invite.id, "U1", 0, { ...input, time: "13:00" });
    expect(updated.revision).toBe(1);
    expect(updated.attendees[1]?.response).toBe("maybe");
    expect(() => invitations.respond(invite.id, "U3", "going", 0)).toThrow("endret");
    expect(() => invitations.edit(invite.id, "U1", 0, input)).toThrow("endret");
    invitations.respond(invite.id, "U2", "going", 1);
    const descriptionEdit = invitations.edit(invite.id, "U1", 1, { ...input, time: "13:00", description: "Ta med vann" });
    expect(descriptionEdit.attendees[1]?.response).toBe("going");
    invitations.cancel(invite.id, "U1", 2);
    expect(() => invitations.respond(invite.id, "U2", "going", 3)).toThrow("stengt");
    expect(() => invitations.edit(invite.id, "U1", 3, input)).toThrow("avlyst");
  });

  it("locks edits and RSVPs at the event start", () => {
    const invite = invitations.create(input, "U1", "request");
    now = new Date(invite.startsAt);
    expect(() => invitations.respond(invite.id, "U2", "going", 0)).toThrow("stengt");
    expect(() => invitations.edit(invite.id, "U1", 0, { ...input, date: "2026-10-03" })).toThrow("startet");
    expect(() => invitations.cancel(invite.id, "U1", 0)).toThrow("startet");
  });

  it("claims channel publication once across independent connections and restarts", () => {
    const invite = invitations.create(input, "U1", "request");
    const another = new InvitationRepository(path, "C1", () => now);
    expect(invitations.claimPublication(invite.id)).toBe(true);
    expect(another.claimPublication(invite.id)).toBe(false);
    invitations.finishPublication(invite.id, "123.456");
    expect(another.require(invite.id)).toMatchObject({ publication: "sent", messageTs: "123.456" });
    another.close();
  });

  it("offers logging once after the end to going participants only, without automatic logging", async () => {
    const activities = new ActivityRepository(path);
    const invite = invitations.create(input, "U1", "request");
    invitations.respond(invite.id, "U2", "going", 0);
    invitations.respond(invite.id, "U3", "maybe", 0);
    invitations.respond(invite.id, "U4", "going", 0);
    invitations.respond(invite.id, "U4", "declined", 0);
    const postMessage = vi.fn().mockResolvedValue({ ok: true });
    const send = async (channel: string, text: string, blocks?: unknown[]) => { await postMessage({ channel, text, blocks }); return "123.456"; };
    const logger = { error: vi.fn() };
    now = new Date("2026-10-02T10:29:59Z");
    await sendInvitationFollowups(invitations, send, logger);
    expect(postMessage).not.toHaveBeenCalled();
    now = new Date(invite.endsAt);
    await sendInvitationFollowups(invitations, send, logger);
    expect(postMessage.mock.calls.map(call => call[0].channel)).toEqual(["U1", "U2"]);
    expect(postMessage.mock.calls[0]![0].blocks[1].elements[0]).toMatchObject({ action_id: "pust_invite_log", value: invite.id });
    invitations.close(); invitations = new InvitationRepository(path, "C1", () => now);
    await sendInvitationFollowups(invitations, send, logger);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(activities.listThrough(input.date)).toEqual([]);
    activities.close();
  });

  it("skips cancelled or old events and never retries an ambiguous send failure", async () => {
    const cancelled = invitations.create(input, "U1", "cancelled");
    invitations.cancel(cancelled.id, "U1", 0);
    invitations.create(input, "U2", "failed");
    const postMessage = vi.fn().mockRejectedValue(new Error("timeout"));
    const send = async (channel: string, text: string, blocks?: unknown[]) => { await postMessage({ channel, text, blocks }); return "123.456"; };
    const logger = { error: vi.fn() };
    now = new Date("2026-10-02T11:00:00Z");
    await sendInvitationFollowups(invitations, send, logger);
    await sendInvitationFollowups(invitations, send, logger);
    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0]![0].channel).toBe("U2");
    now = new Date("2026-10-03T11:00:00Z");
    expect(invitations.dueFollowups()).toEqual([]);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("runs followups on a timer and stops cleanly", async () => {
    vi.useFakeTimers();
    const invite = invitations.create(input, "U1", "timer");
    now = new Date(invite.endsAt);
    const postMessage = vi.fn().mockResolvedValue({ ok: true });
    const stop = startInvitationFollowups(invitations, async (channel, text, blocks) => { await postMessage({ channel, text, blocks }); return "123.456"; }, { error: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(postMessage).toHaveBeenCalledOnce();
    await stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("paginates the list and omits events older than a week", () => {
    for (let i = 0; i < 6; i++) invitations.create({ ...input, title: `Tur ${i}` }, "U1", String(i));
    expect(invitations.list()).toMatchObject({ hasMore: true });
    expect(invitations.list().invitations).toHaveLength(5);
    expect(invitations.list(1).invitations).toHaveLength(1);
    now = new Date("2026-10-10T12:00:00Z");
    expect(invitations.list().invitations).toHaveLength(0);
  });
});

it.each([
  ["2026-01-15", "12:00", "2026-01-15T11:00:00.000Z"],
  ["2026-07-15", "12:00", "2026-07-15T10:00:00.000Z"],
  ["2026-03-29", "03:30", "2026-03-29T01:30:00.000Z"],
  ["2026-10-25", "03:30", "2026-10-25T02:30:00.000Z"],
])("interprets %s %s in Oslo", (date, time, expected) => expect(invitationInstant(date, time).toISOString()).toBe(expected));

it.each([["2026-03-29", "02:30"], ["2026-10-25", "02:30"], ["2026-02-30", "12:00"], ["2026-10-02", "24:00"]])(
  "rejects invalid or ambiguous local time %s %s", (date, time) => expect(() => invitationInstant(date, time)).toThrow());

it.each([
  { ...input, title: "" }, { ...input, title: "x".repeat(61) }, { ...input, place: "" },
  { ...input, description: "x".repeat(281) }, { ...input, minutes: 9 }, { ...input, minutes: 30.5 },
  { ...input, activityType: "unknown" }, { ...input, date: "2026-09-30" },
] as InvitationInput[])("rejects malformed invitation %#", value => expect(() => validateInvitation(value, new Date("2026-10-01T10:00:00Z"))).toThrow());
