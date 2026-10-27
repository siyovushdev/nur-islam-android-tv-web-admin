import { addDays, daysBetween, isFriday, isHm, isIsoDate } from "./dates";
import { fail } from "./format-error";
import { isPublicId, isTestSource, slugId } from "./ids";
import {
  CALENDAR_MAX_BYTES,
  decodeUtf8,
  isJsonObject,
  optionalBoolean,
  parseStrictJson,
  requireInteger,
  requireText,
  stableStringify,
  unknownKey,
  utf8Size,
  type Json,
  type JsonObject,
} from "./json-strict";
import { activeRule, ruleIssues } from "./iqamah";
import {
  PRAYERS,
  type IqamahMode,
  type IqamahPrayer,
  type IqamahRule,
  type MosqueEvent,
  type Project,
  type RamadanPeriod,
} from "./model";
import { zoneSupported } from "./zones";

const ROOT_KEYS = ["type", "schemaVersion", "mosque", "validFrom", "validUntil", "source", "revision", "demo", "iqamah", "ramadan", "events"];
const MOSQUE_KEYS = ["id", "name", "cityId", "city", "timezone"];
const RULE_KEYS = ["prayer", "from", "until", "exception", "mode", "time", "minutes", "start"];
const INT = /^(?:0|[1-9][0-9]{0,3})$/;

export type ParsedCalendar = {
  mosqueId: string;
  name: string;
  cityId: string;
  city: string;
  timezone: string;
  from: string;
  until: string;
  source: string;
  revision: string;
  demo: boolean;
  dimMinutes: number;
  rules: IqamahRule[];
  ramadan: RamadanPeriod[];
  events: MosqueEvent[];
};

export function parseCalendarBytes(bytes: Uint8Array): ParsedCalendar {
  if (bytes.length > CALENDAR_MAX_BYTES) fail("Календарь больше 1 МиБ");
  let rootJson: Json;
  try {
    rootJson = parseStrictJson(decodeUtf8(bytes));
  } catch (error) {
    if (error instanceof Error && /Календарь больше|UTF-8|Повтор JSON|Поврежд|Данные после|Слишком|Недопустимое/.test(error.message)) throw error;
    fail("Не удалось прочитать календарь: проверьте обязательные поля, даты и время.");
  }
  if (!isJsonObject(rootJson)) fail("Не удалось прочитать календарь: проверьте обязательные поля, даты и время.");
  try {
    return parseCalendarObject(rootJson);
  } catch (error) {
    if (error instanceof Error && error.name === "FormatError") throw error;
    fail("Не удалось прочитать календарь: проверьте обязательные поля, даты и время.");
  }
}

function parseCalendarObject(root: JsonObject): ParsedCalendar {
  const extra = unknownKey(root, ROOT_KEYS);
  if (extra) fail(`Неизвестное поле календаря: ${extra}`);
  if (requireText(root, "type", 40, "Тип") !== "mosqueCalendar" || requireInteger(root, "schemaVersion", INT, "Неподдерживаемый формат календаря мечети") !== 1) {
    fail("Неподдерживаемый формат календаря мечети");
  }
  const mosque = root.mosque;
  if (!isJsonObject(mosque)) fail("Укажите мечеть");
  const mosqueExtra = unknownKey(mosque, MOSQUE_KEYS);
  if (mosqueExtra) fail(`Неизвестное поле календаря: ${mosqueExtra}`);
  const mosqueId = requireText(mosque, "id", 80, "Мечеть");
  const cityId = requireText(mosque, "cityId", 80, "Город");
  if (!isPublicId(mosqueId) || !isPublicId(cityId)) fail("Неверный идентификатор мечети или города");
  const timezone = requireText(mosque, "timezone", 200, "Часовой пояс");
  if (!zoneSupported(timezone)) fail("Укажите именованный часовой пояс");
  const from = requireDate(root, "validFrom");
  const until = requireDate(root, "validUntil");
  if (until < from || until > addYearsSafe(from, 5)) fail("Период календаря: от одного дня до пяти лет");
  const source = requireText(root, "source", 200, "Источник");
  const revision = requireText(root, "revision", 80, "Версия данных");
  const demo = optionalBoolean(root, "demo", "Отметка учебного файла должна быть да или нет") || isTestSource(source);
  const within = (date: string) => {
    if (date < from || date > until) fail(`Дата ${date} вне периода календаря`);
  };
  let dimMinutes = 0;
  let rules: IqamahRule[] = [];
  if (root.iqamah !== undefined) {
    if (!isJsonObject(root.iqamah)) fail("Правила икамата записаны неверно");
    const iqExtra = unknownKey(root.iqamah, ["rules", "dimMinutes"]);
    if (iqExtra) fail(`Неизвестное поле календаря: ${iqExtra}`);
    if (root.iqamah.dimMinutes !== undefined) {
      dimMinutes = requireInteger(root.iqamah, "dimMinutes", INT, "Затемнение указывается целым числом");
      if (dimMinutes < 0 || dimMinutes > 60) fail("Затемнение: 0–60 минут; 0 — выключено");
    }
    rules = readRules(root.iqamah.rules, within, until);
  }
  const ramadan = readRamadan(root.ramadan, within);
  const events = readEvents(root.events, within);
  if (events.length > 366 || new Set(events.map((event) => event.id)).size !== events.length) fail("Повтор события или больше 366 событий");
  checkRamadan(ramadan);
  if (rules.length > 2048 || new Set(rules.map((rule) => `${rule.prayer}|${rule.from}|${rule.exception}`)).size !== rules.length) fail("Повтор правила на дату");
  return {
    mosqueId,
    name: requireText(mosque, "name", 60, "Мечеть"),
    cityId,
    city: requireText(mosque, "city", 80, "Город"),
    timezone,
    from,
    until,
    source,
    revision,
    demo,
    dimMinutes,
    rules,
    ramadan,
    events,
  };
}

