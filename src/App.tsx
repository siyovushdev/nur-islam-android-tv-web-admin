import { EventsScreen } from "./ui/EventsScreen";
import { ExportScreen } from "./ui/ExportScreen";
import { ImportBar } from "./ui/ImportBar";
import { IqamahScreen } from "./ui/IqamahScreen";
import { MosqueScreen } from "./ui/MosqueScreen";
import { RamadanScreen } from "./ui/RamadanScreen";
import { ScheduleScreen } from "./ui/ScheduleScreen";
import { StoreProvider, projectTitle, statusLabel, useStore, type ScreenName } from "./ui/store";
import { FileButton } from "./ui/widgets";

const NAV: { id: ScreenName; label: string }[] = [
  { id: "mosque", label: "Мечеть" },
  { id: "schedule", label: "Расписание" },
  { id: "iqamah", label: "Икамат" },
  { id: "ramadan", label: "Рамадан" },
  { id: "events", label: "Праздники и объявления" },
  { id: "export", label: "Экспорт" },
];

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const store = useStore();
  if (!store.ready) return <p className="boot">Открываем сохранённые мечети…</p>;
  if (!store.project) return <Welcome />;
  const title = NAV.find((item) => item.id === store.screen)?.label ?? "Мечеть";
  return (
    <div className="app">
      <a className="skip" href="#content">К содержимому</a>
      <aside className="sidebar">
        <div className="brand">
          <strong>Нур Ислам</strong>
          <p>Подготовка расписания</p>
        </div>
        <nav aria-label="Разделы">
          {NAV.map((item) => (
            <button key={item.id} type="button" aria-current={store.screen === item.id ? "page" : undefined} onClick={() => store.go(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <p className="side-foot">Данные только в этом браузере. На сервер ничего не отправляется.</p>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <label className="inline grow">
            Открытая мечеть
            <select aria-label="Открытая мечеть" value={store.project.id} onChange={(event) => store.openProject(event.target.value)}>
              {store.projects.map((item) => <option key={item.id} value={item.id}>{projectTitle(item)}</option>)}
            </select>
          </label>
          <button type="button" className="btn secondary" onClick={store.createBlank}>Новая мечеть</button>
          <button type="button" className="btn secondary" disabled={!store.canUndo} onClick={store.undo}>Отменить</button>
          <p className="status" role="status">{statusLabel(store.status, store.project)}</p>
          <FileButton label="Загрузить файл" onFile={(file) => void store.takeFile(file)} />
        </header>
        <ImportBar />
        <main id="content">
          <h1>{title}</h1>
          {store.screen === "mosque" ? <MosqueScreen /> : null}
          {store.screen === "schedule" ? <ScheduleScreen /> : null}
          {store.screen === "iqamah" ? <IqamahScreen /> : null}
          {store.screen === "ramadan" ? <RamadanScreen /> : null}
          {store.screen === "events" ? <EventsScreen /> : null}
          {store.screen === "export" ? <ExportScreen /> : null}
        </main>
      </div>
    </div>
  );
}

function Welcome() {
  const store = useStore();
  return (
    <main className="welcome">
      <div className="welcome-card">
        <p className="eyebrow">Нур Ислам</p>
        <h1>Подготовка расписания</h1>
        <p>Соберите намазы, икамат, Рамадан и объявления для экрана в мечети. Всё остаётся в этом браузере, учётная запись не нужна.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={store.createBlank}>Новая мечеть</button>
          <FileButton label="Загрузить файл" onFile={(file) => void store.takeFile(file)} />
          <button type="button" className="btn secondary" onClick={store.openDemo}>Открыть учебный пример</button>
        </div>
        <ImportBar />
        <section>
          <h2>Сохранённые мечети</h2>
          {store.projects.length === 0 ? <p>Пока нет сохранённых мечетей.</p> : (
            <ul className="plain-list">
              {store.projects.map((project) => (
                <li key={project.id} className="rule-row">
                  <button type="button" className="btn secondary" onClick={() => store.openProject(project.id)}>Открыть {projectTitle(project)}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
