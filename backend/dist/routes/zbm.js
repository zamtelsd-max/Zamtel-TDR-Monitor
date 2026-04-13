"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zbmRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
exports.zbmRouter = (0, express_1.Router)();
exports.zbmRouter.use((0, auth_1.requireAuth)('ZBM'));
exports.zbmRouter.use(rateLimit_1.apiRateLimit);
function currentMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}
// ─── GET /zbm/dashboard ───────────────────────────────────────────────────────
exports.zbmRouter.get('/dashboard', async (req, res) => {
    const zone = req.user.zone;
    const { start, end } = currentMonthRange();
    // All TDRs in this zone
    const tdrs = await prisma_1.prisma.user.findMany({ where: { role: 'TDR', zone, active: true } });
    // Per-TDR stats
    const tdrStats = await Promise.all(tdrs.map(async (tdr) => {
        const [agents, merchants, visits, floatIssues] = await Promise.all([
            prisma_1.prisma.agent.count({ where: { tdrId: tdr.id, type: 'normal', createdAt: { gte: start, lte: end } } }),
            prisma_1.prisma.agent.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: start, lte: end } } }),
            prisma_1.prisma.visit.count({ where: { tdrId: tdr.id, createdAt: { gte: start, lte: end } } }),
            prisma_1.prisma.floatIssue.count({ where: { tdrId: tdr.id, status: { not: 'resolved' } } }),
        ]);
        const agentTarget = 96;
        const merchantTarget = 96;
        const visitTarget = 20;
        const pct = Math.round(((agents / agentTarget) + (merchants / merchantTarget) + (visits / visitTarget)) / 3 * 100);
        return { tdr, agents, merchants, visits, floatIssues, pct };
    }));
    // Zone totals
    const [totalAgents, totalMerchants, totalVisits, floatIssuesPending, prospects] = await Promise.all([
        prisma_1.prisma.agent.count({ where: { zone, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.count({ where: { zone, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.count({ where: { zone, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.count({ where: { zone, status: { not: 'resolved' } } }),
        prisma_1.prisma.prospect.groupBy({
            by: ['status'],
            where: { zone },
            _count: true,
        }),
    ]);
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const target = await prisma_1.prisma.salesTarget.findUnique({ where: { zone_period: { zone, period } } });
    res.json({
        zbm: { id: req.user.userId, name: req.user.name, zone },
        month: period,
        zone: {
            totals: { agents: totalAgents, merchants: totalMerchants, visits: totalVisits, floatIssuesPending },
            targets: {
                agents: target?.targetAgents || 96 * tdrs.length,
                merchants: target?.targetMerchants || 96 * tdrs.length,
                visits: target?.targetOutlets || 20 * tdrs.length,
            },
        },
        tdrStats,
        prospectsBreakdown: prospects,
    });
});
// ─── GET /zbm/tdr/:tdrId ──────────────────────────────────────────────────────
exports.zbmRouter.get('/tdr/:tdrId', async (req, res) => {
    const zone = req.user.zone;
    const tdrId = req.params.tdrId;
    const tdr = await prisma_1.prisma.user.findFirst({ where: { id: tdrId, zone, role: 'TDR' } });
    if (!tdr) {
        res.status(404).json({ error: 'TDR not found in your zone' });
        return;
    }
    const { start, end } = currentMonthRange();
    const [agents, visits, floatIssues, prospects] = await Promise.all([
        prisma_1.prisma.agent.findMany({ where: { tdrId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
        prisma_1.prisma.visit.findMany({ where: { tdrId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
        prisma_1.prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
        prisma_1.prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({ tdr, agents, visits, floatIssues, prospects });
});
// ─── GET /zbm/float-issues ────────────────────────────────────────────────────
exports.zbmRouter.get('/float-issues', async (req, res) => {
    const issues = await prisma_1.prisma.floatIssue.findMany({
        where: { zone: req.user.zone },
        orderBy: { reportedAt: 'desc' },
    });
    res.json(issues);
});
// ─── PATCH /zbm/float-issues/:id ──────────────────────────────────────────────
exports.zbmRouter.patch('/float-issues/:id', async (req, res) => {
    const issue = await prisma_1.prisma.floatIssue.findUnique({ where: { id: req.params.id } });
    if (!issue || issue.zone !== req.user.zone) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const { status, resolutionNotes } = req.body;
    const resolvedAt = status === 'resolved' ? new Date() : undefined;
    const updated = await prisma_1.prisma.floatIssue.update({
        where: { id: req.params.id },
        data: {
            status: status || undefined,
            resolutionNotes: resolutionNotes || undefined,
            resolvedAt: resolvedAt,
            resolvedBy: status === 'resolved' ? req.user.name : undefined,
        },
    });
    res.json(updated);
});
// ─── GET /zbm/prospects ───────────────────────────────────────────────────────
exports.zbmRouter.get('/prospects', async (req, res) => {
    const prospects = await prisma_1.prisma.prospect.findMany({
        where: { zone: req.user.zone },
        orderBy: { createdAt: 'desc' },
    });
    res.json(prospects);
});
//# sourceMappingURL=zbm.js.map