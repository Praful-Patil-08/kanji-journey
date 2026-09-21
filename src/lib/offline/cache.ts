/**
 * Minimal IndexedDB cache for Kairo offline support.
 * Stores recent lessons, flashcards, practice questions, progress, preferences.
 * Falls back to in-memory if IndexedDB unavailable (e.g., tests).
 */

const DB_NAME = 'kairo';
const DB_VERSION = 1;
const STORES = ['lessons', 'flashcards', 'practiceQuestions', 'progress', 'preferences'] as const;
type StoreName = typeof STORES[number];

let memoryFallback = new Map<string, Map<string, any>>();

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'key' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSet(store: StoreName, key: string, value: any, ttlMs = 24 * 60 * 60 * 1000): Promise<void> {
  const entry = { key, value, timestamp: Date.now(), ttlMs };
  if (!isIndexedDBAvailable()) {
    if (!memoryFallback.has(store)) memoryFallback.set(store, new Map());
    memoryFallback.get(store)!.set(key, entry);
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(entry);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    if (!memoryFallback.has(store)) memoryFallback.set(store, new Map());
    memoryFallback.get(store)!.set(key, entry);
  }
}

export async function cacheGet<T>(store: StoreName, key: string): Promise<T | null> {
  if (!isIndexedDBAvailable()) {
    const entry = memoryFallback.get(store)?.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      memoryFallback.get(store)!.delete(key);
      return null;
    }
    return entry.value as T;
  }
  try {
    const db = await openDB();
    const entry = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      // Expired — delete
      try {
        const db2 = await openDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db2.transaction(store, 'readwrite');
          tx.objectStore(store).delete(key);
          tx.oncomplete = () => { db2.close(); resolve(); };
          tx.onerror = () => { db2.close(); reject(tx.error); };
        });
      } catch {}
      return null;
    }
    return entry.value as T;
  } catch {
    const entry = memoryFallback.get(store)?.get(key);
    if (!entry) return null;
    return entry.value as T;
  }
}

export async function cacheGetAll<T>(store: StoreName): Promise<T[]> {
  if (!isIndexedDBAvailable()) {
    const map = memoryFallback.get(store);
    if (!map) return [];
    const now = Date.now();
    const out: T[] = [];
    for (const [k, entry] of map.entries()) {
      if (now - entry.timestamp > entry.ttlMs) {
        map.delete(k);
      } else {
        out.push(entry.value as T);
      }
    }
    return out;
  }
  try {
    const db = await openDB();
    const entries = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as any[]);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    const now = Date.now();
    const valid = entries.filter(e => now - e.timestamp <= e.ttlMs).map(e => e.value as T);
    return valid;
  } catch {
    return [];
  }
}

export async function cacheClear(store: StoreName): Promise<void> {
  if (!isIndexedDBAvailable()) {
    memoryFallback.get(store)?.clear();
    return;
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    memoryFallback.get(store)?.clear();
  }
}

// For testing
export function _resetMemoryFallback() {
  memoryFallback = new Map();
}
export const _stores = STORES;
