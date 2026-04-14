/**
 * Month-to-date (MTD) target helpers — Zambia working week (Mon–Sat).
 * Targets are prorated to how many working days have elapsed so far this month.
 */
/** Working days (Mon–Sat) elapsed up to and including today */
export declare function workingDaysElapsed(): number;
/** Total working days (Mon–Sat) in the current month */
export declare function workingDaysThisMonth(): number;
/** MTD visit target = 20 visits/day × working days elapsed */
export declare function visitMtdTarget(): number;
/** MTD prorated target = fullMonthTarget × (elapsed / total working days) */
export declare function prorateMtdTarget(fullMonthTarget: number): number;
/** Full-month visit target (used for export filenames / labels) */
export declare function visitMonthlyTarget(): number;
/** Date range: 1st of current month → end of today (MTD window) */
export declare function mtdRange(): {
    start: Date;
    end: Date;
};
//# sourceMappingURL=mtd.d.ts.map