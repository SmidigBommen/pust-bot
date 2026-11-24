import { activityLabels, type ActivityType } from "../domain/activity.js";
import type { BrokenPersonalRecord, PersonalRecords } from "../domain/personal-records.js";
import { activityEmoji } from "./activity-message.js";

const number = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

function recordValue(metric: BrokenPersonalRecord["metric"], value: number): string {
  return `${number.format(value)} ${metric === "distanceKm" ? "km" : "minutter"}`;
}

export function personalRecordsMessage(records: readonly PersonalRecords[]): string {
  if (records.length === 0) return "";
  return [
    "*Personlige rekorder i Pust*",
    "Lengste økt og distanse per aktivitet",
    ...records.map(record => {
      const details = [`${number.format(record.minutes)} min`];
      if (record.distanceKm !== undefined) details.push(recordValue("distanceKm", record.distanceKm));
      const label = record.type === "other" ? ` ${activityLabels[record.type]}` : "";
      return `${activityEmoji[record.type]}${label} ${details.join(" · ")}`;
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