function readRules(value: Json | undefined, within: (date: string) => void, periodUntil: string): IqamahRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("В поле rules нужен список");
  return value.map((element) => {
    if (!isJsonObject(element)) fail("Правило икамата записано неверно");
    const extra = unknownKey(element, RULE_KEYS);
    if (extra) fail(`Неизвестное поле календаря: ${extra}`);
    const prayer = requireText(element, "prayer", 20, "Намаз");
    if (!PRAYERS.includes(prayer as IqamahPrayer)) fail("Неверная молитва в правиле икамата");
    const mode = requireText(element, "mode", 20, "Способ");
    if (mode !== "OFF" && mode !== "FIXED" && mode !== "OFFSET") fail("Неверный способ задания икамата");
    const from = requireDate(element, "from");
    within(from);
    const hasUntil = element.until !== undefined;
    const until = hasUntil ? requireDate(element, "until") : periodUntil;
    if (hasUntil) within(until);
    if (until < from) fail("Конец правила раньше начала");
    const exception = optionalBoolean(element, "exception", "Отметка исключения должна быть да или нет");
    if (exception && hasUntil) fail("Разовое исключение задаётся на один день, без until");
    if (prayer !== "JUMUAH" && element.start !== undefined) fail("Начало обычной молитвы берётся только из расписания");
    if (exception && prayer === "JUMUAH" && !isFriday(from)) fail("Разовая Джума должна приходиться на пятницу");
    const start = element.start !== undefined ? requireTime(element, "start") : "";
    let time = "";
    let minutes = 0;
    if (mode === "OFF") {
      if (element.time !== undefined || element.minutes !== undefined || start) fail("У отключённого правила не должно быть времени");
    } else if (mode === "FIXED") {
      if (element.minutes !== undefined) fail("Для точного икамата укажите только время");
      time = requireTime(element, "time");
      if (start && minutesOf(time) < minutesOf(start)) fail("Икамат Джума раньше указанного начала");
    } else {
      if (element.time !== undefined) fail("Для интервала укажите только минуты");
      if (prayer === "JUMUAH" && !start) fail("Для интервала Джума нужно отдельное начало");
      minutes = requireInteger(element, "minutes", INT, "В минутах нужно целое число");
      if (minutes > 720) fail("Интервал икамата не больше 720 минут");
    }
    return {
      localId: crypto.randomUUID(),
      prayer: prayer as IqamahPrayer,
      from,
      until: hasUntil ? until : null,
      exception,
      mode: mode as IqamahMode,
      time,
      minutes,
      start,
    };
  });
}

function readRamadan(value: Json | undefined, within: (date: string) => void): RamadanPeriod[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("Даты Рамадана записаны неверно");
  return value.map((element) => {
    if (!isJsonObject(element)) fail("Даты Рамадана записаны неверно");
    const extra = unknownKey(element, ["firstFast", "eid"]);
    if (extra) fail(`Неизвестное поле календаря: ${extra}`);
    const firstFast = requireDate(element, "firstFast");
    within(firstFast);
    const eid = element.eid !== undefined ? requireDate(element, "eid") : "";
    if (eid) within(eid);
    return { localId: crypto.randomUUID(), firstFast, eid };
  });
}

