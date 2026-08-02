import { useEffect, useState } from 'react';
import { client } from '../services/api';

const NAVY = '#00843D';
function pill(s: string) { return s === 'green' ? { bg: '#dcfce7', fg: '#15803d' } : s === 'amber' ? { bg: '#fef9c3', fg: '#a16207' } : { bg: '#fee2e2', fg: '#b91c1c' }; }
function sevColor(s: string) { return s === 'critical' ? '#b91c1c' : s === 'warning' ? '#c2410c' : '#a16207'; }

export default function AseActivityTracker() {
  const [tab, setTab] = useState<'exec' | 'insights'>('exec');
  const [date, setDate] = useState('2026-08-01');
  const [exec, setExec] = useState<any>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [zoneData, setZoneData] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [busy, setBusy] = useState('');

  const loadExec = () => client.get(`/ase-tracker/executive?date=${date}`).then(r => setExec(r.data)).catch(() => {});
  const loadInsights = () => client.get('/ase-tracker/insights').then(r => setInsights(r.data)).catch(() => {});
  useEffect(() => { loadExec(); }, [date]);
  useEffect(() => { if (tab === 'insights') loadInsights(); }, [tab]);

  const openZone = (z: string) => { setZone(z); client.get(`/ase-tracker/zone/${encodeURIComponent(z)}?date=${date}`).then(r => setZoneData(r.data)).catch(() => {}); };
  const rescore = async () => { setBusy('rescore'); try { await client.post('/ase-tracker/rescore-insights'); loadInsights(); } finally { setBusy(''); } };
  const seed = async () => { setBusy('seed'); try { await client.post('/ase-tracker/seed-zones'); loadExec(); } finally { setBusy(''); } };

  const Card = ({ label, v }: any) => (
    <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #eef0f4', textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: .5, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '4px 0 0' }}>{v.actual?.toLocaleString?.() ?? v.actual}</p>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>/ {v.target?.toLocaleString?.() ?? v.target} · <b style={{ color: pill(v.status || (v.pct >= 95 ? 'green' : v.pct >= 75 ? 'amber' : 'red')).fg }}>{v.pct}%</b></p>
    </div>
  );

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>🎯 ASE Activity Tracker</h2>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(['exec', 'insights'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: tab === t ? NAVY : '#eef2f7', color: tab === t ? '#fff' : '#475569' }}>{t === 'exec' ? 'Executive' : 'AI Insights'}</button>
          ))}
        </div>
      </div>

      {tab === 'exec' && exec && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Card label="Daily Acquired" v={exec.daily} />
            <Card label="WTD Acquired" v={exec.wtd} />
            <Card label="MTD Acquired" v={exec.mtd} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #eef0f4' }}>
              <p style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', margin: 0 }}>Rejection Rate (day)</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#c2410c', margin: '4px 0 0' }}>{exec.rejectionRate}%</p>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{exec.dayRejected} / {exec.dayApproved + exec.dayRejected}</p>
            </div>
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 14, padding: 14, border: '1px solid #dcfce7' }}>
              <p style={{ fontSize: 10, color: '#15803d', textTransform: 'uppercase', margin: 0 }}>Top 3 Zones</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#166534', margin: '4px 0 0' }}>{exec.topZones.join(' · ')}</p>
            </div>
            <div style={{ flex: 1, background: '#fef2f2', borderRadius: 14, padding: 14, border: '1px solid #fee2e2' }}>
              <p style={{ fontSize: 10, color: '#b91c1c', textTransform: 'uppercase', margin: 0 }}>Bottom 3 Zones</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', margin: '4px 0 0' }}>{exec.bottomZones.join(' · ')}</p>
            </div>
          </div>

          {/* zone leaderboard */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #eef0f4', overflow: 'hidden' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', padding: '10px 14px 6px', margin: 0 }}>Zone Rankings (MTD) — tap to drill down</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: '#64748b', textAlign: 'left' }}>{['#', 'Zone', 'ZBM', 'Actual', 'Target', '%', ''].map(h => <th key={h} style={{ padding: '6px 10px', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {exec.zones.map((z: any, i: number) => (
                    <tr key={z.zone} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => openZone(z.zone)}>
                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: NAVY }}>{z.zone}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{z.zbm}</td>
                      <td style={{ padding: '7px 10px' }}>{z.actual.toLocaleString()}</td>
                      <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{Math.round(z.target).toLocaleString()}</td>
                      <td style={{ padding: '7px 10px' }}><span style={{ fontWeight: 700, padding: '2px 7px', borderRadius: 6, ...(() => { const p = pill(z.pct >= 95 ? 'green' : z.pct >= 75 ? 'amber' : 'red'); return { background: p.bg, color: p.fg }; })() }}>{z.pct}%</span></td>
                      <td style={{ padding: '7px 10px', color: '#cbd5e1' }}>›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {exec.zones.every((z: any) => z.actual === 0) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={seed} disabled={busy === 'seed'} style={{ fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>{busy === 'seed' ? '…' : 'Seed zone targets'}</button>
              <p style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>No transactions yet — upload Approved/Rejected reports via the API to see live figures.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={rescore} disabled={busy === 'rescore'} style={{ fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer' }}>{busy === 'rescore' ? 'Analysing…' : '🧠 Re-score Insights'}</button>
            {insights && <span style={{ fontSize: 12, color: '#64748b' }}>{insights.summary.total} signals · <b style={{ color: '#b91c1c' }}>{insights.summary.critical} critical</b> · {insights.summary.warning} warnings</span>}
          </div>
          {insights?.insights?.map((i: any) => (
            <div key={i.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #eef0f4', borderLeft: `4px solid ${sevColor(i.severity)}`, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: sevColor(i.severity) }}>{i.severity}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{i.zone || '—'}</span>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '3px 0 0' }}>{i.aseName} — {i.focusArea}</p>
                  <p style={{ fontSize: 12, color: '#475569', margin: '4px 0 0' }}>{i.trigger}</p>
                  <p style={{ fontSize: 12, color: NAVY, margin: '4px 0 0', fontWeight: 600 }}>→ {i.action}</p>
                  {i.escalation && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Escalation: {i.escalation}</p>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: sevColor(i.severity), whiteSpace: 'nowrap' }}>{Math.round(i.score * 100)}%</span>
              </div>
            </div>
          ))}
          {insights && !insights.insights.length && <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No focus areas flagged — tap Re-score to analyse.</p>}
        </div>
      )}

      {/* Zone drill-down modal */}
      {zone && zoneData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={() => setZone(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', overflow: 'auto', padding: 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: 0 }}>{zone} — ASE Leaderboard ({zoneData.date})</h3>
              <button onClick={() => setZone(null)} style={{ fontSize: 20, background: 'none', border: 'none', color: '#94a3b8' }}>×</button>
            </div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: '#64748b', textAlign: 'left' }}>{['#', 'ASE', 'Market', 'Target', 'Actual', '%'].map(h => <th key={h} style={{ padding: '6px 8px', fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {zoneData.rows.map((r: any) => (
                  <tr key={r.rank} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 700 }}>{r.rank}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.ase}</td>
                    <td style={{ padding: '7px 8px', color: '#64748b' }}>{r.market}</td>
                    <td style={{ padding: '7px 8px' }}>{r.target}</td>
                    <td style={{ padding: '7px 8px' }}>{r.actual}</td>
                    <td style={{ padding: '7px 8px' }}><span style={{ fontWeight: 700, padding: '2px 7px', borderRadius: 6, ...(() => { const p = pill(r.status); return { background: p.bg, color: p.fg }; })() }}>{r.pct}%</span></td>
                  </tr>
                ))}
                {!zoneData.rows.length && <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No ASE data for this zone/date yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
