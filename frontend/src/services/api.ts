import axios, { AxiosError } from 'axios';
import type {
  AuthUser, TDRDashboard, ZBMDashboard, HSDDashboard,
  Agent, Visit, FloatIssue, Prospect, ZoneStat, SalesTarget, TDRFlag,
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
      // HashRouter-friendly redirect
      window.location.hash = '#/login';
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

// IndexedDB — safe wrapper that gracefully degrades on iOS private mode / restricted WebViews
let _db: IDBDatabase | null = null;
let _dbFailed = false;

async function getDB(): Promise<IDBDatabase | null> {
  if (_dbFailed) return null;
  if (_db) return _db;
  try {
    _db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('zamtel-offline-queue', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('queue', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _db;
  } catch {
    _dbFailed = true;
    return null;
  }
}

export async function enqueueRequest(method: string, url: string, data: unknown): Promise<void> {
  const db = await getDB();
  if (!db) return; // IndexedDB unavailable — silently skip offline queue
  try {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add({ id: crypto.randomUUID(), method, url, data, queuedAt: new Date().toISOString() });
  } catch { /* ignore */ }
}

export async function getQueue(): Promise<QueuedRequest[]> {
  const db = await getDB();
  if (!db) return [];
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('queue', 'readonly').objectStore('queue').getAll();
      req.onsuccess = () => resolve(req.result as QueuedRequest[]);
      req.onerror   = () => reject(req.error);
    });
  } catch { return []; }
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(id);
  } catch { /* ignore */ }
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
    client.post<{ token: string; mustChangePin: boolean; user: AuthUser }>('/auth/login', { id, pin }),
  changePin: (data: { currentPin: string; newPin: string }) =>
    client.post<{ success: boolean; message: string }>('/auth/change-pin', data),
};

// ─── TDR ─────────────────────────────────────────────────────────────────────
export const tdrApi = {
  dashboard: () =>
    client.get<TDRDashboard>('/tdr/dashboard'),

  createAgent: (data: Partial<Agent>) =>
    client.post<Agent>('/tdr/agents', data),

  updateAgent: (id: string, data: Partial<Agent>) =>
    client.patch<Agent>(`/tdr/agents/${id}`, data),

  deleteAgent: (id: string) =>
    client.delete(`/tdr/agents/${id}`),

  getAgentByCode: (code: string) =>
    client.get<Agent>(`/tdr/agents/by-code/${encodeURIComponent(code)}`),

  searchAgents: (q: string) =>
    client.get<{ data: Agent[] }>(`/tdr/agents/search?q=${encodeURIComponent(q)}`),

  createVisit: (data: Partial<Visit>) =>
    client.post<Visit>('/tdr/visits', data),

  deleteVisit: (id: string) =>
    client.delete(`/tdr/visits/${id}`),

  createFloatIssue: (data: Partial<FloatIssue>) =>
    client.post<FloatIssue>('/tdr/float-issues', data),

  getFloatIssues: () =>
    client.get<FloatIssue[]>('/tdr/float-issues'),

  updateFloatIssue: (id: string, data: Partial<FloatIssue>) =>
    client.patch<FloatIssue>(`/tdr/float-issues/${id}`, data),

  createReactivation: (data: Record<string, unknown>) =>
    client.post('/tdr/reactivations', data),

  getReactivations: () =>
    client.get('/tdr/reactivations'),

  createProspect: (data: Partial<Prospect>) =>
    client.post<Prospect>('/tdr/prospects', data),

  getProspects: () =>
    client.get<Prospect[]>('/tdr/prospects'),

  updateProspect: (id: string, data: Partial<Prospect>) =>
    client.patch<Prospect>(`/tdr/prospects/${id}`, data),

  deleteProspect: (id: string) =>
    client.delete(`/tdr/prospects/${id}`),

  requestProspectClosure: (id: string) =>
    client.post(`/tdr/prospects/${id}/request-closure`),

  getActivities: () =>
    client.get<Array<{ type: string; id: string; label: string; sub: string; ts: string }>>('/tdr/activities'),

  export: () =>
    client.get('/tdr/export', { responseType: 'blob' }),

  getAgentDetail: (id: string) =>
    client.get<Agent & { visits: Visit[] }>(`/tdr/agents/${id}`),

  getVisitSummary: () =>
    client.get<{
      weekly:  Array<{ label: string; count: number }>;
      monthly: Array<{ label: string; count: number }>;
    }>('/tdr/visits/summary'),

  getStaleAgents: () =>
    client.get<{ stale: Array<Agent & { lastVisitedAt: string | null; daysAgo: number | null; isStale: boolean }>; total: number; staleCount: number }>('/tdr/agents/stale'),
};

