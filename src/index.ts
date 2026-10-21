import "dotenv/config";
import { App } from "@slack/bolt";
import { loadConfig } from "./config.js";
import { registerSlackHandlers } from "./slack/register-handlers.js";
import { TeamRepository } from "./storage/team-repository.js";
import { ActivityRepository } from "./storage/activity-repository.js";
import { startHealthServer, stopHealthServer } from "./health-server.js";
import { startWeeklyRecap } from "./weekly-recap.js";
import { createWeeklyRecapSender } from "./slack/weekly-recap-sender.js";
import { ReportRepository } from "./storage/report-repository.js";
import { WeeklyArchive, startWeeklyArchive } from "./weekly-archive.js";
import { startArchiveServer } from "./web/server.js";

const config = loadConfig();
const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

const repository = new ActivityRepository(config.databasePath);
const teams = new TeamRepository(config.databasePath);
const reports = config.archiveEnabled ? new ReportRepository(config.databasePath, config.pustChannelId) : null;
const archive = reports ? new WeeklyArchive(reports, repository, config) : null;
registerSlackHandlers(app, {
  teams,
  repository,
  pustChannelId: config.pustChannelId,
  groupMemberCount: config.groupMemberCount,
  weeklyParticipantGoal: config.weeklyParticipantGoal,
  weeklyMinutesGoal: config.weeklyMinutesGoal,
});

const stopWeeklyArchive = archive ? startWeeklyArchive(archive, app.logger) : () => {};
const healthServer = reports
  ? await startArchiveServer({ port: config.healthPort, reports, onError: error => app.logger.error("Arkivforespørsel feilet", error) })
  : await startHealthServer(config.healthPort);
await app.start();
const stopWeeklyRecap = config.weeklyRecapEnabled
  ? startWeeklyRecap({
      repository,
      channelId: config.pustChannelId,
      groupMemberCount: config.groupMemberCount,
      weeklyParticipantGoal: config.weeklyParticipantGoal,
      weeklyMinutesGoal: config.weeklyMinutesGoal,
      send: createWeeklyRecapSender(config.slackBotToken),
      logger: app.logger,
      ...(archive ? { archive, archiveUrl: config.publicUrl } : {}),
    })
  : async () => {};
app.logger.info(`Automatisk ukessammendrag: ${config.weeklyRecapEnabled ? "søndag kl. 22:00 Europe/Oslo" : "av"}`);
app.logger.info(`Offentlig ukearkiv: ${archive ? config.publicUrl : "av"}`);
app.logger.info("🌬️ Pust er i gang!");

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.logger.info(`Stopper Pust etter ${signal}`);
  try {
    stopWeeklyArchive();
    await stopWeeklyRecap();
    await stopHealthServer(healthServer);
    await app.stop();
    teams.close();
    reports?.close();
    repository.close();
    process.exitCode = 0;
  } catch (error) {
    app.logger.error("Pust klarte ikke å stoppe kontrollert", error);
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));
