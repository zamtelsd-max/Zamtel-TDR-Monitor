import axios, { AxiosError } from 'axios';
import type {
  AuthUser, TDRDashboard, ZBMDashboard, HSDDashboard,
  Agent, Visit, FloatIssue, Prospect, ZoneStat, SalesTarget,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const client = axios.create({ baseURL: BASE_URL });

// ─── Attach token ─────────────────────────────────────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('zamtel_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Handle 401 ───────────────────────────────────────────────────────────────
client.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('zamtel_token');
      localStorage.removeItem('zamtel_user');
      window.location.href = '/tdr/login';
    }
    return Promise.reject(err);
  }
);

// ─── Offline queue (IndexedDB) ────────────────────────────────────────────────
export interface QueuedRequest {
  id:      string;
  method:  string;
  url:     string;
  data:    unknown;
  queuedAt: string;
}

async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('zamtel-offline-queue', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('queue', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function enqueueRequest(method: string, url: string, data: unknown): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').add({ id: crypto.randomUUID(), method, url, data, queuedAt: new Date().toISOString() });
}

export async function getQueue(): Promise<QueuedRequest[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('queue', 'readonly').objectStore('queue').getAll();
    req.onsuccess = () => resolve(req.result as QueuedRequest[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').delete(id);
}

export async function syncQueue(): Promise<number> {
  const queue = await getQueue();
  let synced = 0;
  for (const item of queue) {
    try {
      await client.request({ method: item.method, url: item.url, data: item.data });
      await removeFromQueue(item.id);
      synced++;
    } catch {
      // Leave in queue if still failing
    }
  }
  return synced;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (id: string, pin: string) =>
    client.post<{ token: string; user: AuthUser }>('/auth/login', { id, pin }),
};

// ─── TDR ─────────────────────────────────────────────────────────────────────
export const tdrApi = {
  dashboard: () =>
    client.get<TDRDashboard>('/tdr/dashboard'),

  createAgent: (data: Partial<Agent>) =>
    client.post<Agent>('/tdr/agents', data),

  createVisit: (data: Partial<Visit>) =>
    client.post<Visit>('/tdr/visits', data),

  createFloatIssue: (data: Partial<FloatIssue>) =>
    client.post<FloatIssue>('/tdr/float-issues', data),

  getFloatIssues: () =>
    client.get<FloatIssue[]>('/tdr/float-issues'),

  updateFloatIssue: (id: string, data: Partial<FloatIssue>) =>
    client.patch<FloatIssue>(`/tdr/float-issues/${id}`, data),

  createProspect: (data: Partial<Prospect>) =>
    client.post<Prospect>('/tdr/prospects', data),

  getProspects: () =>
    client.get<Prospect[]>('/tdr/prospects'),

  updateProspect: (id: string, data: Partial<Prospect>) =>
    client.patch<Prospect>(`/tdr/prospects/${id}`, data),
};

// ─── ZBM ─────────────────────────────────────────────────────────────────────
export const zbmApi = {
  dashboard: () =>
    client.get<ZBMDashboard>('/zbm/dashboard'),

  getTDR: (tdrId: string) =>
    client.get(`/zbm/tdr/${tdrId}`),

  getFloatIssues: () =>
    client.get<FloatIssue[]>('/zbm/float-issues'),

  updateFloatIssue: (id: string, data: { status: string; resolutionNotes?: string }) =>
    client.patch<FloatIssue>(`/zbm/float-issues/${id}`, data),

  getProspects: () =>
    client.get<Prospect[]>('/zbm/prospects'),

  getMap: () =>
    client.get('/zbm/map'),
};

// ─── HSD ─────────────────────────────────────────────────────────────────────
export const hsdApi = {
  dashboard: (period?: string) =>
    client.get<HSDDashboard>('/hsd/dashboard', { params: period ? { period } : {} }),

  getZones: (period?: string) =>
    client.get<{ period: string; zones: ZoneStat[] }>('/hsd/zones', { params: period ? { period } : {} }),

  getZone: (zone: string, period?: string) =>
    client.get(`/hsd/zones/${encodeURIComponent(zone)}`, { params: period ? { period } : {} }),

  updateFloatIssue: (id: string, data: { status: string; resolutionNotes?: string }) =>
    client.patch<FloatIssue>(`/hsd/float-issues/${id}`, data),

  setTarget: (data: Partial<SalesTarget>) =>
    client.post<SalesTarget>('/hsd/targets', data),

  export: (period?: string) =>
    client.get('/hsd/export', { params: period ? { period } : {}, responseType: 'blob' }),

  getMap: (zone?: string) =>
    client.get('/hsd/map', { params: zone && zone !== 'all' ? { zone } : {} }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  listUsers: () =>
    client.get<Array<{ id: string; name: string; role: string; zone: string | null; createdAt: string }>>('/admin/users'),

  createUser: (data: { id: string; name: string; role: string; zone: string; pin: string }) =>
    client.post('/admin/users', data),

  resetPin: (userId: string, pin: string) =>
    client.patch(`/admin/users/${userId}/pin`, { pin }),

  deleteUser: (userId: string) =>
    client.delete(`/admin/users/${userId}`),
};