// ─── ZBM ─────────────────────────────────────────────────────────────────────
export const zbmApi = {
  dashboard: (zone?: string) =>
    client.get<ZBMDashboard>('/zbm/dashboard', { params: zone ? { zone } : {} }),

  getTDR: (tdrId: string, zone?: string) =>
    client.get(`/zbm/tdr/${tdrId}`, { params: zone ? { zone } : {} }),

  getFloatIssues: (zone?: string) =>
    client.get<FloatIssue[]>('/zbm/float-issues', { params: zone ? { zone } : {} }),

  updateFloatIssue: (id: string, data: { status: string; resolutionNotes?: string }) =>
    client.patch<FloatIssue>(`/zbm/float-issues/${id}`, data),

  getProspects: (zone?: string) =>
    client.get<Prospect[]>('/zbm/prospects', { params: zone ? { zone } : {} }),

  approveProspectClosure: (id: string) =>
    client.post(`/zbm/prospects/${id}/approve-closure`),

  getStaleAgents: (zone?: string) =>
    client.get<{ stale: Array<Agent & { lastVisitedAt: string | null; daysAgo: number | null }>; total: number; staleCount: number }>('/zbm/agents/stale', { params: zone ? { zone } : {} }),

  getMap: (zone?: string) =>
    client.get('/zbm/map', { params: zone ? { zone } : {} }),

  export: (period?: string, zone?: string) =>
    client.get('/zbm/export', {
      params: { ...(period ? { period } : {}), ...(zone ? { zone } : {}) },
      responseType: 'blob',
    }),

  getLeaderboard: (period?: string, zone?: string) =>
    client.get<{
      period: string;
      zone: string;
      zbmName: string;
      tdrLeaderboard: Array<{
        id: string; name: string; zone: string;
        agents: number; merchants: number; visits: number;
        floatTotal: number; floatResolved: number;
        agentPct: number; merchantPct: number; visitPct: number; floatPct: number;
        score: number; pct: number;
      }>;
      targets: { agents: number; merchants: number; visits: number };
      mtd: { workingDaysElapsed: number; workingDaysTotal: number } | null;
    }>('/zbm/leaderboard', { params: { ...(period ? { period } : {}), ...(zone ? { zone } : {}) } }),

  getASEs: (zone?: string) =>
    client.get<{ success: boolean; data: Array<{ id: string; name: string; zone: string | null; tdrCount: number }> }>('/zbm/ases', { params: zone ? { zone } : {} }),

  getSiteFocus: (period?: string, zone?: string) =>
    client.get<{ success: boolean; period: string; data: any[] }>('/zbm/site-focus', { params: { ...(period ? { period } : {}), ...(zone ? { zone } : {}) } }),
  getSiteFocusAnalytics: (period?: string, zone?: string) =>
    client.get<any>('/zbm/site-focus-analytics', { params: { ...(period ? { period } : {}), ...(zone ? { zone } : {}) } }),

  addASE: (data: { id: string; name: string; pin: string }) =>
    client.post('/zbm/ases', data),

  getTDRs: (zone?: string, includeInactive?: boolean) =>
    client.get<{ success: boolean; data: Array<{ id: string; name: string; zone: string | null; aseId: string | null; active?: boolean }> }>('/zbm/tdrs', { params: { ...(zone ? { zone } : {}), ...(includeInactive ? { includeInactive: 'true' } : {}) } }),

  assignTDR: (tdrId: string, aseId: string | null) =>
    client.post('/zbm/assign-tdr', { tdrId, aseId }),

  updateTDR: (id: string, data: { name?: string; zone?: string; active?: boolean }) =>
    client.patch(`/zbm/tdrs/${id}`, data),

  setTDRActive: (id: string, active: boolean) =>
    client.patch(`/zbm/tdrs/${id}/deactivate`, { active }),

  // ── Device management ──────────────────────────────────────────────────
  addDevice: (data: Record<string, any>) =>
    client.post('/zbm/devices', data),

  getDevices: (params?: { page?: number; limit?: number; search?: string; source?: string; status?: string }) =>
    client.get('/zbm/devices', { params }),

  deleteDevice: (id: string) =>
    client.delete(`/zbm/devices/${id}`),
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

  getSiteFocus: (period?: string) =>
    client.get<{ success: boolean; period: string; data: any[] }>('/hsd/site-focus', { params: period ? { period } : {} }),
  getSiteFocusAnalytics: (period?: string) =>
    client.get<any>('/hsd/site-focus-analytics', { params: period ? { period } : {} }),

  getMap: (zone?: string) =>
    client.get('/hsd/map', { params: zone && zone !== 'all' ? { zone } : {} }),

  // ── User management (HSD admin) ────────────────────────────────────────
  getUsers: (role?: string) =>
    client.get<{ success: boolean; data: Array<{ id: string; name: string; role: string; zone: string | null; active: boolean }> }>('/hsd/users', { params: role ? { role } : {} }),

  createUser: (data: { id: string; name: string; pin: string; role: string; zone?: string }) =>
    client.post('/hsd/users', data),

  updateUser: (id: string, data: { name?: string; zone?: string; active?: boolean; pin?: string }) =>
    client.patch(`/hsd/users/${id}`, data),

  getLeaderboard: (period?: string) =>
    client.get<{
      period: string;
      topTDRs: Array<{ id: string; name: string; zone: string; agents: number; merchants: number; visits: number; pct: number }>;
      zoneLeaderboard: Array<{ zone: string; agents: number; merchants: number; visits: number; tdrCount: number; pct: number }>;
      mtd: { workingDaysElapsed: number; workingDaysTotal: number } | null;
    }>('/hsd/leaderboard', { params: period ? { period } : {} }),

  // ── Device management ──────────────────────────────────────────────────
  addDevice: (data: Record<string, any>) =>
    client.post('/hsd/devices', data),

  getDevices: (params?: { page?: number; limit?: number; search?: string; zone?: string; source?: string; status?: string }) =>
    client.get('/hsd/devices', { params }),

  deleteDevice: (id: string) =>
    client.delete(`/hsd/devices/${id}`),

  getAsePerformance: (period?: string) =>
    client.get('/hsd/ase-performance', { params: period ? { period } : {} }),
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

  updateUser: (userId: string, data: { name?: string; zone?: string; role?: string; active?: boolean }) =>
    client.patch(`/admin/users/${userId}`, data),

  listZones: () =>
    client.get<string[]>('/admin/zones'),

  createZone: (name: string) =>
    client.post('/admin/zones', { name }),

  deleteZone: (name: string) =>
    client.delete(`/admin/zones/${encodeURIComponent(name)}`),
};

