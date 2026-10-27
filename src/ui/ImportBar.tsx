import { useStore } from "./store";

export function ImportBar() {
  const store = useStore();
  const pending = store.pending;
  if (!pending) return null;
  return (
    <section className="panel import-panel" aria-label="Загрузка файла">
      {pending.kind === "error" ? (
        <>
          <p className="alert" role="alert">{pending.message}</p>
          <button type="button" className="btn secondary" onClick={store.dismissPending}>Понятно</button>
        </>
      ) : (
        <>
          <h2>Файл «{pending.fileName}»</h2>
          {pending.kind === "backup" ? <p>Это сохранённая копия мечети. Текущая карточка не изменится, пока вы сами не выберете замену.</p> : <p>{pending.note}</p>}
          <div className="actions">
            {pending.kind === "schedule" ? (
              <>
                <button type="button" className="btn" onClick={() => store.acceptSchedule("align")}>Загрузить в эту мечеть</button>
                {pending.canKeepTimes ? (
                  <button type="button" className="btn secondary" onClick={() => store.acceptSchedule("times")}>Оставить карточку и взять только времена</button>
                ) : null}
              </>
            ) : null}
            {pending.kind === "calendar" ? (
              <>
                <button type="button" className="btn" onClick={() => store.acceptCalendar(true)}>Загрузить в эту мечеть</button>
                {pending.canKeepPlace ? (
                  <button type="button" className="btn secondary" onClick={() => store.acceptCalendar(false)}>Оставить карточку и заменить календарь</button>
                ) : null}
              </>
            ) : null}
            {pending.kind === "backup" ? (
              <>
                {store.project ? (
                  <button type="button" className="btn" onClick={() => store.acceptBackup("replace")}>Заменить открытую мечеть</button>
                ) : null}
                <button type="button" className="btn secondary" onClick={() => store.acceptBackup("separate")}>Открыть как отдельную мечеть</button>
              </>
            ) : null}
            <button type="button" className="btn secondary" onClick={store.dismissPending}>Отмена</button>
          </div>
        </>
      )}
    </section>
  );
}
