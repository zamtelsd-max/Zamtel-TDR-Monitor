import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Download, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { hsdApi } from '../services/api';
import type { HSDDashboard, ZoneStat, FloatIssue } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge, Button, StatCard } from '../components/UI';
import { ISSUE_TYPE_LABELS } from '../types';
import { format, differenceInHours } from 'date-fns';
import { GeoMap } from '../components/GeoMap';

type SortKey = 'agents' | 'merchants' | 'visits' | 'floatIssues' | 'pct' | 'tdrs';
type SortDir = 'asc' | 'desc';

function pctColor(pct: number) {
  if (pct >= 80) return 'text-green-700 bg-green-100';
  if (pct >= 50) return 'text-amber-700 bg-amber-100';
  return 'text-red-700 bg-red-100';
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
        const d = JSON.parse(cached) as { dashboard: HSDDashboard; zones: ZoneStat[]; period: string };
        setDashboard(d.dashboard);
        setZones(d.zones);
        toast('Showing cached data', { icon: '📦' });
      } else {
        toast.error('Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, [period]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedZones = [...zones].sort((a, b) => {
    const av = (a as unknown as Record<string, number>)[sortKey];
    const bv = (b as unknown as Record<string, number>)[sortKey];
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
      a.download = `zamtel-tdr-export-${period}.csv`;
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

  return (
    <Layout
      title="National Dashboard"
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
          className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-zamtel-red"
          value={period}
          onChange={e => setPeriod(e.target.value)}
        >
          {monthOpts.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </PageHeader>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {loading && !dashboard ? (
          [0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : (
          <>
            <StatCard label="Agents Recruited"  value={dashboard?.kpis.totalAgents    || 0} color="text-zamtel-red"  loading={loading && !dashboard} />
            <StatCard label="Merchants"          value={dashboard?.kpis.totalMerchants || 0} color="text-blue-600"   loading={loading && !dashboard} />
            <StatCard label="Outlet Visits"      value={dashboard?.kpis.totalVisits    || 0} color="text-green-700"  loading={loading && !dashboard} />
            <StatCard label="Open Float Issues"  value={dashboard?.kpis.openFloatIssues || 0} color="text-amber-600" loading={loading && !dashboard} />
            <StatCard label="Conversion Rate"    value={`${dashboard?.kpis.conversionRate || 0}%`} color="text-purple-700" loading={loading && !dashboard} />
          </>
        )}
      </div>

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
                  Issues <SortIcon col="floatIssues" />
                </th>
                <th className="text-right py-2 pl-2 font-medium cursor-pointer" onClick={() => handleSort('pct')}>
                  % <SortIcon col="pct" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedZones.map((z: ZoneStat) => (
                <tr key={z.zone} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 pr-3 font-semibold text-gray-800">{z.zone}</td>
                  <td className="py-2.5 pr-3 text-gray-600 truncate max-w-[80px]">{z.zbm}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700">{z.tdrs}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700">{z.agents}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700">{z.merchants}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700">{z.visits}</td>
                  <td className="text-right py-2.5 px-2">
                    {z.floatIssues > 0
                      ? <span className="text-red-600 font-semibold">{z.floatIssues}</span>
                      : <span className="text-gray-400">0</span>
                    }
                  </td>
                  <td className="text-right py-2.5 pl-2">
                    <span className={clsx('px-2 py-0.5 rounded-full font-semibold text-xs', pctColor(z.pct))}>
                      {z.pct}%
                    </span>
                  </td>
                </tr>
              ))}
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
    </Layout>
  );
};
