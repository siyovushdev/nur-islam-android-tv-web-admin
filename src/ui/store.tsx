import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { applyCalendar } from "../domain/calendar-io";
import { demoProject } from "../domain/demo";
import { isTestSource } from "../domain/ids";
import { detectFile, scheduleChoice, commitSchedule } from "../domain/import-flow";
import type { ParsedCalendar } from "../domain/calendar-io";
import type { ParsedSchedule } from "../domain/schedule-io";
import type { Project } from "../domain/model";
import { createProject, projectHasContent, syncPeriod, touchStamp } from "../domain/project";
import { loadProjects, readActiveId, removeProject, saveProject, writeActiveId } from "../storage/db";

export type ScreenName = "mosque" | "schedule" | "iqamah" | "ramadan" | "events" | "export";

export type PendingImport =
  | { kind: "schedule"; fileName: string; parsed: ParsedSchedule; excelNotice?: string; note: string; canKeepTimes: boolean }
  | { kind: "calendar"; fileName: string; parsed: ParsedCalendar; note: string; canKeepPlace: boolean }
  | { kind: "backup"; fileName: string; project: Project }
  | { kind: "error"; message: string };

type Status = "idle" | "saving" | "saved" | "error";

type Store = {
  ready: boolean;
  projects: Project[];
  project: Project | null;
  screen: ScreenName;
  status: Status;
  canUndo: boolean;
  pending: PendingImport | null;
  go: (screen: ScreenName) => void;
  update: (recipe: (project: Project) => Project, coalesce?: boolean) => void;
  undo: () => void;
  createBlank: () => void;
  openDemo: () => void;
  openProject: (id: string) => void;
  deleteProjectById: (id: string) => void;
  takeFile: (file: File) => Promise<void>;
  acceptSchedule: (mode: "align" | "times") => void;
  acceptCalendar: (alignPlace: boolean) => void;
  acceptBackup: (mode: "replace" | "separate") => void;
  dismissPending: () => void;
};

const StoreContext = createContext<Store | null>(null);

const SCREENS: ScreenName[] = ["mosque", "schedule", "iqamah", "ramadan", "events", "export"];

function readScreen(): ScreenName {
  const name = location.hash.replace("#", "");
  return SCREENS.includes(name as ScreenName) ? (name as ScreenName) : "mosque";
}