// ─── ASE ─────────────────────────────────────────────────────────────────────
export const aseApi = {
  dashboard: () =>
    client.get<{ ase: { id: string; name: string }; tdrStats: Array<{ tdr: { id: string; name: string; zone: string | null }; agents: number; visits: number; floatIssues: number; prospects: number }> }>('/ase/dashboard'),

  getTDR: (id: string) =>
    client.get(`/ase/tdr/${id}`),

  availableTDRs: () =>
    client.get<{ success: boolean; data: Array<{ id: string; name: string; zone: string | null; aseId: string | null; mine: boolean }> }>('/ase/available-tdrs'),

  pickTDR: (tdrId: string) =>
    client.post('/ase/pick-tdr', { tdrId }),

  releaseTDR: (tdrId: string) =>
    client.delete(`/ase/pick-tdr/${tdrId}`),

  devices: (params?: {source?: string; status?: string; page?: number; limit?: number}) =>
    client.get('/ase/devices', { params }),

  kycSummary: (zone?: string) =>
    client.get('/ase/kyc-summary', { params: zone ? { zone } : {} }),

  getMap: () =>
    client.get('/ase/map'),

  // Site Focus
  getSiteFocus: (week?: string) =>
    client.get('/ase/site-focus', { params: week ? { week } : {} }),
  saveSiteFocus: (data: Record<string, any>) =>
    client.post('/ase/site-focus', data),
  updateSiteFocus: (id: string, data: Record<string, any>) =>
    client.patch(`/ase/site-focus/${id}`, data),
  deleteSiteFocus: (id: string) =>
    client.delete(`/ase/site-focus/${id}`),
};

// ─── Flags ───────────────────────────────────────────────────────────────────
export const flagsApi = {
  get: () => client.get<{ success: boolean; total: number; data: TDRFlag[] }>('/flags'),
};

// ─── DM (Device Manager) ─────────────────────────────────────────────────────
export const dmApi = {
  dashboard: () =>
    client.get('/dm/dashboard'),

  getDevices: (params?: { page?: number; limit?: number; search?: string; zone?: string; source?: string; status?: string; ase?: string }) =>
    client.get('/dm/devices', { params }),

  addDevice: (data: Record<string, any>) =>
    client.post('/dm/devices', data),

  updateDevice: (id: string, data: Record<string, any>) =>
    client.patch(`/dm/devices/${id}`, data),

  deleteDevice: (id: string) =>
    client.delete(`/dm/devices/${id}`),

  getAses: (zone?: string) =>
    client.get('/dm/ases', { params: zone ? { zone } : {} }),
};

// ─── SSO/ODR ─────────────────────────────────────────────────────────────────
export const ssoOdrApi = {
  summary:    () => client.get('/sso-odr/summary'),
  listSso:    () => client.get('/sso-odr/sso'),
  listOdr:    () => client.get('/sso-odr/odr'),
  createSso:  (data: any) => client.post('/sso-odr/sso', data),
  createOdr:  (data: any) => client.post('/sso-odr/odr', data),
  deleteSso:  (id: string) => client.delete(`/sso-odr/sso/${id}`),
  deleteOdr:  (id: string) => client.delete(`/sso-odr/odr/${id}`),
  getTargets: () => client.get('/sso-odr/targets'),
  setTargets: (data: { targetSso: number; targetOdr: number; zone?: string; period?: string }) =>
    client.post('/sso-odr/targets', data),
  getMap:     () => client.get('/sso-odr/map'),
};
