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

describe("private progress after self-logging", () => {
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
  afterEach(() => { teams.close(); vi.useRealTimers(); vi.clearAllMocks(); });

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
});
