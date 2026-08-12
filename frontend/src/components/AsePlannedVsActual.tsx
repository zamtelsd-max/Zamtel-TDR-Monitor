import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from './UI';

interface Props { byAse: any[]; }

const sc = (v: number) => v >= 70 ? '#00843D' : v >= 40 ? '#f59e0b' : '#ef4444';
const pct = (a: number, t: number) => t > 0 ? Math.min(Math.round(a / t * 100), 100) : 0;

// Clean per-ASE Planned vs Actual + Pending-to-target dashboard (ZBM/HSD)
export const AsePlannedVsActual: React.FC<Props> = ({ byAse }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (!byAse || byAse.length === 0) return null;
  const KPIS = [
    { k: 'agents',   l: 'Agents',  c: '#00843D' },
    { k: 'ssos',     l: 'SSOs',    c: '#2563EB' },
    { k: 'odrs',     l: 'ODRs',    c: '#7C3AED' },
    { k: 'dataActs', l: 'Data Acts', c: '#F97316' },
    { k: 'dtu',      l: 'DTU (ZMW)', c: '#00843D' },
    { k: 'zmGa',     l: 'ZM Gross Adds', c: '#0891B2' },
  ];
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-50">
        <p className="text-xs font-bold text-gray-700">🎯 ASE Planned vs Actual — Pending to Target</p>
        <p className="text-[10px] text-gray-400">Tap an ASE to see deliverable gaps · weekly target 5 sites</p>
      </div>
      <div className="divide-y divide-gray-50">
        {byAse.map((a) => {
          const isOpen = open === a.aseId;
          const sitesPct = pct(a.visited, a.sitesTarget || 5);
          return (
            <div key={a.aseId}>
              {/* Header row */}
              <button onClick={() => setOpen(isOpen ? null : a.aseId)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50">
                <div className="relative w-11 h-11 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f0f0f0" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={sc(a.avgScore)} strokeWidth="3.5" strokeDasharray={`${a.avgScore},100`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black" style={{ color: sc(a.avgScore) }}>{a.avgScore}%</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-bold text-gray-800 truncate">{a.aseName}</p>
                  <p className="text-[10px] text-gray-400">{a.zone || '—'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-gray-700">{a.visited}/{a.sitesTarget || 5} <span className="font-normal text-gray-400">sites</span></p>
                  <p className="text-[10px]" style={{ color: (a.sitesPending||0) > 0 ? '#ef4444' : '#00843D' }}>{(a.sitesPending||0) > 0 ? `${a.sitesPending} pending` : '✓ sites done'}</p>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              {/* Expanded: planned vs actual + pending per deliverable */}
              {isOpen && (
                <div className="px-4 pb-3">
                  {/* Sites planned vs visited bar */}
                  <div className="mb-3 bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-gray-500">Site visits</span>
                      <span className="font-semibold text-gray-700">{a.visited} visited · {a.planned} planned · target {a.sitesTarget || 5}</span>
                    </div>
                    <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden flex">
                      <div className="h-full" style={{ width: `${sitesPct}%`, background: '#00843D' }} title="visited" />
                      <div className="h-full" style={{ width: `${pct(a.planned, a.sitesTarget||5)}%`, background: '#0EA5E9', opacity: 0.5 }} title="planned" />
                    </div>
                  </div>
                  {/* Deliverable table */}
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-gray-400 text-left">
                      <th className="py-1 font-semibold">Deliverable</th>
                      <th className="py-1 font-semibold text-center">Actual</th>
                      <th className="py-1 font-semibold text-center">Target</th>
                      <th className="py-1 font-semibold text-center">Pending</th>
                      <th className="py-1 font-semibold text-right">%</th>
                    </tr></thead>
                    <tbody>
                      {KPIS.map(kpi => {
                        const act = a[kpi.k] || 0; const tgt = a.targets?.[kpi.k] || 0; const pen = a.pending?.[kpi.k] || 0; const p = pct(act, tgt);
                        return (
                          <tr key={kpi.k} className="border-t border-gray-50">
                            <td className="py-1.5 font-medium text-gray-700"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: kpi.c }} />{kpi.l}</td>
                            <td className="py-1.5 text-center font-bold text-gray-800">{act}</td>
                            <td className="py-1.5 text-center text-gray-400">{tgt}</td>
                            <td className="py-1.5 text-center font-bold" style={{ color: pen > 0 ? '#ef4444' : '#00843D' }}>{pen > 0 ? pen : '✓'}</td>
                            <td className="py-1.5 text-right font-bold" style={{ color: sc(p) }}>{p}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
