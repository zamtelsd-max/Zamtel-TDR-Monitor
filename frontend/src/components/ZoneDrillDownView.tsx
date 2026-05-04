/**
 * ZoneDrillDownView
 * Renders the complete ZBM dashboard for a given zone, accessible to HSD users.
 * Passes ?zone=<zone> to all ZBM API endpoints so data is scoped correctly.
 */
import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, RefreshCw, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { zbmApi, flagsApi } from '../services/api';
import type { ZBMDashboard, FloatIssue, Prospect, TDRFlag } from '../types';
import { Layout, PageHeader } from './Layout';
import { Card, Skeleton, Badge, Button } from './UI';
import { ISSUE_TYPE_LABELS } from '../types';
import { GeoMap } from './GeoMap';
import { format } from 'date-fns';
import {
  getBand, calcWeightedScore, floatResolutionPct,
  prorateMtdTarget, visitMtdTarget,
} from '../utils/performance';

interface Props {
  zone: string;
  onBack: () => void;
}

function tdrScore(row: any): number {
  return calcWeightedScore({
    agentPct:    Math.min(Math.round((row.agents    / prorateMtdTarget(96)) * 100), 100),
    merchantPct: Math.min(Math.round((row.merchants / prorateMtdTarget(96)) * 100), 100),
    floatPct:    floatResolutionPct(row.floatResolved ?? 0, row.floatTotal ?? row.floatIssues ?? 0),
    visitPct:    Math.min(Math.round((row.visits    / visitMtdTarget())      * 100), 100),
  });
}

