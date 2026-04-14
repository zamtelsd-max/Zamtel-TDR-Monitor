/**
 * Zamtel TDR Performance Scoring
 * ─────────────────────────────────────────────────────────────────
 * Weights:
 *   Agent Recruitment     40%
 *   Merchant Recruitment  20%
 *   Float Issue Resolution 30%
 *   Trade Visitations     10%
 *
 * Performance Bands:
 *   ≥ 80%  → Green   (On Track / Excellent)
 *   60–79% → Amber   (Needs Attention)
 *   40–59% → Orange  (Below Target)
 *   < 40%  → Red     (Critical)
 */

export const WEIGHTS = {
  agents:   0.40,   // Agent Recruitment      40%
  merchants: 0.20,  // Merchant Recruitment   20%
  floats:   0.30,   // Float Issue Resolution 30%
  visits:   0.10,   // Trade Visitations      10%
} as const;

export const WEIGHT_LABELS = {
  agents:    'Agent Recruitment',
  merchants: 'Merchant Recruitment',
  floats:    'Float Issue Resolution',
  visits:    'Trade Visitations',
} as const;

export const WEIGHT_PCT = {
  agents:    '40%',
  merchants: '20%',
  floats:    '30%',
  visits:    '10%',
} as const;

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
  agentPct:    number;   // 0–100
  merchantPct: number;   // 0–100
  floatPct:    number;   // 0–100  (resolved / total, or 100 if none)
  visitPct:    number;   // 0–100
}

/**
 * Calculates a single weighted composite score (0–100).
 */
export function calcWeightedScore(k: KPIInputs): number {
  return Math.round(
    Math.min(k.agentPct,    100) * WEIGHTS.agents    +
    Math.min(k.merchantPct, 100) * WEIGHTS.merchants  +
    Math.min(k.floatPct,    100) * WEIGHTS.floats     +
    Math.min(k.visitPct,    100) * WEIGHTS.visits
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
