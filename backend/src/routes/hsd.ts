import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { responseCache } from '../middleware/responseCache';
import { z } from 'zod';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, visitMtdTarget, prorateMtdTarget, prospectStretchTarget, visitMonthlyTarget,
         workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';
import { buildSiteFocusAnalytics } from '../utils/siteFocusAnalytics';

export const hsdRouter = Router();
hsdRouter.use(requireAuth('HSD'));
hsdRouter.use(apiRateLimit);

// Shared map router — accessible by both HSD and ZBM
export const mapRouter = Router();
mapRouter.use(requireAuth('HSD', 'ZBM'));
mapRouter.use(apiRateLimit);

const ZONES = [
  'Lusaka North', 'Lusaka South', 'Copperbelt', 'Northern', 'Eastern',
  'Southern', 'Western', 'Luapula', 'Muchinga', 'North-Western', 'Central',
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
hsdRouter.get('/dashboard', responseCache(30), async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [totalAgents, totalMerchants, totalVisits, openIssues, criticalIssues, prospectsBreakdown,
         totalReactivations, ntTotalRows] =
    await Promise.all([
      prisma.agent.count({ where: { type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.count({ where: { type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.count({ where: { status: { not: 'resolved' } } }),
      prisma.floatIssue.findMany({
        where: { status: { not: 'resolved' }, reportedAt: { lte: fortyEightHoursAgo } },
        orderBy: { reportedAt: 'asc' },
      }),
      prisma.$queryRaw`SELECT status, COUNT(*)::int AS "_count" FROM prospects GROUP BY status`.catch(() => []),
      // Total reactivations submitted this MTD (all TDRs nationally)
      prisma.reactivation.count({ where: { createdAt: { gte: start, lte: end } } }),
      // Total NT base codes (the full inactive pool)
      prisma.$queryRaw<{ cnt: number }[]>`SELECT COUNT(*)::int AS cnt FROM nt_codes`.catch(() => [{ cnt: 0 }]),
    ]);

  const ntTotal = ntTotalRows?.[0]?.cnt ?? 86411; // fallback to known import count

  const totalRecruits     = totalAgents + totalMerchants;
  const totalConversions  = await prisma.prospect.count({ where: { status: 'converted', convertedAt: { gte: start, lte: end } } });
  const totalProspects    = await prisma.prospect.count({ where: { createdAt: { gte: start, lte: end } } });
  const conversionRate    = totalRecruits > 0 ? Math.round(totalConversions / totalRecruits * 100) : 0;

  // National targets = sum of all zone-level targets (each zone target is per-TDR × TDR count)
  const [tdrCounts, zTargets] = await Promise.all([
    prisma.user.groupBy({ by: ['zone'], _count: true, where: { role: 'TDR', active: true, zone: { in: ZONES } } }),
    prisma.salesTarget.findMany({ where: { period, zone: { in: ZONES } } }),
  ]);
  const tdrCountMap = Object.fromEntries(tdrCounts.map((r: any) => [r.zone, r._count]));
  const targetByZone = Object.fromEntries(zTargets.map((t: any) => [t.zone, t]));
  let nationalAgentTarget = 0; let nationalMerchantTarget = 0; let nationalVisitTarget = 0;
  for (const zone of ZONES) {
    const tdrs = tdrCountMap[zone] || 0;
    const t    = targetByZone[zone];
    nationalAgentTarget    += isCurrentMonth ? prorateMtdTarget(t?.targetAgents    || 96 * tdrs) : (t?.targetAgents    || 96 * tdrs);
    nationalMerchantTarget += isCurrentMonth ? prorateMtdTarget(t?.targetMerchants || 96 * tdrs) : (t?.targetMerchants || 96 * tdrs);
    nationalVisitTarget    += isCurrentMonth ? visitMtdTarget() * tdrs : (t?.targetOutlets || visitMonthlyTarget() * tdrs);
  }
  const nationalTdrCount   = Object.values(tdrCountMap).reduce((s: number, n: any) => s + (n || 0), 0);
  const nationalProspectTarget     = prospectStretchTarget(nationalAgentTarget); // 30% above national agent MTD target
  const nationalReactivationTarget = 6 * workingDaysElapsed() * Math.max(nationalTdrCount, 1);

  res.json({
    period,
    kpis: {
      totalAgents, totalMerchants, totalVisits, totalProspects, totalReactivations, openFloatIssues: openIssues, conversionRate,
      agentPct:      nationalAgentTarget    > 0 ? Math.min(Math.round(totalAgents    / nationalAgentTarget    * 100), 100) : 0,
      merchantPct:   nationalMerchantTarget > 0 ? Math.min(Math.round(totalMerchants / nationalMerchantTarget * 100), 100) : 0,
      visitPct:      nationalVisitTarget    > 0 ? Math.min(Math.round(totalVisits    / nationalVisitTarget    * 100), 100) : 0,
      prospectPct:   nationalProspectTarget > 0 ? Math.min(Math.round(totalProspects / nationalProspectTarget * 100), 100) : 0,
      reactivationPct: nationalReactivationTarget > 0 ? Math.min(Math.round(totalReactivations / nationalReactivationTarget * 100), 100) : 0,
      nationalTargets: { agents: nationalAgentTarget, merchants: nationalMerchantTarget, visits: nationalVisitTarget, prospects: nationalProspectTarget, reactivations: nationalReactivationTarget },
    },
    ntBase: {
      totalInactive:   ntTotal,
      totalReactivated: totalReactivations,
      remaining:        ntTotal - totalReactivations,
      pct:              ntTotal > 0 ? Math.min(Math.round(totalReactivations / ntTotal * 100 * 10) / 10, 100) : 0,
    },
    criticalAlerts: criticalIssues,
    prospectsBreakdown,
  });
});

// ─── GET /hsd/zones ───────────────────────────────────────────────────────────
hsdRouter.get('/zones', responseCache(30), async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  // Batch queries for all zones at once
  const [zbmUsers, tdrCounts, zAgents, zMerchants, zVisits, zFloats, zTargets] = await Promise.all([
    prisma.user.findMany({ where: { role: 'ZBM', active: true } }),
    prisma.user.groupBy({ by: ['zone'], _count: true, where: { role: 'TDR', active: true } }),
    prisma.agent.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, type: 'normal',   createdAt: { gte: start, lte: end } } }),
    prisma.agent.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
    prisma.visit.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, createdAt: { gte: start, lte: end } } }),
    prisma.floatIssue.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, status: { not: 'resolved' } } }),
    prisma.salesTarget.findMany({ where: { period, zone: { in: ZONES } } }),
  ]);
  const [zProspects, zReactivations] = await Promise.all([
    prisma.prospect.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, createdAt: { gte: start, lte: end } } }).catch(() => [] as any[]),
    prisma.reactivation.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, createdAt: { gte: start, lte: end } } }).catch(() => [] as any[]),
  ]);
  const prospZMap = Object.fromEntries(zProspects.map((r: any) => [r.zone, r._count]));
  const reactZMap = Object.fromEntries(zReactivations.map((r: any) => [r.zone, r._count]));

  const zbmMap    = Object.fromEntries(zbmUsers.map((u: any) => [u.zone, u.name]));
  const tdrMap    = Object.fromEntries(tdrCounts.map((r: any) => [r.zone, r._count]));
  const agentZMap = Object.fromEntries(zAgents.map((r: any)    => [r.zone, r._count]));
  const mchZMap   = Object.fromEntries(zMerchants.map((r: any) => [r.zone, r._count]));
  const visitZMap = Object.fromEntries(zVisits.map((r: any)    => [r.zone, r._count]));
  const floatZMap = Object.fromEntries(zFloats.map((r: any)    => [r.zone, r._count]));
  const targetMap = Object.fromEntries(zTargets.map((t: any)   => [t.zone, t]));

  const zoneStats = ZONES.map(zone => {
    const tdrs       = tdrMap[zone]    || 0;
    const agents     = agentZMap[zone] || 0;
    const merchants  = mchZMap[zone]   || 0;
    const visits     = visitZMap[zone] || 0;
    const floatIssues= floatZMap[zone] || 0;
    const target     = targetMap[zone];
    const agentTarget    = isCurrentMonth ? prorateMtdTarget(target?.targetAgents    || 96 * tdrs) : (target?.targetAgents    || 96 * tdrs);
    const merchantTarget = isCurrentMonth ? prorateMtdTarget(target?.targetMerchants || 96 * tdrs) : (target?.targetMerchants || 96 * tdrs);
    const visitTarget    = isCurrentMonth ? visitMtdTarget() * tdrs : (target?.targetOutlets || visitMonthlyTarget() * tdrs);
    const prospects   = prospZMap[zone] || 0;
    const reactivations = reactZMap[zone] || 0;
    const prospectTarget     = prospectStretchTarget(agentTarget); // 30% above zone agent MTD target
    const reactivationTarget = 6 * workingDaysElapsed() * Math.max(tdrs, 1);
    const pct = tdrs > 0
      ? Math.round(((agents / Math.max(agentTarget,1)) + (merchants / Math.max(merchantTarget,1)) + (visits / Math.max(visitTarget,1))) / 3 * 100)
      : 0;
    return { zone, zbm: zbmMap[zone] || 'Unassigned', tdrs, agents, merchants, visits, floatIssues, prospects, reactivations, pct,
             targets: { agents: agentTarget, merchants: merchantTarget, visits: visitTarget, prospects: prospectTarget, reactivations: reactivationTarget } };
  });

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
hsdRouter.get('/zones/:zone', responseCache(30), async (req: Request, res: Response): Promise<void> => {
  const zone   = req.params.zone;
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  const tdrs = await prisma.user.findMany({ where: { role: 'TDR', zone, active: true } });

  const zoneTdrIds = tdrs.map((t: any) => t.id);
  const zat = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const zmt = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const zvt = isCurrentMonth ? visitMtdTarget()     : visitMonthlyTarget();

  const [ztAgents, ztMerchants, ztVisits, ztFloats] = await Promise.all([
    prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, type: 'normal',   createdAt: { gte: start, lte: end } } }),
    prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
    prisma.visit.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, createdAt: { gte: start, lte: end } } }),
    prisma.floatIssue.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, status: { not: 'resolved' } } }),
  ]);
  const ztAm = Object.fromEntries(ztAgents.map((r: any)    => [r.tdrId, r._count]));
  const ztMm = Object.fromEntries(ztMerchants.map((r: any) => [r.tdrId, r._count]));
  const ztVm = Object.fromEntries(ztVisits.map((r: any)    => [r.tdrId, r._count]));
  const ztFm = Object.fromEntries(ztFloats.map((r: any)    => [r.tdrId, r._count]));

  const tdrStats = tdrs.map((tdr: any) => {
    const agents      = ztAm[tdr.id] || 0;
    const merchants   = ztMm[tdr.id] || 0;
    const visits      = ztVm[tdr.id] || 0;
    const floatIssues = ztFm[tdr.id] || 0;
    const pct = Math.round(((agents / zat) + (merchants / zmt) + (visits / zvt)) / 3 * 100);
    return { tdr, agents, merchants, visits, floatIssues, pct };
  });

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

    // Sheet 5: Unvisited Outlets — single batched query (no N+1)
    const allAgents = await prisma.agent.findMany({
      orderBy: [{ zone: 'asc' }, { tdrName: 'asc' }, { agentName: 'asc' }],
    });
    // Get latest visit per agent in one query
    const latestVisits = await prisma.visit.groupBy({
      by: ['agentCode'],
      _max: { createdAt: true },
    });
    const lastVisitMap = new Map<string, Date>();
    for (const v of latestVisits) {
      if (v._max.createdAt) lastVisitMap.set(v.agentCode, v._max.createdAt);
    }
    const unvisitedRows: object[] = [];
    for (const a of allAgents) {
      const lastVisitedAt = lastVisitMap.get(a.agentCode) ?? null;
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

    // Sheet 6: All System Users (all roles)
    const allUsers = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    const userRows = allUsers.map((u: any) => ({
      'User ID':   u.id,
      'Full Name': u.name,
      'Role':      u.role,
      'Zone':      u.zone || '',
      'Active':    u.active ? 'Yes' : 'No',
      'Must Change PIN': (u as any).mustChangePin ? 'Yes' : 'No',
      'Created':   u.createdAt?.toISOString().split('T')[0] || '',
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(userRows.length > 0 ? userRows : [{}]),
      'System Users'
    );

    // Sheet 7: ASE Weekly Site Focus (national — visited sites + deliverables)
    const allAses = await prisma.user.findMany({ where: { role: 'ASE' }, select: { id: true, name: true, zone: true } });
    const aseInfoMap = Object.fromEntries(allAses.map(a => [a.id, a]));
    const sfRows = (await prisma.siteFocus.findMany({
      where: { weekStart: { gte: start, lte: end } },
      orderBy: [{ weekStart: 'desc' }, { siteName: 'asc' }],
    })).map((s: any) => {
      const parts = [
        Math.min(s.agentsRec / 3 * 100, 100), Math.min(s.ssosRec / 2 * 100, 100),
        Math.min(s.odrsRec / 1 * 100, 100), Math.min(s.dataActs / 15 * 100, 100),
        Math.min(s.dtuSold / 500 * 100, 100),
      ];
      return {
        'ASE': aseInfoMap[s.aseId]?.name || s.aseId,
        'Zone': aseInfoMap[s.aseId]?.zone || '',
        'Week Starting': s.weekStart.toISOString().split('T')[0],
        'Site Name': s.siteName, 'Site ID': s.siteId,
        'Agents (tgt 3)': s.agentsRec, 'SSOs (tgt 2)': s.ssosRec, 'ODRs (tgt 1)': s.odrsRec,
        'Data Acts (tgt 15)': s.dataActs, 'DTU Sold (ZMW)': s.dtuSold, 'DTU Agent Code': s.dtuAgentCode || '',
        'Site Type': s.siteType || 'urban', 'ZM Gross Adds': s.zmGrossAdds || 0, 'ZM GA Target': (s.siteType === 'rural') ? 30 : 50,
        'Agent Codes': s.agentCodes || '', 'SSO Codes': s.ssoCodes || '', 'ODR Codes': s.odrCodes || '',
        'Site Score %': Math.round(parts.reduce((a, b) => a + b, 0) / parts.length),
        'Latitude': s.latitude ?? '', 'Longitude': s.longitude ?? '',
        'GPS Link': (s.latitude != null && s.longitude != null) ? `https://www.google.com/maps?q=${s.latitude},${s.longitude}` : '',
        'Notes': s.notes || '', 'Logged': s.createdAt.toISOString().split('T')[0],
      };
    });
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(sfRows.length > 0 ? sfRows : [{ 'Status': 'No site focus logged this period' }]),
      'ASE Site Focus');

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
mapRouter.get('/', responseCache(45), async (req: Request, res: Response): Promise<void> => {
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

    // Enrich each agent with last visit info (batched by agentCode)
    const agentCodes = agents.map((a: any) => a.agentCode);
    const recentVisits = agentCodes.length > 0 ? await prisma.visit.findMany({
      where: { agentCode: { in: agentCodes } },
      select: { agentCode: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }) : [];

    // Build a map: agentCode -> most recent visit date
    const lastVisitMap: Record<string, Date> = {};
    for (const v of recentVisits) {
      if (!lastVisitMap[v.agentCode]) {
        lastVisitMap[v.agentCode] = v.createdAt;
      }
    }

    const enrichedAgents = agents.map((a: any) => {
      const lastVisitedAt = lastVisitMap[a.agentCode] ?? null;
      const daysAgo = lastVisitedAt
        ? Math.floor((Date.now() - new Date(lastVisitedAt).getTime()) / 86400000)
        : null;
      return { ...a, lastVisitedAt, daysAgo };
    });

    res.json({
      success: true,
      data: { agents: enrichedAgents, visits },
      summary: {
        totalAgents: enrichedAgents.length,
        totalVisits: visits.length,
        zones: [...new Set([...enrichedAgents.map((a: any) => a.zone), ...visits.map((v: any) => v.zone)])].filter(Boolean),
      }
    });
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
hsdRouter.get('/leaderboard', responseCache(60), async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { start, end, isCurrentMonth } = monthRange(period);

  const at = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const mt = isCurrentMonth ? prorateMtdTarget(96) : 96;
  const vt = isCurrentMonth ? visitMtdTarget()     : visitMonthlyTarget();

  const tdrs = await prisma.user.findMany({ where: { role: 'TDR', active: true } });
  const allTdrIds = tdrs.map((t: any) => t.id);

  // Batch: 3 groupBy queries instead of 3×309 individual counts
  const [lbAgents, lbMerchants, lbVisits] = await Promise.all([
    prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, type: 'normal',   createdAt: { gte: start, lte: end } } }),
    prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
    prisma.visit.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, createdAt: { gte: start, lte: end } } }),
  ]);
  const lbAm = Object.fromEntries(lbAgents.map((r: any)    => [r.tdrId, r._count]));
  const lbMm = Object.fromEntries(lbMerchants.map((r: any) => [r.tdrId, r._count]));
  const lbVm = Object.fromEntries(lbVisits.map((r: any)    => [r.tdrId, r._count]));

  const tdrRows = tdrs.map((tdr: any) => {
    const agents    = lbAm[tdr.id] || 0;
    const merchants = lbMm[tdr.id] || 0;
    const visits    = lbVm[tdr.id] || 0;
    const pct = Math.round(((agents / at) + (merchants / mt) + (visits / vt)) / 3 * 100);
    return { id: tdr.id, name: tdr.name, zone: tdr.zone || 'Unassigned', agents, merchants, visits, pct };
  });

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

