import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const scheduleFile = "examples/prayer-schedule-2026.json";
const workbook = "tests/fixtures/kazan-2026.xlsx";

test("пустая мечеть не выдумывает времена и помнит карточку", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Подготовка расписания" })).toBeVisible();
  await page.getByRole("button", { name: "Новая мечеть" }).click();
  await page.getByLabel("Название мечети").fill("Мечеть Дружба");
  await page.getByRole("textbox", { name: "Город", exact: true }).fill("Уфа");
  await page.getByLabel("Часовой пояс").selectOption({ label: "Самара" });
  await expect(page.getByRole("status")).toHaveText("Сохранено в браузере");
  await page.reload();
  await expect(page.getByLabel("Название мечети")).toHaveValue("Мечеть Дружба");
  await expect(page.getByRole("textbox", { name: "Город", exact: true })).toHaveValue("Уфа");
  await expect(page.getByLabel("Часовой пояс")).toHaveValue("Europe/Samara");
  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  await expect(page.getByText("Времена сами не подставляются")).toBeVisible();
});

test("плохой файл не затирает мечеть", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая мечеть" }).click();
  await page.getByLabel("Название мечети").fill("Мечеть Дружба");
  await page.getByLabel("Загрузить файл").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Название мечети")).toHaveValue("Мечеть Дружба");
});

test("копия проекта открывается после удаления", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая мечеть" }).click();
  await page.getByLabel("Название мечети").fill("Мечеть Дружба");
  await page.getByRole("textbox", { name: "Город", exact: true }).fill("Уфа");
  await expect(page.getByRole("status")).toHaveText("Сохранено в браузере");
  const download = await clickDownload(page, "Скачать копию проекта");
  const file = test.info().outputPath("backup.json");
  await download.saveAs(file);
  await page.getByRole("button", { name: "Удалить эту мечеть" }).click();
  await page.getByRole("button", { name: "Да, удалить мечеть" }).click();
  await expect(page.getByRole("heading", { name: "Подготовка расписания" })).toBeVisible();
  await page.getByLabel("Загрузить файл").setInputFiles(file);
  await page.getByRole("button", { name: "Открыть как отдельную мечеть" }).click();
  await expect(page.getByLabel("Название мечети")).toHaveValue("Мечеть Дружба");
  await expect(page.getByRole("textbox", { name: "Город", exact: true })).toHaveValue("Уфа");
});

