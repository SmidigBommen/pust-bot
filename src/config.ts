export interface Config {
  slackBotToken: string;
  slackAppToken: string;
  pustChannelId: string;
  databasePath: string;
  groupMemberCount: number;
  weeklyParticipantGoal: number;
  weeklyMinutesGoal: number;
  healthPort: number;
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
    groupMemberCount: numberSetting("PUST_GROUP_MEMBER_COUNT", 14),
    weeklyParticipantGoal: numberSetting("PUST_WEEKLY_PARTICIPANT_GOAL", 4),
    weeklyMinutesGoal: numberSetting("PUST_WEEKLY_MINUTES_GOAL", 240),
    healthPort: numberSetting("HEALTH_PORT", 3000),
  };
}

function numberSetting(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} må være et positivt heltall.`);
  }
  return parsed;
}
