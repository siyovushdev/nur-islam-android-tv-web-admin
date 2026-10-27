import { unzipSync } from "fflate";
import { addDays, fromMinutes, isIsoDate } from "./dates";
import { Decimal, excelMinutes } from "./decimal";
import { FormatError, fail } from "./format-error";
import { isTestSource } from "./ids";
import { stableStringify } from "./json-strict";
import { parseScheduleText, type ParsedSchedule } from "./schedule-io";
import { walkXml, type XmlHandler } from "./xml";

const MAX_BYTES = 8 * 1024 * 1024;
const HEADERS = ["Дата", "Завершение сухура", "Совершается в мечети", "Восход солнца", "Зенит", "Зухр", "Аср", "Магриб", "Иша"];
const COLUMNS = ["B", "C", "D", "E", "F", "G", "H", "I", "J"];
const TIME_KEYS = ["suhurEnd", "fajrInMosque", "sunrise", "zawal", "dhuhr", "asr", "maghrib", "isha"] as const;

type Cell = { text: string; type: string; formula: boolean };

export type XlsxSchedule = ParsedSchedule & { excelNotice: string };

function xfail(message: string): never {
  fail(`Excel: ${message}`);
}

export async function parseXlsx(bytes: Uint8Array, fileName = ""): Promise<XlsxSchedule> {
  if (bytes.length > MAX_BYTES) xfail("файл больше 8 МиБ");
  if (bytes.length >= 2 && bytes[0] === 0xd0 && bytes[1] === 0xcf) fail("Старый .xls не поддерживается. Сохраните файл в формате .xlsx.");
  if (!(bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b)) xfail("повреждённый XLSX или неподдерживаемая структура");
  const parts = readZip(bytes);
  if (parts.size === 0) xfail("нужен .xlsx; старый .xls не поддерживается");
  for (const name of parts.keys()) {
    if (/vba|externalLinks|embeddings/i.test(name)) xfail("макросы и внешние ссылки не поддерживаются");
  }
  const types = textPart(parts, "[Content_Types].xml", "нет описания XLSX");
  read(types, {
    start(_name, attrs) {
      const contentType = attrs.ContentType ?? "";
      if (/macroEnabled|vbaProject|oleObject/i.test(contentType)) xfail("макросы не поддерживаются");
    },
    end() {},
    text() {},
  });
  for (const [name, data] of parts) {
    if (!name.endsWith(".rels")) continue;
    read(decode(data), {
      start(local, attrs) {
        if (local === "Relationship" && (attrs.TargetMode === "External" || /^[a-zA-Z]+:/.test(attrs.Target ?? ""))) {
          xfail("внешние ссылки не поддерживаются");
        }
      },
      end() {},
      text() {},
    });
  }
  const workbook = textPart(parts, "xl/workbook.xml", "нет workbook.xml");
  let date1904 = false;
  const sheets: { year: number; id: string }[] = [];
  read(workbook, {
    start(name, attrs) {
      if (name === "workbookPr") date1904 = attrs.date1904 === "true" || attrs.date1904 === "1";
      if (name === "sheet") {
        const year = intOrNull(attrs.name);
        if (year !== null && year >= 2000 && year <= 2200) {
          if (!attrs.id) xfail("нет связи листа");
          sheets.push({ year, id: attrs.id });
        }
      }
    },
    end() {},
    text() {},
  });
  if (sheets.length !== 1) xfail("нужен ровно один лист с годом 2000–2200 в названии");
  const [{ year, id: sheetId }] = sheets;
  const rels = textPart(parts, "xl/_rels/workbook.xml.rels", "нет связей листов");
  const found: { target: string | null } = { target: null };
  read(rels, {
    start(name, attrs) {
      if (name === "Relationship" && attrs.Id === sheetId) {
        if (found.target !== null || attrs.Type !== "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet") xfail("неверная связь листа");
        found.target = attrs.Target ?? null;
      }
    },
    end() {},
    text() {},
  });
  if (!found.target) xfail("лист не найден");
  const path = found.target.startsWith("/") ? found.target.slice(1) : `xl/${found.target}`;
  if (path.split("/").includes("..")) xfail("небезопасный путь листа");
  const strings = parts.has("xl/sharedStrings.xml") ? sharedStrings(decode(parts.get("xl/sharedStrings.xml")!)) : [];
  const rows = readRows(textPart(parts, path, "нет данных листа"), strings);
  const header = rows.get(2);
  if (!header) xfail("нет второй строки заголовков");
  COLUMNS.forEach((column, index) => {
    const actual = header.get(column)?.text.trim();
    if (actual !== HEADERS[index]) xfail(`${column}: ожидается заголовок «${HEADERS[index]}»`);
  });
  const days: Record<string, string>[] = [];
  let formulaCount = 0;
  for (const [rowNumber, columns] of [...rows.entries()].filter(([row]) => row > 2)) {
    const city = columns.get("A")?.text.trim();
    if (city !== "Казань") xfail(`A${rowNumber}: поддерживается расписание Казани`);
    const dateCell = takeCell(columns, "B", rowNumber);
    if (dateCell.formula) formulaCount += 1;
    const date = dateCell.type === "n" ? excelDate(dateCell.text, date1904, `B${rowNumber}`) : textDate(dateCell.text, `B${rowNumber}`);
    if (Number(date.slice(0, 4)) !== year) xfail(`B${rowNumber}: дата не соответствует году листа`);
    const record: Record<string, string> = { date };
    COLUMNS.slice(1).forEach((column, index) => {
      const timeCell = takeCell(columns, column, rowNumber);
      if (timeCell.formula) formulaCount += 1;
      record[TIME_KEYS[index]] = timeText(timeCell, `${column}${rowNumber}`);
    });
    days.push(record);
  }
  const sha = await sha256(bytes);
  const phoneDemo = isTestSource(fileName);
  const document = {
    schemaVersion: 1,
    locationId: "kazan",
    locationName: "Казань",
    timezone: "Europe/Moscow",
    year,
    source: phoneDemo ? "ТЕСТ: Excel Казань — не утверждён мечетью" : "Excel Казань",
    revision: `xlsx-sha256:${sha}`,
    approved: false,
    fajrMeaning: "UNCONFIRMED",
    days,
  };
  let parsed: ParsedSchedule;
  try {
    parsed = parseScheduleText(stableStringify(document));
  } catch (error) {
    if (error instanceof FormatError) xfail(error.message.replace(/^Excel:\s*/, ""));
    xfail("повреждённый XLSX или неподдерживаемая структура");
  }
  return {
    ...parsed,
    excelNotice: `XLSX: ${days.length} дней, ${formulaCount} сохранённых результатов формул. Формулы не вычислялись. Сверьте значения с исходным Excel; его формулы могли не пересчитываться. Фаджр не подтверждён.`,
  };
}

