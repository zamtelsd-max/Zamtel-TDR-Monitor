import React from 'react';

/* ── Shared Zamtel green/white chart primitives ───────────────────────── */
export const GREEN = '#00843D';
export const GREEN_DK = '#006630';
export const GREEN_MID = '#4CAF7D';
export const GREEN_LT = '#E8F5EE';
export const INK = '#0B2E1D';
export const MUTE = '#5B7267';
export const LINE = '#DCEAE2';

export function attainColor(pct: number) {
  if (pct >= 95) return GREEN_DK;
  if (pct >= 75) return GREEN;
  if (pct >= 50) return GREEN_MID;
  return '#A9C7B7';
}
export const fmt = (n: any) => (typeof n === 'number' ? n.toLocaleString() : n);

/* Horizontal bar chart */
export const BarChart: React.FC<{ data: { label: string; value: number; sub?: string; pct?: number }[]; max?: number; labelWidth?: number }> = ({ data, max, labelWidth = 118 }) => {
  const m = max || Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: labelWidth, fontSize: 12, color: INK, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
          <div style={{ flex: 1, background: GREEN_LT, borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (d.value / m) * 100)}%`, height: '100%', background: attainColor(d.pct ?? 100), borderRadius: 6, transition: 'width .6s ease' }} />
            <span style={{ position: 'absolute', right: 8, top: 0, lineHeight: '22px', fontSize: 11, fontWeight: 700, color: INK }}>{fmt(d.value)}{d.sub ? ` · ${d.sub}` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

/* Vertical bar chart (columns) */
export const ColumnChart: React.FC<{ data: { label: string; value: number; pct?: number }[]; height?: number }> = ({ data, height = 160 }) => {
  const m = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, padding: '0 2px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: INK }}>{fmt(d.value)}</span>
          <div style={{ width: '100%', maxWidth: 34, height: `${(d.value / m) * (height - 34)}px`, background: `linear-gradient(180deg,${GREEN},${GREEN_MID})`, borderRadius: '6px 6px 0 0', transition: 'height .6s ease' }} />
          <span style={{ fontSize: 9.5, color: MUTE, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 46 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
};

/* Trend line (actual solid + optional target dashed) */
export const TrendLine: React.FC<{ points: { label: string; actual: number; target?: number }[]; height?: number }> = ({ points, height = 180 }) => {
  if (!points.length) return <div style={{ color: MUTE, fontSize: 12, padding: 20, textAlign: 'center' }}>No trend data yet.</div>;
  const W = 640, H = height, pad = 30;
  const xs = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const maxV = Math.max(...points.map(p => Math.max(p.actual, p.target || 0)), 1);
  const y = (v: number) => H - pad - (v / maxV) * (H - pad * 2);
  const x = (i: number) => pad + i * xs;
  const path = (key: 'actual' | 'target') => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y((p as any)[key] || 0).toFixed(1)}`).join(' ');
  const hasTarget = points.some(p => p.target != null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0, 0.5, 1].map((t, i) => <line key={i} x1={pad} x2={W - pad} y1={H - pad - t * (H - pad * 2)} y2={H - pad - t * (H - pad * 2)} stroke={LINE} strokeWidth={1} />)}
      {hasTarget && <path d={path('target')} fill="none" stroke={GREEN_MID} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.8} />}
      <path d={`${path('actual')} L ${x(points.length - 1)} ${H - pad} L ${x(0)} ${H - pad} Z`} fill={GREEN} opacity={0.08} />
      <path d={path('actual')} fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.actual)} r={3} fill={GREEN} />)}
      {points.map((p, i) => (i % Math.ceil(points.length / 7) === 0 || i === points.length - 1) && (
        <text key={'t' + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={MUTE}>{p.label}</text>
      ))}
    </svg>
  );
};

/* Donut ring */
export const Ring: React.FC<{ pct: number; label?: string; size?: number }> = ({ pct, label, size = 108 }) => {
  const stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (Math.min(pct, 100) / 100) * c;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GREEN_LT} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GREEN} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .7s ease' }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={size < 90 ? 17 : 22} fontWeight={800} fill={GREEN_DK}>{pct}%</text>
      </svg>
      {label && <span style={{ fontSize: 11, color: MUTE, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>}
    </div>
  );
};

/* Section card wrapper + title */
export const ChartCard: React.FC<{ title?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 18, boxShadow: '0 1px 3px rgba(0,80,40,.04)' }}>
    {title && (
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: INK, margin: 0, textTransform: 'uppercase', letterSpacing: .6 }}>{title}</h3>
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
    )}
    {children}
  </div>
);

/* Compact stat */
export const MiniStat: React.FC<{ label: string; value: any; sub?: string }> = ({ label, value, sub }) => (
  <div style={{ flex: 1, minWidth: 120, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '13px 15px' }}>
    <p style={{ fontSize: 10, color: MUTE, textTransform: 'uppercase', letterSpacing: .6, margin: 0, fontWeight: 700 }}>{label}</p>
    <p style={{ fontSize: 22, fontWeight: 800, color: GREEN_DK, margin: '5px 0 0', lineHeight: 1 }}>{fmt(value)}</p>
    {sub && <p style={{ fontSize: 11, color: MUTE, margin: '4px 0 0' }}>{sub}</p>}
  </div>
);