// ─── GET /hsd/ase-performance — National ASE KPI summary ─────────────────────
hsdRouter.get('/ase-performance', responseCache(60), async (req: Request, res: Response): Promise<void> => {
  try {
    const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end } = monthRange(period);

    // All ASEs and their TDRs
    const [ases, tdrs, devicesByAse] = await Promise.all([
      prisma.user.findMany({ where: { role: 'ASE', active: true }, select: { id: true, name: true, zone: true } }),
      prisma.user.findMany({ where: { role: 'TDR', active: true }, select: { id: true, name: true, aseId: true, zone: true } }),
      prisma.$queryRaw<any[]>`
        SELECT "aseName", zone,
          COUNT(*)::int                         AS total,
          SUM("activityStatus")::int            AS active,
          SUM("kycReg")::int                    AS kyc_reg,
          SUM("grossAdds")::int                 AS gross_adds,
          ROUND(SUM("activityStatus")::numeric/NULLIF(COUNT(*),0)*100,1) AS activity_pct
        FROM kyc_devices
        GROUP BY "aseName", zone
      `,
    ]);

    const devMap: Record<string, any> = {};
    for (const d of devicesByAse) {
      devMap[(d.aseName?.toLowerCase() || '')] = d;
    }

    // TDR scoring per ASE (agents, merchants, visits)
    const aseTdrMap: Record<string, string[]> = {};
    for (const t of tdrs) {
      if (t.aseId) { (aseTdrMap[t.aseId] = aseTdrMap[t.aseId] || []).push(t.id); }
    }

    const agentsByTdr = await prisma.agent.groupBy({
      by: ['tdrId'], _count: true,
      where: { createdAt: { gte: start, lte: end }, type: 'normal' }
    });
    const merchantsByTdr = await prisma.agent.groupBy({
      by: ['tdrId'], _count: true,
      where: { createdAt: { gte: start, lte: end }, type: 'merchant' }
    });
    const visitsByTdr = await prisma.visit.groupBy({
      by: ['tdrId'], _count: true,
      where: { createdAt: { gte: start, lte: end } }
    });
    const prospectsByTdrAse = await prisma.prospect.groupBy({
      by: ['tdrId'], _count: true,
      where: { createdAt: { gte: start, lte: end } }
    }).catch(() => [] as any[]);
    const agMap  = Object.fromEntries(agentsByTdr.map((r: any)    => [r.tdrId, r._count]));
    const mchMap = Object.fromEntries(merchantsByTdr.map((r: any) => [r.tdrId, r._count]));
    const visMap = Object.fromEntries(visitsByTdr.map((r: any)    => [r.tdrId, r._count]));
    const prMap  = Object.fromEntries(prospectsByTdrAse.map((r: any) => [r.tdrId, r._count]));

    // Weekly Site Focus — current week (Mon–Sun), grouped by ASE
    const sfWeekStart = (() => {
      const d = new Date(); const day = d.getDay();
      const diff = (day === 0 ? -6 : 1 - day);
      const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0);
      return mon;
    })();
    const sfWeekEnd = new Date(sfWeekStart); sfWeekEnd.setDate(sfWeekStart.getDate() + 6); sfWeekEnd.setHours(23,59,59,999);
    const allSiteFocus = await prisma.siteFocus.findMany({
      where: { weekStart: { gte: sfWeekStart, lte: sfWeekEnd } },
    });
    const siteFocusByAse: Record<string, any[]> = {};
    for (const s of allSiteFocus) {
      (siteFocusByAse[s.aseId] = siteFocusByAse[s.aseId] || []).push(s);
    }

    const aseList = ases.map((ase: any) => {
      const aseTdrIds = aseTdrMap[ase.id] || [];
      const tdrCount  = aseTdrIds.length;
      // Supervision = avg TDR score
      let tdrScoreSum = 0;
      for (const tid of aseTdrIds) {
        const ag = agMap[tid]  || 0;
        const vi = visMap[tid] || 0;
        const pr = prMap[tid]  || 0;
        const pT = prospectStretchTarget(96); // 30% above agent MTD (full-month) target
        // Agents 50%, Prospects 10%, Visits 10% (float/reactivation handled at TDR level)
        tdrScoreSum += Math.round((ag/96)*50 + Math.min(pr/Math.max(pT,1),1)*100*0.10 + (vi/20)*10);
      }
      const supervisionScore = tdrCount > 0 ? Math.round(tdrScoreSum / tdrCount) : 0;
      const devData = devMap[ase.name.toLowerCase()] || { total: 0, active: 0, kyc_reg: 0, gross_adds: 0, activity_pct: 0 };
      const kycDeviceScore = devData.total > 0 ? Math.round(devData.active / devData.total * 100) : 0;
      // Weekly Site Focus score (10%): avg of per-site KPI completion for current week
      const sf = siteFocusByAse[ase.id] || [];
      let sfScore = 0;
      if (sf.length > 0) {
        const perSite = sf.map((s: any) => {
          const parts = [
            Math.min(s.agentsRec / 3 * 100, 100),
            Math.min(s.ssosRec   / 2 * 100, 100),
            Math.min(s.odrsRec   / 1 * 100, 100),
            Math.min(s.dataActs  / 15 * 100, 100),
            Math.min(s.dtuSold   / 500 * 100, 100),
          ];
          return parts.reduce((a, b) => a + b, 0) / parts.length;
        });
        const siteCoverage = Math.min(sf.length / 5, 1); // 5 sites/week target
        sfScore = Math.round((perSite.reduce((a, b) => a + b, 0) / perSite.length) * siteCoverage);
      }
      // ASE KPI weights: KYC 32.73%, Supervision 28.64%, Agent Recruitment 20.45%, Site Focus 10%, Own Device 8.18%
      const finalScore = Math.round(kycDeviceScore * 0.3273 + supervisionScore * 0.2864 + supervisionScore * 0.2045 + sfScore * 0.10 + kycDeviceScore * 0.0818);
      return {
        id: ase.id, name: ase.name, zone: ase.zone, tdrCount,
        devices: {
          total: devData.total, active: devData.active,
          inactive: devData.total - devData.active,
          kycReg: devData.kyc_reg || 0, grossAdds: devData.gross_adds || 0,
          activityPct: parseFloat(devData.activity_pct) || 0,
        },
        supervisionScore,
        kycDeviceScore,
        siteFocusScore: sfScore,
        siteFocusSites: sf.length,
        finalScore,
      };
    });

    // Device summary totals
    const totalDevices  = devicesByAse.reduce((s: number, d: any) => s + (d.total || 0), 0);
    const activeDevices = devicesByAse.reduce((s: number, d: any) => s + (d.active || 0), 0);
    const totalKycReg   = devicesByAse.reduce((s: number, d: any) => s + (d.kyc_reg || 0), 0);
    const totalGA       = devicesByAse.reduce((s: number, d: any) => s + (d.gross_adds || 0), 0);
    const avgScore      = aseList.length > 0 ? Math.round(aseList.reduce((s: number, a: any) => s + a.finalScore, 0) / aseList.length) : 0;

    // Zone-level device aggregation
    const zoneMap: Record<string, {zone:string;total:number;active:number;kyc:number;ga:number}> = {};
    for (const d of devicesByAse) {
      const z = d.zone || 'Unassigned';
      if (!zoneMap[z]) zoneMap[z] = { zone: z, total: 0, active: 0, kyc: 0, ga: 0 };
      zoneMap[z].total  += d.total  || 0;
      zoneMap[z].active += d.active || 0;
      zoneMap[z].kyc    += d.kyc_reg || 0;
      zoneMap[z].ga     += d.gross_adds || 0;
    }
    const byZone = Object.values(zoneMap)
      .map((z: any) => ({ ...z, pct: z.total > 0 ? Math.round(z.active/z.total*100) : 0 }))
      .sort((a: any, b: any) => b.total - a.total);

    res.json({
      summary: { totalASEs: aseList.length, totalDevices, activeDevices, inactiveDevices: totalDevices - activeDevices,
                 activityPct: totalDevices > 0 ? Math.round(activeDevices/totalDevices*100*10)/10 : 0,
                 totalKycReg, totalGA, avgScore },
      ases: aseList.sort((a: any, b: any) => b.finalScore - a.finalScore),
      byZone,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load ASE performance' });
  }
});

