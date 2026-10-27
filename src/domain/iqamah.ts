import { addDays, isFriday, isHm, isIsoDate, minutesOfDay } from "./dates";
import { PRAYER_LABELS, TIME_FIELDS, type DayTimes, type IqamahMode, type IqamahPrayer, type IqamahRule, type Project, type TimeField, type YearSchedule } from "./model";
import { localDateTime, localInstant } from "./zones";

const PRAYER_FIELD: Record<Exclude<IqamahPrayer, "JUMUAH">, TimeField> = {
  FAJR: "fajrInMosque",
  DHUHR: "dhuhr",
  ASR: "asr",
  MAGHRIB: "maghrib",
  ISHA: "isha",
};

const ORDER: Record<IqamahPrayer, number> = { FAJR: 1, DHUHR: 4, JUMUAH: 4, ASR: 5, MAGHRIB: 6, ISHA: 7 };

export type ScheduleLookup = {
  zone: string;
  current: YearSchedule | null;
  previous: YearSchedule | null;
};

export function lookupFor(project: Project, currentYear: number | null): ScheduleLookup {
  const current = currentYear === null ? null : project.schedules.find((item) => item.year === currentYear) ?? null;
  const previous = current
    ? project.schedules.filter((item) => item.year < current.year).sort((a, b) => b.year - a.year)[0] ?? null
    : null;
  return { zone: project.timezone, current, previous };
}

export function scheduleFor(lookup: ScheduleLookup, date: string): YearSchedule | null {
  const year = Number(date.slice(0, 4));
  if (lookup.current?.year === year) return lookup.current;
  if (lookup.previous && lookup.current && lookup.previous.year === year && lookup.previous.year < lookup.current.year) return lookup.previous;
  return null;
}

export function prayersOn(date: string): IqamahPrayer[] {
  const prayers: IqamahPrayer[] = isFriday(date)
    ? ["FAJR", "JUMUAH", "ASR", "MAGHRIB", "ISHA"]
    : ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"];
  return prayers.sort((a, b) => ORDER[a] - ORDER[b]);
}

export function activeRule(rules: IqamahRule[], prayer: IqamahPrayer, date: string): IqamahRule | null {
  const exception = rules.find((rule) => rule.prayer === prayer && rule.exception && rule.from === date);
  if (exception) return exception;
  const regular = rules
    .filter((rule) => rule.prayer === prayer && !rule.exception && rule.from <= date)
    .sort((a, b) => (a.from === b.from ? 0 : a.from < b.from ? 1 : -1))[0];
  if (!regular) return null;
  if (regular.until && date > regular.until) return null;
  return regular;
}

type Boundary = { prayer: IqamahPrayer; date: string; at: number | null; warning: string | null };
type BuiltEvent = { prayer: IqamahPrayer; at: number; start: number | null; rule: IqamahRule; warning: string | null };
type BuiltRow = { prayer: IqamahPrayer; start: number | null; event: BuiltEvent | null; detail: string };

function completeDay(year: YearSchedule | null, date: string): DayTimes | null {
  const day = year?.days[date];
  if (!year || !day) return null;
  if (TIME_FIELDS.some((field) => !isHm(day[field]))) return null;
  return day;
}

function provenance(rule: IqamahRule | null, date: string): string {
  if (!rule) return "Нет правила";
  return rule.exception ? `Исключение ${date}` : `С ${rule.from}`;
}

function boundaryOf(date: string, prayer: IqamahPrayer, lookup: ScheduleLookup): Boundary {
  const year = scheduleFor(lookup, date);
  const day = completeDay(year, date);
  if (!year || !day) {
    return { prayer, date, at: null, warning: `Нет календаря на ${date}: граница следующей молитвы ${PRAYER_LABELS[prayer]} не проверена` };
  }
  if (prayer === "JUMUAH") {
    return { prayer, date, at: null, warning: "Начало Джума не подтверждено: время Зухра из расписания не заменяет начало Джума" };
  }
  if (prayer === "FAJR" && year.fajrMeaning !== "PRAYER_START") {
    return { prayer, date, at: null, warning: `Начало следующего Фаджра ${date} не подтверждено (fajrInMosque / UNCONFIRMED)` };
  }
  const utc = localInstant(lookup.zone, date, day[PRAYER_FIELD[prayer]]).utc;
  if (utc === null) return { prayer, date, at: null, warning: `Нет календаря на ${date}: граница следующей молитвы ${PRAYER_LABELS[prayer]} не проверена` };
  return { prayer, date, at: utc, warning: null };
}

