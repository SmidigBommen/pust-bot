import { activityLabels } from "../domain/activity.js";
import type { WeeklyProgress } from "../domain/weekly-progress.js";
import { activityEmoji } from "./activity-message.js";

export function activitySummary(progress: WeeklyProgress, period = "Denne uken", heading = "Ukens aktiviteter"): string[] {
  return [
    ...(progress.byType.length > 0 ? [`\n*${heading}*`] : []),
    ...progress.byType.map(({ type, minutes, distanceKm }) =>
      `${activityEmoji[type]} ${activityLabels[type]}: *${formatNumber(minutes)} min${distanceKm > 0 ? ` · ${formatNumber(distanceKm)} km` : ""}*`),
    "",
    `${period}: ${progress.activityCount} ${progress.activityCount === 1 ? "aktivitet" : "aktiviteter"} · ${progress.byType.length} ${progress.byType.length === 1 ? "aktivitetstype" : "aktivitetstyper"}`,
    `Totalt *${formatDuration(progress.totalMinutes)} i bevegelse${progress.distanceKm > 0 ? ` · ${formatNumber(progress.distanceKm)} km` : ""}*`,
  ];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value);
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} minutter`;
  return `${formatNumber(hours)} ${hours === 1 ? "time" : "timer"}${remainder > 0 ? ` og ${remainder} ${remainder === 1 ? "minutt" : "minutter"}` : ""}`;
}
