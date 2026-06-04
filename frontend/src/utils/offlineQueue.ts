// Offline queue — IndexedDB with localStorage fallback
export interface OfflineRecord {
  id: string;
  type: 'agent' | 'visit' | 'prospect' | 'float_issue' | 'reactivation' | 'site_focus';
  data: Record<string, unknown>;
  queuedAt: string;
  synced: boolean;
}

const DB_NAME = 'zamtel-tdr-offline';
const STORE   = 'pending';
const DB_VER  = 1;

let _db: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase | null> {
  if (_db) return _db;
  try {
    _db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _db;
  } catch { return null; }
}

export async function enqueueOffline(type: 'agent' | 'visit' | 'prospect' | 'float_issue' | 'reactivation' | 'site_focus', data: Record<string, unknown>): Promise<string> {
  const id = crypto.randomUUID();
  const record: OfflineRecord = { id, type, data, queuedAt: new Date().toISOString(), synced: false };
  const db = await getDB();
  if (db) {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(record);
    } catch { /* ignore */ }
  }
  try {
    const existing = JSON.parse(localStorage.getItem('zamtel_offline_queue') || '[]') as OfflineRecord[];
    existing.push(record);
    localStorage.setItem('zamtel_offline_queue', JSON.stringify(existing));
  } catch { /* ignore */ }
  return id;
}

export async function getPendingQueue(): Promise<OfflineRecord[]> {
  const db = await getDB();
  if (db) {
    try {
      const records = await new Promise<OfflineRecord[]>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as OfflineRecord[]);
        req.onerror   = () => reject(req.error);
      });
      if (records.length > 0) return records.filter(r => !r.synced);
    } catch { /* fall through */ }
  }
  try {
    return (JSON.parse(localStorage.getItem('zamtel_offline_queue') || '[]') as OfflineRecord[]).filter(r => !r.synced);
  } catch { return []; }
}

export async function removeFromPending(id: string): Promise<void> {
  const db = await getDB();
  if (db) {
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); } catch { /* ignore */ }
  }
  try {
    const existing = JSON.parse(localStorage.getItem('zamtel_offline_queue') || '[]') as OfflineRecord[];
    localStorage.setItem('zamtel_offline_queue', JSON.stringify(existing.filter(r => r.id !== id)));
  } catch { /* ignore */ }
}

export async function getPendingCount(): Promise<number> {
  return (await getPendingQueue()).length;
}