function following(date: string, prayer: IqamahPrayer, lookup: ScheduleLookup): Boundary[] {
  const order = prayersOn(date);
  const rest = order.slice(order.indexOf(prayer) + 1);
  return [...rest.map((item) => boundaryOf(date, item, lookup)), boundaryOf(addDays(date, 1), "FAJR", lookup)];
}

function clock(zone: string, utc: number): { date: string; time: string } {
  return localDateTime(zone, utc);
}

export function buildRows(date: string, rules: IqamahRule[], lookup: ScheduleLookup): BuiltRow[] {
  const year = scheduleFor(lookup, date);
  const day = completeDay(year, date);
  return prayersOn(date).map((prayer) => {
    const rule = activeRule(rules, prayer, date);
    const label = provenance(rule, date);
    if (!rule || rule.mode === "OFF") return { prayer, start: null, event: null, detail: `${label} · отключено` };
    if (!day || !year) return { prayer, start: null, event: null, detail: `${label} · нет календаря на дату` };
    const fajrKnown = prayer !== "FAJR" || year.fajrMeaning === "PRAYER_START";
    let start: number | null = null;
    if (prayer === "JUMUAH" && rule.start && isHm(rule.start)) start = localInstant(lookup.zone, date, rule.start).utc;
    else if (prayer !== "JUMUAH" && fajrKnown) start = localInstant(lookup.zone, date, day[PRAYER_FIELD[prayer]]).utc;
    if (rule.mode === "OFFSET" && start === null) {
      return { prayer, start: null, event: null, detail: `${label} · в файле не задано однозначное начало молитвы; загрузите исправленные данные` };
    }
    const at = rule.mode === "FIXED" ? localInstant(lookup.zone, date, rule.time).utc : start! + rule.minutes * 60_000;
    if (at === null || clock(lookup.zone, at).date !== date || (start !== null && at < start)) {
      return { prayer, start, event: null, detail: `${label} · икамат раньше начала или за пределами суток` };
    }
    const firstWarning = following(date, prayer, lookup)[0]?.warning;
    const warning = firstWarning ? `${date} · Икамат ${PRAYER_LABELS[prayer]}: ${firstWarning}. Согласованность с этой границей не установлена.` : null;
    const event: BuiltEvent = { prayer, at, start, rule, warning };
    const detail = `${label}${start === null ? " · начало не подтверждено" : " · база подтверждена"}${warning ? ` · ${warning}` : ""}`;
    return { prayer, start, event, detail };
  });
}

export type IqamahConflict = { detail: string; dates: string[] };

function durationMs(dimMinutes: number): number {
  return (dimMinutes === 0 ? 60 : dimMinutes * 60) * 1000;
}

export function findConflicts(rules: IqamahRule[], lookup: ScheduleLookup, dimMinutes: number): IqamahConflict[] {
  const dates = new Set<string>();
  for (const year of [lookup.current, lookup.previous]) {
    if (!year) continue;
    for (const date of Object.keys(year.days)) {
      if (completeDay(year, date)) dates.add(date);
    }
  }
  const ordered = [...dates].sort();
  const rows = new Map<string, BuiltRow[]>();
  for (const date of ordered) rows.set(date, buildRows(date, rules, lookup));
  const events: BuiltEvent[] = [];
  for (const date of ordered) {
    for (const row of rows.get(date) ?? []) {
      if (row.event) events.push(row.event);
    }
  }
  events.sort((a, b) => {
    const left = clock(lookup.zone, a.at).date;
    const right = clock(lookup.zone, b.at).date;
    if (left !== right) return left < right ? -1 : 1;
    return ORDER[a.prayer] - ORDER[b.prayer];
  });
  const duration = durationMs(dimMinutes);
  const conflicts: IqamahConflict[] = [];
  events.forEach((earlier, index) => {
    const date = clock(lookup.zone, earlier.at).date;
    for (const boundary of following(date, earlier.prayer, lookup)) {
      if (boundary.at === null) continue;
      const reason = earlier.at >= boundary.at
        ? "Икамат не раньше следующего начала молитвы"
        : earlier.at + duration > boundary.at
          ? "Индикация икамата пересекает следующее начало молитвы"
          : null;
      if (reason) conflicts.push({ detail: conflictDetail(lookup.zone, reason, earlier, boundary.prayer, boundary.at, true), dates: conflictDates(lookup.zone, earlier.at, boundary.at) });
    }
    const nextDate = addDays(date, 1);
    for (const later of events.slice(index + 1)) {
      const laterDate = clock(lookup.zone, later.at).date;
      if (laterDate > nextDate) break;
      const limit = later.start ?? later.at;
      const reason = earlier.at >= later.at
        ? "Нарушен порядок икаматов"
        : earlier.at + duration > limit
          ? "Пересекаются ожидание или индикация икаматов"
          : null;
      if (reason) conflicts.push({ detail: conflictDetail(lookup.zone, reason, earlier, later.prayer, later.at, false), dates: conflictDates(lookup.zone, earlier.at, later.at) });
    }
  });
  return conflicts;
}

