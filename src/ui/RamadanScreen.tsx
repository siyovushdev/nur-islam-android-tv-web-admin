import { useState } from "react";
import { checkRamadan, ramadanView } from "../domain/calendar-io";
import { daysBetween, formatRuDate } from "../domain/dates";
import { FormatError } from "../domain/format-error";
import type { RamadanPeriod } from "../domain/model";
import { todayInZone } from "../domain/zones";
import { useStore } from "./store";

export function RamadanScreen() {
  const store = useStore();
  const project = store.project;
  const [firstFast, setFirstFast] = useState("");
  const [eid, setEid] = useState("");
  const [error, setError] = useState("");
  const [watch, setWatch] = useState("");
  if (!project) return null;
  const today = todayInZone(project.timezone);
  const viewDate = watch || today;
  const view = ramadanView(viewDate, project.ramadan);

  function add() {
    const period: RamadanPeriod = { localId: crypto.randomUUID(), firstFast, eid };
    try {
      checkRamadan([...project!.ramadan, period]);
    } catch (caught) {
      setError(caught instanceof FormatError ? caught.message : "Эти даты поста не подходят.");
      return;
    }
    setError("");
    store.update((item) => ({ ...item, ramadan: [...item.ramadan, period] }));
    setFirstFast("");
    setEid("");
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Сейчас</h2>
        <p className="lead">{view.title}</p>
        <p>{view.detail}</p>
        <p className="hint">Дата считается в часовом поясе мечети. Сегодня там {formatRuDate(today)}. Даты поста не вычисляются по луне: их вносят из документа мечети.</p>
        <label className="inline">
          Показать на дату
          <input type="date" aria-label="Показать на дату" value={viewDate} onChange={(event) => setWatch(event.target.value)} />
        </label>
      </section>
      <section className="panel">
        <h2>Новый период</h2>
        <div className="form-grid">
          <label className="field">
            <span>Первый день поста</span>
            <input type="date" aria-label="Первый день поста" value={firstFast} onChange={(event) => setFirstFast(event.target.value)} />
          </label>
          <label className="field">
            <span>Ураза-байрам</span>
            <input type="date" aria-label="Ураза-байрам" value={eid} onChange={(event) => setEid(event.target.value)} />
            <small>Можно оставить пустым, если дата ещё не объявлена. Тогда известны первые 29 дней.</small>
          </label>
        </div>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <button type="button" className="btn" onClick={add}>Добавить Рамадан</button>
      </section>
      {project.ramadan.length === 0 ? <p className="panel">Периоды поста ещё не добавлены.</p> : project.ramadan.map((period) => {
        const span = period.eid ? daysBetween(period.firstFast, period.eid) : null;
        return (
          <article key={period.localId} className="panel">
            <h2>Пост с {formatRuDate(period.firstFast)}</h2>
            <p>{period.eid ? `Ураза-байрам ${formatRuDate(period.eid)}. Дней поста: ${span}.` : "Дата Ураза-байрама не указана."}</p>
            <button type="button" className="btn danger" onClick={() => store.update((item) => ({ ...item, ramadan: item.ramadan.filter((entry) => entry.localId !== period.localId) }))}>
              Удалить период
            </button>
          </article>
        );
      })}
    </div>
  );
}
