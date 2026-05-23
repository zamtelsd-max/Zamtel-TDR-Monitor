import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Smartphone, Plus, Search, RefreshCw, Filter,
  CheckCircle, XCircle, Edit3, Trash2, ChevronLeft, ChevronRight,
  BarChart2, Download, X, Save, AlertCircle
} from 'lucide-react';
import { dmApi } from '../services/api';
import { Layout, PageHeader } from '../components/Layout';
import { useAppSelector } from '../hooks/useAppDispatch';

const ZONES = [
  '','Central','Copperbelt','Eastern','Luapula',
  'Lusaka North','Lusaka South','Muchinga',
  'North-Western','Northern','Southern','Western',
];
const SOURCES = ['','MobiGO2+','A100C','P38','A50','A60','Other'];
const STATUSES_FILTER = ['','active','inactive'];
const DEVICE_STATUSES = ['ACTIVE','INACTIVE','PENDING DEPLOYMENT','DEFECTIVE','RETURNED'];

interface Device {
  id: string; dealerCode: string|null; description: string|null;
  imei1: string; imei2: string|null; msisdn: string|null; simSerial: string|null;
  aseName: string|null; teamLead: string|null; zone: string|null; region: string|null;
  status: string; activityStatus: number; deviceSource: string;
  kycReg: number; grossAdds: number; zamoGA: number; recharges: number;
  createdAt: string; updatedAt: string;
}

interface Summary {
  total: number; active: number; inactive: number; total_kyc: number;
  total_ga: number; total_zamo: number; total_recharges: number; activity_pct: number;
}

