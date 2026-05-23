import { Router, Request, Response } from 'express';
import { responseCache } from '../middleware/responseCache';
import bcrypt          from 'bcryptjs';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, visitMtdTarget, prorateMtdTarget, visitMonthlyTarget,
         workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';

export const zbmRouter = Router();
zbmRouter.use(requireAuth('ZBM', 'HSD'));
zbmRouter.use(apiRateLimit);

// Helper: resolve zone for a request.
// ZBM → always their own zone (from JWT).
// HSD → can pass ?zone=Copperbelt to drill into any zone; omit for all-zones (null).
function resolveZone(req: Request): string | null {
  if (req.user!.role === 'HSD') {
    return (req.query.zone as string) || null; // null = all zones
  }
  return req.user!.zone || null;
}

// ─── GET /zbm/dashboard ───────────────────────────────────────────────────────
zbmRouter.get('/dashboard', responseCache(30), async (req: Request, res: Response): Promise<void> => {
  const zone = resolveZone(req); // HSD can pass ?zone=; ZBM always sees own zone
  const { start, end } = mtdRange();

  // All TDRs in this zone (or all if zone is null)
  const tdrs = await prisma.user.findMany({
    where: { role: 'TDR', active: true, ...(zone ? { zone } : {}) },
  });

  const tdrIds = tdrs.map(t => t.id);

  // ── Batched groupBy — 5 queries instead of 5×N ──────────────────────────
  const [agentsByTdr, merchantsByTdr, visitsByTdr, floatsByTdr, reactivationsByTdr] = await Promise.all([
    prisma.agent.groupBy({
      by: ['tdrId'], _count: true,
      where: { tdrId: { in: tdrIds }, type: 'normal',   createdAt: { gte: start, lte: end } },
    }),
    prisma.agent.groupBy({
      by: ['tdrId'], _count: true,
      where: { tdrId: { in: tdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } },
    }),
    prisma.visit.groupBy({
      by: ['tdrId'], _count: true,
      where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } },
    }),
    prisma.floatIssue.groupBy({
      by: ['tdrId'], _count: true,
      where: { tdrId: { in: tdrIds }, status: { not: 'resolved' } },
    }),
    prisma.reactivation.groupBy({
      by: ['tdrId'], _count: true,
      where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } },
    }),
  ]);

  const agentMap        = Object.fromEntries(agentsByTdr.map((r: any)        => [r.tdrId, r._count]));
  const merchantMap     = Object.fromEntries(merchantsByTdr.map((r: any)     => [r.tdrId, r._count]));
  const visitMap        = Object.fromEntries(visitsByTdr.map((r: any)        => [r.tdrId, r._count]));
  const floatMap        = Object.fromEntries(floatsByTdr.map((r: any)        => [r.tdrId, r._count]));
  const reactivationMap = Object.fromEntries(reactivationsByTdr.map((r: any) => [r.tdrId, r._count]));

  const agentTarget    = prorateMtdTarget(96);
  const merchantTarget = prorateMtdTarget(96);
  const visitTarget    = visitMtdTarget();

  const tdrStats = tdrs.map(tdr => {
    const agents        = agentMap[tdr.id]        || 0;
    const merchants     = merchantMap[tdr.id]     || 0;
    const visits        = visitMap[tdr.id]        || 0;
    const floatIssues   = floatMap[tdr.id]        || 0;
    const reactivations = reactivationMap[tdr.id] || 0;
    const pct = Math.round(((agents / agentTarget) + (merchants / merchantTarget) + (visits / visitTarget)) / 3 * 100);
    return { tdr, agents, merchants, visits, floatIssues, reactivations, pct };
  });

  const zoneWhere = zone ? { zone } : {};

  // Zone totals
  const [totalAgents, totalMerchants, totalVisits, floatIssuesPending, prospects, totalReactivations] = await Promise.all([
    prisma.agent.count({ where: { ...zoneWhere, type: 'normal',   createdAt: { gte: start, lte: end } } }),
    prisma.agent.count({ where: { ...zoneWhere, type: 'merchant', createdAt: { gte: start, lte: end } } }),
    prisma.visit.count({ where: { ...zoneWhere, createdAt: { gte: start, lte: end } } }),
    prisma.floatIssue.count({ where: { ...zoneWhere, status: { not: 'resolved' } } }),
    (zoneWhere.zone
      ? prisma.$queryRaw`SELECT status, COUNT(*)::int AS "_count" FROM prospects WHERE zone = ${zoneWhere.zone} GROUP BY status`.catch(() => [])
      : prisma.$queryRaw`SELECT status, COUNT(*)::int AS "_count" FROM prospects GROUP BY status`.catch(() => [])),
    prisma.reactivation.count({ where: { ...(zoneWhere.zone ? { zone: zoneWhere.zone } : {}), createdAt: { gte: start, lte: end } } }),
  ]);

  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const target = zone
    ? await prisma.salesTarget.findUnique({ where: { zone_period: { zone, period } } })
    : null;

  // ── ASE performance for this zone ────────────────────────────────────
  const ases = await prisma.user.findMany({
    where: { role: 'ASE', active: true, ...(zone ? { zone } : {}) },
    select: { id: true, name: true, zone: true },
  });

  // KYC device data per ASE from kyc_devices table (camelCase columns)
  const safeZoneForAse = zone ? zone.replace(/'/g, "''") : '';
  const zoneClauseAse = zone ? `AND LOWER(zone) = LOWER('${safeZoneForAse}')` : '';
  const devicesByAse = await prisma.$queryRawUnsafe(`
    SELECT "aseName", COUNT(*)::int as total, SUM("activityStatus")::int as active
    FROM kyc_devices WHERE 1=1 ${zoneClauseAse}
    GROUP BY "aseName"
  `);
  const devMap: Record<string, {total:number,active:number}> = {};
  for (const d of devicesByAse) {
    devMap[(d.aseName?.toLowerCase() || '')] = { total: d.total, active: d.active || 0 };
  }

  // TDR counts and avg score per ASE
  const aseStats = ases.map(ase => {
    const aseTdrs = tdrs.filter((t: any) => t.aseId === ase.id);
    const aseTdrIds = aseTdrs.map((t: any) => t.id);
    const aseTdrScores = aseTdrIds.map((tid: string) => {
      const a = agentMap[tid]        || 0;
      const m = merchantMap[tid]     || 0;
      const v = visitMap[tid]        || 0;
      const r = reactivationMap[tid] || 0;
      const aT = agentTarget; const mT = merchantTarget; const vT = visitTarget;
      const rT = 6 * workingDaysElapsed();
      return Math.round(
        Math.min(a/Math.max(aT,1),1)*100*0.40 +
        Math.min(m/Math.max(mT,1),1)*100*0.20 +
        Math.min(v/Math.max(vT,1),1)*100*0.10 +
        Math.min(r/Math.max(rT,1),1)*100*0.15
      );
    });
    const supervisionScore = aseTdrIds.length > 0 ? Math.round(aseTdrScores.reduce((a: number,b: number)=>a+b,0)/aseTdrIds.length) : 0;
    const devData = devMap[ase.name.toLowerCase()] || { total: 0, active: 0 };
    const kycScore = devData.total > 0 ? Math.round(devData.active / devData.total * 100) : 0;
    const finalScore = Math.round(kycScore * 0.3636 + supervisionScore * 0.3182 + supervisionScore * 0.3182);
    return {
      id: ase.id, name: ase.name, zone: ase.zone, tdrCount: aseTdrIds.length,
      supervisionScore,
      devices: { total: devData.total, active: devData.active, inactive: devData.total - devData.active, kycScore },
      finalScore
    };
  });
  const totalASEDevices  = aseStats.reduce((s,a) => s + a.devices.total, 0);
  const activeASEDevices = aseStats.reduce((s,a) => s + a.devices.active, 0);
  const avgASEScore = ases.length > 0 ? Math.round(aseStats.reduce((s,a) => s + a.finalScore, 0) / ases.length) : 0;
  const asePerformance = {
    totalASEs: ases.length,
    totalDevices: totalASEDevices,
    activeDevices: activeASEDevices,
    activeDeviceRate: totalASEDevices > 0 ? Math.round(activeASEDevices/totalASEDevices*100) : 0,
    avgASEScore,
    ases: aseStats
  };

  res.json({
    zbm:  { id: req.user!.userId, name: req.user!.name, zone },
    month: period,
    mtd: {
      workingDaysElapsed: workingDaysElapsed(),
      workingDaysTotal:   workingDaysThisMonth(),
    },
    zone: {
      totals: { agents: totalAgents, merchants: totalMerchants, visits: totalVisits, floatIssuesPending, reactivations: totalReactivations },
      targets: {
        agents:    prorateMtdTarget(target?.targetAgents    || 96 * tdrs.length),
        merchants: prorateMtdTarget(target?.targetMerchants || 96 * tdrs.length),
        visits:    visitMtdTarget() * tdrs.length,
      },
    },
    tdrStats,
    prospectsBreakdown: prospects,
    asePerformance,
  });
});

