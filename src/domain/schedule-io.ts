import { daysOfYear, isHm, isIsoDate, lengthOfYear } from "./dates";
import { fail } from "./format-error";
import { isPublicId } from "./ids";
import {
  SCHEDULE_MAX_BYTES,
  decodeUtf8,
  isJsonObject,
  parseStrictJson,
  requireInteger,
  requireText,
  sameKeySet,
  stableStringify,
  unknownKey,
  utf8Size,
  type Json,
} from "./json-strict";
import { FIELD_LABELS, TIME_FIELDS, type DayTimes, type FajrMeaning, type FilePlace, type Project, type YearSchedule } from "./model";
import { localInstant, zoneSupported } from "./zones";

const ROOT_KEYS = ["schemaVersion", "locationId", "locationName", "timezone", "year", "source", "revision", "approved", "days", "fajrMeaning", "mosqueId", "mosqueName"];

export type ParsedSchedule = {
  schemaVersion: 1 | 2;
  place: FilePlace;
  year: number;
  source: string;
  revision: string;
  approved?: boolean;
  fajrMeaning: FajrMeaning;
  days: Record<string, DayTimes>;
};

export function parseScheduleBytes(bytes: Uint8Array): ParsedSchedule {
  if (bytes.length > SCHEDULE_MAX_BYTES) fail("Файл больше 1 МиБ");
  return parseScheduleText(decodeUtf8(bytes));
}

export function parseScheduleText(text: string): ParsedSchedule {
  let rootJson: Json;
  try {
    rootJson = parseStrictJson(text);
  } catch (error) {
    if (error instanceof Error && error.name === "FormatError") throw error;
    fail("Повреждённый JSON или неверный формат даты/времени");
  }
  if (!isJsonObject(rootJson)) fail("Ожидается объект расписания");
  const root = rootJson;
  const extra = unknownKey(root, ROOT_KEYS);
  if (extra) fail("В файле расписания есть лишнее поле");
  const schema = requireInteger(root, "schemaVersion", /^[0-9]{1,4}$/, "Версия файла расписания не поддерживается");
  if (schema !== 1 && schema !== 2) fail("Версия файла расписания не поддерживается");
  const timezone = requireText(root, "timezone", 200, "Часовой пояс");
  if (!zoneSupported(timezone)) fail("Неизвестный часовой пояс. Выберите пояс из списка, например московский.");
  const year = requireInteger(root, "year", /^[0-9]{1,4}$/, "Год указан неверно");
  if (year < 2000 || year > 2200) fail("Год вне поддерживаемого диапазона 2000–2200");
  let approved: boolean | undefined;
  if (root.approved !== undefined) {
    if (typeof root.approved !== "boolean") fail("Служебная отметка готовности должна быть да или нет");
    approved = root.approved;
  }
  const source = requireText(root, "source", 200, "Источник");
  const revision = requireText(root, "revision", 80, "Версия данных");
  const locationId = requireText(root, "locationId", 80, "Город");
  if (!isPublicId(locationId)) fail("Идентификатор города в файле записан неверно");
  const locationName = requireText(root, "locationName", 120, "Город");
  let fajrMeaning: FajrMeaning = "UNCONFIRMED";
  if (root.fajrMeaning !== undefined) {
    const meaning = requireText(root, "fajrMeaning", 40, "Смысл Фаджра");
    if (meaning !== "UNCONFIRMED" && meaning !== "PRAYER_START") fail("Смысл времени Фаджра в файле не распознан");
    fajrMeaning = meaning;
  }
  const place: FilePlace = { locationId, locationName, timezone };
  if (schema === 2) {
    const mosqueId = requireText(root, "mosqueId", 80, "Мечеть");
    if (!isPublicId(mosqueId)) fail("Идентификатор мечети в файле записан неверно");
    place.mosqueId = mosqueId;
    place.mosqueName = requireText(root, "mosqueName", 60, "Мечеть");
  }
  const daysValue = root.days;
  if (!Array.isArray(daysValue)) fail("В файле нет списка дней");
  const expected = lengthOfYear(year);
  if (daysValue.length !== expected) fail(`Нужен полный год: ${expected} дней`);
  const days: Record<string, DayTimes> = {};
  for (const element of daysValue) {
    if (!isJsonObject(element)) fail("Неверная запись дня");
    if (!sameKeySet(element, ["date", ...TIME_FIELDS])) fail("В каждом дне нужны дата и восемь времён");
    const date = requireText(element, "date", 10, "Дата");
    if (!isIsoDate(date)) fail("Дата должна быть в виде ГГГГ-ММ-ДД");
    if (Number(date.slice(0, 4)) !== year) fail(`Дата ${date} не относится к ${year} году`);
    if (days[date]) fail(`Повтор даты ${date}`);
    const times = {} as DayTimes;
    for (const field of TIME_FIELDS) {
      const time = requireText(element, field, 5, FIELD_LABELS[field]);
      if (!isHm(time)) fail(`${date}, ${FIELD_LABELS[field]}: нужно время от 00:00 до 23:59`);
      if (localInstant(timezone, date, time).count !== 1) {
        fail(`${date}, ${FIELD_LABELS[field]}: время ${time} пропущено или повторяется при переводе часов`);
      }
      times[field] = time;
    }
    days[date] = times;
  }
  for (const date of daysOfYear(year)) {
    if (!days[date]) fail(`Нет даты ${date}`);
  }
  return { schemaVersion: schema, place, year, source, revision, approved, fajrMeaning, days };
}

export function scheduleToYear(parsed: ParsedSchedule, origin: YearSchedule["origin"], excelNotice?: string): YearSchedule {
  const baseline: Record<string, DayTimes> = {};
  for (const [date, times] of Object.entries(parsed.days)) baseline[date] = { ...times };
  return {
    year: parsed.year,
    days: baseline,
    fajrMeaning: parsed.fajrMeaning,
    source: parsed.source,
    revision: parsed.revision,
    approved: parsed.approved,
    origin,
    excelNotice,
    baseline: structuredClone(baseline),
  };
}

export function exportScheduleDocument(project: Project, year: YearSchedule): string {
  const days = daysOfYear(year.year).map((date) => {
    const times = year.days[date];
    return {
      date,
      suhurEnd: times?.suhurEnd ?? "",
      fajrInMosque: times?.fajrInMosque ?? "",
      sunrise: times?.sunrise ?? "",
      zawal: times?.zawal ?? "",
      dhuhr: times?.dhuhr ?? "",
      asr: times?.asr ?? "",
      maghrib: times?.maghrib ?? "",
      isha: times?.isha ?? "",
    };
  });
  const document: Record<string, unknown> = {
    schemaVersion: 2,
    mosqueId: project.mosqueId,
    mosqueName: project.mosqueName,
    locationId: project.cityId,
    locationName: project.city,
    timezone: project.timezone,
    year: year.year,
    source: year.source,
    revision: year.revision,
  };
  if (year.approved !== undefined) document.approved = year.approved;
  document.fajrMeaning = year.fajrMeaning;
  document.days = days;
  return stableStringify(document);
}

export function exportScheduleBytes(project: Project, year: YearSchedule): { text: string; bytes: number } {
  const text = exportScheduleDocument(project, year);
  return { text, bytes: utf8Size(text) };
}
