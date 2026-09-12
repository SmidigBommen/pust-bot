import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AllMiddlewareArgs, App, SlackViewMiddlewareArgs, ViewSubmitAction } from "@slack/bolt";
import { describe, expect, it, vi } from "vitest";
import { activityModal, LOG_ACTIVITY_CALLBACK_ID } from "../src/slack/activity-modal.js";
import { DELETE_ACTIVITY_CALLBACK_ID } from "../src/slack/delete-activity-modal.js";
import { EDIT_ACTIVITY_CALLBACK_ID } from "../src/slack/edit-activity-modal.js";
import { registerSlackHandlers } from "../src/slack/register-handlers.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";

type ViewHandler = (args: SlackViewMiddlewareArgs<ViewSubmitAction> & AllMiddlewareArgs) => Promise<void>;
const uploadedImage = { id: "F123PHOTO", mimetype: "image/jpeg", filetype: "jpg" };
const activityValues = {
  participant: { value: { selected_user: "U1" } },
  activity_type: { value: { selected_option: { value: "walk_hike" } } },
  minutes: { value: { value: "40" } },
  comment: { value: { value: "Frisk luft" } },
  activity_date: { value: { selected_date: "2026-09-12" } },
};

function harness(repository = new ActivityRepository(":memory:")) {
  const handlers = new Map<string, ViewHandler>();
  const app = {
    command: vi.fn(),
    view: (id: string, handler: ViewHandler) => handlers.set(id, handler),
  } as unknown as App;
  const client = {
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "123.456" }),
      update: vi.fn().mockResolvedValue({ ok: true, ts: "123.456" }),
      postEphemeral: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
  const logger = { error: vi.fn() };
  registerSlackHandlers(app, {
    repository, pustChannelId: "CPUST", groupMemberCount: 14,
    weeklyParticipantGoal: 4, weeklyMinutesGoal: 240,
  });
  return {
    repository, client, logger,
    async submit(id: string, values: object, activityId = "", user = "U1") {
      const ack = vi.fn();
      await handlers.get(id)!({
        ack, body: { user: { id: user } }, client, logger,
        view: { state: { values }, private_metadata: activityId },
      } as unknown as Parameters<ViewHandler>[0]);
      return ack;
    },
  };
}

