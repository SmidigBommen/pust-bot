import type { AllMiddlewareArgs, App, SlackCommandMiddlewareArgs } from "@slack/bolt";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { nextWeeklyRecap } from "../src/domain/recap-schedule.js";
import { registerSlackHandlers } from "../src/slack/register-handlers.js";
import { createWeeklyRecapSender } from "../src/slack/weekly-recap-sender.js";
import { ActivityRepository } from "../src/storage/activity-repository.js";
import { startWeeklyRecap } from "../src/weekly-recap.js";

const settings = { groupMemberCount: 14, weeklyParticipantGoal: 4, weeklyMinutesGoal: 240 };
const start = new Date("2026-09-20T19:59:30Z"); // Sunday 21:59:30 in Oslo.
const due = new Date("2026-09-20T20:00:00Z");

describe("Oslo recap schedule", () => {
  it.each([
    ["2026-01-11T20:59:00Z", "2026-01-11T21:00:00Z"],
    ["2026-07-12T19:59:00Z", "2026-07-12T20:00:00Z"],
    ["2026-03-23T10:00:00Z", "2026-03-29T20:00:00Z"],
    ["2026-10-19T10:00:00Z", "2026-10-25T21:00:00Z"],
    ["2026-09-20T20:00:00Z", "2026-09-27T20:00:00Z"],
    ["2026-09-20T20:00:01Z", "2026-09-27T20:00:00Z"],
    ["2026-12-31T10:00:00Z", "2027-01-03T21:00:00Z"],
  ])("after %s the next deadline is %s", (now, expected) => {
    expect(nextWeeklyRecap(new Date(now)).dueAt.toISOString()).toBe(new Date(expected).toISOString());
  });
});

describe("weekly recap", () => {
  let folder: string;
  let databasePath: string;
  let repository: ActivityRepository;
  let stops: Array<() => Promise<void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    folder = mkdtempSync(join(tmpdir(), "pust-recap-"));
    databasePath = join(folder, "pust.sqlite");
    repository = new ActivityRepository(databasePath);
    stops = [];
  });

  afterEach(async () => {
    for (const stop of stops) await stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
    rmSync(folder, { recursive: true, force: true });
  });

  function logActivity(date = "2026-09-20", minutes = 40) {
    return repository.create({
      participantSlackId: "U1", registeredBySlackId: "U1", type: "run", minutes, activityDate: date,
    });
  }

  function records() {
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      return db.prepare("SELECT * FROM weekly_recaps ORDER BY week_start").all();
    } finally {
      db.close();
    }
  }

  function launch(options: {
    repository?: ActivityRepository;
    now?: () => Date;
    send?: (channel: string, text: string) => Promise<string>;
  } = {}) {
    const send = vi.fn(options.send ?? (async () => "123.456"));
    const logger = { info: vi.fn(), error: vi.fn() };
    const stop = startWeeklyRecap({
      ...settings, repository, channelId: "CPUST", ...options, send, logger,
    });
    stops.push(stop);
    return { send, logger, stop };
  }

  it("records the attempt before sending the current week's snapshot without mentions", async () => {
    logActivity("2026-09-13", 90); // Prior week must not count.
    logActivity();
    logActivity("2026-09-21", 120); // Next week must not count.
    const h = launch({ send: async () => {
      expect(records()[0]).toMatchObject({ status: "attempted", week_start: "2026-09-14" });
      return "123.456";
    } });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(h.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.send).toHaveBeenCalledExactlyOnceWith("CPUST", expect.stringContaining("Ukens trening søndag kl. 22:00"));
    const text = h.send.mock.calls[0]![1];
    expect(text).toContain("14.09–20.09");
    expect(text).toContain("40/240 minutter");
    expect(text).toContain("Løping: *40 min*");
    expect(text).toContain("Denne uken: 1 aktivitet · 1 aktivitetstype");
    expect(text).toContain("Totalt *40 minutter i bevegelse*");
    expect(text).not.toMatch(/<!(channel|here|everyone)>/);
    expect(records()[0]).toMatchObject({ status: "sent", slack_message_ts: "123.456" });

    logActivity(); // Later logs and manual edits must not update the snapshot.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("does no database work on ordinary minute checks", async () => {
    vi.setSystemTime("2026-09-19T19:00:00Z");
    const read = vi.spyOn(repository, "listThrough");
    const claim = vi.spyOn(repository, "claimWeeklyRecap");
    const h = launch();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(read).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it("records and skips an empty week, even if activity is logged later", async () => {
    logActivity("2026-09-13");
    const h = launch();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(records()[0]).toMatchObject({ status: "skipped_empty" });
    logActivity();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("does not catch up when started after Sunday's deadline", async () => {
    logActivity();
    vi.setSystemTime("2026-09-20T20:00:10Z");
    const h = launch();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.send).not.toHaveBeenCalled();
    expect(records()).toEqual([]);
  });

  it.each([59_999, 60_000])("handles a timer delay of %i ms with a one-minute cutoff", async (delay) => {
    logActivity();
    let clock = start;
    const h = launch({ now: () => clock });
    clock = new Date(due.getTime() + delay);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.send).toHaveBeenCalledTimes(delay < 60_000 ? 1 : 0);
    expect(records()[0]?.status).toBe(delay < 60_000 ? "sent" : "skipped_late");
  });

  it("skips if calculating the status runs beyond the delivery minute", async () => {
    logActivity();
    let clock = start;
    const original = repository.listThrough.bind(repository);
    vi.spyOn(repository, "listThrough").mockImplementation((end) => {
      clock = new Date(due.getTime() + 60_000);
      return original(end);
    });
    const h = launch({ now: () => clock });
    clock = due;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.send).not.toHaveBeenCalled();
    expect(records()[0]?.status).toBe("skipped_late");
  });

  it("allows only one sender across two repository connections", async () => {
    logActivity();
    const first = launch();
    const second = launch({ repository: new ActivityRepository(databasePath) });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(first.send.mock.calls.length + second.send.mock.calls.length).toBe(1);
    expect(records()).toHaveLength(1);
  });

  it("does not retry an attempt left unfinished by a crashed process", async () => {
    logActivity();
    repository.claimWeeklyRecap("CPUST", "2026-09-14", due, "attempted");
    const h = launch({ repository: new ActivityRepository(databasePath) });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.send).not.toHaveBeenCalled();
    expect(records()[0]?.status).toBe("attempted");
  });

  it("records failure and never retries, including after a restart or clock correction", async () => {
    logActivity();
    const h = launch({ send: async () => { throw new Error("Slack unavailable"); } });
    await vi.advanceTimersByTimeAsync(150_000);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining("prøver ikke igjen"));
    expect(records()[0]?.status).toBe("failed");
    await h.stop();
    vi.setSystemTime(start);
    const restarted = launch({ repository: new ActivityRepository(databasePath) });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(restarted.send).not.toHaveBeenCalled();
  });

  it("does not send if the attempt cannot be saved", async () => {
    logActivity();
    vi.spyOn(repository, "claimWeeklyRecap").mockImplementation(() => { throw new Error("Disk full"); });
    const h = launch();
    await vi.advanceTimersByTimeAsync(150_000);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalled();
  });

  it("stops future checks and waits for a send already in progress", async () => {
    logActivity();
    let finish!: (ts: string) => void;
    const h = launch({ send: () => new Promise<string>((resolve) => { finish = resolve; }) });
    await vi.advanceTimersByTimeAsync(30_000);
    let stopped = false;
    const stopping = h.stop().then(() => { stopped = true; });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stopped).toBe(false);
    expect(h.send).toHaveBeenCalledTimes(1);
    finish("123.456");
    await stopping;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("posts again the following week using that week's activity", async () => {
    logActivity();
    const h = launch();
    await vi.advanceTimersByTimeAsync(30_000);
    logActivity("2026-09-27", 60);
    await vi.advanceTimersByTimeAsync(7 * 24 * 3_600_000);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[1]![1]).toContain("21.09–27.09");
    expect(h.send.mock.calls[1]![1]).toContain("60/240 minutter");
    expect(records()).toHaveLength(2);
  });

  it("shares figures with manual status posts without letting them suppress the recap", async () => {
    logActivity();
    type CommandHandler = (args: SlackCommandMiddlewareArgs & AllMiddlewareArgs) => Promise<void>;
    let command!: CommandHandler;
    const app = { command: (_: string, handler: CommandHandler) => { command = handler; }, view: vi.fn() } as unknown as App;
    registerSlackHandlers(app, { ...settings, repository, pustChannelId: "CPUST" });
    const respond = vi.fn();
    await command({ ack: vi.fn(), command: { text: "status" }, respond } as unknown as Parameters<CommandHandler>[0]);
    expect(records()).toEqual([]);
    const h = launch();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.send.mock.calls[0]![1].replace("Ukens trening søndag kl. 22:00", "Ukens Pust"))
      .toBe(respond.mock.calls[0]![0].text);
  });
});

