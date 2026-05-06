/**
 * Zamtel TDR Performance Scoring
 * ─────────────────────────────────────────────────────────────────
 * Weights:
 *   Agent Recruitment      40%
 *   Merchant Recruitment   20%
 *   Float Issue Resolution 15%
 *   Agent Reactivation     15%
 *   Trade Visitations      10%
 *
 * Performance Bands:
 *   ≥ 80%  → Green   (On Track / Excellent)
 *   60–79% → Amber   (Needs Attention)
 *   40–59% → Orange  (Below Target)
 *   < 40%  → Red     (Critical)
 */

export const WEIGHTS = {
  agents:       0.40,   // Agent Recruitment      40%
  merchants:    0.20,   // Merchant Recruitment   20%
  floats:       0.15,   // Float Issue Resolution 15%
  reactivation: 0.15,   // Agent Reactivation     15%
  visits:       0.10,   // Trade Visitations      10%
} as const;

// ─── MTD working-day helpers (Mon–Sat, Zambia) ───────────────────────────────

/** Total working days (Mon–Sat) in a given month */
export function workingDaysInMonth(year: number, month: number): number {
  let count = 0;
  const days = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month, d).getDay() !== 0) count++;
  }
  return count;
}

/** Working days elapsed so far this month (up to and including today) */
export function workingDaysElapsed(): number {
  const n = new Date();
  const today = n.getDate();
  let count = 0;
  for (let d = 1; d <= today; d++) {
    if (new Date(n.getFullYear(), n.getMonth(), d).getDay() !== 0) count++;
  }
  return Math.max(count, 1); // never 0 to avoid division by zero
}

/** Full-month working day count for current month */
export function workingDaysThisMonth(): number {
  const n = new Date();
  return workingDaysInMonth(n.getFullYear(), n.getMonth());
}

/**
 * MTD visit target = 20 × working days elapsed so far.
 * e.g. if 10 working days have passed → target = 200 visits.
 */
export function visitMtdTarget(): number {
  return 20 * workingDaysElapsed();
}

/**
 * MTD agent/merchant target = full-month target × (elapsed / total working days).
 * e.g. if 10 of 26 working days done → 96 × (10/26) ≈ 37 agents expected.
 */
export function prorateMtdTarget(fullMonthTarget: number): number {
  const elapsed = workingDaysElapsed();
  const total   = workingDaysThisMonth();
  return Math.max(1, Math.round(fullMonthTarget * elapsed / total));
}

/** @deprecated Use visitMtdTarget() for MTD scoring */
export function visitMonthlyTarget(): number {
  const n = new Date();
  return 20 * workingDaysInMonth(n.getFullYear(), n.getMonth());
}

/** Daily visit rate: 20/day */
export const VISIT_DAILY_TARGET = 20;

export const WEIGHT_LABELS = {
  agents:       'Agent Recruitment',
  merchants:    'Merchant Recruitment',
  floats:       'Float Issue Resolution',
  reactivation: 'Agent Reactivation',
  visits:       'Trade Visitations',
} as const;

export const WEIGHT_PCT = {
  agents:       '40%',
  merchants:    '20%',
  floats:       '15%',
  reactivation: '15%',
  visits:       '10%',
} as const;

/** Daily reactivation target */
export const REACTIVATION_DAILY_TARGET = 6;

// ─── Performance Band ──────────────────────────────────────────────────────────
export type Band = 'excellent' | 'good' | 'attention' | 'critical';

export interface BandInfo {
  band:       Band;
  label:      string;
  color:      string;   // Tailwind text colour
  bg:         string;   // Tailwind bg colour
  border:     string;   // Tailwind border colour
  ring:       string;   // SVG ring / hex colour
  textHex:    string;
  bgHex:      string;
}

export function getBand(pct: number): BandInfo {
  if (pct >= 80) return {
    band: 'excellent', label: 'On Track',
    color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-400',
    ring: '#16A34A', textHex: '#15803D', bgHex: '#DCFCE7',
  };
  if (pct >= 60) return {
    band: 'good', label: 'Good',
    color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-400',
    ring: '#D97706', textHex: '#B45309', bgHex: '#FEF3C7',
  };
  if (pct >= 40) return {
    band: 'attention', label: 'Needs Attention',
    color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-400',
    ring: '#EA580C', textHex: '#C2410C', bgHex: '#FFEDD5',
  };
  return {
    band: 'critical', label: 'Critical',
    color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-400',
    ring: '#DC2626', textHex: '#B91C1C', bgHex: '#FEE2E2',
  };
}

// ─── Weighted Score ────────────────────────────────────────────────────────────
export interface KPIInputs {
  agentPct:       number;   // 0–100
  merchantPct:    number;   // 0–100
  floatPct:       number;   // 0–100  (resolved / total, or 100 if none)
  reactivationPct: number;  // 0–100  (reactivations / MTD target)
  visitPct:       number;   // 0–100
}

/**
 * Calculates a single weighted composite score (0–100).
 */
export function calcWeightedScore(k: KPIInputs): number {
  return Math.round(
    Math.min(k.agentPct,          100) * WEIGHTS.agents       +
    Math.min(k.merchantPct,       100) * WEIGHTS.merchants     +
    Math.min(k.floatPct,          100) * WEIGHTS.floats        +
    Math.min(k.reactivationPct,   100) * WEIGHTS.reactivation  +
    Math.min(k.visitPct,          100) * WEIGHTS.visits
  );
}

/**
 * Float resolution % — resolved out of total issued.
 * If no issues, treat as 100% (nothing to resolve).
 */
export function floatResolutionPct(resolved: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((resolved / total) * 100);
}
