import "dotenv/config";
import { App } from "@slack/bolt";
import { loadConfig } from "./config.js";
import { registerSlackHandlers } from "./slack/register-handlers.js";
import { ActivityRepository } from "./storage/activity-repository.js";

const config = loadConfig();
const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

const repository = new ActivityRepository(config.databasePath);
registerSlackHandlers(app, { repository, pustChannelId: config.pustChannelId });

await app.start();
app.logger.info("🌬️ Pust er i gang!");