function conflictDates(zone: string, left: number, right: number): string[] {
  return [...new Set([clock(zone, left).date, clock(zone, right).date])];
}

function conflictDetail(zone: string, reason: string, earlier: BuiltEvent, laterPrayer: IqamahPrayer, laterAt: number, prayerStart: boolean): string {
  const left = clock(zone, earlier.at);
  const right = clock(zone, laterAt);
  return `${reason}: икамат ${PRAYER_LABELS[earlier.prayer]} ${left.date} ${left.time} / ${prayerStart ? "начало молитвы" : "икамат"} ${PRAYER_LABELS[laterPrayer]} ${right.date} ${right.time}`;
}

export type DayPreview = { prayer: IqamahPrayer; line: string; problem: string | null; warning: string | null };

export function previewDate(date: string, project: Project, lookup: ScheduleLookup): DayPreview[] {
  return buildRows(date, project.iqamah, lookup).map((row) => {
    const title = PRAYER_LABELS[row.prayer];
    const warning = row.event?.warning?.replace("(fajrInMosque / UNCONFIRMED)", "— колонка «в мечети» не задаёт начало молитвы") ?? null;
    if (!row.event) {
      const rule = activeRule(project.iqamah, row.prayer, date);
      if (!rule || rule.mode === "OFF") return { prayer: row.prayer, line: `${title}: икамат не задан`, problem: null, warning: null };
      return { prayer: row.prayer, line: `${title}: не получается посчитать`, problem: plainProblem(row.detail), warning: null };
    }
    const at = clock(lookup.zone, row.event.at).time;
    if (row.start === null) return { prayer: row.prayer, line: `${title}: начало намаза не подтверждено → икамат ${at}`, problem: null, warning };
    const start = clock(lookup.zone, row.start).time;
    return { prayer: row.prayer, line: `${title}: начало ${start} → икамат ${at}`, problem: null, warning };
  });
}

function plainProblem(detail: string): string {
  if (detail.includes("не задано однозначное начало")) return "Для отсчёта от начала намаза это начало должно быть известно. Для Фаджра отметьте, что колонка — это начало намаза, или укажите точное время.";
  if (detail.includes("раньше начала") || detail.includes("пределами суток")) return "Икамат раньше начала намаза или переходит на следующие сутки. Время не исправлялось.";
  if (detail.includes("нет календаря")) return "На эту дату нет полного расписания намазов.";
  return "Это правило нельзя применить к выбранной дате.";
}