describe("single-attempt Slack sender", () => {
  it.each([429, 500, 503])("does not retry HTTP %i", async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("Unavailable", { status }));
    const send = createWeeklyRecapSender("test-token", request);
    await expect(send("CPUST", "Weekly recap")).rejects.toThrow(`Slack HTTP ${status}`);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not retry a lost response", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("Connection lost"));
    await expect(createWeeklyRecapSender("test-token", request)("CPUST", "Recap")).rejects.toThrow("Connection lost");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("treats Slack API errors as failures even when HTTP succeeds", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, error: "channel_not_found" }));
    await expect(createWeeklyRecapSender("test-token", request)("CPUST", "Recap")).rejects.toThrow("channel_not_found");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("posts the supplied snapshot and returns Slack's message timestamp", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, ts: "123.456" }));
    await expect(createWeeklyRecapSender("test-token", request)("CPUST", "Recap")).resolves.toBe("123.456");
    expect(request).toHaveBeenCalledExactlyOnceWith("https://slack.com/api/chat.postMessage", expect.objectContaining({
      method: "POST", redirect: "error", signal: expect.any(AbortSignal),
      body: JSON.stringify({ channel: "CPUST", text: "Recap", unfurl_links: false, unfurl_media: false }),
    }));
  });
});

describe("recap configuration", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is disabled by default and requires an explicit valid setting", () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "test");
    vi.stubEnv("SLACK_APP_TOKEN", "test");
    vi.stubEnv("SLACK_PUST_CHANNEL_ID", "CPUST");
    vi.stubEnv("PUST_WEEKLY_RECAP_ENABLED", undefined);
    expect(loadConfig().weeklyRecapEnabled).toBe(false);
    vi.stubEnv("PUST_WEEKLY_RECAP_ENABLED", "true");
    expect(loadConfig().weeklyRecapEnabled).toBe(true);
    vi.stubEnv("PUST_WEEKLY_RECAP_ENABLED", "false");
    expect(loadConfig().weeklyRecapEnabled).toBe(false);
    vi.stubEnv("PUST_WEEKLY_RECAP_ENABLED", "yes");
    expect(() => loadConfig()).toThrow("PUST_WEEKLY_RECAP_ENABLED");
  });
});
