import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Layout, PageHeader } from '../components/Layout';
import { Button, Input, Select, Card, Badge } from '../components/UI';
import { useAppSelector } from '../hooks/useAppDispatch';
import { adminApi } from '../services/api';

const ZONES = [
  'Copperbelt','Lusaka','Northern','Southern','Eastern',
  'Western','Luapula','Muchinga','North-Western','Central',
];

interface TDRUser {
  id: string;
  name: string;
  role: string;
  zone: string | null;
  createdAt?: string;
}

// ─── Add TDR Form ─────────────────────────────────────────────────────────────
const AddTDRForm: React.FC<{ onSuccess: () => void; defaultZone?: string }> = ({ onSuccess, defaultZone }) => {
  const [form, setForm] = useState({
    id: '', name: '', zone: defaultZone || ZONES[0], pin: '1234', confirmPin: '',
  });
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim()) { toast.error('TDR ID is required'); return; }
    if (!form.name.trim()) { toast.error('Full name is required'); return; }
    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      toast.error('PIN must be exactly 4 digits'); return;
    }
    if (form.pin !== form.confirmPin) { toast.error('PINs do not match'); return; }
    setLoading(true);
    try {
      await adminApi.createUser({
        id: form.id.trim().toLowerCase(),
        name: form.name.trim(),
        role: 'TDR',
        zone: form.zone,
        pin: form.pin,
      });
      toast.success(`TDR ${form.name} created successfully!`);
      setForm({ id: '', name: '', zone: defaultZone || ZONES[0], pin: '1234', confirmPin: '' });
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create TDR';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate ID from name
  const suggestId = () => {
    if (!form.name) return;
    const prefix = form.zone.substring(0, 2).toLowerCase();
    const nameSlug = form.name.split(' ').map(w => w[0]).join('').toLowerCase();
    setForm(f => ({ ...f, id: `tdr-${prefix}-${nameSlug}${Math.floor(Math.random()*90)+10}` }));
  };

  return (
    <Card className="border-l-4 border-zamtel-green">
      <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 zamtel-gradient rounded-full flex items-center justify-center text-white text-xs font-bold">+</span>
        Add New TDR
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Zone"
            value={form.zone}
            onChange={set('zone')}
            options={ZONES.map(z => ({ value: z, label: z }))}
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green focus:border-transparent"
                placeholder="e.g. John Phiri"
                value={form.name}
                onChange={set('name')}
                required
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-end">
          <Input
            label="TDR ID (unique)"
            placeholder="e.g. tdr-cb-35"
            value={form.id}
            onChange={set('id')}
            required
          />
          <button
            type="button"
            onClick={suggestId}
            className="mb-0 px-3 py-2.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition whitespace-nowrap"
          >
            Auto-suggest
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Initial PIN"
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="4 digits"
            value={form.pin}
            onChange={set('pin')}
          />
          <Input
            label="Confirm PIN"
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="Repeat PIN"
            value={form.confirmPin}
            onChange={set('confirmPin')}
          />
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
          <strong>Note:</strong> The TDR will use their ID + PIN to log in. They can change their PIN after first login.
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Create TDR Account
        </Button>
      </form>
    </Card>
  );
};

