import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { zbmApi } from '../services/api';
import type { ZBMDashboard, TDRStat, FloatIssue, Prospect } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge, Button } from '../components/UI';
import { ISSUE_TYPE_LABELS } from '../types';
import { format } from 'date-fns';
import { GeoMap } from '../components/GeoMap';
import { getBand, calcWeightedScore, floatResolutionPct, WEIGHT_PCT, visitMtdTarget, prorateMtdTarget, workingDaysElapsed, workingDaysThisMonth } from '../utils/performance';

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
    agentPct:    Math.min(Math.round((row.agents    / prorateMtdTarget(96)) * 100), 100),
    merchantPct: Math.min(Math.round((row.merchants / prorateMtdTarget(96)) * 100), 100),
    floatPct,
    visitPct:    Math.min(Math.round((row.visits    / visitMtdTarget())      * 100), 100),
  });
}

export const ZBMDashboardPage: React.FC = () => {
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

      {/* MTD progress */}
      {(() => { const el = workingDaysElapsed(); const tot = workingDaysThisMonth(); const pct = Math.round(el/tot*100); return (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1 px-0.5">
            <span className="text-xs text-gray-500">📅 MTD — Working day <strong>{el}</strong> of <strong>{tot}</strong></span>
            <span className="text-xs font-semibold text-gray-600">{pct}% of month</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full">
            <div className="h-1.5 rounded-full bg-gray-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ); })()}

      {/* Export button */}
      <div className="flex justify-end mb-3">
        <Button size="sm" variant="secondary" loading={exporting} onClick={handleExport}
          className="flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Export Excel
        </Button>
      </div>

      {/* Zone KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {loading && !data ? (
          [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : (
          <>
            <Card>
              <p className="text-2xl font-bold text-zamtel-pink">{data?.zone.totals.agents}</p>
              <p className="text-xs text-gray-500">Agents Recruited</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full zamtel-gradient rounded-full transition-all"
                  style={{ width: `${progress(data?.zone.totals.agents || 0, data?.zone.targets.agents || 1)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {progress(data?.zone.totals.agents || 0, data?.zone.targets.agents || 1)}% of {data?.zone.targets.agents}
              </p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-blue-600">{data?.zone.totals.merchants}</p>
              <p className="text-xs text-gray-500">Merchants Recruited</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${progress(data?.zone.totals.merchants || 0, data?.zone.targets.merchants || 1)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {progress(data?.zone.totals.merchants || 0, data?.zone.targets.merchants || 1)}% of {data?.zone.targets.merchants}
              </p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-green-700">{data?.zone.totals.visits}</p>
              <p className="text-xs text-gray-500">Outlet Visits</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full transition-all"
                  style={{ width: `${progress(data?.zone.totals.visits || 0, data?.zone.targets.visits || 1)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {progress(data?.zone.totals.visits || 0, data?.zone.targets.visits || 1)}% of {data?.zone.targets.visits}
              </p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-amber-600">{data?.zone.totals.floatIssuesPending}</p>
              <p className="text-xs text-gray-500">Float Issues Pending</p>
            </Card>
          </>
        )}
      </div>

      {/* 🚩 STALE AGENTS — ZBM view */}
      {staleAgents.length > 0 && (
        <Card className="mb-4 border-l-4 border-red-500 bg-red-50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🚩</span>
            <h3 className="font-bold text-red-700 text-sm">Unvisited Outlets (5+ days)</h3>
            <span className="ml-auto bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {staleAgents.length}
            </span>
          </div>
          <p className="text-xs text-red-500 mb-3">Agents / Merchants not visited in 5+ days — TDR action required</p>
          <div className="space-y-2">
            {(showAllStale ? staleAgents : staleAgents.slice(0, 5)).map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 bg-white border border-red-100 rounded-xl px-3 py-2">
                <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 text-sm">🚩</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{a.agentName}</p>
                  <p className="text-xs text-gray-500">{a.type === 'merchant' ? '🏪 Merchant' : '👤 Agent'} · {a.town} · {a.tdrName || '—'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-red-600">
                    {a.daysAgo === null ? 'Never visited' : `${a.daysAgo}d ago`}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {a.lastVisitedAt ? new Date(a.lastVisitedAt).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {staleAgents.length > 5 && (
            <button onClick={() => setShowAllStale(s => !s)}
              className="mt-3 w-full text-xs text-red-600 font-semibold py-1.5 rounded-xl bg-red-100 hover:bg-red-200 transition">
              {showAllStale ? `Show less` : `Show all ${staleAgents.length} unvisited outlets`}
            </button>
          )}
        </Card>
      )}

      {/* TDR Performance Table */}
      <Card className="mb-4 overflow-x-auto">
        <h3 className="font-semibold text-zamtel-dark text-sm mb-3">TDR Performance</h3>
        {loading && !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left py-2 pr-3 font-medium">TDR</th>
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
              </tr>
            </thead>
            <tbody>
              {sortedTDRs.map((row: TDRStat) => {
                const sc = tdrScore(row);
                const b  = getBand(sc);
                return (
                <tr key={row.tdr.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 pr-3 font-medium text-gray-800 truncate max-w-[90px]">{row.tdr.name}</td>
                  <td className="text-right py-2.5 px-2">
                    <span className={clsx('text-xs', getBand(Math.min(Math.round(row.agents/prorateMtdTarget(96)*100),100)).color)}>{row.agents}</span>
                  </td>
                  <td className="text-right py-2.5 px-2">
                    <span className={clsx('text-xs', getBand(Math.min(Math.round(row.merchants/prorateMtdTarget(96)*100),100)).color)}>{row.merchants}</span>
                  </td>
                  <td className="text-right py-2.5 px-2">
                    <span className={clsx('text-xs', getBand(Math.min(Math.round(row.visits/visitMtdTarget()*100),100)).color)}>{row.visits}</span>
                  </td>
                  <td className="text-right py-2.5 px-2">
                    {row.floatIssues > 0
                      ? <span className="text-red-600 font-semibold text-xs">{row.floatIssues}</span>
                      : <span className="text-gray-400 text-xs">0</span>}
                  </td>
                  <td className="text-right py-2.5 px-2">
                    <span className={clsx('px-1.5 py-0.5 rounded-full font-semibold text-xs', pctColor(row.pct))}>
                      {row.pct}%
                    </span>
                  </td>
                  <td className="text-right py-2.5 pl-2">
                    <span className={clsx('px-2 py-0.5 rounded-full font-bold text-xs', b.bg, b.color)}>
                      {sc}%
                    </span>
                  </td>
                </tr>
                );
              })}
              {sortedTDRs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-6 text-gray-400">No TDRs in this zone</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {/* Float Issues */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-zamtel-dark text-sm">Pending Float Issues ({pendingIssues.length})</h3>
        </div>
        {pendingIssues.length === 0 ? (
          <div className="text-center py-6 text-gray-400 flex flex-col items-center gap-2">
            <CheckCircle className="w-8 h-8 text-green-400" />
            <p className="text-sm">All issues resolved</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingIssues.slice(0, 10).map(issue => (
              <div key={issue.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{issue.agentName}</p>
                    <p className="text-xs text-gray-500">{issue.agentCode} · {issue.tdrName}</p>
                    <p className="text-xs text-gray-600 mt-1">{ISSUE_TYPE_LABELS[issue.issueType]}: {issue.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Float: ZMW {issue.reportedFloat.toLocaleString()} · {format(new Date(issue.reportedAt), 'dd MMM HH:mm')}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                    <Badge color={issue.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}>
                      {issue.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={resolving === issue.id}
                      onClick={() => handleResolve(issue.id)}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Prospects awaiting closure approval */}
      {prospects.filter(p => p.closedByTdr && p.status !== 'converted').length > 0 && (
        <Card className="mb-4 border-l-4 border-amber-400">
          <h3 className="font-semibold text-amber-800 text-sm mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Awaiting Closure Approval ({prospects.filter(p => p.closedByTdr && p.status !== 'converted').length})
          </h3>
          <div className="space-y-2">
            {prospects.filter(p => p.closedByTdr && p.status !== 'converted').map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-amber-50 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.businessName}</p>
                  <p className="text-xs text-gray-500">{p.tdrName} · {p.prospectType}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await zbmApi.approveProspectClosure(p.id);
                      toast.success(`Approved closure for ${p.businessName}`);
                      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, status: 'converted' } : x));
                    } catch { toast.error('Approval failed'); }
                  }}
                  className="text-xs text-green-700 font-medium bg-green-100 px-3 py-1.5 rounded-lg whitespace-nowrap">
                  ✅ Approve
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Prospects Breakdown */}
      {data && data.prospectsBreakdown.length > 0 && (
        <Card className="mb-4">
          <h3 className="font-semibold text-zamtel-dark text-sm mb-3">Prospects by Status</h3>
          <div className="flex flex-wrap gap-2">
            {data.prospectsBreakdown.map(p => (
              <div key={p.status} className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-lg font-bold text-gray-800">{p._count}</span>
                <span className="text-xs text-gray-500 capitalize">{p.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {/* GPS Field Map */}
      <Card className="mb-4">
        <h3 className="font-semibold text-sm mb-3" style={{ color: '#00843D' }}>
          📍 {data?.zbm.zone ? `${data.zbm.zone} Zone` : 'National'} Field Map — Agents, Merchants & Visits
        </h3>
        {loading && !mapData.agents.length ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            Loading map data…
          </div>
        ) : mapData.agents.length > 0 || mapData.visits.length > 0 ? (
          <GeoMap
            agents={mapData.agents}
            visits={mapData.visits}
            height="460px"
            showVisits={true}
          />
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
            No GPS data available yet
          </div>
        )}
      </Card>
    </Layout>
  );
};
