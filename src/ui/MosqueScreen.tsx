import { isPublicId } from "../domain/ids";
import { exportBackup, renameCity, renameMosque, syncPeriod } from "../domain/project";
import { RUSSIAN_ZONES, zoneLabel } from "../domain/zones";
import { downloadText } from "./download";
import { useStore, projectTitle } from "./store";
import { ConfirmButton, TextField, SelectField } from "./widgets";

export function MosqueScreen() {
  const store = useStore();
  const project = store.project;
  if (!project) return null;
  return (
    <div className="stack">
      {project.demo ? (
        <p className="banner">Это учебный пример с вымышленными временами. Для настоящей мечети нажмите «Новая мечеть» и загрузите её файл.</p>
      ) : null}
      <section className="panel">
        <h2>Карточка</h2>
        <div className="form-grid">
          <TextField label="Название мечети" value={project.mosqueName} maxLength={60} onChange={(value) => store.update((item) => renameMosque(item, value), true)} />
          <TextField label="Город" value={project.city} maxLength={80} onChange={(value) => store.update((item) => renameCity(item, value), true)} />
          <SelectField label="Часовой пояс" value={project.timezone} hint="Список поясов России. Пояс не выбирается заранее." onChange={(value) => store.update((item) => ({ ...item, timezone: value }))}>
            <option value="">Выберите пояс</option>
            {RUSSIAN_ZONES.map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.label}</option>
            ))}
          </SelectField>
          <TextField
            label="Откуда взяты данные календаря"
            value={project.source}
            maxLength={200}
            hint="Эта подпись попадёт в файл икамата и объявлений. Подпись годового расписания задаётся в разделе «Расписание»."
            onChange={(value) => store.update((item) => ({ ...item, source: value, demo: item.demo }), true)}
          />
          <TextField label="Версия данных" value={project.revision} maxLength={80} onChange={(value) => store.update((item) => ({ ...item, revision: value }), true)} />
        </div>
        {project.timezone ? <p className="hint">Сейчас выбран пояс: {zoneLabel(project.timezone)}.</p> : null}
      </section>
      <section className="panel">
        <h2>Период календаря</h2>
        <p className="hint">Икамат, Рамадан и объявления действуют в этих датах. Если период не закреплён вручную, он подстраивается под загруженные годы и записи.</p>
        <div className="form-grid">
          <TextField label="Календарь действует с" type="date" value={project.calendarFrom} onChange={(value) => store.update((item) => ({ ...item, periodManual: true, calendarFrom: value }))} />
          <TextField label="Календарь действует по" type="date" value={project.calendarUntil} onChange={(value) => store.update((item) => ({ ...item, periodManual: true, calendarUntil: value }))} />
        </div>
        <button type="button" className="btn secondary" onClick={() => store.update((item) => syncPeriod({ ...item, periodManual: false, calendarFrom: "", calendarUntil: "" }))}>
          Подогнать период по данным
        </button>
      </section>
      <section className="panel">
        <h2>Годы расписания</h2>
        {project.schedules.length === 0 ? <p>Годы появятся после загрузки файла. Пустые времена сами не подставляются.</p> : (
          <ul className="plain-list">
            {project.schedules.map((year) => (
              <li key={year.year}>
                <button type="button" className="btn secondary" onClick={() => { store.update((item) => ({ ...item, activeYear: year.year })); store.go("schedule"); }}>
                  Открыть {year.year}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="panel">
        <summary>Дополнительные поля</summary>
        <p className="hint">Служебные имена нужны, чтобы файлы для экрана совпали с одной и той же мечетью. Обычно их менять не нужно.</p>
        <div className="form-grid">
          <TextField
            label="Служебное имя мечети"
            value={project.mosqueId}
            maxLength={80}
            onChange={(value) => store.update((item) => ({ ...item, mosqueId: value.trim(), mosqueIdCustom: true }), true)}
          />
          <TextField
            label="Служебное имя города"
            value={project.cityId}
            maxLength={80}
            onChange={(value) => store.update((item) => ({ ...item, cityId: value.trim(), cityIdCustom: true }), true)}
          />
        </div>
        {!isPublicId(project.mosqueId) || !isPublicId(project.cityId) ? (
          <p className="alert" role="alert">Служебное имя: латиница, цифры и дефис, до 80 знаков, с буквы или цифры.</p>
        ) : null}
      </details>
      <section className="panel actions">
        <button type="button" className="btn secondary" onClick={() => downloadText(`${projectTitle(project)}-копия.json`, exportBackup(project), "application/json")}>
          Скачать копию проекта
        </button>
        <ConfirmButton label="Удалить эту мечеть" confirm="Да, удалить мечеть" onConfirm={() => store.deleteProjectById(project.id)} />
      </section>
    </div>
  );
}
