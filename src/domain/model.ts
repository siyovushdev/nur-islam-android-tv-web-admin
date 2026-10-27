export const TIME_FIELDS = ["suhurEnd", "fajrInMosque", "sunrise", "zawal", "dhuhr", "asr", "maghrib", "isha"] as const;
export type TimeField = (typeof TIME_FIELDS)[number];

export const FIELD_LABELS: Record<TimeField, string> = {
  suhurEnd: "Конец сухура",
  fajrInMosque: "Фаджр в мечети",
  sunrise: "Восход",
  zawal: "Зенит",
  dhuhr: "Зухр",
  asr: "Аср",
  maghrib: "Магриб",
  isha: "Иша",
};

export type FajrMeaning = "UNCONFIRMED" | "PRAYER_START";
export type IqamahPrayer = "FAJR" | "DHUHR" | "ASR" | "MAGHRIB" | "ISHA" | "JUMUAH";
export type IqamahMode = "OFF" | "FIXED" | "OFFSET";

export const PRAYER_LABELS: Record<IqamahPrayer, string> = {
  FAJR: "Фаджр",
  DHUHR: "Зухр",
  ASR: "Аср",
  MAGHRIB: "Магриб",
  ISHA: "Иша",
  JUMUAH: "Джума",
};

export const PRAYERS: IqamahPrayer[] = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA", "JUMUAH"];

export type DayTimes = Record<TimeField, string>;

export type FilePlace = {
  mosqueId?: string;
  mosqueName?: string;
  locationId: string;
  locationName: string;
  timezone: string;
};

export type YearSchedule = {
  year: number;
  days: Record<string, DayTimes>;
  fajrMeaning: FajrMeaning;
  source: string;
  revision: string;
  approved?: boolean;
  origin: "json-v1" | "json-v2" | "xlsx" | "manual";
  excelNotice?: string;
  baseline: Record<string, DayTimes> | null;
};

export type IqamahRule = {
  localId: string;
  prayer: IqamahPrayer;
  from: string;
  until: string | null;
  exception: boolean;
  mode: IqamahMode;
  time: string;
  minutes: number;
  start: string;
};

export type RamadanPeriod = {
  localId: string;
  firstFast: string;
  eid: string;
};

export type MosqueEvent = {
  localId: string;
  id: string;
  title: string;
  titleTatar: string;
  from: string;
  until: string;
  start: string;
  end: string;
  groupId?: string;
};

export type Project = {
  id: string;
  createdAt: string;
  updatedAt: string;
  mosqueName: string;
  city: string;
  mosqueId: string;
  cityId: string;
  mosqueIdCustom: boolean;
  cityIdCustom: boolean;
  timezone: string;
  source: string;
  revision: string;
  demo: boolean;
  schedules: YearSchedule[];
  activeYear: number | null;
  calendarFrom: string;
  calendarUntil: string;
  periodManual: boolean;
  dimMinutes: number;
  iqamah: IqamahRule[];
  ramadan: RamadanPeriod[];
  events: MosqueEvent[];
};

export function emptyDay(): DayTimes {
  return { suhurEnd: "", fajrInMosque: "", sunrise: "", zawal: "", dhuhr: "", asr: "", maghrib: "", isha: "" };
}

export function cloneDay(day: DayTimes): DayTimes {
  return { ...day };
}

export const PROJECT_TYPE = "nurIslamAdminProject";
export const PROJECT_SCHEMA = 1;
