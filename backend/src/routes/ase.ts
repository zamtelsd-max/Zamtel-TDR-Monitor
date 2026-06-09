import { Router, Request, Response } from 'express';
import { prisma }       from '../prisma';
import { requireAuth }  from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { responseCache } from '../middleware/responseCache';
import { mtdRange, visitMtdTarget, prorateMtdTarget, prospectStretchTarget, workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';

export const aseRouter = Router();
aseRouter.use(requireAuth('ASE', 'ZBM', 'HSD'));
aseRouter.use(apiRateLimit);

// ─── Helper: calc TDR KPI score ──────────────────────────────────────────────
// Merchant KPI removed — merchants still classified but weight moved to agents.
// Weights: Agents 50%, Prospects 10%, Float 15%, Reactivation 15%, Visits 10%.
function calcTdrScore(agents: number, _merchants: number, visits: number, reactivations: number, prospects = 0): number {
  const agentTarget        = prorateMtdTarget(96);
  const visitTarget        = visitMtdTarget();
  const reactivationTarget = 6 * workingDaysElapsed();
  const prospectTarget     = prospectStretchTarget(agentTarget); // 30% above agent MTD target
  const agentPct    = Math.min(agents        / Math.max(agentTarget,        1), 1) * 100;
  const visitPct    = Math.min(visits        / Math.max(visitTarget,        1), 1) * 100;
  const reactivPct  = Math.min(reactivations / Math.max(reactivationTarget, 1), 1) * 100;
  const prospectPct = Math.min(prospects     / Math.max(prospectTarget,     1), 1) * 100;
  return Math.round(agentPct * 0.50 + prospectPct * 0.10 + visitPct * 0.10 + reactivPct * 0.15);
}

// ─── Helper: calc weekly site focus score (0–100) ────────────────────────────
// Per site targets: 3 agents, 2 SSOs, 1 ODR, 15 data activations, K500 DTU.
// Score = average achievement across all 5 sub-KPIs per site, then averaged.
function calcSiteFocusScore(sites: Array<{
  agentsRec: number; ssosRec: number; odrsRec: number; dataActs: number; dtuSold: number;
  zmGrossAdds?: number; siteType?: string | null;
}>): number {
  if (sites.length === 0) return 0;
  const AGENT_TGT = 3; const SSO_TGT = 2; const ODR_TGT = 1;
  const DATA_TGT  = 15; const DTU_TGT = 500;
  const siteScores = sites.map(s => {
    const zmTgt = (s.siteType === 'rural') ? 30 : 50; // Zamtel Money GA target: 30 rural / 50 urban
    const a = Math.min(s.agentsRec / AGENT_TGT, 1) * 100;
    const sso = Math.min(s.ssosRec  / SSO_TGT,   1) * 100;
    const odr = Math.min(s.odrsRec  / ODR_TGT,   1) * 100;
    const d   = Math.min(s.dataActs / DATA_TGT,   1) * 100;
    const dtu = Math.min(s.dtuSold  / DTU_TGT,    1) * 100;
    const zm  = Math.min((s.zmGrossAdds || 0) / zmTgt, 1) * 100;
    return (a + sso + odr + d + dtu + zm) / 6;
  });
  // Achievement across 5 required sites per week
  const SITES_REQUIRED = 5;
  const siteCountPct = Math.min(sites.length / SITES_REQUIRED, 1) * 100;
  const avgSiteScore  = siteScores.reduce((a, b) => a + b, 0) / siteScores.length;
  return Math.round((siteCountPct + avgSiteScore) / 2);
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
      const kpiScore      = calcTdrScore(agents, merchants, visits, reactivations, prospects);
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
    // ASE weights (total = 100%):
    //   KYC Device Mgmt:    32.73%
    //   TDR Supervision:    28.64%
    //   SIM Outlet (agents):20.45%
    //   Own Device (merch.): 8.18%
    //   Weekly Site Focus:  10.00%
    const teamAgents        = tdrStats.reduce((s,t) => s + t.agents, 0);
    const teamMerchants     = tdrStats.reduce((s,t) => s + t.merchants, 0);
    const teamVisits        = tdrStats.reduce((s,t) => s + t.visits, 0);
    const teamReactivations = tdrStats.reduce((s,t) => s + t.reactivations, 0);
    const teamProspects     = tdrStats.reduce((s,t) => s + (t.prospects || 0), 0);
    const tdrCount          = tdrs.length;
    const agentTarget       = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const merchantTarget    = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const simOutletScore    = Math.min(Math.round(teamAgents    / Math.max(agentTarget,    1) * 100), 100);
    const ownDeviceScore    = Math.min(Math.round(teamMerchants / Math.max(merchantTarget, 1) * 100), 100);
    const tdrScores         = tdrStats.map(t => t.kpiScore);
    const supervisionScore  = tdrCount > 0 ? Math.round(tdrScores.reduce((a,b) => a+b, 0) / tdrCount) : 0;

    // Weekly site focus — fetch current ISO week's sites for this ASE
    const weekStart = (() => {
      const d = new Date(); const day = d.getDay();
      const diff = (day === 0 ? -6 : 1 - day);
      const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0);
      return mon;
    })();
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999);
    const weekSites = await prisma.siteFocus.findMany({
      where: { aseId, weekStart: { gte: weekStart, lte: weekEnd } },
      select: { agentsRec: true, ssosRec: true, odrsRec: true, dataActs: true, dtuSold: true, zmGrossAdds: true, siteType: true },
    });
    const siteFocusScore = calcSiteFocusScore(weekSites);

    const finalScore = Math.round(
      kycScore        * 0.3273 +
      simOutletScore  * 0.2045 +
      ownDeviceScore  * 0.0818 +
      supervisionScore * 0.2864 +
      siteFocusScore  * 0.10
    );

    const agentMtdTarget     = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const merchantMtdTarget  = prorateMtdTarget(96) * Math.max(tdrCount, 1);
    const visitMtdTgt        = visitMtdTarget()     * Math.max(tdrCount, 1);
    const reactivationTarget = 6 * workingDaysElapsed() * Math.max(tdrCount, 1);

    res.json({
      ase: { id: aseId, name: aseName, zone: req.user!.zone },
      kycDevices: {
        total: totalDev, active: activeDev, inactive: inactiveDev, kycScore,
        bySource: { mobiGo: dev.mobi_go || 0, a100c: dev.a100c || 0 },
        totalKyc: dev.total_kyc || 0, totalGa: dev.total_ga || 0,
      },
      tdrStats,
      team: {
        totals:  { agents: teamAgents, merchants: teamMerchants, visits: teamVisits, reactivations: teamReactivations, prospects: teamProspects },
        targets: { agents: agentMtdTarget, merchants: merchantMtdTarget, visits: visitMtdTgt, reactivations: reactivationTarget },
      },
      aseKpiScore: {
        kycDeviceScore: kycScore, simOutletScore, ownDeviceScore, supervisionScore,
        siteFocusScore, finalScore,
        siteFocusSites: weekSites.length,
      },
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

// ─── POST /ase/devices — ASE adds a KYC device to their OWN profile ──────────
aseRouter.post('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseName = req.user!.name;          // device is tagged to this ASE
    const zone    = req.user!.zone || '';
    const {
      dealerCode, description, imei1, imei2, msisdn, simSerial, siteId,
      region, teamLead, status, activityStatus,
      kycReg, grossAdds, zamoGA, recharges, deviceSource,
    } = req.body as Record<string, any>;

    if (!imei1) { res.status(400).json({ error: 'IMEI 1 is required' }); return; }
    const existing = await prisma.$queryRaw<any[]>`SELECT id FROM kyc_devices WHERE imei1 = ${imei1} LIMIT 1`;
    if (existing.length > 0) { res.status(409).json({ error: `Device with IMEI ${imei1} already exists` }); return; }

    const result = await prisma.$queryRaw<any[]>`
      INSERT INTO kyc_devices
        (id, "dealerCode","description","imei1","imei2","msisdn","simSerial","siteId",
         "region","zone","rbmName","aseName","teamLead","status","activityStatus",
         "kycReg","grossAdds","zamoGA","recharges","deviceSource","createdAt","updatedAt")
      VALUES (
        gen_random_uuid(),
        ${dealerCode||null},${description||'ASE Entry'},${imei1},${imei2||null},
        ${msisdn||null},${simSerial||null},${siteId||null},
        ${region||zone},${zone},${aseName},
        ${aseName},${teamLead||null},${status||'ACTIVE'},
        ${Number(activityStatus)||0},${Number(kycReg)||0},${Number(grossAdds)||0},
        ${Number(zamoGA)||0},${Number(recharges)||0},${deviceSource||'MobiGO2+'},
        NOW(),NOW()
      )
      RETURNING id, "imei1","aseName","zone","deviceSource"
    `;
    res.status(201).json({ success: true, data: result[0], message: 'Device added to your profile' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add device' });
  }
});

// ─── GET /ase/devices — list this ASE's own KYC devices ──────────────────────
aseRouter.get('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseName = req.user!.name;
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, "dealerCode","description","imei1","imei2","msisdn","siteId",
             "zone","region","status","activityStatus","kycReg","grossAdds","zamoGA","deviceSource","createdAt"
      FROM kyc_devices WHERE LOWER("aseName") = LOWER(${aseName})
      ORDER BY "createdAt" DESC LIMIT 300
    `;
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load devices' });
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

// ─── PATCH /ase/tdr/:id — ASE edits a TDR assigned to them (name / active) ───
aseRouter.patch('/tdr/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tdr = await prisma.user.findFirst({ where: { id: req.params.id, aseId: req.user!.userId, role: 'TDR' } });
    if (!tdr) { res.status(403).json({ error: 'TDR not assigned to you' }); return; }
    const { name, active } = req.body as { name?: string; active?: boolean };
    const data: any = {};
    if (name !== undefined && name.trim()) data.name = name.trim();
    if (active !== undefined) data.active = !!active;
    if (Object.keys(data).length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }
    const updated = await prisma.user.update({ where: { id: tdr.id }, data });
    res.json({ success: true, data: { id: updated.id, name: updated.name, active: updated.active } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update TDR' });
  }
});

// ─── DELETE /ase/tdr/:id — ASE removes a TDR assigned to them ────────────────
aseRouter.delete('/tdr/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tdr = await prisma.user.findFirst({ where: { id: req.params.id, aseId: req.user!.userId, role: 'TDR' } });
    if (!tdr) { res.status(403).json({ error: 'TDR not assigned to you' }); return; }
    // Soft-delete: deactivate + unassign (preserves history)
    await prisma.user.update({ where: { id: tdr.id }, data: { active: false, aseId: null } });
    res.json({ success: true, data: { id: tdr.id, name: tdr.name, message: `${tdr.name} removed` } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete TDR' });
  }
});

// ─── GET /ase/map — zone-scoped agent & visit map data ───────────────────────

aseRouter.get('/map', responseCache(45), async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;

    // Only fetch agents/visits belonging to TDRs assigned to this ASE
    const myTdrs = await prisma.user.findMany({
      where: { aseId, role: 'TDR', active: true },
      select: { id: true, name: true },
    });
    const tdrIds   = myTdrs.map((t: any) => t.id);
    const tdrNames = myTdrs.map((t: any) => t.name);

    if (tdrIds.length === 0) {
      res.json({ success: true, data: { agents: [], visits: [] }, tdrCount: 0 });
      return;
    }

    const [agents, visits] = await Promise.all([
      prisma.agent.findMany({
        where: {
          tdrId: { in: tdrIds },
          latitude:  { not: null },
          longitude: { not: null },
        },
        select: {
          id: true, agentName: true, agentCode: true, type: true,
          tdrName: true, zone: true, town: true,
          latitude: true, longitude: true, initialFloat: true,
          merchantCategory: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      prisma.visit.findMany({
        where: {
          tdrId: { in: tdrIds },
          latitude:  { not: null },
          longitude: { not: null },
        },
        select: {
          id: true, outletName: true, agentCode: true,
          tdrName: true, zone: true, town: true,
          latitude: true, longitude: true, floatAmount: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);

    res.json({
      success: true,
      data: { agents, visits },
      tdrCount: tdrIds.length,
      tdrNames,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch map data' });
  }
});

// ─── Weekly Site Focus endpoints ─────────────────────────────────────────────

// GET /ase/site-focus?week=YYYY-MM-DD  (optional — defaults to current week)
aseRouter.get('/site-focus', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;
    const weekStart = req.query.week
      ? new Date(req.query.week as string)
      : (() => {
          const d = new Date(); const day = d.getDay();
          const diff = (day === 0 ? -6 : 1 - day);
          const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0);
          return mon;
        })();
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999);

    // ── Carry-forward: when viewing the CURRENT week, roll any unvisited planned
    //    sites from PAST weeks into this week (red-flagged as carried over). ──
    const todayMon = (() => {
      const d = new Date(); const day = d.getDay();
      const diff = (day === 0 ? -6 : 1 - day);
      const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0);
      return mon;
    })();
    const isCurrentWeek = weekStart.getTime() === todayMon.getTime();
    if (isCurrentWeek) {
      const stale = await prisma.siteFocus.findMany({
        where: { aseId, status: 'planned', weekStart: { lt: weekStart } },
      });
      for (const s of stale) {
        // Does an entry for this site already exist in the current week? avoid dupes
        const dup = await prisma.siteFocus.findFirst({
          where: { aseId, siteId: s.siteId, weekStart: { gte: weekStart, lte: weekEnd } },
        });
        if (dup) {
          // already carried (or re-planned) — remove the stale original
          await prisma.siteFocus.delete({ where: { id: s.id } }).catch(() => {});
          continue;
        }
        await prisma.siteFocus.update({
          where: { id: s.id },
          data: {
            weekStart,
            carryCount: (s.carryCount || 0) + 1,
            originWeek: s.originWeek || s.weekStart,
          },
        });
      }
    }

    const sites = await prisma.siteFocus.findMany({
      where: { aseId, weekStart: { gte: weekStart, lte: weekEnd } },
      orderBy: { createdAt: 'asc' },
    });

    // Per-site score + overdue flag (planned + carried over OR planned date in the past)
    const AGENT_TGT = 3; const SSO_TGT = 2; const ODR_TGT = 1;
    const DATA_TGT = 15; const DTU_TGT = 500;
    const now = new Date();
    const scored = sites.map(s => {
      const overdue = s.status === 'planned' &&
        ((s.carryCount || 0) > 0 || (s.plannedDate ? new Date(s.plannedDate) < now : false));
      return {
        ...s,
        overdue,
        carriedOver: (s.carryCount || 0) > 0,
        zmTarget: (s.siteType === 'rural') ? 30 : 50,
        score: Math.round(
          (Math.min(s.agentsRec / AGENT_TGT, 1) +
           Math.min(s.ssosRec   / SSO_TGT,   1) +
           Math.min(s.odrsRec   / ODR_TGT,   1) +
           Math.min(s.dataActs  / DATA_TGT,   1) +
           Math.min(s.dtuSold   / DTU_TGT,    1) +
           Math.min((s.zmGrossAdds || 0) / ((s.siteType === 'rural') ? 30 : 50), 1)) / 6 * 100
        ),
      };
    });

    res.json({
      success: true,
      weekStart,
      sitesCount: sites.length,
      targetSites: 5,
      overdueCount: scored.filter(s => s.overdue).length,
      data: scored,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load site focus' });
  }
});

// POST /ase/site-focus — add or update a site visit for the current week
aseRouter.post('/site-focus', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;
    const { siteName, siteId: siteRef, agentsRec, ssosRec, odrsRec, dataActs, dtuSold, dtuAgentCode, zmGrossAdds, siteType, notes, latitude, longitude, mode, plannedDate, agentCodes, ssoCodes, odrCodes } = req.body;
    const normSiteType = (siteType === 'rural') ? 'rural' : 'urban';
    // Normalize code lists → trimmed comma-separated strings
    const normCodes = (v: any): string | null => {
      if (v === undefined || v === null || v === '') return null;
      const arr = Array.isArray(v) ? v : String(v).split(',');
      const clean = arr.map((x: any) => String(x).trim()).filter(Boolean);
      return clean.length ? clean.join(', ') : null;
    };
    const lat = (latitude !== undefined && latitude !== null && latitude !== '') ? Number(latitude) : null;
    const lng = (longitude !== undefined && longitude !== null && longitude !== '') ? Number(longitude) : null;
    // mode: 'plan' creates a planned site (no results yet); 'record'/'visited' = actuals captured
    const isPlan = mode === 'plan';
    const planDate = plannedDate ? new Date(plannedDate) : null;
    if (!siteName || !siteRef) {
      res.status(400).json({ error: 'siteName and siteId are required' });
      return;
    }
    // Week start (Monday)
    const d = new Date(); const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const weekStart = new Date(d); weekStart.setDate(d.getDate() + diff); weekStart.setHours(0,0,0,0);

    // Upsert by aseId + siteId + weekStart
    const existing = await prisma.siteFocus.findFirst({
      where: { aseId, siteId: siteRef, weekStart },
    });
    let record;
    if (existing) {
      record = await prisma.siteFocus.update({
        where: { id: existing.id },
        data: {
          siteName,
          agentsRec: Number(agentsRec) || 0,
          ssosRec:   Number(ssosRec)   || 0,
          odrsRec:   Number(odrsRec)   || 0,
          dataActs:  Number(dataActs)  || 0,
          dtuSold:   Number(dtuSold)   || 0,
          ...(lat !== null ? { latitude: lat } : {}),
          ...(lng !== null ? { longitude: lng } : {}),
          ...(agentCodes !== undefined ? { agentCodes: normCodes(agentCodes) } : {}),
          ...(ssoCodes   !== undefined ? { ssoCodes:   normCodes(ssoCodes) } : {}),
          ...(odrCodes   !== undefined ? { odrCodes:   normCodes(odrCodes) } : {}),
          ...(dtuAgentCode !== undefined ? { dtuAgentCode: dtuAgentCode ? String(dtuAgentCode).trim() : null } : {}),
          ...(zmGrossAdds !== undefined ? { zmGrossAdds: Number(zmGrossAdds) || 0 } : {}),
          ...(siteType !== undefined ? { siteType: normSiteType } : {}),
          notes:     notes || null,
        },
      });
    } else {
      // Check 5-site cap
      const existingCount = await prisma.siteFocus.count({ where: { aseId, weekStart } });
      if (existingCount >= 5) {
        res.status(400).json({ error: 'Maximum 5 focus sites per week reached' });
        return;
      }
      record = await prisma.siteFocus.create({
        data: {
          aseId, weekStart, siteName, siteId: siteRef,
          agentsRec: isPlan ? 0 : (Number(agentsRec) || 0),
          ssosRec:   isPlan ? 0 : (Number(ssosRec)   || 0),
          odrsRec:   isPlan ? 0 : (Number(odrsRec)   || 0),
          dataActs:  isPlan ? 0 : (Number(dataActs)  || 0),
          dtuSold:   isPlan ? 0 : (Number(dtuSold)   || 0),
          agentCodes: isPlan ? null : normCodes(agentCodes),
          ssoCodes:   isPlan ? null : normCodes(ssoCodes),
          odrCodes:   isPlan ? null : normCodes(odrCodes),
          dtuAgentCode: isPlan ? null : (dtuAgentCode ? String(dtuAgentCode).trim() : null),
          zmGrossAdds: isPlan ? 0 : (Number(zmGrossAdds) || 0),
          siteType:    normSiteType,
          latitude:  lat,
          longitude: lng,
          notes:     notes || null,
          status:      isPlan ? 'planned' : 'visited',
          plannedDate: planDate,
          visitedAt:   isPlan ? null : new Date(),
        },
      });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save site focus' });
  }
});

// PATCH /ase/site-focus/:id — edit a site / record actual results after the visit
aseRouter.patch('/site-focus/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;
    const site = await prisma.siteFocus.findFirst({ where: { id: req.params.id, aseId } });
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }

    const b = req.body;
    const normCodes = (v: any): string | null => {
      if (v === undefined || v === null || v === '') return null;
      const arr = Array.isArray(v) ? v : String(v).split(',');
      const clean = arr.map((x: any) => String(x).trim()).filter(Boolean);
      return clean.length ? clean.join(', ') : null;
    };
    const data: any = {};
    if (b.siteName !== undefined) data.siteName = b.siteName;
    if (b.siteId   !== undefined) data.siteId   = b.siteId;
    if (b.agentsRec !== undefined) data.agentsRec = Number(b.agentsRec) || 0;
    if (b.ssosRec   !== undefined) data.ssosRec   = Number(b.ssosRec)   || 0;
    if (b.odrsRec   !== undefined) data.odrsRec   = Number(b.odrsRec)   || 0;
    if (b.dataActs  !== undefined) data.dataActs  = Number(b.dataActs)  || 0;
    if (b.dtuSold   !== undefined) data.dtuSold   = Number(b.dtuSold)   || 0;
    if (b.agentCodes !== undefined) data.agentCodes = normCodes(b.agentCodes);
    if (b.ssoCodes   !== undefined) data.ssoCodes   = normCodes(b.ssoCodes);
    if (b.odrCodes   !== undefined) data.odrCodes   = normCodes(b.odrCodes);
    if (b.dtuAgentCode !== undefined) data.dtuAgentCode = b.dtuAgentCode ? String(b.dtuAgentCode).trim() : null;
    if (b.zmGrossAdds !== undefined) data.zmGrossAdds = Number(b.zmGrossAdds) || 0;
    if (b.siteType    !== undefined) data.siteType = (b.siteType === 'rural') ? 'rural' : 'urban';
    if (b.notes     !== undefined) data.notes     = b.notes || null;
    if (b.plannedDate !== undefined) data.plannedDate = b.plannedDate ? new Date(b.plannedDate) : null;
    if (b.latitude  !== undefined && b.latitude  !== '' && b.latitude  !== null) data.latitude  = Number(b.latitude);
    if (b.longitude !== undefined && b.longitude !== '' && b.longitude !== null) data.longitude = Number(b.longitude);

    // Recording actuals → mark as visited (explicit mode='record' OR any result field provided)
    const recordingActuals = b.mode === 'record' ||
      ['agentsRec','ssosRec','odrsRec','dataActs','dtuSold','zmGrossAdds','agentCodes','ssoCodes','odrCodes'].some(k => b[k] !== undefined);
    if (b.status) {
      data.status = b.status;
      if (b.status === 'visited' && !site.visitedAt) data.visitedAt = new Date();
    } else if (recordingActuals && site.status !== 'visited') {
      data.status = 'visited';
      data.visitedAt = new Date();
    }

    const updated = await prisma.siteFocus.update({ where: { id: site.id }, data });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update site' });
  }
});

// DELETE /ase/site-focus/:id
aseRouter.delete('/site-focus/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const aseId = req.user!.userId;
    const site = await prisma.siteFocus.findFirst({ where: { id: req.params.id, aseId } });
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }
    await prisma.siteFocus.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete site' });
  }
});
