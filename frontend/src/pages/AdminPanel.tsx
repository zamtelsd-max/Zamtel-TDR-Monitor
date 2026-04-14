import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Layout, PageHeader } from '../components/Layout';
import { Button, Input, Select, Card, Badge } from '../components/UI';
import { useAppSelector } from '../hooks/useAppDispatch';
import { adminApi } from '../services/api';

const ZAMBIA_ZONES = [
  'Copperbelt','Lusaka','Northern','Southern','Eastern',
  'Western','Luapula','Muchinga','North-Western','Central',
];

interface UserRecord {
  id: string;
  name: string;
  role: string;
  zone: string | null;
  createdAt?: string;
}

// ─── Add TDR Form ─────────────────────────────────────────────────────────────
const AddTDRForm: React.FC<{ onSuccess: () => void; defaultZone?: string; zones: string[] }> = ({ onSuccess, defaultZone, zones }) => {
  const [form, setForm] = useState({ id: '', name: '', zone: defaultZone || zones[0] || ZAMBIA_ZONES[0], pin: '1234', confirmPin: '1234' });
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const suggestId = () => {
    if (!form.name) return;
    const prefix = form.zone.substring(0, 2).toLowerCase();
    const initials = form.name.split(' ').map(w => w[0]).join('').toLowerCase();
    setForm(f => ({ ...f, id: `tdr-${prefix}-${initials}${Math.floor(Math.random()*90)+10}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) { toast.error('ID and name are required'); return; }
    if (!/^\d{4}$/.test(form.pin)) { toast.error('PIN must be 4 digits'); return; }
    if (form.pin !== form.confirmPin) { toast.error('PINs do not match'); return; }
    setLoading(true);
    try {
      await adminApi.createUser({ id: form.id.trim().toLowerCase(), name: form.name.trim(), role: 'TDR', zone: form.zone, pin: form.pin });
      toast.success(`TDR "${form.name}" created!`);
      setForm({ id: '', name: '', zone: defaultZone || zones[0] || ZAMBIA_ZONES[0], pin: '1234', confirmPin: '1234' });
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create TDR');
    } finally { setLoading(false); }
  };

  return (
    <Card className="border-l-4 border-zamtel-green">
      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 bg-zamtel-green rounded-full flex items-center justify-center text-white text-xs">+</span>
        Add New TDR
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Zone" value={form.zone} onChange={set('zone')}
            options={zones.map(z => ({ value: z, label: z }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green"
              placeholder="e.g. John Phiri" value={form.name} onChange={set('name')} required />
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <Input label="TDR ID (unique)" placeholder="e.g. tdr-cb-35" value={form.id} onChange={set('id')} required />
          <button type="button" onClick={suggestId}
            className="px-3 py-2.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition whitespace-nowrap">
            Auto-suggest
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Initial PIN" type="password" inputMode="numeric" maxLength={4} placeholder="4 digits" value={form.pin} onChange={set('pin')} />
          <Input label="Confirm PIN" type="password" inputMode="numeric" maxLength={4} placeholder="Repeat" value={form.confirmPin} onChange={set('confirmPin')} />
        </div>
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          <strong>Note:</strong> TDR logs in with their ID + PIN. They can change PIN after first login.
        </p>
        <Button type="submit" loading={loading} className="w-full">Create TDR Account</Button>
      </form>
    </Card>
  );
};

// ─── Add ZBM Form (HSD only) ──────────────────────────────────────────────────
const AddZBMForm: React.FC<{ onSuccess: () => void; zones: string[] }> = ({ onSuccess, zones }) => {
  const [form, setForm] = useState({ id: '', name: '', zone: zones[0] || ZAMBIA_ZONES[0], pin: '1234', confirmPin: '1234' });
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const suggestId = () => {
    const prefix = form.zone.substring(0, 2).toLowerCase();
    setForm(f => ({ ...f, id: `zbm-${prefix}-${Math.floor(Math.random()*90)+10}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) { toast.error('ID and name are required'); return; }
    if (!/^\d{4}$/.test(form.pin)) { toast.error('PIN must be 4 digits'); return; }
    if (form.pin !== form.confirmPin) { toast.error('PINs do not match'); return; }
    setLoading(true);
    try {
      await adminApi.createUser({ id: form.id.trim().toLowerCase(), name: form.name.trim(), role: 'ZBM', zone: form.zone, pin: form.pin });
      toast.success(`ZBM "${form.name}" created for ${form.zone}!`);
      setForm({ id: '', name: '', zone: zones[0] || ZAMBIA_ZONES[0], pin: '1234', confirmPin: '1234' });
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create ZBM');
    } finally { setLoading(false); }
  };

  return (
    <Card className="border-l-4 border-zamtel-pink">
      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 bg-zamtel-pink rounded-full flex items-center justify-center text-white text-xs">+</span>
        Add New ZBM (Zone Business Manager)
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Assigned Zone" value={form.zone} onChange={set('zone')}
            options={zones.map(z => ({ value: z, label: z }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-pink"
              placeholder="e.g. Mary Banda" value={form.name} onChange={set('name')} required />
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <Input label="ZBM ID (unique)" placeholder="e.g. zbm-cb-02" value={form.id} onChange={set('id')} required />
          <button type="button" onClick={suggestId}
            className="px-3 py-2.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition whitespace-nowrap">
            Auto-suggest
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Initial PIN" type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={set('pin')} />
          <Input label="Confirm PIN" type="password" inputMode="numeric" maxLength={4} value={form.confirmPin} onChange={set('confirmPin')} />
        </div>
        <p className="text-xs text-pink-700 bg-pink-50 border border-pink-200 rounded-xl p-3">
          ZBM will see all TDRs and agents in their assigned zone.
        </p>
        <Button type="submit" variant="pink" loading={loading} className="w-full">Create ZBM Account</Button>
      </form>
    </Card>
  );
};

// ─── Add Zone Form (HSD only) ─────────────────────────────────────────────────
const AddZoneForm: React.FC<{ onSuccess: (zone: string) => void; existingZones: string[] }> = ({ onSuccess, existingZones }) => {
  const [zoneName, setZoneName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = zoneName.trim();
    if (!name) { toast.error('Zone name is required'); return; }
    if (existingZones.map(z => z.toLowerCase()).includes(name.toLowerCase())) {
      toast.error('Zone already exists'); return;
    }
    setLoading(true);
    try {
      await adminApi.createZone(name);
      toast.success(`Zone "${name}" added!`);
      setZoneName('');
      onSuccess(name);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to add zone');
    } finally { setLoading(false); }
  };

  return (
    <Card className="border-l-4 border-blue-400">
      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 bg-blue-400 rounded-full flex items-center justify-center text-white text-xs">+</span>
        Add New Zone
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Zone Name" placeholder="e.g. Kafue" value={zoneName} onChange={e => setZoneName(e.target.value)} required />
        <div className="flex flex-wrap gap-2">
          {existingZones.map(z => (
            <span key={z} className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full">{z}</span>
          ))}
        </div>
        <Button type="submit" variant="secondary" loading={loading} className="w-full border-blue-200 text-blue-700 hover:bg-blue-50">
          Add Zone
        </Button>
      </form>
    </Card>
  );
};

// ─── User List ────────────────────────────────────────────────────────────────
const UserList: React.FC<{ users: UserRecord[]; role: 'TDR' | 'ZBM'; onResetPin: (id: string) => void; onDelete: (id: string, name: string) => void }> = ({ users, role, onResetPin, onDelete }) => {
  const filtered = users.filter(u => u.role === role);
  const colorMap = { TDR: 'bg-green-100 text-green-700', ZBM: 'bg-pink-100 text-pink-700' };
  if (!filtered.length) return <Card><p className="text-sm text-gray-400 text-center py-4">No {role}s found</p></Card>;
  return (
    <Card>
      <h3 className="text-sm font-bold text-gray-700 mb-3">{role} Accounts ({filtered.length})</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {filtered.map(u => (
          <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
              <p className="text-xs text-gray-400">{u.id} · {u.zone || '—'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge color={colorMap[role]}>{u.role}</Badge>
              <button onClick={() => onResetPin(u.id)} className="text-xs text-zamtel-pink hover:underline">Reset PIN</button>
              <button onClick={() => onDelete(u.id, u.name)} className="text-xs text-red-400 hover:underline">✕</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ─── Reset PIN Modal ──────────────────────────────────────────────────────────
const ResetPinModal: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const handleReset = async () => {
    if (!/^\d{4}$/.test(pin)) { toast.error('PIN must be 4 digits'); return; }
    setLoading(true);
    try {
      await adminApi.resetPin(userId, pin);
      toast.success(`PIN reset for ${userId}`);
      onClose();
    } catch { toast.error('Failed to reset PIN'); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-gray-900 mb-1">Reset PIN</h3>
        <p className="text-sm text-gray-500 mb-4">New PIN for <strong>{userId}</strong></p>
        <Input label="New 4-digit PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} />
        <div className="flex gap-3 mt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button loading={loading} onClick={handleReset} className="flex-1">Reset PIN</Button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Admin Panel ─────────────────────────────────────────────────────────
export const AdminPanel: React.FC = () => {
  const user = useAppSelector(s => s.auth.user);
  const isHSD = user?.role === 'HSD';
  const [users, setUsers]       = useState<UserRecord[]>([]);
  const [zones, setZones]       = useState<string[]>(ZAMBIA_ZONES);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'tdr' | 'zbm' | 'zones' | 'list' | 'settings'>('tdr');
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  const defaultZone = user?.role === 'ZBM' ? (user.zone || undefined) : undefined;

  const fetchUsers = async () => {
    try {
      const [usersRes, zonesRes] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listZones().catch(() => ({ data: ZAMBIA_ZONES })),
      ]);
      setUsers(usersRes.data);
      if (Array.isArray(zonesRes.data) && zonesRes.data.length) setZones(zonesRes.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name} (${id})?`)) return;
    try {
      await adminApi.deleteUser(id);
      toast.success(`${name} removed`);
      fetchUsers();
    } catch { toast.error('Failed to delete user'); }
  };

  const stats = {
    tdrs: users.filter(u => u.role === 'TDR').length,
    zbms: users.filter(u => u.role === 'ZBM').length,
    zones: zones.length,
  };

  // Tabs differ by role
  const tabs = isHSD
    ? [
        { key: 'tdr',      label: '+ TDR' },
        { key: 'zbm',      label: '+ ZBM' },
        { key: 'zones',    label: '+ Zone' },
        { key: 'list',     label: `Accounts (${stats.tdrs + stats.zbms})` },
        { key: 'settings', label: 'Settings' },
      ]
    : [
        { key: 'tdr',      label: '+ Add TDR' },
        { key: 'list',     label: `TDRs (${stats.tdrs})` },
        { key: 'settings', label: 'Settings' },
      ];

  return (
    <Layout title="Admin Panel" showBack backTo={isHSD ? '/hsd' : '/zbm'}>
      {/* Hero header */}
      <div className="zamtel-gradient-hero rounded-2xl p-5 mb-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-zamtel-pink/20 rounded-full translate-y-6 -translate-x-4" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow">
                <span className="text-zamtel-green font-black">Z</span>
              </div>
              <div>
                <p className="font-bold text-sm">Admin Panel</p>
                <p className="text-green-200 text-xs">User & Account Management</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-xl font-bold">{stats.tdrs}</p>
                <p className="text-green-200 text-xs">TDRs</p>
              </div>
              {isHSD && <>
                <div className="w-px bg-white/20" />
                <div className="text-center">
                  <p className="text-xl font-bold">{stats.zbms}</p>
                  <p className="text-green-200 text-xs">ZBMs</p>
                </div>
                <div className="w-px bg-white/20" />
                <div className="text-center">
                  <p className="text-xl font-bold">{stats.zones}</p>
                  <p className="text-green-200 text-xs">Zones</p>
                </div>
              </>}
            </div>
          </div>
          <span className="bg-zamtel-pink text-white text-xs px-3 py-1 rounded-full font-bold">{user?.role}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-5 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex-shrink-0 py-2 px-3 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-white text-zamtel-green shadow' : 'text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      {tab === 'tdr' && <AddTDRForm zones={zones} defaultZone={defaultZone} onSuccess={fetchUsers} />}
      {tab === 'zbm' && isHSD && <AddZBMForm zones={zones} onSuccess={fetchUsers} />}
      {tab === 'zones' && isHSD && (
        <AddZoneForm existingZones={zones} onSuccess={newZone => setZones(z => [...z, newZone])} />
      )}

      {tab === 'list' && (
        loading
          ? <Card><p className="text-center text-gray-400 py-6 text-sm">Loading…</p></Card>
          : <div className="space-y-4">
              <UserList users={users} role="TDR" onResetPin={setResetTarget} onDelete={handleDelete} />
              {isHSD && <UserList users={users} role="ZBM" onResetPin={setResetTarget} onDelete={handleDelete} />}
            </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <Card className="border-l-4 border-zamtel-pink">
            <h3 className="font-bold text-gray-900 mb-3">Brand Colours</h3>
            <div className="flex gap-3 flex-wrap">
              {[
                { name: 'Zamtel Green', hex: '#00843D' },
                { name: 'Zamtel Pink',  hex: '#E4007C' },
                { name: 'White',        hex: '#FFFFFF', border: true },
              ].map(c => (
                <div key={c.hex} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl">
                  <div className="w-6 h-6 rounded-lg shadow-sm" style={{ background: c.hex, border: c.border ? '1px solid #e5e7eb' : undefined }} />
                  <div>
                    <p className="text-xs font-bold text-gray-700">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.hex}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="font-bold text-gray-900 mb-3">Monthly Targets (per TDR)</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[{ label: 'New Agents', v: 96 }, { label: 'New Merchants', v: 96 }, { label: 'Outlet Visits', v: 20 }].map(t => (
                <div key={t.label} className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-zamtel-green">{t.v}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="font-bold text-gray-900 mb-3">System Info</h3>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Backend',     value: 'Railway (Production)' },
                { label: 'Database',    value: 'Neon PostgreSQL' },
                { label: 'Frontend',    value: 'GitHub Pages' },
                { label: 'Version',     value: 'v1.1.0' },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="font-medium text-gray-800">{r.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {resetTarget && <ResetPinModal userId={resetTarget} onClose={() => { setResetTarget(null); fetchUsers(); }} />}
    </Layout>
  );
};
