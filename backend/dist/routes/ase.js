"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aseRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const responseCache_1 = require("../middleware/responseCache");
const mtd_1 = require("../utils/mtd");
exports.aseRouter = (0, express_1.Router)();
exports.aseRouter.use((0, auth_1.requireAuth)('ASE', 'ZBM', 'HSD'));
exports.aseRouter.use(rateLimit_1.apiRateLimit);
// ─── Helper: calc TDR KPI score (same weights as ZBM dashboard) ─────────────
function calcTdrScore(agents, merchants, visits, reactivations) {
    const agentTarget = (0, mtd_1.prorateMtdTarget)(96);
    const merchantTarget = (0, mtd_1.prorateMtdTarget)(96);
    const visitTarget = (0, mtd_1.visitMtdTarget)();
    const reactivationTarget = 6 * (0, mtd_1.workingDaysElapsed)();
    const agentPct = Math.min(agents / Math.max(agentTarget, 1), 1) * 100;
    const merchantPct = Math.min(merchants / Math.max(merchantTarget, 1), 1) * 100;
    const visitPct = Math.min(visits / Math.max(visitTarget, 1), 1) * 100;
    const reactivPct = Math.min(reactivations / Math.max(reactivationTarget, 1), 1) * 100;
    return Math.round(agentPct * 0.40 + merchantPct * 0.20 + visitPct * 0.10 + reactivPct * 0.15);
}
// ─── GET /ase/dashboard ───────────────────────────────────────────────────────
exports.aseRouter.get('/dashboard', async (req, res) => {
    try {
        const aseId = req.user.userId;
        const aseName = req.user.name;
        // TDRs assigned to this ASE
        const tdrs = await prisma_1.prisma.users.findMany({
            where: { aseId: aseId, role: 'TDR', active: true },
        });
        const tdrIds = tdrs.map(t => t.id);
        const { start, end } = (0, mtd_1.mtdRange)();
        const [agentsGrp, merchantsGrp, visitsGrp, floatsGrp, reactivGrp, prospectsGrp] = await Promise.all([
            prisma_1.prisma.agents.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, type: 'normal', createdAt: { gte: start, lte: end } } }),
            prisma_1.prisma.agents.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
            prisma_1.prisma.visits.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } } }),
            prisma_1.prisma.float_issues.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, status: { not: 'resolved' } } }),
            prisma_1.prisma.reactivation.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } } }),
            prisma_1.prisma.prospects.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: tdrIds } } }),
        ]);
        const aM = Object.fromEntries(agentsGrp.map((r) => [r.tdrId, r._count]));
        const mM = Object.fromEntries(merchantsGrp.map((r) => [r.tdrId, r._count]));
        const vM = Object.fromEntries(visitsGrp.map((r) => [r.tdrId, r._count]));
        const fM = Object.fromEntries(floatsGrp.map((r) => [r.tdrId, r._count]));
        const rM = Object.fromEntries(reactivGrp.map((r) => [r.tdrId, r._count]));
        const pM = Object.fromEntries(prospectsGrp.map((r) => [r.tdrId, r._count]));
        const tdrStats = tdrs.map(tdr => {
            const agents = aM[tdr.id] || 0;
            const merchants = mM[tdr.id] || 0;
            const visits = vM[tdr.id] || 0;
            const floatIssues = fM[tdr.id] || 0;
            const reactivations = rM[tdr.id] || 0;
            const prospects = pM[tdr.id] || 0;
            const kpiScore = calcTdrScore(agents, merchants, visits, reactivations);
            return { tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone }, agents, merchants, visits, floatIssues, reactivations, prospects, kpiScore };
        });
        // KYC Device metrics — match by ASE name (case-insensitive)
        const devicesRaw = await prisma_1.prisma.$queryRaw `
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
        const totalDev = dev.total || 0;
        const activeDev = dev.active || 0;
        const inactiveDev = totalDev - activeDev;
        const kycScore = totalDev > 0 ? Math.round(activeDev / totalDev * 100) : 0;
        // KPI component scores
        const teamAgents = tdrStats.reduce((s, t) => s + t.agents, 0);
        const teamMerchants = tdrStats.reduce((s, t) => s + t.merchants, 0);
        const teamVisits = tdrStats.reduce((s, t) => s + t.visits, 0);
        const teamReactivations = tdrStats.reduce((s, t) => s + t.reactivations, 0);
        const tdrCount = tdrs.length;
        const agentTarget = (0, mtd_1.prorateMtdTarget)(96) * Math.max(tdrCount, 1);
        const merchantTarget = (0, mtd_1.prorateMtdTarget)(96) * Math.max(tdrCount, 1);
        const simOutletScore = Math.min(Math.round(teamAgents / Math.max(agentTarget, 1) * 100), 100);
        const ownDeviceScore = Math.min(Math.round(teamMerchants / Math.max(merchantTarget, 1) * 100), 100);
        const tdrScores = tdrStats.map(t => t.kpiScore);
        const supervisionScore = tdrCount > 0 ? Math.round(tdrScores.reduce((a, b) => a + b, 0) / tdrCount) : 0;
        const finalScore = Math.round(kycScore * 0.3636 +
            simOutletScore * 0.2273 +
            ownDeviceScore * 0.0909 +
            supervisionScore * 0.3182);
        const agentMtdTarget = (0, mtd_1.prorateMtdTarget)(96) * Math.max(tdrCount, 1);
        const merchantMtdTarget = (0, mtd_1.prorateMtdTarget)(96) * Math.max(tdrCount, 1);
        const visitMtdTgt = (0, mtd_1.visitMtdTarget)() * Math.max(tdrCount, 1);
        const reactivationTarget = 6 * (0, mtd_1.workingDaysElapsed)() * Math.max(tdrCount, 1);
        res.json({
            ase: { id: aseId, name: aseName, zone: req.user.zone },
            kycDevices: {
                total: totalDev, active: activeDev, inactive: inactiveDev, kycScore,
                bySource: { mobiGo: dev.mobi_go || 0, a100c: dev.a100c || 0 },
                totalKyc: dev.total_kyc || 0, totalGa: dev.total_ga || 0
            },
            tdrStats,
            team: {
                totals: { agents: teamAgents, merchants: teamMerchants, visits: teamVisits, reactivations: teamReactivations },
                targets: { agents: agentMtdTarget, merchants: merchantMtdTarget, visits: visitMtdTgt, reactivations: reactivationTarget },
            },
            aseKpiScore: { kycDeviceScore: kycScore, simOutletScore, ownDeviceScore, supervisionScore, finalScore },
            mtd: { workingDaysElapsed: (0, mtd_1.workingDaysElapsed)(), workingDaysTotal: (0, mtd_1.workingDaysThisMonth)() },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load ASE dashboard' });
    }
});
// ─── GET /ase/devices — KYC devices for this ASE ──────────────────────────────
exports.aseRouter.get('/devices', async (req, res) => {
    try {
        const aseName = req.user.name;
        const source = req.query.source;
        const status = req.query.status;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const safeAseName = aseName.replace(/'/g, "''");
        const conditions = [`LOWER("aseName") = LOWER('${safeAseName}')`];
        if (source === 'MobiGO2+')
            conditions.push(`"deviceSource" = 'MobiGO2+'`);
        if (source === 'A100C')
            conditions.push(`"deviceSource" = 'A100C'`);
        if (status === 'active')
            conditions.push(`"activityStatus" = 1`);
        if (status === 'inactive')
            conditions.push(`"activityStatus" = 0`);
        const where = conditions.join(' AND ');
        const [devicesRaw, countRaw] = await Promise.all([
            prisma_1.prisma.$queryRawUnsafe(`SELECT id, "dealerCode", description, imei1, imei2, msisdn, region, zone, "aseName", "teamLead", status, "activityStatus", "kycReg", "grossAdds", "zamoGA", recharges, "deviceSource" FROM kyc_devices WHERE ${where} ORDER BY "activityStatus" DESC, "dealerCode" LIMIT ${limit} OFFSET ${offset}`),
            prisma_1.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as cnt, SUM("activityStatus")::int as active FROM kyc_devices WHERE ${where}`),
        ]);
        const total = countRaw[0]?.cnt || 0;
        const active = countRaw[0]?.active || 0;
        res.json({ success: true, data: devicesRaw, total, active, inactive: total - active, page, limit });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load devices' });
    }
});
// ─── GET /ase/kyc-summary — ASE device summary for a zone (ZBM/HSD) ──────────
exports.aseRouter.get('/kyc-summary', async (req, res) => {
    try {
        const zone = req.user.role === 'ASE' ? req.user.zone : req.query.zone;
        const safeZone = zone ? zone.replace(/'/g, "''") : '';
        const whereClause = zone ? `WHERE LOWER(zone) = LOWER('${safeZone}')` : '';
        const rows = await prisma_1.prisma.$queryRawUnsafe(`
      SELECT "aseName", zone, COUNT(*)::int as total, SUM("activityStatus")::int as active,
             SUM("kycReg")::int as total_kyc, SUM("grossAdds")::int as total_ga
      FROM kyc_devices ${whereClause}
      GROUP BY "aseName", zone ORDER BY zone, "aseName"
    `);
        res.json({ success: true, data: rows });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load KYC summary' });
    }
});
// ─── GET /ase/available-tdrs ──────────────────────────────────────────────────
exports.aseRouter.get('/available-tdrs', async (req, res) => {
    try {
        const aseId = req.user.userId;
        const zone = req.user.zone;
        const tdrs = await prisma_1.prisma.users.findMany({
            where: { role: 'TDR', active: true, ...(zone ? { zone } : {}), OR: [{ aseId: null }, { aseId: aseId }] },
            select: { id: true, name: true, zone: true, aseId: true },
            orderBy: { name: 'asc' },
        });
        res.json({ success: true, data: tdrs.map(t => ({ ...t, mine: t.aseId === aseId })) });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load available TDRs' });
    }
});
// ─── POST /ase/pick-tdr ───────────────────────────────────────────────────────
exports.aseRouter.post('/pick-tdr', async (req, res) => {
    try {
        const aseId = req.user.userId;
        const { tdrId } = req.body;
        if (!tdrId) {
            res.status(400).json({ error: 'tdrId required' });
            return;
        }
        const tdr = await prisma_1.prisma.users.findUnique({ where: { id: tdrId } });
        if (!tdr) {
            res.status(404).json({ error: 'TDR not found' });
            return;
        }
        if (tdr.aseId && tdr.aseId !== aseId) {
            res.status(409).json({ error: 'TDR already assigned to another ASE' });
            return;
        }
        await prisma_1.prisma.users.update({ where: { id: tdrId }, data: { aseId } });
        res.json({ success: true, message: 'TDR assigned to you' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to pick TDR' });
    }
});
// ─── DELETE /ase/pick-tdr/:tdrId ─────────────────────────────────────────────
exports.aseRouter.delete('/pick-tdr/:tdrId', async (req, res) => {
    try {
        const aseId = req.user.userId;
        const tdr = await prisma_1.prisma.users.findUnique({ where: { id: req.params.tdrId } });
        if (!tdr || tdr.aseId !== aseId) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        await prisma_1.prisma.users.update({ where: { id: req.params.tdrId }, data: { aseId: null } });
        res.json({ success: true, message: 'TDR released' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to release TDR' });
    }
});
// ─── GET /ase/tdr/:id ─────────────────────────────────────────────────────────
exports.aseRouter.get('/tdr/:id', async (req, res) => {
    try {
        const tdr = await prisma_1.prisma.users.findFirst({ where: { id: req.params.id, aseId: req.user.userId, role: 'TDR' } });
        if (!tdr) {
            res.status(403).json({ error: 'TDR not assigned to you' });
            return;
        }
        const [agents, visits, floatIssues, prospects] = await Promise.all([
            prisma_1.prisma.agents.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
            prisma_1.prisma.visits.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
            prisma_1.prisma.float_issues.findMany({ where: { tdrId: tdr.id }, orderBy: { reportedAt: 'desc' }, take: 20 }),
            prisma_1.prisma.prospects.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
        ]);
        res.json({ tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone }, agents, visits, floatIssues, prospects });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load TDR data' });
    }
});
// ─── GET /ase/map — zone-scoped agent & visit map data ───────────────────────
exports.aseRouter.get('/map', (0, responseCache_1.responseCache)(45), async (req, res) => {
    try {
        const aseId = req.user.userId;
        // Only fetch agents/visits belonging to TDRs assigned to this ASE
        const myTdrs = await prisma_1.prisma.users.findMany({
            where: { aseId, role: 'TDR', active: true },
            select: { id: true, name: true },
        });
        const tdrIds = myTdrs.map((t) => t.id);
        const tdrNames = myTdrs.map((t) => t.name);
        if (tdrIds.length === 0) {
            res.json({ success: true, data: { agents: [], visits: [] }, tdrCount: 0 });
            return;
        }
        const [agents, visits] = await Promise.all([
            prisma_1.prisma.agents.findMany({
                where: {
                    tdrId: { in: tdrIds },
                    latitude: { not: null },
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
            prisma_1.prisma.visits.findMany({
                where: {
                    tdrId: { in: tdrIds },
                    latitude: { not: null },
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
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch map data' });
    }
});
//# sourceMappingURL=ase.js.map