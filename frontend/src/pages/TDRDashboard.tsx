import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, UserPlus, MapPin, AlertTriangle, Target, Download, Wifi, WifiOff, Clock, CheckCircle, Trash2, Activity, Eye, X, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { tdrApi, getQueue, syncQueue } from '../services/api';
import type { TDRDashboard, FloatIssue, Prospect, Agent, Visit } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, ProgressRing, Skeleton, Badge } from '../components/UI';
import { format, formatDistanceToNow } from 'date-fns';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
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
  const [floatIssues, setFloatIssues] = useState<FloatIssue[]>([]);
  const [prospects,   setProspects]   = useState<Prospect[]>([]);
  const [activities,  setActivities]  = useState<Array<{ type: string; id: string; label: string; sub: string; ts: string }>>([]);
  const [queueCount,  setQueueCount]  = useState(0);
  const [syncing,     setSyncing]     = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const isOnline = useOnlineStatus();

  // Visit summary
  const [visitSummary, setVisitSummary] = useState<{ weekly: Array<{ label: string; count: number }>; monthly: Array<{ label: string; count: number }> } | null>(null);

  // Agent detail drawer
  const [agentDetail, setAgentDetail] = useState<(Agent & { visits: Visit[] }) | null>(null);
  const [agentDetailLoading, setAgentDetailLoading] = useState(false);

  // Prospect edit modal
  const [editProspect, setEditProspect] = useState<Prospect | null>(null);
  const [editForm, setEditForm] = useState({ status: '', notes: '', followUpDate: '' });
  const [editSaving, setEditSaving] = useState(false);

  const refresh = () => {
    const cached = localStorage.getItem('zamtel_tdr_dashboard');
    if (cached) { try { setData(JSON.parse(cached) as TDRDashboard); } catch {} }
    tdrApi.dashboard()
      .then(res => { setData(res.data); localStorage.setItem('zamtel_tdr_dashboard', JSON.stringify(res.data)); })
      .catch(() => toast.error('Could not refresh dashboard'))
      .finally(() => setLoading(false));
    tdrApi.getFloatIssues().then(r => setFloatIssues(r.data)).catch(() => {});
    tdrApi.getProspects().then(r => setProspects(r.data)).catch(() => {});
    tdrApi.getActivities().then(r => setActivities(r.data)).catch(() => {});
    tdrApi.getVisitSummary().then(r => setVisitSummary(r.data)).catch(() => {});
    getQueue().then(q => setQueueCount(q.length)).catch(() => {});
  };

  useEffect(() => {
    refresh();
    // Daily browser notification for follow-up prospects
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []); // eslint-disable-line

  // Check follow-up prospects and notify
  useEffect(() => {
    if (!prospects.length) return;
    const today = new Date().toISOString().split('T')[0];
    const due = prospects.filter(p =>
      p.followUpDate && p.followUpDate.split('T')[0] <= today &&
      p.status !== 'converted' && p.status !== 'rejected'
    );
    if (due.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`Zamtel TDR — ${due.length} prospect(s) need follow-up today`, {
        body: due.map(p => p.businessName).join(', '),
        icon: '/icons/icon-192x192.png',
      });
    }
  }, [prospects]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const count = await syncQueue();
      setQueueCount(0);
      toast.success(`Synced ${count} offline ${count === 1 ? 'entry' : 'entries'}`);
      refresh();
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await tdrApi.export();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `TDR-Export-${new Date().toISOString().slice(0,7)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleMarkResolved = async (id: string) => {
    try {
      await tdrApi.updateFloatIssue(id, { status: 'resolved' } as any);
      toast.success('Marked as resolved');
      setFloatIssues(prev => prev.map(f => f.id === id ? { ...f, status: 'resolved' } : f));
      refresh();
    } catch { toast.error('Failed to update'); }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    try {
      await tdrApi.deleteAgent(id);
      toast.success('Agent deleted');
      refresh();
    } catch { toast.error('Delete failed'); }
  };

  const handleRequestClosure = async (id: string, name: string) => {
    if (!confirm(`Request closure approval from ZBM for "${name}"?`)) return;
    try {
      await tdrApi.requestProspectClosure(id);
      toast.success('Closure request sent to ZBM');
      setProspects(prev => prev.map(p => p.id === id ? { ...p, closedByTdr: true } : p));
    } catch { toast.error('Failed to request closure'); }
  };

  const openAgentDetail = async (id: string) => {
    setAgentDetailLoading(true);
    setAgentDetail(null);
    try {
      const res = await tdrApi.getAgentDetail(id);
      setAgentDetail(res.data);
    } catch { toast.error('Could not load agent details'); }
    finally { setAgentDetailLoading(false); }
  };

  const openEditProspect = (p: Prospect) => {
    setEditProspect(p);
    setEditForm({
      status: p.status,
      notes: p.notes || '',
      followUpDate: p.followUpDate ? new Date(p.followUpDate).toISOString().split('T')[0] : '',
    });
  };

  const handleSaveProspect = async () => {
    if (!editProspect) return;
    setEditSaving(true);
    try {
      const res = await tdrApi.updateProspect(editProspect.id, {
        status: editForm.status as Prospect['status'],
        notes: editForm.notes,
        followUpDate: editForm.followUpDate ? editForm.followUpDate : undefined,
      });
      setProspects(prev => prev.map(p => p.id === editProspect.id ? res.data : p));
      toast.success('Prospect updated');
      setEditProspect(null);
    } catch { toast.error('Update failed'); }
    finally { setEditSaving(false); }
  };

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

      {/* ── OFFLINE BANNER ───────────────────────────────────────── */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 text-sm text-amber-800">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>You're offline. Entries will be queued and synced when you reconnect.</span>
        </div>
      )}
      {isOnline && queueCount > 0 && (
        <button onClick={handleSync} disabled={syncing}
          className="w-full flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-3 text-sm text-blue-800 disabled:opacity-60">
          <span className="flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            {syncing ? 'Syncing…' : `${queueCount} pending offline ${queueCount === 1 ? 'entry' : 'entries'} — Tap to sync`}
          </span>
        </button>
      )}

      {/* ── EXPORT BUTTON ────────────────────────────────────────── */}
      <button onClick={handleExport} disabled={exporting}
        className="w-full flex items-center justify-center gap-2 bg-zamtel-green/10 text-zamtel-green border border-zamtel-green/20 rounded-xl px-3 py-2 mb-4 text-sm font-medium disabled:opacity-60">
        <Download className="w-4 h-4" />
        {exporting ? 'Preparing…' : 'Export My Data (Excel)'}
      </button>

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

      {/* ── VISIT SUMMARY ────────────────────────────────────────── */}
      {visitSummary && (
        <Card className="mb-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" /> Visitation Summary
          </h3>

          {/* Weekly bar chart */}
          <p className="text-xs text-gray-500 mb-2 font-medium">Weekly (last 8 weeks)</p>
          <div className="flex items-end gap-1 h-16 mb-4">
            {visitSummary.weekly.map((w, i) => {
              const max = Math.max(...visitSummary.weekly.map(x => x.count), 1);
              const pct = Math.round((w.count / max) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-gray-500">{w.count > 0 ? w.count : ''}</span>
                  <div className="w-full rounded-t-sm bg-blue-500" style={{ height: `${Math.max(pct, 3)}%`, minHeight: w.count > 0 ? '4px' : '2px', opacity: i === visitSummary.weekly.length - 1 ? 1 : 0.6 }} />
                  <span className="text-[8px] text-gray-400 truncate w-full text-center">{w.label}</span>
                </div>
              );
            })}
          </div>

          {/* Monthly bar chart */}
          <p className="text-xs text-gray-500 mb-2 font-medium">Monthly (last 6 months)</p>
          <div className="flex items-end gap-1.5 h-14">
            {visitSummary.monthly.map((m, i) => {
              const max = Math.max(...visitSummary.monthly.map(x => x.count), 1);
              const pct = Math.round((m.count / max) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-gray-500">{m.count > 0 ? m.count : ''}</span>
                  <div className="w-full rounded-t-sm bg-zamtel-green" style={{ height: `${Math.max(pct, 3)}%`, minHeight: m.count > 0 ? '4px' : '2px', opacity: i === visitSummary.monthly.length - 1 ? 1 : 0.6 }} />
                  <span className="text-[9px] text-gray-400 truncate w-full text-center">{m.label}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── PENDING FLOAT ISSUES ─────────────────────────────────── */}
      {floatIssues.filter(f => f.status !== 'resolved').length > 0 && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="font-semibold text-gray-800 text-sm">Pending Float Issues</h3>
            <span className="ml-auto bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {floatIssues.filter(f => f.status !== 'resolved').length}
            </span>
          </div>
          <div className="space-y-2">
            {floatIssues.filter(f => f.status !== 'resolved').map(f => (
              <div key={f.id} className="flex items-center gap-3 bg-red-50 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.agentName}</p>
                  <p className="text-xs text-gray-500">{f.issueType.replace(/_/g,' ')} · {f.status}</p>
                </div>
                {f.status !== 'resolved' && (
                  <button onClick={() => handleMarkResolved(f.id)}
                    className="flex items-center gap-1 text-xs text-green-700 font-medium bg-green-100 px-2 py-1 rounded-lg whitespace-nowrap">
                    <CheckCircle className="w-3 h-3" /> Resolved
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── PROSPECTS PIPELINE DETAIL ────────────────────────────── */}
      {prospects.length > 0 && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold text-gray-800 text-sm">Prospects</h3>
          </div>
          <div className="space-y-2">
            {prospects.filter(p => p.status !== 'converted' && p.status !== 'rejected').slice(0, 5).map(p => {
              const isOverdue = p.followUpDate && new Date(p.followUpDate) < new Date() && p.status !== 'converted';
              return (
                <div key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isOverdue ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.businessName}</p>
                    <p className="text-xs text-gray-500">
                      {p.status}
                      {p.followUpDate && ` · Follow-up: ${new Date(p.followUpDate).toLocaleDateString()}`}
                      {isOverdue && ' ⚠️ Overdue'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEditProspect(p)}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-600" title="Edit prospect">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {p.closedByTdr ? (
                      <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-lg">Awaiting ZBM</span>
                    ) : (
                      <button onClick={() => handleRequestClosure(p.id, p.businessName)}
                        className="text-xs text-green-700 font-medium bg-green-100 px-2 py-1 rounded-lg whitespace-nowrap">
                        Close Deal
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── FULL ACTIVITIES FEED ─────────────────────────────────── */}
      {activities.length > 0 && (
        <Card className="mb-24">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-gray-600" />
            <h3 className="font-semibold text-gray-800 text-sm">Recent Activity</h3>
          </div>
          <div className="space-y-2">
            {activities.map(a => {
              const iconMap: Record<string, React.ReactNode> = {
                agent:   <UserPlus className="w-4 h-4 text-zamtel-green" />,
                visit:   <MapPin className="w-4 h-4 text-blue-600" />,
                float:   <AlertTriangle className="w-4 h-4 text-red-500" />,
                prospect:<Target className="w-4 h-4 text-purple-600" />,
              };
              const bgMap: Record<string, string> = {
                agent: 'bg-green-100', visit: 'bg-blue-100', float: 'bg-red-100', prospect: 'bg-purple-100',
              };
              return (
                <div key={`${a.type}-${a.id}`} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`w-8 h-8 ${bgMap[a.type] || 'bg-gray-100'} rounded-full flex items-center justify-center flex-shrink-0`}>
                    {iconMap[a.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.label}</p>
                    <p className="text-xs text-gray-500">{a.sub}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {a.type === 'agent' && (
                      <button onClick={() => openAgentDetail(a.id)}
                        className="p-1.5 rounded-lg bg-green-50 text-zamtel-green" title="View agent">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-0.5" />
                      {formatDistanceToNow(new Date(a.ts), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              );
            })}
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

      {/* ── AGENT DETAIL DRAWER ──────────────────────────────────── */}
      {(agentDetail || agentDetailLoading) && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setAgentDetail(null)}>
          <div className="mt-auto bg-white rounded-t-3xl max-h-[80vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-800">Agent Details</h2>
              <button onClick={() => setAgentDetail(null)} className="p-2 rounded-full bg-gray-100">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            {agentDetailLoading && <p className="text-center text-gray-400 py-8">Loading…</p>}
            {agentDetail && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: 'Name',    value: agentDetail.agentName },
                    { label: 'Code',    value: agentDetail.agentCode },
                    { label: 'Type',    value: agentDetail.type },
                    { label: 'Phone',   value: agentDetail.contactPhone },
                    { label: 'Town',    value: agentDetail.town },
                    { label: 'Float',   value: `K${Number(agentDetail.initialFloat).toLocaleString()}` },
                    { label: 'Zone',    value: agentDetail.zone },
                    { label: 'Added',   value: new Date(agentDetail.createdAt).toLocaleDateString() },
                  ].map(f => (
                    <div key={f.label} className="bg-gray-50 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{f.label}</p>
                      <p className="text-sm font-semibold text-gray-800 truncate">{f.value || '—'}</p>
                    </div>
                  ))}
                </div>
                {agentDetail.notes && (
                  <div className="bg-amber-50 rounded-xl px-3 py-2 mb-4">
                    <p className="text-[10px] text-amber-600 uppercase tracking-wide font-semibold">Notes</p>
                    <p className="text-sm text-gray-700">{agentDetail.notes}</p>
                  </div>
                )}
                <h3 className="font-semibold text-sm text-gray-700 mb-2">Recent Visits ({agentDetail.visits.length})</h3>
                {agentDetail.visits.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No visits recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {agentDetail.visits.map(v => (
                      <div key={v.id} className="flex items-center gap-3 bg-blue-50 rounded-xl px-3 py-2">
                        <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{v.outletName}</p>
                          <p className="text-xs text-gray-500">{v.town} · K{Number(v.floatAmount).toLocaleString()}</p>
                        </div>
                        <span className="text-[10px] text-gray-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── PROSPECT EDIT MODAL ──────────────────────────────────── */}
      {editProspect && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setEditProspect(null)}>
          <div className="w-full bg-white rounded-t-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-800">Edit Prospect</h2>
              <button onClick={() => setEditProspect(null)} className="p-2 rounded-full bg-gray-100">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-4">{editProspect.businessName}</p>

            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select value={editForm.status}
              onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-zamtel-green">
              {['new','contacted','interested','follow_up','converted','rejected'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
              ))}
            </select>

            <label className="block text-xs font-medium text-gray-600 mb-1">Follow-up Date</label>
            <input type="date" value={editForm.followUpDate}
              onChange={e => setEditForm(f => ({ ...f, followUpDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-zamtel-green" />

            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea rows={3} value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-zamtel-green resize-none"
              placeholder="Add notes…" />

            <button onClick={handleSaveProspect} disabled={editSaving}
              className="w-full py-3 rounded-2xl font-bold text-white text-sm disabled:opacity-60"
              style={{ background: '#00843D' }}>
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

    </Layout>
  );
};
