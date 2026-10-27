import { describe, expect, it } from "vitest";
import { exportCalendarDocument, parseCalendarBytes, ramadanView } from "../src/domain/calendar-io";
import { daysBetween } from "../src/domain/dates";
import { findConflicts, iqamahIssues, lookupFor, previewDate } from "../src/domain/iqamah";
import { isTestSource } from "../src/domain/ids";
import type { IqamahRule, Project } from "../src/domain/model";
import { putYear, syncPeriod } from "../src/domain/project";
import { validateCalendar, validateSchedule } from "../src/domain/validate";
import { sampleProject, yearSchedule } from "./support";

function rule(partial: Partial<IqamahRule> & Pick<IqamahRule, "prayer" | "mode">): IqamahRule {
  return {
    localId: partial.prayer + partial.mode + (partial.from ?? ""),
    from: "2026-01-01",
    until: null,
    exception: false,
    time: "",
    minutes: 0,
    start: "",
    ...partial,
  };
}

describe("икамат и календарь", () => {
  it("показывает начало и икамат и не меняет введённые минуты", () => {
    const project = withRules(sampleProject(), [
      rule({ prayer: "ASR", mode: "OFFSET", minutes: 10 }),
      rule({ prayer: "JUMUAH", mode: "FIXED", time: "13:00", start: "12:30" }),
    ]);
    const preview = previewDate("2026-10-26", project, lookupFor(project, 2026));
    expect(preview.find((item) => item.prayer === "ASR")?.line).toBe("Аср: начало 15:15 → икамат 15:25");
    const friday = previewDate("2026-10-23", project, lookupFor(project, 2026));
    expect(friday.find((item) => item.prayer === "JUMUAH")?.line).toBe("Джума: начало 12:30 → икамат 13:00");
    expect(friday.find((item) => item.prayer === "DHUHR")).toBeUndefined();
  });

  it("блокирует Джума позже начала Асра и не подменяет время", () => {
    const project = withRules(sampleProject(), [rule({ prayer: "JUMUAH", mode: "FIXED", time: "15:27", start: "12:30" })]);
    const issues = iqamahIssues(project, lookupFor(project, 2026), "2026-01-01", "2026-12-31");
    expect(issues[0]).toContain("Аср");
    expect(project.iqamah[0].time).toBe("15:27");
  });

  it("разрешает икамат Зухра за минуту до Асра и запрещает время раньше начала", () => {
    const allowed = withRules(sampleProject(), [rule({ prayer: "DHUHR", mode: "FIXED", time: "15:14" })]);
    expect(iqamahIssues(allowed, lookupFor(allowed, 2026), "2026-01-01", "2026-12-31")).toEqual([]);
    const early = withRules(sampleProject(), [rule({ prayer: "DHUHR", mode: "FIXED", time: "11:00" })]);
    expect(iqamahIssues(early, lookupFor(early, 2026), "2026-01-01", "2026-12-31").join(" ")).toMatch(/раньше начала/);
  });

  it("не принимает отсчёт Фаджра без подтверждённого начала", () => {
    const project = withRules(sampleProject(2026, "UNCONFIRMED"), [rule({ prayer: "FAJR", mode: "OFFSET", minutes: 15 })]);
    expect(iqamahIssues(project, lookupFor(project, 2026), "2026-01-01", "2026-12-31").join(" ")).toMatch(/Фаджра/);
    const fixed = withRules(sampleProject(2026, "UNCONFIRMED"), [rule({ prayer: "FAJR", mode: "FIXED", time: "05:45" })]);
    const line = previewDate("2026-10-26", fixed, lookupFor(fixed, 2026)).find((item) => item.prayer === "FAJR")?.line;
    expect(line).toBe("Фаджр: начало намаза не подтверждено → икамат 05:45");
  });

  it("сезон заканчивается и старое правило не возвращается", () => {
    const project = withRules(sampleProject(), [
      rule({ prayer: "ASR", mode: "OFFSET", minutes: 10, from: "2026-01-01" }),
      rule({ prayer: "ASR", mode: "OFFSET", minutes: 20, from: "2026-06-01", until: "2026-08-31" }),
    ]);
    expect(previewDate("2026-06-16", project, lookupFor(project, 2026)).find((item) => item.prayer === "ASR")?.line).toContain("15:35");
    expect(previewDate("2026-09-01", project, lookupFor(project, 2026)).find((item) => item.prayer === "ASR")?.line).toContain("не задан");
  });

  it("Рамадан 29 и 30 дней и отказ от выдуманного окончания", () => {
    expect(daysBetween("2026-02-18", "2026-03-19")).toBe(29);
    expect(daysBetween("2026-02-18", "2026-03-20")).toBe(30);
    const project = sampleProject();
    project.ramadan = [
      { localId: "a", firstFast: "2026-02-18", eid: "2026-03-20" },
      { localId: "b", firstFast: "2027-02-08", eid: "2027-03-09" },
    ];
    project.calendarFrom = "2026-01-01";
    project.calendarUntil = "2027-12-31";
    expect(ramadanView("2026-02-18", project.ramadan).title).toBe("Рамадан: день 1");
    expect(ramadanView("2026-03-20", project.ramadan).title).toBe("Ураза-байрам");
    expect(ramadanView("2026-02-01", project.ramadan).title).toContain("До первого дня поста");
    expect(ramadanView("2026-03-19", [{ localId: "c", firstFast: "2026-02-18", eid: "" }]).title).toMatch(/не указано/);
    expect(() => parseCalendarBytes(encode(calendar({ ramadan: [{ firstFast: "2026-02-18", eid: "2026-03-17" }] })))).toThrow(/29 или 30/);
  });

  it("календарь отвергает лишнее поле approved и ночной интервал одной записью", () => {
    expect(() => parseCalendarBytes(encode(calendar({ approved: true })))).toThrow(/Неизвестное поле/);
    expect(() => parseCalendarBytes(encode(calendar({
      events: [{ id: "night", title: "Ночь", from: "2026-10-26", start: "22:00", end: "01:00" }],
    })))).toThrow(/полночь/);
  });

  it("пустой икамат, другой пояс и 2027 год проходят проверку", () => {
    const project = sampleProject(2027);
    project.timezone = "Asia/Yekaterinburg";
    project.schedules[0].source = "Таблица мечети";
    const schedule = validateSchedule(project, 2027);
    expect(schedule.errors).toEqual([]);
    const calendarReport = validateCalendar(syncPeriod(project), 2027);
    expect(calendarReport.errors).toEqual([]);
    const text = exportCalendarDocument(syncPeriod(project));
    expect(text).not.toContain("approved");
    expect(text).not.toContain("iqamah");
    const parsed = parseCalendarBytes(encode(JSON.parse(text)));
    expect(parsed.timezone).toBe("Asia/Yekaterinburg");
    expect(parsed.rules).toEqual([]);
  });

  it("учебная пометка распознаётся, обычный источник — нет", () => {
    expect(isTestSource("ТЕСТ: Excel Казань")).toBe(true);
    expect(isTestSource("Excel Казань")).toBe(false);
    expect(isTestSource("Решение имама от 1 марта")).toBe(false);
  });

  it("конфликт не исчезает из списка правил", () => {
    const project = withRules(sampleProject(), [rule({ prayer: "DHUHR", mode: "FIXED", time: "15:27" })]);
    expect(findConflicts(project.iqamah, lookupFor(project, 2026), 0)[0].detail).toContain("15:27");
  });
});

function withRules(project: Project, rules: IqamahRule[]): Project {
  project.iqamah = rules;
  return syncPeriod(project);
}

function calendar(extra: Record<string, unknown> = {}): unknown {
  return {
    type: "mosqueCalendar",
    schemaVersion: 1,
    mosque: { id: "mosque-a", name: "Мечеть А", cityId: "test-mosque", city: "Город", timezone: "Europe/Moscow" },
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    source: "Документ мечети",
    revision: "1",
    ...extra,
  };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

void putYear;
void yearSchedule;
