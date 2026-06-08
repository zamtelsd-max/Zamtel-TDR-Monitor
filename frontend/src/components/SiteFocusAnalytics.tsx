import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from './UI';
import { AsePlannedVsActual } from './AsePlannedVsActual';
import { AseRankingByZone } from './AseRankingByZone';

interface Props { fetchAnalytics: () => Promise<{ data: any }>; }

export const SiteFocusAnalytics: React.FC<Props> = ({ fetchAnalytics }) => {
  const [a, setA] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = () => { setLoading(true); fetchAnalytics().then(r => setA(r.data)).catch(() => toast.error('Failed to load analytics')).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (loading && !a) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  if (!a) return <Card className="text-center py-6 text-gray-400 text-sm">No analytics available.</Card>;
  const s = a.summary || {}; const t = a.totals || {}; const at = a.attainment || {};
  const scColor = (v: number) => v >= 70 ? '#00843D' : v >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-gray-800">📊 Site Focus Analytics <span className="text-[10px] text-gray-400">· {a.scope}</span></h3>
        <button onClick={load} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
      </div>
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center"><p className="text-2xl font-black" style={{ color: '#00843D' }}>{s.visitedSites ?? 0}</p><p className="text-[10px] text-gray-400">Visited</p></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center"><p className="text-2xl font-black" style={{ color: '#0EA5E9' }}>{s.plannedSites ?? 0}</p><p className="text-[10px] text-gray-400">Planned</p></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center"><p className="text-2xl font-black" style={{ color: scColor(s.completionRate ?? 0) }}>{s.completionRate ?? 0}%</p><p className="text-[10px] text-gray-400">Completion</p></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center"><p className="text-xl font-black" style={{ color: scColor(s.avgSiteScore ?? 0) }}>{s.avgSiteScore ?? 0}%</p><p className="text-[10px] text-gray-400">Avg Site Score</p></div>
        <div className={`rounded-2xl border p-3 text-center ${(s.overdueSites ?? 0) > 0 ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-white'}`}><p className="text-xl font-black text-red-600">{s.overdueSites ?? 0}</p><p className="text-[10px] text-gray-400">🔴 Overdue</p></div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center"><p className="text-xl font-black text-gray-700">{s.activeAses ?? 0}</p><p className="text-[10px] text-gray-400">Active ASEs</p></div>
      </div>
      {/* Deliverable totals + attainment */}
      <Card className="p-4">
        <p className="text-xs font-bold text-gray-700 mb-2">Deliverables (visited sites)</p>
        {([
          ['Agents', t.agents, at.agents, '#00843D'],
          ['SSOs', t.ssos, at.ssos, '#2563EB'],
          ['ODRs', t.odrs, at.odrs, '#7C3AED'],
          ['Data Acts', t.dataActs, at.dataActs, '#F97316'],
          ['DTU (ZMW)', t.dtu, at.dtu, '#E4007C'],
          ['ZM Gross Adds', t.zmGa, at.zmGa, '#0891B2'],
        ] as [string, number, number, string][]).map(([l, val, pct, c]) => (
          <div key={l} className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-gray-500 w-20 shrink-0">{l}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct || 0}%`, background: c }} /></div>
            <span className="text-[10px] font-bold text-gray-700 w-16 text-right">{val ?? 0}</span>
            <span className="text-[10px] font-bold w-10 text-right" style={{ color: c }}>{pct || 0}%</span>
          </div>
        ))}
      </Card>
      {/* Zone achievement table (build-up: ASE → Zone) */}
      {(a.byZone || []).length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-700">🗺️ Achievement vs Target by Zone</p>
            <p className="text-[10px] text-gray-400">Rolled up from ASEs · % = actual vs per-site target across visited sites</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-3 py-2 font-semibold">Zone</th>
                  <th className="px-2 py-2 font-semibold text-center">ASEs</th>
                  <th className="px-2 py-2 font-semibold text-center">Sites</th>
                  <th className="px-2 py-2 font-semibold text-center">Agents</th>
                  <th className="px-2 py-2 font-semibold text-center">SSOs</th>
                  <th className="px-2 py-2 font-semibold text-center">ODRs</th>
                  <th className="px-2 py-2 font-semibold text-center">Data</th>
                  <th className="px-2 py-2 font-semibold text-center">DTU</th>
                  <th className="px-2 py-2 font-semibold text-center">ZM GA</th>
                  <th className="px-2 py-2 font-semibold text-center">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(a.byZone || []).map((z: any) => (
                  <tr key={z.zone} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{z.zone}</td>
                    <td className="px-2 py-2 text-center text-gray-500">{z.ases}</td>
                    <td className="px-2 py-2 text-center text-gray-600">{z.visited}/{z.totalSites}</td>
                    <td className="px-2 py-2 text-center font-bold" style={{ color: scColor(z.attainment.agents) }}>{z.attainment.agents}%</td>
                    <td className="px-2 py-2 text-center font-bold" style={{ color: scColor(z.attainment.ssos) }}>{z.attainment.ssos}%</td>
                    <td className="px-2 py-2 text-center font-bold" style={{ color: scColor(z.attainment.odrs) }}>{z.attainment.odrs}%</td>
                    <td className="px-2 py-2 text-center font-bold" style={{ color: scColor(z.attainment.dataActs) }}>{z.attainment.dataActs}%</td>
                    <td className="px-2 py-2 text-center font-bold" style={{ color: scColor(z.attainment.dtu) }}>{z.attainment.dtu}%</td>
                    <td className="px-2 py-2 text-center font-bold" style={{ color: scColor(z.attainment.zmGa) }}>{z.attainment.zmGa}%</td>
                    <td className="px-2 py-2 text-center font-black" style={{ color: scColor(z.avgScore) }}>{z.avgScore}%</td>
                  </tr>
                ))}
                {/* National/overall total row */}
                <tr className="bg-green-50 border-t-2 border-green-200 font-bold">
                  <td className="px-3 py-2 text-gray-800">{a.scope === 'National' ? '🇿🇲 NATIONAL' : 'TOTAL'}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.activeAses ?? 0}</td>
                  <td className="px-2 py-2 text-center text-gray-700">{s.visitedSites ?? 0}/{s.totalSites ?? 0}</td>
                  <td className="px-2 py-2 text-center" style={{ color: scColor(at.agents ?? 0) }}>{at.agents ?? 0}%</td>
                  <td className="px-2 py-2 text-center" style={{ color: scColor(at.ssos ?? 0) }}>{at.ssos ?? 0}%</td>
                  <td className="px-2 py-2 text-center" style={{ color: scColor(at.odrs ?? 0) }}>{at.odrs ?? 0}%</td>
                  <td className="px-2 py-2 text-center" style={{ color: scColor(at.dataActs ?? 0) }}>{at.dataActs ?? 0}%</td>
                  <td className="px-2 py-2 text-center" style={{ color: scColor(at.dtu ?? 0) }}>{at.dtu ?? 0}%</td>
                  <td className="px-2 py-2 text-center" style={{ color: scColor(at.zmGa ?? 0) }}>{at.zmGa ?? 0}%</td>
                  <td className="px-2 py-2 text-center font-black" style={{ color: scColor(s.avgSiteScore ?? 0) }}>{s.avgSiteScore ?? 0}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ASE Planned vs Actual + Pending to target */}
      <AsePlannedVsActual byAse={a.byAse || []} />

      {/* ASE ranking grouped by Zone */}
      <AseRankingByZone byAse={a.byAse || []} />
    </div>
  );
};
