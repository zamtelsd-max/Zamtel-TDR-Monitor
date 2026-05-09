/**
 * PerformanceBar — reusable KPI progress bar with colour-coded band, count/target, % label.
 * Used in HSD, ZBM and ASE dashboards.
 */
import React from 'react';
import { getBand } from '../utils/performance';

interface PerformanceBarProps {
  label:   string;
  count:   number;
  target:  number;
  /** Optional icon/emoji prefix */
  icon?:   string;
  /** Override target label (default: `of {target}`) */
  targetLabel?: string;
}

export const PerformanceBar: React.FC<PerformanceBarProps> = ({ label, count, target, icon, targetLabel }) => {
  const pct  = target > 0 ? Math.min(Math.round(count / target * 100), 100) : 0;
  const band = getBand(pct);
  const safeTarget = target > 0 ? target : 1;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">
          {icon && <span className="mr-1">{icon}</span>}{label}
        </span>
        <span className={`text-xs font-bold ${band.color}`}>
          {pct}% — {count.toLocaleString()} {targetLabel ?? `of ${safeTarget.toLocaleString()}`}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: band.ring }}
        />
      </div>
    </div>
  );
};

/** Compact performance card for TDR rows in ZBM/ASE dashboards */
interface TDRPerfCardProps {
  name:        string;
  zone?:       string | null;
  agents:      number;
  merchants:   number;
  visits:      number;
  floatIssues: number;
  reactivations?:      number;
  reactivationTarget?: number;
  score:       number;
  agentTarget:    number;
  merchantTarget: number;
  visitTarget:    number;
  flagSeverity?:  'critical' | 'warning' | null;
  onClick?:    () => void;
  actionSlot?: React.ReactNode;
}

export const TDRPerfCard: React.FC<TDRPerfCardProps> = ({
  name, zone, agents, merchants, visits, floatIssues,
  reactivations, reactivationTarget,
  score, agentTarget, merchantTarget, visitTarget,
  flagSeverity, onClick, actionSlot,
}) => {
  const band = getBand(score);

  const agentPct        = Math.min(Math.round(agents        / Math.max(agentTarget,          1) * 100), 100);
  const merchantPct     = Math.min(Math.round(merchants     / Math.max(merchantTarget,        1) * 100), 100);
  const visitPct        = Math.min(Math.round(visits        / Math.max(visitTarget,           1) * 100), 100);
  const reactivationPct = reactivations !== undefined && reactivationTarget
    ? Math.min(Math.round(reactivations / Math.max(reactivationTarget, 1) * 100), 100)
    : null;

  const borderColor =
    flagSeverity === 'critical' ? 'border-red-300 bg-red-50/30' :
    flagSeverity === 'warning'  ? 'border-amber-300 bg-amber-50/20' :
    score >= 80                 ? 'border-green-200' :
    score >= 60                 ? 'border-amber-200' :
    score >= 40                 ? 'border-orange-200' :
                                  'border-red-200 bg-red-50/20';

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 p-4 ${borderColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-800 truncate">{name}</p>
            {/* Weighted score badge */}
            <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${band.bg} ${band.color}`}>
              {score}% {band.label}
            </span>
            {flagSeverity === 'critical' && <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">🔴 Critical</span>}
            {flagSeverity === 'warning'  && <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">⚠ Behind</span>}
          </div>
          {zone && <p className="text-xs text-gray-400 mt-0.5">{zone}</p>}
        </div>
        {actionSlot && <div className="ml-2 flex-shrink-0">{actionSlot}</div>}
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Weighted Score</span>
          <span className={`text-[10px] font-bold ${band.color}`}>{score}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${score}%`, background: band.ring }} />
        </div>
        {/* Band thresholds indicator */}
        <div className="flex justify-between mt-0.5 text-[9px] text-gray-300">
          <span>0</span><span>40</span><span>60</span><span>80</span><span>100</span>
        </div>
      </div>

      {/* KPI bars */}
      <div className="space-y-2">
        <KPIMini label="Agents"    pct={agentPct}    count={agents}    target={agentTarget}    />
        <KPIMini label="Merchants" pct={merchantPct} count={merchants} target={merchantTarget} />
        <KPIMini label="Visits"    pct={visitPct}    count={visits}    target={visitTarget}    />
        {reactivationPct !== null && reactivations !== undefined && reactivationTarget !== undefined && (
          <KPIMini label="🔄 Reactivations" pct={reactivationPct} count={reactivations} target={reactivationTarget} />
        )}
      </div>

      {/* Float issues callout */}
      {floatIssues > 0 && (
        <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <span className="text-base">⚠️</span>
          <p className="text-xs font-semibold text-red-700">{floatIssues} open float issue{floatIssues > 1 ? 's' : ''} — needs attention</p>
        </div>
      )}
    </div>
  );
};

const KPIMini: React.FC<{ label: string; pct: number; count: number; target: number }> = ({ label, pct, count, target }) => {
  const band = getBand(pct);
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className={`text-[10px] font-bold ${band.color}`}>{count}/{target} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: band.ring }} />
      </div>
    </div>
  );
};
