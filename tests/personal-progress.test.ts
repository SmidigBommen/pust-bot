import type { AllMiddlewareArgs, App, SlackCommandMiddlewareArgs, SlackViewMiddlewareArgs, ViewSubmitAction } from "@slack/bolt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { TeamRepository } from "../src/storage/team-repository.js";
import { registerSlackHandlers } from "../src/slack/register-handlers.js";
import { LOG_ACTIVITY_CALLBACK_ID } from "../src/slack/activity-modal.js";
import { EDIT_ACTIVITY_CALLBACK_ID } from "../src/slack/edit-activity-modal.js";
import { DELETE_ACTIVITY_CALLBACK_ID } from "../src/slack/delete-activity-modal.js";

type ViewHandler = (args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) => Promise<void>;
type CommandHandler = (args: SlackCommandMiddlewareArgs & AllMiddlewareArgs) => Promise<void>;
const values = {
  participant: { value: { selected_user: "U1" } },
  activity_type: { value: { selected_option: { value: "run" } } },
  minutes: { value: { value: "40" } },
  activity_date: { value: { selected_date: "2026-10-01" } },
};

describe("personal progress and records", () => {
  let repository: ActivityRepository;
  let teams: TeamRepository;
  let handlers: Map<string, ViewHandler>;
  let command: CommandHandler;
  let client: { chat: {
    postMessage: ReturnType<typeof vi.fn>;
    postEphemeral: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } };
  const logger = { error: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    repository = new ActivityRepository(":memory:");
    teams = new TeamRepository(":memory:");
    handlers = new Map();
    const app = {
      action: vi.fn(),
      command: (_: string, handler: CommandHandler) => { command = handler; },
      view: (id: string, handler: ViewHandler) => handlers.set(id, handler),
    } as unknown as App;
    client = { chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "123.456" }),
      postEphemeral: vi.fn().mockResolvedValue({ ok: true }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    } };
    registerSlackHandlers(app, {
      repository, teams, pustChannelId: "CPUST", groupMemberCount: 14,
      weeklyParticipantGoal: 4, weeklyMinutesGoal: 240,
    });
  });
  afterEach(() => { repository.close(); teams.close(); vi.useRealTimers(); vi.clearAllMocks(); });

  async function submit(callback = LOG_ACTIVITY_CALLBACK_ID, stateValues: object = values, id = "", user = "U1") {
    const ack = vi.fn();
    await handlers.get(callback)!({
      ack, client, logger, body: { user: { id: user } },
      view: { state: { values: stateValues }, private_metadata: id },
    } as unknown as Parameters<ViewHandler>[0]);
    return ack;
  }

  async function personalCommand(user = "U1") {
    const respond = vi.fn();
    await command({ ack: vi.fn(), command: { text: "meg", user_id: user }, respond } as unknown as Parameters<CommandHandler>[0]);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ response_type: "ephemeral" }));
    return respond.mock.calls[0]![0].text as string;
  }

  it("shows existing history privately without publishing retrospective celebrations", async () => {
    expect(await personalCommand()).not.toContain("Personlige rekorder");
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "run", minutes: 60, distanceKm: 8.25, activityDate: "2025-01-01" });
    const text = await personalCommand();
    expect(text).toContain("*Personlige rekorder i Pust*");
    expect(text).toContain("*Løping* · Lengste økt: 60 minutter · Lengste distanse: 8,25 km");
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("shows a first baseline and ties without celebrating them", async () => {
    await submit();
    expect(client.chat.postMessage.mock.calls[0]![0].text).not.toContain("Ny personlig rekord");
    expect(await personalCommand()).toContain("*Løping* · Lengste økt: 40 minutter");
    expect(await personalCommand()).not.toContain("Lengste distanse");
    await submit();
    expect(client.chat.postMessage.mock.calls[1]![0].text).not.toContain("Ny personlig rekord");
  });

  it.each([false, true])("celebrates both records in the activity post and updates private status, image=%s", async withImage => {
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "run", minutes: 30, distanceKm: 6.5, activityDate: "2026-09-24" });
    const image = { id: "FIMAGE", mimetype: "image/jpeg", filetype: "jpg" };
    await submit(LOG_ACTIVITY_CALLBACK_ID, {
      ...values, distance: { value: { value: "8.25" } },
      ...(withImage ? { image: { value: { files: [image] } } } : {}),
    });
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const post = client.chat.postMessage.mock.calls[0]![0];
    expect(post.text).toContain("Ny personlig rekord i løping!");
    expect(post.text).toContain("Lengste distanse: 8,25 km. Tidligere rekord: 6,5 km.");
    expect(post.text).toContain("Lengste økt: 40 minutter. Tidligere rekord: 30 minutter.");
    expect(post.text).toContain("+40 Sparks");
    expect(post.text).toContain("+20 Sparks i rekordbonus");
    if (withImage) expect(post.blocks[0].text.text).toBe(post.text);
    const status = await personalCommand();
    expect(status).toContain("*Løping* · Lengste økt: 40 minutter · Lengste distanse: 8,25 km");
    expect(client.chat.postEphemeral).toHaveBeenCalledExactlyOnceWith({ channel: "CPUST", user: "U1", text: status });
    expect(repository.totalSparksForParticipant("U1")).toBe(90);
    expect(status).toContain("Dine Sparks: 90");
  });

  it("assigns assisted records to the participant, using that person's history", async () => {
    repository.create({ participantSlackId: "U2", registeredBySlackId: "U2", type: "run", minutes: 30, activityDate: "2026-09-24" });
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "run", minutes: 100, activityDate: "2026-09-24" });
    await submit(LOG_ACTIVITY_CALLBACK_ID, { ...values, participant: { value: { selected_user: "U2" } } });
    expect(client.chat.postMessage.mock.calls[0]![0].text).toContain("Ny personlig rekord i løping!");
    expect(client.chat.postMessage.mock.calls[0]![0].text).toContain("Registrert med hjelp fra <@U1>");
    expect(await personalCommand("U2")).toContain("Lengste økt: 40 minutter");
    expect(await personalCommand("U1")).toContain("Lengste økt: 100 minutter");
    expect(client.chat.postEphemeral).not.toHaveBeenCalled();
    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(client.chat.postMessage).toHaveBeenLastCalledWith({
      channel: "U2",
      text: "<@U1> registrerte 40 minutter aktivitet for deg i #pust. Aktiviteten ga deg 50 Sparks. Inkludert 10 Sparks i rekordbonus.",
    });
  });

  it("includes the bonus when crossing a level threshold", async () => {
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "run", minutes: 30, activityDate: "2026-09-24" });
    await submit(LOG_ACTIVITY_CALLBACK_ID, { ...values, minutes: { value: { value: "60" } } });
    const status = await personalCommand();
    expect(status).toContain("Dine Sparks: 100");
    expect(status).toContain("Nivå 2: *Medvind*");
    expect(client.chat.postEphemeral.mock.calls[0]![0].text).toBe(status);
  });

  it("recalculates records after corrections, type changes and deletions without new celebrations", async () => {
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "run", minutes: 30, distanceKm: 6.5, activityDate: "2026-09-24" });
    await submit(LOG_ACTIVITY_CALLBACK_ID, { ...values, distance: { value: { value: "8" } } });
    const activity = repository.listRecentForParticipant("U1")[0]!;
    client.chat.postEphemeral.mockClear();
    await submit(EDIT_ACTIVITY_CALLBACK_ID, { ...values, minutes: { value: { value: "20" } } }, activity.id);
    expect(await personalCommand()).toContain("*Løping* · Lengste økt: 30 minutter · Lengste distanse: 6,5 km");
    expect(client.chat.update.mock.calls[0]![0].text).not.toContain("Ny personlig rekord");
    expect(client.chat.update.mock.calls[0]![0].text).not.toContain("rekordbonus");
    expect(repository.totalSparksForParticipant("U1")).toBe(50);
    await submit(EDIT_ACTIVITY_CALLBACK_ID, { ...values, activity_type: { value: { selected_option: { value: "mobility" } } } }, activity.id);
    expect(await personalCommand()).toContain("*Yoga eller bevegelighet* · Lengste økt: 40 minutter");
    expect(await personalCommand()).toContain("*Løping* · Lengste økt: 30 minutter · Lengste distanse: 6,5 km");
    await submit(DELETE_ACTIVITY_CALLBACK_ID, { activity: { value: { selected_option: { value: activity.id } } } });
    expect(await personalCommand()).not.toContain("Yoga eller bevegelighet");
    const remaining = repository.listRecentForParticipant("U1")[0]!;
    await submit(DELETE_ACTIVITY_CALLBACK_ID, { activity: { value: { selected_option: { value: remaining.id } } } });
    expect(await personalCommand()).not.toContain("Personlige rekorder");
    expect(client.chat.postEphemeral).not.toHaveBeenCalled();
    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(client.chat.postMessage.mock.calls[1]![0].text).toContain("slettet en aktivitet");
  });

  it("includes future entries only at Oslo midnight, without a delayed celebration", async () => {
    await submit();
    await submit(LOG_ACTIVITY_CALLBACK_ID, {
      ...values, minutes: { value: { value: "60" } },
      activity_date: { value: { selected_date: "2026-10-02" } },
    });
    expect(client.chat.postMessage.mock.calls[1]![0].text).not.toContain("Ny personlig rekord");
    vi.setSystemTime(new Date("2026-10-01T21:59:59Z"));
    expect(await personalCommand()).toContain("Lengste økt: 40 minutter");
    vi.setSystemTime(new Date("2026-10-01T22:00:00Z"));
    expect(await personalCommand()).toContain("Lengste økt: 60 minutter");
    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("sends the updated /pust meg result privately, with image=%s", async withImage => {
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "strength", minutes: 10, activityDate: "2026-09-17" });
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "walk_hike", minutes: 250, activityDate: "2026-09-24" });
    const stateValues = withImage ? { ...values, image: { value: { files: [{ id: "FIMAGE", mimetype: "image/jpeg", filetype: "jpg" }] } } } : values;
    await submit(LOG_ACTIVITY_CALLBACK_ID, stateValues);
    const text = await personalCommand();
    expect(client.chat.postEphemeral).toHaveBeenCalledExactlyOnceWith({ channel: "CPUST", user: "U1", text });
    expect(text).toContain("Dine Sparks: 300");
    expect(text).toContain("Nivå 3: *Stifinner*");
    expect(text).toContain("400 Sparks til *Turkamerat*");
    expect(text).toContain("Personlig streak: *3 uker*");
    expect(text).toContain("*Ny sti*");
    expect(text).toContain("*Første pust*");
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    expect(client.chat.postMessage.mock.calls[0]![0].text).not.toContain("Dine Sparks");
    expect(repository.listRecentForParticipant("U1")[0]?.slackMessageTs).toBe("123.456");
  });

  it("keeps assisted logging's existing notification without sending progress to either person", async () => {
    await submit(LOG_ACTIVITY_CALLBACK_ID, { ...values, participant: { value: { selected_user: "U2" } } });
    expect(client.chat.postEphemeral).not.toHaveBeenCalled();
    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(client.chat.postMessage).toHaveBeenLastCalledWith({
      channel: "U2", text: "<@U1> registrerte 40 minutter aktivitet for deg i #pust. Aktiviteten ga deg 40 Sparks.",
    });
    expect(repository.totalSparksForParticipant("U2")).toBe(40);
    expect(repository.totalSparksForParticipant("U1")).toBe(0);
  });

  it("does not notify or save when validation fails", async () => {
    const ack = await submit(LOG_ACTIVITY_CALLBACK_ID, { ...values, minutes: { value: { value: "5" } } });
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ response_action: "errors" }));
    expect(client.chat.postEphemeral).not.toHaveBeenCalled();
    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(repository.listRecentForParticipant("U1")).toEqual([]);
  });

  it("retains the activity and channel post if private delivery fails", async () => {
    client.chat.postEphemeral.mockRejectedValueOnce(new Error("user_not_in_channel"));
    await submit();
    expect(repository.totalSparksForParticipant("U1")).toBe(40);
    expect(repository.listRecentForParticipant("U1")[0]?.slackMessageTs).toBe("123.456");
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    expect(client.chat.postEphemeral).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("private fremdriftsmeldingen"), expect.any(Error));
  });

  it("still sends saved progress if the public activity post fails", async () => {
    client.chat.postMessage.mockRejectedValueOnce(new Error("network error"));
    await submit();
    expect(repository.totalSparksForParticipant("U1")).toBe(40);
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    expect(client.chat.postEphemeral).toHaveBeenCalledExactlyOnceWith({ channel: "CPUST", user: "U1", text: await personalCommand() });
  });

  it("preserves image fallback warnings alongside the separate progress message", async () => {
    client.chat.postMessage.mockRejectedValueOnce({ data: { error: "invalid_blocks" } });
    await submit(LOG_ACTIVITY_CALLBACK_ID, { ...values, image: { value: { files: [{ id: "FIMAGE", mimetype: "image/jpeg", filetype: "jpg" }] } } });
    expect(client.chat.postEphemeral).toHaveBeenCalledTimes(2);
    expect(client.chat.postEphemeral.mock.calls[0]![0].text).toContain("kunne ikke vise bildet");
    expect(client.chat.postEphemeral.mock.calls[1]![0].text).toBe(await personalCommand());
  });

  it("does not send new progress after editing or deleting", async () => {
    await submit();
    const activity = repository.listRecentForParticipant("U1")[0]!;
    client.chat.postEphemeral.mockClear();
    await submit(EDIT_ACTIVITY_CALLBACK_ID, { ...values, minutes: { value: { value: "60" } } }, activity.id);
    expect(repository.totalSparksForParticipant("U1")).toBe(60);
    await submit(DELETE_ACTIVITY_CALLBACK_ID, { activity: { value: { selected_option: { value: activity.id } } } });
    expect(repository.totalSparksForParticipant("U1")).toBe(0);
    expect(client.chat.postEphemeral).not.toHaveBeenCalled();
  });

  it("includes existing creators even after leaving and closing, but not people who only joined", async () => {
    const team = teams.create({ name: "Helgepust", startDate: "2026-10-01", endDate: "2026-10-02", activityType: null, goal: { kind: "minutes", target: 300 } }, "U1");
    teams.membership(team.id, "U2", true);
    teams.membership(team.id, "U1", false);
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    expect(await personalCommand("U1")).toContain("*Initiativtaker*");
    expect(await personalCommand("U2")).not.toContain("Initiativtaker");
    await submit();
    expect(client.chat.postEphemeral.mock.calls[0]![0].text).toBe(await personalCommand("U1"));
    expect(client.chat.postEphemeral.mock.calls[0]![0].text).toContain("*Initiativtaker*");
  });

  it.each([
    [9_000, "Nivå 8: *Tindevandrer*", "6000 Sparks til *Gnistlegende*"],
    [15_000, "Nivå 9: *Gnistlegende*", "Du har nådd det høyeste nivået"],
  ])("shows the new level immediately after reaching %i Sparks", async (target, level, next) => {
    repository.create({ participantSlackId: "U1", registeredBySlackId: "U1", type: "walk_hike", minutes: target - 40, activityDate: "2026-09-24" });
    await submit();
    const text = client.chat.postEphemeral.mock.calls[0]![0].text;
    expect(text).toBe(await personalCommand());
    expect(text).toContain(level);
    expect(text).toContain(next);
  });
});
