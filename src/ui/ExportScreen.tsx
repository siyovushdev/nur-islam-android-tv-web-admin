import { useEffect, useState } from "react";
import { exportCalendarDocument, parseCalendarBytes } from "../domain/calendar-io";
import { detectFile } from "../domain/import-flow";
import { exportScheduleDocument } from "../domain/schedule-io";
import { timesMatch, validateCalendar, validateSchedule, type CheckReport } from "../domain/validate";
import { BUNDLE_GUIDE, downloadBytes, downloadText, zipBundle } from "./download";
import { useStore } from "./store";

export function ExportScreen() {
  const store = useStore();
  const project = store.project;
  const [yearNumber, setYearNumber] = useState<number | null>(project?.activeYear ?? project?.schedules[0]?.year ?? null);
  const [report, setReport] = useState<{ schedule: CheckReport; calendar: CheckReport } | null>(null);
  const [compare, setCompare] = useState("");
  useEffect(() => {
    if (!project) return;
    setReport(null);
    const timer = window.setTimeout(() => {
      setReport({
        schedule: validateSchedule(project, yearNumber),
        calendar: validateCalendar(project, yearNumber),
      });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [project, yearNumber]);
  if (!project) return null;
  const year = project.schedules.find((item) => item.year === yearNumber) ?? null;
  const scheduleOk = Boolean(report && year && report.schedule.errors.length === 0);
  const calendarOk = Boolean(report && report.calendar.errors.length === 0);

  function saveSchedule() {
    if (!year) return;
    downloadText(`prayer-schedule-${year.year}.json`, exportScheduleDocument(project!, year));
  }
  function saveCalendar() {
    downloadText("mosque-calendar.json", exportCalendarDocument(project!));
  }
  function saveAll() {
    if (!year) return;
    const bytes = zipBundle({
      [`prayer-schedule-${year.year}.json`]: exportScheduleDocument(project!, year),
      "mosque-calendar.json": exportCalendarDocument(project!),
      "ИНСТРУКЦИЯ.txt": BUNDLE_GUIDE,
    });
    downloadBytes(`nur-islam-${year.year}.zip`, bytes, "application/zip");
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Файлы для приложения</h2>
        <p>Сначала на экран загружают годовое расписание, затем календарь. Один файл не стирает другой.</p>
        {project.schedules.length > 1 ? (
          <label className="inline">
            Год файла
            <select aria-label="Год файла" value={yearNumber ?? ""} onChange={(event) => setYearNumber(Number(event.target.value))}>
              {project.schedules.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}
            </select>
          </label>
        ) : null}
        {!report ? <p>Проверяем даты и пересечения…</p> : (
          <p className={scheduleOk && calendarOk ? "ok" : "alert"}>
            {scheduleOk && calendarOk ? "Можно скачивать." : "Есть ошибки — скачивание закрыто, подробности ниже."}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" disabled={!scheduleOk} onClick={saveSchedule}>Скачать расписание</button>
          <button type="button" className="btn" disabled={!calendarOk} onClick={saveCalendar}>Скачать календарь</button>
          <button type="button" className="btn secondary" disabled={!scheduleOk || !calendarOk} onClick={saveAll}>Скачать всё</button>
        </div>
        <Report title="Расписание" report={report?.schedule ?? null} />
        <Report title="Календарь" report={report?.calendar ?? null} />
      </section>
      <section className="panel">
        <h2>Сверить скачанный файл</h2>
        <p className="hint">Выберите только что скачанный файл. Программа сравнит значения с открытой мечетью и не заменит её.</p>
        <label className="btn secondary file">
          Сверить файл
          <input
            type="file"
            aria-label="Сверить файл"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) void compareFile(file, project!, yearNumber, setCompare);
            }}
          />
        </label>
        {compare ? <p role="status">{compare}</p> : null}
      </section>
    </div>
  );
}

function Report({ title, report }: { title: string; report: CheckReport | null }) {
  if (!report) return null;
  return (
    <div>
      <h3>{title}</h3>
      {report.errors.length === 0 ? <p className="ok">Можно скачивать.</p> : (
        <ul className="alert-list">{report.errors.map((error) => <li key={error}>{error}</li>)}</ul>
      )}
      {report.warnings.length ? (
        <details className="warn-list">
          <summary>Предупреждения: {report.warnings.length}</summary>
          {report.warnings.map((warning) => <p key={warning} className="note">{warning}</p>)}
        </details>
      ) : null}
    </div>
  );
}

async function compareFile(file: File, project: NonNullable<ReturnType<typeof useStore>["project"]>, yearNumber: number | null, setCompare: (value: string) => void) {
  const detected = await detectFile(new Uint8Array(await file.arrayBuffer()), file.name);
  if (detected.kind === "error") {
    setCompare(detected.message);
    return;
  }
  if (detected.kind === "schedule") {
    const year = project.schedules.find((item) => item.year === detected.parsed.year) ?? project.schedules.find((item) => item.year === yearNumber);
    if (!year || year.year !== detected.parsed.year) {
      setCompare("В файле другой год, чем открыт сейчас.");
      return;
    }
    const diffs = timesMatch(year, detected.parsed.days);
    setCompare(diffs.length === 0 ? "Все времена совпадают с открытым расписанием." : `Отличается ${diffs.length}: ${diffs.slice(0, 4).join("; ")}.`);
    return;
  }
  if (detected.kind === "calendar") {
    try {
      const parsed = parseCalendarBytes(new TextEncoder().encode(exportCalendarDocument(project)));
      const same = parsed.mosqueId === detected.parsed.mosqueId
        && parsed.cityId === detected.parsed.cityId
        && parsed.timezone === detected.parsed.timezone
        && parsed.from === detected.parsed.from
        && parsed.until === detected.parsed.until
        && parsed.rules.length === detected.parsed.rules.length
        && parsed.ramadan.length === detected.parsed.ramadan.length
        && parsed.events.length === detected.parsed.events.length
        && parsed.ramadan.every((period, index) => period.firstFast === detected.parsed.ramadan[index]?.firstFast && period.eid === detected.parsed.ramadan[index]?.eid);
      setCompare(same ? "Календарь совпадает с открытой мечетью." : "Календарь отличается от открытой мечети. Скачайте файл ещё раз, если правили данные после скачивания.");
    } catch (error) {
      setCompare(error instanceof Error ? error.message : "Календарь не удалось сверить.");
    }
    return;
  }
  setCompare("Это копия проекта, а не файл для экрана.");
}
