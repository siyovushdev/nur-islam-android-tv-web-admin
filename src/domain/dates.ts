export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function lengthOfYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

export function addDays(iso: string, days: number): string {
  const parts = parseIsoDate(iso);
  if (!parts) throw new Error(`Неверная дата ${iso}`);
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return isoDate(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate());
}

export function daysBetween(from: string, until: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(until);
  if (!a || !b) throw new Error("Неверная дата");
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86_400_000);
}

export function compareIso(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function addYears(iso: string, years: number): string {
  const parts = parseIsoDate(iso);
  if (!parts) throw new Error(`Неверная дата ${iso}`);
  const day = Math.min(parts.day, lengthOfMonth(parts.year + years, parts.month));
  return isoDate(parts.year + years, parts.month, day);
}

export function lengthOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysOfYear(year: number): string[] {
  const total = lengthOfYear(year);
  const out: string[] = [];
  for (let index = 0; index < total; index += 1) out.push(addDays(isoDate(year, 1, 1), index));
  return out;
}

export function weekdayIndex(iso: string): number {
  const parts = parseIsoDate(iso);
  if (!parts) return 0;
  const sunday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return sunday === 0 ? 6 : sunday - 1;
}

export function isFriday(iso: string): boolean {
  return weekdayIndex(iso) === 4;
}

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const MONTHS_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function formatRuDate(iso: string): string {
  const parts = parseIsoDate(iso);
  if (!parts) return iso;
  return `${parts.day} ${MONTHS_GENITIVE[parts.month - 1]} ${parts.year}`;
}

export function monthTitle(year: number, month: number): string {
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

export function monthDates(year: number, month: number): string[] {
  const total = lengthOfMonth(year, month);
  return Array.from({ length: total }, (_, index) => isoDate(year, month, index + 1));
}

export function shiftYear(iso: string, year: number): string | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  if (parts.month === 2 && parts.day === 29 && !isLeapYear(year)) return null;
  return isoDate(year, parts.month, parts.day);
}

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isHm(value: string): boolean {
  return TIME_RE.test(value);
}

export function minutesOfDay(value: string): number | null {
  if (!isHm(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function fromMinutes(total: number): string {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function normalizeHm(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "";
  const digits = text.match(/^(\d{1,2}):(\d{2})$/);
  if (digits) {
    const hour = Number(digits[1]);
    const minute = Number(digits[2]);
    if (hour > 23 || minute > 59) return null;
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  const compact = text.match(/^(\d{3,4})$/);
  if (compact) {
    const padded = compact[1].padStart(4, "0");
    const hour = Number(padded.slice(0, 2));
    const minute = Number(padded.slice(2));
    if (hour > 23 || minute > 59) return null;
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  return null;
}
