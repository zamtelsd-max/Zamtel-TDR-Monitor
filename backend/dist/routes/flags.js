"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flagsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const mtd_1 = require("../utils/mtd");
exports.flagsRouter = (0, express_1.Router)();
exports.flagsRouter.use((0, auth_1.requireAuth)('HSD', 'ZBM', 'ASE'));
exports.flagsRouter.use(rateLimit_1.apiRateLimit);
// ─── GET /flags — red-flagged TDRs based on caller's scope ───────────────────
exports.flagsRouter.get('/', async (req, res) => {
    try {
        const role = req.user.role;
        const zone = req.user.zone;
        const userId = req.user.userId;
        // Scope: ASE sees only their TDRs; ZBM sees their zone; HSD sees all
        const where = { role: 'TDR', active: true };
        if (role === 'ASE') {
            where.aseId = userId;
        }
        else if (role === 'ZBM' && zone) {
            where.zone = zone;
        }
        const tdrs = await prisma_1.prisma.users.findMany({ where, select: { id: true, name: true, zone: true, aseId: true } });
        const now = new Date();
        const { start: mtdStart, end: mtdEnd } = (0, mtd_1.mtdRange)();
        // Today window
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        // Week window (Mon–today)
        const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        const flagged = [];
        for (const tdr of tdrs) {
            const [dailyAgents, dailyMerchants, dailyVisits, weeklyAgents, weeklyMerchants, weeklyVisits, mtdAgents, mtdMerchants, mtdVisits] = await Promise.all([
                prisma_1.prisma.agents.count({ where: { tdrId: tdr.id, type: 'normal', createdAt: { gte: todayStart, lte: todayEnd } } }),
                prisma_1.prisma.agents.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: todayStart, lte: todayEnd } } }),
                prisma_1.prisma.visits.count({ where: { tdrId: tdr.id, createdAt: { gte: todayStart, lte: todayEnd } } }),
                prisma_1.prisma.agents.count({ where: { tdrId: tdr.id, type: 'normal', createdAt: { gte: weekStart, lte: todayEnd } } }),
                prisma_1.prisma.agents.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: weekStart, lte: todayEnd } } }),
                prisma_1.prisma.visits.count({ where: { tdrId: tdr.id, createdAt: { gte: weekStart, lte: todayEnd } } }),
                prisma_1.prisma.agents.count({ where: { tdrId: tdr.id, type: 'normal', createdAt: { gte: mtdStart, lte: mtdEnd } } }),
                prisma_1.prisma.agents.count({ where: { tdrId: tdr.id, type: 'merchant', createdAt: { gte: mtdStart, lte: mtdEnd } } }),
                prisma_1.prisma.visits.count({ where: { tdrId: tdr.id, createdAt: { gte: mtdStart, lte: mtdEnd } } }),
            ]);
            const dailyVisitTarget = 20;
            const mtdAgentTarget = (0, mtd_1.prorateMtdTarget)(96);
            const mtdMerchantTarget = (0, mtd_1.prorateMtdTarget)(96);
            const mtdVisitTarget = (0, mtd_1.visitMtdTarget)();
            const flags = [];
            // Daily flags
            if (dailyVisits < dailyVisitTarget * 0.5)
                flags.push('⚠ Daily visits < 50% target');
            if (dailyAgents + dailyMerchants === 0 && (0, mtd_1.workingDaysElapsed)() >= 5)
                flags.push('⚠ No registrations today');
            // Weekly flags — if more than 3 working days elapsed
            const daysElapsed = (0, mtd_1.workingDaysElapsed)();
            if (daysElapsed >= 3) {
                const weekDays = Math.min(dayOfWeek + 1, daysElapsed);
                const weekAgentTarget = Math.round(96 / 26 * weekDays); // ~3.7/day
                const weekMerchantTarget = Math.round(96 / 26 * weekDays);
                if (weeklyAgents < weekAgentTarget * 0.5)
                    flags.push('⚠ Weekly agents < 50% pace');
                if (weeklyMerchants < weekMerchantTarget * 0.5)
                    flags.push('⚠ Weekly merchants < 50% pace');
            }
            // MTD flags
            if (mtdAgents < mtdAgentTarget * 0.5)
                flags.push('🔴 MTD agents critically behind');
            if (mtdMerchants < mtdMerchantTarget * 0.5)
                flags.push('🔴 MTD merchants critically behind');
            if (mtdVisits < mtdVisitTarget * 0.5)
                flags.push('🔴 MTD visits critically behind');
            if (flags.length > 0) {
                const critical = flags.some(f => f.startsWith('🔴'));
                flagged.push({
                    tdrId: tdr.id,
                    tdrName: tdr.name,
                    zone: tdr.zone,
                    aseId: tdr.aseId,
                    flags,
                    severity: critical ? 'critical' : 'warning',
                    daily: { agents: dailyAgents, merchants: dailyMerchants, visits: dailyVisits, target: dailyVisitTarget },
                    weekly: { agents: weeklyAgents, merchants: weeklyMerchants, visits: weeklyVisits },
                    mtd: { agents: mtdAgents, agentTarget: mtdAgentTarget, merchants: mtdMerchants, merchantTarget: mtdMerchantTarget, visits: mtdVisits, visitTarget: mtdVisitTarget },
                });
            }
        }
        // Sort: critical first, then by number of flags
        flagged.sort((a, b) => {
            if (a.severity === 'critical' && b.severity !== 'critical')
                return -1;
            if (b.severity === 'critical' && a.severity !== 'critical')
                return 1;
            return b.flags.length - a.flags.length;
        });
        res.json({ success: true, total: flagged.length, data: flagged });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to compute flags' });
    }
});
//# sourceMappingURL=flags.js.map