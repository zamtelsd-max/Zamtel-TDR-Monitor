import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { hsdApi, client } from '../services/api';

// Login activity report (ZBM logins: daily/weekly/monthly) with Excel download.
export function LoginActivity() {
  const [role, setRole] = useState('ZBM');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dl, setDl] = useState(false);

  const load = (r: string) => {
    setLoading(true);
    hsdApi.loginReport(r).then(res => setData(res.data.data)).catch(() => setData(null)).finally(() => setLoading(false));
  };
  useEffect(() => load(role), [role]);

  const download = async () => {
    setDl(true);
    try {
      const res = await client.get(`/hsd/login-report-export?role=${role}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `${role.toLowerCase()}-login-activity.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch { toast.error('Download failed'); }
    finally { setDl(false); }
  };

  const s = data?.summary;
  return (
    <div className="px-4 py-2 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-gray-800">🔐 Login Activity</h2>
          <p className="text-[11px] text-gray-400">How many {role}s are logging into the TDR Tool</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={role} onChange={e => setRole(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="ZBM">ZBM</option>
            <option value="ASE">ASE</option>
            <option value="TDR">TDR</option>
            <option value="HSD">HSD</option>
          </select>
          <button onClick={download} disabled={dl} className="text-xs font-bold text-white px-3 py-2 rounded-xl disabled:opacity-50" style={{ background: '#00843D' }}>{dl ? '…' : '⬇ Excel'}</button>
        </div>
      </div>

      {loading ? <p className="p-6 text-center text-gray-400 text-sm">Loading…</p> : !s ? <p className="p-6 text-center text-gray-400 text-sm">No data</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card label="Today" logins={s.today.logins} users={s.today.uniqueUsers} total={s.totalUsers} accent="#00843D" />
            <Card label="This Week" logins={s.weekly.logins} users={s.weekly.uniqueUsers} total={s.totalUsers} accent="#2563EB" />
            <Card label="This Month" logins={s.monthly.logins} users={s.monthly.uniqueUsers} total={s.totalUsers} accent="#00843D" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 flex text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              <span className="flex-1">{role}</span><span className="w-12 text-center">Today</span><span className="w-12 text-center">7d</span><span className="w-14 text-center">Month</span><span className="w-24 text-right">Last Login</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {data.byUser.map((u: any) => (
                <div key={u.userId} className="px-4 py-2.5 flex items-center text-sm">
                  <div className="flex-1 min-w-0"><p className="font-semibold text-gray-800 truncate">{u.name}</p><p className="text-[10px] text-gray-400">{u.zone || ''}</p></div>
                  <span className="w-12 text-center font-bold text-gray-700">{u.today}</span>
                  <span className="w-12 text-center text-gray-600">{u.week}</span>
                  <span className="w-14 text-center text-gray-600">{u.month}</span>
                  <span className="w-24 text-right text-[10px] text-gray-400">{new Date(u.lastLogin).toLocaleDateString()}</span>
                </div>
              ))}
              {!data.byUser.length && <p className="px-4 py-6 text-center text-gray-400 text-xs">No logins recorded yet this month</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, logins, users, total, accent }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{label}</p>
      <p className="text-2xl font-black mt-1" style={{ color: accent }}>{users}<span className="text-sm text-gray-400">/{total}</span></p>
      <p className="text-[10px] text-gray-400">{logins} logins</p>
    </div>
  );
}