// ─── GET /zbm/tdr/:tdrId ──────────────────────────────────────────────────────
zbmRouter.get('/tdr/:tdrId', async (req: Request, res: Response): Promise<void> => {
  const zone  = resolveZone(req);
  const tdrId = req.params.tdrId;

  const tdr = await prisma.user.findFirst({ where: { id: tdrId, ...(zone ? { zone } : {}), role: 'TDR' } });
  if (!tdr) { res.status(404).json({ error: 'TDR not found' }); return; }

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
    where: { ...(resolveZone(req) ? { zone: resolveZone(req)! } : {}) },
    orderBy: { reportedAt: 'desc' },
  });
  res.json(issues);
});

// ─── PATCH /zbm/float-issues/:id ──────────────────────────────────────────────
zbmRouter.patch('/float-issues/:id', async (req: Request, res: Response): Promise<void> => {
  const issue = await prisma.floatIssue.findUnique({ where: { id: req.params.id } });
  if (!issue || (resolveZone(req) && issue.zone !== resolveZone(req))) { res.status(404).json({ error: 'Not found' }); return; }

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
    where: { ...(resolveZone(req) ? { zone: resolveZone(req)! } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  res.json(prospects);
});

// ─── GPS Map Data (ZBM — zone-scoped) ─────────────────────────────────────────
zbmRouter.get('/map', responseCache(45), async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const zoneFilter = resolveZone(req);

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
    const zone = resolveZone(req);
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

    // Sheet 5: Unvisited Outlets — batched (no N+1)
    const allAgentsForUnvisited = await prisma.agent.findMany({
      where: zoneWhere,
      orderBy: [{ zone: 'asc' }, { tdrName: 'asc' }, { agentName: 'asc' }],
    });
    const latestVisitsZone = await prisma.visit.groupBy({
      by: ['agentCode'],
      where: zoneWhere,
      _max: { createdAt: true },
    });
    const lastVisitMapZone = new Map<string, Date>();
    for (const v of latestVisitsZone) {
      if (v._max.createdAt) lastVisitMapZone.set(v.agentCode, v._max.createdAt);
    }
    const unvisitedRows: object[] = [];
    for (const a of allAgentsForUnvisited) {
      const lastVisitedAt = lastVisitMapZone.get(a.agentCode) ?? null;
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
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(unvisitedRows.length > 0 ? unvisitedRows : [{ 'Status': 'All outlets visited within 4 days ✅' }]),
      'Unvisited Outlets');

    // Sheet 6: TDR User IDs & Names (scoped to this zone)
    const zoneUsers = await prisma.user.findMany({
      where: zone ? { zone } : {},
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    const userRows = zoneUsers.map((u: any) => ({
      'User ID':   u.id,
      'Full Name': u.name,
      'Role':      u.role,
      'Zone':      u.zone || '',
      'Active':    u.active ? 'Yes' : 'No',
    }));
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(userRows.length > 0 ? userRows : [{}]),
      'System Users');

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
    const _zone = resolveZone(req); if (_zone && prospect.zone !== _zone) { res.status(403).json({ error: 'Not in your zone' }); return; }
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
  const zone    = resolveZone(req) ?? undefined;
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
    const isStale = daysAgo === null ? true : daysAgo >= 4;
    return { ...a, lastVisitedAt, daysAgo, isStale };
  }));

  const stale = enriched.filter(a => a.isStale);
  res.json({ stale, total: agents.length, staleCount: stale.length });
});

