import type { App } from "@slack/bolt";
import type { ModalView } from "@slack/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamInput } from "../src/domain/team-challenge.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { TeamRepository } from "../src/storage/team-repository.js";
import { registerSlackHandlers } from "../src/slack/register-handlers.js";
import { teamDetailView, teamFormView, teamListView } from "../src/slack/team-views.js";

const input: TeamInput = { activityType: null, name: "Helgepust", startDate: "2026-10-02", endDate: "2026-10-04", goal: { kind: "participation", target: 100 } };
// The harness exercises registered Bolt callbacks with Slack-shaped payloads and real repositories.
type Handler = (args: any) => Promise<void>;
function state(value: TeamInput) {
  return { values: {
    name: { value: { value: value.name } }, start: { value: { selected_date: value.startDate } },
    end: { value: { selected_date: value.endDate } },
    activity_type: { value: { selected_option: { value: value.activityType ?? "all" } } },
    goal: { pust_team_goal: { selected_option: { value: value.goal.kind } } },
    [value.goal.kind]: { value: { value: String(value.goal.target) } },
  } };
}

describe("Pustelag Slack flows", () => {
  let clock: Date;
  let teams: TeamRepository;
  let activities: ActivityRepository;
  let commands: Map<string, Handler>;
  let views: Map<string, Handler>;
  let actions: Array<[string | RegExp, Handler]>;
  let client: {
    views: { open: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    chat: { postMessage: ReturnType<typeof vi.fn> };
  };
  const logger = { error: vi.fn() };
  beforeEach(() => {
    clock = new Date("2026-10-01T10:00:00Z");
    teams = new TeamRepository(":memory:", () => clock);
    activities = new ActivityRepository(":memory:");
    commands = new Map(); views = new Map(); actions = [];
    client = { views: { open: vi.fn().mockResolvedValue({ ok: true }), update: vi.fn().mockResolvedValue({ ok: true }) }, chat: { postMessage: vi.fn().mockResolvedValue({ ok: true }) } };
    const app = {
      command: (key: string, handler: Handler) => commands.set(key, handler),
      view: (key: string, handler: Handler) => views.set(key, handler),
      action: (key: string | RegExp, handler: Handler) => actions.push([key, handler]),
    } as unknown as App;
    registerSlackHandlers(app, { teams, repository: activities, pustChannelId: "CPUST", groupMemberCount: 14, weeklyParticipantGoal: 4, weeklyMinutesGoal: 240 });
  });
  afterEach(() => { teams.close(); vi.clearAllMocks(); });

  async function action(action_id: string, value: string, view?: Partial<ModalView>, user = "U1", extra: object = {}) {
    const handler = actions.find(([match]) => typeof match === "string" ? match === action_id : match.test(action_id))![1];
    const ack = vi.fn();
    await handler({ ack, action: { action_id, value, ...extra }, body: {
      user: { id: user }, trigger_id: "trigger", ...(view ? { view: { id: "V1", hash: "hash", ...view } } : {}),
    }, client, logger });
    expect(ack).toHaveBeenCalledOnce();
    return client.views.update.mock.calls.at(-1)?.[0].view as ModalView;
  }
  async function submit(callback: string, view: object, user = "U1") {
    const ack = vi.fn();
    await views.get(callback)!({ ack, view, body: { user: { id: user } }, client, logger });
    expect(ack).toHaveBeenCalledOnce();
    return ack.mock.calls[0]![0];
  }

  it("opens /pust lag and creates only after review, with replay protection", async () => {
    const ack = vi.fn();
    await commands.get("/pust")!({ ack, command: { text: "lag", user_id: "U1", trigger_id: "command-trigger" }, client });
    expect(ack).toHaveBeenCalledOnce();
    expect(client.views.open).toHaveBeenCalledWith(expect.objectContaining({ trigger_id: "command-trigger" }));
    const form = await action("pust_team_create", "new", {});
    const review = await submit("pust_team_form", { ...form, state: state(input) });
    expect(review.response_action).toBe("update");
    expect(review.view.callback_id).toBe("pust_team_confirm");
    expect(teams.list().teams).toHaveLength(0);
    const saved = await submit("pust_team_confirm", review.view);
    expect(JSON.stringify(saved.view)).toContain("Laget er opprettet");
    expect(JSON.stringify(saved.view)).toContain("Prestasjon låst opp: Initiativtaker");
    const team = teams.list().teams[0]!;
    expect(team).toMatchObject({ ...input, creatorId: "U1", memberIds: ["U1"] });
    const replay = await submit("pust_team_confirm", review.view);
    expect(JSON.stringify(replay.view)).not.toContain("Prestasjon låst opp");
    expect(teams.list().teams).toHaveLength(1);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("does not announce the creator achievement again for a second team or for edits", async () => {
    const create = (requestId: string) => submit("pust_team_confirm", { private_metadata: JSON.stringify({ requestId, input }) });
    await create("first");
    expect(JSON.stringify(await create("second"))).not.toContain("Prestasjon låst opp");
    expect(teams.list().teams).toHaveLength(2);
    const team = teams.list().teams[0]!;
    const edited = await submit("pust_team_confirm", { private_metadata: JSON.stringify({ id: team.id, revision: team.revision, requestId: "edit", input }) });
    expect(JSON.stringify(edited)).not.toContain("Prestasjon låst opp");
    expect(activities.awardAchievement("U1", "team_starter")).toBe(false);
  });

  it("retains a created team even if recording the achievement fails", async () => {
    vi.spyOn(activities, "awardAchievement").mockImplementationOnce(() => { throw new Error("Write failed"); });
    const saved = await submit("pust_team_confirm", { private_metadata: JSON.stringify({ requestId: "req", input }) });
    expect(teams.list().teams).toHaveLength(1);
    expect(JSON.stringify(saved)).toContain("Laget er opprettet");
    expect(JSON.stringify(saved)).not.toContain("Prestasjon låst opp");
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("prestasjonen kunne ikke lagres"), expect.any(Error));
  });

  it("changes goal fields while preserving the entered name and dates", async () => {
    const form = teamFormView({ requestId: "req" }, input);
    const view = await action("pust_team_goal", "", { ...form, state: state(input) } as Partial<ModalView>, "U1", { selected_option: { value: "minutes" } });
    const fields = JSON.stringify(view);
    expect(fields).toContain("Helgepust");
    expect(fields).toContain("2026-10-04");
    expect(view.blocks).toContainEqual(expect.objectContaining({ block_id: "minutes" }));
    expect(view.blocks).not.toContainEqual(expect.objectContaining({ block_id: "participation" }));
    expect(client.views.update).toHaveBeenCalledWith(expect.objectContaining({ hash: "hash" }));
  });

  it("returns validation errors to the right form fields", async () => {
    const result = await submit("pust_team_form", { private_metadata: JSON.stringify({ requestId: "req" }), state: state({ ...input, endDate: "2026-10-01" }) });
    expect(result).toMatchObject({ response_action: "errors", errors: { end: expect.any(String) } });
    expect(teams.list().teams).toHaveLength(0);
  });

  it("allows returning from review to edit and saves a minutes goal", async () => {
    const draft = { ...input, goal: { kind: "minutes" as const, target: 600 } };
    const review = await submit("pust_team_form", { private_metadata: JSON.stringify({ requestId: "req" }), state: state(draft) });
    const back = await action("pust_team_revise", "back", review.view);
    expect(back.callback_id).toBe("pust_team_form");
    expect(JSON.stringify(back)).toContain('"initial_value":"600"');
    await submit("pust_team_confirm", review.view);
    expect(teams.list().teams[0]?.goal).toEqual(draft.goal);
  });

  it("opens a shared team's status and joins/leaves as the clicking user", async () => {
    const team = teams.create(input, "U1");
    await action("pust_team_open", team.id, undefined, "U2");
    expect(client.views.open).toHaveBeenCalledWith(expect.objectContaining({ trigger_id: "trigger" }));
    const joined = await action("pust_team_join", team.id, {}, "U2");
    expect(teams.find(team.id)?.memberIds).toEqual(["U1", "U2"]);
    expect(JSON.stringify(joined)).toContain("Forlat laget");
    await action("pust_team_leave", team.id, {}, "U2");
    expect(teams.find(team.id)?.memberIds).toEqual(["U1"]);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("shares only when requested and includes an open-team button without interpreting names as mentions", async () => {
    const team = teams.create({ ...input, name: "Tur <!channel> & venner" }, "U1");
    await action("pust_team_share", team.id, {});
    const post = client.chat.postMessage.mock.calls[0]![0];
    expect(post.channel).toBe("CPUST");
    expect(post.text).toContain("&lt;!channel&gt; &amp; venner");
    expect(post.text).not.toContain("<!channel>");
    expect(post.blocks[1].elements[0]).toMatchObject({ action_id: "pust_team_open", value: team.id });
  });

  it("allows creator edits before the start but rechecks permissions on confirmation", async () => {
    const team = teams.create(input, "U1");
    const form = await action("pust_team_edit", team.id, {});
    const draft = { ...input, goal: { kind: "minutes" as const, target: 500 } };
    const review = await submit("pust_team_form", { ...form, state: state(draft) });
    const denied = await submit("pust_team_confirm", review.view, "U2");
    expect(JSON.stringify(denied)).toContain("Bare den som opprettet");
    expect(teams.find(team.id)?.goal).toEqual(input.goal);
    await submit("pust_team_confirm", review.view, "U1");
    expect(teams.find(team.id)?.goal).toEqual(draft.goal);
  });

  it("rejects a stale edit submitted after the start, even if the new start date is later", async () => {
    const team = teams.create(input, "U1");
    const form = await action("pust_team_edit", team.id, {});
    const review = await submit("pust_team_form", { ...form, state: state({ ...input, startDate: "2026-10-03" }) });
    clock = new Date("2026-10-02T10:00:00Z");
    const result = await submit("pust_team_confirm", review.view);
    expect(JSON.stringify(result)).toContain("låst");
    expect(teams.find(team.id)?.startDate).toBe(input.startDate);
  });

  it("rejects stale membership buttons after closing and displays completed challenges", async () => {
    const team = teams.create(input, "U1");
    clock = new Date("2026-10-05T10:00:00Z");
    const result = await action("pust_team_join", team.id, {}, "U2");
    expect(JSON.stringify(result)).toContain("Medlemslisten er låst");
    const list = await action("pust_team_list", "true:0", {});
    expect(JSON.stringify(list)).toContain("Helgepust");
    const detail = teamDetailView(teams.find(team.id)!, [], "U1", teams.today());
    expect(JSON.stringify(detail)).not.toMatch(/pust_team_(join|leave|edit)/);
  });

  it("reports a failed share without claiming success or retrying it in the handler", async () => {
    const team = teams.create(input, "U1");
    client.chat.postMessage.mockRejectedValueOnce(new Error("Offline"));
    const result = await action("pust_team_share", team.id, {});
    expect(JSON.stringify(result)).toContain("Handlingen kunne ikke fullføres");
    expect(JSON.stringify(result)).not.toContain("Status er delt");
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
  });

  it("keeps action IDs unique within each block and action groups within Slack limits", () => {
    const team = teams.create(input, "U1");
    const views = [teamListView([team], "U1", false, 1, true), teamDetailView(team, [], "U1", teams.today())];
    for (const view of views) for (const block of view.blocks) if (block.type === "actions" && "elements" in block) {
      const ids = block.elements.map(element => "action_id" in element ? element.action_id : undefined);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeLessThanOrEqual(5);
    }
  });

  it("keeps the chosen activity through goal changes, review, back navigation and saving", async () => {
    const restricted: TeamInput = { ...input, activityType: "run" };
    const form = teamFormView({ requestId: "req" }, restricted);
    const changed = await action("pust_team_goal", "", { ...form, state: state(restricted) } as Partial<ModalView>, "U1", { selected_option: { value: "minutes" } });
    expect(changed.blocks).toContainEqual(expect.objectContaining({ block_id: "activity_type", element: expect.objectContaining({ initial_option: { value: "run", text: { type: "plain_text", text: "Bare løping" } } }) }));
    const review = await submit("pust_team_form", { ...changed, state: state({ ...restricted, goal: { kind: "minutes", target: 300 } }) });
    expect(JSON.stringify(review.view)).toContain("Bare løping teller");
    const back = await action("pust_team_revise", "back", review.view);
    expect(JSON.stringify(back)).toContain('"initial_option":{"text":{"type":"plain_text","text":"Bare løping"},"value":"run"}');
    await submit("pust_team_confirm", review.view);
    const team = teams.list().teams[0]!;
    expect(team.activityType).toBe("run");
    expect(team.goal).toEqual({ kind: "minutes", target: 300 });
    const list = await action("pust_team_list", "false:0", {});
    expect(JSON.stringify(list)).toContain("Bare løping teller");
    const detail = await action("pust_team_open", team.id, {});
    expect(JSON.stringify(detail)).toContain("Bare løping teller");
    await action("pust_team_share", team.id, {});
    expect(client.chat.postMessage.mock.calls[0]![0].text).toContain("Bare løping teller");
  });

  it("labels all-activity teams in the list, review and shared status", async () => {
    const review = await submit("pust_team_form", { private_metadata: JSON.stringify({ requestId: "req" }), state: state(input) });
    expect(JSON.stringify(review.view)).toContain("Alle aktivitetstyper teller");
    await submit("pust_team_confirm", review.view);
    const team = teams.list().teams[0]!;
    expect(JSON.stringify(await action("pust_team_list", "false:0", {}))).toContain("Alle aktivitetstyper teller");
    await action("pust_team_share", team.id, {});
    expect(client.chat.postMessage.mock.calls[0]![0].text).toContain("Alle aktivitetstyper teller");
  });

  it("rejects an invalid activity choice on the correct form field", async () => {
    const invalid = { ...input, activityType: "invalid" } as unknown as TeamInput;
    const result = await submit("pust_team_form", { private_metadata: JSON.stringify({ requestId: "req" }), state: state(invalid) });
    expect(result).toMatchObject({ response_action: "errors", errors: { activity_type: expect.any(String) } });
    expect(teams.list().teams).toHaveLength(0);
  });

  it("accepts a review opened before activity selection was introduced as all activities", async () => {
    const { activityType, ...legacy } = input;
    await submit("pust_team_confirm", { private_metadata: JSON.stringify({ requestId: "old-form", input: legacy }) });
    expect(teams.list().teams[0]?.activityType).toBeNull();
  });
});
