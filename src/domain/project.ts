import { daysOfYear, isIsoDate } from "./dates";
import { FormatError } from "./format-error";
import { slugId } from "./ids";
import { parseStrictJson, stableStringify, isJsonObject } from "./json-strict";
import {
  PROJECT_SCHEMA,
  PROJECT_TYPE,
  emptyDay,
  type DayTimes,
  type Project,
  type TimeField,
  type YearSchedule,
} from "./model";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createProject(): Project {
  const stamp = nowIso();
  return {
    id: crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp,
    mosqueName: "",
    city: "",
    mosqueId: "",
    cityId: "",
    mosqueIdCustom: false,
    cityIdCustom: false,
    timezone: "",
    source: "",
    revision: "1",
    demo: false,
    schedules: [],
    activeYear: null,
    calendarFrom: "",
    calendarUntil: "",
    periodManual: false,
    dimMinutes: 0,
    iqamah: [],
    ramadan: [],
    events: [],
  };
}

export function touchStamp(project: Project): Project {
  return { ...project, updatedAt: nowIso() };
}

export function renameMosque(project: Project, mosqueName: string): Project {
  const mosqueId = project.mosqueIdCustom ? project.mosqueId : mosqueName.trim() ? slugId(mosqueName, "mechet") : "";
  return { ...project, mosqueName, mosqueId };
}

export function renameCity(project: Project, city: string): Project {
  const cityId = project.cityIdCustom ? project.cityId : city.trim() ? slugId(city, "gorod") : "";
  return { ...project, city, cityId };
}

export function blankYear(year: number, source: string, revision: string): YearSchedule {
  const days: Record<string, DayTimes> = {};
  for (const date of daysOfYear(year)) days[date] = emptyDay();
  return { year, days, fajrMeaning: "UNCONFIRMED", source, revision, origin: "manual", baseline: null };
}

export function syncPeriod(project: Project): Project {
  if (project.periodManual && project.calendarFrom && project.calendarUntil) return project;
  const dates: string[] = [];
  for (const year of project.schedules) {
    dates.push(`${year.year}-01-01`, `${year.year}-12-31`);
  }
  for (const rule of project.iqamah) {
    dates.push(rule.from);
    if (rule.until) dates.push(rule.until);
  }
  for (const period of project.ramadan) {
    dates.push(period.firstFast);
    if (period.eid) dates.push(period.eid);
  }
  for (const event of project.events) {
    dates.push(event.from);
    if (event.until) dates.push(event.until);
  }
  const valid = dates.filter(isIsoDate).sort();
  if (!valid.length) return { ...project, calendarFrom: "", calendarUntil: "" };
  return { ...project, calendarFrom: valid[0], calendarUntil: valid[valid.length - 1] };
}

export function putYear(project: Project, year: YearSchedule): Project {
  const schedules = project.schedules.filter((item) => item.year !== year.year).concat(year).sort((a, b) => a.year - b.year);
  return syncPeriod({ ...project, schedules, activeYear: year.year });
}

export function mapYear(project: Project, year: number, change: (schedule: YearSchedule) => YearSchedule): Project {
  return {
    ...project,
    schedules: project.schedules.map((item) => (item.year === year ? change(item) : item)),
  };
}

export function updateTime(project: Project, year: number, date: string, field: TimeField, value: string): Project {
  return mapYear(project, year, (schedule) => ({
    ...schedule,
    days: { ...schedule.days, [date]: { ...(schedule.days[date] ?? emptyDay()), [field]: value } },
  }));
}

export type ProjectBackup = { type: typeof PROJECT_TYPE; schemaVersion: number; project: Project };

export function exportBackup(project: Project): string {
  const payload: ProjectBackup = { type: PROJECT_TYPE, schemaVersion: PROJECT_SCHEMA, project };
  return stableStringify(payload);
}

export function parseBackup(text: string): Project {
  let value: unknown;
  try {
    value = parseStrictJson(text);
  } catch (error) {
    if (error instanceof FormatError) throw new FormatError("Файл копии повреждён или это не копия проекта.");
    throw new FormatError("Файл копии повреждён или это не копия проекта.");
  }
  if (!isJsonObject(value) || value.type !== PROJECT_TYPE) throw new FormatError("Это не файл копии проекта.");
  if (value.schemaVersion !== PROJECT_SCHEMA || !isJsonObject(value.project)) throw new FormatError("Эта копия сделана другой версией программы.");
  return normalizeProject(value.project as unknown as Project);
}

function normalizeProject(project: Project): Project {
  if (!project || typeof project !== "object" || !project.id || !Array.isArray(project.schedules)) {
    throw new FormatError("В копии не хватает данных мечети.");
  }
  return {
    ...createProject(),
    ...project,
    schedules: project.schedules,
    iqamah: project.iqamah ?? [],
    ramadan: project.ramadan ?? [],
    events: project.events ?? [],
  };
}

export function projectHasContent(project: Project): boolean {
  return Boolean(
    project.mosqueName || project.city || project.schedules.length || project.iqamah.length || project.ramadan.length || project.events.length,
  );
}
