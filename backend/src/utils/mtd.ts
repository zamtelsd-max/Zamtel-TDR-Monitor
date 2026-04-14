/**
 * Month-to-date (MTD) target helpers — Zambia working week (Mon–Sat).
 * Targets are prorated to how many working days have elapsed so far this month.
 */

/** Working days (Mon–Sat) elapsed up to and including today */
export function workingDaysElapsed(): number {
  const n     = new Date();
  const today = n.getDate();
  let count   = 0;
  for (let d = 1; d <= today; d++) {
    if (new Date(n.getFullYear(), n.getMonth(), d).getDay() !== 0) count++;
  }
  return Math.max(count, 1); // min 1 to avoid division by zero
}

/** Total working days (Mon–Sat) in the current month */
export function workingDaysThisMonth(): number {
  const n    = new Date();
  const days = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  let count  = 0;
  for (let d = 1; d <= days; d++) {
    if (new Date(n.getFullYear(), n.getMonth(), d).getDay() !== 0) count++;
  }
  return count;
}

/** MTD visit target = 20 visits/day × working days elapsed */
export function visitMtdTarget(): number {
  return 20 * workingDaysElapsed();
}

/** MTD prorated target = fullMonthTarget × (elapsed / total working days) */
export function prorateMtdTarget(fullMonthTarget: number): number {
  const elapsed = workingDaysElapsed();
  const total   = workingDaysThisMonth();
  return Math.max(1, Math.round(fullMonthTarget * elapsed / total));
}

/** Full-month visit target (used for export filenames / labels) */
export function visitMonthlyTarget(): number {
  return 20 * workingDaysThisMonth();
}

/** Date range: 1st of current month → end of today (MTD window) */
export function mtdRange(): { start: Date; end: Date } {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}
