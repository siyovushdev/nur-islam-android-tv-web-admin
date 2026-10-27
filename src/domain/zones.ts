const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let existing = formatters.get(zone);
  if (!existing) {
    existing = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, existing);
  }
  return existing;
}

export type CivilParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zoneSupported(zone: string): boolean {
  if (!zone || zone.startsWith("GMT") || zone.startsWith("UTC+") || zone.startsWith("UTC-")) return false;
  try {
    formatter(zone);
    return Intl.supportedValuesOf("timeZone").includes(zone);
  } catch {
    return false;
  }
}

function partsOf(zone: string, utcMs: number): CivilParts {
  const map: Record<string, string> = {};
  for (const part of formatter(zone).formatToParts(new Date(utcMs))) map[part.type] = part.value;
  let year = Number(map.year);
  let month = Number(map.month);
  let day = Number(map.day);
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  if (map.hour === "24") {
    const rolled = new Date(Date.UTC(year, month - 1, day + 1));
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  return { year, month, day, hour, minute: Number(map.minute), second: Number(map.second) };
}

function offsetAt(zone: string, utcMs: number): number {
  const parts = partsOf(zone, utcMs);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - utcMs;
}

export function localInstant(zone: string, date: string, time: string): { count: number; utc: number | null } {
  if (!zoneSupported(zone)) return { count: 0, utc: null };
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let rough: number;
  try {
    rough = offsetAt(zone, guess);
  } catch {
    return { count: 0, utc: null };
  }
  const found = new Set<number>();
  for (const deltaMin of [0, -60, 60, -30, 30, -45, 45, -120, 120, -90, 90, -15, 15]) {
    const off = rough + deltaMin * 60_000;
    const utc = guess - off;
    let back: number;
    let parts: CivilParts;
    try {
      back = offsetAt(zone, utc);
      parts = partsOf(zone, utc);
    } catch {
      continue;
    }
    if (back !== off) continue;
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute && parts.second === 0) {
      found.add(utc);
    }
  }
  const count = found.size;
  return { count, utc: count === 1 ? [...found][0] : null };
}

export function localDateTime(zone: string, utcMs: number): { date: string; time: string } {
  const parts = partsOf(zone, utcMs);
  const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return { date, time };
}

export function todayInZone(zone: string): string {
  if (!zone || !zoneSupported(zone)) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return localDateTime(zone, Date.now()).date;
}

export const RUSSIAN_ZONES: { id: string; label: string }[] = [
  { id: "Europe/Kaliningrad", label: "Калининград" },
  { id: "Europe/Moscow", label: "Москва" },
  { id: "Europe/Kirov", label: "Киров" },
  { id: "Europe/Volgograd", label: "Волгоград" },
  { id: "Europe/Astrakhan", label: "Астрахань" },
  { id: "Europe/Saratov", label: "Саратов" },
  { id: "Europe/Ulyanovsk", label: "Ульяновск" },
  { id: "Europe/Samara", label: "Самара" },
  { id: "Asia/Yekaterinburg", label: "Екатеринбург" },
  { id: "Asia/Omsk", label: "Омск" },
  { id: "Asia/Novosibirsk", label: "Новосибирск" },
  { id: "Asia/Barnaul", label: "Барнаул" },
  { id: "Asia/Tomsk", label: "Томск" },
  { id: "Asia/Novokuznetsk", label: "Новокузнецк" },
  { id: "Asia/Krasnoyarsk", label: "Красноярск" },
  { id: "Asia/Irkutsk", label: "Иркутск" },
  { id: "Asia/Chita", label: "Чита" },
  { id: "Asia/Yakutsk", label: "Якутск" },
  { id: "Asia/Khandyga", label: "Хандыга" },
  { id: "Asia/Vladivostok", label: "Владивосток" },
  { id: "Asia/Ust-Nera", label: "Усть-Нера" },
  { id: "Asia/Magadan", label: "Магадан" },
  { id: "Asia/Sakhalin", label: "Сахалин" },
  { id: "Asia/Srednekolymsk", label: "Среднеколымск" },
  { id: "Asia/Kamchatka", label: "Камчатка" },
  { id: "Asia/Anadyr", label: "Анадырь" },
].filter((zone) => zoneSupported(zone.id));

export function zoneLabel(id: string): string {
  return RUSSIAN_ZONES.find((zone) => zone.id === id)?.label ?? id;
}
