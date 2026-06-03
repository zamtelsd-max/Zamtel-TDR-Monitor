import React, { useEffect, useState, useCallback } from 'react';
import { Users, Eye, AlertTriangle, X, RefreshCw, ChevronDown, ChevronUp, Link2, TrendingUp, Smartphone, Map, Store, MapPin } from 'lucide-react';
import { GeoMap } from '../components/GeoMap';
import toast from 'react-hot-toast';
import { aseApi, flagsApi, ssoOdrApi } from '../services/api';
import { TDRPerfCard, PerformanceBar } from '../components/PerformanceBar';
import { calcWeightedScore, floatResolutionPct, visitMtdTarget, prorateMtdTarget, prospectStretchTarget, workingDaysElapsed, workingDaysThisMonth, getBand } from '../utils/performance';
import type { TDRFlag } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge } from '../components/UI';
import { useAppSelector } from '../hooks/useAppDispatch';
import { OutletForm } from '../components/OutletForm';

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
  const [tab, setTab]                   = useState<'my-tdrs' | 'kyc-devices' | 'kpi-score' | 'sso-odr' | 'pick-tdrs' | 'map' | 'site-focus'>('my-tdrs');
  const [ssoTab, setSsoTab]             = useState<'SSO' | 'ODR' | null>(null);
  const [ssoData, setSsoData]           = useState<{ sso: any[]; odr: any[] }>({ sso: [], odr: [] });
  const [ssoSummary, setSsoSummary]     = useState<{ totalSso:number; totalOdr:number; mtdSso:number; mtdOdr:number; targetSso:number; targetOdr:number } | null>(null);
  const [ssoLoading, setSsoLoading]     = useState(false);
  const [mapData, setMapData]           = useState<{ agents: any[]; visits: any[] }>({ agents: [], visits: [] });
  const [mapTdrNames, setMapTdrNames]   = useState<string[]>([]);
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
  // Site Focus state
  const [siteFocusData, setSiteFocusData] = useState<any[]>([]);
  const [siteFocusLoading, setSiteFocusLoading] = useState(false);
  const [sfForm, setSfForm]             = useState({ siteName: '', siteId: '', agentsRec: '', ssosRec: '', odrsRec: '', dataActs: '', dtuSold: '', dtuAgentCode: '', notes: '', latitude: '', longitude: '', plannedDate: '', agentCodes: '', ssoCodes: '', odrCodes: '' });
  const [sfFormOpen, setSfFormOpen]     = useState(false);
  const [sfMode, setSfMode]             = useState<'plan' | 'record'>('plan'); // plan = schedule visit; record = enter actuals
  const [sfEditingId, setSfEditingId]   = useState<string | null>(null);       // editing an existing site
  const [sfGpsLoading, setSfGpsLoading] = useState(false);
  const [sfSaving, setSfSaving]         = useState(false);

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
      .then(r => {
        setMapData(r.data.data || { agents: [], visits: [] });
        setMapTdrNames(r.data.tdrNames || []);
      })
      .catch(() => toast.error('Failed to load map'))
      .finally(() => setMapLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'map') loadMap();
  }, [tab, loadMap]);

  const loadSsoOdr = useCallback(() => {
    setSsoLoading(true);
    Promise.all([ssoOdrApi.summary(), ssoOdrApi.listSso(), ssoOdrApi.listOdr()])
      .then(([sumRes, ssoRes, odrRes]) => {
        setSsoSummary(sumRes.data.data);
        setSsoData({ sso: ssoRes.data.data || [], odr: odrRes.data.data || [] });
      })
      .catch(() => toast.error('Failed to load SSO/ODR data'))
      .finally(() => setSsoLoading(false));
  }, []);

  useEffect(() => { if (tab === 'sso-odr') loadSsoOdr(); }, [tab, loadSsoOdr]);

  const loadSiteFocus = useCallback(() => {
    setSiteFocusLoading(true);
    aseApi.getSiteFocus()
      .then(r => setSiteFocusData(r.data.data || []))
      .catch(() => toast.error('Failed to load site focus'))
      .finally(() => setSiteFocusLoading(false));
  }, []);
  useEffect(() => { if (tab === 'site-focus') loadSiteFocus(); }, [tab, loadSiteFocus]);

  const resetSfForm = () => {
    setSfForm({ siteName: '', siteId: '', agentsRec: '', ssosRec: '', odrsRec: '', dataActs: '', dtuSold: '', dtuAgentCode: '', notes: '', latitude: '', longitude: '', plannedDate: '', agentCodes: '', ssoCodes: '', odrCodes: '' });
    setSfEditingId(null);
    setSfMode('plan');
  };

  // Open form to plan a NEW site visit
  const openPlanForm = () => { resetSfForm(); setSfMode('plan'); setSfFormOpen(true); };

  // Open form to record/edit an EXISTING site (enter actuals after visit)
  const openRecordForm = (s: any) => {
    setSfEditingId(s.id);
    setSfMode('record');
    setSfForm({
      siteName: s.siteName || '', siteId: s.siteId || '',
      agentsRec: String(s.agentsRec ?? ''), ssosRec: String(s.ssosRec ?? ''),
      odrsRec: String(s.odrsRec ?? ''), dataActs: String(s.dataActs ?? ''),
      dtuSold: String(s.dtuSold ?? ''), dtuAgentCode: s.dtuAgentCode || '', notes: s.notes || '',
      latitude: s.latitude != null ? String(s.latitude) : '',
      longitude: s.longitude != null ? String(s.longitude) : '',
      plannedDate: s.plannedDate ? String(s.plannedDate).slice(0, 10) : '',
      agentCodes: s.agentCodes || '', ssoCodes: s.ssoCodes || '', odrCodes: s.odrCodes || '',
    });
    setSfFormOpen(true);
  };

  const saveSiteFocus = async () => {
    if (!sfForm.siteName || !sfForm.siteId) { toast.error('Site name and ID are required'); return; }
    setSfSaving(true);
    try {
      const payload: any = {
        siteName: sfForm.siteName, siteId: sfForm.siteId,
        latitude:  sfForm.latitude  !== '' ? Number(sfForm.latitude)  : undefined,
        longitude: sfForm.longitude !== '' ? Number(sfForm.longitude) : undefined,
        notes:     sfForm.notes || undefined,
        plannedDate: sfForm.plannedDate || undefined,
      };
      if (sfMode === 'record') {
        payload.mode = 'record';
        payload.agentsRec = Number(sfForm.agentsRec) || 0;
        payload.ssosRec   = Number(sfForm.ssosRec)   || 0;
        payload.odrsRec   = Number(sfForm.odrsRec)   || 0;
        payload.dataActs  = Number(sfForm.dataActs)  || 0;
        payload.dtuSold   = Number(sfForm.dtuSold)   || 0;
        payload.dtuAgentCode = sfForm.dtuAgentCode || '';
        payload.agentCodes = sfForm.agentCodes || '';
        payload.ssoCodes   = sfForm.ssoCodes   || '';
        payload.odrCodes   = sfForm.odrCodes   || '';
      } else {
        payload.mode = 'plan';
      }

      if (sfEditingId) {
        await aseApi.updateSiteFocus(sfEditingId, payload);
        toast.success(sfMode === 'record' ? 'Results recorded!' : 'Site updated!');
      } else {
        await aseApi.saveSiteFocus(payload);
        toast.success(sfMode === 'plan' ? 'Visit planned!' : 'Site saved!');
      }
      setSfFormOpen(false);
      resetSfForm();
      loadSiteFocus();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save site');
    } finally {
      setSfSaving(false);
    }
  };

  const deleteSiteFocus = async (id: string) => {
    try {
      await aseApi.deleteSiteFocus(id);
      toast.success('Site removed');
      loadSiteFocus();
      loadDashboard();
    } catch { toast.error('Failed to remove site'); }
  };

  const captureGps = () => {
    if (!navigator.geolocation) { toast.error('GPS not supported on this device'); return; }
    setSfGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSfForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setSfGpsLoading(false);
        toast.success('GPS location captured');
      },
      (err) => {
        setSfGpsLoading(false);
        toast.error(err.code === 1 ? 'Location permission denied' : 'Could not get GPS location');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

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
    { id: 'site-focus',  label: `📍 Site Focus` },
    { id: 'sso-odr',     label: `📡 SSO/ODR` },
    { id: 'pick-tdrs',   label: `➕ Pick TDRs` },
    { id: 'map',         label: `🗺️ Field Map` },
  ] as const;

  return (
    <Layout title="ASE Dashboard">
      <PageHeader title={`${user?.name ?? 'ASE'}`} subtitle="Area Sales Executive Dashboard" />

      {/* Hero ring charts */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 px-4 pb-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <div className="px-4 pb-3">
          {/* Primary ASE KPI Score banner — official weighted performance */}
          <div className={`rounded-2xl border-2 p-4 mb-3 ${scoreBg(kpiScore?.finalScore ?? 0)}`} style={{ borderColor: (kpiScore?.finalScore ?? 0) >= 70 ? '#00843D' : (kpiScore?.finalScore ?? 0) >= 40 ? '#f59e0b' : '#ef4444' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">My ASE KPI Score</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Official weighted performance · all 5 KPIs</p>
              </div>
              <div className="text-right">
                <span className={`text-4xl font-black ${scoreColor(kpiScore?.finalScore ?? 0)}`}>{kpiScore?.finalScore ?? 0}%</span>
                <p className={`text-[10px] font-bold ${scoreColor(kpiScore?.finalScore ?? 0)}`}>{(kpiScore?.finalScore ?? 0) >= 70 ? '🟢 On Track' : (kpiScore?.finalScore ?? 0) >= 40 ? '🟡 Needs Attention' : '🔴 Critical'}</p>
              </div>
            </div>
            <button onClick={() => setTab('kpi-score')} className="mt-2 text-[11px] font-semibold underline underline-offset-2" style={{ color: '#00843D' }}>View KPI breakdown →</button>
          </div>
          {/* 4 Ring Charts */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {(() => {
              const overallScore = stats.length > 0
                ? Math.round(stats.reduce((acc, s) => acc + (s.kpiScore ?? 0), 0) / stats.length)
                : 0;
              const totalAgentsMtd = dashData?.team?.totals?.agents ?? 0;
              const agentPct = Math.min(100, Math.round(totalAgentsMtd / Math.max(prorateMtdTarget(96 * stats.length), 1) * 100));
              const kycPct = kyc && kyc.total > 0 ? kyc.kycScore : 0;
              const ssoMtd = ssoSummary?.mtdSso ?? 0;
              const odrMtd = ssoSummary?.mtdOdr ?? 0;
              const ssoTarget = (ssoSummary?.targetSso ?? 0) + (ssoSummary?.targetOdr ?? 0);
              const ssoOdrPct = Math.min(100, Math.round((ssoMtd + odrMtd) / Math.max(ssoTarget, 1) * 100));
              return (
                <>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center py-3">
                    <RingChart pct={overallScore} size={80} stroke={9} color="#00843D" label="Team TDR Score" />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center py-3">
                    <RingChart pct={agentPct} size={80} stroke={9} color="#E4007C" label="Agents MTD" />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center py-3">
                    <RingChart pct={kycPct} size={80} stroke={9} color="#2563EB" label="KYC Devices" />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center py-3">
                    <RingChart pct={ssoTarget > 0 ? ssoOdrPct : 0} size={80} stroke={9} color="#8B5CF6" label="SSO+ODR" />
                  </div>
                </>
              );
            })()}
          </div>
          {/* Compact stats row */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-white rounded-xl border border-gray-100 p-2 text-center">
              <p className="text-base font-black" style={{ color: '#00843D' }}>{kyc?.total ?? 0}</p>
              <p className="text-[9px] text-gray-400">Devices</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-2 text-center">
              <p className="text-base font-black text-green-600">{kyc?.active ?? 0}</p>
              <p className="text-[9px] text-gray-400">Active</p>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-100 p-2 text-center">
              <p className="text-base font-black text-purple-600">{stats.length}</p>
              <p className="text-[9px] text-gray-400">TDRs</p>
            </div>
            {(() => {
              const teamAvg = stats.length > 0 ? Math.round(stats.reduce((acc, s) => acc + (s.kpiScore ?? 0), 0) / stats.length) : 0;
              return (
            <div className={`rounded-xl border p-2 text-center ${scoreBg(teamAvg)}`}>
              <p className={`text-base font-black ${scoreColor(teamAvg)}`}>{teamAvg}%</p>
              <p className="text-[9px] text-gray-400">Avg TDR</p>
            </div>
              );
            })()}
          </div>
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
                  <PerformanceBar icon="🎯" label={`Prospects`} count={(team.totals as any).prospects ?? 0} target={prospectStretchTarget((team.totals as any).prospects ?? 0)} />
                  <PerformanceBar icon="📍" label={`Outlet Visits`} count={team.totals.visits} target={vTgt} />
                  <PerformanceBar icon="🔄" label={`Reactivations`} count={team.totals.reactivations} target={rTgt} />
                </div>
              </div>
            );
          })()}

          {/* TDR list */}
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          ) : stats.length === 0 ? (
            <Card className="text-center py-8 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No TDRs assigned yet.</p>
              <button onClick={() => setTab('pick-tdrs')} className="mt-3 text-white text-xs font-bold px-4 py-2 rounded-xl" style={{ background: '#00843D' }}>
                Pick TDRs →
              </button>
            </Card>
          ) : (
            <div className="space-y-2 mb-24">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" style={{ color: '#00843D' }} />
                <h3 className="font-bold text-sm text-gray-800">TDR Performance ({stats.length})</h3>
              </div>
              {stats.map(({ tdr, agents, visits, floatIssues, reactivations, prospects, kpiScore: tdrKpi }) => {
                const tdrFlag = flags.find(f => f.tdrId === tdr.id);
                const aTgt = prorateMtdTarget(96);
                const vTgt = visitMtdTarget();
                const rTgt = Math.max(6 * workingDaysElapsed(), 1);
                const pTgt = prospectStretchTarget(prospects ?? 0);
                const agentPct = Math.min(Math.round(agents / Math.max(aTgt, 1) * 100), 100);
                const visitPct = Math.min(Math.round(visits / Math.max(vTgt, 1) * 100), 100);
                const reactPct = Math.min(Math.round(reactivations / rTgt * 100), 100);
                const prospectPct = Math.min(Math.round((prospects ?? 0) / pTgt * 100), 100);
                const sc = tdrKpi ?? calcWeightedScore({
                  agentPct,
                  merchantPct:     0,
                  prospectPct,
                  floatPct:        floatIssues === 0 ? 100 : Math.max(0, 100 - floatIssues * 10),
                  reactivationPct: reactPct,
                  visitPct,
                });
                const band = getBand(sc);
                const scColor = sc >= 70 ? '#00843D' : sc >= 40 ? '#f59e0b' : '#ef4444';
                const scBg = sc >= 70 ? '#f0fdf4' : sc >= 40 ? '#fffbeb' : '#fef2f2';
                return (
                  <div key={tdr.id} className="relative rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ background: scColor }} />
                    <div className="pl-4 pr-3 py-3 flex items-center gap-3">
                      <RingChart pct={sc} size={52} stroke={6} color={scColor} label="" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-800 truncate">{tdr.name}</p>
                        <p className="text-xs text-gray-400">{tdr.zone || 'No zone'}</p>
                        <div className="mt-1.5 space-y-1">
                          {([['Agents', agentPct, '#00843D'], ['Prosp', prospectPct, '#0EA5E9'], ['Visits', visitPct, '#2563EB'], ['React', reactPct, '#F97316']] as const).map(([l,p,c]) => (
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
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-xs font-black px-2 py-1 rounded-xl" style={{ background: scBg, color: scColor }}>{sc}%</span>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); releaseTDR(tdr.id); }}
                            className="text-xs text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                            title="Release TDR">
                            <X className="w-3 h-3" />
                          </button>
                          <button onClick={() => viewTDR(tdr.id)}
                            className="flex items-center gap-0.5 text-xs font-semibold bg-green-50 px-2 py-1 rounded-lg"
                            style={{ color: '#00843D' }}>
                            <Eye className="w-3 h-3" />
                          </button>
                        </div>
                        {tdrFlag && (
                          <AlertTriangle className={`w-3.5 h-3.5 ${tdrFlag.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                        )}
                      </div>
                    </div>
                  </div>
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
                    { label: 'Device Activation (KYC)', score: kpiScore.kycDeviceScore,   weight: '32.73%', icon: '📱' },
                    { label: 'Agent Recruitment',        score: kpiScore.simOutletScore,   weight: '20.45%', icon: '👤' },
                    { label: 'TDR Supervision',          score: kpiScore.supervisionScore, weight: '28.64%', icon: '👥' },
                    { label: 'Weekly Site Focus',         score: (kpiScore as any).siteFocusScore ?? 0, weight: '10.00%', icon: '📍', sub: `${(kpiScore as any).siteFocusSites ?? 0}/5 sites` },
                    { label: 'Own Device (KYC)',          score: kpiScore.ownDeviceScore,   weight: '8.18%',  icon: '🏪' },
                  ].map(row => (
                    <div key={row.label} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span>{row.icon}</span>
                          <div>
                            <p className="text-xs font-semibold text-gray-700">{row.label}</p>
                            <p className="text-[10px] text-gray-400">Weight: {row.weight}{(row as any).sub ? ` · ${(row as any).sub}` : ''}</p>
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

      {/* SITE FOCUS TAB */}
      {tab === 'site-focus' && (
        <div className="px-4 py-2 mb-24">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-sm text-gray-800">📍 Weekly Site Focus</h3>
              <p className="text-xs text-gray-400">{siteFocusData.length}/5 sites logged this week</p>
            </div>
            <button onClick={() => { if (sfFormOpen) { setSfFormOpen(false); resetSfForm(); } else { openPlanForm(); } }} className="text-white text-xs font-bold px-3 py-2 rounded-xl" style={{ background: '#00843D' }}>
              {sfFormOpen ? 'Close' : '+ Plan Visit'}
            </button>
          </div>
          {/* Progress summary */}
          <div className="mb-3">
            <div className="h-2 bg-gray-100 rounded-full">
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(siteFocusData.length/5*100,100)}%`, background: '#00843D' }} />
            </div>
          </div>
          {/* Add-site / record form */}
          {sfFormOpen && (
            <Card className="mb-4 p-4">
              {/* Mode toggle */}
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setSfMode('plan')} className={`flex-1 text-xs font-bold py-2 rounded-xl ${sfMode === 'plan' ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={sfMode === 'plan' ? { background: '#0EA5E9' } : {}}>📅 Plan Visit</button>
                <button type="button" onClick={() => setSfMode('record')} className={`flex-1 text-xs font-bold py-2 rounded-xl ${sfMode === 'record' ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={sfMode === 'record' ? { background: '#00843D' } : {}}>✅ Record Results</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input value={sfForm.siteName} onChange={e => setSfForm({...sfForm, siteName: e.target.value})} placeholder="Site Name" className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
                <input value={sfForm.siteId} onChange={e => setSfForm({...sfForm, siteId: e.target.value})} placeholder="Site ID" className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-400">Planned Visit Date</label>
                  <input type="date" value={sfForm.plannedDate} onChange={e => setSfForm({...sfForm, plannedDate: e.target.value})} className="w-full border rounded-xl px-3 py-2 text-sm" />
                </div>
                {sfMode === 'record' && (<>
                  <input type="number" value={sfForm.agentsRec} onChange={e => setSfForm({...sfForm, agentsRec: e.target.value})} placeholder="Agents (3)" className="border rounded-xl px-3 py-2 text-sm" />
                  <input type="number" value={sfForm.ssosRec} onChange={e => setSfForm({...sfForm, ssosRec: e.target.value})} placeholder="SSOs (2)" className="border rounded-xl px-3 py-2 text-sm" />
                  <input type="number" value={sfForm.odrsRec} onChange={e => setSfForm({...sfForm, odrsRec: e.target.value})} placeholder="ODRs (1)" className="border rounded-xl px-3 py-2 text-sm" />
                  <input type="number" value={sfForm.dataActs} onChange={e => setSfForm({...sfForm, dataActs: e.target.value})} placeholder="Data Acts (15)" className="border rounded-xl px-3 py-2 text-sm" />
                  <div className="col-span-2 mt-1 pt-2 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-500 mb-1">💰 Direct Top Up (one-off total)</p>
                  </div>
                  <input type="number" value={sfForm.dtuSold} onChange={e => setSfForm({...sfForm, dtuSold: e.target.value})} placeholder="Amount sold (ZMW)" className="border rounded-xl px-3 py-2 text-sm" />
                  <input value={sfForm.dtuAgentCode} onChange={e => setSfForm({...sfForm, dtuAgentCode: e.target.value})} placeholder="Agent code sold from" className="border rounded-xl px-3 py-2 text-sm" />
                  <div className="col-span-2 mt-1 pt-2 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-500 mb-1">Enter actual codes created (comma-separated)</p>
                  </div>
                  <textarea value={sfForm.agentCodes} onChange={e => setSfForm({...sfForm, agentCodes: e.target.value})} placeholder="Agent codes e.g. ZM-COP-0023, ZM-COP-0024" rows={2} className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
                  <textarea value={sfForm.ssoCodes} onChange={e => setSfForm({...sfForm, ssoCodes: e.target.value})} placeholder="SSO codes created" rows={2} className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
                  <textarea value={sfForm.odrCodes} onChange={e => setSfForm({...sfForm, odrCodes: e.target.value})} placeholder="ODR codes created (optional)" rows={2} className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
                  {/* GPS captured at the site during the actual visit */}
                  <button type="button" onClick={captureGps} disabled={sfGpsLoading} className="col-span-2 flex items-center justify-center gap-2 border-2 border-dashed rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: '#00843D', color: '#00843D' }}>
                    <MapPin className="w-4 h-4" />
                    {sfGpsLoading ? 'Getting location…' : (sfForm.latitude ? `📍 ${sfForm.latitude}, ${sfForm.longitude}` : 'Capture GPS Coordinates')}
                  </button>
                </>)}
                <input value={sfForm.notes} onChange={e => setSfForm({...sfForm, notes: e.target.value})} placeholder="Notes (optional)" className="col-span-2 border rounded-xl px-3 py-2 text-sm" />
              </div>
              <button onClick={saveSiteFocus} disabled={sfSaving} className="w-full text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50" style={{ background: sfMode === 'plan' ? '#0EA5E9' : '#00843D' }}>
                {sfSaving ? 'Saving...' : (sfMode === 'plan' ? (sfEditingId ? 'Update Plan' : 'Save Planned Visit') : 'Save Results')}
              </button>
            </Card>
          )}
          {/* Logged sites list */}
          {siteFocusLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          ) : siteFocusData.length === 0 ? (
            <Card className="text-center py-8 text-gray-400">
              <p className="text-sm">No sites logged this week yet.</p>
              <p className="text-xs mt-1">Target: 5 focus sites per week.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {siteFocusData.map((s: any) => {
                const kpis = [
                  { l: 'Agents', v: s.agentsRec, t: 3,   c: '#00843D' },
                  { l: 'SSOs',   v: s.ssosRec,   t: 2,   c: '#2563EB' },
                  { l: 'ODRs',   v: s.odrsRec,   t: 1,   c: '#7C3AED' },
                  { l: 'Data',   v: s.dataActs,  t: 15,  c: '#F97316' },
                  { l: 'DTU ZMW', v: s.dtuSold,  t: 500, c: '#E4007C' },
                ];
                const siteScore = Math.round(kpis.reduce((a, k) => a + Math.min(k.v / k.t * 100, 100), 0) / kpis.length);
                const scColor = siteScore >= 70 ? '#00843D' : siteScore >= 40 ? '#f59e0b' : '#ef4444';
                const isPlanned = s.status === 'planned';
                const isOverdue = s.overdue;
                return (
                  <div key={s.id} className={`rounded-2xl border bg-white shadow-sm p-3 ${isOverdue ? 'border-red-300 border-2' : isPlanned ? 'border-sky-200 border-dashed' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-800 truncate flex items-center gap-1.5">
                          {s.siteName}
                          {isOverdue
                            ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">🔴 OVERDUE</span>
                            : isPlanned
                            ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">PLANNED</span>
                            : <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">VISITED</span>}
                          {s.carriedOver && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">↻ carried ×{s.carryCount}</span>}
                        </p>
                        <p className="text-[10px] text-gray-400">ID: {s.siteId}{s.plannedDate ? ` · 📅 ${new Date(s.plannedDate).toLocaleDateString()}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isPlanned && <span className="text-lg font-black" style={{ color: scColor }}>{siteScore}%</span>}
                        <button onClick={() => deleteSiteFocus(s.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                      </div>
                    </div>
                    {!isPlanned && (
                    <div className="space-y-1">
                      {kpis.map(k => {
                        const pct = Math.min(Math.round(k.v / k.t * 100), 100);
                        return (
                          <div key={k.l} className="flex items-center gap-1.5">
                            <span className="text-[9px] text-gray-400 w-10 shrink-0">{k.l}</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: k.c }} />
                            </div>
                            <span className="text-[9px] font-bold text-gray-500 w-12 text-right">{k.v}/{k.t}</span>
                          </div>
                        );
                      })}
                    </div>
                    )}
                    {(s.latitude != null && s.longitude != null) && (
                      <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" className="text-[10px] mt-2 inline-flex items-center gap-1 font-semibold" style={{ color: '#00843D' }}>
                        <MapPin className="w-3 h-3" /> {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}
                      </a>
                    )}
                    {(s.agentCodes || s.ssoCodes || s.odrCodes || s.dtuAgentCode) && (
                      <div className="mt-2 pt-2 border-t border-gray-50 space-y-0.5">
                        {s.agentCodes && <p className="text-[10px] text-gray-500"><span className="font-bold text-green-700">Agents:</span> {s.agentCodes}</p>}
                        {s.ssoCodes && <p className="text-[10px] text-gray-500"><span className="font-bold text-blue-700">SSOs:</span> {s.ssoCodes}</p>}
                        {s.odrCodes && <p className="text-[10px] text-gray-500"><span className="font-bold text-purple-700">ODRs:</span> {s.odrCodes}</p>}
                        {s.dtuAgentCode && <p className="text-[10px] text-gray-500"><span className="font-bold text-pink-700">DTU from:</span> {s.dtuAgentCode} (K{s.dtuSold})</p>}
                      </div>
                    )}
                    {s.notes && <p className="text-[10px] text-gray-400 mt-1 italic">{s.notes}</p>}
                    <button onClick={() => openRecordForm(s)} className="mt-2 w-full text-xs font-bold py-2 rounded-xl" style={isPlanned ? { background: '#00843D', color: '#fff' } : { background: '#f3f4f6', color: '#374151' }}>
                      {isPlanned ? '✅ Record Results' : '✏️ Edit Results'}
                    </button>
                  </div>
                );
              })}
            </div>
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

      {/* ── SSO/ODR TAB ── */}
      {tab === 'sso-odr' && (
        <div className="px-4 pb-24">
          {/* Outlet form modal */}
          {ssoTab && <OutletForm type={ssoTab} onClose={() => setSsoTab(null)} onSuccess={() => { setSsoTab(null); loadSsoOdr(); }} />}

          {/* Summary cards */}
          {ssoSummary && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: 'SSO Outlets', val: ssoSummary.totalSso, mtd: ssoSummary.mtdSso, target: ssoSummary.targetSso, color: '#8B5CF6', bg: '#F3E8FF' },
                { label: 'ODR Outlets', val: ssoSummary.totalOdr, mtd: ssoSummary.mtdOdr, target: ssoSummary.targetOdr, color: '#F97316', bg: '#FFF7ED' },
              ].map(c => (
                <div key={c.label} className="rounded-2xl p-3 border border-gray-100" style={{ background: c.bg }}>
                  <p className="text-xs font-semibold text-gray-500 mb-1">{c.label}</p>
                  <p className="text-2xl font-black" style={{ color: c.color }}>{c.val}</p>
                  <p className="text-xs text-gray-400">MTD: {c.mtd}{c.target > 0 ? ` / ${c.target}` : ''}</p>
                  {c.target > 0 && (
                    <div className="mt-1.5 h-1.5 bg-white rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(c.mtd/c.target*100))}%`, background: c.color }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button onClick={() => setSsoTab('SSO')}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white"
              style={{ background: '#8B5CF6' }}>
              <Store size={15} /> ➕ Add SSO
            </button>
            <button onClick={() => setSsoTab('ODR')}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white"
              style={{ background: '#F97316' }}>
              <Store size={15} /> ➕ Add ODR
            </button>
          </div>

          {ssoLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <>
              {/* SSO list */}
              {ssoData.sso.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-purple-700 mb-2 uppercase tracking-wide">📡 SSO Outlets ({ssoData.sso.length})</p>
                  <div className="space-y-2">
                    {ssoData.sso.map((o: any) => (
                      <div key={o.id} className="bg-white border border-purple-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{o.outletName}</p>
                          <p className="text-xs text-gray-400">{o.town} · TDR: {o.tdrName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {o.latitude && <span className="text-xs text-green-600">📍</span>}
                          <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">{o.deviceType}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* ODR list */}
              {ssoData.odr.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-orange-700 mb-2 uppercase tracking-wide">📦 ODR Outlets ({ssoData.odr.length})</p>
                  <div className="space-y-2">
                    {ssoData.odr.map((o: any) => (
                      <div key={o.id} className="bg-white border border-orange-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{o.outletName}</p>
                          <p className="text-xs text-gray-400">{o.town} · TDR: {o.tdrName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {o.latitude && <span className="text-xs text-green-600">📍</span>}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.deviceType === 'Zamtel' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{o.deviceType}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ssoData.sso.length === 0 && ssoData.odr.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <Store size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold">No SSO or ODR outlets yet</p>
                  <p className="text-xs mt-1">Use the buttons above to register outlets</p>
                </div>
              )}
            </>
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
          {/* Scope info banner */}
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mb-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-green-800">Your TDRs' Field Activity</p>
              <p className="text-xs text-green-600 mt-0.5">
                Only agents & outlets registered by your {mapTdrNames.length > 0 ? mapTdrNames.length : stats.length} assigned TDRs are shown
              </p>
              {mapTdrNames.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {mapTdrNames.map(n => (
                    <span key={n} className="text-[10px] bg-white border border-green-200 text-green-700 font-semibold px-2 py-0.5 rounded-full">{n}</span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={loadMap} disabled={mapLoading}
              className="flex items-center gap-1.5 text-xs text-green-700 font-bold hover:bg-green-100 px-3 py-1.5 rounded-xl transition-colors flex-shrink-0 border border-green-200">
              <RefreshCw size={12} className={mapLoading ? 'animate-spin' : ''}/>
              Refresh
            </button>
          </div>

          {/* Stats row */}
          {!mapLoading && mapData.agents.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                ['Agents',    mapData.agents.filter((a:any) => a.type !== 'merchant').length, 'text-green-700', 'bg-green-50'],
                ['Merchants', mapData.agents.filter((a:any) => a.type === 'merchant').length, 'text-pink-700',  'bg-pink-50'],
                ['Visits',    mapData.visits.length, 'text-blue-700', 'bg-blue-50'],
              ].map(([l,v,tc,bg]) => (
                <div key={l as string} className={`${bg} rounded-xl py-2 text-center`}>
                  <p className={`text-lg font-black ${tc}`}>{v}</p>
                  <p className="text-[10px] text-gray-500">{l}</p>
                </div>
              ))}
            </div>
          )}

          {mapLoading ? (
            <div className="h-[420px] bg-gray-100 rounded-2xl animate-pulse flex items-center justify-center">
              <p className="text-gray-400 text-sm">Loading map…</p>
            </div>
          ) : mapData.agents.length === 0 && mapData.visits.length === 0 ? (
            <div className="h-[420px] bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center text-gray-400">
              <Map size={40} className="mb-3 opacity-30"/>
              <p className="text-sm font-semibold">No GPS data yet</p>
              <p className="text-xs mt-1">
                {stats.length === 0
                  ? 'Assign TDRs to your account first'
                  : 'Your TDRs have not recorded GPS locations yet'}
              </p>
            </div>
          ) : (
            <GeoMap
              agents={mapData.agents}
              visits={mapData.visits}
              height="460px"
              showVisits={true}
            />
          )}
        </div>
      )}
    </Layout>
  );
};
