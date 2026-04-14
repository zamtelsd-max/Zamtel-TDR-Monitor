import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getUserTitle, getShortTitle } from '../utils/userTitle';
import { Layout } from '../components/Layout';
import { Button, Input, Select, Card, Badge } from '../components/UI';
import { useAppSelector } from '../hooks/useAppDispatch';
import { adminApi } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_ZONES = [
  'Central','Copperbelt','Eastern','Luapula','Lusaka',
  'Muchinga','Northern','North-Western','Southern','Western',
];

interface UserRecord {
  id: string; name: string; role: string;
  zone: string | null; active?: boolean; createdAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const roleBadge = (role: string) => {
  if (role === 'HSD') return 'bg-purple-100 text-purple-700';
  if (role === 'ZBM') return 'bg-pink-100 text-zamtel-pink';
  return 'bg-green-100 text-zamtel-green';
};

// ═══════════════════════════════════════════════════════════════════════════════
// Modal — Create User (TDR or ZBM)
// ═══════════════════════════════════════════════════════════════════════════════
const CreateUserModal: React.FC<{
  role: 'TDR' | 'ZBM'; zones: string[]; defaultZone?: string;
  onClose: () => void; onSuccess: () => void;
}> = ({ role, zones, defaultZone, onClose, onSuccess }) => {
  const isPink = role === 'ZBM';
  const [form, setForm] = useState({
    id: '', name: '', zone: defaultZone || zones[0] || DEFAULT_ZONES[0],
    pin: '1234', confirmPin: '1234',
  });
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const suggestId = () => {
    const pfx = form.zone.substring(0, 2).toLowerCase();
    const ini = form.name.split(' ').map(w => w[0]).join('').toLowerCase() || 'x';
    const num = Math.floor(Math.random() * 90) + 10;
    setForm(f => ({ ...f, id: `${role.toLowerCase()}-${pfx}-${ini}${num}` }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) { toast.error('ID and name required'); return; }
    if (!/^\d{4}$/.test(form.pin)) { toast.error('PIN must be 4 digits'); return; }
    if (form.pin !== form.confirmPin) { toast.error('PINs do not match'); return; }
    setLoading(true);
    try {
      await adminApi.createUser({ id: form.id.trim().toLowerCase(), name: form.name.trim(), role, zone: form.zone, pin: form.pin });
      toast.success(`${role} "${form.name}" created!`);
      onSuccess(); onClose();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Create failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className={`h-1.5 w-full rounded-t-3xl sm:rounded-t-3xl`}
          style={{ background: isPink ? 'linear-gradient(90deg,#E4007C,#B8005E)' : 'linear-gradient(90deg,#00843D,#004d24)' }} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-gray-900 text-lg">Add {role}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Zone" value={form.zone} onChange={set('zone')}
                options={zones.map(z => ({ value: z, label: z }))} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green"
                  placeholder="e.g. John Phiri" value={form.name} onChange={set('name')} required />
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <Input label={`${role} ID (unique)`} placeholder={`e.g. ${role.toLowerCase()}-cb-01`}
                value={form.id} onChange={set('id')} required />
              <button type="button" onClick={suggestId}
                className="px-3 py-2.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-xl transition whitespace-nowrap">
                Auto
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="PIN" type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={set('pin')} />
              <Input label="Confirm PIN" type="password" inputMode="numeric" maxLength={4} value={form.confirmPin} onChange={set('confirmPin')} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={onClose} className="flex-1">Cancel</Button>
              <Button variant={isPink ? 'pink' : 'primary'} type="submit" loading={loading} className="flex-1">
                Create {role}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Modal — Edit User
// ═══════════════════════════════════════════════════════════════════════════════
const EditUserModal: React.FC<{
  user: UserRecord; zones: string[]; isHSD: boolean;
  onClose: () => void; onSuccess: () => void;
}> = ({ user, zones, isHSD, onClose, onSuccess }) => {
  const [form, setForm] = useState({ name: user.name, zone: user.zone || '', role: user.role });
  const [pinForm, setPinForm] = useState({ pin: '', confirmPin: '' });
  const [tab, setTab] = useState<'profile' | 'pin'>('profile');
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setLoading(true);
    try {
      await adminApi.updateUser(user.id, { name: form.name.trim(), zone: form.zone || undefined, role: isHSD ? form.role : undefined });
      toast.success('Profile updated');
      onSuccess(); onClose();
    } catch { toast.error('Update failed'); }
    finally { setLoading(false); }
  };

  const savePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pinForm.pin)) { toast.error('PIN must be 4 digits'); return; }
    if (pinForm.pin !== pinForm.confirmPin) { toast.error('PINs do not match'); return; }
    setLoading(true);
    try {
      await adminApi.resetPin(user.id, pinForm.pin);
      toast.success(`PIN reset for ${user.id}`);
      onClose();
    } catch { toast.error('PIN reset failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md">
        <div className="h-1.5 w-full rounded-t-3xl" style={{ background: 'linear-gradient(90deg,#00843D,#E4007C)' }} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-gray-900">Edit User</h2>
              <p className="text-xs text-gray-400">{user.id} · <span className={`font-medium ${user.role === 'ZBM' ? 'text-zamtel-pink' : 'text-zamtel-green'}`}>{user.role}</span></p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4">
            {(['profile', 'pin'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t ? 'bg-white text-zamtel-green shadow' : 'text-gray-500'}`}>
                {t === 'profile' ? '✏️ Profile' : '🔑 Reset PIN'}
              </button>
            ))}
          </div>

          {tab === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-3">
              <Input label="Full Name" value={form.name} onChange={set('name')} required />
              <Select label="Zone" value={form.zone} onChange={set('zone')}
                options={[{ value: '', label: '— None —' }, ...zones.map(z => ({ value: z, label: z }))]} />
              {isHSD && (
                <Select label="Role" value={form.role} onChange={set('role')}
                  options={[{ value: 'TDR', label: 'TDR' }, { value: 'ZBM', label: 'ZBM' }, { value: 'HSD', label: 'HSD' }]} />
              )}
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" type="button" onClick={onClose} className="flex-1">Cancel</Button>
                <Button type="submit" loading={loading} className="flex-1">Save Changes</Button>
              </div>
            </form>
          )}

          {tab === 'pin' && (
            <form onSubmit={savePin} className="space-y-3">
              <Input label="New PIN" type="password" inputMode="numeric" maxLength={4}
                value={pinForm.pin} onChange={e => setPinForm(f => ({ ...f, pin: e.target.value }))} />
              <Input label="Confirm PIN" type="password" inputMode="numeric" maxLength={4}
                value={pinForm.confirmPin} onChange={e => setPinForm(f => ({ ...f, confirmPin: e.target.value }))} />
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" type="button" onClick={onClose} className="flex-1">Cancel</Button>
                <Button type="submit" loading={loading} className="flex-1">Reset PIN</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Modal — Add Zone
// ═══════════════════════════════════════════════════════════════════════════════
const AddZoneModal: React.FC<{
  existingZones: string[]; onClose: () => void; onSuccess: (z: string) => void;
}> = ({ existingZones, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { toast.error('Zone name required'); return; }
    if (existingZones.map(z => z.toLowerCase()).includes(n.toLowerCase())) {
      toast.error('Zone already exists'); return;
    }
    setLoading(true);
    try {
      await adminApi.createZone(n);
      toast.success(`Zone "${n}" added`);
      onSuccess(n); onClose();
    } catch { toast.error('Failed to add zone'); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm">
        <div className="h-1.5 w-full rounded-t-3xl" style={{ background: 'linear-gradient(90deg,#3B82F6,#2563EB)' }} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Add Zone</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Input label="Zone Name" placeholder="e.g. Kafue" value={name} onChange={e => setName(e.target.value)} required />
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {existingZones.map(z => (
                <span key={z} className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">{z}</span>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" type="button" onClick={onClose} className="flex-1">Cancel</Button>
              <Button type="submit" loading={loading} className="flex-1">Add Zone</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// User Table Row
// ═══════════════════════════════════════════════════════════════════════════════
const UserRow: React.FC<{
  user: UserRecord; isHSD: boolean;
  onEdit: (u: UserRecord) => void;
  onToggle: (u: UserRecord) => void;
  onDelete: (u: UserRecord) => void;
}> = ({ user, isHSD, onEdit, onToggle, onDelete }) => (
  <div className={`flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 ${!user.active ? 'opacity-50' : ''}`}>
    {/* Avatar */}
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
      user.role === 'ZBM' ? 'bg-zamtel-pink' : user.role === 'HSD' ? 'bg-purple-500' : 'bg-zamtel-green'
    }`}>
      {user.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
    </div>
    {/* Info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
        {!user.active && <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 rounded-full">inactive</span>}
      </div>
      <p className="text-xs text-gray-400 truncate">{user.id} · {user.zone || '—'}</p>
    </div>
    {/* Badge */}
    <Badge color={roleBadge(user.role)}>{user.role}</Badge>
    {/* Actions */}
    <div className="flex items-center gap-1">
      <button onClick={() => onEdit(user)}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-zamtel-green transition" title="Edit">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
      </button>
      {isHSD && (
        <button onClick={() => onToggle(user)}
          className={`p-1.5 rounded-lg transition text-xs ${user.active ? 'hover:bg-amber-50 text-amber-400 hover:text-amber-600' : 'hover:bg-green-50 text-gray-300 hover:text-zamtel-green'}`}
          title={user.active ? 'Deactivate' : 'Activate'}>
          {user.active ? '⊘' : '✓'}
        </button>
      )}
      {isHSD && (
        <button onClick={() => onDelete(user)}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition" title="Delete">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      )}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Zone Row
// ═══════════════════════════════════════════════════════════════════════════════
const ZoneRow: React.FC<{
  zone: string; tdrCount: number; zbmCount: number; isHSD: boolean;
  onDelete: (z: string) => void;
}> = ({ zone, tdrCount, zbmCount, isHSD, onDelete }) => (
  <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-zamtel-green to-zamtel-green-dark flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      {zone.substring(0, 2).toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-gray-900">{zone}</p>
      <p className="text-xs text-gray-400">{tdrCount} TDR{tdrCount !== 1 ? 's' : ''} · {zbmCount} ZBM{zbmCount !== 1 ? 's' : ''}</p>
    </div>
    <div className="flex gap-1.5">
      <span className="text-xs bg-green-100 text-zamtel-green px-2 py-0.5 rounded-full font-medium">{tdrCount}</span>
      <span className="text-xs bg-pink-100 text-zamtel-pink px-2 py-0.5 rounded-full font-medium">{zbmCount}</span>
    </div>
    {isHSD && tdrCount === 0 && zbmCount === 0 && (
      <button onClick={() => onDelete(zone)}
        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition" title="Remove zone">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// Main Admin Panel
// ═══════════════════════════════════════════════════════════════════════════════
export const AdminPanel: React.FC = () => {
  const user   = useAppSelector(s => s.auth.user);
  const isHSD  = user?.role === 'HSD';

  const [users, setUsers]   = useState<UserRecord[]>([]);
  const [zones, setZones]   = useState<string[]>(DEFAULT_ZONES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'TDR' | 'ZBM' | 'HSD'>('ALL');
  const [filterZone, setFilterZone] = useState('ALL');

  // Modals
  const [createRole, setCreateRole] = useState<'TDR' | 'ZBM' | null>(null);
  const [editUser,   setEditUser]   = useState<UserRecord | null>(null);
  const [addZone,    setAddZone]    = useState(false);
  const [tab, setTab] = useState<'users' | 'zones' | 'settings'>('users');

  const defaultZone = user?.role === 'ZBM' ? (user.zone || undefined) : undefined;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, zRes] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listZones().catch(() => ({ data: DEFAULT_ZONES })),
      ]);
      setUsers(uRes.data);
      if (Array.isArray(zRes.data) && zRes.data.length) setZones(zRes.data);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggle = async (u: UserRecord) => {
    try {
      await adminApi.updateUser(u.id, { active: !u.active });
      toast.success(`${u.name} ${u.active ? 'deactivated' : 'activated'}`);
      fetchAll();
    } catch { toast.error('Update failed'); }
  };

  const handleDelete = async (u: UserRecord) => {
    if (!confirm(`Delete ${u.name} (${u.id})? This cannot be undone.`)) return;
    try {
      await adminApi.deleteUser(u.id);
      toast.success(`${u.name} deleted`);
      fetchAll();
    } catch { toast.error('Delete failed'); }
  };

  const handleDeleteZone = async (z: string) => {
    if (!confirm(`Remove zone "${z}"?`)) return;
    try {
      await adminApi.deleteZone(z);
      toast.success(`Zone "${z}" removed`);
      setZones(prev => prev.filter(z2 => z2 !== z));
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to remove zone');
    }
  };

  // Filtered users
  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.id.toLowerCase().includes(search.toLowerCase());
    const matchRole   = filterRole === 'ALL' || u.role === filterRole;
    const matchZone   = filterZone === 'ALL' || u.zone === filterZone;
    const zoneScope   = isHSD || u.zone === user?.zone;
    return matchSearch && matchRole && matchZone && zoneScope;
  });

  const stats = {
    tdrs:  users.filter(u => u.role === 'TDR' && (isHSD || u.zone === user?.zone)).length,
    zbms:  isHSD ? users.filter(u => u.role === 'ZBM').length : 0,
    zones: zones.length,
    active: users.filter(u => u.active !== false && (isHSD || u.zone === user?.zone)).length,
  };

  // Zone stats
  const zoneStats = zones.map(z => ({
    name: z,
    tdrs: users.filter(u => u.role === 'TDR' && u.zone === z).length,
    zbms: users.filter(u => u.role === 'ZBM' && u.zone === z).length,
  }));

  const tabs = [
    { key: 'users',    label: `👥 Users (${stats.tdrs + stats.zbms})` },
    ...(isHSD ? [{ key: 'zones', label: `🗺️ Zones (${stats.zones})` }] : []),
    { key: 'settings', label: '⚙️ Settings' },
  ];

  return (
    <Layout title="Admin Panel" showBack backTo={isHSD ? '/hsd' : '/zbm'}>
      {/* Hero */}
      <div className="zamtel-gradient-hero rounded-2xl p-5 mb-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-12 translate-x-12" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-zamtel-pink/15 rounded-full translate-y-8 -translate-x-6" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow">
                <span className="text-zamtel-green font-black">Z</span>
              </div>
              <div>
                <p className="font-bold text-sm">Admin Panel</p>
                <p className="text-green-200 text-xs">User & Account Management</p>
              </div>
            </div>
            <span className="bg-zamtel-pink text-white text-xs px-3 py-1 rounded-full font-bold">
              {user ? getShortTitle(user.id, user.role) : ''}
            </span>
          </div>
          {/* Stats row */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'TDRs',    value: stats.tdrs },
              ...(isHSD ? [{ label: 'ZBMs', value: stats.zbms }, { label: 'Zones', value: stats.zones }] : []),
              { label: 'Active',  value: stats.active },
            ].map((s, i, arr) => (
              <React.Fragment key={s.label}>
                <div className="text-center">
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-green-200 text-xs">{s.label}</p>
                </div>
                {i < arr.length - 1 && <div className="w-px bg-white/20" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button onClick={() => setCreateRole('TDR')} size="sm" className="flex-1 sm:flex-none">
          + Add TDR
        </Button>
        {isHSD && (
          <Button onClick={() => setCreateRole('ZBM')} variant="pink" size="sm" className="flex-1 sm:flex-none">
            + Add ZBM
          </Button>
        )}
        {isHSD && (
          <Button onClick={() => setAddZone(true)} variant="secondary" size="sm" className="flex-1 sm:flex-none">
            + Add Zone
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              tab === t.key ? 'bg-white text-zamtel-green shadow' : 'text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <Card>
          {/* Search + filter bar */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <input
              className="flex-1 min-w-[140px] rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green"
              placeholder="Search name or ID…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zamtel-green"
              value={filterRole} onChange={e => setFilterRole(e.target.value as typeof filterRole)}>
              <option value="ALL">All Roles</option>
              <option value="TDR">TDR</option>
              <option value="ZBM">ZBM</option>
              {isHSD && <option value="HSD">HSD</option>}
            </select>
            {isHSD && (
              <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zamtel-green"
                value={filterZone} onChange={e => setFilterZone(e.target.value)}>
                <option value="ALL">All Zones</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No users found</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
              <p className="text-xs text-gray-400 mb-2">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</p>
              {filtered.map(u => (
                <UserRow key={u.id} user={u} isHSD={isHSD}
                  onEdit={setEditUser} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── ZONES TAB ── */}
      {tab === 'zones' && isHSD && (
        <Card>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-gray-400 mb-2">{zones.length} zones</p>
              {zoneStats.sort((a, b) => (b.tdrs + b.zbms) - (a.tdrs + a.zbms)).map(z => (
                <ZoneRow key={z.name} zone={z.name} tdrCount={z.tdrs} zbmCount={z.zbms}
                  isHSD={isHSD} onDelete={handleDeleteZone} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── SETTINGS TAB ── */}
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
                    <p className="text-[10px] text-gray-400 font-mono">{c.hex}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-gray-900 mb-3">Monthly Targets (per TDR)</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[{ label: 'New Agents', v: '96', sub: '/month' }, { label: 'Merchants', v: '96', sub: '/month' }, { label: 'Visits', v: '20', sub: '/day' }].map(t => (
                <div key={t.label} className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-zamtel-green">{t.v}</p>
                  <p className="text-[10px] font-semibold text-zamtel-green">{t.sub}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-bold text-gray-900 mb-3">System Info</h3>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Backend',  value: 'Railway (Production)' },
                { label: 'Database', value: 'Neon PostgreSQL' },
                { label: 'Frontend', value: 'GitHub Pages + Caddy' },
                { label: 'Version',  value: 'v1.1.0' },
                { label: 'Users',    value: `${users.length} total` },
                { label: 'Zones',    value: `${zones.length} active` },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="font-medium text-gray-800">{r.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Modals ── */}
      {createRole && (
        <CreateUserModal role={createRole} zones={zones} defaultZone={defaultZone}
          onClose={() => setCreateRole(null)} onSuccess={fetchAll} />
      )}
      {editUser && (
        <EditUserModal user={editUser} zones={zones} isHSD={isHSD}
          onClose={() => setEditUser(null)} onSuccess={fetchAll} />
      )}
      {addZone && (
        <AddZoneModal existingZones={zones}
          onClose={() => setAddZone(false)}
          onSuccess={z => setZones(prev => [...prev, z].sort())} />
      )}
    </Layout>
  );
};
