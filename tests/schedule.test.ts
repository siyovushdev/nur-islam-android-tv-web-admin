import { describe, expect, it } from "vitest";
import { daysOfYear } from "../src/domain/dates";
import { FormatError } from "../src/domain/format-error";
import { exportScheduleDocument, parseScheduleText } from "../src/domain/schedule-io";
import { localInstant } from "../src/domain/zones";
import { sampleProject, scheduleJson } from "./support";

describe("расписание", () => {
  it("принимает полный обычный и високосный год", () => {
    expect(Object.keys(parseScheduleText(scheduleJson(2026)).days)).toHaveLength(365);
    const leap = parseScheduleText(scheduleJson(2028));
    expect(Object.keys(leap.days)).toHaveLength(366);
    expect(leap.days["2028-02-29"].dhuhr).toBe("12:05");
  });

  it("отклоняет неполный год, повтор и чужую дату", () => {
    const missing = JSON.parse(scheduleJson()) as { days: unknown[] };
    missing.days.shift();
    expect(() => parseScheduleText(JSON.stringify(missing))).toThrow(FormatError);
    const duplicate = JSON.parse(scheduleJson()) as { days: { date: string }[] };
    duplicate.days[1] = duplicate.days[0];
    expect(() => parseScheduleText(JSON.stringify(duplicate))).toThrow(/Повтор даты/);
    const wrong = JSON.parse(scheduleJson()) as { days: { date: string }[] };
    wrong.days[0].date = "2026-02-29";
    expect(() => parseScheduleText(JSON.stringify(wrong))).toThrow(FormatError);
  });

  it("проверяет поля, пояс и лишние данные", () => {
    for (const key of ["schemaVersion", "year", "source", "revision", "locationId", "locationName", "timezone", "days"]) {
      const document = JSON.parse(scheduleJson()) as Record<string, unknown>;
      delete document[key];
      expect(() => parseScheduleText(JSON.stringify(document))).toThrow(FormatError);
    }
    const badZone = JSON.parse(scheduleJson()) as { timezone: string };
    badZone.timezone = "Invalid/City";
    expect(() => parseScheduleText(JSON.stringify(badZone))).toThrow(/пояс/i);
    const version = JSON.parse(scheduleJson()) as { schemaVersion: number };
    version.schemaVersion = 2;
    expect(() => parseScheduleText(JSON.stringify(version))).toThrow(FormatError);
    const approved = JSON.parse(scheduleJson()) as { approved: unknown };
    approved.approved = "true";
    expect(() => parseScheduleText(JSON.stringify(approved))).toThrow(FormatError);
    expect(() => parseScheduleText(`${scheduleJson()}{}`)).toThrow(FormatError);
    expect(() => parseScheduleText('{"year":2026,"year":2026}')).toThrow(/Повтор/);
  });

  it("не округляет и не переставляет введённые минуты", () => {
    const document = JSON.parse(scheduleJson()) as { days: Record<string, string>[] };
    document.days[0].fajrInMosque = "01:00";
    document.days[0].isha = "18:50";
    const parsed = parseScheduleText(JSON.stringify(document));
    expect(parsed.days["2026-01-01"].fajrInMosque).toBe("01:00");
    expect(parsed.days["2026-01-01"].isha).toBe("18:50");
    expect(parsed.fajrMeaning).toBe("UNCONFIRMED");
  });

  it("версия 2 требует мечеть и сохраняет смысл Фаджра", () => {
    const parsed = parseScheduleText(scheduleJson(2026, { version: 2, meaning: "PRAYER_START" }));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.place.mosqueId).toBe("uchebnaya-mechet");
    expect(parsed.fajrMeaning).toBe("PRAYER_START");
  });

  it("экспорт версии 2 возвращает те же минуты", () => {
    const project = sampleProject();
    const year = project.schedules[0];
    year.days["2026-03-08"].asr = "15:40";
    const exported = exportScheduleDocument(project, year);
    const parsed = parseScheduleText(exported);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.days["2026-03-08"].asr).toBe("15:40");
    expect(parsed.days["2026-01-01"].isha).toBe("19:02");
    expect(parsed.days["2026-01-01"]).not.toHaveProperty("approved");
    for (const date of daysOfYear(2026)) {
      expect(parsed.days[date].dhuhr).toBe(year.days[date].dhuhr);
    }
  });

  it("отклоняет пропуск часа в Москве 2010 года", () => {
    expect(localInstant("Europe/Moscow", "2010-03-28", "02:30").count).toBe(0);
    expect(localInstant("Europe/Moscow", "2010-10-31", "02:30").count).toBe(2);
    expect(localInstant("Europe/Berlin", "2026-03-29", "02:30").count).toBe(0);
    expect(localInstant("Europe/Berlin", "2026-10-25", "02:30").count).toBe(2);
    const document = JSON.parse(scheduleJson(2010)) as { days: { date: string; fajrInMosque: string }[] };
    const day = document.days.find((item) => item.date === "2010-03-28");
    if (!day) throw new Error("нет 28 марта");
    day.fajrInMosque = "02:30";
    expect(() => parseScheduleText(JSON.stringify(document))).toThrow(/пропущено|повторяется/);
  });
});
