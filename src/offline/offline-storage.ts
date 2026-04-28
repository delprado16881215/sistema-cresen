const OFFLINE_DB_NAME = 'sistema-cresen-offline';
const OFFLINE_DB_VERSION = 1;

const OFFLINE_STORE_NAMES = ['routes', 'cases', 'events'] as const;

export type OfflineStoreName = (typeof OFFLINE_STORE_NAMES)[number];

function canUseBrowserStorage() {
  return typeof window !== 'undefined';
}

function supportsIndexedDb() {
  return canUseBrowserStorage() && typeof window.indexedDB !== 'undefined';
}

function getLocalStorageKey(storeName: OfflineStoreName) {
  return `cobranza-offline:${storeName}`;
}

function readLocalStoreMap<T>(storeName: OfflineStoreName) {
  if (!canUseBrowserStorage()) return {} as Record<string, T>;

  const raw = window.localStorage.getItem(getLocalStorageKey(storeName));
  if (!raw) return {} as Record<string, T>;

  try {
    return JSON.parse(raw) as Record<string, T>;
  } catch {
    return {} as Record<string, T>;
  }
}

function writeLocalStoreMap<T>(storeName: OfflineStoreName, value: Record<string, T>) {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(getLocalStorageKey(storeName), JSON.stringify(value));
}

function openOfflineDb(): Promise<IDBDatabase> {
  if (!supportsIndexedDb()) {
    return Promise.reject(new Error('IndexedDB no disponible'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      for (const storeName of OFFLINE_STORE_NAMES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

function runIndexedDbRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB'));
  });
}

async function withObjectStore<T>(
  storeName: OfflineStoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
) {
  const database = await openOfflineDb();

  try {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return await action(store);
  } finally {
    database.close();
  }
}

export async function getOfflineRecord<T>(storeName: OfflineStoreName, key: string): Promise<T | null> {
  if (!canUseBrowserStorage()) return null;

  if (!supportsIndexedDb()) {
    const map = readLocalStoreMap<T>(storeName);
    return map[key] ?? null;
  }

  try {
    return await withObjectStore(storeName, 'readonly', async (store) => {
      const result = await runIndexedDbRequest<T | undefined>(store.get(key));
      return result ?? null;
    });
  } catch {
    const map = readLocalStoreMap<T>(storeName);
    return map[key] ?? null;
  }
}

export async function putOfflineRecord<T>(storeName: OfflineStoreName, key: string, value: T): Promise<void> {
  if (!canUseBrowserStorage()) return;

  if (!supportsIndexedDb()) {
    const map = readLocalStoreMap<T>(storeName);
    map[key] = value;
    writeLocalStoreMap(storeName, map);
    return;
  }

  try {
    await withObjectStore(storeName, 'readwrite', async (store) => {
      await runIndexedDbRequest(store.put(value, key));
    });
  } catch {
    const map = readLocalStoreMap<T>(storeName);
    map[key] = value;
    writeLocalStoreMap(storeName, map);
  }
}

export async function deleteOfflineRecord(storeName: OfflineStoreName, key: string): Promise<void> {
  if (!canUseBrowserStorage()) return;

  if (!supportsIndexedDb()) {
    const map = readLocalStoreMap<Record<string, unknown>>(storeName);
    delete map[key];
    writeLocalStoreMap(storeName, map);
    return;
  }

  try {
    await withObjectStore(storeName, 'readwrite', async (store) => {
      await runIndexedDbRequest(store.delete(key));
    });
  } catch {
    const map = readLocalStoreMap<Record<string, unknown>>(storeName);
    delete map[key];
    writeLocalStoreMap(storeName, map);
  }
}

export async function listOfflineRecords<T>(storeName: OfflineStoreName): Promise<T[]> {
  if (!canUseBrowserStorage()) return [];

  if (!supportsIndexedDb()) {
    return Object.values(readLocalStoreMap<T>(storeName));
  }

  try {
    return await withObjectStore(storeName, 'readonly', async (store) => {
      const result = await runIndexedDbRequest<T[]>(store.getAll());
      return result ?? [];
    });
  } catch {
    return Object.values(readLocalStoreMap<T>(storeName));
  }
}
