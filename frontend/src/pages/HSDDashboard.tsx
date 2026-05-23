import React, { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Download, ChevronDown, ChevronUp, AlertTriangle, Trophy, ArrowLeft, Map, TrendingUp, Plus, Smartphone, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { AddDeviceModal } from '../components/AddDeviceModal';
import { useNavigate } from 'react-router-dom';
import { hsdApi, flagsApi } from '../services/api';
import type { HSDDashboard, ZoneStat, FloatIssue, TDRFlag } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge, Button, StatCard } from '../components/UI';
import { ISSUE_TYPE_LABELS } from '../types';
import { ZoneDrillDownView } from '../components/ZoneDrillDownView';
import { format, differenceInHours } from 'date-fns';
import { GeoMap } from '../components/GeoMap';
import { useAppSelector } from '../hooks/useAppDispatch';
import { getUserTitle } from '../utils/userTitle';
import { getBand, calcWeightedScore, floatResolutionPct, visitMtdTarget, prorateMtdTarget, workingDaysElapsed, workingDaysThisMonth } from '../utils/performance';
import { PerformanceBar } from '../components/PerformanceBar';

type SortKey = 'agents' | 'merchants' | 'visits' | 'floatIssues' | 'pct' | 'tdrs' | 'score';
type SortDir = 'asc' | 'desc';

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

function pctColor(pct: number) {
  const b = getBand(pct);
  return `${b.color} ${b.bg}`;
}

function zoneScore(z: { agents: number; merchants: number; visits: number; floatIssues: number; targets?: { agents: number; merchants: number; visits: number } }): number {
  // Use MTD targets for current-month scoring; fallback to targets from API when available
  const ta = z.targets?.agents    ?? prorateMtdTarget(96);
  const tm = z.targets?.merchants ?? prorateMtdTarget(96);
  const tv = z.targets?.visits    ?? visitMtdTarget();
  return calcWeightedScore({
    agentPct:        Math.min(Math.round(z.agents    / ta * 100), 100),
    merchantPct:     Math.min(Math.round(z.merchants / tm * 100), 100),
    floatPct:        floatResolutionPct(0, z.floatIssues),
    reactivationPct: Math.min(Math.round(((z.reactivations ?? 0) / Math.max((z.reactivationTarget ?? 1), 1)) * 100), 100),
    visitPct:        Math.min(Math.round(z.visits    / tv * 100), 100),
  });
}

function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = format(d, 'MMMM yyyy');
    opts.push({ value: val, label });
  }
  return opts;
}

