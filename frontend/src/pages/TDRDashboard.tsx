import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, UserPlus, MapPin, AlertTriangle, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { tdrApi } from '../services/api';
import type { TDRDashboard } from '../types';
import { Layout, PageHeader } from '../components/Layout';
import { Card, ProgressRing, Skeleton, Badge, StatCard } from '../components/UI';
import { format } from 'date-fns';

export const TDRDashboardPage: React.FC = () => {
  const [data,    setData]    = useState<TDRDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem('zamtel_tdr_dashboard');
    if (cached) {
      try { setData(JSON.parse(cached) as TDRDashboard); } catch {}
    }

    tdrApi.dashboard()
      .then(res => {
        setData(res.data);
        localStorage.setItem('zamtel_tdr_dashboard', JSON.stringify(res.data));
      })
      .catch(() => toast.error('Could not refresh dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const agentPct    = data ? Math.round(data.stats.agents.count    / data.stats.agents.target    * 100) : 0;
  const merchantPct = data ? Math.round(data.stats.merchants.count / data.stats.merchants.target * 100) : 0;
  const visitPct    = data ? Math.round(data.stats.visits.count    / data.stats.visits.target    * 100) : 0;

  return (
    <Layout title="TDR Dashboard">
      {/* Header */}
      <PageHeader
        title={data?.tdr.name || 'My Dashboard'}
        subtitle={`${data?.tdr.zone || ''} · ${format(new Date(), 'MMMM yyyy')}`}
      />

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {loading && !data ? (
          [0, 1, 2].map(i => (
            <Card key={i} className="flex flex-col items-center py-3">
              <Skeleton className="w-16 h-16 rounded-full mb-2" />
              <Skeleton className="h-3 w-16" />
            </Card>
          ))
        ) : (
          <>
            <Card className="flex flex-col items-center py-3">
              <ProgressRing
                value={agentPct}
                size={72}
                color="#E2231A"
                label="Agents"
                sublabel={`${data?.stats.agents.count}/${data?.stats.agents.target}`}
              />
            </Card>
            <Card className="flex flex-col items-center py-3">
              <ProgressRing
                value={merchantPct}
                size={72}
                color="#2563EB"
                label="Merchants"
                sublabel={`${data?.stats.merchants.count}/${data?.stats.merchants.target}`}
              />
            </Card>
            <Card className="flex flex-col items-center py-3">
              <ProgressRing
                value={visitPct}
                size={72}
                color="#16A34A"
                label="Outlets"
                sublabel={`${data?.stats.visits.count}/${data?.stats.visits.target}`}
              />
            </Card>
          </>
        )}
      </div>

      {/* Float Issues */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-zamtel-pink" />
          <h3 className="font-semibold text-zamtel-dark text-sm">Float Issues</h3>
        </div>
        {loading && !data ? (
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl py-3">
              <p className="text-xl font-bold text-gray-800">{data?.floatIssues.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="bg-green-50 rounded-xl py-3">
              <p className="text-xl font-bold text-green-700">{data?.floatIssues.resolved}</p>
              <p className="text-xs text-green-600">Resolved</p>
            </div>
            <div className="bg-red-50 rounded-xl py-3">
              <p className="text-xl font-bold text-red-700">{data?.floatIssues.pending}</p>
              <p className="text-xs text-red-600">Pending</p>
            </div>
          </div>
        )}
      </Card>

      {/* Prospects Pipeline */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-zamtel-dark text-sm">Prospects Pipeline</h3>
        </div>
        {loading && !data ? (
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
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
          <h3 className="font-semibold text-zamtel-dark text-sm mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {data.recentActivity.agents.slice(0, 3).map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-gray-50">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-4 h-4 text-zamtel-pink" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{a.agentName}</p>
                  <p className="text-xs text-gray-500">{a.type === 'merchant' ? 'Merchant' : 'Agent'} · {a.town}</p>
                </div>
                <Badge color={a.type === 'merchant' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}>
                  {a.type}
                </Badge>
              </div>
            ))}
            {data.recentActivity.visits.slice(0, 2).map(v => (
              <div key={v.id} className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-green-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{v.outletName}</p>
                  <p className="text-xs text-gray-500">Visit · {v.town}</p>
                </div>
                <Badge color="bg-green-100 text-green-700">visit</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* FAB / Quick Actions */}
      <div className="fixed bottom-6 right-4 flex flex-col-reverse gap-3">
        <div className="flex flex-col gap-2 items-end">
          <Link to="/tdr/agents/new" className="flex items-center gap-2">
            <span className="text-xs bg-white shadow-md rounded-full px-3 py-1.5 font-medium text-gray-700">Add Agent</span>
            <div className="w-10 h-10 zamtel-gradient rounded-full shadow-lg flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
          </Link>
          <Link to="/tdr/visits/new" className="flex items-center gap-2">
            <span className="text-xs bg-white shadow-md rounded-full px-3 py-1.5 font-medium text-gray-700">Record Visit</span>
            <div className="w-10 h-10 bg-green-600 rounded-full shadow-lg flex items-center justify-center">
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
            <div className="w-10 h-10 bg-blue-600 rounded-full shadow-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
          </Link>
        </div>
      </div>
    </Layout>
  );
};