describe("activity image uploads", () => {
  it("offers one optional new image upload", () => {
    expect(activityModal("U1", "2026-09-12").blocks).toContainEqual(expect.objectContaining({
      type: "input", block_id: "image", optional: true,
      element: { type: "file_input", action_id: "value", filetypes: ["jpg", "jpeg", "png", "gif"], max_files: 1 },
    }));
  });

  it("keeps logging without a photo compatible with existing activities", async () => {
    const h = harness();
    await h.submit(LOG_ACTIVITY_CALLBACK_ID, activityValues);
    expect(h.client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: "CPUST", text: expect.stringContaining("+40 Sparks"), blocks: [],
    }));
    expect(h.repository.listRecentForParticipant("U1")[0]?.slackImageFileId).toBeUndefined();
  });

  it.each([
    [uploadedImage],
    [{ id: "F123PNG", mimetype: "image/png", filetype: "png" }],
    [{ id: "F123GIF", mimetype: "image/gif", filetype: "gif" }],
  ])("posts an uploaded image alongside the activity and achievements: %j", async (file) => {
    const h = harness();
    await h.submit(LOG_ACTIVITY_CALLBACK_ID, { ...activityValues, image: { value: { files: [file] } } });
    const post = h.client.chat.postMessage.mock.calls[0]![0];
    expect(post.text).toContain("+40 Sparks");
    expect(post.text).toContain("Prestasjon låst opp");
    expect(post.blocks).toEqual([
      { type: "section", text: { type: "mrkdwn", text: post.text } },
      { type: "image", slack_file: { id: file.id }, alt_text: "Bilde fra aktiviteten" },
    ]);
    expect(h.repository.listRecentForParticipant("U1")[0]).toMatchObject({
      slackImageFileId: file.id, slackMessageTs: "123.456",
    });
  });

  it.each([
    [[{ ...uploadedImage, mimetype: "application/pdf", filetype: "pdf" }]],
    [[{ ...uploadedImage, mimetype: "application/pdf" }]],
    [[uploadedImage, uploadedImage]],
  ])("rejects unsupported uploads before saving an activity: %j", async (files) => {
    const h = harness();
    const ack = await h.submit(LOG_ACTIVITY_CALLBACK_ID, { ...activityValues, image: { value: { files } } });
    expect(ack).toHaveBeenCalledWith({ response_action: "errors", errors: { image: expect.any(String) } });
    expect(h.repository.listRecentForParticipant("U1")).toEqual([]);
    expect(h.client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("preserves the image when editing, and removes it from the post when deleting", async () => {
    const h = harness();
    await h.submit(LOG_ACTIVITY_CALLBACK_ID, { ...activityValues, image: { value: { files: [uploadedImage] } } });
    const activity = h.repository.listRecentForParticipant("U1")[0]!;
    await h.submit(EDIT_ACTIVITY_CALLBACK_ID, {
      ...activityValues, minutes: { value: { value: "60" } },
    }, activity.id);
    expect(h.client.chat.update).toHaveBeenLastCalledWith(expect.objectContaining({
      ts: "123.456", text: expect.stringContaining("+60 Sparks"),
      blocks: expect.arrayContaining([{ type: "image", slack_file: { id: uploadedImage.id }, alt_text: "Bilde fra aktiviteten" }]),
    }));
    expect(h.repository.findById(activity.id)?.slackImageFileId).toBe(uploadedImage.id);
    await h.submit(DELETE_ACTIVITY_CALLBACK_ID, { activity: { value: { selected_option: { value: activity.id } } } });
    expect(h.client.chat.update).toHaveBeenLastCalledWith(expect.objectContaining({ ts: "123.456", blocks: [] }));
    expect(h.repository.findById(activity.id)).toBeNull();
  });

  it("posts the activity without its image and notifies the user if Slack rejects the image", async () => {
    const h = harness();
    h.client.chat.postMessage.mockRejectedValueOnce({ data: { error: "invalid_blocks" } });
    await h.submit(LOG_ACTIVITY_CALLBACK_ID, { ...activityValues, image: { value: { files: [uploadedImage] } } });
    expect(h.client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(h.client.chat.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      text: expect.stringContaining("+40 Sparks"), blocks: [],
    }));
    expect(h.client.chat.postEphemeral).toHaveBeenCalledWith(expect.objectContaining({ channel: "CPUST", user: "U1" }));
    expect(h.repository.listRecentForParticipant("U1")[0]).toMatchObject({ slackMessageTs: "123.456" });
    expect(h.repository.listRecentForParticipant("U1")[0]?.slackImageFileId).toBeUndefined();
  });

  it("still edits the text when the image was deleted in Slack", async () => {
    const h = harness();
    await h.submit(LOG_ACTIVITY_CALLBACK_ID, { ...activityValues, image: { value: { files: [uploadedImage] } } });
    const activity = h.repository.listRecentForParticipant("U1")[0]!;
    h.client.chat.update.mockRejectedValueOnce({ data: { error: "file_not_found" } });
    await h.submit(EDIT_ACTIVITY_CALLBACK_ID, activityValues, activity.id);
    expect(h.client.chat.update).toHaveBeenLastCalledWith(expect.objectContaining({ blocks: [] }));
    expect(h.repository.findById(activity.id)?.slackImageFileId).toBeUndefined();
    expect(h.client.chat.postEphemeral).toHaveBeenCalled();
  });

  it("does not retry an ambiguous network failure and risk a duplicate post", async () => {
    const h = harness();
    h.client.chat.postMessage.mockRejectedValueOnce(new Error("connection lost"));
    await h.submit(LOG_ACTIVITY_CALLBACK_ID, { ...activityValues, image: { value: { files: [uploadedImage] } } });
    expect(h.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(h.logger.error).toHaveBeenCalled();
  });

  it("migrates existing databases and retains only the Slack file reference after reopening", () => {
    const folder = mkdtempSync(join(tmpdir(), "pust-images-"));
    try {
      const path = join(folder, "pust.sqlite");
      const db = new DatabaseSync(path);
      db.exec(`CREATE TABLE activities (
        id TEXT PRIMARY KEY, participant_slack_id TEXT NOT NULL, registered_by_slack_id TEXT NOT NULL,
        activity_type TEXT NOT NULL, minutes INTEGER NOT NULL, distance_km REAL, comment TEXT,
        activity_date TEXT NOT NULL, created_at TEXT NOT NULL, slack_message_ts TEXT
      );
      INSERT INTO activities VALUES ('old', 'U1', 'U1', 'walk_hike', 40, NULL, NULL, '2026-09-12', '2026-09-12', '123.456');`);
      db.close();
      const repository = new ActivityRepository(path);
      expect(repository.findById("old")?.slackImageFileId).toBeUndefined();
      repository.setSlackMessageTs("old", "123.456", uploadedImage.id);
      expect(new ActivityRepository(path).findById("old")).toMatchObject({
        minutes: 40, slackMessageTs: "123.456", slackImageFileId: uploadedImage.id,
      });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