export function iqamahIssues(project: Project, lookup: ScheduleLookup, from: string, until: string): string[] {
  if (!project.iqamah.length) return [];
  if (!lookup.zone) return ["Сначала выберите часовой пояс мечети."];
  const issues: string[] = [];
  for (const rule of project.iqamah) issues.push(...ruleIssues(rule));
  if (issues.length) return issues;
  const seen = new Set<string>();
  for (const rule of project.iqamah) {
    const key = `${rule.prayer}|${rule.from}|${rule.exception}`;
    if (seen.has(key)) issues.push(`${PRAYER_LABELS[rule.prayer]}: два правила на одну дату.`);
    seen.add(key);
  }
  if (!lookup.current) {
    if (project.iqamah.some((rule) => rule.mode !== "OFF")) issues.push("Загрузите расписание намазов, чтобы проверить икамат. Без расписания файл для экрана не готовится.");
    return issues;
  }
  const conflicts = findConflicts(project.iqamah, lookup, project.dimMinutes).filter((conflict) => conflict.dates.some((date) => date >= from && date <= until));
  if (conflicts[0]) issues.push(`Исправьте время в календаре: ${conflicts[0].detail}`);
  const dates = new Set<string>();
  for (const year of [lookup.current, lookup.previous]) {
    if (!year) continue;
    for (const date of Object.keys(year.days)) {
      if (date >= from && date <= until && completeDay(year, date)) dates.add(date);
    }
  }
  if (!conflicts[0]) {
    for (const date of [...dates].sort()) {
      const year = scheduleFor(lookup, date);
      for (const prayer of prayersOn(date)) {
        const rule = activeRule(project.iqamah, prayer, date);
        if (!rule || rule.mode === "OFF") continue;
        if (rule.mode === "OFFSET" && prayer === "FAJR" && year?.fajrMeaning !== "PRAYER_START") {
          issues.push("Для отсчёта икамата Фаджра в расписании должно быть явно указано начало молитвы. Выберите точное время икамата или отметьте, что колонка Фаджра — это начало намаза.");
          return issues;
        }
        if (rule.mode === "OFFSET" && prayer === "JUMUAH" && !isHm(rule.start)) {
          issues.push("Для интервала Джума укажите начало Джума.");
          return issues;
        }
        const row = buildRows(date, project.iqamah, lookup).find((item) => item.prayer === prayer);
        if (!row?.event) {
          issues.push(`${date}: ${PRAYER_LABELS[prayer]}. ${row?.detail ?? "Правило не применилось."}`);
          return issues;
        }
      }
    }
  }
  return issues;
}

export function boundaryWarnings(project: Project, lookup: ScheduleLookup, from: string, until: string): string[] {
  const warnings: string[] = [];
  for (const year of [lookup.current, lookup.previous]) {
    if (!year) continue;
    for (const date of Object.keys(year.days).sort()) {
      if (date < from || date > until || !completeDay(year, date)) continue;
      for (const row of buildRows(date, project.iqamah, lookup)) {
        if (row.event?.warning && !warnings.includes(row.event.warning)) warnings.push(row.event.warning);
      }
    }
  }
  return warnings;
}

export function ruleIssues(rule: IqamahRule): string[] {
  const title = PRAYER_LABELS[rule.prayer];
  const issues: string[] = [];
  if (!isIsoDate(rule.from)) issues.push(`${title}: укажите дату начала правила.`);
  if (rule.exception && rule.until) issues.push(`${title}: исключение задаётся на один день, без даты окончания.`);
  if (rule.exception && rule.prayer === "JUMUAH" && !isFriday(rule.from)) issues.push("Разовая Джума должна приходиться на пятницу.");
  if (rule.until && rule.until < rule.from) issues.push(`${title}: конец правила раньше начала.`);
  if (rule.prayer !== "JUMUAH" && rule.start) issues.push(`${title}: начало обычной молитвы берётся только из расписания.`);
  if (rule.mode === "OFF" && (rule.time || rule.minutes || rule.start)) issues.push(`${title}: у отключённого правила не должно быть времени.`);
  if (rule.mode === "FIXED") {
    if (!isHm(rule.time)) issues.push(`${title}: укажите точное время.`);
    if (rule.minutes) issues.push(`${title}: для точного времени не указывайте минуты.`);
    if (rule.prayer === "JUMUAH" && rule.start && isHm(rule.start) && isHm(rule.time)) {
      const start = minutesOfDay(rule.start)!;
      const time = minutesOfDay(rule.time)!;
      if (time < start) issues.push("Икамат Джума раньше указанного начала.");
    }
  }
  if (rule.mode === "OFFSET") {
    if (rule.time) issues.push(`${title}: для интервала не указывайте точное время.`);
    if (!Number.isInteger(rule.minutes) || rule.minutes < 0 || rule.minutes > 720) issues.push(`${title}: интервал от 0 до 720 минут.`);
    if (rule.prayer === "JUMUAH" && !isHm(rule.start)) issues.push("Для интервала Джума нужно отдельное начало.");
  }
  return issues;
}

export function modeLabel(mode: IqamahMode): string {
  if (mode === "OFF") return "Не показывать";
  if (mode === "FIXED") return "Точное время";
  return "Через несколько минут после начала";
}