export const HSDDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const authUser = useAppSelector(s => s.auth.user);
  const [dashboard, setDashboard] = useState<HSDDashboard | null>(null);
  const [zones,     setZones]     = useState<ZoneStat[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [period,    setPeriod]    = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sortKey, setSortKey] = useState<SortKey>('pct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [resolving, setResolving] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mapData,   setMapData]   = useState<{ agents: any[]; visits: any[] }>({ agents: [], visits: [] });
  const [showMap,   setShowMap]   = useState(true);
  const [mainTab,   setMainTab]   = useState<'dashboard' | 'ase' | 'flags'>('dashboard');
  const [tdrFlags,  setTdrFlags]  = useState<TDRFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsOpen, setFlagsOpen] = useState<Record<string, boolean>>({});
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [asePerf,     setAsePerf]     = useState<any>(null);
  const [asePerfLoad, setAsePerfLoad] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashRes, zonesRes, mapRes] = await Promise.all([
        hsdApi.dashboard(period),
        hsdApi.getZones(period),
        hsdApi.getMap(),
      ]);
      setDashboard(dashRes.data);
      setZones(zonesRes.data.zones);
      if (mapRes.data?.data) setMapData(mapRes.data.data);
      localStorage.setItem('zamtel_hsd_dashboard', JSON.stringify({ dashboard: dashRes.data, zones: zonesRes.data.zones, period }));
    } catch {
      const cached = localStorage.getItem('zamtel_hsd_dashboard');
      if (cached) {
        try {
          const d = JSON.parse(cached) as { dashboard: HSDDashboard; zones: ZoneStat[]; period: string };
          setDashboard(d.dashboard);
          setZones(d.zones);
          toast('Showing cached data', { icon: '📦' });
        } catch { localStorage.removeItem('zamtel_hsd_dashboard'); toast.error('Failed to load dashboard'); }
      } else {
        toast.error('Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, [period]);

  const loadFlags = () => {
    setFlagsLoading(true);
    flagsApi.get()
      .then(r => setTdrFlags(r.data.data ?? []))
      .catch(() => toast.error('Failed to load flags'))
      .finally(() => setFlagsLoading(false));
  };

  const loadAsePerf = useCallback(() => {
    setAsePerfLoad(true);
    hsdApi.getAsePerformance(period)
      .then(r => setAsePerf(r.data))
      .catch(() => toast.error('Failed to load ASE performance'))
      .finally(() => setAsePerfLoad(false));
  }, [period]);

  useEffect(() => {
    if (mainTab === 'flags') loadFlags();
    if (mainTab === 'ase')   loadAsePerf();
  }, [mainTab, loadAsePerf]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedZones = [...zones].sort((a, b) => {
    const av = sortKey === 'score' ? zoneScore(a) : (a as unknown as Record<string, number>)[sortKey];
    const bv = sortKey === 'score' ? zoneScore(b) : (b as unknown as Record<string, number>)[sortKey];
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const handleResolveAlert = async (issueId: string) => {
    const notes = window.prompt('Resolution notes (optional):') ?? '';
    setResolving(issueId);
    try {
      await hsdApi.updateFloatIssue(issueId, { status: 'resolved', resolutionNotes: notes });
      toast.success('Float issue resolved');
      setDashboard(prev => prev ? {
        ...prev,
        criticalAlerts: prev.criticalAlerts.filter(a => a.id !== issueId),
      } : prev);
    } catch {
      toast.error('Failed to resolve');
    } finally {
      setResolving(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await hsdApi.export(period);
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `zamtel-hsd-export-${period}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const SortIcon: React.FC<{ col: SortKey }> = ({ col }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  const monthOpts = monthOptions();

  // ── Zone Drill-Down: render full ZBM view for selected zone ────────────────
  if (selectedZone) {
    return (
      <ZoneDrillDownView
        zone={selectedZone}
        onBack={() => setSelectedZone(null)}
      />
    );
  }

  return (
    <Layout
      title={authUser ? `${getUserTitle(authUser.id, authUser.role)} — Dashboard` : 'National Dashboard'}
      actions={
        <Button size="sm" variant="secondary" loading={exporting} onClick={handleExport}>
          <Download className="w-3.5 h-3.5 mr-1" /> Export
        </Button>
      }
    >
      <PageHeader
        title="National Overview"
        subtitle="All Zones"
      >
        <select
          className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zamtel-green"
          value={period}
          onChange={e => setPeriod(e.target.value)}
        >
          {monthOpts.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </PageHeader>

      {/* Add Device Modal */}
      {showAddDevice && (
        <AddDeviceModal
          role="HSD"
          defaultZone=""
          addDevice={hsdApi.addDevice}
          onClose={() => setShowAddDevice(false)}
          onSaved={() => {}}
        />
      )}

      {/* Main Tab Bar */}
      <div className="flex gap-1.5 px-4 pb-3 flex-wrap">
        {([
          ['dashboard', '📊 Overview'],
          ['ase',       '📱 ASE & Devices'],
          ['flags',     `🚩 Flags${tdrFlags.length > 0 ? ` (${tdrFlags.length})` : ''}`],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setMainTab(t as any)}
            className={`flex-1 min-w-[80px] py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
              mainTab === t ? 'bg-zamtel-green text-white shadow' : 'bg-white text-gray-500 border border-gray-200'
            }`}>
            {label}
          </button>
        ))}
        <button
          onClick={() => setShowAddDevice(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-green-700 to-green-600 text-white px-3 py-2 rounded-xl text-xs font-bold shadow hover:from-green-800 transition-all whitespace-nowrap"
        >
          <Plus size={12}/> Device
        </button>
      </div>

      {/* Red Flags Tab */}
      {mainTab === 'flags' && (
        <div className="px-4 pb-24">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-700">
              {flagsLoading ? 'Loading...' : `${tdrFlags.length} TDRs flagged nationally`}
            </p>
            <button onClick={loadFlags} className="p-2 rounded-xl hover:bg-gray-100">
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          {flagsLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : tdrFlags.length === 0 ? (
            <Card className="text-center py-10 text-gray-400">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No flagged TDRs at the moment. 🎉</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Group by zone */}
              {Array.from(new Set(tdrFlags.map(f => f.zone || 'Unknown'))).sort().map(zone => {
                const zoneFlags = tdrFlags.filter(f => (f.zone || 'Unknown') === zone);
                const open = flagsOpen[zone] !== false;
                return (
                  <div key={zone} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                      onClick={() => setFlagsOpen(p => ({ ...p, [zone]: !open }))}>
                      <span className="font-bold text-sm text-gray-800">
                        🗺 {zone} <span className="text-gray-400 font-normal">({zoneFlags.length})</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          zoneFlags.some(f => f.severity === 'critical') ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {zoneFlags.filter(f => f.severity === 'critical').length} critical
                        </span>
                        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-3 space-y-2 border-t border-gray-50">
                        {zoneFlags.map(f => (
                          <div key={f.tdrId} className={`rounded-xl p-3 mt-2 ${f.severity === 'critical' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
                            <p className="font-bold text-sm text-gray-800 flex items-center gap-1">
                              {f.tdrName}
                              <AlertTriangle className={`w-3 h-3 ${f.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                            </p>
                            {f.flags.map((fl, i) => <p key={i} className="text-xs text-gray-700 mt-0.5">{fl}</p>)}
                            <div className="grid grid-cols-3 gap-1 mt-2 text-center text-xs">
                              <div className="bg-white/80 rounded-lg py-1">
                                <span className="font-bold text-gray-700">{f.mtd.agents}/{f.mtd.agentTarget}</span>
                                <p className="text-gray-500">Agents MTD</p>
                              </div>
                              <div className="bg-white/80 rounded-lg py-1">
                                <span className="font-bold text-gray-700">{f.mtd.merchants}/{f.mtd.merchantTarget}</span>
                                <p className="text-gray-500">Merchants MTD</p>
                              </div>
                              <div className="bg-white/80 rounded-lg py-1">
                                <span className="font-bold text-gray-700">{f.mtd.visits}/{f.mtd.visitTarget}</span>
                                <p className="text-gray-500">Visits MTD</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dashboard Tab */}
      {mainTab === 'dashboard' && (<>
      {/* MTD progress — shown only for current month */}
      {!period || period === `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}` ? (() => {
        const el = workingDaysElapsed(); const tot = workingDaysThisMonth(); const pct = Math.round(el/tot*100);
        return (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1 px-0.5">
              <span className="text-xs text-gray-500">📅 MTD — Working day <strong>{el}</strong> of <strong>{tot}</strong> · targets prorated</span>
              <span className="text-xs font-semibold text-gray-600">{pct}% of month</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 rounded-full bg-gray-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })() : null}

      {/* National KPI — performance against target (built from zone targets) */}
      {loading && !dashboard ? (
        <div className="space-y-2 mb-4">{[0,1,2].map(i => <Skeleton key={i} className="h-8 rounded-xl" />)}</div>
      ) : dashboard && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-zamtel-green" />
            <h3 className="font-bold text-sm text-gray-800">National Performance Against Target</h3>
            <span className="text-xs text-gray-400 ml-auto">Built up from all zone targets</span>
          </div>
          {/* Overall national weighted score */}
          {(() => {
            const kpis = dashboard.kpis as any;
            const aPct = kpis.agentPct    ?? 0;
            const mPct = kpis.merchantPct ?? 0;
            const vPct = kpis.visitPct    ?? 0;
            const overall = Math.round(aPct * 0.4 + mPct * 0.2 + vPct * 0.1);
            const band = getBand(overall);
            return (
              <>
                {/* Ring charts row */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <RingChart pct={overall}  color={band.ring || '#00843D'} label="Overall" sublabel="weighted"/>
                  <RingChart pct={Math.min(aPct,100)} color="#00843D" label="Agents" sublabel="40% wt"/>
                  <RingChart pct={Math.min(mPct,100)} color="#E4007C" label="Merchants" sublabel="20% wt"/>
                  <RingChart pct={Math.min(vPct,100)} color="#7c3aed" label="Visits" sublabel="10% wt"/>
                </div>
                {/* Overall score banner */}
                <div className={`rounded-xl p-3 mb-3 flex items-center justify-between ${band.bg}`}>
                  <div>
                    <p className={`text-2xl font-black ${band.color}`}>{overall}%</p>
                    <p className={`text-xs font-bold ${band.color}`}>{band.label} — National Weighted Score</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{kpis.totalAgents} agents · {kpis.totalMerchants} merchants · {kpis.totalVisits} visits</p>
                  </div>
                  <div className="text-right text-xs text-gray-500 space-y-1">
                    <p>Open Float: <span className={`font-bold ${(kpis.openFloatIssues||0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{kpis.openFloatIssues || 0}</span></p>
                    <p>Conversion: <span className="font-bold text-purple-700">{kpis.conversionRate || 0}%</span></p>
                  </div>
                </div>
                {/* Per-KPI bars */}
                <div className="space-y-3">
                  <PerformanceBar label="Agent Recruitment (40% weight)" icon="👤"
                    count={kpis.totalAgents || 0} target={kpis.nationalTargets?.agents || 1}/>
                  <PerformanceBar label="Merchant Enrollment (20% weight)" icon="🏪"
                    count={kpis.totalMerchants || 0} target={kpis.nationalTargets?.merchants || 1}/>
                  <PerformanceBar label="Outlet Visits (10% weight)" icon="📍"
                    count={kpis.totalVisits || 0} target={kpis.nationalTargets?.visits || 1}/>
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {/* NT Base Inactive vs Reactivated — HSD national view */}
      {dashboard?.ntBase && (
        <Card className="mb-4 border-t-4 border-teal-500 bg-teal-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔄</span>
              <div>
                <p className="text-sm font-bold text-teal-800">Non-Transacting Agent Base — National</p>
                <p className="text-xs text-teal-600">Total inactive agents vs those reactivated this month by TDRs</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-white rounded-xl p-3 text-center border border-teal-100">
              <p className="text-2xl font-black text-red-600">{dashboard.ntBase.totalInactive.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mt-0.5">Total Inactive</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center border border-teal-100">
              <p className="text-2xl font-black text-teal-700">{dashboard.ntBase.totalReactivated.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mt-0.5">Reactivated MTD</p>
            </div>
            <div className="bg-white rounded-xl p-3 text-center border border-teal-100">
              <p className="text-2xl font-black text-gray-500">{dashboard.ntBase.remaining.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mt-0.5">Remaining</p>
            </div>
          </div>
          <div className="h-3 bg-teal-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(dashboard.ntBase.pct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-teal-600 mt-1 text-right font-semibold">
            {dashboard.ntBase.pct}% of inactive base reactivated this month
          </p>
        </Card>
      )}

      {/* Zone Performance Cards — visual performance vs target */}
      {zones.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-zamtel-green" />
            <h3 className="font-bold text-sm text-gray-800">Performance Against Target — All Zones</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedZones.map((z: ZoneStat) => {
              const sc       = zoneScore(z);
              const band     = getBand(sc);
              const aTgt     = z.targets?.agents    ?? prorateMtdTarget(96);
              const mTgt     = z.targets?.merchants ?? prorateMtdTarget(96);
              const vTgt     = z.targets?.visits    ?? visitMtdTarget();
              const aPct     = Math.min(Math.round(z.agents    / Math.max(aTgt, 1) * 100), 100);
              const mPct     = Math.min(Math.round(z.merchants / Math.max(mTgt, 1) * 100), 100);
              const vPct     = Math.min(Math.round(z.visits    / Math.max(vTgt, 1) * 100), 100);
              const callout  = sc < 40   ? { bg: 'bg-red-50    border-red-300',    label: '🔴 Critical — Immediate Action Required',  text: 'text-red-700' }
                             : sc < 60   ? { bg: 'bg-orange-50 border-orange-300', label: '🟠 Below Target — Intervention Needed',     text: 'text-orange-700' }
                             : sc < 80   ? { bg: 'bg-amber-50  border-amber-300',  label: '🟡 Needs Attention — Monitor Closely',      text: 'text-amber-700' }
                             :             { bg: 'bg-green-50  border-green-300',  label: '🟢 On Track',                               text: 'text-green-700' };
              return (
                <div key={z.zone} className={`rounded-2xl border-2 p-4 ${callout.bg}`}>
                  {/* Zone header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-gray-800">{z.zone}</p>
                      <p className="text-xs text-gray-500">{z.zbm} · {z.tdrs} TDRs</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Targets: {aTgt} agents · {mTgt} merchants · {vTgt} visits
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-black ${band.color}`}>{sc}%</span>
                      <p className={`text-[10px] font-bold ${band.color}`}>{band.label}</p>
                    </div>
                  </div>
                  {/* Weighted score bar */}
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Weighted Score</span>
                    </div>
                    <div className="h-3 bg-white/60 rounded-full overflow-hidden border border-white/80 shadow-inner">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${sc}%`, background: band.ring }} />
                    </div>
                    <div className="flex justify-between mt-0.5 text-[9px] text-gray-400">
                      <span>0%</span><span className="text-red-400">40</span><span className="text-amber-400">60</span><span className="text-green-400">80</span><span>100%</span>
                    </div>
                  </div>
                  {/* KPI bars */}
                  <div className="space-y-2 mb-3">
                    <PerformanceBar label="Agents Recruited"   icon="👤" count={z.agents}    target={aTgt} />
                    <PerformanceBar label="Merchants Enrolled" icon="🏪" count={z.merchants} target={mTgt} />
                    <PerformanceBar label="Outlet Visits"      icon="📍" count={z.visits}    target={vTgt} />
                  </div>
                  {/* Callout banner */}
                  <div className={`rounded-xl px-3 py-2 flex items-center gap-2 bg-white/70`}>
                    <p className={`text-xs font-bold ${callout.text}`}>{callout.label}</p>
                  </div>
                  {/* Float issues warning */}
                  {z.floatIssues > 0 && (
                    <div className="mt-2 rounded-xl px-3 py-1.5 bg-red-100 flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-red-600 flex-shrink-0" />
                      <p className="text-xs font-semibold text-red-700">{z.floatIssues} open float issue{z.floatIssues > 1 ? 's' : ''}</p>
                    </div>
                  )}
                  {/* View drill-down */}
                  <button onClick={() => setSelectedZone(z.zone)}
                    className="mt-3 w-full text-xs font-bold text-zamtel-green bg-white/80 rounded-xl py-2 hover:bg-white transition-colors flex items-center justify-center gap-1.5">
                    <Map className="w-3 h-3" /> View Full Zone Dashboard
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Zone Performance Table */}
      <Card className="mb-4 overflow-x-auto">
        <h3 className="font-semibold text-zamtel-dark text-sm mb-3">Zone Performance</h3>
        {loading && zones.length === 0 ? (
          <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left py-2 pr-3 font-medium">Zone</th>
                <th className="text-left py-2 pr-3 font-medium">ZBM</th>
                <th className="text-right py-2 px-2 font-medium cursor-pointer" onClick={() => handleSort('tdrs')}>
                  TDRs <SortIcon col="tdrs" />
                </th>
                <th className="text-right py-2 px-2 font-medium cursor-pointer" onClick={() => handleSort('agents')}>
                  Agents <SortIcon col="agents" />
                </th>
                <th className="text-right py-2 px-2 font-medium cursor-pointer" onClick={() => handleSort('merchants')}>
                  Mrch <SortIcon col="merchants" />
                </th>
                <th className="text-right py-2 px-2 font-medium cursor-pointer" onClick={() => handleSort('visits')}>
                  Visits <SortIcon col="visits" />
                </th>
                <th className="text-right py-2 px-2 font-medium cursor-pointer" onClick={() => handleSort('floatIssues')}>
                  Float <SortIcon col="floatIssues" />
                </th>
                <th className="text-right py-2 px-2 font-medium cursor-pointer" onClick={() => handleSort('pct')}>
                  Raw% <SortIcon col="pct" />
                </th>
                <th className="text-right py-2 pl-2 font-medium cursor-pointer" onClick={() => handleSort('score')}>
                  Score <SortIcon col="score" />
                </th>
                <th className="py-2 pl-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sortedZones.map((z: ZoneStat) => {
                const sc = zoneScore(z);
                const b  = getBand(sc);
                return (
                <tr key={z.zone} className="border-b border-gray-50 hover:bg-zamtel-green/5 transition-colors">
                  <td className="py-2.5 pr-3 font-semibold text-gray-800">{z.zone}</td>
                  <td className="py-2.5 pr-3 text-gray-600 truncate max-w-[70px]">{z.zbm}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700 text-xs">{z.tdrs}</td>
                  <td className="text-right py-2.5 px-2 text-xs">
                    <span className={getBand(Math.min(Math.round(z.agents/prorateMtdTarget(96)*100),100)).color}>{z.agents}</span>
                  </td>
                  <td className="text-right py-2.5 px-2 text-xs">
                    <span className={getBand(Math.min(Math.round(z.merchants/prorateMtdTarget(96)*100),100)).color}>{z.merchants}</span>
                  </td>
                  <td className="text-right py-2.5 px-2 text-xs">
                    <span className={getBand(Math.min(Math.round(z.visits/visitMtdTarget()*100),100)).color}>{z.visits}</span>
                  </td>
                  <td className="text-right py-2.5 px-2 text-xs">
                    {z.floatIssues > 0
                      ? <span className="text-red-600 font-semibold">{z.floatIssues}</span>
                      : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="text-right py-2.5 px-2">
                    <span className={clsx('px-1.5 py-0.5 rounded-full font-semibold text-xs', pctColor(z.pct))}>
                      {z.pct}%
                    </span>
                  </td>
                  <td className="text-right py-2.5 pl-2">
                    <span className={clsx('px-2 py-0.5 rounded-full font-bold text-xs', b.bg, b.color)}>
                      {sc}%
                    </span>
                  </td>
                  <td className="py-2.5 pl-2">
                    <button
                      onClick={() => setSelectedZone(z.zone)}
                      className="text-xs text-zamtel-green font-semibold hover:underline whitespace-nowrap flex items-center gap-0.5"
                      title={`Open full ZBM dashboard for ${z.zone}`}
                    >
                      <Map className="w-3 h-3" /> View
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* 🏆 Leaderboard Banner */}
      <button
        onClick={() => navigate('/leaderboard')}
        className="w-full mb-4 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-md shadow-yellow-100 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div className="text-left">
            <p className="text-sm font-bold text-yellow-900">Sales Leaderboard</p>
            <p className="text-xs text-yellow-800 opacity-80">Top 30 TDRs · Zone Rankings</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-yellow-600/20 rounded-xl px-3 py-1.5">
          <span className="text-xs font-bold text-yellow-900">View</span>
          <span className="text-yellow-900">→</span>
        </div>
      </button>

      {/* GPS Field Map */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm" style={{ color: '#00843D' }}>📍 Agent & Merchant Geofencing Map</h3>
          <button
            onClick={() => setShowMap(m => !m)}
            className="text-xs px-3 py-1 rounded-lg font-semibold border transition"
            style={{ borderColor: '#00843D', color: '#00843D' }}
          >{showMap ? 'Hide Map' : 'Show Map'}</button>
        </div>
        {showMap && (
          <GeoMap
            agents={mapData.agents}
            visits={mapData.visits}
            height="480px"
            showVisits={true}
          />
        )}
      </Card>

      {/* Critical Float Alerts */}
      {dashboard && dashboard.criticalAlerts.length > 0 && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="font-semibold text-red-800 text-sm">
              Critical Float Alerts ({dashboard.criticalAlerts.length} — pending &gt;48hrs)
            </h3>
          </div>
          <div className="space-y-2">
            {dashboard.criticalAlerts.slice(0, 5).map((issue: FloatIssue) => (
              <div key={issue.id} className="bg-white rounded-xl p-3 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">{issue.agentName} ({issue.agentCode})</p>
                  <p className="text-xs text-red-600">{issue.zone} · {issue.tdrName}</p>
                  <p className="text-xs text-gray-600 mt-1">{ISSUE_TYPE_LABELS[issue.issueType]}: {issue.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {differenceInHours(new Date(), new Date(issue.reportedAt))}hrs ago · ZMW {issue.reportedFloat.toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  loading={resolving === issue.id}
                  onClick={() => handleResolveAlert(issue.id)}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Prospects Funnel */}
      {dashboard && dashboard.prospectsBreakdown.length > 0 && (
        <Card className="mb-4">
          <h3 className="font-semibold text-zamtel-dark text-sm mb-3">National Prospects Funnel</h3>
          <div className="flex flex-wrap gap-2">
            {['identified', 'contacted', 'interested', 'converted', 'rejected'].map(status => {
              const item = dashboard.prospectsBreakdown.find(p => p.status === status);
              return (
                <div key={status} className="flex-1 min-w-[80px] text-center bg-gray-50 rounded-xl px-3 py-3">
                  <p className="text-2xl font-bold text-gray-800">{item?._count || 0}</p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">{status}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      </>)}

      {/* ── ASE & Devices Tab ── */}
      {mainTab === 'ase' && (
        <div className="px-4 pb-24 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">National ASE performance & KYC device activity</p>
            <button onClick={loadAsePerf} className="flex items-center gap-1 text-xs text-green-700 font-semibold">
              <RefreshCw size={11}/> Refresh
            </button>
          </div>

          {asePerfLoad ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
          ) : !asePerf ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
              <Smartphone size={32} className="mx-auto mb-2 opacity-30"/>
              <p className="text-sm">No data yet</p>
              <button onClick={loadAsePerf} className="mt-3 text-sm text-green-700 font-bold underline underline-offset-2">Load ASE Performance</button>
            </div>
          ) : (<>
            {/* Summary ring charts */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm font-bold text-gray-700 mb-4">KYC Device Summary — National</p>
              <div className="grid grid-cols-3 gap-4 justify-items-center mb-4">
                <RingChart
                  pct={Math.round(asePerf.summary?.activityPct || 0)}
                  size={100} stroke={11} color="#00843D"
                  label="Device Activity" sublabel={`${asePerf.summary?.activeDevices?.toLocaleString()} active`}
                />
                <RingChart
                  pct={asePerf.summary?.avgScore || 0}
                  size={100} stroke={11} color="#E4007C"
                  label="Avg ASE Score" sublabel={`${asePerf.summary?.totalASEs} ASEs`}
                />
                <RingChart
                  pct={asePerf.summary?.totalDevices > 0
                    ? Math.round((asePerf.summary?.totalKycReg||0)/(asePerf.summary?.totalDevices||1)*100)
                    : 0}
                  size={100} stroke={11} color="#7c3aed"
                  label="KYC Rate" sublabel={`${asePerf.summary?.totalKycReg?.toLocaleString()} KYC`}
                />
              </div>
              {/* Stat row */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ['Total Devices', asePerf.summary?.totalDevices?.toLocaleString(), 'text-blue-600'],
                  ['Active',        asePerf.summary?.activeDevices?.toLocaleString(), 'text-green-600'],
                  ['Inactive',      asePerf.summary?.inactiveDevices?.toLocaleString(), 'text-red-500'],
                  ['Gross Adds',    asePerf.summary?.totalGA?.toLocaleString(), 'text-amber-600'],
                ].map(([l,v,c])=>(
                  <div key={l as string} className="bg-gray-50 rounded-xl p-2">
                    <p className={`text-lg font-black ${c}`}>{v}</p>
                    <p className="text-[9px] text-gray-500">{l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Zone device breakdown */}
            {asePerf.byZone?.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-700">Device Activity by Zone</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {asePerf.byZone.map((z: any) => (
                    <div key={z.zone} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800">{z.zone}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500">{z.active}/{z.total}</span>
                          <span className={`text-sm font-black ${
                            z.pct >= 70 ? 'text-green-600' : z.pct >= 40 ? 'text-amber-500' : 'text-red-500'
                          }`}>{z.pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{width:`${z.pct}%`, background: z.pct>=70?'#00843D':z.pct>=40?'#f59e0b':'#ef4444'}}/>
                      </div>
                      <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                        <span>KYC: <b className="text-purple-600">{z.kyc.toLocaleString()}</b></span>
                        <span>GA: <b className="text-amber-600">{z.ga.toLocaleString()}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ASE Performance table */}
            {asePerf.ases?.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-700">ASE Performance Ranking ({asePerf.ases.length})</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Sorted by KPI score — KYC Device 36% · Supervision 32% · SIM Outlet 23% · Own Device 9%</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {asePerf.ases.map((ase: any, idx: number) => (
                    <div key={ase.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                            idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                            idx === 1 ? 'bg-gray-200 text-gray-600' :
                            idx === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>{idx+1}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{ase.name}</p>
                            <p className="text-[10px] text-gray-500">{ase.zone} · {ase.tdrCount} TDRs</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-lg font-black ${
                            ase.finalScore >= 70 ? 'text-green-600' : ase.finalScore >= 40 ? 'text-amber-500' : 'text-red-500'
                          }`}>{ase.finalScore}%</p>
                          <p className="text-[10px] text-gray-400">KPI Score</p>
                        </div>
                      </div>
                      {/* Sub-scores */}
                      <div className="grid grid-cols-4 gap-1 mt-2 text-center">
                        <div className="bg-green-50 rounded-lg py-1">
                          <p className="text-xs font-bold text-green-700">{ase.kycDeviceScore}%</p>
                          <p className="text-[8px] text-gray-400">KYC Dev</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg py-1">
                          <p className="text-xs font-bold text-blue-700">{ase.supervisionScore}%</p>
                          <p className="text-[8px] text-gray-400">Supervision</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg py-1">
                          <p className="text-xs font-bold text-gray-700">{ase.devices.total}</p>
                          <p className="text-[8px] text-gray-400">Devices</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg py-1">
                          <p className="text-xs font-bold text-purple-700">{ase.devices.active}</p>
                          <p className="text-[8px] text-gray-400">Active</p>
                        </div>
                      </div>
                      {/* Mini device activity bar */}
                      {ase.devices.total > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-green-500 transition-all"
                              style={{width:`${ase.devices.activityPct}%`}}/>
                          </div>
                          <p className="text-[9px] text-gray-400 mt-0.5">{ase.devices.activityPct}% device activity · {ase.devices.kycReg} KYC · {ase.devices.grossAdds} GA</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}
        </div>
      )}
    </Layout>
  );
};
