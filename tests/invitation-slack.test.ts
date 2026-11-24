import type { App } from "@slack/bolt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvitationInput } from "../src/domain/invitation.js";
import { InvitationRepository } from "../src/storage/invitation-repository.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { TeamRepository } from "../src/storage/team-repository.js";
import { registerSlackHandlers } from "../src/slack/register-handlers.js";
import { invitationPost, invitationValue, invitationDetail, invitationForm, invitationAttendees } from "../src/slack/invitation-views.js";

type Handler = (args: any) => Promise<void>;
const input: InvitationInput = { title: "Lunsjtur", activityType: "walk_hike", date: "2026-10-02", time: "12:00", minutes: 30, place: "Inngangen", description: "Rolig tur" };
function state(value: InvitationInput) {
  return { values: {
    title: { value: { value: value.title } }, place: { value: { value: value.place } }, description: { value: { value: value.description } },
    activity_type: { value: { selected_option: { value: value.activityType } } },
    date: { value: { selected_date: value.date } }, time: { value: { selected_time: value.time } }, minutes: { value: { value: String(value.minutes) } },
  } };
}

describe("mobile invitation flows", () => {
  let now: Date, invitations: InvitationRepository, activities: ActivityRepository, teams: TeamRepository;
  let command: Handler;
  let views: Map<string, Handler>, actions: Array<[RegExp | string, Handler]>;
  let client: { views: { open: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> }; chat: { postMessage: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
  const logger = { error: vi.fn() };
  beforeEach(() => {
    now = new Date("2026-10-01T10:00:00Z");
    invitations = new InvitationRepository(":memory:", "CPUST", () => now);
    activities = new ActivityRepository(":memory:"); teams = new TeamRepository(":memory:", () => now);
    views = new Map(); actions = [];
    client = { views: { open: vi.fn().mockResolvedValue({ ok: true }), update: vi.fn().mockResolvedValue({ ok: true }), push: vi.fn().mockResolvedValue({ ok: true }) },
      chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "123.456" }), update: vi.fn().mockResolvedValue({ ok: true }) } };
    const app = { command: (_: string, fn: Handler) => { command = fn; }, view: (key: string, fn: Handler) => views.set(key, fn), action: (key: string | RegExp, fn: Handler) => actions.push([key, fn]) } as unknown as App;
    registerSlackHandlers(app, { teams, repository: activities, invitations, pustChannelId: "CPUST", groupMemberCount: 14, weeklyParticipantGoal: 8, weeklyMinutesGoal: 1200, sendInvitation: async (channel, text, blocks) => { const result = await client.chat.postMessage({ channel, text, blocks }); return result.ts; } });
  });
  afterEach(() => { invitations.close(); activities.close(); teams.close(); vi.clearAllMocks(); });
  async function action(action_id: string, value: string, user = "U1", inModal = false) {
    const handler = actions.find(([key]) => typeof key === "string" ? key === action_id : key.test(action_id))![1];
    const ack = vi.fn();
    await handler({ ack, action: { action_id, value }, body: { user: { id: user }, trigger_id: "T1", ...(inModal ? { view: { id: "V1", hash: "h" } } : {}) }, client, logger });
    expect(ack).toHaveBeenCalledOnce();
  }
  async function submit(value = input, user = "U1", metadata: object = { requestId: "req" }) {
    const ack = vi.fn();
    await views.get("pust_invite_save")!({ ack, body: { user: { id: user } }, view: { id: "V1", private_metadata: JSON.stringify(metadata), state: state(value) }, client, logger });
    expect(ack).toHaveBeenCalledOnce();
    return ack.mock.calls[0]![0];
  }

  it("opens the overview, creates once, and posts only four text lines plus three short buttons", async () => {
    await command({ ack: vi.fn(), command: { text: "inviter", user_id: "U1", trigger_id: "T1" }, client });
    expect(client.views.open.mock.calls[0]![0].view.title.text).toBe("Invitasjoner");
    await action("pust_invite_create", "new", "U1", true);
    expect(client.views.update.mock.calls[0]![0].view.callback_id).toBe("pust_invite_save");
    await submit(); await submit();
    expect(invitations.list().invitations).toHaveLength(1);
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const post = client.chat.postMessage.mock.calls[0]![0];
    expect(post.text.split("\n")).toHaveLength(4);
    expect(post.text).not.toContain(input.description);
    expect(post.blocks).toHaveLength(2);
    expect(post.blocks[1].elements.map((element: any) => element.text.text)).toEqual(["Blir med", "Kanskje", "Detaljer"]);
    expect(activities.listThrough(input.date)).toEqual([]);
  });

  it("keeps descriptions and participant lists in modals and records each clicking user's response", async () => {
    await submit();
    const invite = invitations.list().invitations[0]!;
    await action("pust_invite_going", invitationValue(invite), "U2");
    expect(invitations.require(invite.id).attendees).toContainEqual({ userId: "U2", response: "going" });
    const detail = client.views.open.mock.calls.at(-1)![0].view;
    expect(JSON.stringify(detail)).toContain("Rolig tur");
    expect(JSON.stringify(detail)).not.toContain("<@U2>");
    await action("pust_invite_attendees", invite.id, "U2", true);
    expect(JSON.stringify(client.views.push.mock.calls.at(-1)![0].view)).toContain("<@U2>");
    await action("pust_invite_declined", invitationValue(invite), "U2", true);
    expect(invitations.require(invite.id).attendees).toHaveLength(1);
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
  });

  it("prefills the existing activity form after the event without creating an activity", async () => {
    const invite = invitations.create(input, "U1", "req");
    await action("pust_invite_log", invite.id, "U2");
    expect(JSON.stringify(client.views.open.mock.calls.at(-1)![0].view)).toContain("etter aktiviteten");
    now = new Date(invite.endsAt);
    await action("pust_invite_log", invite.id, "U2");
    const form = client.views.open.mock.calls.at(-1)![0].view;
    expect(form.callback_id).toBe("pust_log_activity");
    expect(form.blocks.find((b: any) => b.block_id === "participant").element.initial_user).toBe("U2");
    expect(form.blocks.find((b: any) => b.block_id === "activity_type").element.initial_option.value).toBe("walk_hike");
    expect(form.blocks.find((b: any) => b.block_id === "minutes").element.initial_value).toBe("30");
    expect(form.blocks.find((b: any) => b.block_id === "activity_date").element.initial_date).toBe("2026-10-02");
    expect(form.blocks.find((b: any) => b.block_id === "distance").element.initial_value).toBeUndefined();
    expect(activities.listThrough(input.date)).toEqual([]);
  });

  it("updates the same channel post on organizer edits and cancellation, and rejects forged submissions", async () => {
    await submit();
    const invite = invitations.list().invitations[0]!;
    const metadata = { id: invite.id, revision: 0, requestId: "edit" };
    const denied = await submit({ ...input, time: "13:00" }, "U2", metadata);
    expect(denied.response_action).toBe("errors");
    await submit({ ...input, time: "13:00" }, "U1", metadata);
    expect(client.chat.update.mock.calls.at(-1)![0]).toMatchObject({ channel: "CPUST", ts: "123.456", text: expect.stringContaining("13:00") });
    await action("pust_invite_cancel", `${invite.id}:1`, "U1", true);
    expect(client.chat.update.mock.calls.at(-1)![0].text).toContain("Avlyst");
    expect(client.chat.update.mock.calls.at(-1)![0].blocks[1].elements).toHaveLength(1);
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
  });

  it("does not publish invalid forms, and keeps saved invitations after an ambiguous Slack failure", async () => {
    expect((await submit({ ...input, minutes: 5 })).errors).toHaveProperty("minutes");
    expect(invitations.list().invitations).toHaveLength(0);
    client.chat.postMessage.mockRejectedValueOnce(new Error("timeout"));
    await submit();
    await submit();
    expect(invitations.list().invitations).toHaveLength(1);
    expect(invitations.list().invitations[0]!.publication).toBe("failed");
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    expect(JSON.stringify(client.views.update.mock.calls.at(-1)![0].view)).toContain("kunne ikke bekreftes");
  });

  it("escapes mentions and keeps action groups and text within mobile-friendly limits", () => {
    const invite = invitations.create({ ...input, title: "Tur <!channel>", place: "<@U2> & inngangen", description: "<!here>" }, "U1", "req");
    const post = invitationPost(invite, now);
    expect(post.text).not.toContain("<!channel>");
    expect(post.text).toContain("&lt;!channel&gt;");
    expect(post.text).toContain("&lt;@U2&gt; &amp;");
    const all = [invitationDetail(invite, "U1", now), invitationAttendees(invite), invitationForm({ requestId: "req" }, input)];
    for (const view of all) for (const block of view.blocks) {
      if (block.type === "actions") {
        expect(block.elements.length).toBeLessThanOrEqual(2);
        expect(new Set(block.elements.map((e: any) => e.action_id)).size).toBe(block.elements.length);
      }
      if (block.type === "section" && block.text) expect(block.text.text.length).toBeLessThan(3000);
    }
  });
});
