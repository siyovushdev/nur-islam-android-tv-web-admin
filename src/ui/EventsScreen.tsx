import { useState } from "react";
import { eventPreview, splitOvernight } from "../domain/calendar-io";
import { isHm, shiftYear } from "../domain/dates";
import { slugId } from "../domain/ids";
import type { MosqueEvent } from "../domain/model";
import { useStore } from "./store";

export function EventsScreen() {
  const store = useStore();
  const project = store.project;
  const [title, setTitle] = useState("");
  const [titleTatar, setTitleTatar] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [copyYear, setCopyYear] = useState("2027");
  if (!project) return null;
  const overnight = Boolean(start && end && end <= start);
  const groups = groupEvents(project.events);

  function add() {
    if (!title.trim()) {
      setError("Напишите заголовок.");
      return;
    }
    if (!from) {
      setError("Укажите дату начала.");
      return;
    }
    if (until && until < from) {
      setError("Дата окончания раньше даты начала.");
      return;
    }
    if ((start && !isHm(start)) || (end && !isHm(end))) {
      setError("Время укажите в виде ЧЧ:ММ или оставьте пустым.");
      return;
    }
    const event: MosqueEvent = {
      localId: crypto.randomUUID(),
      id: nextId(project!.events, title),
      title: title.trim(),
      titleTatar: titleTatar.trim(),
      from,
      until,
      start,
      end,
    };
    const parts = splitOvernight(event);
    setError("");
    store.update((item) => ({ ...item, events: [...item.events, ...parts] }));
    setTitle("");
    setTitleTatar("");
    setFrom("");
    setUntil("");
    setStart("");
    setEnd("");
  }

  function copyGroup(group: MosqueEvent[], yearText: string) {
    const year = Number(yearText);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      setError("Укажите год от 2000 до 2200.");
      return;
    }
    const groupId = crypto.randomUUID();
    const copies: MosqueEvent[] = [];
    for (const event of group) {
      const nextFrom = shiftYear(event.from, year);
      const nextUntil = event.until ? shiftYear(event.until, year) : "";
      if (!nextFrom || (event.until && !nextUntil)) {
        setError("29 февраля нет в выбранном году. Запись не скопирована.");
        return;
      }
      copies.push({ ...event, localId: crypto.randomUUID(), id: nextId([...project!.events, ...copies], event.title), groupId: event.groupId ? groupId : undefined, from: nextFrom, until: nextUntil ?? "" });
    }
    setError("");
    store.update((item) => ({ ...item, events: [...item.events, ...copies] }));
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Новая запись</h2>
        <div className="form-grid">
          <label className="field"><span>Заголовок</span><input aria-label="Заголовок" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field"><span>Заголовок на татарском</span><input aria-label="Заголовок на татарском" value={titleTatar} maxLength={120} onChange={(event) => setTitleTatar(event.target.value)} /></label>
          <label className="field"><span>Дата начала</span><input type="date" aria-label="Дата начала" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="field"><span>Дата окончания</span><input type="date" aria-label="Дата окончания" value={until} onChange={(event) => setUntil(event.target.value)} /></label>
          <label className="field"><span>Время начала</span><input aria-label="Время начала" value={start} inputMode="numeric" placeholder="ЧЧ:ММ" onChange={(event) => setStart(event.target.value)} /></label>
          <label className="field"><span>Время окончания</span><input aria-label="Время окончания" value={end} inputMode="numeric" placeholder="ЧЧ:ММ" onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
        {overnight ? <p className="note">Запись через полночь будет разделена на вечер и утро. Так её принимает экран.</p> : null}
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <button type="button" className="btn" onClick={add}>Добавить запись</button>
      </section>
      {groups.length === 0 ? <p className="panel">Праздников и объявлений пока нет. Примеры, которые можно внести: Ураза-байрам, Курбан-байрам, начало Рамадана, пятничное объявление.</p> : groups.map((group) => (
        <article key={group[0].groupId || group[0].localId} className="panel">
          <h2>{group[0].title}</h2>
          {group.map((event) => <p key={event.localId}>{eventPreview(event)}{group.length > 1 ? " Часть ночной записи." : ""}</p>)}
          <div className="actions">
            <label className="inline">
              Год копии
              <input aria-label="Год копии" value={copyYear} inputMode="numeric" onChange={(event) => setCopyYear(event.target.value)} />
            </label>
            <button type="button" className="btn secondary" onClick={() => copyGroup(group, copyYear)}>Скопировать на другой год</button>
            <button type="button" className="btn danger" onClick={() => {
              const ids = new Set(group.map((event) => event.localId));
              store.update((item) => ({ ...item, events: item.events.filter((event) => !ids.has(event.localId)) }));
            }}>Удалить запись</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function groupEvents(events: MosqueEvent[]): MosqueEvent[][] {
  const order: string[] = [];
  const map = new Map<string, MosqueEvent[]>();
  for (const event of events) {
    const key = event.groupId || event.localId;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)?.push(event);
  }
  return order.map((key) => map.get(key) ?? []);
}

function nextId(events: MosqueEvent[], title: string): string {
  const base = slugId(title, "sobytie");
  const used = new Set(events.map((event) => event.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`.slice(0, 80))) index += 1;
  return `${base}-${index}`.slice(0, 80);
}
