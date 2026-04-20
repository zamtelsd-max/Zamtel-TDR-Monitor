import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { hsdApi } from '../services/api';
import { Layout, PageHeader } from '../components/Layout';
import { Card, Skeleton, Badge } from '../components/UI';
import { format } from 'date-fns';
import { getBand, prorateMtdTarget, visitMtdTarget } from '../utils/performance';
import { useAppSelector } from '../hooks/useAppDispatch';
import { getUserTitle } from '../utils/userTitle';

/* ─── Medal / rank helpers ──────────────────────────────────────────────────── */
function rankIcon(rank: number) {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  if (rank <= 5)  return '⭐';
  if (rank <= 10) return '🏅';
  return `#${rank}`;
}
function rankBg(rank: number) {
  if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-lg shadow-yellow-200';
  if (rank === 2) return 'bg-gradient-to-r from-slate-300 to-slate-400 text-white shadow-md shadow-slate-200';
  if (rank === 3) return 'bg-gradient-to-r from-orange-300 to-amber-400 text-white shadow-md shadow-orange-200';
  if (rank <= 5)  return 'bg-gradient-to-r from-green-50 to-emerald-100 text-zamtel-green border border-emerald-200';
  if (rank <= 10) return 'bg-white border border-gray-200';
  return 'bg-white border border-gray-100';
}
function pctBadge(pct: number) {
  const b = getBand(pct);
  return <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', b.color, b.bg)}>{pct}%</span>;
}
function zoneBadgeCls(rank: number) {
  if (rank === 1) return 'bg-yellow-400 text-white';
  if (rank === 2) return 'bg-slate-400 text-white';
  if (rank === 3) return 'bg-amber-400 text-white';
  return 'bg-zamtel-green text-white';
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

/* ─── Animated count-up ─────────────────────────────────────────────────────── */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.max(1, Math.floor(value / 20));
    const timer = setInterval(() => {
      start = Math.min(start + step, value);
      setDisplay(start);
      if (start >= value) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

/* ─── ProgressBar ───────────────────────────────────────────────────────────── */
function ProgressBar({ pct, rank }: { pct: number; rank: number }) {
  const capped = Math.min(pct, 100);
  const color = rank === 1 ? 'bg-yellow-400' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-amber-400' : rank <= 10 ? 'bg-zamtel-green' : 'bg-gray-300';
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={clsx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${capped}%` }} />
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────────────── */
export const LeaderboardPage: React.FC = () => {
  const authUser  = useAppSelector(s => s.auth.user);
  const userTitle = authUser ? getUserTitle(authUser.id, authUser.name) : '';
  const months    = monthOptions();

  const [period,  setPeriod]  = useState(months[0].value);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'tdr' | 'zone'>('tdr');
  const [data, setData] = useState<{
    topTDRs: Array<{ id: string; name: string; zone: string; agents: number; merchants: number; visits: number; pct: number }>;
    zoneLeaderboard: Array<{ zone: string; agents: number; merchants: number; visits: number; tdrCount: number; pct: number }>;
    mtd: { workingDaysElapsed: number; workingDaysTotal: number } | null;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    hsdApi.getLeaderboard(period)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const at = prorateMtdTarget(96);
  const mt = prorateMtdTarget(96);
  const vt = visitMtdTarget();

  return (
    <Layout title="Leaderboard" showBack backTo="/hsd">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="🏆 Sales Leaderboard"
        subtitle={userTitle}
      />

      {/* ── Sub-header strip ───────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="bg-gradient-to-r from-zamtel-green to-emerald-700 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-medium opacity-80 uppercase tracking-wide">Create Your World</p>
              <p className="text-lg font-bold leading-tight">Top Performers · Zambia</p>
              {data?.mtd && (
                <p className="text-xs opacity-75 mt-0.5">
                  📅 Working day {data.mtd.workingDaysElapsed} of {data.mtd.workingDaysTotal}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="bg-white/20 text-white text-xs rounded-lg px-2 py-1.5 border border-white/30 outline-none appearance-none pr-6"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                style={{ backgroundImage: 'none' }}
              >
                {months.map(m => <option key={m.value} value={m.value} className="text-gray-800">{m.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab switcher ───────────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['tdr', 'zone'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'flex-1 py-2 text-sm font-semibold rounded-lg transition-all',
                tab === t
                  ? 'bg-white text-zamtel-green shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t === 'tdr' ? '👤 Top 30 TDRs' : '🗺️ Zone Ranking'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Targets strip ──────────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Agent Target', value: at },
            { label: 'Merchant Target', value: mt },
            { label: 'Visit Target', value: vt },
          ].map(x => (
            <div key={x.label} className="bg-white rounded-xl py-2 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400">{x.label}</p>
              <p className="text-base font-bold text-zamtel-dark">{x.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="px-4 pb-8 space-y-3">

        {/* ── Loading ─────────────────────────────────────────────── */}
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse">
            <div className="flex gap-3 items-center">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-2/3" />
                <div className="h-2 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          </div>
        ))}

        {/* ── TDR Leaderboard ─────────────────────────────────────── */}
        {!loading && tab === 'tdr' && data && (
          <>
            {/* Top 3 podium */}
            {data.topTDRs.length >= 3 && (
              <div className="grid grid-cols-3 gap-2 mb-1">
                {/* 2nd place */}
                <div className="flex flex-col items-center bg-gradient-to-b from-slate-100 to-slate-200 rounded-2xl pt-3 pb-4 px-2 text-center border border-slate-200 shadow-sm mt-6">
                  <div className="text-2xl mb-1">🥈</div>
                  <div className="w-12 h-12 rounded-full bg-slate-400 flex items-center justify-center text-white font-bold text-lg mb-1 shadow">
                    {data.topTDRs[1].name.charAt(0)}
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-2 text-center">{data.topTDRs[1].name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{data.topTDRs[1].zone}</p>
                  <span className="mt-1 text-xs font-bold text-slate-600 bg-white/70 px-2 py-0.5 rounded-full">{data.topTDRs[1].pct}%</span>
                </div>
                {/* 1st place */}
                <div className="flex flex-col items-center bg-gradient-to-b from-yellow-300 to-amber-400 rounded-2xl pt-2 pb-4 px-2 text-center border border-yellow-300 shadow-lg shadow-yellow-200 z-10">
                  <div className="text-3xl mb-1">👑</div>
                  <div className="w-14 h-14 rounded-full bg-yellow-600 flex items-center justify-center text-white font-bold text-xl mb-1 shadow-lg ring-2 ring-white">
                    {data.topTDRs[0].name.charAt(0)}
                  </div>
                  <p className="text-xs font-bold text-yellow-900 leading-tight line-clamp-2 text-center">{data.topTDRs[0].name}</p>
                  <p className="text-[10px] text-yellow-800 mt-0.5">{data.topTDRs[0].zone}</p>
                  <span className="mt-1 text-xs font-bold text-yellow-900 bg-white/60 px-2 py-0.5 rounded-full">{data.topTDRs[0].pct}%</span>
                </div>
                {/* 3rd place */}
                <div className="flex flex-col items-center bg-gradient-to-b from-orange-100 to-amber-200 rounded-2xl pt-3 pb-4 px-2 text-center border border-amber-200 shadow-sm mt-8">
                  <div className="text-2xl mb-1">🥉</div>
                  <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-lg mb-1 shadow">
                    {data.topTDRs[2].name.charAt(0)}
                  </div>
                  <p className="text-xs font-bold text-amber-800 leading-tight line-clamp-2 text-center">{data.topTDRs[2].name}</p>
                  <p className="text-[10px] text-amber-700 mt-0.5">{data.topTDRs[2].zone}</p>
                  <span className="mt-1 text-xs font-bold text-amber-800 bg-white/70 px-2 py-0.5 rounded-full">{data.topTDRs[2].pct}%</span>
                </div>
              </div>
            )}

            {/* Ranks 4–30 */}
            {data.topTDRs.slice(3).map((row, i) => {
              const rank = i + 4;
              return (
                <div key={row.id} className={clsx('rounded-2xl p-3.5 transition-all', rankBg(rank))}>
                  <div className="flex items-center gap-3">
                    {/* Rank badge */}
                    <div className={clsx(
                      'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold',
                      rank <= 5 ? 'bg-emerald-200 text-zamtel-green' : 'bg-gray-100 text-gray-500'
                    )}>
                      {rankIcon(rank)}
                    </div>
                    {/* Avatar */}
                    <div className={clsx(
                      'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-base',
                      rank <= 5 ? 'bg-zamtel-green text-white' : 'bg-gray-200 text-gray-600'
                    )}>
                      {row.name.charAt(0)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={clsx('text-sm font-bold truncate', rank <= 5 ? 'text-zamtel-dark' : 'text-gray-700')}>{row.name}</p>
                        {pctBadge(row.pct)}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{row.zone}</p>
                      <ProgressBar pct={row.pct} rank={rank} />
                    </div>
                    {/* Stats */}
                    <div className="flex-shrink-0 text-right hidden xs:block">
                      <p className="text-xs text-gray-400">A·<span className="font-semibold text-gray-600"><CountUp value={row.agents} /></span></p>
                      <p className="text-xs text-gray-400">M·<span className="font-semibold text-gray-600"><CountUp value={row.merchants} /></span></p>
                      <p className="text-xs text-gray-400">V·<span className="font-semibold text-gray-600"><CountUp value={row.visits} /></span></p>
                    </div>
                  </div>
                  {/* Mobile stats row */}
                  <div className="flex gap-3 mt-2 xs:hidden">
                    <span className="text-xs text-gray-500">Agents: <b>{row.agents}</b></span>
                    <span className="text-xs text-gray-500">Merchants: <b>{row.merchants}</b></span>
                    <span className="text-xs text-gray-500">Visits: <b>{row.visits}</b></span>
                  </div>
                </div>
              );
            })}

            {data.topTDRs.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-sm">No data for this period yet</p>
              </div>
            )}
          </>
        )}

        {/* ── Zone Leaderboard ────────────────────────────────────── */}
        {!loading && tab === 'zone' && data && (
          <>
            {/* Top zone podium */}
            {data.zoneLeaderboard.length >= 3 && (
              <div className="grid grid-cols-3 gap-2 mb-1">
                {/* 2nd */}
                <div className="flex flex-col items-center bg-gradient-to-b from-slate-100 to-slate-200 rounded-2xl pt-3 pb-4 px-2 text-center border border-slate-200 shadow-sm mt-6">
                  <div className="text-2xl mb-1">🥈</div>
                  <p className="text-xs font-bold text-slate-700 leading-tight">{data.zoneLeaderboard[1].zone}</p>
                  <p className="text-[10px] text-slate-500">{data.zoneLeaderboard[1].tdrCount} TDRs</p>
                  <span className="mt-1 text-xs font-bold text-slate-600 bg-white/70 px-2 py-0.5 rounded-full">{data.zoneLeaderboard[1].pct}%</span>
                </div>
                {/* 1st */}
                <div className="flex flex-col items-center bg-gradient-to-b from-yellow-300 to-amber-400 rounded-2xl pt-2 pb-4 px-2 text-center border border-yellow-300 shadow-lg shadow-yellow-200 z-10">
                  <div className="text-3xl mb-1">👑</div>
                  <p className="text-xs font-bold text-yellow-900 leading-tight">{data.zoneLeaderboard[0].zone}</p>
                  <p className="text-[10px] text-yellow-800">{data.zoneLeaderboard[0].tdrCount} TDRs</p>
                  <span className="mt-1 text-xs font-bold text-yellow-900 bg-white/60 px-2 py-0.5 rounded-full">{data.zoneLeaderboard[0].pct}%</span>
                </div>
                {/* 3rd */}
                <div className="flex flex-col items-center bg-gradient-to-b from-orange-100 to-amber-200 rounded-2xl pt-3 pb-4 px-2 text-center border border-amber-200 shadow-sm mt-8">
                  <div className="text-2xl mb-1">🥉</div>
                  <p className="text-xs font-bold text-amber-800 leading-tight">{data.zoneLeaderboard[2].zone}</p>
                  <p className="text-[10px] text-amber-700">{data.zoneLeaderboard[2].tdrCount} TDRs</p>
                  <span className="mt-1 text-xs font-bold text-amber-800 bg-white/70 px-2 py-0.5 rounded-full">{data.zoneLeaderboard[2].pct}%</span>
                </div>
              </div>
            )}

            {/* Ranks 4+ zones */}
            {data.zoneLeaderboard.slice(3).map((z, i) => {
              const rank = i + 4;
              const b = getBand(z.pct);
              return (
                <div key={z.zone} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={clsx('flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white', zoneBadgeCls(rank))}>
                      {rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-bold text-zamtel-dark">{z.zone}</p>
                        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', b.color, b.bg)}>{z.pct}%</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-1">{z.tdrCount} TDR{z.tdrCount !== 1 ? 's' : ''}</p>
                      <ProgressBar pct={z.pct} rank={rank} />
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2.5 pl-11">
                    <span className="text-xs text-gray-500">Agents <b className="text-gray-700">{z.agents}</b></span>
                    <span className="text-xs text-gray-500">Merchants <b className="text-gray-700">{z.merchants}</b></span>
                    <span className="text-xs text-gray-500">Visits <b className="text-gray-700">{z.visits}</b></span>
                  </div>
                </div>
              );
            })}

            {data.zoneLeaderboard.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">🗺️</div>
                <p className="text-sm">No zone data for this period</p>
              </div>
            )}
          </>
        )}

      </div>
    </Layout>
  );
};
