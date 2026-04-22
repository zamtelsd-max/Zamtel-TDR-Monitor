import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, visitMtdTarget, prorateMtdTarget, visitMonthlyTarget,
         workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';

export const tdrRouter = Router();
tdrRouter.use(requireAuth('TDR'));
tdrRouter.use(apiRateLimit);

// ─── GET /tdr/dashboard ───────────────────────────────────────────────────────
tdrRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const tdrId = req.user!.userId;
  const { start, end } = mtdRange();

  // Today's window (midnight → now)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();

  const [agentsCount, merchantsCount, visitsCount, floatIssues, prospects, recentAgents, recentVisits,
         agentsToday, merchantsToday, visitsToday] =
    await Promise.all([
      prisma.agent.count({ where: { tdrId, type: 'normal',   createdAt: { gte: start,      lte: end      } } }),
      prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: start,      lte: end      } } }),
      prisma.visit.count({ where: { tdrId,                   createdAt: { gte: start,      lte: end      } } }),
      prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
      prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
      prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.agent.count({ where: { tdrId, type: 'normal',   createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.visit.count({ where: { tdrId,                   createdAt: { gte: todayStart, lte: todayEnd } } }),
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
    mtd: {
      workingDaysElapsed: workingDaysElapsed(),
      workingDaysTotal:   workingDaysThisMonth(),
    },
    stats: {
      agents:    { count: agentsCount,    target: prorateMtdTarget(target?.targetAgents    || 96) },
      merchants: { count: merchantsCount, target: prorateMtdTarget(target?.targetMerchants || 96) },
      visits:    { count: visitsCount,    target: visitMtdTarget() },
    },
    today: {
      agents:    agentsToday,
      merchants: merchantsToday,
      visits:    visitsToday,
      target:    20, // 20 visits per working day
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

  try {
    const tdrId = req.user!.userId;

    // Check if THIS TDR already registered this agent code (per-TDR uniqueness)
    const existing = await prisma.agent.findFirst({
      where: { tdrId, agentCode: parsed.data.agentCode },
    });
    if (existing) {
      res.status(409).json({ error: `Agent code ${parsed.data.agentCode} is already registered under your account.` });
      return;
    }

    const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user!.zone || '' } });
    const agent = await prisma.agent.create({
      data: {
        ...parsed.data,
        tdrId,
        tdrName: req.user!.name,
        zone:    req.user!.zone || '',
        zbmName: zbm?.name || '',
      },
    });
    res.status(201).json(agent);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: `Agent code ${(req.body as any)?.agentCode} is already registered under your account.` });
    } else {
      res.status(500).json({ error: 'Failed to create agent' });
    }
  }
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

  try {
    // Duplicate check: same TDR + same agentCode on same calendar day
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const existing = await prisma.visit.findFirst({
      where: {
        tdrId:     req.user!.userId,
        agentCode: parsed.data.agentCode,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });
    if (existing) {
      res.status(409).json({ error: `You already recorded a visit for agent ${parsed.data.agentCode} today.` });
      return;
    }
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
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record visit' });
  }
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

  try {
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
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to report float issue' });
  }
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

  try {
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
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create prospect' });
  }
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

// ─── GET /tdr/agents/by-code/:code ────────────────────────────────────────────
tdrRouter.get('/agents/by-code/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await prisma.agent.findUnique({ where: { agentCode: req.params.code } });
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ─── DELETE /tdr/agents/:id ───────────────────────────────────────────────────
tdrRouter.delete('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.agent.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── PATCH /tdr/agents/:id ────────────────────────────────────────────────────
tdrRouter.patch('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    const { agentName, contactPhone, initialFloat, town, address, cluster, market, notes, latitude, longitude } = req.body;
    const updated = await prisma.agent.update({
      where: { id: req.params.id },
      data: { agentName, contactPhone, initialFloat, town, address, cluster, market, notes, latitude, longitude },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─── DELETE /tdr/visits/:id ───────────────────────────────────────────────────
tdrRouter.delete('/visits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
    if (!visit || visit.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.visit.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── DELETE /tdr/prospects/:id ────────────────────────────────────────────────
tdrRouter.delete('/prospects/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
    if (!prospect || prospect.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.prospect.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── POST /tdr/prospects/:id/request-closure ─────────────────────────────────
tdrRouter.post('/prospects/:id/request-closure', async (req: Request, res: Response): Promise<void> => {
  try {
    const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
    if (!prospect || prospect.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    const updated = await prisma.prospect.update({
      where: { id: req.params.id },
      data: { closedByTdr: true, zbmApprovalRequired: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to request closure' });
  }
});

// ─── GET /tdr/activities ─────────────────────────────────────────────────────
tdrRouter.get('/activities', async (req: Request, res: Response): Promise<void> => {
  try {
    const tdrId = req.user!.userId;
    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' }, take: 10 }),
      prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    const activities = [
      ...agents.map(a => ({ type: 'agent', id: a.id, label: a.agentName, sub: `${a.type} · ${a.town}`, ts: a.createdAt })),
      ...visits.map(v => ({ type: 'visit', id: v.id, label: v.outletName, sub: `Visit · ${v.town}`, ts: v.createdAt })),
      ...floatIssues.map(f => ({ type: 'float', id: f.id, label: f.agentName, sub: `Float Issue · ${f.status}`, ts: f.reportedAt })),
      ...prospects.map(p => ({ type: 'prospect', id: p.id, label: p.businessName, sub: `Prospect · ${p.status}`, ts: p.createdAt })),
    ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 20);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// ─── GET /tdr/export ─────────────────────────────────────────────────────────
tdrRouter.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const tdrId = req.user!.userId;
    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
      prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
      prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
      prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agents.map(a => ({
      'Agent Name': a.agentName, 'Agent Code': a.agentCode, 'Type': a.type,
      'Town': a.town, 'Phone': a.contactPhone, 'Initial Float': a.initialFloat,
      'Cluster': a.cluster || '', 'Market': a.market || '',
      'Latitude': a.latitude || '', 'Longitude': a.longitude || '',
      'Date': new Date(a.createdAt).toLocaleDateString(),
    }))), 'Agents');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visits.map(v => ({
      'Outlet Name': v.outletName, 'Agent Code': v.agentCode, 'Town': v.town,
      'Float Amount': v.floatAmount, 'Phone': v.contactPhone,
      'Latitude': v.latitude || '', 'Longitude': v.longitude || '',
      'Date': new Date(v.createdAt).toLocaleDateString(),
    }))), 'Visits');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(floatIssues.map(f => ({
      'Agent Code': f.agentCode, 'Agent Name': f.agentName, 'Issue Type': f.issueType,
      'Status': f.status, 'Float': f.reportedFloat, 'Description': f.description,
      'Reported': new Date(f.reportedAt).toLocaleDateString(),
    }))), 'Float Issues');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prospects.map(p => ({
      'Business': p.businessName, 'Owner': p.ownerName, 'Type': p.prospectType,
      'Status': p.status, 'Town': p.town, 'Phone': p.contactPhone,
      'Follow-up': p.followUpDate ? new Date(p.followUpDate).toLocaleDateString() : '',
      'Notes': p.notes || '',
    }))), 'Prospects');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const month = new Date().toISOString().slice(0, 7);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="TDR-Export-${req.user!.name.replace(/\s+/g,'-')}-${month}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── GET /tdr/visits/summary ──────────────────────────────────────────────────
// Returns weekly + monthly visit counts for the TDR
tdrRouter.get('/visits/summary', async (req: Request, res: Response): Promise<void> => {
  const tdrId = req.user!.userId;

  // Build last 8 weeks buckets
  const now = new Date();
  const weeks: { label: string; start: Date; end: Date }[] = [];
  for (let i = 7; i >= 0; i--) {
    const end   = new Date(now);
    end.setDate(end.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const label = `W${Math.ceil((start.getDate()) / 7)} ${start.toLocaleString('default', { month: 'short' })}`;
    weeks.push({ label, start, end });
  }

  const weeklyData = await Promise.all(weeks.map(async w => ({
    label: w.label,
    count: await prisma.visit.count({ where: { tdrId, createdAt: { gte: w.start, lte: w.end } } }),
  })));

  // Last 6 months
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    months.push({ label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), start, end });
  }

  const monthlyData = await Promise.all(months.map(async m => ({
    label: m.label,
    count: await prisma.visit.count({ where: { tdrId, createdAt: { gte: m.start, lte: m.end } } }),
  })));

  res.json({ weekly: weeklyData, monthly: monthlyData });
});

// ─── GET /tdr/agents/:id ──────────────────────────────────────────────────────
// Returns full agent detail including recent visits (joined via agentCode)
tdrRouter.get('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  const tdrId = req.user!.userId;
  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!agent || agent.tdrId !== tdrId) { res.status(404).json({ error: 'Not found' }); return; }

  const visits = await prisma.visit.findMany({
    where: { tdrId, agentCode: agent.agentCode },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({ ...agent, visits });
});

// ─── GET /tdr/agents/stale ────────────────────────────────────────────────────
// This TDR's agents whose last visit was > 5 days ago
tdrRouter.get('/agents/stale', async (req: Request, res: Response): Promise<void> => {
  const tdrId  = req.user!.userId;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 5);

  const agents = await prisma.agent.findMany({ where: { tdrId }, orderBy: { agentName: 'asc' } });

  const enriched = await Promise.all(agents.map(async (a) => {
    const lastVisit = await prisma.visit.findFirst({
      where:   { tdrId, agentCode: a.agentCode },
      orderBy: { createdAt: 'desc' },
      select:  { createdAt: true },
    });
    const lastVisitedAt = lastVisit?.createdAt ?? null;
    const daysAgo = lastVisitedAt
      ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
      : null;
    return { ...a, lastVisitedAt, daysAgo, isStale: daysAgo === null || daysAgo >= 5 };
  }));

  res.json(enriched.filter(a => a.isStale));
});
