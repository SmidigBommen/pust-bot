export interface Config {
  slackBotToken: string;
  slackAppToken: string;
  pustChannelId: string;
  databasePath: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Mangler miljøvariabelen ${name}.`);
  return value;
}

export function loadConfig(): Config {
  return {
    slackBotToken: required("SLACK_BOT_TOKEN"),
    slackAppToken: required("SLACK_APP_TOKEN"),
    pustChannelId: required("SLACK_PUST_CHANNEL_ID"),
    databasePath: process.env.DATABASE_PATH ?? "./data/pust.sqlite",
  };
}