// ─── TDR List ─────────────────────────────────────────────────────────────────
const TDRList: React.FC<{ users: TDRUser[]; onResetPin: (id: string) => void }> = ({ users, onResetPin }) => {
  const tdrs = users.filter(u => u.role === 'TDR');
  if (!tdrs.length) return (
    <Card><p className="text-sm text-gray-400 text-center py-4">No TDRs found</p></Card>
  );

  return (
    <Card>
      <h3 className="text-sm font-bold text-gray-700 mb-3">TDR Accounts ({tdrs.length})</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {tdrs.map(u => (
          <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
              <p className="text-xs text-gray-400">{u.id} · {u.zone || '—'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge color="bg-green-100 text-green-700">{u.role}</Badge>
              <button
                onClick={() => onResetPin(u.id)}
                className="text-xs text-zamtel-pink hover:underline"
              >
                Reset PIN
              </button>
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
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { toast.error('PIN must be 4 digits'); return; }
    setLoading(true);
    try {
      await adminApi.resetPin(userId, pin);
      toast.success(`PIN reset for ${userId}`);
      onClose();
    } catch {
      toast.error('Failed to reset PIN');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-gray-900 mb-1">Reset PIN</h3>
        <p className="text-sm text-gray-500 mb-4">Setting new PIN for <strong>{userId}</strong></p>
        <Input
          label="New 4-digit PIN"
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="e.g. 1234"
          value={pin}
          onChange={e => setPin(e.target.value)}
        />
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
  const user       = useAppSelector(s => s.auth.user);
  const [users, setUsers]         = useState<TDRUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'add' | 'list' | 'settings'>('add');
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  const defaultZone = user?.role === 'ZBM' ? (user.zone || undefined) : undefined;

  const fetchUsers = async () => {
    try {
      const res = await adminApi.listUsers();
      setUsers(res.data);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const stats = {
    total: users.filter(u => u.role === 'TDR').length,
    zones: [...new Set(users.filter(u => u.role === 'TDR' && u.zone).map(u => u.zone))].length,
  };

  const tabs = [
    { key: 'add',      label: '+ Add TDR' },
    { key: 'list',     label: `TDR Accounts (${stats.total})` },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <Layout title="Admin Panel" showBack backTo={user?.role === 'HSD' ? '/hsd' : '/zbm'}>
      {/* Brand header */}
      <div className="zamtel-gradient-hero rounded-2xl p-5 mb-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-zamtel-pink/20 rounded-full translate-y-6 -translate-x-4" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow">
              <span className="text-zamtel-green font-black text-lg">Z</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">Admin Panel</h1>
              <p className="text-green-200 text-xs">User & Account Management</p>
            </div>
            <span className="ml-auto bg-zamtel-pink text-white text-xs px-3 py-1 rounded-full font-semibold">
              {user?.role}
            </span>
          </div>
          <div className="flex gap-4 mt-3">
            <div className="text-center">
              <p className="text-xl font-bold">{stats.total}</p>
              <p className="text-green-200 text-xs">TDR Accounts</p>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <p className="text-xl font-bold">{stats.zones}</p>
              <p className="text-green-200 text-xs">Active Zones</p>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <p className="text-xl font-bold">{users.filter(u => u.role === 'ZBM').length}</p>
              <p className="text-green-200 text-xs">ZBM Managers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'add' | 'list' | 'settings')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              tab === t.key
                ? 'bg-white text-zamtel-green shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'add' && (
        <AddTDRForm defaultZone={defaultZone} onSuccess={fetchUsers} />
      )}

      {tab === 'list' && (
        loading
          ? <Card><p className="text-center text-gray-400 py-6 text-sm">Loading accounts…</p></Card>
          : <TDRList users={users} onResetPin={setResetTarget} />
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <Card className="border-l-4 border-zamtel-pink">
            <h3 className="font-bold text-gray-900 mb-1">Brand</h3>
            <p className="text-sm text-gray-500 mb-3">Zamtel official colour palette</p>
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl">
                <div className="w-6 h-6 rounded-lg" style={{ background: '#00843D' }} />
                <div>
                  <p className="text-xs font-bold text-gray-700">Zamtel Green</p>
                  <p className="text-[10px] text-gray-400">#00843D</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl">
                <div className="w-6 h-6 rounded-lg" style={{ background: '#E4007C' }} />
                <div>
                  <p className="text-xs font-bold text-gray-700">Zamtel Pink</p>
                  <p className="text-[10px] text-gray-400">#E4007C</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl">
                <div className="w-6 h-6 rounded-lg border border-gray-200" style={{ background: '#FFFFFF' }} />
                <div>
                  <p className="text-xs font-bold text-gray-700">White</p>
                  <p className="text-[10px] text-gray-400">#FFFFFF</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-gray-900 mb-1">Monthly Targets</h3>
            <p className="text-sm text-gray-500 mb-3">Per-TDR monthly KPI targets</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'New Agents', value: 96 },
                { label: 'New Merchants', value: 96 },
                { label: 'Outlet Visits', value: 20 },
              ].map(t => (
                <div key={t.label} className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-zamtel-green">{t.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-gray-900 mb-1">System Info</h3>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Backend', value: 'Railway (Production)' },
                { label: 'Database', value: 'Neon PostgreSQL' },
                { label: 'Version', value: 'v1.0.0' },
                { label: 'Environment', value: 'Production' },
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

      {/* Reset PIN modal */}
      {resetTarget && (
        <ResetPinModal userId={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </Layout>
  );
};
