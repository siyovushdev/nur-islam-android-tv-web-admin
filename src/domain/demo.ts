import { exportCalendarDocument } from "./calendar-io";
import type { IqamahRule, MosqueEvent, Project } from "./model";
import { createProject, putYear, syncPeriod } from "./project";
import { exportScheduleDocument } from "./schedule-io";
import { yearSchedule } from "./year-factory";

export function demoProject(): Project {
  const project = createProject();
  project.mosqueName = "Учебная мечеть";
  project.city = "Учебный город";
  project.mosqueId = "uchebnaya-mechet";
  project.cityId = "uchebny-gorod";
  project.mosqueIdCustom = true;
  project.cityIdCustom = true;
  project.timezone = "Europe/Moscow";
  project.source = "ТЕСТ: вымышленные данные для проверки программы, не для намаза";
  project.revision = "demo-1";
  project.demo = true;
  const year = yearSchedule(2026, "PRAYER_START");
  year.source = project.source;
  year.revision = "demo-1";
  year.origin = "manual";
  project.iqamah = demoRules();
  project.ramadan = [{ localId: "demo-ramadan", firstFast: "2026-02-18", eid: "2026-03-20" }];
  project.events = demoEvents();
  return syncPeriod(putYear(project, year));
}

function demoRules(): IqamahRule[] {
  const base = { until: null, exception: false, time: "", minutes: 0, start: "", from: "2026-01-01" };
  return [
    { ...base, localId: "fajr", prayer: "FAJR", mode: "OFFSET", minutes: 15 },
    { ...base, localId: "dhuhr", prayer: "DHUHR", mode: "OFFSET", minutes: 15 },
    { ...base, localId: "asr", prayer: "ASR", mode: "OFFSET", minutes: 10 },
    { ...base, localId: "maghrib", prayer: "MAGHRIB", mode: "OFFSET", minutes: 5 },
    { ...base, localId: "isha", prayer: "ISHA", mode: "OFFSET", minutes: 10 },
    { ...base, localId: "jumuah", prayer: "JUMUAH", mode: "FIXED", time: "13:00", start: "12:30" },
    { ...base, localId: "asr-day", prayer: "ASR", mode: "FIXED", time: "15:40", from: "2026-10-26", exception: true },
  ];
}

function demoEvents(): MosqueEvent[] {
  return [{
    localId: "demo-event",
    id: "uchebnaya-vstrecha",
    title: "Пример: встреча после намаза",
    titleTatar: "Мисал: намаздан соң очрашу",
    from: "2026-10-26",
    until: "",
    start: "18:00",
    end: "20:00",
  }];
}

export function demoFiles(): { scheduleName: string; schedule: string; calendarName: string; calendar: string } {
  const project = demoProject();
  return {
    scheduleName: "prayer-schedule-2026.json",
    schedule: exportScheduleDocument(project, project.schedules[0]),
    calendarName: "mosque-calendar.json",
    calendar: exportCalendarDocument(project),
  };
}
