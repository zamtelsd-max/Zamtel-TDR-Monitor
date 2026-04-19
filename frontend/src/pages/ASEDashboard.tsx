import React, { useEffect, useState } from 'react';
import { Users, Eye, TrendingUp, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { aseApi } from '../services/api';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge } from '../components/UI';
import { useAppSelector } from '../hooks/useAppDispatch';

interface TDRStat {
  tdr:         { id: string; name: string; zone: string | null };
  agents:      number;
  visits:      number;
  floatIssues: number;
  prospects:   number;
}

export const ASEDashboardPage: React.FC = () => {
  const user     = useAppSelector(s => s.auth.user);
  const [stats,  setStats]   = useState<TDRStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [tdrData, setTdrData]   = useState<any>(null);
  const [tdrLoading, setTdrLoading] = useState(false);

  useEffect(() => {
    aseApi.dashboard()
      .then(r => setStats(r.data.tdrStats))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <Layout title="ASE Dashboard">
      <PageHeader
        title={`Welcome, ${user?.name}`}
        subtitle="Area Sales Executive — Read-only view"
      />

      {/* Summary Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="text-center">
          <p className="text-2xl font-black text-zamtel-green">{stats.length}</p>
          <p className="text-xs text-gray-500 mt-1">TDRs Assigned</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-black text-blue-600">
            {stats.reduce((s, t) => s + t.agents, 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Total Agents</p>
        </Card>
      </div>

      {/* TDR List */}
      <h3 className="font-semibold text-gray-700 text-sm mb-2 flex items-center gap-2">
        <Users className="w-4 h-4" /> My TDRs
      </h3>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : stats.length === 0 ? (
        <Card className="text-center py-8 text-gray-400">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No TDRs assigned yet.</p>
          <p className="text-xs mt-1">Ask your ZBM to assign TDRs to your account.</p>
        </Card>
      ) : (
        <div className="space-y-3 mb-24">
          {stats.map(({ tdr, agents, visits, floatIssues, prospects }) => (
            <div key={tdr.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer active:scale-95 transition-transform"
              onClick={() => viewTDR(tdr.id)}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-800">{tdr.name}</p>
                  <p className="text-xs text-gray-500">{tdr.zone || 'No zone'}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-zamtel-green font-medium">
                  <Eye className="w-3 h-3" /> View
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-green-50 rounded-lg py-2">
                  <p className="font-bold text-green-700">{agents}</p>
                  <p className="text-[10px] text-gray-500">Agents</p>
                </div>
                <div className="bg-blue-50 rounded-lg py-2">
                  <p className="font-bold text-blue-700">{visits}</p>
                  <p className="text-[10px] text-gray-500">Visits</p>
                </div>
                <div className={`rounded-lg py-2 ${floatIssues > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`font-bold ${floatIssues > 0 ? 'text-red-700' : 'text-gray-700'}`}>{floatIssues}</p>
                  <p className="text-[10px] text-gray-500">Issues</p>
                </div>
                <div className="bg-purple-50 rounded-lg py-2">
                  <p className="font-bold text-purple-700">{prospects}</p>
                  <p className="text-[10px] text-gray-500">Prospects</p>
                </div>
              </div>
            </div>
          ))}
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
                <h3 className="font-bold text-gray-800 text-lg mb-1">{tdrData.tdr.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{tdrData.tdr.zone || 'No zone'}</p>

                <h4 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Recent Agents ({tdrData.agents.length})
                </h4>
                <div className="space-y-1 mb-4">
                  {tdrData.agents.slice(0, 5).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-sm text-gray-800">{a.agentName}</p>
                      <Badge color={a.type === 'merchant' ? 'bg-pink-100 text-zamtel-pink' : 'bg-green-100 text-zamtel-green'}>
                        {a.type}
                      </Badge>
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
