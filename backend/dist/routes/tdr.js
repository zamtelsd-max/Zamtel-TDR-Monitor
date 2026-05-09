"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tdrRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const responseCache_1 = require("../middleware/responseCache");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const mtd_1 = require("../utils/mtd");
exports.tdrRouter = (0, express_1.Router)();
exports.tdrRouter.use((0, auth_1.requireAuth)('TDR'));
exports.tdrRouter.use(rateLimit_1.apiRateLimit);
// ─── GET /tdr/dashboard ───────────────────────────────────────────────────────
exports.tdrRouter.get('/dashboard', (0, responseCache_1.responseCache)(30), async (req, res) => {
    const tdrId = req.user.userId;
    const { start, end } = (0, mtd_1.mtdRange)();
    // Today's window (midnight → now)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    const [agentsCount, merchantsCount, visitsCount, floatIssues, prospects, recentAgents, recentVisits, agentsToday, merchantsToday, visitsToday, reactivationsCount] = await Promise.all([
        prisma_1.prisma.agent.count({ where: { tdrId, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.count({ where: { tdrId, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
        prisma_1.prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
        prisma_1.prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma_1.prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma_1.prisma.agent.count({ where: { tdrId, type: 'normal', createdAt: { gte: todayStart, lte: todayEnd } } }),
        prisma_1.prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: todayStart, lte: todayEnd } } }),
        prisma_1.prisma.visit.count({ where: { tdrId, createdAt: { gte: todayStart, lte: todayEnd } } }),
        // Reactivations submitted via the dedicated form this MTD
        prisma_1.prisma.reactivation.count({ where: { tdrId, createdAt: { gte: start, lte: end } } }),
    ]);
    // NT base points: sum of ntPoints for this TDR this MTD
    const ntPointsRows = await prisma_1.prisma.$queryRaw `
    SELECT COALESCE(SUM("ntPoints"), 0)::int AS total
    FROM reactivations
    WHERE "tdrId" = ${tdrId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
  `;
    const ntPointsTotal = ntPointsRows[0]?.total ?? 0;
    // NT bonus: 100 pts = 20% of agent score added on top (prorated: ntPts/100 * 20)
    // Capped at 20% bonus
    const NT_POINTS_TARGET = 100;
    const ntBonusPct = Math.min(Math.round((ntPointsTotal / NT_POINTS_TARGET) * 20), 20);
    const floatResolved = floatIssues.filter(f => f.status === 'resolved').length;
    const floatPending = floatIssues.filter(f => f.status !== 'resolved').length;
    const prospectsConverted = prospects.filter(p => p.status === 'converted' && p.convertedAt && p.convertedAt >= start && p.convertedAt <= end).length;
    const prospectsPending = prospects.filter(p => p.followUpDate && p.followUpDate <= new Date() && p.status !== 'converted' && p.status !== 'rejected').length;
    // Targets
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const target = await prisma_1.prisma.salesTarget.findUnique({ where: { zone_period: { zone: req.user.zone || '', period } } });
    res.json({
        tdr: { id: tdrId, name: req.user.name, zone: req.user.zone },
        month: period,
        mtd: {
            workingDaysElapsed: (0, mtd_1.workingDaysElapsed)(),
            workingDaysTotal: (0, mtd_1.workingDaysThisMonth)(),
        },
        stats: {
            agents: { count: agentsCount, target: (0, mtd_1.prorateMtdTarget)(target?.targetAgents || 96) },
            merchants: { count: merchantsCount, target: (0, mtd_1.prorateMtdTarget)(target?.targetMerchants || 96) },
            visits: { count: visitsCount, target: (0, mtd_1.visitMtdTarget)() },
            reactivations: { count: reactivationsCount, target: 6 * (0, mtd_1.workingDaysElapsed)() },
            ntPoints: { total: ntPointsTotal, target: NT_POINTS_TARGET, bonusPct: ntBonusPct },
        },
        today: {
            agents: agentsToday,
            merchants: merchantsToday,
            visits: visitsToday,
            target: 20, // 20 visits per working day
        },
        floatIssues: {
            total: floatIssues.length,
            resolved: floatResolved,
            pending: floatPending,
        },
        prospects: {
            total: prospects.length,
            converted: prospectsConverted,
            pending: prospectsPending,
        },
        recentActivity: {
            agents: recentAgents,
            visits: recentVisits,
        },
    });
});
// ─── POST /tdr/agents ─────────────────────────────────────────────────────────
const agentSchema = zod_1.z.object({
    agentName: zod_1.z.string().min(1),
    agentCode: zod_1.z.string().min(1),
    contactPhone: zod_1.z.string().min(1),
    type: zod_1.z.enum(['normal', 'merchant']),
    merchantCategory: zod_1.z.string().optional(),
    initialFloat: zod_1.z.number().default(0),
    town: zod_1.z.string().min(1),
    address: zod_1.z.string().optional(),
    cluster: zod_1.z.string().optional(),
    market: zod_1.z.string().optional(),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    notes: zod_1.z.string().optional(),
});
exports.tdrRouter.post('/agents', async (req, res) => {
    const parsed = agentSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const tdrId = req.user.userId;
        // Check if agent code already exists anywhere in the system (globally unique)
        const existing = await prisma_1.prisma.agent.findUnique({
            where: { agentCode: parsed.data.agentCode },
        });
        if (existing) {
            res.status(409).json({ error: `Agent code ${parsed.data.agentCode} is already registered in the system.` });
            return;
        }
        const zbm = await prisma_1.prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user.zone || '' } });
        const agent = await prisma_1.prisma.agent.create({
            data: {
                ...parsed.data,
                tdrId,
                tdrName: req.user.name,
                zone: req.user.zone || '',
                zbmName: zbm?.name || '',
            },
        });
        (0, responseCache_1.invalidateCache)(`${req.user.userId}::`);
        res.status(201).json(agent);
    }
    catch (err) {
        if (err?.code === 'P2002') {
            res.status(409).json({ error: `Agent code ${req.body?.agentCode} is already registered in the system.` });
        }
        else {
            res.status(500).json({ error: 'Failed to create agent' });
        }
    }
});
// ─── POST /tdr/visits ─────────────────────────────────────────────────────────
const visitSchema = zod_1.z.object({
    outletName: zod_1.z.string().min(1),
    agentCode: zod_1.z.string().min(1),
    contactPhone: zod_1.z.string().min(1),
    town: zod_1.z.string().min(1),
    cluster: zod_1.z.string().optional(),
    market: zod_1.z.string().optional(),
    floatAmount: zod_1.z.number().default(0),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    notes: zod_1.z.string().optional(),
});
exports.tdrRouter.post('/visits', async (req, res) => {
    const parsed = visitSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        // Duplicate check: same TDR + same agentCode on same calendar day
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const existing = await prisma_1.prisma.visit.findFirst({
            where: {
                tdrId: req.user.userId,
                agentCode: parsed.data.agentCode,
                createdAt: { gte: todayStart, lte: todayEnd },
            },
        });
        if (existing) {
            res.status(409).json({ error: `You already recorded a visit for agent ${parsed.data.agentCode} today.` });
            return;
        }
        const zbm = await prisma_1.prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user.zone || '' } });
        const visit = await prisma_1.prisma.visit.create({
            data: {
                ...parsed.data,
                tdrId: req.user.userId,
                tdrName: req.user.name,
                zone: req.user.zone || '',
                zbmName: zbm?.name || '',
            },
        });
        (0, responseCache_1.invalidateCache)(`${req.user.userId}::`);
        res.status(201).json(visit);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to record visit' });
    }
});
// ─── POST /tdr/float-issues ───────────────────────────────────────────────────
const floatIssueSchema = zod_1.z.object({
    agentCode: zod_1.z.string().min(1),
    agentName: zod_1.z.string().min(1),
    contactPhone: zod_1.z.string().min(1),
    issueType: zod_1.z.enum(['low_float', 'stuck_transaction', 'system_error', 'other']),
    reportedFloat: zod_1.z.number().default(0),
    description: zod_1.z.string().min(1),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
});
exports.tdrRouter.post('/float-issues', async (req, res) => {
    const parsed = floatIssueSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const issue = await prisma_1.prisma.floatIssue.create({
            data: {
                ...parsed.data,
                tdrId: req.user.userId,
                tdrName: req.user.name,
                zone: req.user.zone || '',
                status: 'reported',
            },
        });
        res.status(201).json(issue);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to report float issue' });
    }
});
// ─── GET /tdr/float-issues ────────────────────────────────────────────────────
exports.tdrRouter.get('/float-issues', async (req, res) => {
    const issues = await prisma_1.prisma.floatIssue.findMany({
        where: { tdrId: req.user.userId },
        orderBy: { reportedAt: 'desc' },
    });
    res.json(issues);
});
// ─── PATCH /tdr/float-issues/:id ─────────────────────────────────────────────
exports.tdrRouter.patch('/float-issues/:id', async (req, res) => {
    const issue = await prisma_1.prisma.floatIssue.findUnique({ where: { id: req.params.id } });
    if (!issue || issue.tdrId !== req.user.userId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const updated = await prisma_1.prisma.floatIssue.update({
        where: { id: req.params.id },
        data: {
            status: req.body.status === 'in_progress' ? 'in_progress' : undefined,
        },
    });
    res.json(updated);
});
// ─── POST /tdr/prospects ──────────────────────────────────────────────────────
const prospectSchema = zod_1.z.object({
    prospectType: zod_1.z.enum(['agent', 'merchant']),
    businessName: zod_1.z.string().min(1),
    ownerName: zod_1.z.string().min(1),
    contactPhone: zod_1.z.string().min(1),
    town: zod_1.z.string().min(1),
    address: zod_1.z.string().optional(),
    merchantCategory: zod_1.z.string().optional(),
    estimatedFloat: zod_1.z.number().optional(),
    status: zod_1.z.enum(['identified', 'contacted', 'interested', 'converted', 'rejected']).default('identified'),
    notes: zod_1.z.string().optional(),
    followUpDate: zod_1.z.string().optional(),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
});
exports.tdrRouter.post('/prospects', async (req, res) => {
    const parsed = prospectSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const prospect = await prisma_1.prisma.prospect.create({
            data: {
                ...parsed.data,
                followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null,
                tdrId: req.user.userId,
                tdrName: req.user.name,
                zone: req.user.zone || '',
            },
        });
        res.status(201).json(prospect);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create prospect' });
    }
});
// ─── GET /tdr/prospects ───────────────────────────────────────────────────────
exports.tdrRouter.get('/prospects', async (req, res) => {
    const prospects = await prisma_1.prisma.prospect.findMany({
        where: { tdrId: req.user.userId },
        orderBy: { createdAt: 'desc' },
    });
    res.json(prospects);
});
// ─── POST /tdr/reactivations ──────────────────────────────────────────────────
const reactivationSchema = zod_1.z.object({
    agentCode: zod_1.z.string().min(1),
    agentName: zod_1.z.string().min(1),
    contactPhone: zod_1.z.string().min(1),
    town: zod_1.z.string().min(1),
    cluster: zod_1.z.string().optional(),
    market: zod_1.z.string().optional(),
    floatAmount: zod_1.z.number().default(0),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    notes: zod_1.z.string().optional(),
});
exports.tdrRouter.post('/reactivations', async (req, res) => {
    const parsed = reactivationSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const tdrId = req.user.userId;
        // Check if code is in non-transacting base → earns 5 NT points
        const ntRows = await prisma_1.prisma.$queryRaw `
      SELECT agent_code FROM nt_codes WHERE agent_code = ${parsed.data.agentCode} LIMIT 1
    `;
        const isNtBase = ntRows.length > 0;
        const ntPoints = isNtBase ? 5 : 0;
        const record = await prisma_1.prisma.$queryRaw `
      INSERT INTO reactivations
        ("id", "tdrId", "tdrName", zone, "agentCode", "agentName", "contactPhone", town, cluster, market,
         "floatAmount", latitude, longitude, notes, "isNtBase", "ntPoints", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid()::text, ${tdrId}, ${req.user.name}, ${req.user.zone || ''},
         ${parsed.data.agentCode}, ${parsed.data.agentName}, ${parsed.data.contactPhone},
         ${parsed.data.town}, ${parsed.data.cluster ?? null}, ${parsed.data.market ?? null},
         ${parsed.data.floatAmount}, ${parsed.data.latitude ?? null}, ${parsed.data.longitude ?? null},
         ${parsed.data.notes ?? null}, ${isNtBase}, ${ntPoints}, NOW(), NOW())
      RETURNING *
    `;
        res.status(201).json({ ...record[0], isNtBase, ntPoints });
    }
    catch (err) {
        console.error('Reactivation create error:', err);
        res.status(500).json({ error: 'Failed to record reactivation' });
    }
});
// ─── GET /tdr/reactivations ───────────────────────────────────────────────────
exports.tdrRouter.get('/reactivations', async (req, res) => {
    const reactivations = await prisma_1.prisma.reactivation.findMany({
        where: { tdrId: req.user.userId },
        orderBy: { createdAt: 'desc' },
    });
    res.json(reactivations);
});
// ─── PATCH /tdr/prospects/:id ─────────────────────────────────────────────────
exports.tdrRouter.patch('/prospects/:id', async (req, res) => {
    const prospect = await prisma_1.prisma.prospect.findUnique({ where: { id: req.params.id } });
    if (!prospect || prospect.tdrId !== req.user.userId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const { status, notes, followUpDate } = req.body;
    const convertedAt = status === 'converted' && prospect.status !== 'converted' ? new Date() : undefined;
    const updated = await prisma_1.prisma.prospect.update({
        where: { id: req.params.id },
        data: {
            status: status || undefined,
            notes: notes || undefined,
            followUpDate: followUpDate ? new Date(followUpDate) : undefined,
            convertedAt: convertedAt,
        },
    });
    // Auto-create Agent record when prospect converts
    if (convertedAt) {
        const zbm = await prisma_1.prisma.user.findFirst({ where: { role: 'ZBM', zone: updated.zone } });
        await prisma_1.prisma.agent.create({
            data: {
                agentName: updated.businessName,
                agentCode: `CONV-${updated.id.slice(0, 8).toUpperCase()}`,
                contactPhone: updated.contactPhone,
                type: updated.prospectType === 'merchant' ? 'merchant' : 'normal',
                merchantCategory: updated.merchantCategory || undefined,
                initialFloat: updated.estimatedFloat || 0,
                town: updated.town,
                address: updated.address || undefined,
                tdrId: updated.tdrId,
                tdrName: updated.tdrName,
                zone: updated.zone,
                zbmName: zbm?.name || '',
            },
        });
    }
    res.json(updated);
});
// ─── GET /tdr/agents/by-code/:code ────────────────────────────────────────────
exports.tdrRouter.get('/agents/by-code/:code', async (req, res) => {
    try {
        const agent = await prisma_1.prisma.agent.findUnique({ where: { agentCode: req.params.code } });
        if (!agent) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }
        // Include last visit info for stale detection
        const lastVisit = await prisma_1.prisma.visit.findFirst({
            where: { agentCode: agent.agentCode },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        const lastVisitedAt = lastVisit?.createdAt ?? null;
        const daysAgo = lastVisitedAt
            ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
            : null;
        res.json({ ...agent, lastVisitedAt, daysAgo, isStale: daysAgo === null || daysAgo >= 4 });
    }
    catch (err) {
        res.status(500).json({ error: 'Lookup failed' });
    }
});
// ─── DELETE /tdr/agents/:id ───────────────────────────────────────────────────
exports.tdrRouter.delete('/agents/:id', async (req, res) => {
    try {
        const agent = await prisma_1.prisma.agent.findUnique({ where: { id: req.params.id } });
        if (!agent || agent.tdrId !== req.user.userId) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        await prisma_1.prisma.agent.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});
// ─── PATCH /tdr/agents/:id ────────────────────────────────────────────────────
exports.tdrRouter.patch('/agents/:id', async (req, res) => {
    try {
        const agent = await prisma_1.prisma.agent.findUnique({ where: { id: req.params.id } });
        if (!agent || agent.tdrId !== req.user.userId) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        const { agentName, contactPhone, initialFloat, town, address, cluster, market, notes, latitude, longitude } = req.body;
        const updated = await prisma_1.prisma.agent.update({
            where: { id: req.params.id },
            data: { agentName, contactPhone, initialFloat, town, address, cluster, market, notes, latitude, longitude },
        });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});
// ─── DELETE /tdr/visits/:id ───────────────────────────────────────────────────
exports.tdrRouter.delete('/visits/:id', async (req, res) => {
    try {
        const visit = await prisma_1.prisma.visit.findUnique({ where: { id: req.params.id } });
        if (!visit || visit.tdrId !== req.user.userId) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        await prisma_1.prisma.visit.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});
// ─── DELETE /tdr/prospects/:id ────────────────────────────────────────────────
exports.tdrRouter.delete('/prospects/:id', async (req, res) => {
    try {
        const prospect = await prisma_1.prisma.prospect.findUnique({ where: { id: req.params.id } });
        if (!prospect || prospect.tdrId !== req.user.userId) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        await prisma_1.prisma.prospect.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});
// ─── POST /tdr/prospects/:id/request-closure ─────────────────────────────────
exports.tdrRouter.post('/prospects/:id/request-closure', async (req, res) => {
    try {
        const prospect = await prisma_1.prisma.prospect.findUnique({ where: { id: req.params.id } });
        if (!prospect || prospect.tdrId !== req.user.userId) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        const updated = await prisma_1.prisma.prospect.update({
            where: { id: req.params.id },
            data: { closedByTdr: true, zbmApprovalRequired: true },
        });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to request closure' });
    }
});
// ─── GET /tdr/activities ─────────────────────────────────────────────────────
exports.tdrRouter.get('/activities', async (req, res) => {
    try {
        const tdrId = req.user.userId;
        const [agents, visits, floatIssues, prospects] = await Promise.all([
            prisma_1.prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
            prisma_1.prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
            prisma_1.prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' }, take: 10 }),
            prisma_1.prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
        ]);
        const activities = [
            ...agents.map(a => ({ type: 'agent', id: a.id, label: a.agentName, sub: `${a.agentCode} · ${a.type} · ${a.town}`, ts: a.createdAt })),
            ...visits.map(v => ({ type: 'visit', id: v.id, label: v.outletName, sub: `Visit · ${v.town}`, ts: v.createdAt })),
            ...floatIssues.map(f => ({ type: 'float', id: f.id, label: f.agentName, sub: `Float Issue · ${f.status}`, ts: f.reportedAt })),
            ...prospects.map(p => ({ type: 'prospect', id: p.id, label: p.businessName, sub: `Prospect · ${p.status}`, ts: p.createdAt })),
        ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 20);
        res.json(activities);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});
// ─── GET /tdr/export ─────────────────────────────────────────────────────────
exports.tdrRouter.get('/export', async (req, res) => {
    try {
        const tdrId = req.user.userId;
        const [agents, visits, floatIssues, prospects] = await Promise.all([
            prisma_1.prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
            prisma_1.prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
            prisma_1.prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
            prisma_1.prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
        ]);
        const XLSX = await Promise.resolve().then(() => __importStar(require('xlsx')));
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
        res.setHeader('Content-Disposition', `attachment; filename="TDR-Export-${req.user.name.replace(/\s+/g, '-')}-${month}.xlsx"`);
        res.send(buffer);
    }
    catch (err) {
        res.status(500).json({ error: 'Export failed' });
    }
});
// ─── GET /tdr/visits/summary ──────────────────────────────────────────────────
// Returns weekly + monthly visit counts for the TDR
exports.tdrRouter.get('/visits/summary', async (req, res) => {
    const tdrId = req.user.userId;
    // Build last 8 weeks buckets
    const now = new Date();
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
        const end = new Date(now);
        end.setDate(end.getDate() - i * 7);
        end.setHours(23, 59, 59, 999);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        const label = `W${Math.ceil((start.getDate()) / 7)} ${start.toLocaleString('default', { month: 'short' })}`;
        weeks.push({ label, start, end });
    }
    const weeklyData = await Promise.all(weeks.map(async (w) => ({
        label: w.label,
        count: await prisma_1.prisma.visit.count({ where: { tdrId, createdAt: { gte: w.start, lte: w.end } } }),
    })));
    // Last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        months.push({ label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), start, end });
    }
    const monthlyData = await Promise.all(months.map(async (m) => ({
        label: m.label,
        count: await prisma_1.prisma.visit.count({ where: { tdrId, createdAt: { gte: m.start, lte: m.end } } }),
    })));
    res.json({ weekly: weeklyData, monthly: monthlyData });
});
// ─── GET /tdr/agents/stale ────────────────────────────────────────────────────
// MUST be before /agents/:id — otherwise "stale" is treated as an ID
// This TDR's agents whose last visit was > 4 days ago (threshold: 4 days)
exports.tdrRouter.get('/agents/stale', async (req, res) => {
    const tdrId = req.user.userId;
    const agents = await prisma_1.prisma.agent.findMany({ where: { tdrId }, orderBy: { agentName: 'asc' } });
    const enriched = await Promise.all(agents.map(async (a) => {
        const lastVisit = await prisma_1.prisma.visit.findFirst({
            where: { tdrId, agentCode: a.agentCode },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        const lastVisitedAt = lastVisit?.createdAt ?? null;
        const daysAgo = lastVisitedAt
            ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
            : null;
        return { ...a, lastVisitedAt, daysAgo, isStale: daysAgo === null || daysAgo >= 4 };
    }));
    const stale = enriched.filter(a => a.isStale);
    res.json({ stale, total: enriched.length, staleCount: stale.length });
});
// ─── GET /tdr/nt-codes/lookup ─────────────────────────────────────────────────
// Look up a code in the non-transacting base — returns zone/agent info if found
exports.tdrRouter.get('/nt-codes/lookup', async (req, res) => {
    const code = (req.query.code || '').trim();
    if (!code) {
        res.status(400).json({ error: 'code query param required' });
        return;
    }
    try {
        const rows = await prisma_1.prisma.$queryRaw `
      SELECT agent_code, zone, agent_name, town, cluster, market
      FROM nt_codes
      WHERE agent_code = ${code}
      LIMIT 1
    `;
        if (rows.length === 0) {
            res.json({ found: false });
        }
        else {
            res.json({ found: true, ...rows[0] });
        }
    }
    catch (err) {
        console.error('NT lookup error:', err);
        res.status(500).json({ error: 'Lookup failed' });
    }
});
// ─── GET /tdr/agents/:id ──────────────────────────────────────────────────────
// Returns full agent detail including recent visits (joined via agentCode)
exports.tdrRouter.get('/agents/:id', async (req, res) => {
    const tdrId = req.user.userId;
    const agent = await prisma_1.prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.tdrId !== tdrId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const visits = await prisma_1.prisma.visit.findMany({
        where: { tdrId, agentCode: agent.agentCode },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
    res.json({ ...agent, visits });
});
//# sourceMappingURL=tdr.js.map