import { Router, Request, Response } from 'express';
import { prisma }       from '../prisma';
import { requireAuth }  from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, visitMtdTarget, prorateMtdTarget, workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';

export const aseRouter = Router();
aseRouter.use(requireAuth('ASE', 'ZBM', 'HSD'));
aseRouter.use(apiRateLimit);

// ─── Helper: calc TDR KPI score (same weights as ZBM dashboard) ─────────────
function calcTdrScore(agents: number, merchants: number, visits: number, reactivations: number): number {
  const agentTarget       = prorateMtdTarget(96);
  const merchantTarget    = prorateMtdTarget(96);
  const visitTarget       = visitMtdTarget();
  const reactivationTarget = 6 * workingDaysElapsed();
  const agentPct       = Math.min(agents       / Math.max(agentTarget, 1),       1) * 100;
  const merchantPct    = Math.min(merchants    / Math.max(merchantTarget, 1),    1) * 100;
  const visitPct       = Math.min(visits       / Math.max(visitTarget, 1),       1) * 100;
  const reactivPct     = Math.min(reactivations/ Math.max(reactivationTarget, 1),1) * 100;
  return Math.round(agentPct * 0.40 + merchantPct * 0.20 + visitPct * 0.10 + reactivPct * 0.15);
}

// ─── GET /ase/dashboard ───────────────────────────────────────────────────────
aseRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId   = req.user!.userId;
    const aseName = req.user!.name;

    // TDRs assigned to this ASE
    const tdrs = await prisma.user.findMany({
      where: { aseId: aseId, role: 'TDR', active: true },
    });
    const tdrIds = tdrs.map(t => t.id);
    const { start, end } = mtdRange();

    const [agentsGrp, merchantsGrp, visitsGrp, floatsGrp, reactivGrp, prospectsGrp] = await Promise.all([
      prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, type: 'normal',   createdAt: { gte: start, lte: end } } }),
      prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
      prisma.visit.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } } }),
      prisma.floatIssue.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, status: { not: 'resolved' } } }),
      prisma.reactivation.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } } }),
      prisma.prospect.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds } } }),
    ]);

    const aM = Object.fromEntries(agentsGrp.map((r: any) => [r.tdrId, r._count]));
    const mM = Object.fromEntries(merchantsGrp.map((r: any) => [r.tdrId, r._count]));
    const vM = Object.fromEntries(visitsGrp.map((r: any) => [r.tdrId, r._count]));
    const fM = Object.fromEntries(floatsGrp.map((r: any) => [r.tdrId, r._count]));
    const rM = Object.fromEntries(reactivGrp.map((r: any) => [r.tdrId, r._count]));
    const pM = Object.fromEntries(prospectsGrp.map((r: any) => [r.tdrId, r._count]));

    const tdrStats = tdrs.map(tdr => {
      const agents        = aM[tdr.id] || 0;
      const merchants     = mM[tdr.id] || 0;
      const visits        = vM[tdr.id] || 0;
      const floatIssues   = fM[tdr.id] || 0;
      const reactivations = rM[tdr.id] || 0;
      const prospects     = pM[tdr.id] || 0;
      const kpiScore      = calcTdrScore(agents, merchants, visits, reactivations);
      return { tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone }, agents, merchants, visits, floatIssues, reactivations, prospects, kpiScore };
    });

    // KYC Device metrics — match by ASE name (case-insensitive)
    const devicesRaw = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*)::int AS total,
        SUM("activityStatus")::int AS active,
        SUM(CASE WHEN "deviceSource"='MobiGO2+' THEN 1 ELSE 0 END)::int AS mobi_go,
        SUM(CASE WHEN "deviceSource"='A100C' THEN 1 ELSE 0 END)::int AS a100c,
        SUM("kycReg")::int AS total_kyc,
        SUM("grossAdds")::int AS total_ga
      FROM kyc_devices
      WHERE LOWER("aseName") = LOWER(${aseName})
    `;
    const dev = devicesRaw[0] || { total: 0, active: 0, mobi_go: 0, a100c: 0, total_kyc: 0, total_ga: 0 };
    const totalDev  = dev.total  || 0;
    const activeDev = dev.active || 0;
    const inactiveDev = totalDev - activeDev;
    const kycScore  = totalDev > 0 ? Math.round(activeDev / totalDev * 100) : 0;

    // KPI component scores
    const teamAgents      = tdrStats.reduce((s,t) => s + t.agents, 0);
    const teamMerchants   = tdrStats.reduce((s,t) => s + t.merchants, 0);
    const teamVisits      = tdrStats.reduce((s,t) => s + t.visits, 0);
    const teamReactivations = tdrStats.reduce((s,t) => s + t.reactivations, 0);
    const tdrCount        = tdrs.length;
    const agentTarget     = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const merchantTarget  = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const simOutletScore  = Math.min(Math.round(teamAgents / Math.max(agentTarget, 1) * 100), 100);
    const ownDeviceScore  = Math.min(Math.round(teamMerchants / Math.max(merchantTarget, 1) * 100), 100);
    const tdrScores       = tdrStats.map(t => t.kpiScore);
    const supervisionScore = tdrCount > 0 ? Math.round(tdrScores.reduce((a,b) => a+b, 0) / tdrCount) : 0;
    const finalScore      = Math.round(
      kycScore       * 0.3636 +
      simOutletScore * 0.2273 +
      ownDeviceScore * 0.0909 +
      supervisionScore * 0.3182
    );

    const agentMtdTarget        = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const merchantMtdTarget     = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const visitMtdTgt           = visitMtdTarget()     * Math.max(tdrCount, 1);
    const reactivationTarget    = 6 * workingDaysElapsed() * Math.max(tdrCount, 1);

    res.json({
      ase: { id: aseId, name: aseName, zone: req.user!.zone },
      kycDevices: {
        total: totalDev, active: activeDev, inactive: inactiveDev, kycScore,
        bySource: { mobiGo: dev.mobi_go || 0, a100c: dev.a100c || 0 },
        totalKyc: dev.total_kyc || 0, totalGa: dev.total_ga || 0
      },
      tdrStats,
      team: {
        totals:  { agents: teamAgents, merchants: teamMerchants, visits: teamVisits, reactivations: teamReactivations },
        targets: { agents: agentMtdTarget, merchants: merchantMtdTarget, visits: visitMtdTgt, reactivations: reactivationTarget },
      },
      aseKpiScore: { kycDeviceScore: kycScore, simOutletScore, ownDeviceScore, supervisionScore, finalScore },
      mtd: { workingDaysElapsed: workingDaysElapsed(), workingDaysTotal: workingDaysThisMonth() },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load ASE dashboard' });
  }
});

// ─── GET /ase/devices — KYC devices for this ASE ──────────────────────────────
aseRouter.get('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseName = req.user!.name;
    const source  = req.query.source as string | undefined;
    const status  = req.query.status as string | undefined;
    const page    = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit   = Math.min(200, parseInt(req.query.limit as string) || 50);
    const offset  = (page - 1) * limit;

    const safeAseName = aseName.replace(/'/g, "''");
    const conditions: string[] = [`LOWER("aseName") = LOWER('${safeAseName}')`];
    if (source === 'MobiGO2+') conditions.push(`"deviceSource" = 'MobiGO2+'`);
    if (source === 'A100C') conditions.push(`"deviceSource" = 'A100C'`);
    if (status === 'active') conditions.push(`"activityStatus" = 1`);
    if (status === 'inactive') conditions.push(`"activityStatus" = 0`);
    const where = conditions.join(' AND ');

    const [devicesRaw, countRaw] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT id, "dealerCode", description, imei1, imei2, msisdn, region, zone, "aseName", "teamLead", status, "activityStatus", "kycReg", "grossAdds", "zamoGA", recharges, "deviceSource" FROM kyc_devices WHERE ${where} ORDER BY "activityStatus" DESC, "dealerCode" LIMIT ${limit} OFFSET ${offset}`),
      prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as cnt, SUM("activityStatus")::int as active FROM kyc_devices WHERE ${where}`),
    ]);
    const total  = countRaw[0]?.cnt    || 0;
    const active = countRaw[0]?.active || 0;
    res.json({ success: true, data: devicesRaw, total, active, inactive: total - active, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load devices' });
  }
});

// ─── GET /ase/kyc-summary — ASE device summary for a zone (ZBM/HSD) ──────────
aseRouter.get('/kyc-summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = req.user!.role === 'ASE' ? req.user!.zone : (req.query.zone as string | undefined);
    const safeZone = zone ? zone.replace(/'/g, "''") : '';
    const whereClause = zone ? `WHERE LOWER(zone) = LOWER('${safeZone}')` : '';
    const rows = await prisma.$queryRawUnsafe(`
      SELECT "aseName", zone, COUNT(*)::int as total, SUM("activityStatus")::int as active,
             SUM("kycReg")::int as total_kyc, SUM("grossAdds")::int as total_ga
      FROM kyc_devices ${whereClause}
      GROUP BY "aseName", zone ORDER BY zone, "aseName"
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load KYC summary' });
  }
});

