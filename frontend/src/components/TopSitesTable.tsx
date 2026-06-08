import React from 'react';
import { Card } from './UI';

interface Props { sites: any[]; }
const sc = (v: number) => v >= 70 ? '#00843D' : v >= 40 ? '#f59e0b' : '#ef4444';

// Top 40 sites by activity — clean ranked table
export const TopSitesTable: React.FC<Props> = ({ sites }) => {
  if (!sites || sites.length === 0) return null;
  const maxAct = Math.max(...sites.map(s => s.activity || 0), 1);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 text-white" style={{ background: 'linear-gradient(135deg,#0891b2 0%,#0e7490 100%)' }}>
        <p className="font-black text-sm">🔥 Top {sites.length} Sites by Activity</p>
        <p className="text-[10px] text-cyan-50/80">Ranked by total deliverables achieved (agents + SSOs + ODRs + data + ZM GA)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left">
              <th className="px-2 py-2 font-semibold text-center w-8">#</th>
              <th className="px-3 py-2 font-semibold">Site</th>
              <th className="px-2 py-2 font-semibold">ASE / Zone</th>
              <th className="px-2 py-2 font-semibold text-center">Agents</th>
              <th className="px-2 py-2 font-semibold text-center">SSO</th>
              <th className="px-2 py-2 font-semibold text-center">ODR</th>
              <th className="px-2 py-2 font-semibold text-center">Data</th>
              <th className="px-2 py-2 font-semibold text-center">ZM GA</th>
              <th className="px-2 py-2 font-semibold text-center">Activity</th>
              <th className="px-2 py-2 font-semibold text-center">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sites.map((s, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
              const actPct = Math.round((s.activity || 0) / maxAct * 100);
              return (
                <tr key={(s.siteId||'')+i} className={`hover:bg-cyan-50/40 ${i < 3 ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-2 py-2 text-center font-black text-gray-600">{medal}</td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-gray-800 truncate max-w-[140px]">{s.siteName}</p>
                    <p className="text-[9px] text-gray-400">#{s.siteId} · {s.siteType === 'rural' ? '🌾' : '🏙️'}</p>
                  </td>
                  <td className="px-2 py-2"><p className="text-gray-700 truncate max-w-[110px]">{s.aseName}</p><p className="text-[9px] text-gray-400 truncate">{s.zone}</p></td>
                  <td className="px-2 py-2 text-center font-semibold text-gray-700">{s.agents}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.ssos}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.odrs}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.dataActs}</td>
                  <td className="px-2 py-2 text-center text-gray-600">{s.zmGa}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[28px]"><div className="h-full rounded-full" style={{ width: `${actPct}%`, background: '#0891b2' }} /></div>
                      <span className="font-black text-gray-800 w-7 text-right">{s.activity}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center font-black" style={{ color: sc(s.score) }}>{s.score}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
