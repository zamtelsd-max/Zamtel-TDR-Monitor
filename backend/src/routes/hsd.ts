import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, visitMtdTarget, prorateMtdTarget, visitMonthlyTarget,
         workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';

export const hsdRouter = Router();
hsdRouter.use(requireAuth('HSD'));
hsdRouter.use(apiRateLimit);

// Shared map router — accessible by both HSD and ZBM
export const mapRouter = Router();
mapRouter.use(requireAuth('HSD', 'ZBM'));
mapRouter.use(apiRateLimit);

const ZONES = [
  'Lusaka', 'Copperbelt', 'Northern', 'Eastern', 'Southern',
  'Western', 'Luapula', 'Muchinga', 'North-Western', 'Central',
];

function monthRange(period?: string) {
  let year: number, month: number;
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (period) {
    [year, month] = period.split('-').map(Number);
  } else {
    year  = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const start = new Date(year, month - 1, 1);
  // MTD: if viewing current month, end is today; otherwise full month
  const isCurrentMonth = !period || period === currentPeriod;
  const end = isCurrentMonth
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    : new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end, isCurrentMonth };
}

// ─── GET /hsd/dashboard ───────────────────────────────────────────────────────
hsdRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [totalAgents, totalMerchants, totalVisits, openIssues, criticalIssues, prospectsBreakdown] =
    await Promise.all([
      prisma.agent.count({ where: { type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { status: { not: 'resolved' } } }),
      prisma.floatIssue.findMany({
        where: { status: { not: 'resolved' }, reportedAt: { lte: fortyEightHoursAgo } },
        orderBy: { reportedAt: 'asc' },
      }),
      prisma.prospect.groupBy({ by: ['status'], _count: true }),
    ]);

  const totalRecruits     = totalAgents + totalMerchants;
  const totalConversions  = await prisma.prospect.count({ where: { status: 'converted', convertedAt: { gte: start, lte: end } } });
  const conversionRate    = totalRecruits > 0 ? Math.round(totalConversions / totalRecruits * 100) : 0;

  res.json({
    period,
    kpis: { totalAgents, totalMerchants, totalVisits, openFloatIssues: openIssues, conversionRate },
    criticalAlerts: criticalIssues,
    prospectsBreakdown,
  });
});

