import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Download, Trophy, Users, RefreshCw, UserPlus, X, Plus, Smartphone, Store } from 'lucide-react';
import { AddDeviceModal } from '../components/AddDeviceModal';
import { useNavigate, Link } from 'react-router-dom';
import { zbmApi, flagsApi, ssoOdrApi } from '../services/api';
import type { ZBMDashboard, TDRStat, FloatIssue, Prospect, TDRFlag } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge, Button } from '../components/UI';
import { SiteFocusPanel } from '../components/SiteFocusPanel';
import { ISSUE_TYPE_LABELS } from '../types';
import { format } from 'date-fns';
import { GeoMap } from '../components/GeoMap';
import { getBand, calcWeightedScore, floatResolutionPct, WEIGHT_PCT, visitMtdTarget, prorateMtdTarget, workingDaysElapsed, workingDaysThisMonth } from '../utils/performance';
import { TDRPerfCard, PerformanceBar } from '../components/PerformanceBar';

// ── Ring (Donut) Chart ────────────────────────────────────────────────────────
const RingChart: React.FC<{
  pct: number; size?: number; stroke?: number;
  color?: string; bg?: string; label?: string; sublabel?: string;
}> = ({ pct, size = 88, stroke = 10, color = '#00843D', bg = '#e5e7eb', label, sublabel }) => {
  const r   = (size - stroke) / 2;
  const c   = 2 * Math.PI * r;
  const off = c - (Math.min(pct, 100) / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg}      strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}   strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={size/2} y={size/2 - (sublabel ? 5 : 0)} textAnchor="middle" dominantBaseline="central"
          fontSize={size < 70 ? 13 : 15} fontWeight="800" fill={color}>{pct}%</text>
        {sublabel && (
          <text x={size/2} y={size/2 + 11} textAnchor="middle" fontSize={9} fill="#9ca3af">{sublabel}</text>
        )}
      </svg>
      {label && <p className="text-[10px] font-semibold text-gray-500 text-center leading-tight">{label}</p>}
    </div>
  );
};

type SortKey = 'agents' | 'merchants' | 'visits' | 'floatIssues' | 'pct' | 'score';
type SortDir = 'asc' | 'desc';

function pctColor(pct: number) {
  const b = getBand(pct);
  return `${b.color} ${b.bg}`;
}

function tdrScore(row: TDRStat): number {
  const floatPct = floatResolutionPct(
    (row as any).floatResolved ?? 0,
    (row as any).floatTotal ?? row.floatIssues ?? 0
  );
  return calcWeightedScore({
    agentPct:        Math.min(Math.round((row.agents    / prorateMtdTarget(96)) * 100), 100),
    merchantPct:     Math.min(Math.round((row.merchants / prorateMtdTarget(96)) * 100), 100),
    floatPct,
    reactivationPct: Math.min(Math.round(((row.reactivations ?? 0) / Math.max((row.reactivationTarget ?? 1), 1)) * 100), 100),
    visitPct:        Math.min(Math.round((row.visits    / visitMtdTarget())      * 100), 100),
  });
}

