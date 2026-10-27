import { daysOfYear } from "../src/domain/dates";
import { createProject, putYear } from "../src/domain/project";
import type { DayTimes, FajrMeaning, Project, YearSchedule } from "../src/domain/model";

export const SAMPLE_TIMES: DayTimes = {
  suhurEnd: "05:08",
  fajrInMosque: "05:30",
  sunrise: "07:12",
  zawal: "11:40",
  dhuhr: "12:05",
  asr: "15:15",
  maghrib: "17:48",
  isha: "19:02",
};

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

export function sampleProject(year = 2026, meaning: FajrMeaning = "PRAYER_START"): Project {
  const project = createProject();
  project.mosqueName = "Учебная мечеть";
  project.city = "Учебный город";
  project.mosqueId = "uchebnaya-mechet";
  project.cityId = "uchebny-gorod";
  project.mosqueIdCustom = true;
  project.cityIdCustom = true;
  project.timezone = "Europe/Moscow";
  project.source = "Учебный документ мечети";
  project.revision = "1";
  return putYear(project, yearSchedule(year, meaning));
}

export function scheduleJson(year = 2026, options: { version?: 1 | 2; meaning?: FajrMeaning | null; asr?: string } = {}): string {
  const version = options.version ?? 1;
  const times = { ...SAMPLE_TIMES, asr: options.asr ?? SAMPLE_TIMES.asr };
  const days = daysOfYear(year).map((date) => ({ date, ...times }));
  const document: Record<string, unknown> = {
    schemaVersion: version,
    locationId: "test-mosque",
    locationName: "TEST ONLY",
    timezone: "Europe/Moscow",
    year,
    source: "SYNTHETIC TEST FIXTURE",
    revision: "test-1",
    approved: true,
    days,
  };
  if (version === 2) {
    document.mosqueId = "uchebnaya-mechet";
    document.mosqueName = "Учебная мечеть";
  }
  if (options.meaning) document.fajrMeaning = options.meaning;
  return JSON.stringify(document);
}
