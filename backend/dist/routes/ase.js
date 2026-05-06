"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aseRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const mtd_1 = require("../utils/mtd");
exports.aseRouter = (0, express_1.Router)();
exports.aseRouter.use((0, auth_1.requireAuth)('ASE'));
exports.aseRouter.use(rateLimit_1.apiRateLimit);
// ─── GET /ase/dashboard ───────────────────────────────────────────────────────
exports.aseRouter.get('/dashboard', async (req, res) => {
    try {
        // Find TDRs assigned to this ASE
        const tdrs = await prisma_1.prisma.user.findMany({
            where: { aseId: req.user.userId, role: 'TDR', active: true },
        });
        const tdrIds = tdrs.map(t => t.id);
        // Get counts for each TDR
        const [agents, visits, floatIssues, prospects] = await Promise.all([
            prisma_1.prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds } }, _count: true }),
            prisma_1.prisma.visit.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds } }, _count: true }),
            prisma_1.prisma.floatIssue.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, status: { not: 'resolved' } }, _count: true }),
            prisma_1.prisma.prospect.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds } }, _count: true }),
        ]);
        const tdrStats = tdrs.map(tdr => ({
            tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone },
            agents: agents.find(a => a.tdrId === tdr.id)?._count ?? 0,
            visits: visits.find(v => v.tdrId === tdr.id)?._count ?? 0,
            floatIssues: floatIssues.find(f => f.tdrId === tdr.id)?._count ?? 0,
            prospects: prospects.find(p => p.tdrId === tdr.id)?._count ?? 0,
        }));
        // Team totals + prorated targets
        const tdrCount = tdrs.length;
        const agentTarget = (0, mtd_1.prorateMtdTarget)(96) * tdrCount;
        const merchantTarget = (0, mtd_1.prorateMtdTarget)(96) * tdrCount;
        const visitTarget = (0, mtd_1.visitMtdTarget)() * tdrCount;
        const teamAgents = tdrStats.reduce((s, t) => s + t.agents, 0);
        const teamVisits = tdrStats.reduce((s, t) => s + t.visits, 0);
        const teamFloat = tdrStats.reduce((s, t) => s + t.floatIssues, 0);
        res.json({
            ase: { id: req.user.userId, name: req.user.name },
            tdrStats,
            team: {
                totals: { agents: teamAgents, visits: teamVisits, floatIssues: teamFloat },
                targets: { agents: agentTarget, merchants: merchantTarget, visits: visitTarget },
            },
            mtd: { workingDaysElapsed: (0, mtd_1.workingDaysElapsed)(), workingDaysTotal: (0, mtd_1.workingDaysThisMonth)() },
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load ASE dashboard' });
    }
});
// ─── GET /ase/tdr/:id ─────────────────────────────────────────────────────────
exports.aseRouter.get('/tdr/:id', async (req, res) => {
    try {
        // Verify this TDR is assigned to the ASE
        const tdr = await prisma_1.prisma.user.findFirst({
            where: { id: req.params.id, aseId: req.user.userId, role: 'TDR' },
        });
        if (!tdr) {
            res.status(403).json({ error: 'TDR not assigned to you' });
            return;
        }
        const [agents, visits, floatIssues, prospects] = await Promise.all([
            prisma_1.prisma.agent.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
            prisma_1.prisma.visit.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
            prisma_1.prisma.floatIssue.findMany({ where: { tdrId: tdr.id }, orderBy: { reportedAt: 'desc' }, take: 20 }),
            prisma_1.prisma.prospect.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
        ]);
        res.json({ tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone }, agents, visits, floatIssues, prospects });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load TDR data' });
    }
});
// ─── GET /ase/available-tdrs — TDRs in same zone not yet assigned to another ASE ──
exports.aseRouter.get('/available-tdrs', async (req, res) => {
    try {
        const aseId = req.user.userId;
        const zone = req.user.zone;
        const tdrs = await prisma_1.prisma.user.findMany({
            where: {
                role: 'TDR',
                active: true,
                ...(zone ? { zone } : {}),
                OR: [{ aseId: null }, { aseId: aseId }],
            },
            select: { id: true, name: true, zone: true, aseId: true },
            orderBy: { name: 'asc' },
        });
        const result = tdrs.map(t => ({ ...t, mine: t.aseId === aseId }));
        res.json({ success: true, data: result });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load available TDRs' });
    }
});
// ─── POST /ase/pick-tdr — ASE picks a TDR ────────────────────────────────────
exports.aseRouter.post('/pick-tdr', async (req, res) => {
    try {
        const aseId = req.user.userId;
        const { tdrId } = req.body;
        if (!tdrId) {
            res.status(400).json({ error: 'tdrId required' });
            return;
        }
        const tdr = await prisma_1.prisma.user.findUnique({ where: { id: tdrId } });
        if (!tdr) {
            res.status(404).json({ error: 'TDR not found' });
            return;
        }
        if (tdr.aseId && tdr.aseId !== aseId) {
            res.status(409).json({ error: 'TDR already assigned to another ASE' });
            return;
        }
        await prisma_1.prisma.user.update({ where: { id: tdrId }, data: { aseId } });
        res.json({ success: true, message: 'TDR assigned to you' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to pick TDR' });
    }
});
// ─── DELETE /ase/pick-tdr/:tdrId — ASE releases a TDR ────────────────────────
exports.aseRouter.delete('/pick-tdr/:tdrId', async (req, res) => {
    try {
        const aseId = req.user.userId;
        const tdr = await prisma_1.prisma.user.findUnique({ where: { id: req.params.tdrId } });
        if (!tdr || tdr.aseId !== aseId) {
            res.status(403).json({ error: 'Not authorized' });
            return;
        }
        await prisma_1.prisma.user.update({ where: { id: req.params.tdrId }, data: { aseId: null } });
        res.json({ success: true, message: 'TDR released' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to release TDR' });
    }
});
//# sourceMappingURL=ase.js.map