// ─── GET /hsd/site-focus — national ASE visited sites + deliverables ──────────
hsdRouter.get('/site-focus', responseCache(60), async (req: Request, res: Response): Promise<void> => {
  try {
    const period = (req.query.period as string) ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end } = monthRange(period);
    const ases = await prisma.user.findMany({ where: { role: 'ASE' }, select: { id: true, name: true, zone: true } });
    const aseMap = Object.fromEntries(ases.map(a => [a.id, a]));
    const sites = await prisma.siteFocus.findMany({
      where: { weekStart: { gte: start, lte: end } },
      orderBy: [{ weekStart: 'desc' }, { siteName: 'asc' }],
    });
    const data = sites.map((s: any) => {
      const zmTgt = (s.siteType === 'rural') ? 30 : 50;
      const parts = [
        Math.min(s.agentsRec / 3 * 100, 100), Math.min(s.ssosRec / 2 * 100, 100),
        Math.min(s.odrsRec / 1 * 100, 100), Math.min(s.dataActs / 15 * 100, 100),
        Math.min(s.dtuSold / 500 * 100, 100), Math.min((s.zmGrossAdds || 0) / zmTgt * 100, 100),
      ];
      return {
        ...s,
        aseName: aseMap[s.aseId]?.name || s.aseId,
        aseZone: aseMap[s.aseId]?.zone || '',
        zmTarget: zmTgt,
        siteScore: Math.round(parts.reduce((a, b) => a + b, 0) / parts.length),
        overdue: s.status === 'planned' && ((s.carryCount || 0) > 0 || (s.plannedDate ? new Date(s.plannedDate) < new Date() : false)),
        carriedOver: (s.carryCount || 0) > 0,
      };
    });
    res.json({ success: true, period, data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load national site focus' });
  }
});

// ─── GET /hsd/site-focus-analytics — national Site Focus analytics ────────────
hsdRouter.get('/site-focus-analytics', responseCache(60), async (req: Request, res: Response): Promise<void> => {
  try {
    const period = (req.query.period as string) ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end } = monthRange(period);
    const ases = await prisma.user.findMany({ where: { role: 'ASE' }, select: { id: true, name: true, zone: true } });
    const sites = await prisma.siteFocus.findMany({ where: { weekStart: { gte: start, lte: end } } });
    res.json({ success: true, period, scope: 'National', ...buildSiteFocusAnalytics(sites, ases) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load site focus analytics' });
  }
});

// ─── POST /hsd/devices — HSD adds a new KYC device (any zone) ────────────────
hsdRouter.post('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      dealerCode, description, imei1, imei2, msisdn, simSerial, siteId,
      region, zone, aseName, teamLead, status, activityStatus,
      kycReg, grossAdds, zamoGA, recharges, deviceSource,
    } = req.body as Record<string, any>;

    if (!imei1) { res.status(400).json({ error: 'IMEI 1 is required' }); return; }
    if (!zone)  { res.status(400).json({ error: 'Zone is required' }); return; }

    const existing = await prisma.$queryRaw<any[]>`SELECT id FROM kyc_devices WHERE imei1=${imei1} LIMIT 1`;
    if (existing.length > 0) {
      res.status(409).json({ error: `Device with IMEI ${imei1} already exists` });
      return;
    }

    const result = await prisma.$queryRaw<any[]>`
      INSERT INTO kyc_devices
        (id,"dealerCode","description","imei1","imei2","msisdn","simSerial","siteId",
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
      RETURNING id,"dealerCode","imei1","aseName","zone","deviceSource"
    `;
    res.status(201).json({ success: true, data: result[0], message: 'Device added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add device' });
  }
});

