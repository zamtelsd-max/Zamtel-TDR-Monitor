import React, { useEffect, useState } from 'react';
import { Users, Eye, AlertTriangle, X, RefreshCw, ChevronDown, ChevronUp, Link2, TrendingUp } from 'lucide-react';
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
}

interface AvailableTDR {
  id: string; name: string; zone: string | null; aseId: string | null; mine: boolean;
}

export const ASEDashboardPage: React.FC = () => {
  const user = useAppSelector(s => s.auth.user);
  const [tab, setTab]           = useState<'my-tdrs' | 'pick-tdrs'>('my-tdrs');
  const [stats, setStats]       = useState<TDRStat[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [tdrData, setTdrData]   = useState<any>(null);
  const [tdrLoading, setTdrLoading] = useState(false);
  const [flags, setFlags]       = useState<TDRFlag[]>([]);
  const [flagsOpen, setFlagsOpen] = useState(true);
  const [available, setAvailable] = useState<AvailableTDR[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [picking, setPicking]   = useState<string | null>(null);

  const [teamData, setTeamData] = useState<any>(null);

  const loadDashboard = () => {
    setLoading(true);
    aseApi.dashboard()
      .then(r => { setStats(r.data.tdrStats); setTeamData(r.data.team ?? null); })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
    // Load flags
    flagsApi.get()
      .then(r => setFlags(r.data.data ?? []))
      .catch(() => {});
  }, []);

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

  return (
    <Layout title="ASE Dashboard">
      <PageHeader title={`Welcome, ${user?.name}`} subtitle="Area Sales Executive" />

      {/* Tab bar */}
      <div className="flex gap-2 px-4 pt-3 pb-1">
        {(['my-tdrs', 'pick-tdrs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
              tab === t ? 'bg-zamtel-green text-white shadow' : 'bg-white text-gray-500 border border-gray-200'
            }`}>
            {t === 'my-tdrs' ? `👥 My TDRs (${stats.length})` : '➕ Pick TDRs'}
          </button>
        ))}
      </div>

      {/* MY TDRs tab */}
      {tab === 'my-tdrs' && (
        <div className="px-4 py-3">
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
                          <p className="text-gray-500">Merchants MTD</p>
                        </div>
                        <div className="bg-white/70 rounded-lg py-1">
                          <span className="font-bold text-gray-700">{f.mtd.visits}/{f.mtd.visitTarget}</span>
                          <p className="text-gray-500">Visits MTD</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MTD working-day progress */}
          {(() => {
            const el = workingDaysElapsed(); const tot = workingDaysThisMonth(); const pct = Math.round(el/tot*100);
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">📅 Working day <strong>{el}</strong> of <strong>{tot}</strong> — targets prorated</span>
                  <span className="text-xs font-semibold text-gray-600">{pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div className="h-1.5 rounded-full bg-gray-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* Team Performance vs Target */}
          {teamData && stats.length > 0 && (() => {
            const aTgt = teamData.targets.agents        || 1;
            const vTgt = teamData.targets.visits        || 1;
            const rTgt = teamData.targets.reactivations || 1;
            const aPct = Math.min(Math.round(teamData.totals.agents        / aTgt * 100), 100);
            const vPct = Math.min(Math.round(teamData.totals.visits        / vTgt * 100), 100);
            const rPct = Math.min(Math.round((teamData.totals.reactivations ?? 0) / rTgt * 100), 100);
            const fPct = teamData.totals.floatIssues === 0 ? 100 : Math.max(0, 100 - teamData.totals.floatIssues * 10);
            const sc   = calcWeightedScore({ agentPct: aPct, merchantPct: 0, floatPct: fPct, reactivationPct: rPct, visitPct: vPct });
            const band = getBand(sc);
            const callout = sc < 40 ? '🔴 Critical — Team needs immediate support'
                          : sc < 60 ? '🟠 Below Target — Step in and coach'
                          : sc < 80 ? '🟡 Needs Attention — Keep monitoring'
                          :           '🟢 On Track — Keep it up!';
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
                {/* Score bar */}
                <div className="mb-3">
                  <div className="h-3 bg-white/60 rounded-full overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${sc}%`, background: band.ring }} />
                  </div>
                  <div className="flex justify-between mt-0.5 text-[9px] text-gray-500">
                    <span>0%</span><span className="text-red-400">40</span><span className="text-amber-400">60</span><span className="text-green-400">80</span><span>100%</span>
                  </div>
                </div>
                {/* KPI bars */}
                <div className="space-y-2.5 mb-3">
                  <PerformanceBar icon="👤" label={`Agent Recruitment — ${stats.length} TDRs`} count={teamData.totals.agents} target={aTgt} />
                  <PerformanceBar icon="📍" label={`Outlet Visits — ${stats.length} TDRs`}     count={teamData.totals.visits} target={vTgt} />
                  <PerformanceBar icon="🔄" label={`Reactivations — ${stats.length} TDRs`}     count={teamData.totals.reactivations ?? 0} target={rTgt} />
                </div>
                <div className="rounded-xl bg-white/70 px-3 py-2">
                  <p className={`text-xs font-bold ${band.color}`}>{callout}</p>
                </div>
                {teamData.totals.floatIssues > 0 && (
                  <div className="mt-2 rounded-xl bg-red-100 px-3 py-1.5 flex items-center gap-2">
                    <span>⚠️</span>
                    <p className="text-xs font-semibold text-red-700">{teamData.totals.floatIssues} float issue{teamData.totals.floatIssues > 1 ? 's' : ''} open across team</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card className="text-center py-3">
              <p className="text-2xl font-black text-zamtel-green">{stats.length}</p>
              <p className="text-xs text-gray-500 mt-1">TDRs</p>
            </Card>
            <Card className="text-center py-3">
              <p className="text-2xl font-black text-blue-600">{stats.reduce((s, t) => s + t.agents, 0)}</p>
              <p className="text-xs text-gray-500 mt-1">Agents MTD</p>
            </Card>
            <Card className="text-center py-3">
              <p className="text-2xl font-black text-purple-600">{stats.reduce((s, t) => s + t.visits, 0)}</p>
              <p className="text-xs text-gray-500 mt-1">Visits MTD</p>
            </Card>
          </div>

          {/* TDR Performance Cards */}
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
          ) : stats.length === 0 ? (
            <Card className="text-center py-8 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No TDRs assigned yet.</p>
              <button onClick={() => setTab('pick-tdrs')} className="mt-3 bg-zamtel-green text-white text-xs font-bold px-4 py-2 rounded-xl">
                Pick TDRs →
              </button>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-zamtel-green" />
                <h3 className="font-bold text-sm text-gray-800">TDR Performance Against Target</h3>
              </div>
              <div className="space-y-3 mb-24">
                {stats.map(({ tdr, agents, visits, floatIssues, reactivations }) => {
                  const tdrFlag   = flags.find(f => f.tdrId === tdr.id);
                  const aTgt      = prorateMtdTarget(96);
                  const mTgt      = prorateMtdTarget(96);
                  const vTgt      = visitMtdTarget();
                  const rTgt      = 6 * workingDaysElapsed();
                  const sc        = calcWeightedScore({
                    agentPct:        Math.min(Math.round(agents       / Math.max(aTgt, 1) * 100), 100),
                    merchantPct:     0,
                    floatPct:        floatIssues === 0 ? 100 : Math.max(0, 100 - floatIssues * 10),
                    reactivationPct: Math.min(Math.round(reactivations / Math.max(rTgt, 1) * 100), 100),
                    visitPct:        Math.min(Math.round(visits        / Math.max(vTgt, 1) * 100), 100),
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
                            className="flex items-center gap-1 text-xs text-zamtel-green font-semibold bg-green-50 px-2.5 py-1 rounded-xl">
                            <Eye className="w-3 h-3" /> View
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* PICK TDRs tab */}
      {tab === 'pick-tdrs' && (
        <div className="px-4 py-3">
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
                <div key={tdr.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${tdr.mine ? 'border-zamtel-green' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 flex items-center gap-2">
                        {tdr.name}
                        {tdr.mine && <span className="text-xs bg-green-100 text-zamtel-green font-bold px-2 py-0.5 rounded-full">Mine</span>}
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
                        className="text-xs bg-zamtel-green text-white font-bold px-3 py-1.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors">
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
                      <Badge color={a.type === 'merchant' ? 'bg-pink-100 text-zamtel-pink' : 'bg-green-100 text-zamtel-green'}>{a.type}</Badge>
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
    </Layout>
  );
};
