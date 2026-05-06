import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Download, ChevronDown, ChevronUp, AlertTriangle, Trophy, ArrowLeft, Map } from 'lucide-react';
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

type SortKey = 'agents' | 'merchants' | 'visits' | 'floatIssues' | 'pct' | 'tdrs' | 'score';
type SortDir = 'asc' | 'desc';

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
  const [mainTab,   setMainTab]   = useState<'dashboard' | 'flags'>('dashboard');
  const [tdrFlags,  setTdrFlags]  = useState<TDRFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsOpen, setFlagsOpen] = useState<Record<string, boolean>>({});
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

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

  useEffect(() => {
    if (mainTab === 'flags') loadFlags();
  }, [mainTab]);

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

      {/* Main Tab Bar */}
      <div className="flex gap-2 px-4 pb-3">
        {(['dashboard', 'flags'] as const).map(t => (
          <button key={t} onClick={() => setMainTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
              mainTab === t ? 'bg-zamtel-green text-white shadow' : 'bg-white text-gray-500 border border-gray-200'
            }`}>
            {t === 'dashboard' ? '📊 Dashboard' : `🚩 Red Flags${tdrFlags.length > 0 ? ` (${tdrFlags.length})` : ''}`}
          </button>
        ))}
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

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {loading && !dashboard ? (
          [0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : (
          <>
            <StatCard label="Agents Recruited"  value={dashboard?.kpis.totalAgents    || 0} color="text-zamtel-pink"  loading={loading && !dashboard} />
            <StatCard label="Merchants"          value={dashboard?.kpis.totalMerchants || 0} color="text-blue-600"   loading={loading && !dashboard} />
            <StatCard label="Outlet Visits"      value={dashboard?.kpis.totalVisits    || 0} color="text-green-700"  loading={loading && !dashboard} />
            <StatCard label="Open Float Issues"  value={dashboard?.kpis.openFloatIssues || 0} color="text-amber-600" loading={loading && !dashboard} />
            <StatCard label="Conversion Rate"    value={`${dashboard?.kpis.conversionRate || 0}%`} color="text-purple-700" loading={loading && !dashboard} />
          </>
        )}
      </div>

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

      {/* Critical Alerts */}
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
    </Layout>
  );
};
