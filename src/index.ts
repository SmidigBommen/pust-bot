import "dotenv/config";
import { App } from "@slack/bolt";
import { loadConfig } from "./config.js";
import { registerSlackHandlers } from "./slack/register-handlers.js";
import { ActivityRepository } from "./storage/activity-repository.js";
import { startHealthServer, stopHealthServer } from "./health-server.js";

const config = loadConfig();
const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

const repository = new ActivityRepository(config.databasePath);
registerSlackHandlers(app, {
  repository,
  pustChannelId: config.pustChannelId,
  groupMemberCount: config.groupMemberCount,
  weeklyParticipantGoal: config.weeklyParticipantGoal,
  weeklyMinutesGoal: config.weeklyMinutesGoal,
});

await app.start();
const healthServer = await startHealthServer(config.healthPort);
app.logger.info("🌬️ Pust er i gang!");

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.logger.info(`Stopper Pust etter ${signal}`);
  try {
    await stopHealthServer(healthServer);
    await app.stop();
    process.exitCode = 0;
  } catch (error) {
    app.logger.error("Pust klarte ikke å stoppe kontrollert", error);
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));
