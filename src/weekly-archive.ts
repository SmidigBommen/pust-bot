import { slotForWeek, nextWeeklyRecap } from "./domain/recap-schedule.js";
import { osloWeek, previousWeek, weekContaining, type DateRange } from "./domain/week.js";
import type { WeeklyReport } from "./domain/weekly-report.js";
import { calculateWeeklyProgress } from "./domain/weekly-progress.js";
import { buildWeeklyStatus, type WeeklyStatusSettings } from "./slack/weekly-status.js";
import type { ActivityRepository } from "./storage/activity-repository.js";
import type { ReportRepository } from "./storage/report-repository.js";

export class WeeklyArchive {
  constructor(
    readonly reports: ReportRepository,
    private readonly activities: ActivityRepository,
    private readonly settings: WeeklyStatusSettings,
  ) {}

  /** The first import is atomic and never claims to reproduce old Slack snapshots. */
  initialize(now: Date): void {
    if (this.reports.state()) return;
    const current = osloWeek(now);
    const firstActivity = this.activities.listThrough(current.end)[0];
    const firstWeek = firstActivity ? weekContaining(firstActivity.activityDate).start : current.start;
    const reports = this.dueWeeks(firstWeek, now).map(range => this.build(range, now, "reconstructed"));
    this.reports.initialize({ firstWeek, startedAt: now.toISOString() }, reports);
  }

  /** Also called by Slack: whichever publisher runs first freezes the same report. */
  capture(range: DateRange, now: Date): WeeklyReport {
    const existing = this.reports.find(range.start);
    if (existing) return existing;
    const due = slotForWeek(range).dueAt;
    if (now < due) throw new Error("Uken kan ikke publiseres før søndag kl. 22:00.");
    const kind = now.getTime() < due.getTime() + 60_000 ? "scheduled" : "late";
    return this.reports.save(this.build(range, now, kind));
  }

  catchUp(now: Date): void {
    this.initialize(now);
    const state = this.reports.state()!;
    for (const range of this.dueWeeks(state.firstWeek, now)) {
      if (!this.reports.find(range.start)) this.capture(range, now);
    }
  }

  private build(range: DateRange, now: Date, kind: WeeklyReport["kind"]): WeeklyReport {
    // Unknown historical settings are deliberately absent, including after downtime.
    const status = kind === "scheduled" ? buildWeeklyStatus(this.activities, range, this.settings) : null;
    return {
      version: 1, range, kind,
      scheduledAt: slotForWeek(range).dueAt.toISOString(),
      generatedAt: now.toISOString(),
      progress: status?.progress ?? calculateWeeklyProgress(this.activities.listBetween(range.start, range.end)),
      goals: status ? {
        memberCount: status.memberCount, participantGoal: status.participantGoal,
        minutesGoal: status.minutesGoal, groupStreak: status.groupStreak,
      } : null,
    };
  }

  private dueWeeks(firstWeek: string, now: Date): DateRange[] {
    let range = osloWeek(now);
    if (slotForWeek(range).dueAt > now) range = previousWeek(range);
    const ranges: DateRange[] = [];
    while (range.start >= firstWeek) {
      ranges.push(range);
      range = previousWeek(range);
    }
    return ranges.reverse();
  }
}

/** Archive publication is independent of Slack delivery and survives missed cutoffs. */
export function startWeeklyArchive(
  archive: WeeklyArchive,
  logger: { info(message: string): void; error(message: string): void },
  now: () => Date = () => new Date(),
): () => void {
  archive.catchUp(now());
  let next = nextWeeklyRecap(now()).dueAt;
  let timer: ReturnType<typeof setTimeout>;
  function schedule(): void {
    timer = setTimeout(() => {
      const checkedAt = now();
      if (checkedAt >= next) {
        try {
          archive.catchUp(checkedAt);
          next = nextWeeklyRecap(now()).dueAt;
          logger.info("Ukearkivet er oppdatert.");
        } catch (error) {
          // Retry the archive on the next minute. This never retries a Slack message.
          logger.error(`Ukearkivet kunne ikke oppdateres: ${error instanceof Error ? error.message : "Ukjent feil"}`);
        }
      }
      schedule();
    }, 60_000 - now().getTime() % 60_000);
  }
  schedule();
  return () => clearTimeout(timer);
}
