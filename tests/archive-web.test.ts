import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { startArchiveServer, type ReportAccess } from "../src/web/server.js";
import { stopHealthServer } from "../src/health-server.js";
import { ReportRepository } from "../src/storage/report-repository.js";
import type { WeeklyReport } from "../src/domain/weekly-report.js";

function snapshot(start = "2026-10-19", end = "2026-10-25"): WeeklyReport {
  return { version: 1, range: { start, end }, kind: "scheduled",
    generatedAt: `${end}T21:00:00.000Z`, scheduledAt: `${end}T21:00:00.000Z`,
    progress: { participants: 3, totalMinutes: 420, activityCount: 8, distanceKm: 20,
      byType: [{ type: "run", minutes: 300, distanceKm: 20 }, { type: "strength", minutes: 120, distanceKm: 0 }] },
    goals: { memberCount: 14, participantGoal: 4, minutesGoal: 240, groupStreak: 3 } };
}

describe("public report website", () => {
  let reports: ReportRepository;
  const servers: Server[] = [];
  beforeEach(() => { reports = new ReportRepository(":memory:", "PRIVATE-CHANNEL"); });
  afterEach(async () => {
    for (const server of servers.splice(0)) await stopHealthServer(server);
    reports.close();
    vi.unstubAllEnvs();
  });
  async function launch(authorize?: ReportAccess) {
    const server = await startArchiveServer({ port: 0, host: "127.0.0.1", reports, ...(authorize ? { authorize } : {}) });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    return `http://127.0.0.1:${address.port}`;
  }

  it("serves the latest frozen report, permanent links, archive, styles and noindex headers", async () => {
    reports.save(snapshot("2026-10-12", "2026-10-18"));
    reports.save(snapshot());
    const base = await launch();
    const response = await fetch(base);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).toContain("Uke 43, 2026");
    expect(html).toContain('href="/uker/2026-10-12"');
    expect(html).toContain("20 km registrert");
    expect(html).not.toContain("PRIVATE-CHANNEL");
    expect(html).not.toContain("<script");
    expect(await (await fetch(`${base}/uker/2026-10-19`)).text()).toBe(html);
    expect(await (await fetch(`${base}/arkiv`)).text()).toContain("Ukearkivet");
    expect((await fetch(`${base}/assets/pust.css`)).headers.get("content-type")).toContain("text/css");
    expect(await (await fetch(`${base}/robots.txt`)).text()).toContain("Disallow: /");
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ status: "ok" });
    expect(await (await fetch(base, { method: "HEAD" })).text()).toBe("");
    expect((await fetch(base, { method: "POST" })).status).toBe(405);
  });

  it("handles an empty archive, unknown weeks and invalid routes without exposing files", async () => {
    const base = await launch();
    expect(await (await fetch(base)).text()).toContain("Den første uken ligger foran oss");
    for (const path of ["/uker/2026-10-19", "/uker/2026-99-99", "/.env", "/data/pust.sqlite", "/api/activities"]) {
      const response = await fetch(base + path);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Denne rapporten finnes ikke");
    }
  });

  it("labels reconstructed and late reports and avoids fabricated goals", async () => {
    reports.save({ ...snapshot(), kind: "reconstructed", goals: null });
    const base = await launch();
    const html = await (await fetch(base)).text();
    expect(html).toContain("Rekonstruert fra aktivitetsloggen");
    expect(html).toContain("Ukens minuttmål er ikke kjent");
    expect(html).not.toContain('role="progressbar"');
    reports.save({ ...snapshot("2026-10-26", "2026-11-01"), kind: "late", goals: null });
    expect(await (await fetch(base)).text()).toContain("Rapporten ble opprettet senere");
  });

  it("groups the December week in its ISO year and limits trends to eight reports through the selected week", async () => {
    reports.save(snapshot("2025-12-29", "2026-01-04"));
    const base = await launch();
    expect(await (await fetch(base)).text()).toContain("Uke 1, 2026");
    for (let index = 0; index < 10; index++) {
      const start = new Date("2026-08-03T12:00:00Z");
      start.setUTCDate(start.getUTCDate() + index * 7);
      const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
      reports.save(snapshot(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)));
    }
    const html = await (await fetch(`${base}/uker/2026-09-28`)).text();
    const charts = html.slice(html.indexOf('class="card trend-card"'), html.indexOf('class="publication-note"'));
    expect((charts.match(/class="chart-column"/g) ?? [])).toHaveLength(16);
    expect(charts).not.toContain("/uker/2026-10-05");
    expect(charts).not.toContain("/uker/2026-08-03");
  });

  it("puts every report route behind one replaceable access check before reading data", async () => {
    const list = vi.spyOn(reports, "list");
    const find = vi.spyOn(reports, "find");
    const authorize = vi.fn(() => false);
    const base = await launch(authorize);
    for (const path of ["/", "/arkiv", "/uker/2026-10-19"]) {
      expect((await fetch(base + path)).status).toBe(403);
    }
    expect(authorize).toHaveBeenCalledTimes(3);
    expect(list).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("validates the public link origin without allowing Slack-link injection or embedded credentials", () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "test"); vi.stubEnv("SLACK_APP_TOKEN", "test"); vi.stubEnv("SLACK_PUST_CHANNEL_ID", "test");
    vi.stubEnv("PUST_PUBLIC_URL", "https://pust.smidigbommen.no/");
    expect(loadConfig().publicUrl).toBe("https://pust.smidigbommen.no");
    for (const value of ["javascript:alert(1)", "https://user:secret@example.com", "https://example.com/path", "https://example.com/?x=y", "https://example.com/#fragment"]) {
      vi.stubEnv("PUST_PUBLIC_URL", value);
      expect(() => loadConfig()).toThrow("PUST_PUBLIC_URL");
    }
  });
});