function readEvents(value: Json | undefined, within: (date: string) => void): MosqueEvent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("События записаны неверно");
  return value.map((element) => {
    if (!isJsonObject(element)) fail("Событие записано неверно");
    const extra = unknownKey(element, ["id", "title", "titleTatar", "from", "until", "start", "end"]);
    if (extra) fail(`Неизвестное поле календаря: ${extra}`);
    const from = requireDate(element, "from");
    within(from);
    const until = element.until !== undefined ? requireDate(element, "until") : "";
    if (until) within(until);
    const start = element.start !== undefined ? requireTime(element, "start") : "";
    const end = element.end !== undefined ? requireTime(element, "end") : "";
    const last = until || from;
    if (last < from || (start && end && end <= start)) fail("Неверный период события; для показа через полночь задайте два события");
    return {
      localId: crypto.randomUUID(),
      id: requireText(element, "id", 80, "Событие"),
      title: requireText(element, "title", 120, "Заголовок"),
      titleTatar: element.titleTatar !== undefined ? requireText(element, "titleTatar", 120, "Заголовок на татарском") : "",
      from,
      until,
      start,
      end,
    };
  });
}

export function checkRamadan(periods: RamadanPeriod[]): void {
  if (periods.length > 402 || new Set(periods.map((item) => item.firstFast)).size !== periods.length) fail("Повтор первого дня поста или слишком много записей");
  const sorted = [...periods].sort((a, b) => (a.firstFast < b.firstFast ? -1 : 1));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const next = sorted[index];
    const end = previous.eid || addDays(previous.firstFast, 29);
    if (next.firstFast <= end) fail("Периоды поста пересекаются");
  }
  for (const period of periods) {
    if (!isIsoDate(period.firstFast)) fail("Укажите первый день поста");
    if (period.eid) {
      const span = daysBetween(period.firstFast, period.eid);
      if (span < 29 || span > 30) fail("До Ураза-байрама должно быть 29 или 30 дней поста");
    }
  }
}

function requireDate(object: JsonObject, key: string): string {
  const value = requireText(object, key, 10, "Дата");
  if (!isIsoDate(value) || Number(value.slice(0, 4)) < 2000 || Number(value.slice(0, 4)) > 2200) fail(`Дата должна быть в виде ГГГГ-ММ-ДД, год 2000–2200`);
  return value;
}

function requireTime(object: JsonObject, key: string): string {
  const value = requireText(object, key, 5, "Время");
  if (!isHm(value)) fail("Время должно быть в виде ЧЧ:ММ");
  return value;
}

