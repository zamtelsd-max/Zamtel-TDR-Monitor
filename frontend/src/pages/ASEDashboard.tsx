import React, { useEffect, useState, useCallback } from 'react';
import { Users, Eye, AlertTriangle, X, RefreshCw, ChevronDown, ChevronUp, Link2, TrendingUp, Smartphone, Map } from 'lucide-react';
import { GeoMap } from '../components/GeoMap';
import toast from 'react-hot-toast';
import { aseApi, flagsApi } from '../services/api';
import { TDRPerfCard, PerformanceBar } from '../components/PerformanceBar';
import { calcWeightedScore, floatResolutionPct, visitMtdTarget, prorateMtdTarget, workingDaysElapsed, workingDaysThisMonth, getBand } from '../utils/performance';
import type { TDRFlag } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge } from '../components/UI';
import { useAppSelector } from '../hooks/useAppDispatch';

interface TDRStat {
  tdr:           { id: string; name: string; zone: string | null };
  agents:        number;
  visits:        number;
  floatIssues:   number;
  prospects:     number;
  reactivations: number;
  kpiScore?:     number;
}

interface KycDevice {
  id: string;
  dealerCode: string | null;
  description: string | null;
  imei1: string | null;
  msisdn: string | null;
  region: string | null;
  zone: string | null;
  aseName: string | null;
  teamLead: string | null;
  status: string;
  activityStatus: number;
  kycReg: number;
  grossAdds: number;
  zamoGA: number;
  recharges: number;
  deviceSource: string;
}

interface AvailableTDR {
  id: string; name: string; zone: string | null; aseId: string | null; mine: boolean;
}

interface DashboardData {
  ase: { id: string; name: string; zone: string | null };
  kycDevices: {
    total: number; active: number; inactive: number; kycScore: number;
    bySource: { mobiGo: number; a100c: number };
    totalKyc: number; totalGa: number;
  };
  tdrStats: TDRStat[];
  team: {
    totals: { agents: number; merchants: number; visits: number; reactivations: number };
    targets: { agents: number; merchants: number; visits: number; reactivations: number };
  };
  aseKpiScore: {
    kycDeviceScore: number; simOutletScore: number; ownDeviceScore: number;
    supervisionScore: number; finalScore: number;
  };
  mtd: { workingDaysElapsed: number; workingDaysTotal: number };
}

