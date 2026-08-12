import React from 'react';
import type { HSDDashboard, ZoneStat } from '../types';
import { BarChart, ColumnChart, Ring, ChartCard, MiniStat, GREEN_LT } from './charts';

/**
 * Strategic National Overview — modern green/white KPI cards + bar charts +
 * rings. Sits at the top of the HSD "Overview" tab. Data comes from the
 * existing HSD dashboard + zone stats (no new API needed).
 */
const NationalOverview: React.FC<{ dashboard: HSDDashboard; zones: ZoneStat[] }> = ({ dashboard, zones }) => {
  const k = dashboard.kpis as any;
  const nt = dashboard.ntBase;

  // Zone leaderboard by attainment %
  const zoneBars = [...zones]
    .sort((a, b) => b.pct - a.pct)
    .map(z => ({ label: z.zone, value: z.agents, sub: `${z.pct}%`, pct: z.pct }));

  // Prospect pipeline breakdown → columns
  const prospectCols = (dashboard.prospectsBreakdown || []).map(p => ({ label: String(p.status).replace(/_/g, ' ').slice(0, 10), value: p._count }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
      {/* KPI stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <MiniStat label="Total Agents" value={k.totalAgents ?? 0} sub={k.agentPct != null ? `${k.agentPct}% of target` : undefined} />
        <MiniStat label="Merchants" value={k.totalMerchants ?? 0} sub={k.merchantPct != null ? `${k.merchantPct}% of target` : undefined} />
        <MiniStat label="Visits" value={k.totalVisits ?? 0} sub={k.visitPct != null ? `${k.visitPct}% of target` : undefined} />
        <MiniStat label="Open Float Issues" value={k.openFloatIssues ?? 0} />
        <MiniStat label="Conversion Rate" value={`${k.conversionRate ?? 0}%`} />
      </div>

      {/* Rings + reactivation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        <ChartCard title="Attainment vs National Target">
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <Ring pct={k.agentPct ?? 0} label="Agents" size={96} />
            <Ring pct={k.merchantPct ?? 0} label="Merchants" size={96} />
            <Ring pct={k.visitPct ?? 0} label="Visits" size={96} />
          </div>
        </ChartCard>
        {nt && (
          <ChartCard title="Base Reactivation">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Ring pct={nt.pct ?? 0} label="Reactivated" size={110} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <MiniStat label="Inactive Base" value={nt.totalInactive} />
                <MiniStat label="Reactivated" value={nt.totalReactivated} />
                <MiniStat label="Remaining" value={nt.remaining} />
              </div>
            </div>
          </ChartCard>
        )}
      </div>

      {/* Zone leaderboard — vertical bar chart */}
      {zoneBars.length > 0 && (
        <ChartCard title="Zone Leaderboard — Agents">
          <ColumnChart height={210} data={zoneBars.map(z => ({ label: z.label, value: z.value, pct: z.pct }))} />
        </ChartCard>
      )}

      {/* Prospect pipeline columns */}
      {prospectCols.length > 0 && (
        <ChartCard title="Prospect Pipeline">
          <ColumnChart data={prospectCols} />
        </ChartCard>
      )}
    </div>
  );
};

export default NationalOverview;
