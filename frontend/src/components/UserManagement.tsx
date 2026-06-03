import React, { useState, useEffect } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from './UI';
import { hsdApi } from '../services/api';
import { ZAMBIA_ZONES } from '../types';

const ROLES = ['HSD', 'ZBM', 'ASE', 'TDR', 'DM'];

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [form, setForm] = useState({ id: '', name: '', pin: '', role: 'HSD', zone: '' });

  const load = () => { setLoading(true); hsdApi.getUsers(roleFilter || undefined).then(r => setUsers(r.data.data || [])).catch(() => toast.error('Failed to load users')).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [roleFilter]); // eslint-disable-line

  const create = async () => {
    if (!form.id || !form.name || !form.pin || !form.role) { toast.error('ID, name, PIN and role are required'); return; }
    if (!/^[0-9]{4}$/.test(form.pin)) { toast.error('PIN must be 4 digits'); return; }
    setSaving(true);
    try {
      await hsdApi.createUser({ id: form.id.trim(), name: form.name.trim(), pin: form.pin, role: form.role, zone: form.role === 'HSD' ? undefined : (form.zone || undefined) });
      toast.success(`${form.role} user created`);
      setForm({ id: '', name: '', pin: '', role: 'HSD', zone: '' }); setShowAdd(false); load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed to create user'); } finally { setSaving(false); }
  };

  const toggleActive = async (u: any) => {
    if (u.active && !confirm(`Deactivate ${u.name}?`)) return;
    try { await hsdApi.updateUser(u.id, { active: !u.active }); toast.success(u.active ? 'Deactivated' : 'Activated'); load(); }
    catch (e: any) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  return (
    <div className="px-4 py-3 pb-24 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-gray-800">👤 User Management</h3>
          <p className="text-[11px] text-gray-400">{users.length} users · add HSD / ZBM / ASE / TDR</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={load} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-2 rounded-xl" style={{ background: '#00843D' }}><UserPlus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add User'}</button>
        </div>
      </div>
      {showAdd && (
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="col-span-2 border rounded-xl px-3 py-2 text-sm">
              {ROLES.map(r => <option key={r} value={r}>{r} access level</option>)}
            </select>
            <input value={form.id} onChange={e => setForm({...form, id: e.target.value})} placeholder="Login ID (e.g. hsd-jdoe)" className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Full name" className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
            <input value={form.pin} onChange={e => setForm({...form, pin: e.target.value})} placeholder="4-digit PIN" maxLength={4} className="border rounded-xl px-3 py-2 text-sm" />
            {form.role !== 'HSD' && (
              <select value={form.zone} onChange={e => setForm({...form, zone: e.target.value})} className="border rounded-xl px-3 py-2 text-sm">
                <option value="">Select zone</option>
                {ZAMBIA_ZONES.map((z: string) => <option key={z} value={z}>{z}</option>)}
              </select>
            )}
          </div>
          <button onClick={create} disabled={saving} className="w-full text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50" style={{ background: '#00843D' }}>{saving ? 'Creating…' : 'Create User'}</button>
        </Card>
      )}
      {/* Role filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setRoleFilter('')} className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold ${roleFilter==='' ? 'bg-zamtel-green text-white' : 'bg-gray-100 text-gray-500'}`}>All</button>
        {ROLES.map(r => <button key={r} onClick={() => setRoleFilter(r)} className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold ${roleFilter===r ? 'bg-zamtel-green text-white' : 'bg-gray-100 text-gray-500'}`}>{r}</button>)}
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className={`bg-white rounded-2xl border px-4 py-2.5 flex items-center justify-between ${u.active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">{u.name}
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{u.role}</span>
                  {!u.active && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">INACTIVE</span>}
                </p>
                <p className="text-[10px] text-gray-400">{u.id}{u.zone ? ` · ${u.zone}` : ''}</p>
              </div>
              <button onClick={() => toggleActive(u)} className={`text-xs px-2.5 py-1 rounded-lg font-medium ${u.active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>{u.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          ))}
          {users.length === 0 && <p className="text-center text-gray-400 text-sm py-6">No users.</p>}
        </div>
      )}
    </div>
  );
};