export const ZoneDrillDownView: React.FC<Props> = ({ zone, onBack }) => {
  const [data,      setData]      = useState<ZBMDashboard | null>(null);
  const [issues,    setIssues]    = useState<FloatIssue[]>([]);
  const [mapData,   setMapData]   = useState<{ agents: any[]; visits: any[] }>({ agents: [], visits: [] });
  const [loading,   setLoading]   = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tdrFlags,  setTdrFlags]  = useState<TDRFlag[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'tdrs' | 'issues' | 'flags'>('overview');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dashRes, issuesRes, mapRes, flagsRes] = await Promise.all([
        zbmApi.dashboard(zone),
        zbmApi.getFloatIssues(zone),
        zbmApi.getMap(zone),
        flagsApi.get().catch(() => ({ data: { data: [] } })),
      ]);
      setData(dashRes.data);
      setIssues(Array.isArray(issuesRes.data) ? issuesRes.data : []);
      if (mapRes.data?.data) setMapData(mapRes.data.data);
      const allFlags: TDRFlag[] = flagsRes.data.data ?? [];
      setTdrFlags(allFlags.filter((f: TDRFlag) => f.zone === zone));
    } catch (err) {
      toast.error(`Failed to load ${zone} dashboard`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchAll(); }, [zone]);

  const handleResolve = async (issueId: string, notes: string) => {
    setResolving(issueId);
    try {
      await zbmApi.updateFloatIssue(issueId, { status: 'resolved', resolutionNotes: notes });
      setIssues(prev => prev.filter(i => i.id !== issueId));
      toast.success('Issue resolved');
    } catch {
      toast.error('Failed to resolve issue');
    } finally {
      setResolving(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await zbmApi.export(undefined, zone);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zamtel-tdr-${zone.replace(/\s+/g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const openIssues = issues.filter(i => i.status !== 'resolved');
  const tdrStats = data?.tdrStats ?? [];

  const TABS = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'tdrs',     label: `👥 TDRs (${tdrStats.length})` },
    { key: 'issues',   label: `⚠️ Float Issues (${openIssues.length})` },
    { key: 'flags',    label: `🚩 Flags${tdrFlags.length > 0 ? ` (${tdrFlags.length})` : ''}` },
  ] as const;

  return (
    <Layout
      title={`${zone} — Zone Dashboard`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" loading={exporting} onClick={handleExport}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export
          </Button>
          <Button size="sm" variant="secondary" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      }
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zamtel-green font-semibold mb-4 hover:opacity-80"
      >
        <ArrowLeft className="w-4 h-4" /> Back to National Overview
      </button>

      <PageHeader
        title={zone}
        subtitle={`Zone Dashboard • ${data?.month ?? '—'}`}
      >
        <Link to="/leaderboard" className="text-xs text-zamtel-green font-semibold flex items-center gap-1 hover:underline">
          <Trophy className="w-3.5 h-3.5" /> Leaderboard
        </Link>
      </PageHeader>

      {/* KPI Cards */}
      {loading && !data ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Agents MTD</p>
            <p className="text-2xl font-bold text-zamtel-green">{data.zone.totals.agents}</p>
            <p className="text-xs text-gray-400">Target: {data.zone.targets.agents}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Merchants MTD</p>
            <p className="text-2xl font-bold text-blue-600">{data.zone.totals.merchants}</p>
            <p className="text-xs text-gray-400">Target: {data.zone.targets.merchants}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Visits MTD</p>
            <p className="text-2xl font-bold text-purple-600">{data.zone.totals.visits}</p>
            <p className="text-xs text-gray-400">Target: {data.zone.targets.visits}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Open Float Issues</p>
            <p className={clsx('text-2xl font-bold', data.zone.totals.floatIssuesPending > 0 ? 'text-red-600' : 'text-gray-400')}>
              {data.zone.totals.floatIssuesPending}
            </p>
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={clsx(
              'px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors',
              activeTab === t.key
                ? 'bg-zamtel-green text-white shadow'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* GPS Map */}
          <Card className="mb-4">
            <h3 className="font-semibold text-zamtel-dark text-sm mb-3">Field Map — {zone}</h3>
            {loading ? <Skeleton className="h-64" /> : (
              <GeoMap agents={mapData.agents} visits={mapData.visits} height={320} />
            )}
          </Card>

          {/* Critical float alerts */}
          {openIssues.length > 0 && (
            <Card className="mb-4 border-l-4 border-red-500">
              <h3 className="font-semibold text-red-700 text-sm mb-3">
                ⚠️ Open Float Issues ({openIssues.length})
              </h3>
              <div className="space-y-2">
                {openIssues.slice(0, 5).map(issue => (
                  <div key={issue.id} className="bg-red-50 rounded-xl p-3 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-red-800">{issue.agentName} · {issue.agentCode}</p>
                        <p className="text-red-600">{ISSUE_TYPE_LABELS[issue.issueType as keyof typeof ISSUE_TYPE_LABELS] || issue.issueType} · TDR: {issue.tdrName}</p>
                        <p className="text-gray-600 mt-1 line-clamp-2">{issue.description}</p>
                      </div>
                      <Badge variant="error" size="xs">K{issue.reportedFloat}</Badge>
                    </div>
                  </div>
                ))}
                {openIssues.length > 5 && (
                  <button onClick={() => setActiveTab('issues')} className="text-xs text-zamtel-green font-semibold">
                    View all {openIssues.length} issues →
                  </button>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── TDRs Tab ──────────────────────────────────────────────── */}
      {activeTab === 'tdrs' && (
        <Card className="overflow-x-auto">
          <h3 className="font-semibold text-zamtel-dark text-sm mb-3">TDR Performance — {zone}</h3>
          {loading ? (
            <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left py-2 pr-3 font-medium">TDR Name</th>
                  <th className="text-right py-2 px-2">Agents</th>
                  <th className="text-right py-2 px-2">Mrch</th>
                  <th className="text-right py-2 px-2">Visits</th>
                  <th className="text-right py-2 px-2">Float</th>
                  <th className="text-right py-2 pl-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {[...tdrStats]
                  .sort((a, b) => tdrScore(b) - tdrScore(a))
                  .map((row: any) => {
                    const sc = tdrScore(row);
                    const b = getBand(sc);
                    return (
                      <tr key={row.tdr.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 pr-3 font-medium text-gray-800">{row.tdr.name}</td>
                        <td className="text-right py-2.5 px-2">
                          <span className={getBand(Math.min(Math.round(row.agents/prorateMtdTarget(96)*100),100)).color}>{row.agents}</span>
                        </td>
                        <td className="text-right py-2.5 px-2">
                          <span className={getBand(Math.min(Math.round(row.merchants/prorateMtdTarget(96)*100),100)).color}>{row.merchants}</span>
                        </td>
                        <td className="text-right py-2.5 px-2">
                          <span className={getBand(Math.min(Math.round(row.visits/visitMtdTarget()*100),100)).color}>{row.visits}</span>
                        </td>
                        <td className="text-right py-2.5 px-2">
                          {row.floatIssues > 0
                            ? <span className="text-red-600 font-semibold">{row.floatIssues}</span>
                            : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="text-right py-2.5 pl-2">
                          <span className={clsx('px-2 py-0.5 rounded-full font-bold text-xs', b.bg, b.color)}>
                            {sc}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Float Issues Tab ──────────────────────────────────────── */}
      {activeTab === 'issues' && (
        <div className="space-y-3">
          {loading ? (
            [0,1,2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)
          ) : openIssues.length === 0 ? (
            <Card><p className="text-center text-gray-500 text-sm py-6">No open float issues ✅</p></Card>
          ) : openIssues.map(issue => (
            <Card key={issue.id} className="border-l-4 border-amber-400">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{issue.agentName}</p>
                  <p className="text-xs text-gray-500">{issue.agentCode} · {issue.tdrName}</p>
                </div>
                <Badge variant="warning" size="xs">
                  {ISSUE_TYPE_LABELS[issue.issueType as keyof typeof ISSUE_TYPE_LABELS] || issue.issueType}
                </Badge>
              </div>
              <p className="text-xs text-gray-600 mb-3">{issue.description}</p>
              <div className="flex gap-2">
                <button
                  disabled={resolving === issue.id}
                  onClick={() => {
                    const notes = prompt('Resolution notes (optional):') ?? '';
                    handleResolve(issue.id, notes);
                  }}
                  className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {resolving === issue.id ? 'Resolving…' : '✓ Mark Resolved'}
                </button>
                <span className="text-xs text-gray-400 self-center">
                  {format(new Date(issue.reportedAt), 'dd MMM HH:mm')}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Flags Tab ────────────────────────────────────────────── */}
      {activeTab === 'flags' && (
        <div className="space-y-3">
          {loading ? (
            [0,1,2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)
          ) : tdrFlags.length === 0 ? (
            <Card><p className="text-center text-gray-500 text-sm py-6">No red flags for {zone} ✅</p></Card>
          ) : tdrFlags.map(flag => (
            <Card key={flag.id} className={clsx('border-l-4', flag.severity === 'critical' ? 'border-red-500' : 'border-amber-400')}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{flag.tdrName}</p>
                  <p className="text-xs text-gray-500">{flag.tdrId} · {flag.zone}</p>
                  <p className="text-xs text-gray-700 mt-1">{flag.message}</p>
                </div>
                <Badge variant={flag.severity === 'critical' ? 'error' : 'warning'} size="xs">
                  {flag.severity}
                </Badge>
              </div>
              <p className="text-xs text-gray-400 mt-2">{format(new Date(flag.createdAt), 'dd MMM HH:mm')}</p>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
};
