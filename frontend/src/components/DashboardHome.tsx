import React from 'react';

/* ── Zamtel green/white card-grid menu (declutters dashboards) ─────────── */
const GREEN = '#00843D';
const GREEN_DK = '#006630';
const GREEN_LT = '#E8F5EE';
const INK = '#0B2E1D';
const MUTE = '#5B7267';
const LINE = '#DCEAE2';

export interface HomeTile {
  id: string;
  label: string;
  icon: React.ReactNode;
  metric?: string | number;
  sub?: string;
  badge?: number;
}

/**
 * Clean 2-column card grid landing menu — large rounded tiles, one icon + label
 * (+ optional headline metric) each. Emulates the reference app's tidy grid,
 * rendered in the Zamtel green/white brand.
 */
export const DashboardHome: React.FC<{
  title: string;
  subtitle?: string;
  tiles: HomeTile[];
  onSelect: (id: string) => void;
}> = ({ title, subtitle, tiles, onSelect }) => (
  <div style={{ padding: '4px 2px 24px' }}>
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, color: INK, margin: 0, letterSpacing: -0.3 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12.5, color: MUTE, margin: '3px 0 0' }}>{subtitle}</p>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {tiles.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            position: 'relative', textAlign: 'left', cursor: 'pointer', border: `1px solid ${LINE}`,
            background: '#fff', borderRadius: 20, padding: '18px 16px', minHeight: 118,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0,80,40,.05)', transition: 'transform .15s ease, box-shadow .15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,132,61,.14)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,80,40,.05)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, background: GREEN_LT, color: GREEN_DK, display: 'grid', placeItems: 'center' }}>
              {t.icon}
            </span>
            {t.badge != null && t.badge > 0 && (
              <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 20, background: GREEN, color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{t.badge}</span>
            )}
          </div>
          <div>
            {t.metric != null && <div style={{ fontSize: 22, fontWeight: 900, color: GREEN_DK, lineHeight: 1, marginBottom: 2 }}>{t.metric}</div>}
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{t.label}</div>
            {t.sub && <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>{t.sub}</div>}
          </div>
        </button>
      ))}
    </div>
  </div>
);

/* ── Bottom navigation bar (mobile) ────────────────────────────────────── */
export interface NavItem { id: string; label: string; icon: React.ReactNode; }

export const BottomNav: React.FC<{
  items: NavItem[];
  active: string;
  onChange: (id: string) => void;
}> = ({ items, active, onChange }) => (
  <div style={{
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
    background: '#fff', borderTop: `1px solid ${LINE}`, display: 'flex',
    boxShadow: '0 -2px 12px rgba(0,80,40,.06)', paddingBottom: 'env(safe-area-inset-bottom)',
  }}>
    {items.map(it => {
      const on = active === it.id;
      return (
        <button key={it.id} onClick={() => onChange(it.id)} style={{
          flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
          padding: '9px 4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: on ? GREEN : MUTE,
        }}>
          <span style={{ display: 'grid', placeItems: 'center' }}>{it.icon}</span>
          <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600 }}>{it.label}</span>
          {on && <span style={{ position: 'absolute', bottom: 2, width: 22, height: 3, borderRadius: 3, background: GREEN }} />}
        </button>
      );
    })}
  </div>
);
