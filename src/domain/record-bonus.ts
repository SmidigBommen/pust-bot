import type { Activity, ActivityInput, ActivityType } from "./activity.js";
import { brokenPersonalRecords, type BrokenPersonalRecord } from "./personal-records.js";

export const RECORD_BONUS_SPARKS = 10;

export interface RecordBonus {
  sparks: number;
  type: ActivityType;
  awardedOn: string;
  records: BrokenPersonalRecord[];
}

export function newRecordBonus(activity: Activity, history: readonly Activity[], today: string): RecordBonus | undefined {
  const records = brokenPersonalRecords(activity, history, today);
  return records.length > 0
    ? { sparks: records.length * RECORD_BONUS_SPARKS, type: activity.type, awardedOn: today, records }
    : undefined;
}

/** Edits may retain or revoke an award, but can never create or restore one. */
export function retainedRecordBonus(input: ActivityInput, bonus: RecordBonus | undefined): RecordBonus | undefined {
  if (!bonus || input.type !== bonus.type || input.activityDate > bonus.awardedOn) return undefined;
  const records = bonus.records.filter(record => {
    const value = input[record.metric];
    return value !== undefined && Number.isFinite(value) && value > record.previousValue;
  });
  return records.length > 0 ? { ...bonus, sparks: records.length * RECORD_BONUS_SPARKS, records } : undefined;
}
