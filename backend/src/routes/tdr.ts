import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';

export const tdrRouter = Router();
tdrRouter.use(requireAuth('TDR'));
tdrRouter.use(apiRateLimit);

// ─── Helper: working days Mon–Sat in a given month ───────────────────────────
function workingDaysInMonth(year: number, month: number): number {
  let count = 0;
  const days = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month, d).getDay() !== 0) count++; // exclude Sundays
  }
  return count;
}
function visitMonthlyTarget(): number {
  const n = new Date();
  return 20 * workingDaysInMonth(n.getFullYear(), n.getMonth());
}

// ─── Helper: current month range ─────────────────────────────────────────────
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// ─── GET /tdr/dashboard ───────────────────────────────────────────────────────
tdrRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const tdrId = req.user!.userId;
  const { start, end } = currentMonthRange();

  const [agentsCount, merchantsCount, visitsCount, floatIssues, prospects, recentAgents, recentVisits] =
    await Promise.all([
      prisma.agent.count({ where: { tdrId, type: 'normal', createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { tdrId, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
      prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
      prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);

  const floatResolved  = floatIssues.filter(f => f.status === 'resolved').length;
  const floatPending   = floatIssues.filter(f => f.status !== 'resolved').length;
  const prospectsConverted = prospects.filter(
    p => p.status === 'converted' && p.convertedAt && p.convertedAt >= start && p.convertedAt <= end
  ).length;
  const prospectsPending = prospects.filter(
    p => p.followUpDate && p.followUpDate <= new Date() && p.status !== 'converted' && p.status !== 'rejected'
  ).length;

  // Targets
  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const target = await prisma.salesTarget.findUnique({ where: { zone_period: { zone: req.user!.zone || '', period } } });

  res.json({
    tdr: { id: tdrId, name: req.user!.name, zone: req.user!.zone },
    month: period,
    stats: {
      agents:    { count: agentsCount,   target: target?.targetAgents    || 96 },
      merchants: { count: merchantsCount, target: target?.targetMerchants || 96 },
      visits:    { count: visitsCount,    target: target?.targetOutlets   || visitMonthlyTarget() },
    },
    floatIssues: {
      total:    floatIssues.length,
      resolved: floatResolved,
      pending:  floatPending,
    },
    prospects: {
      total:     prospects.length,
      converted: prospectsConverted,
      pending:   prospectsPending,
    },
    recentActivity: {
      agents: recentAgents,
      visits: recentVisits,
    },
  });
});

// ─── POST /tdr/agents ─────────────────────────────────────────────────────────
const agentSchema = z.object({
  agentName:        z.string().min(1),
  agentCode:        z.string().min(1),
  contactPhone:     z.string().min(1),
  type:             z.enum(['normal', 'merchant']),
  merchantCategory: z.string().optional(),
  initialFloat:     z.number().default(0),
  town:             z.string().min(1),
  address:          z.string().optional(),
  cluster:          z.string().optional(),
  market:           z.string().optional(),
  latitude:         z.number().optional(),
  longitude:        z.number().optional(),
  notes:            z.string().optional(),
});

tdrRouter.post('/agents', async (req: Request, res: Response): Promise<void> => {
  const parsed = agentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Find ZBM for this zone
  const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user!.zone || '' } });

  const agent = await prisma.agent.create({
    data: {
      ...parsed.data,
      tdrId:   req.user!.userId,
      tdrName: req.user!.name,
      zone:    req.user!.zone || '',
      zbmName: zbm?.name || '',
    },
  });

  res.status(201).json(agent);
});

// ─── POST /tdr/visits ─────────────────────────────────────────────────────────
const visitSchema = z.object({
  outletName:   z.string().min(1),
  agentCode:    z.string().min(1),
  contactPhone: z.string().min(1),
  town:         z.string().min(1),
  cluster:      z.string().optional(),
  market:       z.string().optional(),
  floatAmount:  z.number().default(0),
  latitude:     z.number().optional(),
  longitude:    z.number().optional(),
  notes:        z.string().optional(),
});

tdrRouter.post('/visits', async (req: Request, res: Response): Promise<void> => {
  const parsed = visitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user!.zone || '' } });

  const visit = await prisma.visit.create({
    data: {
      ...parsed.data,
      tdrId:   req.user!.userId,
      tdrName: req.user!.name,
      zone:    req.user!.zone || '',
      zbmName: zbm?.name || '',
    },
  });

  res.status(201).json(visit);
});

