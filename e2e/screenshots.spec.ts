import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const dir = process.env.SCREENSHOT_DIR;

test("снимки основных разделов", async ({ page }, info) => {
  test.skip(!dir, "снимки снимаются отдельно, не в обычной проверке");
  mkdirSync(dir!, { recursive: true });
  const prefix = info.project.name === "mobile" ? "mobile" : "desktop";
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть учебный пример" }).click();
  await expect(page.getByLabel("Название мечети")).toHaveValue("Учебная мечеть");
  await expect(page.getByRole("status")).toHaveText("Сохранено в браузере");
  await shot(page, `${dir}/${prefix}-mosque.png`);

  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  await page.getByLabel("Перейти к дате").fill("2026-10-27");
  const zuhr = page.getByRole("textbox", { name: "Зухр", exact: true });
  await zuhr.fill("12:11");
  await zuhr.press("Tab");
  await expect(page.getByText("Изменено значений: 1")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Сохранено в браузере");
  await shot(page, `${dir}/${prefix}-schedule.png`);

  await page.getByRole("button", { name: "Икамат", exact: true }).click();
  await expect(page.getByText(/начало .*икамат/).first()).toBeVisible();
  await shot(page, `${dir}/${prefix}-iqamah.png`);

  await page.getByRole("button", { name: "Рамадан", exact: true }).click();
  await page.getByLabel("Показать на дату").fill("2026-02-18");
  await expect(page.getByText("Рамадан: день 1")).toBeVisible();
  await shot(page, `${dir}/${prefix}-ramadan.png`);

  await page.getByRole("button", { name: "Праздники и объявления", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Пример: встреча после намаза" })).toBeVisible();
  await shot(page, `${dir}/${prefix}-events.png`);

  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  await expect(page.getByRole("button", { name: "Скачать расписание" })).toBeEnabled({ timeout: 30_000 });
  await shot(page, `${dir}/${prefix}-export.png`);
});

async function shot(page: import("@playwright/test").Page, path: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: false });
}
