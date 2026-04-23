import { Router, Request, Response } from 'express';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, visitMtdTarget, prorateMtdTarget, visitMonthlyTarget,
         workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';

export const zbmRouter = Router();
zbmRouter.use(requireAuth('ZBM'));
zbmRouter.use(apiRateLimit);

// ─── GET /zbm/dashboard ───────────────────────────────────────────────────────
zbmRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const zone = req.user!.zone || null; // null = no zone filter (e.g. zbm-kuzanga sees all)
  const { start, end } = mtdRange();

  // All TDRs in this zone (or all if zone is null)
  const tdrs = await prisma.user.findMany({
    where: { role: 'TDR', active: true, ...(zone ? { zone } : {}) },
  });

  // Per-TDR stats
  const tdrStats = await Promise.all(tdrs.map(async (tdr) => {
    const [agents, merchants, visits, floatIssues] = await Promise.all([
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { tdrId: tdr.id, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { tdrId: tdr.id, status: { not: 'resolved' } } }),
    ]);

    const agentTarget    = prorateMtdTarget(96);
    const merchantTarget = prorateMtdTarget(96);
    const visitTarget    = visitMtdTarget();
    const pct = Math.round(((agents / agentTarget) + (merchants / merchantTarget) + (visits / visitTarget)) / 3 * 100);

    return { tdr, agents, merchants, visits, floatIssues, pct };
  }));

  const zoneWhere = zone ? { zone } : {};

  // Zone totals
  const [totalAgents, totalMerchants, totalVisits, floatIssuesPending, prospects] = await Promise.all([
    prisma.agent.count({ where: { ...zoneWhere, type: 'normal',   createdAt: { gte: start, lte: end } } }),
    prisma.agent.count({ where: { ...zoneWhere, type: 'merchant', createdAt: { gte: start, lte: end } } }),
    prisma.visit.count({ where: { ...zoneWhere, createdAt: { gte: start, lte: end } } }),
    prisma.floatIssue.count({ where: { ...zoneWhere, status: { not: 'resolved' } } }),
    prisma.prospect.groupBy({
      by: ['status'],
      where: zoneWhere,
      _count: true,
    }),
  ]);

  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const target = zone
    ? await prisma.salesTarget.findUnique({ where: { zone_period: { zone, period } } })
    : null;

  res.json({
    zbm:  { id: req.user!.userId, name: req.user!.name, zone },
    month: period,
    mtd: {
      workingDaysElapsed: workingDaysElapsed(),
      workingDaysTotal:   workingDaysThisMonth(),
    },
    zone: {
      totals: { agents: totalAgents, merchants: totalMerchants, visits: totalVisits, floatIssuesPending },
      targets: {
        agents:    prorateMtdTarget(target?.targetAgents    || 96 * tdrs.length),
        merchants: prorateMtdTarget(target?.targetMerchants || 96 * tdrs.length),
        visits:    visitMtdTarget() * tdrs.length,
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

  const { start, end } = mtdRange();
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
    const zoneFilter = user.zone || null; // null zone (e.g. zbm-kuzanga) → all zones

    const [agents, visits] = await Promise.all([
      prisma.agent.findMany({
        where: {
          ...(zoneFilter ? { zone: zoneFilter } : {}),
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
          ...(zoneFilter ? { zone: zoneFilter } : {}),
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

// ─── GET /zbm/export  ─────────────────────────────────────────────────────────
// Zone-scoped Excel export. null zone (e.g. zbm-kuzanga) → all zones.
zbmRouter.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const XLSX = await import('xlsx');
    const zone = req.user!.zone || null;
    const period = (req.query.period as string) ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const [y, m] = period.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0, 23, 59, 59, 999);

    const zoneWhere = zone ? { zone } : {};

    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({
        where: { ...zoneWhere, createdAt: { gte: start, lte: end } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.visit.findMany({
        where: { ...zoneWhere, createdAt: { gte: start, lte: end } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.floatIssue.findMany({
        where: zoneWhere,
        orderBy: { reportedAt: 'desc' },
      }),
      prisma.prospect.findMany({
        where: zoneWhere,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Agents
    const agentRows = agents.map(a => ({
      'TDR ID': a.tdrId, 'TDR Name': a.tdrName, 'Zone': a.zone, 'ZBM': a.zbmName,
      'Agent Name': a.agentName, 'Agent Code': a.agentCode, 'Phone': a.contactPhone,
      'Type': a.type, 'Category': a.merchantCategory || '',
      'Initial Float': a.initialFloat, 'Town': a.town, 'Address': a.address || '',
      'Cluster': a.cluster || '', 'Market': a.market || '',
      'Latitude': a.latitude || '', 'Longitude': a.longitude || '',
      'Notes': a.notes || '', 'Date': a.createdAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agentRows), 'Agents');

    // Sheet 2: Visits
    const visitRows = visits.map(v => ({
      'TDR ID': v.tdrId, 'TDR Name': v.tdrName, 'Zone': v.zone, 'ZBM': v.zbmName,
      'Outlet Name': v.outletName, 'Agent Code': v.agentCode, 'Phone': v.contactPhone,
      'Town': v.town, 'Cluster': v.cluster || '', 'Market': v.market || '',
      'Float Amount': v.floatAmount,
      'Latitude': v.latitude || '', 'Longitude': v.longitude || '',
      'Notes': v.notes || '', 'Date': v.createdAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitRows), 'Visits');

    // Sheet 3: Float Issues
    const issueRows = floatIssues.map(f => ({
      'TDR ID': f.tdrId, 'TDR Name': f.tdrName, 'Zone': f.zone,
      'Agent Code': f.agentCode, 'Agent Name': f.agentName, 'Phone': f.contactPhone,
      'Issue Type': f.issueType, 'Float Amount': f.reportedFloat,
      'Description': f.description, 'Status': f.status,
      'Resolved At': f.resolvedAt?.toISOString().split('T')[0] || '',
      'Resolved By': f.resolvedBy || '', 'Resolution Notes': f.resolutionNotes || '',
      'Reported At': f.reportedAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issueRows), 'Float Issues');

    // Sheet 4: Prospects
    const prospectRows = prospects.map(p => ({
      'TDR ID': p.tdrId, 'TDR Name': p.tdrName, 'Zone': p.zone,
      'Prospect Type': p.prospectType, 'Business Name': p.businessName,
      'Owner Name': p.ownerName, 'Phone': p.contactPhone,
      'Town': p.town, 'Address': p.address || '',
      'Category': p.merchantCategory || '', 'Est. Float': p.estimatedFloat || '',
      'Status': p.status,
      'Follow-up Date': p.followUpDate?.toISOString().split('T')[0] || '',
      'Converted At': p.convertedAt?.toISOString().split('T')[0] || '',
      'Notes': p.notes || '', 'Date': p.createdAt.toISOString().split('T')[0],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prospectRows), 'Prospects');

    // Sheet 5: Unvisited Outlets (never visited OR last visit > 4 days ago)
    const allAgents = await prisma.agent.findMany({
      where: zoneWhere,
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
          'Zone': a.zone, 'TDR Name': a.tdrName, 'Agent Name': a.agentName,
          'Agent Code': a.agentCode, 'Type': a.type,
          'Phone': a.contactPhone, 'Town': a.town,
          'Cluster': a.cluster || '', 'Market': a.market || '',
          'Last Visited': lastVisitedAt ? lastVisitedAt.toISOString().split('T')[0] : 'NEVER',
          'Days Since Visit': daysAgo === null ? 'Never' : daysAgo,
          'Status': daysAgo === null ? '🔴 Never Visited' : `🔴 ${daysAgo} days ago`,
        });
      }
    }
    const unvisitedSheet = XLSX.utils.json_to_sheet(
      unvisitedRows.length > 0 ? unvisitedRows : [{ 'Status': 'All outlets visited within 4 days ✅' }]
    );
    XLSX.utils.book_append_sheet(wb, unvisitedSheet, 'Unvisited Outlets');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const scope = zone || 'ALL-ZONES';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="zamtel-tdr-${scope}-${period}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── POST /zbm/prospects/:id/approve-closure ──────────────────────────────────
zbmRouter.post('/prospects/:id/approve-closure', async (req: Request, res: Response): Promise<void> => {
  try {
    const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
    if (!prospect) { res.status(404).json({ error: 'Not found' }); return; }
    if (prospect.zone !== req.user!.zone) { res.status(403).json({ error: 'Not in your zone' }); return; }
    const updated = await prisma.prospect.update({
      where: { id: req.params.id },
      data: { status: 'converted', convertedAt: new Date(), closedByTdr: true, zbmApprovalRequired: false },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve closure' });
  }
});

// ─── GET /zbm/agents/stale ────────────────────────────────────────────────────
// Agents + merchants in this ZBM's zone whose last visit was > 5 days ago (red flag)
zbmRouter.get('/agents/stale', async (req: Request, res: Response): Promise<void> => {
  const zone    = req.user!.zone ?? undefined;
  const cutoff  = new Date();
  cutoff.setDate(cutoff.getDate() - 5);

  // All agents in zone
  const agents = await prisma.agent.findMany({
    where: zone ? { zone } : {},
    orderBy: { agentName: 'asc' },
  });

  // For each agent get the most recent visit
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
    const isStale = daysAgo === null ? true : daysAgo >= 5;
    return { ...a, lastVisitedAt, daysAgo, isStale };
  }));

  const stale = enriched.filter(a => a.isStale);
  res.json({ stale, total: agents.length, staleCount: stale.length });
});

// ─── GET /zbm/leaderboard ─────────────────────────────────────────────────────
// TDR performance leaderboard scoped to this ZBM's zone
zbmRouter.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
  const zbmId = req.user!.userId;
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  // Get ZBM's zone
  const zbm = await prisma.user.findUnique({ where: { id: zbmId }, select: { zone: true, name: true } });
  const zone = zbm?.zone || null;

  // Date range for period
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0, 23, 59, 59, 999);
  const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() + 1 === month;

  const at = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const mt = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const vt = isCurrentMonth ? visitMtdTarget()     : visitMonthlyTarget();

  // All TDRs in this ZBM's zone
  const tdrs = await prisma.user.findMany({
    where: { role: 'TDR', active: true, ...(zone ? { zone } : {}) },
    orderBy: { name: 'asc' },
  });

  const rows = await Promise.all(tdrs.map(async (tdr) => {
    const [agents, merchants, visits, floatTotal, floatResolved] = await Promise.all([
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { tdrId: tdr.id, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { tdrId: tdr.id, reportedAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { tdrId: tdr.id, status: 'resolved', reportedAt: { gte: start, lte: end } } }),
    ]);
    const agentPct    = Math.min(Math.round(agents    / Math.max(at, 1) * 100), 100);
    const merchantPct = Math.min(Math.round(merchants / Math.max(mt, 1) * 100), 100);
    const visitPct    = Math.min(Math.round(visits    / Math.max(vt, 1) * 100), 100);
    const floatPct    = floatTotal > 0 ? Math.round(floatResolved / floatTotal * 100) : 100;
    // Weighted score: agents 40%, merchants 20%, float 30%, visits 10%
    const score = Math.round(agentPct * 0.4 + merchantPct * 0.2 + floatPct * 0.3 + visitPct * 0.1);
    const pct   = Math.round((agentPct + merchantPct + visitPct) / 3);
    return { id: tdr.id, name: tdr.name, zone: tdr.zone || 'Unassigned', agents, merchants, visits, floatTotal, floatResolved, agentPct, merchantPct, visitPct, floatPct, score, pct };
  }));

  const ranked = [...rows].sort((a, b) => b.score - a.score || b.agents - a.agents);

  res.json({
    period,
    zone: zone || 'All Zones',
    zbmName: zbm?.name || '',
    tdrLeaderboard: ranked,
    targets: { agents: at, merchants: mt, visits: vt },
    mtd: isCurrentMonth ? { workingDaysElapsed: workingDaysElapsed(), workingDaysTotal: workingDaysThisMonth() } : null,
  });
});
