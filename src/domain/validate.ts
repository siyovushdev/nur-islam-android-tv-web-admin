import { exportCalendarBytes, parseCalendarBytes } from "./calendar-io";
import { daysOfYear, isHm, isIsoDate } from "./dates";
import { FormatError } from "./format-error";
import { isPublicId, isTestSource } from "./ids";
import { boundaryWarnings, iqamahIssues, lookupFor } from "./iqamah";
import { FIELD_LABELS, TIME_FIELDS, type Project, type YearSchedule } from "./model";
import { exportScheduleBytes, parseScheduleText } from "./schedule-io";
import { zoneSupported } from "./zones";

export type CheckReport = { errors: string[]; warnings: string[] };

export function validateSchedule(project: Project, yearNumber: number | null): CheckReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const year = project.schedules.find((item) => item.year === yearNumber) ?? null;
  if (!year) errors.push("Загрузите или заполните расписание на выбранный год. Пустые времена не подставляются.");
  placeErrors(project, errors);
  if (year) {
    if (!year.source.trim()) errors.push("Укажите, откуда взято расписание.");
    if (year.source.length > 200) errors.push("Источник расписания длиннее 200 знаков.");
    if (!year.revision.trim() || year.revision.length > 80) errors.push("Укажите версию расписания, до 80 знаков.");
    const missing: string[] = [];
    for (const date of daysOfYear(year.year)) {
      const day = year.days[date];
      for (const field of TIME_FIELDS) {
        const value = day?.[field] ?? "";
        if (!isHm(value)) missing.push(`${date}, ${FIELD_LABELS[field]}`);
      }
    }
    if (missing.length) errors.push(`Не заполнено ${missing.length} времён. Например: ${missing.slice(0, 4).join("; ")}.`);
    if (year.fajrMeaning === "UNCONFIRMED") warnings.push("Начало Фаджра не подтверждено. От икамата Фаджра можно отсчитывать только точное время.");
    if (isTestSource(year.source)) warnings.push("В источнике расписания есть пометка учебного или тестового файла. Экран покажет, что данные демонстрационные.");
    if (!errors.length) {
      try {
        const exported = exportScheduleBytes(project, year);
        if (exported.bytes > 1_048_576) errors.push("Файл расписания больше 1 МиБ.");
        const parsed = parseScheduleText(exported.text);
        for (const date of daysOfYear(year.year)) {
          for (const field of TIME_FIELDS) {
            if (parsed.days[date][field] !== year.days[date][field]) errors.push(`Время изменилось при подготовке файла: ${date}, ${FIELD_LABELS[field]}.`);
          }
        }
      } catch (error) {
        errors.push(error instanceof FormatError ? error.message : "Расписание не проходит проверку.");
      }
    }
  }
  return { errors: unique(errors).slice(0, 30), warnings: unique(warnings) };
}

export function validateCalendar(project: Project, yearNumber: number | null): CheckReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  placeErrors(project, errors);
  if (!project.source.trim()) errors.push("Укажите источник календаря: документ или решение мечети.");
  if (project.source.length > 200) errors.push("Источник календаря длиннее 200 знаков.");
  if (!project.revision.trim() || project.revision.length > 80) errors.push("Укажите версию календаря, до 80 знаков.");
  if (!isIsoDate(project.calendarFrom) || !isIsoDate(project.calendarUntil)) errors.push("Укажите, с какой по какую дату действует календарь.");
  if (project.dimMinutes < 0 || project.dimMinutes > 60) errors.push("Затемнение после икамата — от 0 до 60 минут.");
  const year = project.schedules.find((item) => item.year === yearNumber) ?? null;
  if (year && isIsoDate(project.calendarFrom) && isIsoDate(project.calendarUntil)) {
    const overlaps = daysOfYear(year.year).some((date) => date >= project.calendarFrom && date <= project.calendarUntil);
    if (!overlaps) errors.push("Период календаря не пересекается с выбранным годом расписания.");
  }
  if (isTestSource(project.source) || project.demo) warnings.push("Календарь помечен как учебный. На экране будет видно, что данные демонстрационные.");
  if (!errors.length) {
    const lookup = lookupFor(project, year?.year ?? project.activeYear);
    if (project.calendarFrom && project.calendarUntil) errors.push(...iqamahIssues(project, lookup, project.calendarFrom, project.calendarUntil));
    warnings.push(...plainWarnings(boundaryWarnings(project, lookup, project.calendarFrom, project.calendarUntil)));
  }
  if (!errors.length) {
    try {
      const exported = exportCalendarBytes(project);
      if (exported.bytes > 1_048_576) errors.push("Файл календаря больше 1 МиБ.");
      parseCalendarBytes(new TextEncoder().encode(exported.text));
    } catch (error) {
      errors.push(error instanceof FormatError ? error.message : "Календарь не проходит проверку.");
    }
  }
  return { errors: unique(errors).slice(0, 30), warnings: unique(warnings).slice(0, 8) };
}

function placeErrors(project: Project, errors: string[]) {
  if (!project.mosqueName.trim() || project.mosqueName.length > 60) errors.push("Укажите название мечети, до 60 знаков.");
  if (!project.city.trim() || project.city.length > 80) errors.push("Укажите город, до 80 знаков.");
  if (!isPublicId(project.mosqueId)) errors.push("Служебное имя мечети нужно поправить в дополнительных полях: латиница, цифры, дефис.");
  if (!isPublicId(project.cityId)) errors.push("Служебное имя города нужно поправить в дополнительных полях: латиница, цифры, дефис.");
  if (!zoneSupported(project.timezone)) errors.push("Выберите часовой пояс.");
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function plainWarnings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = item
      .replaceAll("JSON", "расписания")
      .replace("(fajrInMosque / UNCONFIRMED)", "колонка «в мечети» не задаёт начало намаза")
      .replace(/^\d{4}-\d{2}-\d{2} · /, "");
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.slice(0, 4);
}

export function timesMatch(year: YearSchedule, parsedDays: Record<string, Record<string, string>>): string[] {
  const diffs: string[] = [];
  for (const date of daysOfYear(year.year)) {
    for (const field of TIME_FIELDS) {
      if ((year.days[date]?.[field] ?? "") !== (parsedDays[date]?.[field] ?? "")) diffs.push(`${date} ${FIELD_LABELS[field]}`);
    }
  }
  return diffs;
}
