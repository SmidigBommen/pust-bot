import { activityLabels, type ActivityType } from "../domain/activity.js";
import type { BrokenPersonalRecord, PersonalRecords } from "../domain/personal-records.js";

const number = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

function recordValue(metric: BrokenPersonalRecord["metric"], value: number): string {
  return `${number.format(value)} ${metric === "distanceKm" ? "km" : "minutter"}`;
}

export function personalRecordsMessage(records: readonly PersonalRecords[]): string {
  if (records.length === 0) return "";
  return [
    "*Personlige rekorder i Pust*",
    ...records.map(record => {
      const details = [`Lengste økt: ${recordValue("minutes", record.minutes)}`];
      if (record.distanceKm !== undefined) details.push(`Lengste distanse: ${recordValue("distanceKm", record.distanceKm)}`);
      return `• *${activityLabels[record.type]}* · ${details.join(" · ")}`;
    }),
  ].join("\n");
}

export function personalRecordCelebration(type: ActivityType, records: readonly BrokenPersonalRecord[]): string {
  if (records.length === 0) return "";
  return [
    `🏅 *Ny personlig rekord i ${activityLabels[type].toLocaleLowerCase("nb-NO")}!*`,
    ...records.map(record =>
      `${record.metric === "distanceKm" ? "Lengste distanse" : "Lengste økt"}: ${recordValue(record.metric, record.value)}. Tidligere rekord: ${recordValue(record.metric, record.previousValue)}.`),
  ].join("\n");
}