// ─── GET /zbm/leaderboard ─────────────────────────────────────────────────────
// TDR performance leaderboard scoped to this ZBM's zone
zbmRouter.get('/leaderboard', responseCache(60), async (req: Request, res: Response): Promise<void> => {
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

  const lbTdrIds = tdrs.map(t => t.id);
  const [lbAgents, lbMerchants, lbVisits, lbFloatAll, lbFloatRes] = await Promise.all([
    prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, type: 'normal',   createdAt: { gte: start, lte: end } } }),
    prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
    prisma.visit.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, createdAt: { gte: start, lte: end } } }),
    prisma.floatIssue.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, reportedAt: { gte: start, lte: end } } }),
    prisma.floatIssue.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, status: 'resolved', reportedAt: { gte: start, lte: end } } }),
  ]);
  const lbAm  = Object.fromEntries(lbAgents.map((r: any)    => [r.tdrId, r._count]));
  const lbMm  = Object.fromEntries(lbMerchants.map((r: any) => [r.tdrId, r._count]));
  const lbVm  = Object.fromEntries(lbVisits.map((r: any)    => [r.tdrId, r._count]));
  const lbFm  = Object.fromEntries(lbFloatAll.map((r: any)  => [r.tdrId, r._count]));
  const lbFrm = Object.fromEntries(lbFloatRes.map((r: any)  => [r.tdrId, r._count]));

  const rows = tdrs.map(tdr => {
    const agents       = lbAm[tdr.id]  || 0;
    const merchants    = lbMm[tdr.id]  || 0;
    const visits       = lbVm[tdr.id]  || 0;
    const floatTotal   = lbFm[tdr.id]  || 0;
    const floatResolved= lbFrm[tdr.id] || 0;
    const agentPct    = Math.min(Math.round(agents    / Math.max(at, 1) * 100), 100);
    const merchantPct = Math.min(Math.round(merchants / Math.max(mt, 1) * 100), 100);
    const visitPct    = Math.min(Math.round(visits    / Math.max(vt, 1) * 100), 100);
    const floatPct    = floatTotal > 0 ? Math.round(floatResolved / floatTotal * 100) : 100;
    const score = Math.round(agentPct * 0.4 + merchantPct * 0.2 + floatPct * 0.3 + visitPct * 0.1);
    const pct   = Math.round((agentPct + merchantPct + visitPct) / 3);
    return { id: tdr.id, name: tdr.name, zone: tdr.zone || 'Unassigned', agents, merchants, visits, floatTotal, floatResolved, agentPct, merchantPct, visitPct, floatPct, score, pct };
  });

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