function minutesOf(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function addYearsSafe(iso: string, years: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const probe = new Date(Date.UTC(year + years, month - 1, day));
  if (probe.getUTCMonth() !== month - 1) {
    const last = new Date(Date.UTC(year + years, month, 0));
    return last.toISOString().slice(0, 10);
  }
  return probe.toISOString().slice(0, 10);
}

export function exportCalendarDocument(project: Project): string {
  const document: Record<string, unknown> = {
    type: "mosqueCalendar",
    schemaVersion: 1,
    mosque: {
      id: project.mosqueId,
      name: project.mosqueName,
      cityId: project.cityId,
      city: project.city,
      timezone: project.timezone,
    },
    validFrom: project.calendarFrom,
    validUntil: project.calendarUntil,
    source: project.source,
    revision: project.revision,
    demo: project.demo || isTestSource(project.source),
  };
  if (project.iqamah.length || project.dimMinutes > 0) {
    const iqamah: Record<string, unknown> = {
      rules: project.iqamah.map(ruleToJson),
    };
    if (project.dimMinutes > 0) iqamah.dimMinutes = project.dimMinutes;
    document.iqamah = iqamah;
  }
  if (project.ramadan.length) {
    document.ramadan = project.ramadan.map((period) => {
      const item: Record<string, string> = { firstFast: period.firstFast };
      if (period.eid) item.eid = period.eid;
      return item;
    });
  }
  if (project.events.length) {
    document.events = project.events.map((event) => {
      const item: Record<string, string> = { id: event.id, title: event.title, from: event.from };
      if (event.titleTatar) item.titleTatar = event.titleTatar;
      if (event.until && event.until !== event.from) item.until = event.until;
      if (event.start) item.start = event.start;
      if (event.end) item.end = event.end;
      return item;
    });
  }
  return stableStringify(document);
}

function ruleToJson(rule: IqamahRule): Record<string, unknown> {
  const item: Record<string, unknown> = { prayer: rule.prayer, from: rule.from };
  if (rule.until) item.until = rule.until;
  if (rule.exception) item.exception = true;
  item.mode = rule.mode;
  if (rule.mode === "FIXED") item.time = rule.time;
  if (rule.mode === "OFFSET") item.minutes = rule.minutes;
  if (rule.prayer === "JUMUAH" && rule.mode !== "OFF" && rule.start) item.start = rule.start;
  return item;
}

export function exportCalendarBytes(project: Project): { text: string; bytes: number } {
  const text = exportCalendarDocument(project);
  return { text, bytes: utf8Size(text) };
}

export type RamadanView = { title: string; detail: string };

export function ramadanView(date: string, periods: RamadanPeriod[]): RamadanView {
  if (!periods.length) return { title: "Даты Рамадана не заданы", detail: "Укажите первый день поста по документу мечети. Дата не вычисляется автоматически." };
  const sorted = [...periods].sort((a, b) => (a.firstFast < b.firstFast ? -1 : 1));
  const active = [...sorted].reverse().find((period) => date >= period.firstFast && date <= (period.eid || addDays(period.firstFast, 29)));
  const next = sorted.find((period) => period.firstFast > date);
  const selected = active ?? next;
  if (!selected) return { title: "Этот период уже прошёл", detail: "Добавьте даты следующего года, если они есть в документе." };
  if (!active && next) {
    const days = daysBetween(date, next.firstFast);
    return { title: `До первого дня поста: ${days} дн.`, detail: `Первый день поста ${next.firstFast}${next.eid ? `, Ураза-байрам ${next.eid}` : ", дата Ураза-байрама не указана"}.` };
  }
  if (selected.eid && date === selected.eid) return { title: "Ураза-байрам", detail: "Поздравление показывается в этот день." };
  const day = daysBetween(selected.firstFast, date) + 1;
  if (!selected.eid && day >= 30) return { title: "Окончание поста не указано", detail: "Без даты Ураза-байрама 30-й день не считается установленным днём поста." };
  const until = selected.eid ? ` До Ураза-байрама ${daysBetween(date, selected.eid)} дн.` : " Дата Ураза-байрама не указана, известны первые 29 дней.";
  return { title: `Рамадан: день ${day}`, detail: until.trim() };
}

export function eventPreview(event: MosqueEvent): string {
  const when = event.until && event.until !== event.from ? `${event.from} — ${event.until}` : event.from;
  const clock = !event.start && !event.end ? "весь день" : `${event.start || "00:00"}–${event.end || "конец дня"}`;
  const tatar = event.titleTatar ? ` / ${event.titleTatar}` : "";
  return `${event.title}${tatar}. ${when}, ${clock}.`;
}

export function splitOvernight(event: MosqueEvent): MosqueEvent[] {
  if (!event.start || !event.end || event.end > event.start) return [event];
  const morningFrom = addDays(event.from, 1);
  const morningUntil = event.until ? addDays(event.until, 1) : "";
  const groupId = event.groupId || event.localId;
  const evening: MosqueEvent = { ...event, groupId, end: "", until: event.until };
  const morning: MosqueEvent = {
    ...event,
    localId: crypto.randomUUID(),
    id: uniqueEventId(`${event.id}-utro`),
    groupId,
    from: morningFrom,
    until: morningUntil,
    start: "",
    end: event.end,
    title: event.title,
  };
  return [evening, morning];
}

function uniqueEventId(seed: string): string {
  const base = slugId(seed, "sobytie");
  return base.slice(0, 80);
}

export function applyCalendar(project: Project, parsed: ParsedCalendar, alignPlace: boolean): Project {
  const next: Project = {
    ...project,
    source: parsed.source,
    revision: parsed.revision,
    demo: parsed.demo,
    calendarFrom: parsed.from,
    calendarUntil: parsed.until,
    periodManual: true,
    dimMinutes: parsed.dimMinutes,
    iqamah: parsed.rules,
    ramadan: parsed.ramadan,
    events: parsed.events,
  };
  if (alignPlace) {
    next.mosqueName = parsed.name;
    next.city = parsed.city;
    next.mosqueId = parsed.mosqueId;
    next.cityId = parsed.cityId;
    next.timezone = parsed.timezone;
    next.mosqueIdCustom = true;
    next.cityIdCustom = true;
  }
  return next;
}

export function rulesCovering(project: Project, prayer: IqamahPrayer, date: string): IqamahRule | null {
  return activeRule(project.iqamah, prayer, date);
}

export function describeRuleProblems(rules: IqamahRule[]): string[] {
  return rules.flatMap(ruleIssues);
}
