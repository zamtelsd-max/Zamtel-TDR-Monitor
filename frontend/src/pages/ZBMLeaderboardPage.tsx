import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { zbmApi } from '../services/api';
import { Layout, PageHeader } from '../components/Layout';
import { Skeleton } from '../components/UI';
import { format } from 'date-fns';
import { getBand } from '../utils/performance';

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function rankIcon(rank: number) {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  if (rank <= 5)  return '⭐';
  if (rank <= 10) return '🏅';
  return `#${rank}`;
}

function monthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opts.push({ value: val, label: format(d, 'MMMM yyyy') });
  }
  return opts;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={clsx('h-full rounded-full transition-all duration-700', color)}
        style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const b = getBand(score);
  return <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', b.color, b.bg)}>{score}%</span>;
}

type TDRRow = {
  id: string; name: string; zone: string;
  agents: number; merchants: number; visits: number;
  floatTotal: number; floatResolved: number;
  agentPct: number; merchantPct: number; visitPct: number; floatPct: number;
  score: number; pct: number;
};

/* ─── Podium card ───────────────────────────────────────────────────────────── */
const PodiumCard: React.FC<{ row: TDRRow; rank: 1 | 2 | 3 }> = ({ row, rank }) => {
  const styles = {
    1: { wrap: 'bg-gradient-to-b from-yellow-300 to-amber-400 border-yellow-300 shadow-lg shadow-yellow-200 z-10', avatar: 'bg-yellow-600 ring-2 ring-white w-14 h-14 text-xl', name: 'text-yellow-900', zone: 'text-yellow-800', badge: 'text-yellow-900 bg-white/60', mt: '' },
    2: { wrap: 'bg-gradient-to-b from-slate-100 to-slate-200 border-slate-200 shadow-sm mt-6', avatar: 'bg-slate-400 w-12 h-12 text-lg', name: 'text-slate-700', zone: 'text-slate-500', badge: 'text-slate-600 bg-white/70', mt: 'mt-6' },
    3: { wrap: 'bg-gradient-to-b from-orange-100 to-amber-200 border-amber-200 shadow-sm', avatar: 'bg-amber-500 w-12 h-12 text-lg', name: 'text-amber-800', zone: 'text-amber-700', badge: 'text-amber-800 bg-white/70', mt: 'mt-8' },
  }[rank];

  return (
    <div className={clsx('flex flex-col items-center rounded-2xl pt-2 pb-4 px-2 text-center border', styles.wrap, styles.mt)}>
      <div className="text-2xl mb-1">{rankIcon(rank)}</div>
      <div className={clsx('rounded-full flex items-center justify-center text-white font-bold mb-1 shadow', styles.avatar)}>
        {row.name.charAt(0).toUpperCase()}
      </div>
      <p className={clsx('text-xs font-bold leading-tight line-clamp-2', styles.name)}>{row.name}</p>
      <p className={clsx('text-[10px] mt-0.5', styles.zone)}>{row.zone}</p>
      <span className={clsx('mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full', styles.badge)}>{row.score}%</span>
    </div>
  );
};

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export const ZBMLeaderboardPage: React.FC = () => {
  const months = monthOptions();
  const [period,  setPeriod]  = useState(months[0].value);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    zone: string; zbmName: string; period: string;
    tdrLeaderboard: TDRRow[];
    targets: { agents: number; merchants: number; visits: number };
    mtd: { workingDaysElapsed: number; workingDaysTotal: number } | null;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    zbmApi.getLeaderboard(period)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const ranked = data?.tdrLeaderboard ?? [];
  const top3   = ranked.slice(0, 3) as TDRRow[];
  const rest   = ranked.slice(3);

  return (
    <Layout title="Zone Leaderboard" showBack backTo="/zbm">
      <PageHeader
        title={`🏆 ${data?.zone ?? '…'} Leaderboard`}
        subtitle={data ? `${data.zbmName} · ${format(new Date(period + '-01'), 'MMMM yyyy')}` : ''}
      />

      {/* ── Hero strip ──────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-zamtel-green to-emerald-700 rounded-2xl p-4 mb-4 text-white shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-medium opacity-80 uppercase tracking-wide">Create Your World</p>
            <p className="text-lg font-bold leading-tight">TDR Performance · {data?.zone ?? '…'} Zone</p>
            {data?.mtd && (
              <p className="text-xs opacity-75 mt-0.5">
                📅 Working day {data.mtd.workingDaysElapsed} of {data.mtd.workingDaysTotal}
              </p>
            )}
          </div>
          <select
            className="bg-white/20 text-white text-xs rounded-lg px-3 py-1.5 border border-white/30 outline-none"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{ backgroundImage: 'none' }}
          >
            {months.map(m => <option key={m.value} value={m.value} className="text-gray-800">{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── MTD Targets ─────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          {[
            { label: 'Agent Target',    value: data.targets.agents },
            { label: 'Merchant Target', value: data.targets.merchants },
            { label: 'Visit Target',    value: data.targets.visits },
          ].map(x => (
            <div key={x.label} className="bg-white rounded-xl py-2 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400">{x.label}</p>
              <p className="text-base font-bold text-zamtel-dark">{x.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {/* ── Podium ──────────────────────────────────────────────── */}
      {!loading && ranked.length >= 3 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <PodiumCard row={top3[1]} rank={2} />
          <PodiumCard row={top3[0]} rank={1} />
          <PodiumCard row={top3[2]} rank={3} />
        </div>
      )}
      {!loading && ranked.length > 0 && ranked.length < 3 && (
        <div className="mb-4 space-y-3">
          {ranked.map((row, i) => (
            <RankCard key={row.id} row={row} rank={i + 1} />
          ))}
        </div>
      )}

      {/* ── Ranks 4+ ────────────────────────────────────────────── */}
      {!loading && rest.length > 0 && (
        <div className="space-y-3 mb-24">
          {rest.map((row, i) => <RankCard key={row.id} row={row} rank={i + 4} />)}
        </div>
      )}

      {/* ── Empty ───────────────────────────────────────────────── */}
      {!loading && ranked.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-sm font-medium">No TDR data for this period</p>
          <p className="text-xs mt-1">Activity will appear here once TDRs start recording</p>
        </div>
      )}
    </Layout>
  );
};

