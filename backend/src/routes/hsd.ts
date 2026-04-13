import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';

export const hsdRouter = Router();
hsdRouter.use(requireAuth('HSD'));
hsdRouter.use(apiRateLimit);

const ZONES = [
  'Lusaka', 'Copperbelt', 'Northern', 'Eastern', 'Southern',
  'Western', 'Luapula', 'Muchinga', 'North-Western', 'Central',
];

function monthRange(period?: string) {
  let year: number, month: number;
  if (period) {
    [year, month] = period.split('-').map(Number);
  } else {
    const now = new Date();
    year  = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

// ─── GET /hsd/dashboard ───────────────────────────────────────────────────────
hsdRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = monthRange(period);

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
  const { start, end } = monthRange(period);

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
    const agentTarget    = target?.targetAgents    || 96 * tdrs;
    const merchantTarget = target?.targetMerchants || 96 * tdrs;
    const visitTarget    = target?.targetOutlets   || 20 * tdrs;
    const pct = tdrs > 0
      ? Math.round(((agents / agentTarget) + (merchants / merchantTarget) + (visits / visitTarget)) / 3 * 100)
      : 0;

    return { zone, zbm: zbm?.name || 'Unassigned', tdrs, agents, merchants, visits, floatIssues, pct };
  }));

  res.json({ period, zones: zoneStats });
});

// ─── GET /hsd/zones/:zone ─────────────────────────────────────────────────────
hsdRouter.get('/zones/:zone', async (req: Request, res: Response): Promise<void> => {
  const zone   = req.params.zone;
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = monthRange(period);

  const tdrs = await prisma.user.findMany({ where: { role: 'TDR', zone, active: true } });

  const tdrStats = await Promise.all(tdrs.map(async (tdr) => {
    const [agents, merchants, visits, floatIssues] = await Promise.all([
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { tdrId: tdr.id, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { tdrId: tdr.id, status: { not: 'resolved' } } }),
    ]);
    const pct = Math.round(((agents / 96) + (merchants / 96) + (visits / 20)) / 3 * 100);
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
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end } = monthRange(period);

  const [agents, visits, floatIssues, prospects] = await Promise.all([
    prisma.agent.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
    prisma.visit.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
    prisma.floatIssue.findMany({ orderBy: { reportedAt: 'desc' } }),
    prisma.prospect.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);

  // Build CSV
  const lines: string[] = [];

  lines.push('=== AGENTS ===');
  lines.push('id,tdrId,tdrName,zone,zbmName,agentName,agentCode,contactPhone,type,merchantCategory,initialFloat,town,address,cluster,market,latitude,longitude,notes,createdAt');
  agents.forEach(a => {
    lines.push([a.id, a.tdrId, a.tdrName, a.zone, a.zbmName, a.agentName, a.agentCode, a.contactPhone, a.type,
      a.merchantCategory || '', a.initialFloat, a.town, a.address || '', a.cluster || '', a.market || '',
      a.latitude || '', a.longitude || '', (a.notes || '').replace(/,/g, ';'), a.createdAt.toISOString()].join(','));
  });

  lines.push('\n=== VISITS ===');
  lines.push('id,tdrId,tdrName,zone,zbmName,outletName,agentCode,contactPhone,town,cluster,market,floatAmount,latitude,longitude,notes,createdAt');
  visits.forEach(v => {
    lines.push([v.id, v.tdrId, v.tdrName, v.zone, v.zbmName, v.outletName, v.agentCode, v.contactPhone,
      v.town, v.cluster || '', v.market || '', v.floatAmount, v.latitude || '', v.longitude || '',
      (v.notes || '').replace(/,/g, ';'), v.createdAt.toISOString()].join(','));
  });

  lines.push('\n=== FLOAT ISSUES ===');
  lines.push('id,tdrId,tdrName,zone,agentCode,agentName,contactPhone,issueType,reportedFloat,description,status,resolvedAt,resolvedBy,resolutionNotes,reportedAt');
  floatIssues.forEach(f => {
    lines.push([f.id, f.tdrId, f.tdrName, f.zone, f.agentCode, f.agentName, f.contactPhone, f.issueType,
      f.reportedFloat, f.description.replace(/,/g, ';'), f.status, f.resolvedAt?.toISOString() || '',
      f.resolvedBy || '', (f.resolutionNotes || '').replace(/,/g, ';'), f.reportedAt.toISOString()].join(','));
  });

  lines.push('\n=== PROSPECTS ===');
  lines.push('id,tdrId,tdrName,zone,prospectType,businessName,ownerName,contactPhone,town,address,merchantCategory,estimatedFloat,status,followUpDate,convertedAt,notes,createdAt');
  prospects.forEach(p => {
    lines.push([p.id, p.tdrId, p.tdrName, p.zone, p.prospectType, p.businessName, p.ownerName, p.contactPhone,
      p.town, p.address || '', p.merchantCategory || '', p.estimatedFloat || '', p.status,
      p.followUpDate?.toISOString() || '', p.convertedAt?.toISOString() || '',
      (p.notes || '').replace(/,/g, ';'), p.createdAt.toISOString()].join(','));
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="zamtel-tdr-export-${period}.csv"`);
  res.send(lines.join('\n'));
});
