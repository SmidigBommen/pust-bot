// Disposable in-memory example data. This command never connects to Slack or production.
import { ReportRepository } from "../src/storage/report-repository.js";
import { startArchiveServer } from "../src/web/server.js";
import { slotForWeek } from "../src/domain/recap-schedule.js";
import { previousWeek } from "../src/domain/week.js";

const reports = new ReportRepository(":memory:", "preview");
let range = { start: "2026-10-12", end: "2026-10-18" };
const minutes = [930, 720, 555, 810, 450, 615, 390, 480];
const participants = [8, 6, 5, 7, 4, 6, 4, 5];
for (let index = 0; index < minutes.length; index++) {
  const total = minutes[index]!;
  const scheduledAt = slotForWeek(range).dueAt.toISOString();
  reports.save({ version: 1, range, kind: index > 4 ? "reconstructed" : "scheduled",
    scheduledAt, generatedAt: scheduledAt,
    goals: index > 4 ? null : { memberCount: 14, participantGoal: 4, minutesGoal: 240, groupStreak: 5 - index },
    progress: { totalMinutes: total, participants: participants[index]!, activityCount: 18 - index, distanceKm: 89.5 - index,
      byType: [
        { type: "walk_hike", minutes: total * 0.4, distanceKm: 23.5 - index },
        { type: "run", minutes: total * 0.2, distanceKm: 18 },
        { type: "cycle", minutes: total * 0.2, distanceKm: 48 },
        { type: "strength", minutes: total * 0.2, distanceKm: 0 },
      ] },
  });
  range = previousWeek(range);
}
const port = Number(process.env.PREVIEW_PORT ?? 3001);
const server = await startArchiveServer({ port, host: "127.0.0.1", reports });
console.log(`Pust preview with example data: http://127.0.0.1:${port}`);
function stop() { server.close(() => { reports.close(); process.exit(0); }); }
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
