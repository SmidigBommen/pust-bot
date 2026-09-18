import { nextWeeklyRecap } from "./domain/recap-schedule.js";
import { groupStatusMessage } from "./slack/progress-messages.js";
import { buildWeeklyStatus, type WeeklyStatusSettings } from "./slack/weekly-status.js";
import type { ActivityRepository } from "./storage/activity-repository.js";

interface RecapDependencies extends WeeklyStatusSettings {
  repository: ActivityRepository;
  channelId: string;
  send: (channel: string, text: string) => Promise<string>;
  logger: { info(message: string): void; error(message: string): void };
  now?: () => Date;
}

const MINUTE = 60_000;

/** Starts minute-aligned checks. The returned function stops checks and awaits an active send. */
export function startWeeklyRecap(dependencies: RecapDependencies): () => Promise<void> {
  const { repository, channelId, send, logger } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  let next = nextWeeklyRecap(now());
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let active = Promise.resolve();

  async function check(): Promise<void> {
    const checkedAt = now();
    if (checkedAt.getTime() < next.dueAt.getTime()) return;
    const slot = next;
    // Advance before doing work, including work that could fail.
    next = nextWeeklyRecap(checkedAt);
    const week = slot.range.start;
    const deadline = slot.dueAt.getTime() + MINUTE;
    if (checkedAt.getTime() >= deadline) {
      repository.claimWeeklyRecap(channelId, week, checkedAt, "skipped_late");
      logger.info(`Ukessammendrag ${week}: hoppet over fordi tidspunktet ble passert.`);
      return;
    }

    const status = buildWeeklyStatus(repository, slot.range, dependencies);
    if (status.progress.participants === 0) {
      repository.claimWeeklyRecap(channelId, week, checkedAt, "skipped_empty");
      logger.info(`Ukessammendrag ${week}: ingen registrerte aktiviteter.`);
      return;
    }
    const text = groupStatusMessage(status, "Ukens trening søndag kl. 22:00");
    // Even a slow database read must not turn this into a catch-up post.
    if (now().getTime() >= deadline) {
      repository.claimWeeklyRecap(channelId, week, checkedAt, "skipped_late");
      logger.info(`Ukessammendrag ${week}: tidspunktet ble passert under beregning.`);
      return;
    }
    if (!repository.claimWeeklyRecap(channelId, week, checkedAt, "attempted")) return;

    let ts: string;
    try {
      ts = await send(channelId, text);
    } catch (error) {
      logger.error(`Ukessammendrag ${week}: sending feilet, prøver ikke igjen. ${error instanceof Error ? error.message : "Ukjent feil"}`);
      repository.finishWeeklyRecap(channelId, week, "failed");
      return;
    }
    repository.finishWeeklyRecap(channelId, week, "sent", ts);
    logger.info(`Ukessammendrag ${week}: sendt.`);
  }

  function schedule(): void {
    timer = setTimeout(() => {
      active = check()
        .catch((error: unknown) => {
          logger.error(`Ukessammendrag: kontroll feilet. ${error instanceof Error ? error.message : "Ukjent feil"}`);
        })
        .finally(() => { if (!stopped) schedule(); });
    }, MINUTE - (now().getTime() % MINUTE));
  }
  schedule();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await active;
  };
}
