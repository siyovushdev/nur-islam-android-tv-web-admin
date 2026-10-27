import { strToU8, zipSync } from "fflate";

export function downloadText(name: string, text: string, mime = "application/json"): void {
  downloadBytes(name, new TextEncoder().encode(text), mime);
}

export function downloadBytes(name: string, bytes: Uint8Array, mime: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const BUNDLE_GUIDE = `Нур Ислам — файлы для экрана

В архиве два файла. Оба нужны.

1. Откройте приложение Нур Ислам и выберите «Импорт».
2. Сначала выберите prayer-schedule-ГОД.json и примените. Это расписание намазов на год.
3. Затем выберите mosque-calendar.json и примените. Это икамат, Рамадан и объявления.

Годовой файл не стирает календарь. Календарь не стирает годовое расписание.
Приложение хранит новый год и предыдущий год вместе.
Не правьте файлы вручную: откройте эту программу, измените день и скачайте снова.
`;

export function zipBundle(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text);
  return zipSync(entries);
}
