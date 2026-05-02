import { Router, Request, Response } from 'express';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, prorateMtdTarget, visitMtdTarget, workingDaysElapsed } from '../utils/mtd';

export const flagsRouter = Router();
flagsRouter.use(requireAuth('HSD', 'ZBM', 'ASE'));
flagsRouter.use(apiRateLimit);

interface TDRFlag {
  tdrId:    string;
  tdrName:  string;
  zone:     string | null;
  aseId:    string | null;
  flags:    string[];
  severity: 'critical' | 'warning';
  daily:  { agents: number; merchants: number; visits: number; target: number };
  weekly: { agents: number; merchants: number; visits: number };
  mtd:    { agents: number; agentTarget: number; merchants: number; merchantTarget: number; visits: number; visitTarget: number };
}

// GET /flags — red-flagged TDRs scoped by caller role
flagsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const role   = req.user!.role;
    const zone   = req.user!.zone;
    const userId = req.user!.userId;

    // Scope TDRs
    const userWhere: Record<string, unknown> = { role: 'TDR', active: true };
    if (role === 'ASE')              userWhere.aseId = userId;
    else if (role === 'ZBM' && zone) userWhere.zone  = zone;

    const tdrs = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, name: true, zone: true, aseId: true },
    });
    if (tdrs.length === 0) { res.json({ success: true, total: 0, data: [] }); return; }

    const tdrIds = tdrs.map(t => t.id);
    const now    = new Date();

    // Date boundaries
    const todayStr   = now.toISOString().split('T')[0];
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const { start: mtdStart, end: mtdEnd } = mtdRange();
    const dayOfWeek  = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart  = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek); weekStart.setHours(0,0,0,0);

    // ── Batch all counts via groupBy ──────────────────────────────────────────
    const [
      dailyAgentsGrp, dailyMerchantsGrp, dailyVisitsGrp,
      weekAgentsGrp,  weekMerchantsGrp,  weekVisitsGrp,
      mtdAgentsGrp,   mtdMerchantsGrp,   mtdVisitsGrp,
    ] = await Promise.all([
      prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, type: 'normal',   createdAt: { gte: todayStart, lte: todayEnd } }, _count: true }),
      prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, type: 'merchant', createdAt: { gte: todayStart, lte: todayEnd } }, _count: true }),
      prisma.visit.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds },                   createdAt: { gte: todayStart, lte: todayEnd } }, _count: true }),
      prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, type: 'normal',   createdAt: { gte: weekStart,  lte: todayEnd } }, _count: true }),
      prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, type: 'merchant', createdAt: { gte: weekStart,  lte: todayEnd } }, _count: true }),
      prisma.visit.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds },                   createdAt: { gte: weekStart,  lte: todayEnd } }, _count: true }),
      prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, type: 'normal',   createdAt: { gte: mtdStart,   lte: mtdEnd   } }, _count: true }),
      prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, type: 'merchant', createdAt: { gte: mtdStart,   lte: mtdEnd   } }, _count: true }),
      prisma.visit.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds },                   createdAt: { gte: mtdStart,   lte: mtdEnd   } }, _count: true }),
    ]);

    const get = (grp: { tdrId: string; _count: number }[], id: string) =>
      grp.find(g => g.tdrId === id)?._count ?? 0;

    const mtdAgentTarget    = prorateMtdTarget(96);
    const mtdMerchantTarget = prorateMtdTarget(96);
    const mtdVisitTarget    = visitMtdTarget();
    const dailyVisitTarget  = 20;
    const daysElapsed       = workingDaysElapsed();
    const weekDays          = Math.min(dayOfWeek + 1, daysElapsed);
    const weekAgentTarget   = Math.max(1, Math.round(96 / 26 * weekDays));
    const weekMerchantTarget = Math.max(1, Math.round(96 / 26 * weekDays));

    const flagged: TDRFlag[] = [];

    for (const tdr of tdrs) {
      const da = get(dailyAgentsGrp,    tdr.id);
      const dm = get(dailyMerchantsGrp, tdr.id);
      const dv = get(dailyVisitsGrp,    tdr.id);
      const wa = get(weekAgentsGrp,     tdr.id);
      const wm = get(weekMerchantsGrp,  tdr.id);
      const wv = get(weekVisitsGrp,     tdr.id);
      const ma = get(mtdAgentsGrp,      tdr.id);
      const mm = get(mtdMerchantsGrp,   tdr.id);
      const mv = get(mtdVisitsGrp,      tdr.id);

      const flags: string[] = [];
      if (dv < dailyVisitTarget * 0.5)                              flags.push('⚠ Daily visits < 50% target');
      if (da + dm === 0 && daysElapsed >= 5)                        flags.push('⚠ No registrations today');
      if (daysElapsed >= 3) {
        if (wa < weekAgentTarget    * 0.5) flags.push('⚠ Weekly agents < 50% pace');
        if (wm < weekMerchantTarget * 0.5) flags.push('⚠ Weekly merchants < 50% pace');
      }
      if (ma < mtdAgentTarget    * 0.5) flags.push('🔴 MTD agents critically behind');
      if (mm < mtdMerchantTarget * 0.5) flags.push('🔴 MTD merchants critically behind');
      if (mv < mtdVisitTarget    * 0.5) flags.push('🔴 MTD visits critically behind');

      if (flags.length > 0) {
        flagged.push({
          tdrId: tdr.id, tdrName: tdr.name, zone: tdr.zone, aseId: tdr.aseId, flags,
          severity: flags.some(f => f.startsWith('🔴')) ? 'critical' : 'warning',
          daily:  { agents: da, merchants: dm, visits: dv, target: dailyVisitTarget },
          weekly: { agents: wa, merchants: wm, visits: wv },
          mtd:    { agents: ma, agentTarget: mtdAgentTarget, merchants: mm, merchantTarget: mtdMerchantTarget, visits: mv, visitTarget: mtdVisitTarget },
        });
      }
    }

    flagged.sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (b.severity === 'critical' && a.severity !== 'critical') return 1;
      return b.flags.length - a.flags.length;
    });

    res.json({ success: true, total: flagged.length, data: flagged });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute flags' });
  }
});
