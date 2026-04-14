import { Router, Request, Response } from 'express';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';

function workingDaysInMonth(year: number, month: number): number {
  let count = 0;
  const days = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month, d).getDay() !== 0) count++;
  }
  return count;
}
function visitMonthlyTarget(): number {
  const n = new Date();
  return 20 * workingDaysInMonth(n.getFullYear(), n.getMonth());
}

export const zbmRouter = Router();
zbmRouter.use(requireAuth('ZBM'));
zbmRouter.use(apiRateLimit);

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// ─── GET /zbm/dashboard ───────────────────────────────────────────────────────
zbmRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const zone = req.user!.zone!;
  const { start, end } = currentMonthRange();

  // All TDRs in this zone
  const tdrs = await prisma.user.findMany({ where: { role: 'TDR', zone, active: true } });

  // Per-TDR stats
  const tdrStats = await Promise.all(tdrs.map(async (tdr) => {
    const [agents, merchants, visits, floatIssues] = await Promise.all([
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { tdrId: tdr.id, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { tdrId: tdr.id, status: { not: 'resolved' } } }),
    ]);

    const agentTarget    = 96;
    const merchantTarget = 96;
    const visitTarget    = visitMonthlyTarget();
    const pct = Math.round(((agents / agentTarget) + (merchants / merchantTarget) + (visits / visitTarget)) / 3 * 100);

    return { tdr, agents, merchants, visits, floatIssues, pct };
  }));

  // Zone totals
  const [totalAgents, totalMerchants, totalVisits, floatIssuesPending, prospects] = await Promise.all([
    prisma.agent.count({ where: { zone, type: 'normal',   createdAt: { gte: start, lte: end } } }),
    prisma.agent.count({ where: { zone, type: 'merchant', createdAt: { gte: start, lte: end } } }),
    prisma.visit.count({ where: { zone, createdAt: { gte: start, lte: end } } }),
    prisma.floatIssue.count({ where: { zone, status: { not: 'resolved' } } }),
    prisma.prospect.groupBy({
      by: ['status'],
      where: { zone },
      _count: true,
    }),
  ]);

  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const target = await prisma.salesTarget.findUnique({ where: { zone_period: { zone, period } } });

  res.json({
    zbm:  { id: req.user!.userId, name: req.user!.name, zone },
    month: period,
    zone: {
      totals: { agents: totalAgents, merchants: totalMerchants, visits: totalVisits, floatIssuesPending },
      targets: {
        agents:    target?.targetAgents    || 96 * tdrs.length,
        merchants: target?.targetMerchants || 96 * tdrs.length,
        visits:    target?.targetOutlets   || visitMonthlyTarget() * tdrs.length,
      },
    },
    tdrStats,
    prospectsBreakdown: prospects,
  });
});

// ─── GET /zbm/tdr/:tdrId ──────────────────────────────────────────────────────
zbmRouter.get('/tdr/:tdrId', async (req: Request, res: Response): Promise<void> => {
  const zone  = req.user!.zone!;
  const tdrId = req.params.tdrId;

  const tdr = await prisma.user.findFirst({ where: { id: tdrId, zone, role: 'TDR' } });
  if (!tdr) { res.status(404).json({ error: 'TDR not found in your zone' }); return; }

  const { start, end } = currentMonthRange();
  const [agents, visits, floatIssues, prospects] = await Promise.all([
    prisma.agent.findMany({ where: { tdrId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
    prisma.visit.findMany({ where: { tdrId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
    prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
    prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
  ]);

  res.json({ tdr, agents, visits, floatIssues, prospects });
});

// ─── GET /zbm/float-issues ────────────────────────────────────────────────────
zbmRouter.get('/float-issues', async (req: Request, res: Response): Promise<void> => {
  const issues = await prisma.floatIssue.findMany({
    where: { zone: req.user!.zone! },
    orderBy: { reportedAt: 'desc' },
  });
  res.json(issues);
});

// ─── PATCH /zbm/float-issues/:id ──────────────────────────────────────────────
zbmRouter.patch('/float-issues/:id', async (req: Request, res: Response): Promise<void> => {
  const issue = await prisma.floatIssue.findUnique({ where: { id: req.params.id } });
  if (!issue || issue.zone !== req.user!.zone) { res.status(404).json({ error: 'Not found' }); return; }

  const { status, resolutionNotes } = req.body;
  const resolvedAt = status === 'resolved' ? new Date() : undefined;

  const updated = await prisma.floatIssue.update({
    where: { id: req.params.id },
    data: {
      status:          status || undefined,
      resolutionNotes: resolutionNotes || undefined,
      resolvedAt:      resolvedAt,
      resolvedBy:      status === 'resolved' ? req.user!.name : undefined,
    },
  });
  res.json(updated);
});

// ─── GET /zbm/prospects ───────────────────────────────────────────────────────
zbmRouter.get('/prospects', async (req: Request, res: Response): Promise<void> => {
  const prospects = await prisma.prospect.findMany({
    where: { zone: req.user!.zone! },
    orderBy: { createdAt: 'desc' },
  });
  res.json(prospects);
});

// ─── GPS Map Data (ZBM — zone-scoped) ─────────────────────────────────────────
zbmRouter.get('/map', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const zoneFilter = user.zone; // ZBM always sees only their zone

    const [agents, visits] = await Promise.all([
      prisma.agent.findMany({
        where: {
          zone: zoneFilter as string,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true, agentName: true, agentCode: true, type: true,
          tdrName: true, zone: true, town: true, cluster: true,
          latitude: true, longitude: true, initialFloat: true,
          merchantCategory: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      prisma.visit.findMany({
        where: {
          zone: zoneFilter as string,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true, outletName: true, agentCode: true,
          tdrName: true, zone: true, town: true,
          latitude: true, longitude: true, floatAmount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);

    res.json({
      success: true,
      data: { agents, visits },
      summary: {
        totalAgents: agents.length,
        totalVisits: visits.length,
        zones: [zoneFilter].filter(Boolean),
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch map data' });
  }
});
