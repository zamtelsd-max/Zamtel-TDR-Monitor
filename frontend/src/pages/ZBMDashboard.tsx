import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { zbmApi } from '../services/api';
import type { ZBMDashboard, TDRStat, FloatIssue } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge, Button } from '../components/UI';
import { ISSUE_TYPE_LABELS } from '../types';
import { format } from 'date-fns';
import { GeoMap } from '../components/GeoMap';

type SortKey = 'agents' | 'merchants' | 'visits' | 'floatIssues' | 'pct';
type SortDir = 'asc' | 'desc';

function pctColor(pct: number) {
  if (pct >= 80) return 'text-green-700 bg-green-100';
  if (pct >= 50) return 'text-amber-700 bg-amber-100';
  return 'text-red-700 bg-red-100';
}

export const ZBMDashboardPage: React.FC = () => {
  const [data,       setData]       = useState<ZBMDashboard | null>(null);
  const [issues,     setIssues]     = useState<FloatIssue[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [sortKey,    setSortKey]    = useState<SortKey>('pct');
  const [sortDir,    setSortDir]    = useState<SortDir>('desc');
  const [resolving,  setResolving]  = useState<string | null>(null);
  const [mapData,   setMapData]   = useState<{ agents: any[]; visits: any[] }>({ agents: [], visits: [] });

  const fetchData = async () => {
    try {
      const [dashRes, issuesRes, mapRes] = await Promise.all([
        zbmApi.dashboard(),
        zbmApi.getFloatIssues(),
        zbmApi.getMap(),
      ]);
      setData(dashRes.data);
      setIssues(issuesRes.data);
      if (mapRes.data?.data) setMapData(mapRes.data.data);
      localStorage.setItem('zamtel_zbm_dashboard', JSON.stringify(dashRes.data));
    } catch {
      const cached = localStorage.getItem('zamtel_zbm_dashboard');
      if (cached) setData(JSON.parse(cached) as ZBMDashboard);
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
        const av = a[sortKey] as number;
        const bv = b[sortKey] as number;
        return sortDir === 'asc' ? av - bv : bv - av;
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

  const progress = (count: number, target: number) =>
    Math.min(Math.round(count / Math.max(target, 1) * 100), 100);

  return (
    <Layout title="ZBM Dashboard">
      <PageHeader
        title={data ? `${data.zbm.zone} Zone` : 'Loading...'}
        subtitle={data ? `${data.zbm.name} · ${format(new Date(), 'MMMM yyyy')}` : ''}
      />

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
                  Issues <SortIcon col="floatIssues" />
                </th>
                <th className="text-right py-2 pl-2 font-medium cursor-pointer" onClick={() => handleSort('pct')}>
                  % <SortIcon col="pct" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTDRs.map((row: TDRStat) => (
                <tr key={row.tdr.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 pr-3 font-medium text-gray-800 truncate max-w-[100px]">{row.tdr.name}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700">{row.agents}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700">{row.merchants}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700">{row.visits}</td>
                  <td className="text-right py-2.5 px-2">
                    {row.floatIssues > 0 ? (
                      <span className="text-red-600 font-semibold">{row.floatIssues}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="text-right py-2.5 pl-2">
                    <span className={clsx('px-2 py-0.5 rounded-full font-semibold text-xs', pctColor(row.pct))}>
                      {row.pct}%
                    </span>
                  </td>
                </tr>
              ))}
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
      {/* GPS Field Map — zone scoped */}
      {mapData.agents.length > 0 && (
        <Card className="mb-4">
          <h3 className="font-semibold text-sm mb-3" style={{ color: '#00843D' }}>
            📍 Zone Field Map — Agents, Merchants & Visits
          </h3>
          <GeoMap
            agents={mapData.agents}
            visits={mapData.visits}
            height="420px"
            showVisits={true}
          />
        </Card>
      )}
    </Layout>
  );
};
