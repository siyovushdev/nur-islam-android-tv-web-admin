import type { Project } from "../domain/model";

const DB_NAME = "nur-islam-admin";
const STORE = "projects";
const ACTIVE = "nur-islam-active";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("База браузера недоступна"));
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Не удалось обратиться к базе"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("Не удалось сохранить"));
        };
      }),
  );
}

export function loadProjects(): Promise<Project[]> {
  return run("readonly", (store) => store.getAll());
}

export function saveProject(project: Project): Promise<void> {
  return run("readwrite", (store) => store.put(project)).then(() => undefined);
}

export function removeProject(id: string): Promise<void> {
  return run("readwrite", (store) => store.delete(id)).then(() => undefined);
}

export function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE) ?? "";
  } catch {
    return "";
  }
}

export function writeActiveId(id: string): void {
  try {
    if (id) localStorage.setItem(ACTIVE, id);
    else localStorage.removeItem(ACTIVE);
  } catch {
    /* private mode may block storage; the project still lives in memory */
  }
}