// ─── GET /ase/available-tdrs ──────────────────────────────────────────────────
aseRouter.get('/available-tdrs', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;
    const zone  = req.user!.zone;
    const tdrs  = await prisma.user.findMany({
      where: { role: 'TDR', active: true, ...(zone ? { zone } : {}), OR: [{ aseId: null }, { aseId: aseId }] },
      select: { id: true, name: true, zone: true, aseId: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: tdrs.map(t => ({ ...t, mine: t.aseId === aseId })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load available TDRs' });
  }
});

// ─── POST /ase/pick-tdr ───────────────────────────────────────────────────────
aseRouter.post('/pick-tdr', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;
    const { tdrId } = req.body as { tdrId: string };
    if (!tdrId) { res.status(400).json({ error: 'tdrId required' }); return; }
    const tdr = await prisma.user.findUnique({ where: { id: tdrId } });
    if (!tdr) { res.status(404).json({ error: 'TDR not found' }); return; }
    if (tdr.aseId && tdr.aseId !== aseId) { res.status(409).json({ error: 'TDR already assigned to another ASE' }); return; }
    await prisma.user.update({ where: { id: tdrId }, data: { aseId } });
    res.json({ success: true, message: 'TDR assigned to you' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pick TDR' });
  }
});

// ─── DELETE /ase/pick-tdr/:tdrId ─────────────────────────────────────────────
aseRouter.delete('/pick-tdr/:tdrId', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;
    const tdr = await prisma.user.findUnique({ where: { id: req.params.tdrId } });
    if (!tdr || tdr.aseId !== aseId) { res.status(403).json({ error: 'Not authorized' }); return; }
    await prisma.user.update({ where: { id: req.params.tdrId }, data: { aseId: null } });
    res.json({ success: true, message: 'TDR released' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to release TDR' });
  }
});

// ─── GET /ase/tdr/:id ─────────────────────────────────────────────────────────
aseRouter.get('/tdr/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tdr = await prisma.user.findFirst({ where: { id: req.params.id, aseId: req.user!.userId, role: 'TDR' } });
    if (!tdr) { res.status(403).json({ error: 'TDR not assigned to you' }); return; }
    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.visit.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.floatIssue.findMany({ where: { tdrId: tdr.id }, orderBy: { reportedAt: 'desc' }, take: 20 }),
      prisma.prospect.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    res.json({ tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone }, agents, visits, floatIssues, prospects });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load TDR data' });
  }
});