test("таблица Казани загружается без подмены города", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Новая мечеть" }).click();
  await page.getByLabel("Название мечети").fill("Мечеть Дружба");
  await page.getByRole("textbox", { name: "Город", exact: true }).fill("Уфа");
  await page.getByLabel("Часовой пояс").selectOption({ label: "Москва" });
  await page.getByLabel("Загрузить файл").setInputFiles(workbook);
  await page.getByRole("button", { name: "Оставить карточку и взять только времена" }).click();
  await expect(page.getByText(/730 сохранённых/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Начало намаза не подтверждено" })).toBeChecked();
  await page.getByLabel("Перейти к дате").fill("2026-01-01");
  await expect(dayTime(page, "Иша")).toHaveValue("18:50");
  await page.getByRole("button", { name: "Мечеть", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Город", exact: true })).toHaveValue("Уфа");
  await expect(page.getByLabel("Название мечети")).toHaveValue("Мечеть Дружба");
});

test("создание, правка, скачивание и повторная загрузка сохраняют минуты", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Новая мечеть" }).click();
  await page.getByLabel("Название мечети").fill("Мечеть Дружба");
  await page.getByRole("textbox", { name: "Город", exact: true }).fill("Уфа");
  await page.getByLabel("Часовой пояс").selectOption({ label: "Москва" });
  await page.getByLabel("Откуда взяты данные календаря").fill("Решение имама от 1 марта");
  await page.getByLabel("Загрузить файл").setInputFiles(scheduleFile);
  await page.getByRole("button", { name: "Оставить карточку и взять только времена" }).click();
  await page.getByLabel("Перейти к дате").fill("2026-10-27");
  await dayTime(page, "Зухр").fill("12:11");
  await dayTime(page, "Зухр").press("Tab");
  await expect(page.getByText("Изменено значений: 1")).toBeVisible();
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(dayTime(page, "Зухр")).toHaveValue("12:05");
  await dayTime(page, "Зухр").fill("12:11");
  await dayTime(page, "Зухр").press("Tab");

  await page.getByRole("button", { name: "Икамат", exact: true }).click();
  const asr = page.getByRole("region", { name: "Аср" });
  await asr.getByRole("button", { name: "Добавить правило" }).click();
  await asr.getByLabel("Как считать").selectOption({ label: "Через несколько минут после начала намаза" });
  await asr.getByLabel("Минут после начала").fill("10");
  await asr.getByLabel("С какой даты").fill("2026-01-01");
  await asr.getByRole("button", { name: "Сохранить правило" }).click();
  await expect(asr.getByText("10 мин")).toBeVisible();

  await page.getByRole("button", { name: "Рамадан", exact: true }).click();
  await page.getByLabel("Первый день поста").fill("2026-02-18");
  await page.getByLabel("Ураза-байрам").fill("2026-03-20");
  await page.getByRole("button", { name: "Добавить Рамадан" }).click();
  await expect(page.getByText("Дней поста: 30")).toBeVisible();

  await page.getByRole("button", { name: "Праздники и объявления", exact: true }).click();
  await page.getByRole("textbox", { name: "Заголовок", exact: true }).fill("Пятничное объявление");
  await page.getByLabel("Дата начала").fill("2026-10-30");
  await page.getByRole("button", { name: "Добавить запись" }).click();
  await expect(page.getByRole("heading", { name: "Пятничное объявление" })).toBeVisible();

  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  await expect(page.getByRole("button", { name: "Скачать расписание" })).toBeEnabled({ timeout: 30_000 });
  const scheduleDownload = await clickDownload(page, "Скачать расписание");
  const schedulePath = test.info().outputPath("prayer-schedule-2026.json");
  await scheduleDownload.saveAs(schedulePath);
  const schedule = JSON.parse(readFileSync(schedulePath, "utf8")) as {
    schemaVersion: number;
    mosqueName: string;
    locationName: string;
    timezone: string;
    fajrMeaning: string;
    days: { date: string; dhuhr: string }[];
  };
  expect(schedule.schemaVersion).toBe(2);
  expect(schedule.mosqueName).toBe("Мечеть Дружба");
  expect(schedule.locationName).toBe("Уфа");
  expect(schedule.timezone).toBe("Europe/Moscow");
  expect(schedule.fajrMeaning).toBe("PRAYER_START");
  expect(schedule.days.find((day) => day.date === "2026-10-27")?.dhuhr).toBe("12:11");
  expect(schedule.days.find((day) => day.date === "2026-01-01")?.dhuhr).toBe("12:05");
  expect(schedule).not.toHaveProperty("approved");

  const calendarDownload = await clickDownload(page, "Скачать календарь");
  const calendarPath = test.info().outputPath("mosque-calendar.json");
  await calendarDownload.saveAs(calendarPath);
  const calendar = JSON.parse(readFileSync(calendarPath, "utf8")) as {
    type: string;
    approved?: unknown;
    ramadan: { firstFast: string; eid: string }[];
    events: { title: string }[];
    iqamah: { rules: { prayer: string; minutes: number }[] };
  };
  expect(calendar.type).toBe("mosqueCalendar");
  expect(calendar.approved).toBeUndefined();
  expect(calendar.ramadan[0]).toEqual({ firstFast: "2026-02-18", eid: "2026-03-20" });
  expect(calendar.events[0].title).toBe("Пятничное объявление");
  expect(calendar.iqamah.rules.some((rule) => rule.prayer === "ASR" && rule.minutes === 10)).toBe(true);

  await page.getByLabel("Загрузить файл").setInputFiles(schedulePath);
  await page.getByRole("button", { name: "Оставить карточку и взять только времена" }).click();
  await page.getByLabel("Перейти к дате").fill("2026-01-01");
  await expect(dayTime(page, "Зухр")).toHaveValue("12:05");
  await page.getByLabel("Перейти к дате").fill("2026-10-27");
  await expect(dayTime(page, "Зухр")).toHaveValue("12:11");
  await page.reload();
  await page.getByLabel("Перейти к дате").fill("2026-10-27");
  await expect(dayTime(page, "Зухр")).toHaveValue("12:11");
});

test("стрелки переходят между временами", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "на телефоне дни правятся карточкой, без широкой таблицы");
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть учебный пример" }).click();
  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  const first = page.locator('[data-cell="2026-10-01:suhurEnd"]');
  await first.focus();
  await first.press("ArrowRight");
  await expect(page.locator('[data-cell="2026-10-01:fajrInMosque"]')).toBeFocused();
});

function dayTime(page: Page, name: string): Locator {
  return page.getByRole("textbox", { name, exact: true });
}

async function clickDownload(page: Page, name: string) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name }).click();
  return download;
}
