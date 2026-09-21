/**
 * Offline mutation queue — stores failed POSTs when offline and replays when online.
 * Uses localStorage for simplicity (small, serializable). Falls back to memory in tests.
 */

export type QueuedMutation = {
  id: string;
  type: 'practice_attempt' | 'practice_attempt_batch' | 'flashcard_review' | 'lesson_progress' | 'flashcard_create';
  payload: any;
  timestamp: string;
  attempts: number;
};

const STORAGE_KEY = 'kairo_offline_queue';
let memoryQueue: QueuedMutation[] | null = null;

function isLocalStorageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

function readQueue(): QueuedMutation[] {
  if (!isLocalStorageAvailable()) {
    return memoryQueue ? [...memoryQueue] : [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedMutation[]): void {
  if (!isLocalStorageAvailable()) {
    memoryQueue = [...queue];
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    memoryQueue = [...queue];
  }
}

export function enqueue(type: QueuedMutation['type'], payload: any): QueuedMutation {
  const item: QueuedMutation = {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: new Date().toISOString(),
    attempts: 0,
  };
  const q = readQueue();
  q.push(item);
  // Cap at 100
  if (q.length > 100) q.shift();
  writeQueue(q);
  return item;
}

export function getQueue(): QueuedMutation[] {
  return readQueue();
}

export function dequeue(id: string): void {
  const q = readQueue().filter(i => i.id !== id);
  writeQueue(q);
}

export function clearQueue(): void {
  writeQueue([]);
  memoryQueue = [];
}

export function updateAttempts(id: string): void {
  const q = readQueue();
  const item = q.find(i => i.id === id);
  if (item) item.attempts += 1;
  writeQueue(q);
}

// For testing
export function _setMemoryQueue(q: QueuedMutation[]) {
  memoryQueue = [...q];
}
export function _resetQueue() {
  memoryQueue = [];
  if (isLocalStorageAvailable()) {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}
