import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseXlsx } from "../src/domain/xlsx";

const xlsx = new Uint8Array(readFileSync(new URL("./fixtures/kazan-2026.xlsx", import.meta.url)));
const tsv = readFileSync(new URL("./fixtures/kazan-2026.tsv", import.meta.url), "utf8").trim().split(/\n/);

describe("таблица Казани", () => {
  it("совпадает с эталоном 365×8 и не подтверждает Фаджр", async () => {
    const parsed = await parseXlsx(xlsx, "vremena_namazov_RT_2026_0.xlsx");
    expect(tsv).toHaveLength(365);
    let compared = 0;
    const fields = ["suhurEnd", "fajrInMosque", "sunrise", "zawal", "dhuhr", "asr", "maghrib", "isha"] as const;
    for (const line of tsv) {
      const cells = line.split("\t");
      const date = cells[0];
      fields.forEach((field, index) => {
        expect(parsed.days[date][field], `${date} ${field}`).toBe(cells[index + 1]);
        compared += 1;
      });
    }
    expect(compared).toBe(2920);
    expect(parsed.fajrMeaning).toBe("UNCONFIRMED");
    expect(parsed.approved).toBe(false);
    expect(parsed.place.locationId).toBe("kazan");
    expect(parsed.place.timezone).toBe("Europe/Moscow");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.days["2026-01-01"].isha).toBe("18:50");
    expect(parsed.excelNotice).toContain("730 сохранённых");
    expect(parsed.source).toBe("Excel Казань");
    expect(parsed.revision).toMatch(/^xlsx-sha256:[0-9a-f]{64}$/);
  });

  it("пометка теста в имени файла остаётся в источнике", async () => {
    const parsed = await parseXlsx(xlsx, "ТЕСТ ДЛЯ ТЕЛЕФОНА.xlsx");
    expect(parsed.source).toContain("ТЕСТ");
  });
});