function calendarChoice(project: Project | null, parsed: ParsedCalendar): { note: string; canKeepPlace: boolean } {
  const place = `${parsed.name}, ${parsed.city}`;
  if (!project || !project.timezone || !project.city.trim() || !project.mosqueName.trim()) {
    return { canKeepPlace: false, note: `В файле: ${place}. Эти сведения будут записаны в карточку. Годовое расписание не изменится.` };
  }
  if (project.timezone !== parsed.timezone) {
    return { canKeepPlace: false, note: `Пояс в файле другой (${place}). Подставьте сведения из файла или отмените загрузку.` };
  }
  const same = project.mosqueId === parsed.mosqueId && project.cityId === parsed.cityId;
  if (same) return { canKeepPlace: true, note: `Файл подходит к этой мечети. Икамат, Рамадан и объявления будут заменены. Годовое расписание останется.` };
  return {
    canKeepPlace: true,
    note: `В файле другая мечеть: ${place}. Можно подставить её или оставить карточку и заменить только икамат, Рамадан и объявления.`,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [screen, setScreen] = useState<ScreenName>(readScreen);
  const [status, setStatus] = useState<Status>("idle");
  const [history, setHistory] = useState<Project[]>([]);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const projectRef = useRef<Project | null>(null);
  const projectsRef = useRef<Project[]>([]);
  const dirty = useRef(false);
  const typing = useRef(false);
  const typingTimer = useRef(0);

  projectRef.current = project;
  projectsRef.current = projects;

  useEffect(() => {
    let cancel = false;
    loadProjects()
      .then((list) => {
        if (cancel) return;
        const sorted = [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        setProjects(sorted);
        const active = sorted.find((item) => item.id === readActiveId()) ?? null;
        projectRef.current = active;
        setProject(active);
        setStatus(active ? "saved" : "idle");
        setReady(true);
      })
      .catch(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const onHash = () => setScreen(readScreen());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!ready || !project || !dirty.current) return;
    const snapshot = project;
    const timer = window.setTimeout(() => {
      saveProject(snapshot)
        .then(() => {
          writeActiveId(snapshot.id);
          setProjects((list) => [snapshot, ...list.filter((item) => item.id !== snapshot.id)]);
          if (projectRef.current?.id === snapshot.id && projectRef.current.updatedAt === snapshot.updatedAt) {
            dirty.current = false;
            setStatus("saved");
          }
        })
        .catch(() => setStatus("error"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [project, ready]);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (status === "saving" || dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [status]);

  function go(next: ScreenName) {
    if (location.hash !== `#${next}`) location.hash = next;
    setScreen(next);
  }

  function remember(next: Project) {
    setProjects((list) => [next, ...list.filter((item) => item.id !== next.id)]);
  }

  function adopt(next: Project) {
    const stamped = touchStamp(syncPeriod(next));
    projectRef.current = stamped;
    dirty.current = true;
    setStatus("saving");
    setHistory([]);
    setProject(stamped);
    remember(stamped);
    writeActiveId(stamped.id);
  }

  function update(recipe: (current: Project) => Project, coalesce = false) {
    const current = projectRef.current;
    if (!current) return;
    if (!coalesce || !typing.current) setHistory((items) => [...items, structuredClone(current)].slice(-30));
    typing.current = coalesce;
    window.clearTimeout(typingTimer.current);
    if (coalesce) typingTimer.current = window.setTimeout(() => { typing.current = false; }, 800);
    const next = touchStamp(syncPeriod(recipe(current)));
    projectRef.current = next;
    dirty.current = true;
    setStatus("saving");
    setProject(next);
    remember(next);
  }

  function undo() {
    setHistory((items) => {
      const previous = items[items.length - 1];
      if (!previous) return items;
      projectRef.current = previous;
      dirty.current = true;
      setStatus("saving");
      setProject(previous);
      remember(previous);
      return items.slice(0, -1);
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function flushCurrent() {
    const current = projectRef.current;
    if (!current || !dirty.current) return;
    dirty.current = false;
    void saveProject(current).then(() => {
      writeActiveId(current.id);
      setProjects((list) => [current, ...list.filter((item) => item.id !== current.id)]);
    });
  }

  function createBlank() {
    flushCurrent();
    adopt(createProject());
    go("mosque");
  }

  function openDemo() {
    flushCurrent();
    adopt(demoProject());
    go("mosque");
  }

  function openProject(id: string) {
    if (projectRef.current?.id === id) {
      go("mosque");
      return;
    }
    flushCurrent();
    const found = projectsRef.current.find((item) => item.id === id);
    if (!found) return;
    const copy = structuredClone(found);
    projectRef.current = copy;
    dirty.current = false;
    setHistory([]);
    setProject(copy);
    writeActiveId(id);
    setStatus("saved");
    go("mosque");
  }

  function deleteProjectById(id: string) {
    void removeProject(id);
    setProjects((list) => list.filter((item) => item.id !== id));
    if (projectRef.current?.id === id) {
      projectRef.current = null;
      dirty.current = false;
      setProject(null);
      setHistory([]);
      writeActiveId("");
      setStatus("idle");
    }
  }

  async function takeFile(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = await detectFile(bytes, file.name);
      if (detected.kind === "error") {
        setPending({ kind: "error", message: detected.message });
        return;
      }
      if (detected.kind === "schedule") {
        const choice = scheduleChoice(projectRef.current ?? createProject(), detected.parsed);
        const note = [choice.note, detected.excelNotice].filter(Boolean).join(" ");
        setPending({
          kind: "schedule",
          fileName: file.name,
          parsed: detected.parsed,
          excelNotice: detected.excelNotice,
          note,
          canKeepTimes: choice.canKeepTimes && Boolean(projectRef.current),
        });
        return;
      }
      if (detected.kind === "calendar") {
        const choice = calendarChoice(projectRef.current, detected.parsed);
        setPending({ kind: "calendar", fileName: file.name, parsed: detected.parsed, ...choice });
        return;
      }
      setPending({ kind: "backup", fileName: file.name, project: detected.project });
    } catch {
      setPending({ kind: "error", message: "Файл не удалось прочитать." });
    }
  }

  function withSource(base: Project, next: Project, source: string, revision: string): Project {
    if (base.source.trim()) return next;
    return { ...next, source, revision, demo: isTestSource(source) || next.demo };
  }

  function acceptSchedule(mode: "align" | "times") {
    if (pending?.kind !== "schedule") return;
    const base = projectRef.current ?? createProject();
    const next = withSource(base, commitSchedule(base, pending.parsed, mode, pending.excelNotice), pending.parsed.source, pending.parsed.revision);
    if (projectRef.current) update(() => next);
    else adopt(next);
    setPending(null);
    go("schedule");
  }

  function acceptCalendar(alignPlace: boolean) {
    if (pending?.kind !== "calendar") return;
    const base = projectRef.current ?? createProject();
    const next = applyCalendar(base, pending.parsed, alignPlace || !base.timezone || !base.mosqueName.trim());
    if (projectRef.current) update(() => next);
    else adopt(next);
    setPending(null);
    go("iqamah");
  }

  function acceptBackup(mode: "replace" | "separate") {
    if (pending?.kind !== "backup") return;
    let incoming = pending.project;
    if (mode === "replace" && projectRef.current) incoming = { ...incoming, id: projectRef.current.id, createdAt: projectRef.current.createdAt };
    else if (projectsRef.current.some((item) => item.id === incoming.id)) incoming = { ...incoming, id: crypto.randomUUID() };
    adopt(incoming);
    setPending(null);
    go("mosque");
  }

  const value: Store = {
    ready,
    projects,
    project,
    screen,
    status,
    canUndo: history.length > 0,
    pending,
    go,
    update,
    undo,
    createBlank,
    openDemo,
    openProject,
    deleteProjectById,
    takeFile,
    acceptSchedule,
    acceptCalendar,
    acceptBackup,
    dismissPending: () => setPending(null),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Контекст программы не найден");
  return store;
}

export function statusLabel(status: Status, project: Project | null): string {
  if (!project) return "Данные хранятся только в этом браузере";
  if (status === "saving") return "Сохраняем…";
  if (status === "error") return "Не удалось сохранить. Скачайте копию.";
  if (!projectHasContent(project) && status !== "saved") return "Новая мечеть ещё не заполнена";
  return "Сохранено в браузере";
}

export function projectTitle(project: Project): string {
  return project.mosqueName.trim() || "Мечеть без названия";
}