// ─── GET /zbm/ases — list ASEs in this zone ───────────────────────────────────
zbmRouter.get('/ases', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = resolveZone(req);
    const ases = await prisma.user.findMany({
      where: { role: 'ASE', active: true, ...(zone ? { zone } : {}) },
      select: { id: true, name: true, zone: true },
      orderBy: { name: 'asc' },
    });
    // For each ASE, count their TDRs
    const result = await Promise.all(ases.map(async ase => ({
      ...ase,
      tdrCount: await prisma.user.count({ where: { aseId: ase.id, role: 'TDR' } }),
    })));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load ASEs' });
  }
});

// ─── POST /zbm/ases — create a new ASE ────────────────────────────────────────
zbmRouter.post('/ases', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = resolveZone(req);
    const { id, name, pin } = req.body as { id: string; name: string; pin: string };
    if (!id || !name || !pin) { res.status(400).json({ error: 'id, name and pin required' }); return; }
    const existing = await prisma.user.findUnique({ where: { id } });
    if (existing) { res.status(409).json({ error: 'User ID already exists' }); return; }
    const hashedPin = await bcrypt.hash(pin, 10);
    const user = await prisma.user.create({
      data: { id, name, pin: hashedPin, role: 'ASE', zone: zone || null, active: true },
    });
    res.status(201).json({ success: true, data: { id: user.id, name: user.name, role: user.role, zone: user.zone } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ASE' });
  }
});

// ─── GET /zbm/tdrs — list all TDRs in this zone with their ASE assignment ─────
zbmRouter.get('/tdrs', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = resolveZone(req);
    const tdrs = await prisma.user.findMany({
      where: { role: 'TDR', active: true, ...(zone ? { zone } : {}) },
      select: { id: true, name: true, zone: true, aseId: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: tdrs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load TDRs' });
  }
});

// ─── POST /zbm/assign-tdr — assign TDR to an ASE ─────────────────────────────
zbmRouter.post('/assign-tdr', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = resolveZone(req);
    const { tdrId, aseId } = req.body as { tdrId: string; aseId: string | null };
    // Verify TDR is in this zone
    const tdr = await prisma.user.findFirst({ where: { id: tdrId, role: 'TDR', ...(zone ? { zone } : {}) } });
    if (!tdr) { res.status(404).json({ error: 'TDR not found in your zone' }); return; }
    // Verify ASE is in this zone (if assigning)
    if (aseId) {
      const ase = await prisma.user.findFirst({ where: { id: aseId, role: 'ASE', ...(zone ? { zone } : {}) } });
      if (!ase) { res.status(404).json({ error: 'ASE not found in your zone' }); return; }
    }
    await prisma.user.update({ where: { id: tdrId }, data: { aseId: aseId || null } });
    res.json({ success: true, message: aseId ? 'TDR assigned to ASE' : 'TDR unassigned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign TDR' });
  }
});

