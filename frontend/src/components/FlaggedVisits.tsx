import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { hsdApi, client } from '../services/api';

export function FlaggedVisits() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dl, setDl] = useState(false);

  useEffect(() => {
    hsdApi.flaggedVisits().then(r => setData(r.data.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  const download = async () => {
    setDl(true);
    try {
      const res = await client.get('/hsd/flagged-visits-export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'flagged-visits.xlsx'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch { toast.error('Download failed'); }
    finally { setDl(false); }
  };

  const s = data?.summary;
  return (
    <div className="px-4 py-2 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-gray-800">🚩 Visit Quality & Fraud</h2>
          <p className="text-[11px] text-gray-400">Suspicious & faked (non-compliant) visits this month</p>
        </div>
        <button onClick={download} disabled={dl} className="text-xs font-bold text-white px-3 py-2 rounded-xl disabled:opacity-50" style={{ background: '#00843D' }}>{dl ? '…' : '⬇ Excel'}</button>
      </div>

      {loading ? <p className="p-6 text-center text-gray-400 text-sm">Loading…</p> : !s ? <p className="p-6 text-center text-gray-400 text-sm">No data</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card label="Flagged" value={s.total} accent="#B45309" />
            <Card label="Faked (invalid)" value={s.faked} accent="#B91C1C" />
            <Card label="Suspicious" value={s.suspicious} accent="#D97706" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {data.visits.map((v: any) => (
                <div key={v.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{v.outletName} <span className="text-[11px] text-gray-400">({v.agentCode})</span></p>
                      <p className="text-[11px] text-gray-400">{v.tdrName} · {v.zone} · {new Date(v.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!v.compliant && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">FAKED</span>}
                      {v.suspicious && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">SUSPICIOUS</span>}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                    {v.durationMin != null && <span>⏱️ {v.durationMin}m</span>}
                    {v.distanceM != null && <span>📍 {v.distanceM}m off</span>}
                  </div>
                  {v.flagReason && <p className="text-[10px] text-red-600 mt-1">{v.flagReason}</p>}
                </div>
              ))}
              {!data.visits.length && <p className="px-4 py-6 text-center text-gray-400 text-xs">No flagged visits 🎉</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function Card({ label, value, accent }: any) {
  return <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center"><p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{label}</p><p className="text-2xl font-black mt-1" style={{ color: accent }}>{value}</p></div>;
}
