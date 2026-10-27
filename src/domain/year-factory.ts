import { daysOfYear } from "./dates";
import { SAMPLE_TIMES } from "./sample-times";
import type { DayTimes, FajrMeaning, YearSchedule } from "./model";

export function yearSchedule(year: number, meaning: FajrMeaning = "PRAYER_START", times: DayTimes = SAMPLE_TIMES): YearSchedule {
  const days: Record<string, DayTimes> = {};
  for (const date of daysOfYear(year)) days[date] = { ...times };
  return {
    year,
    days,
    fajrMeaning: meaning,
    source: "Учебные данные",
    revision: "1",
    origin: "manual",
    baseline: structuredClone(days),
  };
}