function takeCell(columns: Map<string, Cell>, column: string, row: number): Cell {
  const cell = columns.get(column);
  if (!cell) xfail(`${column}${row}: пустая ячейка`);
  if (cell.type === "e") xfail(`${column}${row}: ошибка Excel`);
  if (cell.formula && !cell.text.trim()) xfail(`${column}${row}: формула без сохранённого результата`);
  return cell;
}

function timeText(cell: Cell, address: string): string {
  if (cell.type === "n") {
    const result = excelMinutes(cell.text);
    if ("error" in result) xfail(`${address}: ${result.error}`);
    return fromMinutes(result.minutes);
  }
  if (cell.type === "s" || cell.type === "inlineStr" || cell.type === "str") return cell.text.trim();
  xfail(`${address}: неподдерживаемый тип времени`);
}

function textDate(text: string, address: string): string {
  const value = text.trim();
  if (isIsoDate(value)) return value;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (match) {
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    if (isIsoDate(iso)) return iso;
  }
  xfail(`${address}: неверная дата`);
}

function excelDate(text: string, date1904: boolean, address: string): string {
  const serial = Decimal.parse(text);
  if (!serial) xfail(`${address}: неверное число`);
  if (!serial.isExactInteger()) xfail(`${address}: дата содержит время`);
  const day = serial.toInt();
  if (day < 1 || day > 110_000 || (!date1904 && day === 60)) xfail(`${address}: неверная Excel-дата`);
  const base = date1904 ? "1904-01-01" : "1899-12-31";
  const shift = !date1904 && day > 60 ? day - 1 : day;
  return addDays(base, shift);
}

