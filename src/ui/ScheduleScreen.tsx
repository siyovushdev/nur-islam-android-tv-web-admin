import { useEffect, useState, type KeyboardEvent } from "react";
import { WEEKDAYS, formatRuDate, isHm, monthDates, monthTitle, normalizeHm, weekdayIndex } from "../domain/dates";
import { FIELD_LABELS, TIME_FIELDS, type TimeField, type YearSchedule } from "../domain/model";
import { blankYear, mapYear, updateTime } from "../domain/project";
import { todayInZone } from "../domain/zones";
import { useStore } from "./store";
import { TextField } from "./widgets";

export function ScheduleScreen() {
  const store = useStore();
  const project = store.project;
  const [newYear, setNewYear] = useState("2026");
  const [bulkField, setBulkField] = useState<TimeField>("dhuhr");
  const [bulkTime, setBulkTime] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [timeError, setTimeError] = useState("");
  if (!project) return null;
  const year = project.schedules.find((item) => item.year === project.activeYear) ?? project.schedules[0] ?? null;

  const yearSwitch = project.schedules.length > 1 && year ? (
    <label className="inline year-switch">
      Год
      <select value={year.year} aria-label="Год" onChange={(event) => store.update((item) => ({ ...item, activeYear: Number(event.target.value) }))}>
        {project.schedules.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}
      </select>
    </label>
  ) : null;
  const addYearForm = (
    <div className="toolbar">
      <label className="inline grow">
        Добавить пустой год
        <input value={newYear} inputMode="numeric" aria-label="Добавить пустой год" onChange={(event) => setNewYear(event.target.value)} />
      </label>
      <button type="button" className="btn secondary" onClick={() => addYear(store, project.schedules, newYear)}>Создать пустой год</button>
    </div>
  );
  return (
    <div className="stack">
      {yearSwitch}
      {!year ? addYearForm : null}
      {!year ? (
        <section className="panel empty">
          <h2>Расписания пока нет</h2>
          <p>Загрузите файл Excel или JSON кнопкой «Загрузить файл». Времена сами не подставляются и не вычисляются.</p>
          <p>Подходит годовой файл приложения и таблица Казани: лист с номером года, строка заголовков во второй строке, город в первом столбце.</p>
        </section>
      ) : (
        <>
        <YearEditor
          year={year}
          zone={project.timezone}
          selected={selected}
          setSelected={setSelected}
          bulkField={bulkField}
          setBulkField={setBulkField}
          bulkTime={bulkTime}
          setBulkTime={setBulkTime}
          bulkError={bulkError}
          timeError={timeError}
          setTimeError={setTimeError}
          onTime={(date, field, value) => store.update((item) => updateTime(item, year.year, date, field, value))}
          onYear={(recipe) => store.update((item) => mapYear(item, year.year, recipe))}
          onText={(recipe) => store.update((item) => mapYear(item, year.year, recipe), true)}
          onDelete={() => store.update((item) => ({
            ...item,
            schedules: item.schedules.filter((entry) => entry.year !== year.year),
            activeYear: item.schedules.find((entry) => entry.year !== year.year)?.year ?? null,
          }))}
          onBulk={() => {
            const normalized = normalizeHm(bulkTime);
            if (!normalized || !isHm(normalized)) {
              setBulkError("Укажите время в виде ЧЧ:ММ. Минуты не сдвигаются сами.");
              return;
            }
            if (!selected.length) {
              setBulkError("Отметьте дни, которые нужно изменить.");
              return;
            }
            setBulkError("");
            store.update((item) => {
              let next = item;
              for (const date of selected) next = updateTime(next, year.year, date, bulkField, normalized);
              return next;
            });
          }}
        />
        <details className="panel">
          <summary>Добавить другой год</summary>
          <p className="hint">Пустой год не заполняет времена. Их нужно ввести или загрузить файлом.</p>
          {addYearForm}
        </details>
        </>
      )}
    </div>
  );
}

function addYear(store: ReturnType<typeof useStore>, schedules: YearSchedule[], raw: string) {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return;
  if (schedules.some((item) => item.year === year)) return;
  store.update((item) => {
    const blank = blankYear(year, item.source, item.revision || "1");
    return { ...item, schedules: [...item.schedules, blank].sort((a, b) => a.year - b.year), activeYear: year };
  });
}