// ─── GET /hsd/zones ───────────────────────────────────────────────────────────
hsdRouter.get('/zones', async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  const zoneStats = await Promise.all(ZONES.map(async (zone) => {
    const [zbm, tdrs, agents, merchants, visits, floatIssues] = await Promise.all([
      prisma.user.findFirst({ where: { role: 'ZBM', zone } }),
      prisma.user.count({ where: { role: 'TDR', zone, active: true } }),
      prisma.agent.count({ where: { zone, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { zone, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { zone, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { zone, status: { not: 'resolved' } } }),
    ]);

    const target = await prisma.salesTarget.findUnique({ where: { zone_period: { zone, period } } });
    const agentTarget    = isCurrentMonth
      ? prorateMtdTarget(target?.targetAgents    || 96 * tdrs)
      : (target?.targetAgents    || 96 * tdrs);
    const merchantTarget = isCurrentMonth
      ? prorateMtdTarget(target?.targetMerchants || 96 * tdrs)
      : (target?.targetMerchants || 96 * tdrs);
    const visitTarget    = isCurrentMonth
      ? visitMtdTarget() * tdrs
      : (target?.targetOutlets   || visitMonthlyTarget() * tdrs);
    const pct = tdrs > 0
      ? Math.round(((agents / agentTarget) + (merchants / merchantTarget) + (visits / visitTarget)) / 3 * 100)
      : 0;

    return { zone, zbm: zbm?.name || 'Unassigned', tdrs, agents, merchants, visits, floatIssues, pct };
  }));

  res.json({
    period,
    zones: zoneStats,
    mtd: isCurrentMonth ? {
      workingDaysElapsed: workingDaysElapsed(),
      workingDaysTotal:   workingDaysThisMonth(),
    } : null,
  });
});

// ─── GET /hsd/zones/:zone ─────────────────────────────────────────────────────
hsdRouter.get('/zones/:zone', async (req: Request, res: Response): Promise<void> => {
  const zone   = req.params.zone;
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  const tdrs = await prisma.user.findMany({ where: { role: 'TDR', zone, active: true } });

  const tdrStats = await Promise.all(tdrs.map(async (tdr) => {
    const [agents, merchants, visits, floatIssues] = await Promise.all([
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { tdrId: tdr.id, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { tdrId: tdr.id, status: { not: 'resolved' } } }),
    ]);
    const at  = isCurrentMonth ? prorateMtdTarget(96) : 96;
    const mt  = isCurrentMonth ? prorateMtdTarget(96) : 96;
    const vt  = isCurrentMonth ? visitMtdTarget()     : visitMonthlyTarget();
    const pct = Math.round(((agents / at) + (merchants / mt) + (visits / vt)) / 3 * 100);
    return { tdr, agents, merchants, visits, floatIssues, pct };
  }));

  const floatIssues = await prisma.floatIssue.findMany({ where: { zone }, orderBy: { reportedAt: 'desc' } });
  const prospects   = await prisma.prospect.findMany({ where: { zone }, orderBy: { createdAt: 'desc' } });

  res.json({ zone, period, tdrStats, floatIssues, prospects });
});

// ─── PATCH /hsd/float-issues/:id ──────────────────────────────────────────────
hsdRouter.patch('/float-issues/:id', async (req: Request, res: Response): Promise<void> => {
  const issue = await prisma.floatIssue.findUnique({ where: { id: req.params.id } });
  if (!issue) { res.status(404).json({ error: 'Not found' }); return; }

  const { status, resolutionNotes } = req.body;
  const resolvedAt = status === 'resolved' ? new Date() : undefined;

  const updated = await prisma.floatIssue.update({
    where: { id: req.params.id },
    data: {
      status:          status || undefined,
      resolutionNotes: resolutionNotes || undefined,
      resolvedAt,
      resolvedBy:      status === 'resolved' ? req.user!.name : undefined,
    },
  });
  res.json(updated);
});

// ─── POST /hsd/targets ────────────────────────────────────────────────────────
const targetSchema = z.object({
  zone:            z.string().min(1),
  period:          z.string().regex(/^\d{4}-\d{2}$/),
  targetAgents:    z.number().int().positive().default(96),
  targetMerchants: z.number().int().positive().default(96),
  targetOutlets:   z.number().int().positive().default(20),
});

hsdRouter.post('/targets', async (req: Request, res: Response): Promise<void> => {
  const parsed = targetSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const target = await prisma.salesTarget.upsert({
    where:  { zone_period: { zone: parsed.data.zone, period: parsed.data.period } },
    update: { ...parsed.data, setByHsdId: req.user!.userId },
    create: { ...parsed.data, setByHsdId: req.user!.userId },
  });

  res.json(target);
});

// ─── GET /hsd/export ──────────────────────────────────────────────────────────
hsdRouter.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const XLSX = await import('xlsx');
    const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end } = monthRange(period);

    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: [{ zone: 'asc' }, { createdAt: 'desc' }] }),
      prisma.visit.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
      prisma.floatIssue.findMany({ orderBy: { reportedAt: 'desc' } }),
      prisma.prospect.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Agents
    const agentRows = agents.map(a => ({
      'Zone': a.zone, 'ZBM': a.zbmName, 'TDR Name': a.tdrName,
      'Agent Name': a.agentName, 'Agent Code': a.agentCode, 'Phone': a.contactPhone,
      'Type': a.type, 'Category': a.merchantCategory || '',
      'Initial Float': a.initialFloat, 'Town': a.town, 'Address': a.address || '',
      'Cluster': a.cluster || '', 'Market': a.market || '',
      'Latitude': a.latitude || '', 'Longitude': a.longitude || '',
      'Notes': a.notes || '', 'Date': a.createdAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agentRows.length > 0 ? agentRows : [{}]), 'Agents');

    // Sheet 2: Visits
    const visitRows = visits.map(v => ({
      'Zone': v.zone, 'ZBM': v.zbmName, 'TDR Name': v.tdrName,
      'Outlet Name': v.outletName, 'Agent Code': v.agentCode, 'Phone': v.contactPhone,
      'Town': v.town, 'Cluster': v.cluster || '', 'Market': v.market || '',
      'Float Amount': v.floatAmount,
      'Latitude': v.latitude || '', 'Longitude': v.longitude || '',
      'Notes': v.notes || '', 'Date': v.createdAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitRows.length > 0 ? visitRows : [{}]), 'Visits');

    // Sheet 3: Float Issues
    const issueRows = floatIssues.map(f => ({
      'Zone': f.zone, 'TDR Name': f.tdrName,
      'Agent Code': f.agentCode, 'Agent Name': f.agentName, 'Phone': f.contactPhone,
      'Issue Type': f.issueType, 'Float Amount': f.reportedFloat,
      'Description': f.description, 'Status': f.status,
      'Resolved At': f.resolvedAt?.toISOString().split('T')[0] || '',
      'Resolution Notes': f.resolutionNotes || '',
      'Reported At': f.reportedAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issueRows.length > 0 ? issueRows : [{}]), 'Float Issues');

    // Sheet 4: Prospects
    const prospectRows = prospects.map(p => ({
      'Zone': p.zone, 'TDR Name': p.tdrName,
      'Prospect Type': p.prospectType, 'Business Name': p.businessName,
      'Owner Name': p.ownerName, 'Phone': p.contactPhone, 'Town': p.town,
      'Category': p.merchantCategory || '', 'Est. Float': p.estimatedFloat || '',
      'Status': p.status,
      'Follow-up Date': p.followUpDate?.toISOString().split('T')[0] || '',
      'Converted At': p.convertedAt?.toISOString().split('T')[0] || '',
      'Notes': p.notes || '', 'Date': p.createdAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prospectRows.length > 0 ? prospectRows : [{}]), 'Prospects');

    // Sheet 5: Unvisited Outlets (all zones — last visit > 4 days or never)
    const allAgents = await prisma.agent.findMany({
      orderBy: [{ zone: 'asc' }, { tdrName: 'asc' }, { agentName: 'asc' }],
    });
    const unvisitedRows: object[] = [];
    for (const a of allAgents) {
      const lastVisit = await prisma.visit.findFirst({
        where: { agentCode: a.agentCode },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const lastVisitedAt = lastVisit?.createdAt ?? null;
      const daysAgo = lastVisitedAt
        ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
        : null;
      if (daysAgo === null || daysAgo >= 4) {
        unvisitedRows.push({
          'Zone': a.zone, 'ZBM': a.zbmName, 'TDR Name': a.tdrName,
          'Agent Name': a.agentName, 'Agent Code': a.agentCode,
          'Type': a.type, 'Phone': a.contactPhone, 'Town': a.town,
          'Cluster': a.cluster || '', 'Market': a.market || '',
          'Last Visited': lastVisitedAt ? lastVisitedAt.toISOString().split('T')[0] : 'NEVER',
          'Days Since Visit': daysAgo === null ? 'Never' : daysAgo,
          'Status': daysAgo === null ? '🔴 Never Visited' : `🔴 ${daysAgo} days ago`,
        });
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      unvisitedRows.length > 0 ? unvisitedRows : [{ 'Status': 'All outlets visited within 4 days ✅' }]
    ), 'Unvisited Outlets');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="zamtel-hsd-export-${period}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('HSD export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── GPS Map Data ──────────────────────────────────────────────────────────────
mapRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { zone } = req.query
    const user = (req as any).user

    // ZBM can only see their own zone; HSD can filter by zone param
    const zoneFilter = user.role === 'ZBM' ? user.zone :
                       (zone && zone !== 'all' ? zone : undefined)

    const [agents, visits] = await Promise.all([
      prisma.agent.findMany({
        where: {
          ...(zoneFilter ? { zone: zoneFilter as string } : {}),
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
          ...(zoneFilter ? { zone: zoneFilter as string } : {}),
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
    ])

    res.json({
      success: true,
      data: { agents, visits },
      summary: {
        totalAgents: agents.length,
        totalVisits: visits.length,
        zones: [...new Set([...agents.map(a => a.zone), ...visits.map(v => v.zone)])].filter(Boolean),
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch map data' })
  }
})

// ─── GET /hsd/agents/stale ────────────────────────────────────────────────────
// All agents nationwide whose last visit was > 5 days ago (HSD national view)
hsdRouter.get('/agents/stale', async (req: Request, res: Response): Promise<void> => {
  const agents = await prisma.agent.findMany({ orderBy: [{ zone: 'asc' }, { agentName: 'asc' }] });

  const enriched = await Promise.all(agents.map(async (a) => {
    const lastVisit = await prisma.visit.findFirst({
      where:   { agentCode: a.agentCode },
      orderBy: { createdAt: 'desc' },
      select:  { createdAt: true },
    });
    const lastVisitedAt = lastVisit?.createdAt ?? null;
    const daysAgo = lastVisitedAt
      ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
      : null;
    return { ...a, lastVisitedAt, daysAgo, isStale: daysAgo === null || daysAgo >= 5 };
  }));

  const stale = enriched.filter(a => a.isStale);
  res.json({ stale, total: agents.length, staleCount: stale.length });
});

// ─── GET /hsd/leaderboard ─────────────────────────────────────────────────────
// Top TDRs (all zones) + Zone leaderboard ranked by % achievement
hsdRouter.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  const at = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const mt = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const vt = isCurrentMonth ? visitMtdTarget()     : visitMonthlyTarget();

  const tdrs = await prisma.user.findMany({ where: { role: 'TDR', active: true } });

  const tdrRows = await Promise.all(tdrs.map(async (tdr) => {
    const [agents, merchants, visits] = await Promise.all([
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { tdrId: tdr.id, createdAt: { gte: start, lte: end } } }),
    ]);
    const pct = Math.round(((agents / at) + (merchants / mt) + (visits / vt)) / 3 * 100);
    return { id: tdr.id, name: tdr.name, zone: tdr.zone || 'Unassigned', agents, merchants, visits, pct };
  }));

  // Top 30 TDRs by pct
  const topTDRs = [...tdrRows].sort((a, b) => b.pct - a.pct || b.agents - a.agents).slice(0, 30);

  // Zone leaderboard (aggregate per zone)
  const zoneMap: Record<string, { zone: string; agents: number; merchants: number; visits: number; tdrCount: number }> = {};
  for (const r of tdrRows) {
    if (!zoneMap[r.zone]) zoneMap[r.zone] = { zone: r.zone, agents: 0, merchants: 0, visits: 0, tdrCount: 0 };
    zoneMap[r.zone].agents    += r.agents;
    zoneMap[r.zone].merchants += r.merchants;
    zoneMap[r.zone].visits    += r.visits;
    zoneMap[r.zone].tdrCount  += 1;
  }
  const zoneRows = Object.values(zoneMap).map(z => {
    const zt = z.tdrCount;
    const pct = zt > 0 ? Math.round(((z.agents / (at * zt)) + (z.merchants / (mt * zt)) + (z.visits / (vt * zt))) / 3 * 100) : 0;
    return { ...z, pct };
  }).sort((a, b) => b.pct - a.pct || b.agents - a.agents);

  res.json({
    period,
    topTDRs,
    zoneLeaderboard: zoneRows,
    mtd: isCurrentMonth ? { workingDaysElapsed: workingDaysElapsed(), workingDaysTotal: workingDaysThisMonth() } : null,
  });
});