function sharedStrings(xml: string): string[] {
  const strings: string[] = [];
  let chunks: string[] | null = null;
  let inText = false;
  let length = 0;
  read(xml, {
    start(name) {
      if (name === "si") {
        chunks = [];
        length = 0;
      }
      if (name === "t") inText = true;
    },
    end(name) {
      if (name === "t") inText = false;
      if (name === "si") {
        if (strings.length >= 20_000) xfail("слишком много строк");
        strings.push((chunks ?? []).join(""));
        chunks = null;
      }
    },
    text(value) {
      if (!inText || !chunks) return;
      chunks.push(value);
      length += value.length;
      if (length > 1000) xfail("слишком длинная строка");
    },
  });
  return strings;
}

function readRows(xml: string, strings: string[]): Map<number, Map<string, Cell>> {
  const rows = new Map<number, Map<string, Cell>>();
  let row = 0;
  let previousRow = 0;
  let cells = 0;
  let rowCells = new Map<string, Cell>();
  let seen = new Set<string>();
  let column = "";
  let type = "";
  let value = "";
  let reading = false;
  let formula = false;
  read(xml, {
    start(name, attrs) {
      if (name === "row") {
        const parsed = intOrNull(attrs.r);
        if (parsed === null || parsed <= previousRow || parsed > 20_000) xfail("повтор/неверный номер строки");
        row = parsed;
        previousRow = row;
        rowCells = new Map();
        seen = new Set();
      } else if (name === "c") {
        cells += 1;
        if (cells > 200_000) xfail("слишком много ячеек");
        const ref = attrs.r;
        const address = ref ? /^([A-Z]{1,3})([1-9][0-9]{0,4})$/.exec(ref) : null;
        if (!ref || !address || Number(address[2]) !== row) xfail(ref ? "неверный адрес ячейки" : "ячейка без адреса");
        column = address[1];
        if (seen.has(column)) xfail(`повтор ячейки ${ref}`);
        seen.add(column);
        type = attrs.t ?? "n";
        value = "";
        reading = false;
        formula = false;
      } else if (name === "v" || name === "t") reading = true;
      else if (name === "f") formula = true;
    },
    end(name) {
      if (name === "v" || name === "t") reading = false;
      else if (name === "c") {
        if (value || formula || type === "e") {
          let text = value;
          if (type === "s") {
            if (!/^[0-9]+$/.test(value)) xfail("неверная shared string");
            const index = Number(value);
            if (strings[index] === undefined) xfail("неверная shared string");
            text = strings[index];
          }
          rowCells.set(column, { text, type, formula });
        }
      } else if (name === "row" && rowCells.size) {
        if (rows.size >= 368) xfail("слишком много заполненных строк");
        rows.set(row, rowCells);
      }
    },
    text(chunk) {
      if (!reading) return;
      value += chunk;
      if (value.length > 1000) xfail("слишком длинная ячейка");
    },
  });
  return rows;
}

function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const seen = new Set<string>();
  let totalHint = 0;
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(bytes, {
      filter(file) {
        const name = file.name;
        if (
          seen.has(name) ||
          seen.size >= 200 ||
          name.startsWith("/") ||
          name.includes("\\") ||
          name.split("/").some((part) => part === "." || part === "..")
        ) {
          throw new FormatError("Excel: небезопасный ZIP");
        }
        seen.add(name);
        totalHint += file.originalSize || 0;
        if ((file.originalSize || 0) > 12 * 1024 * 1024 || totalHint > 24 * 1024 * 1024) {
          throw new FormatError("Excel: слишком большой распакованный файл");
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof FormatError) throw error;
    xfail("повреждённый XLSX или неподдерживаемая структура");
  }
  const parts = new Map<string, Uint8Array>();
  let total = 0;
  for (const [name, data] of Object.entries(unpacked)) {
    total += data.length;
    if (data.length > 12 * 1024 * 1024 || total > 24 * 1024 * 1024) xfail("слишком большой распакованный файл");
    parts.set(name, data);
  }
  return parts;
}

function textPart(parts: Map<string, Uint8Array>, name: string, message: string): string {
  const data = parts.get(name);
  if (!data) xfail(message);
  return decode(data);
}

function decode(data: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^\uFEFF/, "");
  } catch {
    xfail("повреждённый XLSX или неподдерживаемая структура");
  }
}

function read(xml: string, handler: XmlHandler): void {
  try {
    walkXml(xml, handler);
  } catch (error) {
    if (error instanceof FormatError) {
      if (error.message.startsWith("Excel:")) throw error;
      xfail(error.message);
    }
    xfail("повреждённый XLSX или неподдерживаемая структура");
  }
}

function intOrNull(value: string | undefined): number | null {
  if (!value || !/^[0-9]+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}