// ─── POST /tdr/float-issues ───────────────────────────────────────────────────
const floatIssueSchema = z.object({
  agentCode:     z.string().min(1),
  agentName:     z.string().min(1),
  contactPhone:  z.string().min(1),
  issueType:     z.enum(['low_float', 'stuck_transaction', 'system_error', 'other']),
  reportedFloat: z.number().default(0),
  description:   z.string().min(1),
});

tdrRouter.post('/float-issues', async (req: Request, res: Response): Promise<void> => {
  const parsed = floatIssueSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const issue = await prisma.floatIssue.create({
    data: {
      ...parsed.data,
      tdrId:   req.user!.userId,
      tdrName: req.user!.name,
      zone:    req.user!.zone || '',
      status:  'reported',
    },
  });

  res.status(201).json(issue);
});

// ─── GET /tdr/float-issues ────────────────────────────────────────────────────
tdrRouter.get('/float-issues', async (req: Request, res: Response): Promise<void> => {
  const issues = await prisma.floatIssue.findMany({
    where: { tdrId: req.user!.userId },
    orderBy: { reportedAt: 'desc' },
  });
  res.json(issues);
});

// ─── PATCH /tdr/float-issues/:id ─────────────────────────────────────────────
tdrRouter.patch('/float-issues/:id', async (req: Request, res: Response): Promise<void> => {
  const issue = await prisma.floatIssue.findUnique({ where: { id: req.params.id } });
  if (!issue || issue.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }

  const updated = await prisma.floatIssue.update({
    where: { id: req.params.id },
    data: {
      status: req.body.status === 'in_progress' ? 'in_progress' : undefined,
    },
  });
  res.json(updated);
});

// ─── POST /tdr/prospects ──────────────────────────────────────────────────────
const prospectSchema = z.object({
  prospectType:    z.enum(['agent', 'merchant']),
  businessName:    z.string().min(1),
  ownerName:       z.string().min(1),
  contactPhone:    z.string().min(1),
  town:            z.string().min(1),
  address:         z.string().optional(),
  merchantCategory: z.string().optional(),
  estimatedFloat:  z.number().optional(),
  status:          z.enum(['identified', 'contacted', 'interested', 'converted', 'rejected']).default('identified'),
  notes:           z.string().optional(),
  followUpDate:    z.string().optional(),
});

tdrRouter.post('/prospects', async (req: Request, res: Response): Promise<void> => {
  const parsed = prospectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const prospect = await prisma.prospect.create({
    data: {
      ...parsed.data,
      followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null,
      tdrId:   req.user!.userId,
      tdrName: req.user!.name,
      zone:    req.user!.zone || '',
    },
  });

  res.status(201).json(prospect);
});

// ─── GET /tdr/prospects ───────────────────────────────────────────────────────
tdrRouter.get('/prospects', async (req: Request, res: Response): Promise<void> => {
  const prospects = await prisma.prospect.findMany({
    where: { tdrId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(prospects);
});

// ─── PATCH /tdr/prospects/:id ─────────────────────────────────────────────────
tdrRouter.patch('/prospects/:id', async (req: Request, res: Response): Promise<void> => {
  const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
  if (!prospect || prospect.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }

  const { status, notes, followUpDate } = req.body;
  const convertedAt = status === 'converted' && prospect.status !== 'converted' ? new Date() : undefined;

  const updated = await prisma.prospect.update({
    where: { id: req.params.id },
    data: {
      status:       status || undefined,
      notes:        notes  || undefined,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      convertedAt:  convertedAt,
    },
  });

  // Auto-create Agent record when prospect converts
  if (convertedAt) {
    const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: updated.zone } });
    await prisma.agent.create({
      data: {
        agentName:        updated.businessName,
        agentCode:        `CONV-${updated.id.slice(0, 8).toUpperCase()}`,
        contactPhone:     updated.contactPhone,
        type:             updated.prospectType === 'merchant' ? 'merchant' : 'normal',
        merchantCategory: updated.merchantCategory || undefined,
        initialFloat:     updated.estimatedFloat    || 0,
        town:             updated.town,
        address:          updated.address            || undefined,
        tdrId:            updated.tdrId,
        tdrName:          updated.tdrName,
        zone:             updated.zone,
        zbmName:          zbm?.name || '',
      },
    });
  }

  res.json(updated);
});
