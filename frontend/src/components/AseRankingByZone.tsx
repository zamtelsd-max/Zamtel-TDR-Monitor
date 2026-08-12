import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from './UI';

interface Props { byAse: any[]; }
const sc = (v: number) => v >= 70 ? '#00843D' : v >= 40 ? '#4CAF7D' : '#ef4444';

// ASE ranking grouped by Zone (ZBM/HSD)
export const AseRankingByZone: React.FC<Props> = ({ byAse }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (!byAse || byAse.length === 0) return <Card className="text-center py-6 text-gray-400 text-sm">No ASE site data this period.</Card>;

  // Group by zone
  const zmap: Record<string, any[]> = {};
  byAse.forEach(a => { const z = a.zone || 'Unassigned'; (zmap[z] = zmap[z] || []).push(a); });
  const zones = Object.keys(zmap).map(z => {
    const list = zmap[z].slice().sort((x, y) => (y.avgScore||0) - (x.avgScore||0));
    const visited = list.reduce((s, a) => s + (a.visited||0), 0);
    const totalSites = list.reduce((s, a) => s + (a.totalSites||0), 0);
    const avg = list.length ? Math.round(list.reduce((s, a) => s + (a.avgScore||0), 0) / list.length) : 0;
    return { zone: z, list, visited, totalSites, avg };
  }).sort((a, b) => b.avg - a.avg);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-50">
        <p className="text-xs font-bold text-gray-700">👤 ASE Ranking by Zone</p>
        <p className="text-[10px] text-gray-400">{zones.length} zones · {byAse.length} ASEs · tap a zone to expand</p>
      </div>
      <div className="divide-y divide-gray-100">
        {zones.map((z) => {
          const isOpen = open === z.zone;
          return (
            <div key={z.zone}>
              {/* Zone header with score accent bar */}
              <button onClick={() => setOpen(isOpen ? null : z.zone)} className="w-full flex items-stretch gap-0 bg-gray-50/60 hover:bg-gray-100/60 overflow-hidden">
                <span className="w-1.5 shrink-0" style={{ background: sc(z.avg) }} />
                <span className="flex items-center gap-3 px-3.5 py-3 flex-1 min-w-0">
                  <span className="text-base">🗺️</span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-bold text-gray-800 truncate">{z.zone}</span>
                    <span className="block text-[10px] text-gray-400">{z.list.length} ASEs · {z.visited}/{z.totalSites} sites visited</span>
                  </span>
                  <span className="text-base font-black mr-1" style={{ color: sc(z.avg) }}>{z.avg}%</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </span>
              </button>
              {/* ASEs within zone */}
              {isOpen && (
                <div className="divide-y divide-gray-50">
                  {z.list.map((r: any, i: number) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                    return (
                    <div key={r.aseId} className="px-4 py-3 flex items-center gap-3 pl-6">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i===0?'bg-yellow-100 text-yellow-700':i===1?'bg-gray-200 text-gray-600':i===2?'bg-orange-100 text-orange-600':'bg-gray-100 text-gray-500'}`}>{medal || (i+1)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{r.aseName}</p>
                        <p className="text-[10px] text-gray-400 mb-1">{r.visited}/{r.totalSites} sites · {r.agents}A · {r.ssos}S · {r.odrs}O · {r.zmGa} ZMGA</p>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${r.avgScore}%`, background: `linear-gradient(to right, ${sc(r.avgScore)}99, ${sc(r.avgScore)})` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-black leading-none" style={{ color: sc(r.avgScore) }}>{r.avgScore}%</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
