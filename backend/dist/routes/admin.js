"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
exports.adminRouter = (0, express_1.Router)();
// Admin routes only accessible in non-production or with HSD role
exports.adminRouter.use((0, auth_1.requireAuth)('HSD'));
// ─── POST /admin/migrate-from-sheets ─────────────────────────────────────────
// Accepts a JSON body with rows exported from the Google Sheet CSV
// Expected format: { agents: Array, visits: Array }
exports.adminRouter.post('/migrate-from-sheets', async (req, res) => {
    const { agents = [], visits = [] } = req.body;
    let agentCount = 0;
    let visitCount = 0;
    const errors = [];
    // Migrate agents
    for (const row of agents) {
        try {
            const zbm = await prisma_1.prisma.user.findFirst({ where: { role: 'ZBM', zone: row.zone || '' } });
            await prisma_1.prisma.agent.upsert({
                where: { agentCode: row.agentCode || `MIGRATED-${Date.now()}-${agentCount}` },
                update: {},
                create: {
                    agentName: row.agentName || row.businessName || 'Unknown',
                    agentCode: row.agentCode || `MIGRATED-${Date.now()}-${agentCount}`,
                    contactPhone: row.contactPhone || row.phone || '',
                    type: row.type || 'normal',
                    merchantCategory: row.merchantCategory || undefined,
                    initialFloat: parseFloat(row.initialFloat || '0') || 0,
                    town: row.town || '',
                    address: row.address || undefined,
                    cluster: row.cluster || undefined,
                    market: row.market || undefined,
                    tdrId: row.tdrId || 'tdr-001',
                    tdrName: row.tdrName || '',
                    zone: row.zone || '',
                    zbmName: zbm?.name || '',
                    notes: row.notes || undefined,
                },
            });
            agentCount++;
        }
        catch (e) {
            errors.push(`Agent ${row.agentCode}: ${e.message}`);
        }
    }
    // Migrate visits
    for (const row of visits) {
        try {
            const zbm = await prisma_1.prisma.user.findFirst({ where: { role: 'ZBM', zone: row.zone || '' } });
            await prisma_1.prisma.visit.create({
                data: {
                    outletName: row.outletName || row.agentName || 'Unknown',
                    agentCode: row.agentCode || '',
                    contactPhone: row.contactPhone || '',
                    town: row.town || '',
                    cluster: row.cluster || undefined,
                    market: row.market || undefined,
                    floatAmount: parseFloat(row.floatAmount || '0') || 0,
                    tdrId: row.tdrId || 'tdr-001',
                    tdrName: row.tdrName || '',
                    zone: row.zone || '',
                    zbmName: zbm?.name || '',
                    notes: row.notes || undefined,
                },
            });
            visitCount++;
        }
        catch (e) {
            errors.push(`Visit ${row.agentCode}: ${e.message}`);
        }
    }
    res.json({
        message: 'Migration complete',
        agentCount,
        visitCount,
        errors: errors.slice(0, 50), // cap error list
    });
});
// ─── GET /admin/users ─────────────────────────────────────────────────────────
exports.adminRouter.get('/users', async (_req, res) => {
    const users = await prisma_1.prisma.user.findMany({
        select: { id: true, name: true, role: true, zone: true, active: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });
    res.json(users);
});
//# sourceMappingURL=admin.js.map