export type GameEventPayload = {
  game_id: string;
  organization_id: string;
  team_id: string;
  player_id: string | null;
  related_player_id: string | null;
  event_type: string;
  period: number;
  clock_ms: number;
  client_action_id: string;
};

export type QueuedGameEvent = {
  sequence?: number;
  client_action_id: string;
  payload: GameEventPayload;
  created_at: string;
  last_error?: string;
};

const DB_NAME = 'eo2mate-sports-offline';
const STORE_NAME = 'game-event-queue';
const DB_VERSION = 1;

function openQueue(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not support offline game-event storage.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'sequence', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline game-event storage.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => {};
    request.onerror = () => reject(request.error ?? new Error('Offline game-event storage failed.'));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Offline game-event storage failed.')); };
  });
}

export async function queueGameEvent(payload: GameEventPayload): Promise<QueuedGameEvent> {
  const row: QueuedGameEvent = { client_action_id: payload.client_action_id, payload, created_at: new Date().toISOString() };
  const key = await withStore<IDBValidKey>('readwrite', store => store.add(row));
  if (typeof key !== 'number') throw new Error('Unable to assign an offline event sequence.');
  return { ...row, sequence: key };
}

export async function listQueuedGameEvents(gameId?: string): Promise<QueuedGameEvent[]> {
  const rows = await withStore<QueuedGameEvent[]>('readonly', store => store.getAll());
  return rows.filter(row => !gameId || row.payload.game_id === gameId).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export async function removeQueuedGameEvent(sequence: number): Promise<void> {
  await withStore<undefined>('readwrite', store => store.delete(sequence));
}

export async function setQueuedGameEventError(sequence: number, message: string): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(sequence);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, last_error: message });
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to update the event queue.'));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Unable to update the event queue.')); };
  });
}