export const ASEDashboardPage: React.FC = () => {
  const user = useAppSelector(s => s.auth.user);

  // ── ALL hooks must be declared before any early returns ──
  const [tab, setTab]                   = useState<'my-tdrs' | 'kyc-devices' | 'kpi-score' | 'pick-tdrs' | 'map'>('my-tdrs');
  const [mapData, setMapData]           = useState<{ agents: any[]; visits: any[] }>({ agents: [], visits: [] });
  const [mapLoading, setMapLoading]     = useState(false);
  const [dashData, setDashData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState<string | null>(null);
  const [tdrData, setTdrData]           = useState<any>(null);
  const [tdrLoading, setTdrLoading]     = useState(false);
  const [flags, setFlags]               = useState<TDRFlag[]>([]);
  const [flagsOpen, setFlagsOpen]       = useState(true);
  const [available, setAvailable]       = useState<AvailableTDR[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [picking, setPicking]           = useState<string | null>(null);
  const [devices, setDevices]           = useState<KycDevice[]>([]);
  const [devTotal, setDevTotal]         = useState(0);
  const [devActive, setDevActive]       = useState(0);
  const [devPage, setDevPage]           = useState(1);
  const [devLoading, setDevLoading]     = useState(false);
  const [devSource, setDevSource]       = useState<string>('all');
  const [devStatus, setDevStatus]       = useState<string>('all');

  const stats = dashData?.tdrStats ?? [];

  const loadDashboard = () => {
    setLoading(true);
    aseApi.dashboard()
      .then(r => setDashData(r.data as DashboardData))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  };

  const loadDevices = (page = 1, source = devSource, status = devStatus) => {
    setDevLoading(true);
    const params: Record<string, unknown> = { page, limit: 50 };
    if (source !== 'all') params.source = source;
    if (status !== 'all') params.status = status;
    aseApi.devices(params as any)
      .then(r => {
        setDevices(r.data.data ?? []);
        setDevTotal(r.data.total ?? 0);
        setDevActive(r.data.active ?? 0);
        setDevPage(page);
      })
      .catch(() => toast.error('Failed to load devices'))
      .finally(() => setDevLoading(false));
  };

  useEffect(() => {
    loadDashboard();
    flagsApi.get()
      .then(r => setFlags(r.data.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'kyc-devices') loadDevices(1, devSource, devStatus);
  }, [tab]);

  const loadAvailable = () => {
    setAvailLoading(true);
    aseApi.availableTDRs()
      .then(r => setAvailable(r.data.data ?? []))
      .catch(() => toast.error('Failed to load available TDRs'))
      .finally(() => setAvailLoading(false));
  };

  useEffect(() => {
    if (tab === 'pick-tdrs') loadAvailable();
  }, [tab]);

  const loadMap = useCallback(() => {
    setMapLoading(true);
    aseApi.getMap()
      .then(r => setMapData(r.data.data || { agents: [], visits: [] }))
      .catch(() => toast.error('Failed to load map'))
      .finally(() => setMapLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'map') loadMap();
  }, [tab, loadMap]);

  const pickTDR = async (tdrId: string) => {
    setPicking(tdrId);
    try {
      await aseApi.pickTDR(tdrId);
      toast.success('TDR assigned to you!');
      loadAvailable();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to pick TDR');
    } finally {
      setPicking(null);
    }
  };

  const releaseTDR = async (tdrId: string) => {
    try {
      await aseApi.releaseTDR(tdrId);
      toast.success('TDR released');
      loadAvailable();
      loadDashboard();
    } catch {
      toast.error('Failed to release TDR');
    }
  };

  const viewTDR = async (id: string) => {
    setSelected(id);
    setTdrLoading(true);
    try {
      const r = await aseApi.getTDR(id);
      setTdrData(r.data);
    } catch {
      toast.error('Failed to load TDR data');
    } finally {
      setTdrLoading(false);
    }
  };

  const criticalCount = flags.filter(f => f.severity === 'critical').length;
  const kyc = dashData?.kycDevices;
  const kpiScore = dashData?.aseKpiScore;

  const scoreColor = (s: number) =>
    s >= 70 ? 'text-green-600' : s >= 40 ? 'text-amber-500' : 'text-red-600';
  const scoreBg = (s: number) =>
    s >= 70 ? 'bg-green-50 border-green-200' : s >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  const TABS = [
    { id: 'my-tdrs',     label: `👥 TDRs (${stats.length})` },
    { id: 'kyc-devices', label: `📱 KYC Devices` },
    { id: 'kpi-score',   label: `🎯 KPI Score` },
    { id: 'pick-tdrs',   label: `➕ Pick TDRs` },
    { id: 'map',         label: `🗺️ Field Map` },
  ] as const;

  return (
    <Layout title="ASE Dashboard">
      <PageHeader title={`${user?.name ?? 'ASE'}`} subtitle="Area Sales Executive Dashboard" />

      {/* Hero stat cards */}
      {loading ? (
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-5 gap-2 mb-1">
            {/* Total Devices */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2.5 text-center">
              <p className="text-xl font-black" style={{ color: '#00843D' }}>{kyc?.total ?? 0}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Devices</p>
            </div>
            {/* Active Devices */}
            <div className="bg-green-50 rounded-2xl shadow-sm border border-green-100 p-2.5 text-center">
              <p className="text-xl font-black text-green-600">{kyc?.active ?? 0}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Active</p>
            </div>
            {/* Inactive Devices */}
            <div className="bg-red-50 rounded-2xl shadow-sm border border-red-100 p-2.5 text-center">
              <p className="text-xl font-black text-red-500">{kyc?.inactive ?? 0}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Inactive</p>
            </div>
            {/* TDRs */}
            <div className="bg-purple-50 rounded-2xl shadow-sm border border-purple-100 p-2.5 text-center">
              <p className="text-xl font-black text-purple-600">{stats.length}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">TDRs</p>
            </div>
            {/* KPI Score */}
            <div className={`rounded-2xl shadow-sm border p-2.5 text-center ${scoreBg(kpiScore?.finalScore ?? 0)}`}>
              <p className={`text-xl font-black ${scoreColor(kpiScore?.finalScore ?? 0)}`}>
                {kpiScore?.finalScore ?? 0}%
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">KPI</p>
            </div>
          </div>
          {/* KYC activation bar */}
          {kyc && kyc.total > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                <span>Device Activation</span>
                <span className="font-semibold">{kyc.kycScore}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${kyc.kycScore}%`,
                    background: kyc.kycScore >= 70 ? '#00843D' : kyc.kycScore >= 40 ? '#f59e0b' : '#ef4444'
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
              tab === t.id ? 'text-white shadow' : 'bg-white text-gray-500 border border-gray-200'
            }`}
            style={tab === t.id ? { background: '#00843D' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MY TDRs TAB ── */}
      {tab === 'my-tdrs' && (
        <div className="px-4 py-2">
          {/* Red flags panel */}
          {flags.length > 0 && (
            <div className={`rounded-2xl border-2 mb-4 overflow-hidden ${criticalCount > 0 ? 'border-red-400 bg-red-50' : 'border-amber-400 bg-amber-50'}`}>
              <button className="w-full flex items-center justify-between px-4 py-3"
                onClick={() => setFlagsOpen(!flagsOpen)}>
                <span className="flex items-center gap-2 font-bold text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  {criticalCount > 0 ? `🔴 ${criticalCount} TDRs critically behind` : `⚠ ${flags.length} TDRs flagged`}
                </span>
                {flagsOpen ? <ChevronUp className="w-4 h-4 text-red-500" /> : <ChevronDown className="w-4 h-4 text-red-500" />}
              </button>
              {flagsOpen && (
                <div className="px-4 pb-3 space-y-2">
                  {flags.map(f => (
                    <div key={f.tdrId} className={`rounded-xl p-3 ${f.severity === 'critical' ? 'bg-red-100' : 'bg-amber-100'}`}>
                      <p className="font-bold text-sm text-gray-800">{f.tdrName} <span className="text-xs text-gray-500">({f.zone})</span></p>
                      {f.flags.map((fl, i) => <p key={i} className="text-xs text-gray-700 mt-0.5">{fl}</p>)}
                      <div className="grid grid-cols-3 gap-1 mt-2 text-center text-xs">
                        <div className="bg-white/70 rounded-lg py-1">
                          <span className="font-bold text-gray-700">{f.mtd.agents}/{f.mtd.agentTarget}</span>
                          <p className="text-gray-500">Agents MTD</p>
                        </div>
                        <div className="bg-white/70 rounded-lg py-1">
                          <span className="font-bold text-gray-700">{f.mtd.merchants}/{f.mtd.merchantTarget}</span>
                          <p className="text-gray-500">Merchants</p>
                        </div>
                        <div className="bg-white/70 rounded-lg py-1">
                          <span className="font-bold text-gray-700">{f.mtd.visits}/{f.mtd.visitTarget}</span>
                          <p className="text-gray-500">Visits</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MTD progress */}
          {dashData?.mtd && (() => {
            const el = dashData.mtd.workingDaysElapsed; const tot = dashData.mtd.workingDaysTotal;
            const pct = Math.round(el/tot*100);
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">📅 Working day <strong>{el}</strong> of <strong>{tot}</strong></span>
                  <span className="text-xs font-semibold text-gray-600">{pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div className="h-1.5 rounded-full bg-gray-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* Team performance summary */}
          {dashData?.team && stats.length > 0 && (() => {
            const team = dashData.team;
            const aTgt = team.targets.agents || 1;
            const vTgt = team.targets.visits || 1;
            const rTgt = team.targets.reactivations || 1;
            const aPct = Math.min(Math.round(team.totals.agents / aTgt * 100), 100);
            const vPct = Math.min(Math.round(team.totals.visits / vTgt * 100), 100);
            const rPct = Math.min(Math.round(team.totals.reactivations / rTgt * 100), 100);
            const sc = Math.round((aPct * 0.4 + vPct * 0.1 + rPct * 0.15) / 0.65);
            const band = getBand(sc);
            return (
              <div className={`rounded-2xl border-2 p-4 mb-4 ${band.bg}`} style={{ borderColor: band.ring }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-800">Team Performance</p>
                    <p className="text-xs text-gray-500">{stats.length} TDRs assigned</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-3xl font-black ${band.color}`}>{sc}%</span>
                    <p className={`text-[10px] font-bold ${band.color}`}>{band.label}</p>
                  </div>
                </div>
                <div className="space-y-2.5 mb-3">
                  <PerformanceBar icon="👤" label={`Agent Recruitment`} count={team.totals.agents} target={aTgt} />
                  <PerformanceBar icon="📍" label={`Outlet Visits`} count={team.totals.visits} target={vTgt} />
                  <PerformanceBar icon="🔄" label={`Reactivations`} count={team.totals.reactivations} target={rTgt} />
                </div>
              </div>
            );
          })()}

          {/* TDR list */}
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
          ) : stats.length === 0 ? (
            <Card className="text-center py-8 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No TDRs assigned yet.</p>
              <button onClick={() => setTab('pick-tdrs')} className="mt-3 text-white text-xs font-bold px-4 py-2 rounded-xl" style={{ background: '#00843D' }}>
                Pick TDRs →
              </button>
            </Card>
          ) : (
            <div className="space-y-3 mb-24">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4" style={{ color: '#00843D' }} />
                <h3 className="font-bold text-sm text-gray-800">TDR Performance Against Target</h3>
              </div>
              {stats.map(({ tdr, agents, visits, floatIssues, reactivations, kpiScore: tdrKpi }) => {
                const tdrFlag = flags.find(f => f.tdrId === tdr.id);
                const aTgt = prorateMtdTarget(96);
                const mTgt = prorateMtdTarget(96);
                const vTgt = visitMtdTarget();
                const rTgt = 6 * workingDaysElapsed();
                const sc = tdrKpi ?? calcWeightedScore({
                  agentPct:        Math.min(Math.round(agents / Math.max(aTgt, 1) * 100), 100),
                  merchantPct:     0,
                  floatPct:        floatIssues === 0 ? 100 : Math.max(0, 100 - floatIssues * 10),
                  reactivationPct: Math.min(Math.round(reactivations / Math.max(rTgt, 1) * 100), 100),
                  visitPct:        Math.min(Math.round(visits / Math.max(vTgt, 1) * 100), 100),
                });
                return (
                  <TDRPerfCard
                    key={tdr.id}
                    name={tdr.name}
                    zone={tdr.zone}
                    agents={agents}
                    merchants={0}
                    visits={visits}
                    floatIssues={floatIssues}
                    reactivations={reactivations}
                    reactivationTarget={rTgt}
                    score={sc}
                    agentTarget={aTgt}
                    merchantTarget={mTgt}
                    visitTarget={vTgt}
                    flagSeverity={tdrFlag?.severity === 'critical' ? 'critical' : tdrFlag ? 'warning' : null}
                    onClick={() => viewTDR(tdr.id)}
                    actionSlot={
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); releaseTDR(tdr.id); }}
                          className="text-xs text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Release TDR">
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => viewTDR(tdr.id)}
                          className="flex items-center gap-1 text-xs font-semibold bg-green-50 px-2.5 py-1 rounded-xl"
                          style={{ color: '#00843D' }}>
                          <Eye className="w-3 h-3" /> View
                        </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── KYC DEVICES TAB ── */}
      {tab === 'kyc-devices' && (
        <div className="px-4 py-2">
          {/* Source breakdown */}
          {kyc && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone className="w-4 h-4" style={{ color: '#00843D' }} />
                  <span className="text-xs font-semibold text-gray-600">MobiGO2+</span>
                </div>
                <p className="text-2xl font-black" style={{ color: '#00843D' }}>{kyc.bySource.mobiGo}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone className="w-4 h-4" style={{ color: '#E4007C' }} />
                  <span className="text-xs font-semibold text-gray-600">ITEL A100C</span>
                </div>
                <p className="text-2xl font-black" style={{ color: '#E4007C' }}>{kyc.bySource.a100c}</p>
              </div>
            </div>
          )}

          {/* KYC performance bar */}
          {kyc && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-bold text-gray-700">Activation Rate</p>
                <span className={`text-lg font-black ${scoreColor(kyc.kycScore)}`}>{kyc.kycScore}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${kyc.kycScore}%`,
                    background: kyc.kycScore >= 70 ? '#00843D' : kyc.kycScore >= 40 ? '#f59e0b' : '#ef4444'
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>{kyc.active} active</span>
                <span>{kyc.inactive} inactive</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-center text-xs">
                <div className="bg-gray-50 rounded-xl py-2">
                  <p className="font-bold text-gray-800">{kyc.totalKyc}</p>
                  <p className="text-gray-400">KYC Registered</p>
                </div>
                <div className="bg-gray-50 rounded-xl py-2">
                  <p className="font-bold text-gray-800">{kyc.totalGa}</p>
                  <p className="text-gray-400">Gross Adds</p>
                </div>
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <select value={devSource} onChange={e => { setDevSource(e.target.value); loadDevices(1, e.target.value, devStatus); }}
              className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="all">All Sources</option>
              <option value="MobiGO2+">MobiGO2+</option>
              <option value="A100C">A100C</option>
            </select>
            <select value={devStatus} onChange={e => { setDevStatus(e.target.value); loadDevices(1, devSource, e.target.value); }}
              className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button onClick={() => loadDevices(devPage, devSource, devStatus)} className="p-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50">
              <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <span className="ml-auto text-xs text-gray-400 self-center">{devTotal} devices</span>
          </div>

          {/* Device table */}
          {devLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : devices.length === 0 ? (
            <Card className="text-center py-8 text-gray-400">
              <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No devices found.</p>
            </Card>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {devices.map(d => (
                  <div key={d.id} className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${d.activityStatus === 1 ? 'border-green-100' : 'border-red-100'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800 truncate">{d.description || d.dealerCode || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{d.dealerCode} · {d.msisdn || '—'}</p>
                        <p className="text-xs text-gray-400">{d.region || '—'} · {d.deviceSource}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${d.activityStatus === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {d.activityStatus === 1 ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-[10px] text-gray-400">KYC: {d.kycReg} | GA: {d.grossAdds}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mb-24">
                <button onClick={() => loadDevices(devPage - 1, devSource, devStatus)} disabled={devPage <= 1}
                  className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 bg-white disabled:opacity-40">
                  ← Prev
                </button>
                <span className="text-xs text-gray-500">Page {devPage} · {devTotal} total</span>
                <button onClick={() => loadDevices(devPage + 1, devSource, devStatus)} disabled={devPage * 50 >= devTotal}
                  className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 bg-white disabled:opacity-40">
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── KPI SCORE TAB ── */}
      {tab === 'kpi-score' && (
        <div className="px-4 py-2 pb-24">
          {!kpiScore ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <>
              {/* Final score banner */}
              <div className={`rounded-2xl border-2 p-5 mb-4 text-center ${scoreBg(kpiScore.finalScore)}`}>
                <p className="text-xs font-semibold text-gray-500 mb-1">ASE KPI Score</p>
                <p className={`text-5xl font-black mb-1 ${scoreColor(kpiScore.finalScore)}`}>{kpiScore.finalScore}%</p>
                <p className={`text-xs font-bold ${scoreColor(kpiScore.finalScore)}`}>
                  {kpiScore.finalScore >= 70 ? '🟢 On Track' : kpiScore.finalScore >= 40 ? '🟡 Needs Attention' : '🔴 Critical'}
                </p>
                {/* Score bar */}
                <div className="mt-3 h-3 bg-white/60 rounded-full overflow-hidden border border-white/80">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${kpiScore.finalScore}%`,
                      background: kpiScore.finalScore >= 70 ? '#00843D' : kpiScore.finalScore >= 40 ? '#f59e0b' : '#ef4444'
                    }} />
                </div>
              </div>

              {/* Score breakdown */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="font-bold text-sm text-gray-700">Score Breakdown</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    { label: 'Device Activation (KYC)', score: kpiScore.kycDeviceScore, weight: '36.36%', icon: '📱' },
                    { label: 'Sim Outlet (Agent Recr.)', score: kpiScore.simOutletScore, weight: '22.73%', icon: '👤' },
                    { label: 'Own Device (Merchant)', score: kpiScore.ownDeviceScore, weight: '9.09%', icon: '🏪' },
                    { label: 'TDR Supervision', score: kpiScore.supervisionScore, weight: '31.82%', icon: '👥' },
                  ].map(row => (
                    <div key={row.label} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span>{row.icon}</span>
                          <div>
                            <p className="text-xs font-semibold text-gray-700">{row.label}</p>
                            <p className="text-[10px] text-gray-400">Weight: {row.weight}</p>
                          </div>
                        </div>
                        <span className={`text-sm font-black ${scoreColor(row.score)}`}>{row.score}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${row.score}%`,
                            background: row.score >= 70 ? '#00843D' : row.score >= 40 ? '#f59e0b' : '#ef4444'
                          }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* KYC device detail in KPI context */}
              {kyc && (
                <Card className="mb-4">
                  <p className="font-bold text-sm text-gray-700 mb-3">Device Portfolio</p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-gray-50 rounded-xl py-2">
                      <p className="text-xl font-black" style={{ color: '#00843D' }}>{kyc.total}</p>
                      <p className="text-xs text-gray-400">Total Devices</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl py-2">
                      <p className="text-xl font-black text-green-600">{kyc.active}</p>
                      <p className="text-xs text-gray-400">Active</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl py-2">
                      <p className="text-xl font-black" style={{ color: '#00843D' }}>{kyc.totalKyc}</p>
                      <p className="text-xs text-gray-400">KYC Regs</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl py-2">
                      <p className="text-xl font-black" style={{ color: '#E4007C' }}>{kyc.totalGa}</p>
                      <p className="text-xs text-gray-400">Gross Adds</p>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PICK TDRs TAB ── */}
      {tab === 'pick-tdrs' && (
        <div className="px-4 py-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-700">Available TDRs in your zone</p>
            <button onClick={loadAvailable} className="p-2 rounded-xl hover:bg-gray-100">
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          {availLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : available.length === 0 ? (
            <Card className="text-center py-8 text-gray-400">
              <p className="text-sm">No available TDRs in your zone.</p>
              <p className="text-xs mt-1">All TDRs are already assigned or none exist.</p>
            </Card>
          ) : (
            <div className="space-y-2 mb-24">
              {available.map(tdr => (
                <div key={tdr.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${tdr.mine ? 'border-green-300' : 'border-gray-100'}`}
                  style={tdr.mine ? { borderColor: '#00843D' } : {}}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 flex items-center gap-2">
                        {tdr.name}
                        {tdr.mine && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#e6f4ec', color: '#00843D' }}>Mine</span>}
                      </p>
                      <p className="text-xs text-gray-500">{tdr.zone || 'No zone'} · ID: {tdr.id}</p>
                    </div>
                    {tdr.mine ? (
                      <button onClick={() => releaseTDR(tdr.id)}
                        className="text-xs bg-red-50 text-red-600 font-bold px-3 py-1.5 rounded-xl hover:bg-red-100 transition-colors">
                        Release
                      </button>
                    ) : (
                      <button onClick={() => pickTDR(tdr.id)} disabled={picking === tdr.id}
                        className="text-xs text-white font-bold px-3 py-1.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors"
                        style={{ background: '#00843D' }}>
                        {picking === tdr.id ? '...' : 'Pick'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TDR Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end"
          onClick={() => { setSelected(null); setTdrData(null); }}>
          <div className="bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto p-4"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            {tdrLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : tdrData ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">{tdrData.tdr.name}</h3>
                    <p className="text-sm text-gray-500">{tdrData.tdr.zone || 'No zone'}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-xl">
                    <Link2 className="w-3 h-3" />
                    <span>ID: {tdrData.tdr.id}</span>
                  </div>
                </div>
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Recent Agents ({tdrData.agents.length})</h4>
                <div className="space-y-1 mb-4">
                  {tdrData.agents.slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-sm text-gray-800">{a.agentName}</p>
                      <Badge color={a.type === 'merchant' ? 'bg-pink-100 text-pink-700' : 'bg-green-100 text-green-700'}>{a.type}</Badge>
                    </div>
                  ))}
                  {tdrData.agents.length === 0 && <p className="text-xs text-gray-400">No agents yet</p>}
                </div>
                {tdrData.floatIssues.filter((f: any) => f.status !== 'resolved').length > 0 && (
                  <>
                    <h4 className="font-semibold text-sm text-red-700 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Open Float Issues
                    </h4>
                    <div className="space-y-1 mb-4">
                      {tdrData.floatIssues.filter((f: any) => f.status !== 'resolved').map((f: any) => (
                        <div key={f.id} className="bg-red-50 rounded-lg px-3 py-2">
                          <p className="text-sm text-gray-800">{f.agentName} — {f.issueType.replace('_', ' ')}</p>
                          <p className="text-xs text-gray-500">{f.status}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
      {/* ── Map Tab ── */}
      {tab === 'map' && (
        <div className="px-4 pb-24">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-gray-700">Field Map — {user?.zone || 'Your Zone'}</p>
              <p className="text-xs text-gray-400">All agents & outlets registered in your zone</p>
            </div>
            <button onClick={loadMap} disabled={mapLoading}
              className="flex items-center gap-1.5 text-xs text-green-700 font-semibold hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors">
              <RefreshCw size={12} className={mapLoading ? 'animate-spin' : ''}/>
              Refresh
            </button>
          </div>
          {mapLoading ? (
            <div className="h-[420px] bg-gray-100 rounded-2xl animate-pulse flex items-center justify-center">
              <p className="text-gray-400 text-sm">Loading map...</p>
            </div>
          ) : mapData.agents.length === 0 && mapData.visits.length === 0 ? (
            <div className="h-[420px] bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center text-gray-400">
              <Map size={40} className="mb-3 opacity-30"/>
              <p className="text-sm font-semibold">No GPS data yet</p>
              <p className="text-xs mt-1">Agents with GPS coordinates will appear here</p>
            </div>
          ) : (
            <GeoMap
              agents={mapData.agents}
              visits={mapData.visits}
              height="480px"
              showVisits={true}
            />
          )}
        </div>
      )}
    </Layout>
  );
};
