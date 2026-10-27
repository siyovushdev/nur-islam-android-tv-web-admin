import { parseCalendarBytes, type ParsedCalendar } from "./calendar-io";
import { FormatError } from "./format-error";
import type { FilePlace, Project, YearSchedule } from "./model";
import { parseBackup, putYear, renameCity, renameMosque } from "./project";
import { parseScheduleBytes, scheduleToYear, type ParsedSchedule } from "./schedule-io";
import { parseXlsx } from "./xlsx";

export type DetectedFile =
  | { kind: "schedule"; parsed: ParsedSchedule; excelNotice?: string }
  | { kind: "calendar"; parsed: ParsedCalendar }
  | { kind: "backup"; project: Project }
  | { kind: "error"; message: string };

export async function detectFile(bytes: Uint8Array, fileName: string): Promise<DetectedFile> {
  const lower = fileName.toLowerCase();
  try {
    if (lower.endsWith(".xls") && !lower.endsWith(".xlsx")) return { kind: "error", message: "Старый формат Excel не поддерживается. Сохраните таблицу как xlsx." };
    if (lower.endsWith(".xlsx") || (bytes[0] === 0x50 && bytes[1] === 0x4b && !looksLikeJson(bytes))) {
      const parsed = await parseXlsx(bytes, fileName);
      return { kind: "schedule", parsed, excelNotice: parsed.excelNotice };
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    if (text.includes('"nurIslamAdminProject"')) {
      return { kind: "backup", project: parseBackup(text) };
    }
    if (text.includes('"mosqueCalendar"')) {
      return { kind: "calendar", parsed: parseCalendarBytes(bytes) };
    }
    return { kind: "schedule", parsed: parseScheduleBytes(bytes) };
  } catch (error) {
    return { kind: "error", message: error instanceof FormatError ? error.message : "Файл не удалось прочитать." };
  }
}

function looksLikeJson(bytes: Uint8Array): boolean {
  const start = new TextDecoder().decode(bytes.slice(0, 40)).trim();
  return start.startsWith("{") || start.startsWith("[");
}

export function scheduleChoice(project: Project, parsed: ParsedSchedule): { canKeepTimes: boolean; note: string } {
  const filePlace = placeText(parsed.place);
  if (!project.timezone || !project.city || !project.mosqueName) {
    return { canKeepTimes: false, note: `В файле: ${filePlace}. Эти сведения будут записаны в карточку, пустые поля заполнятся, уже введённое название не сотрётся без нужды.` };
  }
  const sameZone = project.timezone === parsed.place.timezone;
  const sameCity = project.cityId === parsed.place.locationId;
  const sameMosque = !parsed.place.mosqueId || project.mosqueId === parsed.place.mosqueId;
  if (sameZone && sameCity && sameMosque) return { canKeepTimes: true, note: `Файл подходит к этой мечети. ${filePlace}.` };
  if (!sameZone) return { canKeepTimes: false, note: `Пояс в файле другой (${filePlace}). Времена нельзя переносить в другой пояс молча. Подставьте сведения из файла или отмените загрузку.` };
  return { canKeepTimes: true, note: `Сейчас в карточке другой город или мечеть. В файле: ${filePlace}. Можно подставить сведения из файла или оставить карточку и взять только времена.` };
}

export function commitSchedule(project: Project, parsed: ParsedSchedule, mode: "align" | "times", excelNotice?: string): Project {
  let next: Project = { ...project, schedules: project.schedules.slice() };
  if (mode === "align" || !next.timezone || !next.city) {
    next = renameCity(next, parsed.place.locationName);
    next.cityId = parsed.place.locationId;
    next.cityIdCustom = true;
    next.timezone = parsed.place.timezone;
    if (parsed.place.mosqueName && (!next.mosqueName || mode === "align")) {
      next = { ...renameMosque(next, parsed.place.mosqueName), mosqueIdCustom: Boolean(parsed.place.mosqueId) };
    }
    if (parsed.place.mosqueId) {
      next.mosqueId = parsed.place.mosqueId;
      next.mosqueIdCustom = true;
    }
  }
  const origin: YearSchedule["origin"] = excelNotice ? "xlsx" : parsed.schemaVersion === 2 ? "json-v2" : "json-v1";
  const year = scheduleToYear(parsed, origin, excelNotice);
  return putYear(next, year);
}

function placeText(place: FilePlace): string {
  const mosque = place.mosqueName ? `${place.mosqueName}, ` : "";
  return `${mosque}${place.locationName}`;
}