// ─── POST /zbm/devices — ZBM adds a new KYC device ───────────────────────────
zbmRouter.post('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = resolveZone(req) || req.user!.zone || '';
    const {
      dealerCode, description, imei1, imei2, msisdn, simSerial, siteId,
      region, aseName, teamLead, status, activityStatus,
      kycReg, grossAdds, zamoGA, recharges, deviceSource,
    } = req.body as Record<string, any>;

    if (!imei1) { res.status(400).json({ error: 'IMEI 1 is required' }); return; }

    // Prevent duplicate IMEI
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM kyc_devices WHERE imei1 = ${imei1} LIMIT 1
    `;
    if (existing.length > 0) {
      res.status(409).json({ error: `Device with IMEI ${imei1} already exists` });
      return;
    }

    const result = await prisma.$queryRaw<any[]>`
      INSERT INTO kyc_devices
        (id, "dealerCode","description","imei1","imei2","msisdn","simSerial","siteId",
         "region","zone","rbmName","aseName","teamLead","status","activityStatus",
         "kycReg","grossAdds","zamoGA","recharges","deviceSource","createdAt","updatedAt")
      VALUES (
        gen_random_uuid(),
        ${dealerCode||null},${description||'Manual Entry'},${imei1},${imei2||null},
        ${msisdn||null},${simSerial||null},${siteId||null},
        ${region||zone},${zone},${req.user!.name},
        ${aseName||null},${teamLead||null},${status||'ACTIVE'},
        ${Number(activityStatus)||0},${Number(kycReg)||0},${Number(grossAdds)||0},
        ${Number(zamoGA)||0},${Number(recharges)||0},${deviceSource||'MobiGO2+'},
        NOW(),NOW()
      )
      RETURNING id, "dealerCode","imei1","aseName","zone","deviceSource"
    `;
    res.status(201).json({ success: true, data: result[0], message: 'Device added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add device' });
  }
});

// ─── GET /zbm/devices — list devices for this zone ───────────────────────────
zbmRouter.get('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = resolveZone(req);
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').replace(/'/g,"''");
    const source = req.query.source as string | undefined;
    const status = req.query.status as string | undefined;

    const conds: string[] = [];
    if (zone) conds.push(`LOWER(zone) = LOWER('${zone.replace(/'/g,"''")}') `);
    if (source) conds.push(`"deviceSource" = '${source.replace(/'/g,"''")}' `);
    if (status === 'active') conds.push(`"activityStatus" = 1`);
    if (status === 'inactive') conds.push(`"activityStatus" = 0`);
    if (search) conds.push(`("dealerCode" ILIKE '%${search}%' OR "aseName" ILIKE '%${search}%' OR imei1 ILIKE '%${search}%' OR "teamLead" ILIKE '%${search}%')`);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows, cnt] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT id,"dealerCode","description","imei1","imei2","msisdn","aseName","teamLead","zone","region","status","activityStatus","kycReg","grossAdds","zamoGA","recharges","deviceSource","createdAt" FROM kyc_devices ${where} ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}`),
      prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as cnt, SUM("activityStatus")::int as active FROM kyc_devices ${where}`),
    ]);
    res.json({ success: true, data: rows, total: cnt[0]?.cnt||0, active: cnt[0]?.active||0, inactive: (cnt[0]?.cnt||0)-(cnt[0]?.active||0), page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load devices' });
  }
});

// ─── DELETE /zbm/devices/:id — ZBM/HSD removes a manually-added device ───────
zbmRouter.delete('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = resolveZone(req);
    const check = await prisma.$queryRaw<any[]>`SELECT id,zone FROM kyc_devices WHERE id=${req.params.id} LIMIT 1`;
    if (!check.length) { res.status(404).json({ error: 'Device not found' }); return; }
    if (zone && check[0].zone?.toLowerCase() !== zone.toLowerCase()) {
      res.status(403).json({ error: 'Device not in your zone' }); return;
    }
    await prisma.$queryRaw`DELETE FROM kyc_devices WHERE id=${req.params.id}`;
    res.json({ success: true, message: 'Device removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete device' });
  }
});
