import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, UserPlus, MapPin, AlertTriangle, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { tdrApi } from '../services/api';
import type { TDRDashboard } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, ProgressRing, Skeleton, Badge } from '../components/UI';
import { format } from 'date-fns';
import {
  getBand, calcWeightedScore, floatResolutionPct,
  WEIGHT_PCT, WEIGHT_LABELS, visitMtdTarget, prorateMtdTarget,
  workingDaysElapsed, workingDaysThisMonth,
} from '../utils/performance';

// ─── Weighted KPI card ────────────────────────────────────────────────────────
const KPIRing: React.FC<{
  pct: number; label: string; weight: string; count: number; target: number; loading: boolean;
}> = ({ pct, label, weight, count, target, loading }) => {
  const band = getBand(pct);
  if (loading) return (
    <Card className="flex flex-col items-center py-3">
      <Skeleton className="w-16 h-16 rounded-full mb-2" />
      <Skeleton className="h-3 w-16 mb-1" />
      <Skeleton className="h-2 w-10" />
    </Card>
  );
  return (
    <Card className={`flex flex-col items-center py-3 border-t-2 ${band.border}`}>
      <ProgressRing value={pct} size={72} color={band.ring} label={label} sublabel={`${count}/${target}`} />
      <span className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${band.bg} ${band.color}`}>
        {weight}
      </span>
    </Card>
  );
};

// ─── Float KPI card ───────────────────────────────────────────────────────────
const FloatKPICard: React.FC<{ resolved: number; total: number; pending: number; loading: boolean }> = ({
  resolved, total, pending, loading,
}) => {
  const pct  = floatResolutionPct(resolved, total);
  const band = getBand(pct);
  return (
    <Card className={`mb-4 border-l-4 ${band.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-zamtel-pink" />
          <h3 className="font-semibold text-gray-800 text-sm">Float Issue Resolution</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${band.bg} ${band.color}`}>
            {WEIGHT_PCT.floats} weight
          </span>
          <span className={`text-sm font-bold ${band.color}`}>{pct}%</span>
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="w-full h-2 rounded-full mb-3" style={{ background: '#E5E7EB' }}>
            <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(pct,100)}%`, background: band.ring }} />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl py-3">
              <p className="text-xl font-bold text-gray-800">{total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="rounded-xl py-3" style={{ background: band.bgHex }}>
              <p className="text-xl font-bold" style={{ color: band.textHex }}>{resolved}</p>
              <p className="text-xs" style={{ color: band.textHex }}>Resolved</p>
            </div>
            <div className="bg-red-50 rounded-xl py-3">
              <p className="text-xl font-bold text-red-700">{pending}</p>
              <p className="text-xs text-red-600">Pending</p>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

// ─── Composite Score Banner ───────────────────────────────────────────────────
const ScoreBanner: React.FC<{ score: number; loading: boolean }> = ({ score, loading }) => {
  const band = getBand(score);
  return (
    <div className={`rounded-2xl p-4 mb-4 border-2 ${band.border}`} style={{ background: band.bgHex }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: band.textHex }}>
            Weighted Performance Score
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: band.textHex, opacity: 0.8 }}>
            Agents 40% · Merchants 20% · Float Res. 30% · Visits 10% — MTD targets
          </p>
        </div>
        {loading ? <Skeleton className="w-16 h-10" /> : (
          <div className="text-right">
            <p className="text-3xl font-black" style={{ color: band.textHex }}>{score}<span className="text-lg">%</span></p>
            <p className="text-xs font-bold" style={{ color: band.textHex }}>{band.label}</p>
          </div>
        )}
      </div>
      {!loading && (
        <div className="mt-3 w-full h-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.1)' }}>
          <div className="h-2.5 rounded-full transition-all" style={{ width: `${score}%`, background: band.ring }} />
        </div>
      )}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export const TDRDashboardPage: React.FC = () => {
  const [data,    setData]    = useState<TDRDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem('zamtel_tdr_dashboard');
    if (cached) { try { setData(JSON.parse(cached) as TDRDashboard); } catch {} }
    tdrApi.dashboard()
      .then(res => { setData(res.data); localStorage.setItem('zamtel_tdr_dashboard', JSON.stringify(res.data)); })
      .catch(() => toast.error('Could not refresh dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const agentPct    = data ? Math.min(Math.round(data.stats.agents.count    / data.stats.agents.target    * 100), 100) : 0;
  const merchantPct = data ? Math.min(Math.round(data.stats.merchants.count / data.stats.merchants.target * 100), 100) : 0;
  const visitPct    = data ? Math.min(Math.round(data.stats.visits.count    / data.stats.visits.target    * 100), 100) : 0;
  const floatPct    = data ? floatResolutionPct(data.floatIssues.resolved, data.floatIssues.total) : 100;
  const score       = data ? calcWeightedScore({ agentPct, merchantPct, floatPct, visitPct }) : 0;

  const elapsed = workingDaysElapsed();
  const total   = workingDaysThisMonth();
  const mtdPct  = Math.round(elapsed / total * 100);

  return (
    <Layout title="TDR Dashboard">
      <PageHeader
        title={data?.tdr.name || 'My Dashboard'}
        subtitle={`${data?.tdr.zone || ''} · ${format(new Date(), 'MMMM yyyy')}`}
      />

      {/* ── TODAY'S PROGRESS ─────────────────────────────────────── */}
      <div className="rounded-2xl mb-4 overflow-hidden shadow-sm border border-gray-100">
        {/* Header bar */}
        <div className="zamtel-gradient px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <span className="text-white font-bold text-sm">Today's Progress</span>
          </div>
          <span className="text-white/70 text-[11px]">
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 bg-white">
          {/* Visits */}
          {(() => {
            const count  = data?.today.visits    ?? 0;
            const target = data?.today.target    ?? 20;
            const pct    = Math.min(Math.round(count / target * 100), 100);
            const band   = getBand(pct);
            return (
              <div className="flex flex-col items-center py-4 px-2 relative">
                <p className="text-3xl font-black" style={{ color: band.textHex }}>
                  {loading && !data ? '—' : count}
                </p>
                <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Visits</p>
                <p className="text-[10px] text-gray-400">target {target}</p>
                <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: band.ring }} />
                </div>
                <span className={`mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${band.bg} ${band.color}`}>
                  {pct}%
                </span>
              </div>
            );
          })()}
          {/* Agents */}
          {(() => {
            const count = data?.today.agents ?? 0;
            const band  = count >= 4 ? getBand(100) : count >= 2 ? getBand(60) : count >= 1 ? getBand(40) : getBand(0);
            return (
              <div className="flex flex-col items-center py-4 px-2">
                <p className="text-3xl font-black" style={{ color: band.textHex }}>
                  {loading && !data ? '—' : count}
                </p>
                <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Agents</p>
                <p className="text-[10px] text-gray-400">recruited today</p>
                <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(count/4*100,100)}%`, background: band.ring }} />
                </div>
                <span className={`mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${band.bg} ${band.color}`}>
                  today
                </span>
              </div>
            );
          })()}
          {/* Merchants */}
          {(() => {
            const count = data?.today.merchants ?? 0;
            const band  = count >= 4 ? getBand(100) : count >= 2 ? getBand(60) : count >= 1 ? getBand(40) : getBand(0);
            return (
              <div className="flex flex-col items-center py-4 px-2">
                <p className="text-3xl font-black" style={{ color: band.textHex }}>
                  {loading && !data ? '—' : count}
                </p>
                <p className="text-[10px] font-semibold text-gray-500 mt-0.5">Merchants</p>
                <p className="text-[10px] text-gray-400">recruited today</p>
                <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(count/4*100,100)}%`, background: band.ring }} />
                </div>
                <span className={`mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${band.bg} ${band.color}`}>
                  today
                </span>
              </div>
            );
          })()}
        </div>
        {/* MTD day chip */}
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 flex items-center justify-between">
          <span className="text-[11px] text-gray-500">
            📅 Working day <strong className="text-gray-700">{elapsed}</strong> of <strong className="text-gray-700">{total}</strong>
          </span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-1.5 rounded-full bg-zamtel-green transition-all" style={{ width: `${mtdPct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-gray-600">{mtdPct}%</span>
          </div>
        </div>
      </div>

      {/* Composite score banner */}
      <ScoreBanner score={score} loading={loading && !data} />

      {/* KPI rings — 4 weighted categories */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KPIRing pct={agentPct}    label={WEIGHT_LABELS.agents}    weight={WEIGHT_PCT.agents}
          count={data?.stats.agents.count ?? 0}    target={data?.stats.agents.target ?? 96}    loading={loading && !data} />
        <KPIRing pct={merchantPct} label={WEIGHT_LABELS.merchants} weight={WEIGHT_PCT.merchants}
          count={data?.stats.merchants.count ?? 0} target={data?.stats.merchants.target ?? 96} loading={loading && !data} />
        <KPIRing pct={visitPct}    label={WEIGHT_LABELS.visits}    weight={WEIGHT_PCT.visits}
          count={data?.stats.visits.count ?? 0}    target={data?.stats.visits.target ?? visitMtdTarget()}    loading={loading && !data} />
        <Card className={`flex flex-col items-center py-3 border-t-2 ${getBand(floatPct).border}`}>
          <ProgressRing value={floatPct} size={72} color={getBand(floatPct).ring}
            label="Float Res." sublabel={`${data?.floatIssues.resolved ?? 0}/${data?.floatIssues.total ?? 0}`} />
          <span className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${getBand(floatPct).bg} ${getBand(floatPct).color}`}>
            {WEIGHT_PCT.floats}
          </span>
        </Card>
      </div>

      {/* Float detail */}
      <FloatKPICard
        resolved={data?.floatIssues.resolved ?? 0}
        total={data?.floatIssues.total ?? 0}
        pending={data?.floatIssues.pending ?? 0}
        loading={loading && !data}
      />

      {/* Prospects Pipeline */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-gray-800 text-sm">Prospects Pipeline</h3>
        </div>
        {loading && !data ? (
          <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl py-3">
              <p className="text-xl font-bold text-gray-800">{data?.prospects.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="bg-green-50 rounded-xl py-3">
              <p className="text-xl font-bold text-green-700">{data?.prospects.converted}</p>
              <p className="text-xs text-green-600">Converted</p>
            </div>
            <div className="bg-amber-50 rounded-xl py-3">
              <p className="text-xl font-bold text-amber-700">{data?.prospects.pending}</p>
              <p className="text-xs text-amber-600">Follow-up</p>
            </div>
          </div>
        )}
      </Card>

      {/* Recent Activity */}
      {data && (data.recentActivity.agents.length > 0 || data.recentActivity.visits.length > 0) && (
        <Card className="mb-24">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {data.recentActivity.agents.slice(0, 3).map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-gray-50">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-4 h-4 text-zamtel-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{a.agentName}</p>
                  <p className="text-xs text-gray-500">{a.type === 'merchant' ? 'Merchant' : 'Agent'} · {a.town}</p>
                </div>
                <Badge color={a.type === 'merchant' ? 'bg-pink-100 text-zamtel-pink' : 'bg-green-100 text-zamtel-green'}>
                  {a.type}
                </Badge>
              </div>
            ))}
            {data.recentActivity.visits.slice(0, 2).map(v => (
              <div key={v.id} className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-blue-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{v.outletName}</p>
                  <p className="text-xs text-gray-500">Visit · {v.town}</p>
                </div>
                <Badge color="bg-blue-100 text-blue-700">visit</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* FAB */}
      <div className="fixed bottom-6 right-4 flex flex-col gap-2 items-end">
        <Link to="/tdr/agents/new" className="flex items-center gap-2">
          <span className="text-xs bg-white shadow-md rounded-full px-3 py-1.5 font-medium text-gray-700">Add Agent</span>
          <div className="w-10 h-10 zamtel-gradient rounded-full shadow-lg flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-white" />
          </div>
        </Link>
        <Link to="/tdr/visits/new" className="flex items-center gap-2">
          <span className="text-xs bg-white shadow-md rounded-full px-3 py-1.5 font-medium text-gray-700">Record Visit</span>
          <div className="w-10 h-10 bg-blue-600 rounded-full shadow-lg flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
        </Link>
        <Link to="/tdr/float-issues/new" className="flex items-center gap-2">
          <span className="text-xs bg-white shadow-md rounded-full px-3 py-1.5 font-medium text-gray-700">Report Float Issue</span>
          <div className="w-10 h-10 bg-amber-500 rounded-full shadow-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
        </Link>
        <Link to="/tdr/prospects/new" className="flex items-center gap-2">
          <span className="text-xs bg-white shadow-md rounded-full px-3 py-1.5 font-medium text-gray-700">Add Prospect</span>
          <div className="w-10 h-10 bg-purple-600 rounded-full shadow-lg flex items-center justify-center">
            <Plus className="w-5 h-5 text-white" />
          </div>
        </Link>
      </div>
    </Layout>
  );
};
