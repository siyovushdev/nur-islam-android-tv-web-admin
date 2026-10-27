import { describe, expect, it } from "vitest";
import { splitOvernight } from "../src/domain/calendar-io";
import { scheduleChoice } from "../src/domain/import-flow";
import type { MosqueEvent } from "../src/domain/model";
import { exportBackup, parseBackup } from "../src/domain/project";
import { parseScheduleText } from "../src/domain/schedule-io";
import { sampleProject, scheduleJson } from "./support";

describe("копия и выбор при загрузке", () => {
  it("копия проекта возвращает те же времена", () => {
    const project = sampleProject();
    project.schedules[0].days["2026-04-02"].maghrib = "18:10";
    const restored = parseBackup(exportBackup(project));
    expect(restored.mosqueName).toBe("Учебная мечеть");
    expect(restored.schedules[0].days["2026-04-02"].maghrib).toBe("18:10");
    expect(restored.timezone).toBe("Europe/Moscow");
  });

  it("не предлагает перенос времён в другой пояс", () => {
    const project = sampleProject();
    project.timezone = "Asia/Yekaterinburg";
    const choice = scheduleChoice(project, parseScheduleText(scheduleJson()));
    expect(choice.canKeepTimes).toBe(false);
    expect(choice.note).toMatch(/другой/i);
  });

  it("ночная запись делится на вечер и утро", () => {
    const event: MosqueEvent = {
      localId: "night",
      id: "noch",
      title: "Ночное чтение",
      titleTatar: "",
      from: "2026-03-10",
      until: "",
      start: "22:00",
      end: "01:00",
    };
    const parts = splitOvernight(event);
    expect(parts).toHaveLength(2);
    expect(parts[0].start).toBe("22:00");
    expect(parts[0].end).toBe("");
    expect(parts[1].from).toBe("2026-03-11");
    expect(parts[1].start).toBe("");
    expect(parts[1].end).toBe("01:00");
  });
});