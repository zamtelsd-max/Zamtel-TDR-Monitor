"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tdrRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
exports.tdrRouter = (0, express_1.Router)();
exports.tdrRouter.use((0, auth_1.requireAuth)('TDR'));
exports.tdrRouter.use(rateLimit_1.apiRateLimit);
// ─── Helper: working days Mon–Sat in a given month ───────────────────────────
function workingDaysInMonth(year, month) {
    let count = 0;
    const days = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
        if (new Date(year, month, d).getDay() !== 0)
            count++; // exclude Sundays
    }
    return count;
}
function visitMonthlyTarget() {
    const n = new Date();
    return 20 * workingDaysInMonth(n.getFullYear(), n.getMonth());
}
// ─── Helper: current month range ─────────────────────────────────────────────
function currentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}
// ─── GET /tdr/dashboard ───────────────────────────────────────────────────────
exports.tdrRouter.get('/dashboard', async (req, res) => {
    const tdrId = req.user.userId;
    const { start, end } = currentMonthRange();
    const [agentsCount, merchantsCount, visitsCount, floatIssues, prospects, recentAgents, recentVisits] = await Promise.all([
        prisma_1.prisma.agent.count({ where: { tdrId, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.count({ where: { tdrId, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
        prisma_1.prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
        prisma_1.prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma_1.prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
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
        stats: {
            agents: { count: agentsCount, target: target?.targetAgents || 96 },
            merchants: { count: merchantsCount, target: target?.targetMerchants || 96 },
            visits: { count: visitsCount, target: target?.targetOutlets || visitMonthlyTarget() },
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
    // Find ZBM for this zone
    const zbm = await prisma_1.prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user.zone || '' } });
    const agent = await prisma_1.prisma.agent.create({
        data: {
            ...parsed.data,
            tdrId: req.user.userId,
            tdrName: req.user.name,
            zone: req.user.zone || '',
            zbmName: zbm?.name || '',
        },
    });
    res.status(201).json(agent);
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
    res.status(201).json(visit);
});
// ─── POST /tdr/float-issues ───────────────────────────────────────────────────
const floatIssueSchema = zod_1.z.object({
    agentCode: zod_1.z.string().min(1),
    agentName: zod_1.z.string().min(1),
    contactPhone: zod_1.z.string().min(1),
    issueType: zod_1.z.enum(['low_float', 'stuck_transaction', 'system_error', 'other']),
    reportedFloat: zod_1.z.number().default(0),
    description: zod_1.z.string().min(1),
});
exports.tdrRouter.post('/float-issues', async (req, res) => {
    const parsed = floatIssueSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
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
});
exports.tdrRouter.post('/prospects', async (req, res) => {
    const parsed = prospectSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
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
});
// ─── GET /tdr/prospects ───────────────────────────────────────────────────────
exports.tdrRouter.get('/prospects', async (req, res) => {
    const prospects = await prisma_1.prisma.prospect.findMany({
        where: { tdrId: req.user.userId },
        orderBy: { createdAt: 'desc' },
    });
    res.json(prospects);
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
//# sourceMappingURL=tdr.js.map