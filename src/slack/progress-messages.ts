import { levelProgress } from "../domain/levels.js";
import type { WeeklyProgress } from "../domain/weekly-progress.js";
import type { DateRange } from "../domain/week.js";
import { achievements, type AchievementKey } from "../domain/achievements.js";

interface GroupStatusInput {
  progress: WeeklyProgress;
  range: DateRange;
  memberCount: number;
  participantGoal: number;
  minutesGoal: number;
  groupStreak: number;
}

export function groupStatusMessage(input: GroupStatusInput): string {
  const { progress } = input;
  return [
    `🌬️ *Ukens Pust · ${displayDate(input.range.start)}–${displayDate(input.range.end)}*`,
    progressBar(progress.participants, input.participantGoal),
    `👥 *${progress.participants}/${input.participantGoal} deltakere* · ${input.memberCount} medlemmer i #pust`,
    progressBar(progress.qualifyingMinutes, input.minutesGoal),
    `⚡ *${progress.qualifyingMinutes}/${input.minutesGoal} minutter* mot ukesmålet`,
    progress.distanceKm > 0 ? `🏔️ Sammen har vi beveget oss *${formatNumber(progress.distanceKm)} km*.` : null,
    input.groupStreak > 0 ? `🔥 Gruppestreak: *${input.groupStreak} uker*` : null,
    progress.participants >= input.participantGoal && progress.qualifyingMinutes >= input.minutesGoal
      ? "🔥 *Full pust!* Begge ukesmålene er nådd."
      : "Hver aktivitet fra 10 minutter styrker Gnists felles Pust.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function personalStatusMessage(
  totalSparks: number,
  personalStreak = 0,
  earned: readonly AchievementKey[] = [],
): string {
  const progress = levelProgress(totalSparks);
  const currentLevel = progress.current
    ? `Nivå ${progress.current.number}: *${progress.current.name}*`
    : "På vei mot nivå 1: *Første Gnist*";
  const next = progress.next
    ? `${progress.sparksUntilNext} Sparks til *${progress.next.name}*`
    : "Du har nådd det høyeste nivået så langt—men reisen fortsetter!";

  const achievementLine =
    earned.length === 0
      ? null
      : `🏅 Prestasjoner: ${earned.map((key) => `*${achievements[key].name}*`).join(" · ")}`;
  return [
    `⚡ *Dine Sparks: ${formatNumber(totalSparks)}*`,
    currentLevel,
    next,
    personalStreak > 0 ? `🔥 Personlig streak: *${personalStreak} uker*` : "Registrer aktivitet denne uken for å starte en streak.",
    achievementLine,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function progressBar(value: number, goal: number): string {
  const width = 10;
  const filled = Math.min(width, Math.floor((value / goal) * width));
  return `${"🟩".repeat(filled)}${"⬜".repeat(width - filled)}`;
}

function displayDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}.${month}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value);
}