export const ZBMDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [mainTab, setMainTab]   = useState<'dashboard' | 'ases-tdrs' | 'ase-performance' | 'site-focus' | 'flags'>('dashboard');
  const [data,       setData]       = useState<ZBMDashboard | null>(null);
  const [issues,     setIssues]     = useState<FloatIssue[]>([]);
  const [prospects,  setProspects]  = useState<Prospect[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [sortKey,    setSortKey]    = useState<SortKey>('pct');
  const [sortDir,    setSortDir]    = useState<SortDir>('desc');
  const [resolving,  setResolving]  = useState<string | null>(null);
  const [mapData,    setMapData]    = useState<{ agents: any[]; visits: any[] }>({ agents: [], visits: [] });
  const [exporting,  setExporting]  = useState(false);
  const [staleAgents, setStaleAgents] = useState<Array<any>>([]);
  const [showAllStale, setShowAllStale] = useState(false);
  // ASEs & TDRs tab state
  const [ases,         setAses]         = useState<Array<{ id: string; name: string; zone: string | null; tdrCount: number }>>([]);
  const [tdrs,         setTdrs]         = useState<Array<{ id: string; name: string; zone: string | null; aseId: string | null }>>([]);
  const [aseTdrsLoading, setAseTdrsLoading] = useState(false);
  const [showAddASE,   setShowAddASE]   = useState(false);
  const [newASE,       setNewASE]       = useState({ id: '', name: '', pin: '' });
  const [addingASE,    setAddingASE]    = useState(false);
  const [assigningTDR, setAssigningTDR] = useState<string | null>(null);
  const [tdrFlags,     setTdrFlags]     = useState<TDRFlag[]>([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deviceRefresh, setDeviceRefresh] = useState(0);
  const [ssoSummary, setSsoSummary] = useState<{ totalSso:number; totalOdr:number; mtdSso:number; mtdOdr:number; targetSso:number; targetOdr:number } | null>(null);
  const [ssoTarget, setSsoTarget]   = useState({ targetSso: '', targetOdr: '' });
  const [settingTarget, setSettingTarget] = useState(false);
  const [zbmSortKey, setZbmSortKey] = useState<'score' | 'agents' | 'floatIssues'>('score');

  const loadAseTdrs = async () => {
    setAseTdrsLoading(true);
    try {
      const [asesRes, tdrsRes, flagsRes] = await Promise.all([
        zbmApi.getASEs(),
        zbmApi.getTDRs(),
        flagsApi.get().catch(() => ({ data: { data: [] } })),
      ]);
      setAses(asesRes.data.data ?? []);
      setTdrs(tdrsRes.data.data ?? []);
      setTdrFlags(flagsRes.data.data ?? []);
    } catch {
      toast.error('Failed to load ASEs/TDRs');
    } finally {
      setAseTdrsLoading(false);
    }
  };

  useEffect(() => {
    if (mainTab === 'ases-tdrs') loadAseTdrs();
  }, [mainTab]);

  const handleAddASE = async () => {
    if (!newASE.id || !newASE.name || !newASE.pin) { toast.error('All fields required'); return; }
    setAddingASE(true);
    try {
      await zbmApi.addASE(newASE);
      toast.success(`ASE ${newASE.name} created!`);
      setNewASE({ id: '', name: '', pin: '' });
      setShowAddASE(false);
      loadAseTdrs();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to create ASE');
    } finally {
      setAddingASE(false);
    }
  };

  const handleAssignTDR = async (tdrId: string, aseId: string | null) => {
    setAssigningTDR(tdrId);
    try {
      await zbmApi.assignTDR(tdrId, aseId);
      toast.success(aseId ? 'TDR assigned' : 'TDR unassigned');
      loadAseTdrs();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to assign');
    } finally {
      setAssigningTDR(null);
    }
  };

  const fetchData = async () => {
    try {
      const [dashRes, issuesRes, mapRes, prospectsRes, staleRes] = await Promise.all([
        zbmApi.dashboard(),
        zbmApi.getFloatIssues(),
        zbmApi.getMap(),
        zbmApi.getProspects(),
        zbmApi.getStaleAgents().catch(() => ({ data: { stale: [], total: 0, staleCount: 0 } })),
      ]);
      setData(dashRes.data);
      setStaleAgents(staleRes.data.stale || []);
      setIssues(issuesRes.data);
      setProspects(prospectsRes.data);
      if (mapRes.data?.data) setMapData(mapRes.data.data);
      localStorage.setItem('zamtel_zbm_dashboard', JSON.stringify(dashRes.data));
      ssoOdrApi.summary().then(r => setSsoSummary(r.data.data)).catch(() => {});
    } catch {
      const cached = localStorage.getItem('zamtel_zbm_dashboard');
      if (cached) { try { setData(JSON.parse(cached) as ZBMDashboard); } catch { localStorage.removeItem('zamtel_zbm_dashboard'); } }
      else toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedTDRs = data
    ? [...data.tdrStats].sort((a, b) => {
        const av = sortKey === 'score' ? tdrScore(a) : a[sortKey as keyof TDRStat] as number;
        const bv = sortKey === 'score' ? tdrScore(b) : b[sortKey as keyof TDRStat] as number;
        return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
      })
    : [];

  const pendingIssues = issues.filter(i => i.status !== 'resolved');

  const handleResolve = async (issueId: string) => {
    const notes = window.prompt('Resolution notes (optional):') ?? '';
    setResolving(issueId);
    try {
      await zbmApi.updateFloatIssue(issueId, { status: 'resolved', resolutionNotes: notes });
      toast.success('Float issue resolved');
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'resolved', resolutionNotes: notes, resolvedAt: new Date().toISOString() } : i));
    } catch {
      toast.error('Failed to resolve issue');
    } finally {
      setResolving(null);
    }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const res = await zbmApi.export(period);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zamtel-tdr-export-${period}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const progress = (count: number, target: number) =>
    Math.min(Math.round(count / Math.max(target, 1) * 100), 100);

  return (
    <Layout title="ZBM Dashboard">
      <PageHeader
        title={data ? (data.zbm.zone ? `${data.zbm.zone} Zone` : 'All Zones') : 'Loading...'}
        subtitle={data ? `${data.zbm.name} · ${format(new Date(), 'MMMM yyyy')}` : ''}
      />

      {/* Main Tab Bar */}
      <div className="flex gap-2 px-4 pb-3">
        {(['dashboard', 'ases-tdrs', 'ase-performance', 'site-focus', 'flags'] as const).map(t => {
          const critCount = tdrFlags.filter(f => f.severity === 'critical').length;
          const label = t === 'dashboard' ? '📊 Dashboard'
            : t === 'ases-tdrs' ? '👥 ASEs & TDRs'
            : t === 'ase-performance' ? '📱 ASE KYC'
            : t === 'site-focus' ? '📍 Site Focus'
            : critCount > 0 ? `🔴 Flags (${tdrFlags.length})` : tdrFlags.length > 0 ? `⚠️ Flags (${tdrFlags.length})` : '🚩 Flags';
          return (
            <button key={t} onClick={() => setMainTab(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                mainTab === t ? 'bg-zamtel-green text-white shadow' : 'bg-white text-gray-500 border border-gray-200'
              }`}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ASEs & TDRs Tab */}
      {mainTab === 'ases-tdrs' && (
        <div className="px-4 pb-24">
          {/* Add ASE button */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-700">Area Sales Executives ({ases.length})</p>
            <div className="flex gap-2">
              <button onClick={loadAseTdrs} className="p-2 rounded-xl hover:bg-gray-100">
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={() => setShowAddASE(true)}
                className="flex items-center gap-1 text-xs bg-zamtel-green text-white font-bold px-3 py-1.5 rounded-xl">
                <UserPlus className="w-3 h-3" /> Add ASE
              </button>
            </div>
          </div>

          {/* Add ASE Modal */}
          {showAddASE && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">Add New ASE</h3>
                  <button onClick={() => setShowAddASE(false)}><X className="w-4 h-4 text-gray-500" /></button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">ASE ID (login username)</label>
                    <input value={newASE.id} onChange={e => setNewASE(p => ({ ...p, id: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green"
                      placeholder="e.g. ase-cb-01" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Full Name</label>
                    <input value={newASE.name} onChange={e => setNewASE(p => ({ ...p, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green"
                      placeholder="e.g. John Banda" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">PIN</label>
                    <input value={newASE.pin} onChange={e => setNewASE(p => ({ ...p, pin: e.target.value }))}
                      type="password"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green"
                      placeholder="4-digit PIN" />
                  </div>
                  <button onClick={handleAddASE} disabled={addingASE}
                    className="w-full bg-zamtel-green text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
                    {addingASE ? 'Creating...' : 'Create ASE'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ASE List */}
          {aseTdrsLoading ? (
            <div className="space-y-2 mb-4">{[1,2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : ases.length === 0 ? (
            <Card className="text-center py-6 text-gray-400 mb-4">
              <Users className="w-6 h-6 mx-auto mb-1 opacity-30" />
              <p className="text-sm">No ASEs in your zone yet.</p>
            </Card>
          ) : (
            <div className="space-y-2 mb-4">
              {ases.map(ase => (
                <div key={ase.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{ase.name}</p>
                    <p className="text-xs text-gray-500">ID: {ase.id} · {ase.tdrCount} TDR{ase.tdrCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-xs bg-green-100 text-zamtel-green font-bold px-2 py-0.5 rounded-full">ASE</span>
                </div>
              ))}
            </div>
          )}

          {/* TDR Assignment */}
          <p className="text-sm font-bold text-gray-700 mb-3">TDR → ASE Assignment ({tdrs.length})</p>
          {aseTdrsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : tdrs.length === 0 ? (
            <Card className="text-center py-6 text-gray-400">
              <p className="text-sm">No TDRs in your zone.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {tdrs.map(tdr => {
                const flag = tdrFlags.find(f => f.tdrId === tdr.id);
                const assignedASE = ases.find(a => a.id === tdr.aseId);
                return (
                  <div key={tdr.id} className={`bg-white rounded-2xl border px-4 py-3 shadow-sm ${flag?.severity === 'critical' ? 'border-red-200' : flag ? 'border-amber-200' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm flex items-center gap-1">
                          {tdr.name}
                          {flag && <AlertTriangle className={`w-3 h-3 ${flag.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />}
                        </p>
                        <p className="text-xs text-gray-500">
                          {assignedASE ? `ASE: ${assignedASE.name}` : 'No ASE assigned'}
                        </p>
                      </div>
                      {assigningTDR === tdr.id && <span className="text-xs text-gray-400">...</span>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {ases.map(ase => (
                        <button key={ase.id} onClick={() => handleAssignTDR(tdr.id, tdr.aseId === ase.id ? null : ase.id)}
                          disabled={assigningTDR === tdr.id}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            tdr.aseId === ase.id
                              ? 'bg-zamtel-green text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}>
                          {tdr.aseId === ase.id ? `✓ ${ase.name.split(' ')[0]}` : ase.name.split(' ')[0]}
                        </button>
                      ))}
                      {tdr.aseId && (
                        <button onClick={() => handleAssignTDR(tdr.id, null)}
                          disabled={assigningTDR === tdr.id}
                          className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          Unassign
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DASHBOARD Tab */}
      {mainTab === 'dashboard' && (<>

      {/* ── HEADER ROW: MTD bar + quick actions ── */}
      {(() => {
        const el = workingDaysElapsed(); const tot = workingDaysThisMonth();
        const pct = Math.round(el/tot*100);
        return (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                <span>Day {el} of {tot}</span><span>{pct}% of month</span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <Link to="/zbm/leaderboard">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm" style={{ background: '#00843D' }}>
                <Trophy size={12} /> Leaderboard
              </div>
            </Link>
            <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 border border-gray-200 bg-white">
              <Download size={12} /> {exporting ? '...' : 'Export'}
            </button>
          </div>
        );
      })()}

      {/* ── ZONE SCORE + 5 KPI CHIPS ── */}
      {loading && !data ? (
        <div className="h-28 bg-gray-100 rounded-2xl animate-pulse mb-4" />
      ) : data && (() => {
        const aTgt = data.zone.targets.agents    || 1;
        const mTgt = data.zone.targets.merchants || 1;
        const vTgt = data.zone.targets.visits    || 1;
        const aPct = Math.min(Math.round(data.zone.totals.agents    / aTgt * 100), 100);
        const mPct = Math.min(Math.round(data.zone.totals.merchants / mTgt * 100), 100);
        const vPct = Math.min(Math.round(data.zone.totals.visits    / vTgt * 100), 100);
        const fPct = floatResolutionPct(0, data.zone.totals.floatIssuesPending);
        const rPct = Math.min(Math.round(((data.zone.totals.reactivations ?? 0) / Math.max(6 * workingDaysElapsed() * (data.tdrStats?.length ?? 1), 1)) * 100), 100);
        const pTgtZone = Math.max(prorateMtdTarget(20) * (data.tdrStats?.length ?? 1), 1);
        const pPct = Math.min(Math.round(((data.zone.totals.prospects ?? 0) / pTgtZone) * 100), 100);
        const sc   = calcWeightedScore({ agentPct: aPct, merchantPct: mPct, prospectPct: pPct, floatPct: fPct, reactivationPct: rPct, visitPct: vPct });
        const band = getBand(sc);
        return (
          <div className="rounded-2xl p-4 mb-4 shadow-sm" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)', border: `2px solid ${band.ring}20` }}>
            {/* Score row */}
            <div className="flex items-center gap-4 mb-3">
              <RingChart pct={sc} size={72} stroke={8} color={band.ring} label="" />
              <div className="flex-1">
                <p className="font-black text-gray-900 text-base leading-tight">{data.zbm.zone} Zone</p>
                <p className={`text-xs font-bold mb-1 ${band.color}`}>{band.label}</p>
                <p className="text-[10px] text-gray-400">{data.tdrStats?.length ?? 0} TDRs · Working day {workingDaysElapsed()}/{workingDaysThisMonth()}</p>
                {data.zone.totals.floatIssuesPending > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full mt-1">
                    ⚠️ {data.zone.totals.floatIssuesPending} float issue{data.zone.totals.floatIssuesPending > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            {/* 5 KPI mini bars */}
            <div className="space-y-1.5">
              {[
                ['👤 Agent Recruitment', aPct, data.zone.totals.agents,             data.zone.targets.agents,    '#00843D'],
                ['🎯 Prospects',   pPct, data.zone.totals.prospects ?? 0,           pTgtZone,                    '#0EA5E9'],
                ['📍 Visits',      vPct, data.zone.totals.visits,                   data.zone.targets.visits,    '#2563EB'],
                ['🔄 Reactivations', rPct, data.zone.totals.reactivations ?? 0,     6 * workingDaysElapsed() * (data.tdrStats?.length ?? 1), '#8B5CF6'],
              ].map(([l, p, v, t, c]) => (
                <div key={l as string} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-24 shrink-0">{l}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: c as string }} />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600 w-14 text-right shrink-0">{v as number}/{t as number}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 6 METRIC CHIPS ── */}
      {!loading && data && (() => {
        const aTgt = data.zone.targets.agents || 1;
        const vTgt = data.zone.targets.visits || 1;
        const aPct = Math.min(Math.round(data.zone.totals.agents / aTgt * 100), 100);
        const vPct = Math.min(Math.round(data.zone.totals.visits / vTgt * 100), 100);
        const chips = [
          { label: 'Agents',    val: data.zone.totals.agents,    pct: aPct, color: '#00843D', bg: '#f0fdf4' },
          { label: 'Prospects', val: data.zone.totals.prospects ?? 0, pct: 0, color: '#0EA5E9', bg: '#f0f9ff' },
          { label: 'Visits',    val: data.zone.totals.visits,    pct: vPct, color: '#2563EB', bg: '#eff6ff' },
          { label: 'Reactiv.',  val: data.zone.totals.reactivations ?? 0, pct: 0, color: '#8B5CF6', bg: '#f5f3ff' },
          { label: 'SSO MTD',   val: ssoSummary?.mtdSso ?? 0,   pct: ssoSummary?.targetSso ? Math.min(100, Math.round((ssoSummary.mtdSso / ssoSummary.targetSso) * 100)) : 0, color: '#8B5CF6', bg: '#f5f3ff' },
          { label: 'ODR MTD',   val: ssoSummary?.mtdOdr ?? 0,   pct: ssoSummary?.targetOdr ? Math.min(100, Math.round((ssoSummary.mtdOdr / ssoSummary.targetOdr) * 100)) : 0, color: '#F97316', bg: '#fff7ed' },
        ];
        return (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {chips.map(ch => (
              <div key={ch.label} className="rounded-2xl px-3 py-2.5 border border-gray-100" style={{ background: ch.bg }}>
                <p className="text-[10px] text-gray-500 font-semibold">{ch.label}</p>
                <p className="text-xl font-black leading-tight" style={{ color: ch.color }}>{ch.val}</p>
                {ch.pct > 0 && <div className="mt-1 h-1 bg-white rounded-full"><div className="h-full rounded-full" style={{ width: `${ch.pct}%`, background: ch.color }} /></div>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── SET SSO/ODR TARGETS (collapsible-style, compact) ── */}
      <details className="mb-4 bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <summary className="px-4 py-3 text-xs font-bold text-gray-600 cursor-pointer list-none flex items-center justify-between select-none">
          <span>🎯 Set SSO/ODR Monthly Targets</span>
          <ChevronDown size={14} className="text-gray-400" />
        </summary>
        <div className="px-4 pb-4 border-t border-gray-50 pt-3">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-gray-500 font-semibold block mb-1">SSO Target</label>
              <input type="number" min="0" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={ssoTarget.targetSso} onChange={e => setSsoTarget(p => ({ ...p, targetSso: e.target.value }))}
                placeholder={String(ssoSummary?.targetSso || 10)} />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-semibold block mb-1">ODR Target</label>
              <input type="number" min="0" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={ssoTarget.targetOdr} onChange={e => setSsoTarget(p => ({ ...p, targetOdr: e.target.value }))}
                placeholder={String(ssoSummary?.targetOdr || 10)} />
            </div>
          </div>
          <button disabled={settingTarget || !ssoTarget.targetSso || !ssoTarget.targetOdr}
            onClick={async () => {
              setSettingTarget(true);
              try {
                await ssoOdrApi.setTargets({ targetSso: Number(ssoTarget.targetSso), targetOdr: Number(ssoTarget.targetOdr) });
                toast.success('Targets updated!');
                setSsoTarget({ targetSso: '', targetOdr: '' });
                ssoOdrApi.summary().then(r => setSsoSummary(r.data.data)).catch(() => {});
              } catch { toast.error('Failed to set targets'); }
              finally { setSettingTarget(false); }
            }}
            className="w-full text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40 transition-all"
            style={{ background: '#00843D' }}>
            {settingTarget ? 'Saving...' : 'Save Targets'}
          </button>
        </div>
      </details>

      {/* ── STALE AGENTS (compact pill list) ── */}
      {staleAgents.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-100 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            <p className="text-xs font-bold text-red-700">Unvisited 4+ days ({staleAgents.length})</p>
          </div>
          <div className="space-y-1.5">
            {(showAllStale ? staleAgents : staleAgents.slice(0, 4)).map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 bg-white border border-red-100 rounded-xl px-3 py-2">
                <span className="text-xs">{a.type === 'merchant' ? '🏪' : '👤'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{a.agentName}</p>
                  <p className="text-[10px] text-gray-400 truncate">{a.town} · {a.tdrName}</p>
                </div>
                <span className="text-[10px] font-bold text-red-600 shrink-0">{a.daysAgo === null ? 'Never' : `${a.daysAgo}d`}</span>
              </div>
            ))}
          </div>
          {staleAgents.length > 4 && (
            <button onClick={() => setShowAllStale(s => !s)}
              className="mt-2 w-full text-[10px] text-red-600 font-bold py-1.5 rounded-xl bg-red-100 hover:bg-red-200 transition">
              {showAllStale ? 'Show less' : `+ ${staleAgents.length - 4} more`}
            </button>
          )}
        </div>
      )}

      {/* ── TDR PERFORMANCE (ring + mini bars, compact) ── */}
      {sortedTDRs && sortedTDRs.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-sm text-gray-800 flex-1">📊 TDR Performance ({sortedTDRs.length})</h3>
            {/* Sort buttons */}
            <div className="flex gap-1">
              {([['score','Score'],['agents','Agents'],['floatIssues','Float']] as const).map(([k,l]) => (
                <button key={k} onClick={() => setZbmSortKey(k)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${zbmSortKey === k ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
                  style={zbmSortKey === k ? { background: '#00843D' } : {}}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {[...sortedTDRs].sort((a, b) => {
              if (zbmSortKey === 'score') return tdrScore(b) - tdrScore(a);
              if (zbmSortKey === 'agents') return b.agents - a.agents;
              return b.floatIssues - a.floatIssues;
            }).map((row: TDRStat) => {
              const sc    = tdrScore(row);
              const aTgt  = Math.max(prorateMtdTarget(96), 1);
              const vTgt  = Math.max(visitMtdTarget(), 1);
              const agentPct    = Math.min(Math.round(row.agents    / aTgt * 100), 100);
              const visitPct    = Math.min(Math.round(row.visits    / vTgt * 100), 100);
              const flag  = data?.tdrFlags?.find((f: any) => f.tdrId === row.tdr.id);
              const scColor = sc >= 70 ? '#00843D' : sc >= 40 ? '#f59e0b' : '#ef4444';
              const scBg    = sc >= 70 ? '#f0fdf4' : sc >= 40 ? '#fffbeb' : '#fef2f2';
              return (
                <div key={row.tdr.id} className="relative rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm">
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: scColor }} />
                  <div className="pl-4 pr-3 py-3 flex items-center gap-3">
                    <RingChart pct={sc} size={52} stroke={6} color={scColor} label="" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-800 truncate flex items-center gap-1">
                        {row.tdr.name}
                        {flag && <AlertTriangle className={`w-3 h-3 ${flag.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />}
                      </p>
                      <p className="text-xs text-gray-400">{row.tdr.zone}</p>
                      <div className="mt-1.5 space-y-1">
                        {([['Agents', agentPct, '#00843D'], ['Visits', visitPct, '#2563EB']] as const).map(([l,p,c]) => (
                          <div key={l} className="flex items-center gap-1.5">
                            <span className="text-[9px] text-gray-400 w-8 shrink-0">{l}</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                              <div className="h-full rounded-full" style={{ width: `${p}%`, background: c }} />
                            </div>
                            <span className="text-[9px] font-bold text-gray-500 w-6 text-right">{p}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs font-black px-2 py-1 rounded-xl" style={{ background: scBg, color: scColor }}>{sc}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FLOAT ALERTS (if any, compact) ── */}
      {pendingIssues.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-3">
          <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Float Issues ({pendingIssues.length})
          </p>
          <div className="space-y-2">
            {pendingIssues.slice(0, 5).map(issue => (
              <div key={issue.id} className="bg-white border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{issue.agentName}</p>
                  <p className="text-[10px] text-gray-400 truncate">{ISSUE_TYPE_LABELS[issue.issueType]} · {issue.tdrName} · {format(new Date(issue.reportedAt), 'dd MMM')}</p>
                </div>
                <button onClick={() => handleResolve(issue.id)} disabled={resolving === issue.id}
                  className="text-[10px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
                  {resolving === issue.id ? '...' : 'Resolve'}
                </button>
              </div>
            ))}
            {pendingIssues.length > 5 && (
              <p className="text-[10px] text-amber-600 text-center font-semibold">+ {pendingIssues.length - 5} more in Flags tab</p>
            )}
          </div>
        </div>
      )}

      {/* ── PROSPECT APPROVALS (if any) ── */}
      {prospects.filter(p => p.closedByTdr && p.status !== 'converted').length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-3">
          <p className="text-xs font-bold text-yellow-800 mb-2 flex items-center gap-1.5">
            <CheckCircle size={12} /> Awaiting Closure Approval ({prospects.filter(p => p.closedByTdr && p.status !== 'converted').length})
          </p>
          <div className="space-y-1.5">
            {prospects.filter(p => p.closedByTdr && p.status !== 'converted').map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-white border border-yellow-100 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{p.businessName}</p>
                  <p className="text-[10px] text-gray-400">{p.tdrName}</p>
                </div>
                <button onClick={async () => { try { await zbmApi.approveProspectClosure(p.id); toast.success('Approved!'); setProspects(prev => prev.map(x => x.id === p.id ? { ...x, status: 'converted' } : x)); } catch { toast.error('Failed'); } }}
                  className="text-[10px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
                  ✅ Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GPS FIELD MAP (compact, always visible) ── */}
      <div className="mb-4 bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-50">
          <p className="text-xs font-bold text-gray-700">📍 Field Map</p>
          <p className="text-[10px] text-gray-400">{mapData.agents.length} agents · {mapData.visits.length} visits</p>
        </div>
        {mapData.agents.length > 0 || mapData.visits.length > 0 ? (
          <GeoMap key={`zbm-map-${mapData.agents.length}`} agents={mapData.agents} visits={mapData.visits} height="340px" showVisits={true} />
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-400 text-xs">No GPS data yet</div>
        )}
      </div>
      <div className="pb-8" />
      </>)}

      {/* ASE PERFORMANCE Tab */}
      {/* Add Device Modal */}
      {showAddDevice && (
        <AddDeviceModal
          role="ZBM"
          defaultZone={data?.zbm?.zone || ''}
          addDevice={zbmApi.addDevice}
          onClose={() => setShowAddDevice(false)}
          onSaved={() => setDeviceRefresh(r => r + 1)}
        />
      )}

      {mainTab === 'ase-performance' && (
        <div className="px-4 py-3 pb-24">
          {/* Add Device button */}
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setShowAddDevice(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-green-700 to-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:from-green-800 transition-all"
            >
              <Plus size={15}/> Add Device
            </button>
          </div>
          {loading && !data ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
          ) : !data?.asePerformance ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No ASE performance data available.</p>
            </div>
          ) : (() => {
            const ap = data.asePerformance!;
            const scoreColor = (s: number) =>
              s >= 70 ? 'text-green-600' : s >= 40 ? 'text-amber-500' : 'text-red-600';
            const scoreBg = (s: number) =>
              s >= 70 ? 'bg-green-50 border-green-200 text-green-700'
              : s >= 40 ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-red-50 border-red-200 text-red-700';
            return (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
                    <p className="text-2xl font-black" style={{ color: '#00843D' }}>{ap.totalASEs}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Total ASEs</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
                    <p className="text-2xl font-black text-blue-600">{ap.totalDevices}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Total Devices</p>
                  </div>
                  <div className={`rounded-2xl border shadow-sm p-3 text-center ${ap.activeDeviceRate >= 70 ? 'bg-green-50 border-green-200' : ap.activeDeviceRate >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`text-2xl font-black ${scoreColor(ap.activeDeviceRate)}`}>{ap.activeDeviceRate}%</p>
                    <p className="text-xs text-gray-500 mt-0.5">Active Rate</p>
                  </div>
                  <div className={`rounded-2xl border shadow-sm p-3 text-center ${ap.avgASEScore >= 70 ? 'bg-green-50 border-green-200' : ap.avgASEScore >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`text-2xl font-black ${scoreColor(ap.avgASEScore)}`}>{ap.avgASEScore}%</p>
                    <p className="text-xs text-gray-500 mt-0.5">Avg ASE Score</p>
                  </div>
                </div>

                {/* ASE list */}
                <p className="text-sm font-bold text-gray-700 mb-3">ASE Performance ({ap.ases.length})</p>
                {ap.ases.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400">
                    <p className="text-sm">No ASEs found in this zone.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...ap.ases].sort((a, b) => b.finalScore - a.finalScore).map(ase => (
                      <div key={ase.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* ASE header */}
                        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                          <div>
                            <p className="font-bold text-sm text-gray-800">{ase.name}</p>
                            <p className="text-xs text-gray-400">{ase.zone || '—'} · {ase.tdrCount} TDR{ase.tdrCount !== 1 ? 's' : ''}</p>
                          </div>
                          <span className={`text-sm font-black px-2.5 py-1 rounded-full border ${scoreBg(ase.finalScore)}`}>
                            {ase.finalScore}%
                          </span>
                        </div>
                        {/* Device stats */}
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-gray-500">Device Activation</span>
                            <span className={`text-xs font-bold ${scoreColor(ase.devices.kycScore)}`}>{ase.devices.kycScore}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${ase.devices.kycScore}%`,
                                background: ase.devices.kycScore >= 70 ? '#00843D' : ase.devices.kycScore >= 40 ? '#f59e0b' : '#ef4444'
                              }} />
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] text-gray-500">
                            <div>
                              <p className="font-bold text-gray-700 text-xs">{ase.devices.total}</p>
                              <p>Total</p>
                            </div>
                            <div>
                              <p className="font-bold text-green-600 text-xs">{ase.devices.active}</p>
                              <p>Active</p>
                            </div>
                            <div>
                              <p className="font-bold text-red-500 text-xs">{ase.devices.inactive}</p>
                              <p>Inactive</p>
                            </div>
                            <div>
                              <p className={`font-bold text-xs ${scoreColor(ase.supervisionScore)}`}>{ase.supervisionScore}%</p>
                              <p>TDR Score</p>
                            </div>
                          </div>
                          {/* Weekly Site Focus */}
                          <div className="mt-3 pt-3 border-t border-gray-50">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-gray-500">📍 Weekly Site Focus <span className="text-[10px] text-gray-400">({ase.siteFocusSites ?? 0}/10 sites)</span></span>
                              <span className={`text-xs font-bold ${scoreColor(ase.siteFocusScore ?? 0)}`}>{ase.siteFocusScore ?? 0}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{
                                  width: `${ase.siteFocusScore ?? 0}%`,
                                  background: (ase.siteFocusScore ?? 0) >= 70 ? '#00843D' : (ase.siteFocusScore ?? 0) >= 40 ? '#f59e0b' : '#ef4444'
                                }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}


      {/* SITE FOCUS Tab */}
      {mainTab === 'site-focus' && (
        <div className="px-4 py-3 pb-24">
          <SiteFocusPanel
            fetchSites={async () => { const r = await zbmApi.getSiteFocus(); return { data: r.data.data }; }}
            exportXlsx={() => zbmApi.export()}
            exportName={`zamtel-zone-export-${new Date().toISOString().slice(0,7)}.xlsx`}
          />
        </div>
      )}
      {/* FLAGS Tab */}
      {mainTab === 'flags' && (
        <div className="px-4 py-3 pb-24">
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
          ) : tdrFlags.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center mt-4">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="font-bold text-green-700">All TDRs on track</p>
              <p className="text-xs text-green-600 mt-1">No performance flags in your zone</p>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-red-600">{tdrFlags.filter(f => f.severity === 'critical').length}</p>
                  <p className="text-xs text-red-500 font-semibold mt-0.5">🔴 Critical</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-amber-600">{tdrFlags.filter(f => f.severity === 'warning').length}</p>
                  <p className="text-xs text-amber-500 font-semibold mt-0.5">⚠️ Warning</p>
                </div>
              </div>

              {/* Flag cards */}
              <div className="space-y-3">
                {tdrFlags.map(f => (
                  <div key={f.tdrId} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${f.severity === 'critical' ? 'border-red-300' : 'border-amber-300'}`}>
                    {/* Header */}
                    <div className={`px-4 py-2.5 flex items-center justify-between ${f.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'}`}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-4 h-4 ${f.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                        <div>
                          <p className="font-bold text-sm text-gray-800">{f.tdrName}</p>
                          <p className="text-xs text-gray-500">{f.zone || 'No zone'} · {f.tdrId}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${f.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {f.severity === 'critical' ? '🔴 Critical' : '⚠️ Warning'}
                      </span>
                    </div>
                    {/* Flag reasons */}
                    <div className="px-4 py-2 border-b border-gray-100">
                      {f.flags.map((fl, i) => (
                        <p key={i} className="text-xs text-gray-700 py-0.5">{fl}</p>
                      ))}
                    </div>
                    {/* MTD stats */}
                    <div className="grid grid-cols-3 divide-x divide-gray-100 text-center py-2">
                      <div className="px-2">
                        <p className={`font-bold text-sm ${f.mtd.agents < f.mtd.agentTarget * 0.5 ? 'text-red-600' : 'text-gray-800'}`}>
                          {f.mtd.agents}<span className="text-gray-400 font-normal text-xs">/{f.mtd.agentTarget}</span>
                        </p>
                        <p className="text-[10px] text-gray-400">Agents MTD</p>
                      </div>
                      <div className="px-2">
                        <p className={`font-bold text-sm ${f.mtd.visits < f.mtd.visitTarget * 0.5 ? 'text-red-600' : 'text-gray-800'}`}>
                          {f.mtd.visits}<span className="text-gray-400 font-normal text-xs">/{f.mtd.visitTarget}</span>
                        </p>
                        <p className="text-[10px] text-gray-400">Visits MTD</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
};