/* ─── Rank Card (4th place and below) ──────────────────────────────────────── */
const RankCard: React.FC<{ row: TDRRow; rank: number }> = ({ row, rank }) => {
  const b = getBand(row.score);
  const isTop5 = rank <= 5;
  const isTop10 = rank <= 10;

  return (
    <div className={clsx(
      'rounded-2xl p-4 border transition-all',
      rank === 1 ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-yellow-300 shadow-lg' :
      rank === 2 ? 'bg-gradient-to-r from-slate-200 to-slate-300 border-slate-200 shadow-md' :
      rank === 3 ? 'bg-gradient-to-r from-orange-200 to-amber-300 border-amber-200 shadow-md' :
      isTop5     ? 'bg-gradient-to-r from-green-50 to-emerald-100 border-emerald-200' :
      isTop10    ? 'bg-white border-gray-200' : 'bg-white border-gray-100'
    )}>
      <div className="flex items-center gap-3">
        {/* Rank */}
        <div className={clsx(
          'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold',
          isTop5 ? 'bg-zamtel-green text-white' : 'bg-gray-100 text-gray-500'
        )}>
          {rankIcon(rank)}
        </div>
        {/* Avatar */}
        <div className={clsx(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-base',
          isTop5 ? 'bg-zamtel-green text-white' : 'bg-gray-200 text-gray-600'
        )}>
          {row.name.charAt(0).toUpperCase()}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p className="text-sm font-bold text-gray-800 truncate">{row.name}</p>
            <ScoreBadge score={row.score} />
          </div>
          <div className="flex gap-3 text-xs text-gray-500 mb-1.5 flex-wrap">
            <span>A: <b className={getBand(row.agentPct).color}>{row.agents}</b></span>
            <span>M: <b className={getBand(row.merchantPct).color}>{row.merchants}</b></span>
            <span>V: <b className={getBand(row.visitPct).color}>{row.visits}</b></span>
            {row.floatTotal > 0 && (
              <span>Float: <b className={row.floatPct >= 80 ? 'text-green-700' : 'text-red-600'}>{row.floatResolved}/{row.floatTotal}</b></span>
            )}
          </div>
          <ProgressBar pct={row.score} color={
            rank === 1 ? 'bg-yellow-400' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-amber-400' :
            isTop5 ? 'bg-zamtel-green' : isTop10 ? 'bg-blue-400' : 'bg-gray-300'
          } />
        </div>
        {/* Score ring */}
        <div className="flex-shrink-0 text-right">
          <p className={clsx('text-xl font-black', b.color)}>{row.score}</p>
          <p className="text-[10px] text-gray-400">score</p>
        </div>
      </div>

      {/* Mini KPI bars */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Agents',    pct: row.agentPct },
          { label: 'Merchants', pct: row.merchantPct },
          { label: 'Visits',    pct: row.visitPct },
        ].map(kpi => {
          const kb = getBand(kpi.pct);
          return (
            <div key={kpi.label} className="bg-white/60 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-gray-500">{kpi.label}</span>
                <span className={clsx('text-[10px] font-bold', kb.color)}>{kpi.pct}%</span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(kpi.pct, 100)}%`, background: kb.ring }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