/* ── Stat Card ── */
const SC: React.FC<{label:string;value:string|number;sub?:string;color?:string;bg?:string}> =
  ({label,value,sub,color='text-gray-800',bg='bg-white'}) => (
  <div className={`${bg} rounded-2xl border border-gray-100 shadow-sm p-4 text-center`}>
    <p className={`text-2xl font-black ${color}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

/* ── Add / Edit Device Modal ── */
const DeviceModal: React.FC<{
  onClose: () => void; onSaved: () => void;
  initial?: Partial<Device>; editId?: string;
}> = ({ onClose, onSaved, initial, editId }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    dealerCode:'', description:'', imei1:'', imei2:'', msisdn:'',
    simSerial:'', siteId:'', region:'', zone:'', aseName:'', teamLead:'',
    status:'ACTIVE', activityStatus:'1', kycReg:'0', grossAdds:'0',
    zamoGA:'0', recharges:'0', deviceSource:'MobiGO2+',
    ...Object.fromEntries(Object.entries(initial||{}).map(([k,v])=>[k,v===null?'':String(v)])),
  });
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.imei1.trim()) { toast.error('IMEI 1 is required'); return; }
    if (!editId && !form.zone) { toast.error('Zone is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        activityStatus: Number(form.activityStatus),
        kycReg: Number(form.kycReg), grossAdds: Number(form.grossAdds),
        zamoGA: Number(form.zamoGA), recharges: Number(form.recharges),
      };
      if (editId) {
        await dmApi.updateDevice(editId, payload);
        toast.success('Device updated');
      } else {
        await dmApi.addDevice(payload);
        toast.success('Device registered');
      }
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save device');
    } finally { setSaving(false); }
  };

  const ic = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';
  const lc = 'block text-xs font-semibold text-gray-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-green-700 to-green-600 rounded-t-2xl px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-lg p-2"><Smartphone size={17} className="text-white"/></div>
            <div>
              <h2 className="text-white font-bold">{editId ? 'Edit Device' : 'Register New KYC Device'}</h2>
              <p className="text-green-100 text-xs">Zamtel KYC Device Registry</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex gap-2 text-xs text-blue-700">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0"/>
            <span>IMEI 1 must be unique. Device will be attributed to the named ASE/BDC/TSE.</span>
          </div>

          {/* Device Identity */}
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Device Identity</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lc}>IMEI 1 <span className="text-red-500">*</span></label>
                <input className={ic} value={form.imei1} onChange={e=>set('imei1',e.target.value)} placeholder="e.g. 350094515540903" readOnly={!!editId}/>
              </div>
              <div><label className={lc}>IMEI 2</label>
                <input className={ic} value={form.imei2} onChange={e=>set('imei2',e.target.value)} placeholder="Second IMEI (optional)"/>
              </div>
              <div><label className={lc}>Dealer Code</label>
                <input className={ic} value={form.dealerCode} onChange={e=>set('dealerCode',e.target.value)} placeholder="e.g. CEN099694"/>
              </div>
              <div><label className={lc}>Device Model / Source</label>
                <select className={ic} value={form.deviceSource} onChange={e=>set('deviceSource',e.target.value)}>
                  {SOURCES.slice(1).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className={lc}>Description</label>
                <input className={ic} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="e.g. ITEL A100C"/>
              </div>
              <div><label className={lc}>MSISDN / SIM Number</label>
                <input className={ic} value={form.msisdn} onChange={e=>set('msisdn',e.target.value)} placeholder="e.g. 260976543210"/>
              </div>
              <div><label className={lc}>Sim Serial</label>
                <input className={ic} value={form.simSerial} onChange={e=>set('simSerial',e.target.value)} placeholder="e.g. 8926003..."/>
              </div>
              <div><label className={lc}>Device Status</label>
                <select className={ic} value={form.status} onChange={e=>set('status',e.target.value)}>
                  {DEVICE_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Assignment</h3>
            <div className="grid grid-cols-2 gap-3">
              {!editId && (
                <div><label className={lc}>Zone <span className="text-red-500">*</span></label>
                  <select className={ic} value={form.zone} onChange={e=>{set('zone',e.target.value);set('region',e.target.value);}}>
                    <option value="">— Select Zone —</option>
                    {ZONES.slice(1).map(z=><option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              )}
              <div><label className={lc}>Region</label>
                <input className={ic} value={form.region} onChange={e=>set('region',e.target.value)} placeholder="Sub-region (if different)"/>
              </div>
              <div><label className={lc}>ASE / BDC / TSE Name</label>
                <input className={ic} value={form.aseName} onChange={e=>set('aseName',e.target.value)} placeholder="e.g. Charity Mtonga"/>
              </div>
              <div><label className={lc}>Team Lead / TDR Name</label>
                <input className={ic} value={form.teamLead} onChange={e=>set('teamLead',e.target.value)} placeholder="e.g. Mordecai H."/>
              </div>
            </div>
          </div>

          {/* Performance */}
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Performance <span className="text-gray-300 font-normal">(optional)</span></h3>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={lc}>Activity Status</label>
                <select className={ic} value={form.activityStatus} onChange={e=>set('activityStatus',e.target.value)}>
                  <option value="1">Active</option><option value="0">Inactive</option>
                </select>
              </div>
              <div><label className={lc}>KYC Registrations</label>
                <input type="number" min="0" className={ic} value={form.kycReg} onChange={e=>set('kycReg',e.target.value)}/>
              </div>
              <div><label className={lc}>Gross Adds</label>
                <input type="number" min="0" className={ic} value={form.grossAdds} onChange={e=>set('grossAdds',e.target.value)}/>
              </div>
              <div><label className={lc}>ZaMo GA</label>
                <input type="number" min="0" className={ic} value={form.zamoGA} onChange={e=>set('zamoGA',e.target.value)}/>
              </div>
              <div><label className={lc}>Recharges (K)</label>
                <input type="number" min="0" step="0.01" className={ic} value={form.recharges} onChange={e=>set('recharges',e.target.value)}/>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-gradient-to-r from-green-700 to-green-600 text-white rounded-xl py-3 text-sm font-bold
                         shadow-lg shadow-green-200 hover:from-green-800 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Saving...</>
                      : <><Save size={15}/>{editId ? 'Update Device' : 'Register Device'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   Main DM Dashboard
═══════════════════════════════════════════════════════════════════ */
export const DMDashboardPage: React.FC = () => {
  const user = useAppSelector(s => s.auth.user);

  // ── All hooks at top — NEVER move below early returns ─────────────────
  const [tab,      setTab]      = useState<'overview'|'devices'>('overview');
  const [summary,  setSummary]  = useState<Summary|null>(null);
  const [byZone,   setByZone]   = useState<any[]>([]);
  const [bySource, setBySource] = useState<any[]>([]);
  const [recent,   setRecent]   = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Device list state
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [devTotal,   setDevTotal]   = useState(0);
  const [devLoading, setDevLoading] = useState(false);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterSrc,  setFilterSrc]  = useState('');
  const [filterStat, setFilterStat] = useState('');

  // Modals
  const [showAdd,  setShowAdd]  = useState(false);
  const [editDev,  setEditDev]  = useState<Device|null>(null);
  const [deleting, setDeleting] = useState<string|null>(null);

  const LIMIT = 50;

  // Load dashboard summary
  const loadDashboard = useCallback(() => {
    setLoading(true);
    dmApi.dashboard()
      .then(r => {
        setSummary(r.data.summary);
        setByZone(r.data.byZone || []);
        setBySource(r.data.bySource || []);
        setRecent(r.data.recentlyAdded || []);
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  // Load device list
  const loadDevices = useCallback(() => {
    setDevLoading(true);
    dmApi.getDevices({ page, limit: LIMIT, search, zone: filterZone, source: filterSrc, status: filterStat })
      .then(r => { setDevices(r.data.data || []); setDevTotal(r.data.total || 0); })
      .catch(() => toast.error('Failed to load devices'))
      .finally(() => setDevLoading(false));
  }, [page, search, filterZone, filterSrc, filterStat]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === 'devices') loadDevices(); }, [tab, loadDevices]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this device from the registry?')) return;
    setDeleting(id);
    try {
      await dmApi.deleteDevice(id);
      toast.success('Device removed');
      loadDevices(); loadDashboard();
    } catch { toast.error('Failed to remove device'); }
    finally { setDeleting(null); }
  };

  const pctColor = (p: number) =>
    p >= 70 ? 'text-green-600' : p >= 40 ? 'text-amber-500' : 'text-red-500';
  const pctBg = (p: number) =>
    p >= 70 ? '#00843D' : p >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <Layout>
      {/* Modals */}
      {showAdd && (
        <DeviceModal onClose={() => setShowAdd(false)} onSaved={() => { loadDashboard(); if(tab==='devices') loadDevices(); }}/>
      )}
      {editDev && (
        <DeviceModal
          editId={editDev.id}
          initial={editDev}
          onClose={() => setEditDev(null)}
          onSaved={() => { loadDashboard(); if(tab==='devices') loadDevices(); setEditDev(null); }}
        />
      )}

      <PageHeader title="KYC Device Dashboard">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Hi, <b>{user?.name}</b></span>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-green-700 to-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow hover:from-green-800 transition-all">
            <Plus size={15}/> Add Device
          </button>
          <button onClick={loadDashboard} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <RefreshCw size={16}/>
          </button>
        </div>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-2 px-4 pb-3">
        {(['overview','devices'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
              tab===t ? 'bg-green-700 text-white shadow' : 'bg-white text-gray-500 border border-gray-200'
            }`}>
            {t === 'overview' ? '📊 Overview' : '📱 Devices'}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="px-4 pb-24 space-y-4">
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
          ) : !summary ? null : (<>
            {/* National summary */}
            <div className="grid grid-cols-3 gap-3">
              <SC label="Total Devices"  value={summary.total.toLocaleString()} color="text-blue-600"/>
              <SC label="Active"         value={summary.active.toLocaleString()} color="text-green-600"
                  sub={`${summary.activity_pct}% rate`}/>
              <SC label="Inactive"       value={(summary.inactive||summary.total-summary.active).toLocaleString()} color="text-red-500"/>
              <SC label="KYC Reg"        value={summary.total_kyc.toLocaleString()} color="text-purple-600"/>
              <SC label="Gross Adds"     value={summary.total_ga.toLocaleString()} color="text-amber-600"/>
              <SC label="ZaMo GA"        value={(summary.total_zamo||0).toLocaleString()} color="text-pink-600"/>
            </div>

            {/* Device source breakdown */}
            {bySource.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm font-bold text-gray-700 mb-3">By Device Model</p>
                <div className="space-y-2">
                  {bySource.map((s:any) => (
                    <div key={s.source}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-gray-700">{s.source}</span>
                        <span className="text-gray-500">{s.total.toLocaleString()} devices · {s.active} active</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-green-600 transition-all"
                          style={{width:`${Math.round(s.active/s.total*100)}%`}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zone table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-bold text-gray-700">Zone Breakdown ({byZone.length} zones)</p>
              </div>
              <div className="divide-y divide-gray-50">
                {byZone.map((z:any) => (
                  <div key={z.zone} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-gray-800">{z.zone||'Unassigned'}</span>
                      <span className={`text-sm font-black ${pctColor(z.pct)}`}>{z.pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full rounded-full transition-all" style={{width:`${z.pct}%`,background:pctBg(z.pct)}}/>
                    </div>
                    <div className="flex gap-4 text-[10px] text-gray-500">
                      <span>Total: <b className="text-gray-700">{z.total.toLocaleString()}</b></span>
                      <span>Active: <b className="text-green-600">{z.active.toLocaleString()}</b></span>
                      <span>KYC: <b className="text-purple-600">{z.kyc.toLocaleString()}</b></span>
                      <span>GA: <b className="text-amber-600">{z.ga.toLocaleString()}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recently added */}
            {recent.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-700">Recently Added</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {recent.map((d:any) => (
                    <div key={d.id} className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{d.imei1}</p>
                        <p className="text-[10px] text-gray-500">{d.aseName||'—'} · {d.zone||'—'} · {d.deviceSource}</p>
                      </div>
                      {d.activityStatus
                        ? <CheckCircle size={14} className="text-green-500 flex-shrink-0"/>
                        : <XCircle    size={14} className="text-red-400 flex-shrink-0"/>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}
        </div>
      )}

      {/* ── DEVICES TAB ── */}
      {tab === 'devices' && (
        <div className="px-4 pb-24 space-y-3">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Search IMEI, dealer code, ASE, TDR..."
                value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                value={filterZone} onChange={e=>{setFilterZone(e.target.value);setPage(1);}}>
                <option value="">All Zones</option>
                {ZONES.slice(1).map(z=><option key={z} value={z}>{z}</option>)}
              </select>
              <select className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                value={filterSrc} onChange={e=>{setFilterSrc(e.target.value);setPage(1);}}>
                {SOURCES.map(s=><option key={s} value={s}>{s||'All Models'}</option>)}
              </select>
              <select className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                value={filterStat} onChange={e=>{setFilterStat(e.target.value);setPage(1);}}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {devLoading ? 'Loading...' : `${devTotal.toLocaleString()} devices`}
              </p>
              <button onClick={loadDevices} className="text-xs text-green-700 font-semibold flex items-center gap-1">
                <RefreshCw size={11}/> Refresh
              </button>
            </div>
          </div>

          {/* Device list */}
          {devLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse"/>)}</div>
          ) : devices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              <Smartphone size={32} className="mx-auto mb-2 opacity-30"/>
              <p className="text-sm">No devices found</p>
              <button onClick={() => setShowAdd(true)}
                className="mt-3 text-sm text-green-700 font-bold underline underline-offset-2">Add a device</button>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map(d => (
                <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-800 font-mono">{d.imei1}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          d.activityStatus ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>{d.activityStatus ? 'ACTIVE' : 'INACTIVE'}</span>
                        <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{d.deviceSource}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {d.dealerCode||'—'} · {d.aseName||'No ASE'} · {d.zone||'—'}
                      </p>
                      {d.teamLead && <p className="text-[10px] text-gray-400">TL: {d.teamLead}</p>}
                      <div className="flex gap-4 text-[10px] text-gray-500 mt-1">
                        <span>KYC: <b>{d.kycReg}</b></span>
                        <span>GA: <b>{d.grossAdds}</b></span>
                        <span>ZaMo: <b>{d.zamoGA}</b></span>
                        {d.recharges > 0 && <span>K{Number(d.recharges).toFixed(0)}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setEditDev(d)}
                        className="p-2 rounded-lg hover:bg-green-50 text-green-600 transition-colors">
                        <Edit3 size={14}/>
                      </button>
                      <button onClick={() => handleDelete(d.id)} disabled={deleting===d.id}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors disabled:opacity-40">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {devTotal > LIMIT && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 p-3">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 disabled:opacity-40">
                <ChevronLeft size={14}/> Prev
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {Math.ceil(devTotal/LIMIT)}
              </span>
              <button disabled={page*LIMIT>=devTotal} onClick={()=>setPage(p=>p+1)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 disabled:opacity-40">
                Next <ChevronRight size={14}/>
              </button>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};