function YearEditor({
  year, zone, selected, setSelected, bulkField, setBulkField, bulkTime, setBulkTime, bulkError, timeError, setTimeError, onTime, onYear, onText, onDelete, onBulk,
}: {
  year: YearSchedule;
  zone: string;
  selected: string[];
  setSelected: (value: string[]) => void;
  bulkField: TimeField;
  setBulkField: (value: TimeField) => void;
  bulkTime: string;
  setBulkTime: (value: string) => void;
  bulkError: string;
  timeError: string;
  setTimeError: (value: string) => void;
  onTime: (date: string, field: TimeField, value: string) => void;
  onYear: (recipe: (schedule: YearSchedule) => YearSchedule) => void;
  onText: (recipe: (schedule: YearSchedule) => YearSchedule) => void;
  onDelete: () => void;
  onBulk: () => void;
}) {
  const todayIso = todayInZone(zone);
  const initialDate = todayIso.startsWith(String(year.year)) ? todayIso : `${year.year}-01-01`;
  const [month, setMonth] = useState(Number(initialDate.slice(5, 7)));
  const [focus, setFocus] = useState(initialDate);
  const [armedDelete, setArmedDelete] = useState(false);
  useEffect(() => {
    setMonth(Number(initialDate.slice(5, 7)));
    setFocus(initialDate);
  }, [year.year, initialDate]);
  const dates = monthDates(year.year, month);
  const day = year.days[focus];
  const changed = countChanges(year);
  return (
    <>
      {year.excelNotice ? <p className="note">{year.excelNotice}</p> : null}
      <div className="month-bar">
        <button type="button" className="btn secondary" disabled={month === 1} onClick={() => setMonth((value) => value - 1)}>Назад</button>
        <h2 className="month-title">{monthTitle(year.year, month)}</h2>
        <button type="button" className="btn secondary" disabled={month === 12} onClick={() => setMonth((value) => value + 1)}>Дальше</button>
        <label className="inline">
          Перейти к дате
          <input type="date" aria-label="Перейти к дате" min={`${year.year}-01-01`} max={`${year.year}-12-31`} value={focus} onChange={(event) => {
            if (!event.target.value.startsWith(String(year.year))) return;
            setFocus(event.target.value);
            setMonth(Number(event.target.value.slice(5, 7)));
          }} />
        </label>
        <span className="hint">{changed ? `Изменено значений: ${changed}` : "Совпадает с загруженным файлом"}</span>
      </div>
      <div className="schedule-layout">
        <div className="stack">
          <MonthJump year={year.year} month={month} focus={focus} onPick={(date) => setFocus(date)} />
          <section className="panel day-editor" aria-label="День">
            <h2>{formatRuDate(focus)}, {WEEKDAYS[weekdayIndex(focus)]}</h2>
            {TIME_FIELDS.map((field) => (
              <TimeField
                key={field}
                label={FIELD_LABELS[field]}
                value={day?.[field] ?? ""}
                changed={isChanged(year, focus, field)}
                onCommit={(value) => onTime(focus, field, value)}
                onInvalid={setTimeError}
              />
            ))}
            <label className="check">
              <input type="checkbox" checked={selected.includes(focus)} onChange={(event) => toggle(setSelected, selected, focus, event.target.checked)} />
              Отметить этот день для групповой правки
            </label>
            {timeError ? <p className="alert" role="alert">{timeError}</p> : null}
          </section>
          <fieldset className="panel">
            <legend>Что означает колонка «Фаджр в мечети»</legend>
            <label className="check"><input type="radio" name="fajr-meaning" checked={year.fajrMeaning === "UNCONFIRMED"} onChange={() => onYear((item) => ({ ...item, fajrMeaning: "UNCONFIRMED" }))} /> Начало намаза не подтверждено</label>
            <label className="check"><input type="radio" name="fajr-meaning" checked={year.fajrMeaning === "PRAYER_START"} onChange={() => onYear((item) => ({ ...item, fajrMeaning: "PRAYER_START" }))} /> Это начало намаза</label>
            <p className="hint">Программа сама не меняет этот выбор. Пока начало не подтверждено, икамат Фаджра можно задать только точным временем.</p>
          </fieldset>
          <section className="panel">
            <h2>Групповая правка</h2>
            <p className="hint">Меняется только выбранная колонка у отмеченных дней. Время не сдвигается и не пересчитывается.</p>
            <label className="field">
              <span>Колонка</span>
              <select value={bulkField} aria-label="Колонка" onChange={(event) => setBulkField(event.target.value as TimeField)}>
                {TIME_FIELDS.map((field) => <option key={field} value={field}>{FIELD_LABELS[field]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Новое время</span>
              <input aria-label="Новое время" value={bulkTime} inputMode="numeric" placeholder="ЧЧ:ММ" onChange={(event) => setBulkTime(event.target.value)} />
            </label>
            <div className="actions">
              <button type="button" className="btn secondary" onClick={() => setSelected(dates)}>Отметить все дни месяца</button>
              <button type="button" className="btn secondary" onClick={() => setSelected([])}>Снять отметки</button>
              <button type="button" className="btn" onClick={onBulk}>Поставить выбранным дням</button>
            </div>
            {bulkError ? <p className="alert" role="alert">{bulkError}</p> : null}
          </section>
          <section className="panel">
            <div className="form-grid">
              <TextField label="Источник расписания" value={year.source} maxLength={200} onChange={(value) => onText((item) => ({ ...item, source: value }))} />
              <TextField label="Версия расписания" value={year.revision} maxLength={80} onChange={(value) => onText((item) => ({ ...item, revision: value }))} />
            </div>
            {armedDelete ? (
              <div className="actions">
                <button type="button" className="btn danger" onClick={onDelete}>Да, удалить {year.year} год</button>
                <button type="button" className="btn secondary" onClick={() => setArmedDelete(false)}>Оставить</button>
              </div>
            ) : (
              <button type="button" className="btn danger" onClick={() => setArmedDelete(true)}>Удалить этот год</button>
            )}
          </section>
        </div>
        <div className="sheet-wrap">
          <table className="sheet">
            <caption className="sr-only">Расписание на {monthTitle(year.year, month)}. Стрелки переходят между клетками.</caption>
            <thead>
              <tr>
                <th scope="col">Дата</th>
                {TIME_FIELDS.map((field) => <th key={field} scope="col">{FIELD_LABELS[field]}</th>)}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date} className={date === focus ? "picked" : weekdayIndex(date) === 4 ? "friday" : undefined}>
                  <th scope="row">
                    <label className="row-pick">
                      <input type="checkbox" checked={selected.includes(date)} aria-label={`Отметить ${formatRuDate(date)}`} onChange={(event) => toggle(setSelected, selected, date, event.target.checked)} />
                      <button type="button" onClick={() => setFocus(date)}>{date.slice(8)} {WEEKDAYS[weekdayIndex(date)]}</button>
                    </label>
                  </th>
                  {TIME_FIELDS.map((field, index) => (
                    <td key={field} className={isChanged(year, date, field) ? "changed" : undefined}>
                      <TimeField
                        label={`${formatRuDate(date)}, ${FIELD_LABELS[field]}`}
                        value={year.days[date]?.[field] ?? ""}
                        cell={`${date}:${field}`}
                        changed={isChanged(year, date, field)}
                        onCommit={(value) => onTime(date, field, value)}
                        onInvalid={setTimeError}
                        onKeyDown={(event) => moveCell(event, dates, date, index)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function MonthJump({ year, month, focus, onPick }: { year: number; month: number; focus: string; onPick: (date: string) => void }) {
  const dates = monthDates(year, month);
  const blanks = weekdayIndex(dates[0]);
  return (
    <div className="panel month-cal" aria-label="Дни месяца">
      {WEEKDAYS.map((name) => <span key={name} className="dow">{name}</span>)}
      {Array.from({ length: blanks }, (_, index) => <span key={`b${index}`} />)}
      {dates.map((date) => (
        <button key={date} type="button" aria-label={formatRuDate(date)} aria-pressed={date === focus} onClick={() => onPick(date)}>
          {Number(date.slice(8))}
        </button>
      ))}
    </div>
  );
}

function TimeField({
  label, value, changed, cell, onCommit, onInvalid, onKeyDown,
}: {
  label: string;
  value: string;
  changed: boolean;
  cell?: string;
  onCommit: (value: string) => void;
  onInvalid: (message: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="time-label">
      <span>{cell ? "" : label}</span>
      <input
        aria-label={label}
        data-cell={cell}
        inputMode="numeric"
        spellCheck={false}
        className={changed ? "changed" : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          const normalized = normalizeHm(draft);
          if (normalized === null) {
            setDraft(value);
            onInvalid("Нужно время в виде ЧЧ:ММ, от 00:00 до 23:59.");
            return;
          }
          onInvalid("");
          if (normalized !== value) onCommit(normalized);
        }}
      />
    </label>
  );
}

function moveCell(event: KeyboardEvent<HTMLInputElement>, dates: string[], date: string, index: number) {
  const key = event.key;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(key)) return;
  let row = dates.indexOf(date);
  let col = index;
  if (key === "ArrowUp") row -= 1;
  if (key === "ArrowDown" || key === "Enter") row += 1;
  if (key === "ArrowLeft") col -= 1;
  if (key === "ArrowRight") col += 1;
  if (col < 0) { col = TIME_FIELDS.length - 1; row -= 1; }
  if (col >= TIME_FIELDS.length) { col = 0; row += 1; }
  if (row < 0 || row >= dates.length) return;
  event.preventDefault();
  const target = document.querySelector<HTMLInputElement>(`[data-cell="${dates[row]}:${TIME_FIELDS[col]}"]`);
  target?.focus();
  target?.select();
}

function toggle(setSelected: (value: string[]) => void, selected: string[], date: string, on: boolean) {
  setSelected(on ? [...selected, date] : selected.filter((item) => item !== date));
}

function isChanged(year: YearSchedule, date: string, field: TimeField): boolean {
  if (!year.baseline) return false;
  return (year.days[date]?.[field] ?? "") !== (year.baseline[date]?.[field] ?? "");
}

function countChanges(year: YearSchedule): number {
  if (!year.baseline) return 0;
  let count = 0;
  for (const date of Object.keys(year.days)) {
    for (const field of TIME_FIELDS) if (isChanged(year, date, field)) count += 1;
  }
  return count;
}
