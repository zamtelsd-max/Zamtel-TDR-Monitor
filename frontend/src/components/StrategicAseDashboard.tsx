import { useEffect, useState } from 'react';
import { client } from '../services/api';

/* ── Zamtel palette — GREEN + WHITE only ─────────────────────────────── */
const GREEN = '#00843D';        // Zamtel green
const GREEN_DK = '#006630';
const GREEN_LT = '#E8F5EE';     // faint green wash
const GREEN_MID = '#4CAF7D';
const INK = '#0B2E1D';          // near-black green ink for text
const MUTE = '#5B7267';         // muted green-grey
const LINE = '#DCEAE2';         // green-tinted hairline
const WHITE = '#FFFFFF';

function attain(pct: number) {
  // single-hue: darker green = better, pale = weaker (no red/amber to keep green+white identity)
  if (pct >= 95) return GREEN_DK;
  if (pct >= 75) return GREEN;
  if (pct >= 50) return GREEN_MID;
  return '#A9C7B7';
}
function fmt(n: any) { return typeof n === 'number' ? n.toLocaleString() : n; }

/* ── Reusable SVG bar chart (horizontal) ─────────────────────────────── */
function BarChart({ data, max }: { data: { label: string; value: number; sub?: string; pct?: number }[]; max?: number }) {
  const m = max || Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 118, fontSize: 12, color: INK, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
          <div style={{ flex: 1, background: GREEN_LT, borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (d.value / m) * 100)}%`, height: '100%', background: attain(d.pct ?? 100), borderRadius: 6, transition: 'width .6s ease' }} />
            <span style={{ position: 'absolute', right: 8, top: 0, lineHeight: '22px', fontSize: 11, fontWeight: 700, color: INK }}>{fmt(d.value)}{d.sub ? ` · ${d.sub}` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Vertical bar chart (columns) */
function ColumnChart({ data, showPct }: { data: { label: string; value: number; pct?: number }[]; showPct?: boolean }) {
  const m = Math.max(1, ...data.map(d => d.value));
  const height = 220, barArea = height - 44;
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height, minWidth: data.length > 8 ? data.length * 46 : undefined }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: '1 0 34px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: INK }}>{showPct && d.pct != null ? `${d.pct}%` : fmt(d.value)}</span>
            <div title={`${d.label}: ${fmt(d.value)}`} style={{ width: 30, height: `${Math.max(3, (d.value / m) * barArea)}px`, background: `linear-gradient(180deg,${attain(d.pct ?? 100)},${GREEN_MID})`, borderRadius: '7px 7px 0 0', transition: 'height .6s ease', boxShadow: '0 1px 2px rgba(0,80,40,.15)' }} />
            <span style={{ fontSize: 9.5, color: MUTE, textAlign: 'center', lineHeight: 1.1, height: 22, overflow: 'hidden', width: 46, wordBreak: 'break-word' }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── SVG trend line (approved vs target) ─────────────────────────────── */
function TrendLine({ points }: { points: { date: string; actual: number; target: number }[] }) {
  if (!points.length) return <div style={{ color: MUTE, fontSize: 12, padding: 20 }}>No trend data yet.</div>;
  const W = 640, H = 180, pad = 30;
  const xs = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const maxV = Math.max(...points.map(p => Math.max(p.actual, p.target)), 1);
  const y = (v: number) => H - pad - (v / maxV) * (H - pad * 2);
  const x = (i: number) => pad + i * xs;
  const path = (key: 'actual' | 'target') => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0, 0.5, 1].map((t, i) => (
        <line key={i} x1={pad} x2={W - pad} y1={H - pad - t * (H - pad * 2)} y2={H - pad - t * (H - pad * 2)} stroke={LINE} strokeWidth={1} />
      ))}
      {/* target (dashed) */}
      <path d={path('target')} fill="none" stroke={GREEN_MID} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.8} />
      {/* actual (solid green, filled) */}
      <path d={`${path('actual')} L ${x(points.length - 1)} ${H - pad} L ${x(0)} ${H - pad} Z`} fill={GREEN} opacity={0.08} />
      <path d={path('actual')} fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.actual)} r={3} fill={GREEN} />)}
      {points.map((p, i) => (i % Math.ceil(points.length / 7) === 0 || i === points.length - 1) && (
        <text key={'t' + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={MUTE}>{p.date.slice(5)}</text>
      ))}
    </svg>
  );
}

/* ── Donut / ring ─────────────────────────────────────────────────────── */
function Ring({ pct, label, size = 108 }: { pct: number; label: string; size?: number }) {
  const stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (Math.min(pct, 100) / 100) * c;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GREEN_LT} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GREEN} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .7s ease' }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={800} fill={GREEN_DK}>{pct}%</text>
      </svg>
      <span style={{ fontSize: 11, color: MUTE, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>
    </div>
  );
}

/* ── KPI stat card ────────────────────────────────────────────────────── */
function Stat({ label, value, sub, big }: { label: string; value: any; sub?: string; big?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: WHITE, border: `1px solid ${LINE}`, borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,80,40,.04)' }}>
      <p style={{ fontSize: 10.5, color: MUTE, textTransform: 'uppercase', letterSpacing: .8, margin: 0, fontWeight: 700 }}>{label}</p>
      <p style={{ fontSize: big ? 30 : 24, fontWeight: 800, color: GREEN_DK, margin: '6px 0 0', lineHeight: 1 }}>{fmt(value)}</p>
      {sub && <p style={{ fontSize: 11.5, color: MUTE, margin: '5px 0 0' }}>{sub}</p>}
    </div>
  );
}

const TABS = [
  { id: 'exec', label: 'Executive' },
  { id: 'zones', label: 'Zone Leaderboard' },
  { id: 'efficiency', label: 'ASE Efficiency' },
  { id: 'insights', label: 'AI Insights' },
] as const;
type Tab = typeof TABS[number]['id'];

export default function StrategicAseDashboard() {
  const [tab, setTab] = useState<Tab>('exec');
  const [date, setDate] = useState('2026-08-07');
  const [strat, setStrat] = useState<any>(null);
  const [eff, setEff] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [zoneData, setZoneData] = useState<any>(null);
  const [aseDevices, setAseDevices] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadStrat = () => { setLoading(true); client.get(`/ase-tracker/strategic?date=${date}`).then(r => setStrat(r.data)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { loadStrat(); }, [date]);
  useEffect(() => { if (tab === 'efficiency' && !eff) client.get('/ase-tracker/effectiveness').then(r => setEff(r.data)).catch(() => {}); }, [tab]);
  useEffect(() => { if (tab === 'insights' && !insights) client.get('/ase-tracker/insights').then(r => setInsights(r.data)).catch(() => {}); }, [tab]);

  const openZone = (z: string) => { setZone(z); setAseDevices(null); client.get(`/ase-tracker/zone/${encodeURIComponent(z)}?date=${date}`).then(r => setZoneData(r.data)).catch(() => {}); };
  const openAseDevices = (name: string) => { client.get(`/ase-tracker/ase/${encodeURIComponent(name)}/devices`).then(r => setAseDevices(r.data)).catch(() => {}); };

  const card: React.CSSProperties = { background: WHITE, border: `1px solid ${LINE}`, borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,80,40,.04)' };
  const h3: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: INK, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: .6 };

  return (
    <div style={{ background: GREEN_LT, borderRadius: 20, padding: 18, minHeight: 400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: GREEN, display: 'grid', placeItems: 'center', color: WHITE, fontSize: 20, fontWeight: 900 }}>Z</div>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: INK, margin: 0 }}>ASE Performance Command Centre</h2>
          <p style={{ fontSize: 11.5, color: MUTE, margin: '2px 0 0' }}>Daily · Weekly · Month-to-date registration tracking</p>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginLeft: 'auto', border: `1px solid ${LINE}`, borderRadius: 10, padding: '7px 10px', fontSize: 12.5, color: INK, background: WHITE }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setZone(null); }} style={{
            border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
            background: tab === t.id ? GREEN : WHITE, color: tab === t.id ? WHITE : INK, boxShadow: tab === t.id ? '0 2px 8px rgba(0,132,61,.25)' : `inset 0 0 0 1px ${LINE}`,
          }}>{t.label}</button>
        ))}
      </div>

      {loading && !strat && <div style={{ color: MUTE, padding: 40, textAlign: 'center' }}>Loading…</div>}

      {/* ── EXECUTIVE ─────────────────────────────────────────────── */}
      {tab === 'exec' && strat && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* KPI row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat label="Today — Gross Adds" value={strat.national.day.actual} sub={`Target ${fmt(strat.national.day.target)} · ${strat.national.day.pct}%`} big />
            <Stat label="Week-to-Date" value={strat.national.wtd.actual} sub={`Target ${fmt(strat.national.wtd.target)} · ${strat.national.wtd.pct}%`} />
            <Stat label="Month-to-Date" value={strat.national.mtd.actual} sub={`Target ${fmt(strat.national.mtd.target)} · ${strat.national.mtd.pct}%`} />
            <Stat label="Approval Rate" value={`${strat.quality.approvalRate}%`} sub={`${fmt(strat.quality.dayRejected)} rejected today`} />
          </div>

          {/* Rings + fleet */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
            <div style={card}>
              <h3 style={h3}>Attainment</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <Ring pct={strat.national.day.pct} label="Day" />
                <Ring pct={strat.national.wtd.pct} label="WTD" />
                <Ring pct={strat.national.mtd.pct} label="MTD" />
              </div>
            </div>
            <div style={card}>
              <h3 style={h3}>Device Fleet Utilisation</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <Ring pct={strat.fleet.utilisation} label="Active" size={120} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Stat label="Total Devices" value={strat.fleet.total} />
                  <Stat label="Active" value={strat.fleet.active} />
                  <Stat label="Idle" value={strat.fleet.idle} />
                </div>
              </div>
            </div>
          </div>

          {/* Trend line */}
          <div style={card}>
            <h3 style={h3}>Daily Registration Trend vs Target</h3>
            <TrendLine points={strat.trend} />
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 6, fontSize: 11, color: MUTE }}>
              <span><span style={{ display: 'inline-block', width: 14, height: 3, background: GREEN, verticalAlign: 'middle', marginRight: 5 }} />Actual</span>
              <span><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px dashed ${GREEN_MID}`, verticalAlign: 'middle', marginRight: 5 }} />Target</span>
            </div>
          </div>

          {/* Zone bar chart */}
          <div style={card}>
            <h3 style={h3}>Zone Performance — Today (% of daily target)</h3>
            <ColumnChart showPct data={strat.zones.map((z: any) => ({ label: z.zone, value: z.dayPct, pct: z.dayPct }))} />
          </div>
        </div>
      )}

      {/* ── ZONE LEADERBOARD ──────────────────────────────────────── */}
      {tab === 'zones' && strat && !zone && (
        <div style={card}>
          <h3 style={h3}>Zone Leaderboard — Click a zone to drill into ASEs</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ color: MUTE, textAlign: 'left' }}>
                {['#', 'Zone', 'ZBM', 'Day', 'Target', 'Day %', 'MTD', 'MTD %'].map(h => <th key={h} style={{ padding: '8px 10px', borderBottom: `2px solid ${LINE}`, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {strat.zones.map((z: any, i: number) => (
                  <tr key={z.zone} onClick={() => openZone(z.zone)} style={{ cursor: 'pointer', borderBottom: `1px solid ${LINE}` }}>
                    <td style={{ padding: '9px 10px', fontWeight: 800, color: GREEN }}>{i + 1}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: INK }}>{z.zone}</td>
                    <td style={{ padding: '9px 10px', color: MUTE }}>{z.zbm}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 700 }}>{fmt(z.dayActual)}</td>
                    <td style={{ padding: '9px 10px', color: MUTE }}>{fmt(z.dayTarget)}</td>
                    <td style={{ padding: '9px 10px' }}><b style={{ color: attain(z.dayPct) }}>{z.dayPct}%</b></td>
                    <td style={{ padding: '9px 10px' }}>{fmt(z.mtdActual)}</td>
                    <td style={{ padding: '9px 10px' }}><b style={{ color: attain(z.mtdPct) }}>{z.mtdPct}%</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Zone drill-down: ASEs */}
      {tab === 'zones' && zone && zoneData && (
        <div style={card}>
          <button onClick={() => { setZone(null); setAseDevices(null); }} style={{ border: 'none', background: GREEN_LT, color: GREEN_DK, borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', marginBottom: 12, fontSize: 12 }}>← Back to zones</button>
          <h3 style={h3}>{zone} — ASE Ranking ({zoneData.aseCount} ASEs) · {date}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ color: MUTE, textAlign: 'left' }}>
                {['#', 'ASE', 'Market', 'Target', 'Day', 'Day %', 'MTD', 'DSAs', ''].map(h => <th key={h} style={{ padding: '8px 10px', borderBottom: `2px solid ${LINE}`, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {zoneData.rows.map((r: any) => (
                  <tr key={r.rank} style={{ borderBottom: `1px solid ${LINE}` }}>
                    <td style={{ padding: '9px 10px', fontWeight: 800, color: GREEN }}>{r.rank}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: INK }}>{r.ase}</td>
                    <td style={{ padding: '9px 10px', color: MUTE }}>{r.market}</td>
                    <td style={{ padding: '9px 10px', color: MUTE }}>{r.target}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 700 }}>{r.actual}</td>
                    <td style={{ padding: '9px 10px' }}><b style={{ color: attain(r.pct) }}>{r.pct}%</b></td>
                    <td style={{ padding: '9px 10px' }}>{r.mtd}</td>
                    <td style={{ padding: '9px 10px', color: MUTE }}>{r.dsaCount}</td>
                    <td style={{ padding: '9px 10px' }}><button onClick={() => openAseDevices(r.ase)} style={{ border: `1px solid ${LINE}`, background: WHITE, color: GREEN_DK, borderRadius: 7, padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Devices</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aseDevices && (
            <div style={{ marginTop: 16, background: GREEN_LT, borderRadius: 14, padding: 16 }}>
              <h3 style={h3}>{aseDevices.ase} — Allocated Devices &amp; SIM Effectiveness</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <Stat label="Devices" value={aseDevices.fleet.total} />
                <Stat label="Active" value={aseDevices.fleet.active} sub={`${aseDevices.fleet.utilisation}% utilised`} />
                <Stat label="Total GA" value={aseDevices.simEffectiveness.totalGA} />
                <Stat label="Recharge / GA" value={aseDevices.simEffectiveness.rechargePerGA} sub={aseDevices.simEffectiveness.healthy ? 'Healthy (≥0.5)' : 'Below target'} />
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ color: MUTE, textAlign: 'left' }}>
                    {['Dealer Code', 'Device', 'Site', 'Status', 'GA', 'Recharge (K)'].map(h => <th key={h} style={{ padding: '6px 8px', borderBottom: `2px solid ${LINE}`, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {aseDevices.devices.map((d: any, i: number) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${LINE}`, background: d.active ? WHITE : 'transparent' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{d.dealerCode}</td>
                        <td style={{ padding: '6px 8px', color: MUTE }}>{d.deviceType}</td>
                        <td style={{ padding: '6px 8px', color: MUTE }}>{d.siteId || '—'}</td>
                        <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 10, fontWeight: 700, color: d.active ? GREEN_DK : MUTE }}>{d.active ? 'ACTIVE' : 'IDLE'}</span></td>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>{d.grossAdds}</td>
                        <td style={{ padding: '6px 8px' }}>{fmt(d.recharges)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ASE EFFICIENCY (ML) ───────────────────────────────────── */}
      {tab === 'efficiency' && eff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat label="ASEs Scored" value={eff.count} big />
            <Stat label="Avg Efficiency" value={`${eff.avgEfficiency}%`} sub="Device use · SIM · GA volume" />
            <Stat label="High Performers" value={eff.rows.filter((r: any) => r.band === 'high').length} sub="Score ≥ 70" />
            <Stat label="Needs Coaching" value={eff.rows.filter((r: any) => r.band === 'low').length} sub="Score < 45" />
          </div>
          <div style={card}>
            <h3 style={h3}>Top 12 ASEs by Efficiency Score (ML composite)</h3>
            <BarChart data={eff.rows.slice(0, 12).map((r: any) => ({ label: r.ase, value: r.efficiencyScore, sub: `${r.utilisation}% dev`, pct: r.efficiencyScore }))} max={100} />
          </div>
          <div style={card}>
            <h3 style={h3}>Full Efficiency Leaderboard</h3>
            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ color: MUTE, textAlign: 'left', position: 'sticky', top: 0, background: WHITE }}>
                  {['#', 'ASE', 'Zone', 'Devices', 'Active', 'Util %', 'GA', 'Rchg/GA', 'Score'].map(h => <th key={h} style={{ padding: '8px 10px', borderBottom: `2px solid ${LINE}`, fontSize: 10.5, textTransform: 'uppercase' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {eff.rows.map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: GREEN }}>{i + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: INK }}>{r.ase}</td>
                      <td style={{ padding: '8px 10px', color: MUTE }}>{r.zone}</td>
                      <td style={{ padding: '8px 10px' }}>{r.devices}</td>
                      <td style={{ padding: '8px 10px' }}>{r.activeDevices}</td>
                      <td style={{ padding: '8px 10px' }}>{r.utilisation}%</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(r.ga)}</td>
                      <td style={{ padding: '8px 10px' }}>{r.rechargePerGA}</td>
                      <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800, color: WHITE, background: attain(r.efficiencyScore) }}>{r.efficiencyScore}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── AI INSIGHTS ───────────────────────────────────────────── */}
      {tab === 'insights' && insights && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat label="Total Insights" value={insights.summary.total} big />
            <Stat label="Critical" value={insights.summary.critical} />
            <Stat label="Warning" value={insights.summary.warning} />
            <Stat label="Watch" value={insights.summary.watch} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.insights.map((ins: any) => (
              <div key={ins.id} style={{ ...card, borderLeft: `4px solid ${GREEN}`, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: INK, fontSize: 13.5 }}>{ins.aseName}</span>
                  <span style={{ fontSize: 11, color: MUTE }}>· {ins.zone || '—'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .5, padding: '2px 10px', borderRadius: 20, background: GREEN_LT, color: GREEN_DK }}>{ins.severity}</span>
                </div>
                <p style={{ margin: '6px 0 2px', fontWeight: 700, color: GREEN_DK, fontSize: 13 }}>{ins.focusArea}</p>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: MUTE }}>{ins.trigger}</p>
                <p style={{ margin: 0, fontSize: 12, color: INK }}><b>Action:</b> {ins.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