// ─── GET /hsd/devices — HSD lists all devices (any zone, searchable) ─────────
hsdRouter.get('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(200, parseInt(req.query.limit as string) || 50);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').replace(/'/g,"''");
    const zone   = (req.query.zone as string || '').replace(/'/g,"''");
    const source = req.query.source as string | undefined;
    const status = req.query.status as string | undefined;

    const conds: string[] = [];
    if (zone) conds.push(`LOWER("zone") = LOWER('${zone}')`);
    if (source) conds.push(`"deviceSource" = '${source.replace(/'/g,"''")}' `);
    if (status === 'active') conds.push(`"activityStatus" = 1`);
    if (status === 'inactive') conds.push(`"activityStatus" = 0`);
    if (search) conds.push(`("dealerCode" ILIKE '%${search}%' OR "aseName" ILIKE '%${search}%' OR imei1 ILIKE '%${search}%' OR "teamLead" ILIKE '%${search}%' OR "zone" ILIKE '%${search}%')`);
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

// ─── DELETE /hsd/devices/:id — HSD removes any device ────────────────────────
hsdRouter.delete('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const check = await prisma.$queryRaw<any[]>`SELECT id FROM kyc_devices WHERE id=${req.params.id} LIMIT 1`;
    if (!check.length) { res.status(404).json({ error: 'Device not found' }); return; }
    await prisma.$queryRaw`DELETE FROM kyc_devices WHERE id=${req.params.id}`;
    res.json({ success: true, message: 'Device removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// ─── GET /hsd/users — list all system users (HSD admin) ───────────────────────
hsdRouter.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.query.role as string | undefined;
    const users = await prisma.user.findMany({
      where: role ? { role: role as any } : {},
      select: { id: true, name: true, role: true, zone: true, active: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// ─── POST /hsd/users — create a user with ANY access level (incl. HSD) ────────
hsdRouter.post('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, name, pin, role, zone } = req.body as { id: string; name: string; pin: string; role: string; zone?: string };
    if (!id || !name || !pin || !role) {
      res.status(400).json({ error: 'id, name, pin and role are required' });
      return;
    }
    const VALID_ROLES = ['TDR', 'ZBM', 'HSD', 'ASE', 'DM'];
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of ${VALID_ROLES.join(', ')}` });
      return;
    }
    if (!/^\d{4}$/.test(String(pin))) {
      res.status(400).json({ error: 'PIN must be 4 digits' });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { id } });
    if (existing) { res.status(409).json({ error: 'User ID already exists' }); return; }
    const hashedPin = await bcrypt.hash(String(pin), 10);
    // HSD users are national (zone null); others may carry a zone
    const finalZone = role === 'HSD' ? null : (zone || null);
    const user = await prisma.user.create({
      data: { id, name, pin: hashedPin, role: role as any, zone: finalZone, active: true },
    });
    res.status(201).json({ success: true, data: { id: user.id, name: user.name, role: user.role, zone: user.zone, active: user.active } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── PATCH /hsd/users/:id — edit / deactivate any user (HSD admin) ────────────
hsdRouter.patch('/users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const { name, zone, active, pin } = req.body as { name?: string; zone?: string; active?: boolean; pin?: string };
    const data: any = {};
    if (name !== undefined && name.trim()) data.name = name.trim();
    if (zone !== undefined) data.zone = user.role === 'HSD' ? null : (zone || null);
    if (active !== undefined) data.active = !!active;
    if (pin !== undefined) {
      if (!/^\d{4}$/.test(String(pin))) { res.status(400).json({ error: 'PIN must be 4 digits' }); return; }
      data.pin = await bcrypt.hash(String(pin), 10);
    }
    if (Object.keys(data).length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    res.json({ success: true, data: { id: updated.id, name: updated.name, role: updated.role, zone: updated.zone, active: updated.active } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});
