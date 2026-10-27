import { useState } from "react";
import { formatRuDate } from "../domain/dates";
import { iqamahIssues, lookupFor, modeLabel, previewDate, ruleIssues } from "../domain/iqamah";
import { PRAYER_LABELS, PRAYERS, type IqamahMode, type IqamahPrayer, type IqamahRule } from "../domain/model";
import { todayInZone } from "../domain/zones";
import { useStore } from "./store";

type Draft = {
  localId: string;
  prayer: IqamahPrayer;
  from: string;
  until: string;
  exception: boolean;
  mode: IqamahMode;
  time: string;
  minutes: string;
  start: string;
  isNew: boolean;
};

export function IqamahScreen() {
  const store = useStore();
  const project = store.project;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [checkText, setCheckText] = useState("");
  const [preview, setPreview] = useState("");
  if (!project) return null;
  const yearNumber = project.activeYear ?? project.schedules[0]?.year ?? null;
  const lookup = lookupFor(project, yearNumber);
  const shownDate = preview || (yearNumber ? preferredDate(yearNumber, project.timezone) : "");
  const lines = shownDate ? previewDate(shownDate, project, lookup) : [];
  const rules = [...project.iqamah].sort((a, b) => a.from.localeCompare(b.from) || a.prayer.localeCompare(b.prayer));

  function openNew(prayer: IqamahPrayer) {
    setFormError("");
    setDraft({
      localId: crypto.randomUUID(),
      prayer,
      from: project?.calendarFrom || (yearNumber ? `${yearNumber}-01-01` : ""),
      until: "",
      exception: false,
      mode: "FIXED",
      time: "",
      minutes: "10",
      start: "",
      isNew: true,
    });
  }

  function save() {
    if (!draft || !project) return;
    const rule = toRule(draft);
    const issues = ruleIssues(rule);
    if (issues.length) {
      setFormError(issues.join(" "));
      return;
    }
    setFormError("");
    store.update((item) => ({
      ...item,
      iqamah: draft.isNew ? [...item.iqamah, rule] : item.iqamah.map((entry) => (entry.localId === rule.localId ? rule : entry)),
    }));
    setDraft(null);
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Какое время получится</h2>
        <label className="inline">
          Показать на дату
          <input type="date" aria-label="Показать на дату" value={shownDate} onChange={(event) => setPreview(event.target.value)} />
        </label>
        {lines.length === 0 ? <p>Сначала выберите дату.</p> : (
          <ul className="plain-list">
            {lines.map((line) => (
              <li key={line.prayer}>
                <strong>{line.line}</strong>
                {line.problem ? <span className="alert"> {line.problem}</span> : null}
                {line.warning ? <span className="hint"> {line.warning}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="hint">Введённое время не исправляется само. Если икамат пересекается со следующим намазом, скачивание будет остановлено.</p>
        <div className="actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              if (!yearNumber) {
                setCheckText("Сначала загрузите расписание намазов.");
                return;
              }
              const from = project.calendarFrom || `${yearNumber}-01-01`;
              const until = project.calendarUntil || `${yearNumber}-12-31`;
              const issues = iqamahIssues(project, lookup, from, until);
              setCheckText(issues[0] ?? "Пересечений не найдено.");
            }}
          >
            Проверить пересечения
          </button>
        </div>
        {checkText ? <p role="status">{checkText}</p> : null}
      </section>
      <section className="panel">
        <label className="field">
          <span>Сколько минут экран остаётся приглушённым</span>
          <input
            type="number"
            min={0}
            max={60}
            aria-label="Сколько минут экран остаётся приглушённым"
            value={project.dimMinutes}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60) return;
              store.update((item) => ({ ...item, dimMinutes: minutes }));
            }}
          />
          <small>От 0 до 60. Ноль означает короткую паузу около минуты, как в приложении на телевизоре.</small>
        </label>
      </section>
      {PRAYERS.map((prayer) => (
        <section key={prayer} className="panel" aria-label={PRAYER_LABELS[prayer]}>
          <h2>{PRAYER_LABELS[prayer]}</h2>
          {rules.filter((rule) => rule.prayer === prayer).length === 0 ? <p className="hint">Правил нет, икамат не задан.</p> : (
            <ul className="plain-list">
              {rules.filter((rule) => rule.prayer === prayer).map((rule) => (
                <li key={rule.localId} className="rule-row">
                  <span>{describe(rule)}</span>
                  <button type="button" className="btn secondary" onClick={() => { setFormError(""); setDraft(fromRule(rule)); }}>Изменить</button>
                  <button type="button" className="btn danger" onClick={() => store.update((item) => ({ ...item, iqamah: item.iqamah.filter((entry) => entry.localId !== rule.localId) }))}>Удалить</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn secondary" onClick={() => openNew(prayer)}>Добавить правило</button>
          {draft?.prayer === prayer ? (
            <div className="form-grid">
              <label className="field">
                <span>Как считать</span>
                <select aria-label="Как считать" value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as IqamahMode })}>
                  <option value="OFF">Не показывать</option>
                  <option value="FIXED">Точное время</option>
                  <option value="OFFSET">Через несколько минут после начала намаза</option>
                </select>
              </label>
              <label className="field">
                <span>С какой даты</span>
                <input type="date" aria-label="С какой даты" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
              </label>
              {draft.exception ? null : (
                <label className="field">
                  <span>По какую дату</span>
                  <input type="date" aria-label="По какую дату" value={draft.until} onChange={(event) => setDraft({ ...draft, until: event.target.value })} />
                  <small>Пусто — правило действует, пока не начнётся следующее.</small>
                </label>
              )}
              <label className="check">
                <input type="checkbox" checked={draft.exception} onChange={(event) => setDraft({ ...draft, exception: event.target.checked, until: event.target.checked ? "" : draft.until })} />
                Исключение на один день
              </label>
              {draft.mode === "FIXED" ? (
                <label className="field">
                  <span>Время икамата</span>
                  <input aria-label="Время икамата" value={draft.time} inputMode="numeric" placeholder="ЧЧ:ММ" onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
                </label>
              ) : null}
              {draft.mode === "OFFSET" ? (
                <label className="field">
                  <span>Минут после начала</span>
                  <input aria-label="Минут после начала" type="number" min={0} max={720} value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} />
                </label>
              ) : null}
              {draft.prayer === "JUMUAH" && draft.mode !== "OFF" ? (
                <label className="field">
                  <span>Начало джума</span>
                  <input aria-label="Начало джума" value={draft.start} inputMode="numeric" placeholder="ЧЧ:ММ" onChange={(event) => setDraft({ ...draft, start: event.target.value })} />
                  <small>Для джума начало не берётся из зухра.</small>
                </label>
              ) : null}
              {formError ? <p className="alert" role="alert">{formError}</p> : null}
              <div className="actions">
                <button type="button" className="btn" onClick={save}>Сохранить правило</button>
                <button type="button" className="btn secondary" onClick={() => setDraft(null)}>Отмена</button>
              </div>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function preferredDate(year: number, zone: string): string {
  const today = todayInZone(zone);
  return today.startsWith(String(year)) ? today : `${year}-01-01`;
}

function describe(rule: IqamahRule): string {
  const when = rule.exception ? `исключение ${formatRuDate(rule.from)}` : `с ${formatRuDate(rule.from)}${rule.until ? ` по ${formatRuDate(rule.until)}` : ""}`;
  const how = rule.mode === "FIXED" ? rule.time : rule.mode === "OFFSET" ? `${rule.minutes} мин` : modeLabel(rule.mode);
  return `${how}, ${when}`;
}

function fromRule(rule: IqamahRule): Draft {
  return { ...rule, until: rule.until ?? "", minutes: String(rule.minutes), isNew: false };
}

function toRule(draft: Draft): IqamahRule {
  const mode = draft.mode;
  return {
    localId: draft.localId,
    prayer: draft.prayer,
    from: draft.from,
    until: draft.exception || !draft.until ? null : draft.until,
    exception: draft.exception,
    mode,
    time: mode === "FIXED" ? draft.time.trim() : "",
    minutes: mode === "OFFSET" ? Number(draft.minutes) : 0,
    start: draft.prayer === "JUMUAH" && mode !== "OFF" ? draft.start.trim() : "",
  };
}
