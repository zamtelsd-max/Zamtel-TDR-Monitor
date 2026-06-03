import React, { useState, useEffect } from 'react';
import { MapPin, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from './UI';

interface SiteFocusPanelProps {
  fetchSites: () => Promise<{ data: any[] }>;
  exportXlsx?: () => Promise<{ data: Blob }>;
  exportName?: string;
  showZone?: boolean;
}

export const SiteFocusPanel: React.FC<SiteFocusPanelProps> = ({ fetchSites, exportXlsx, exportName = 'ase-site-focus.xlsx', showZone }) => {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openAse, setOpenAse] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchSites().then(r => setSites(r.data || [])).catch(() => toast.error('Failed to load site focus')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const doExport = async () => {
    if (!exportXlsx) return;
    setExporting(true);
    try {
      const r = await exportXlsx();
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a'); a.href = url; a.download = exportName; a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel exported');
    } catch { toast.error('Export failed'); } finally { setExporting(false); }
  };

  const scColor = (s: number) => s >= 70 ? '#00843D' : s >= 40 ? '#f59e0b' : '#ef4444';
  const totalSites = sites.length;
  const aseCount = new Set(sites.map(s => s.aseId)).size;
  const avgScore = totalSites > 0 ? Math.round(sites.reduce((a, s) => a + (s.siteScore || 0), 0) / totalSites) : 0;

  // Group sites by ASE
  const groups: { aseId: string; aseName: string; aseZone: string; sites: any[] }[] = [];
  const gmap: Record<string, any> = {};
  for (const s of sites) {
    const k = s.aseId || s.aseName || 'unknown';
    if (!gmap[k]) { gmap[k] = { aseId: k, aseName: s.aseName || '—', aseZone: s.aseZone || '', sites: [] }; groups.push(gmap[k]); }
    gmap[k].sites.push(s);
  }
  groups.sort((a, b) => a.aseName.localeCompare(b.aseName));

  return (
    <div className="space-y-3">
      {/* Header + summary */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-gray-800">📍 ASE Site Focus — Visited Sites</h3>
          <p className="text-[11px] text-gray-400">{totalSites} sites · {aseCount} ASEs · avg score {avgScore}%</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={load} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
          {exportXlsx && (
            <button onClick={doExport} disabled={exporting} className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-50" style={{ background: '#00843D' }}>
              <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting…' : 'Excel'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : sites.length === 0 ? (
        <Card className="text-center py-8 text-gray-400"><p className="text-sm">No site focus logged this period.</p></Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const gOpen = openAse === g.aseId;
            const gVisited = g.sites.filter((s: any) => s.status !== 'planned').length;
            const gScore = gVisited > 0 ? Math.round(g.sites.filter((s: any) => s.status !== 'planned').reduce((a: number, s: any) => a + (s.siteScore || 0), 0) / gVisited) : 0;
            const gOverdue = g.sites.filter((s: any) => s.overdue).length;
            return (
            <div key={g.aseId} className="rounded-2xl border border-gray-200 bg-gray-50/50 overflow-hidden">
              {/* ASE group header */}
              <button onClick={() => setOpenAse(gOpen ? null : g.aseId)} className="w-full px-4 py-3 flex items-center justify-between bg-white">
                <div className="text-left min-w-0">
                  <p className="font-bold text-sm text-gray-800 truncate flex items-center gap-1.5">
                    👤 {g.aseName}
                    {gOverdue > 0 && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">🔴 {gOverdue}</span>}
                  </p>
                  <p className="text-[10px] text-gray-400">{showZone && g.aseZone ? `${g.aseZone} · ` : ''}{g.sites.length} sites · {gVisited} visited · avg {gScore}%</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-base font-black" style={{ color: scColor(gScore) }}>{gScore}%</span>
                  {gOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>
              {gOpen && (
              <div className="px-2 pb-2 pt-1 space-y-2">
          {g.sites.map((s: any) => {
            const kpis = [
              { l: 'Agents', v: s.agentsRec, t: 3, c: '#00843D' },
              { l: 'SSOs', v: s.ssosRec, t: 2, c: '#2563EB' },
              { l: 'ODRs', v: s.odrsRec, t: 1, c: '#7C3AED' },
              { l: 'Data', v: s.dataActs, t: 15, c: '#F97316' },
              { l: 'DTU ZMW', v: s.dtuSold, t: 500, c: '#E4007C' },
              { l: 'ZM GA', v: s.zmGrossAdds ?? 0, t: (s.siteType === 'rural' ? 30 : 50), c: '#0891B2' },
            ];
            const open = expanded === s.id;
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(open ? null : s.id)} className="w-full px-4 py-3 flex items-center justify-between">
                  <div className="text-left min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate flex items-center gap-1">{s.siteName} <span className="text-[10px] text-gray-400">#{s.siteId}</span>
                      {s.overdue && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">🔴 OVERDUE</span>}
                      {s.carriedOver && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">↻×{s.carryCount}</span>}
                    </p>
                    <p className="text-[10px] text-gray-400">{s.aseName}{showZone && s.aseZone ? ` · ${s.aseZone}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-black" style={{ color: scColor(s.siteScore || 0) }}>{s.siteScore || 0}%</span>
                    {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {open && (
                  <div className="px-4 pb-3 border-t border-gray-50 pt-2 space-y-1">
                    {kpis.map(k => {
                      const pct = Math.min(Math.round(k.v / k.t * 100), 100);
                      return (
                        <div key={k.l} className="flex items-center gap-1.5">
                          <span className="text-[9px] text-gray-400 w-10 shrink-0">{k.l}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: k.c }} /></div>
                          <span className="text-[9px] font-bold text-gray-500 w-12 text-right">{k.v}/{k.t}</span>
                        </div>
                      );
                    })}
                    {(s.latitude != null && s.longitude != null) && (
                      <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" className="text-[10px] mt-1 inline-flex items-center gap-1 font-semibold" style={{ color: '#00843D' }}>
                        <MapPin className="w-3 h-3" /> {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}
                      </a>
                    )}
                    {(s.agentCodes || s.ssoCodes || s.odrCodes || s.dtuAgentCode) && (
                      <div className="mt-1 space-y-0.5">
                        {s.agentCodes && <p className="text-[10px] text-gray-500"><span className="font-bold text-green-700">Agents:</span> {s.agentCodes}</p>}
                        {s.ssoCodes && <p className="text-[10px] text-gray-500"><span className="font-bold text-blue-700">SSOs:</span> {s.ssoCodes}</p>}
                        {s.odrCodes && <p className="text-[10px] text-gray-500"><span className="font-bold text-purple-700">ODRs:</span> {s.odrCodes}</p>}
                        {s.dtuAgentCode && <p className="text-[10px] text-gray-500"><span className="font-bold text-pink-700">DTU from:</span> {s.dtuAgentCode} (K{s.dtuSold})</p>}
                      </div>
                    )}
                    {s.notes && <p className="text-[10px] text-gray-400 italic mt-1">{s.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
