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
exports.adminRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
exports.adminRouter = (0, express_1.Router)();
// Admin routes accessible to HSD (full) and ZBM (zone-scoped add TDR)
exports.adminRouter.use((0, auth_1.requireAuth)('HSD', 'ZBM'));
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
// ─── POST /admin/users — Create TDR/ZBM account ───────────────────────────────
exports.adminRouter.post('/users', async (req, res) => {
    try {
        const { id, name, role, zone, pin } = req.body;
        if (!id || !name || !pin) {
            res.status(400).json({ error: 'id, name, and pin are required' });
            return;
        }
        const bcrypt = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const pinHash = await bcrypt.hash(pin, 10);
        const existing = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (existing) {
            res.status(409).json({ error: `User ID "${id}" already exists` });
            return;
        }
        const user = await prisma_1.prisma.user.create({
            data: { id, name, role: role, zone: zone || null, pin: pinHash, active: true },
        });
        res.status(201).json({ id: user.id, name: user.name, role: user.role, zone: user.zone });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── PATCH /admin/users/:id/pin — Reset PIN ────────────────────────────────────
exports.adminRouter.patch('/users/:id/pin', async (req, res) => {
    try {
        const { pin } = req.body;
        if (!pin || !/^\d{4}$/.test(pin)) {
            res.status(400).json({ error: 'PIN must be exactly 4 digits' });
            return;
        }
        const bcrypt = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
        const pinHash = await bcrypt.hash(pin, 10);
        await prisma_1.prisma.user.update({ where: { id: req.params.id }, data: { pin: pinHash } });
        res.json({ success: true, message: `PIN reset for ${req.params.id}` });
    }
    catch {
        res.status(500).json({ error: 'Failed to reset PIN' });
    }
});
// ─── DELETE /admin/users/:id — Delete user ─────────────────────────────────────
exports.adminRouter.delete('/users/:id', async (req, res) => {
    try {
        const requester = req.user;
        if (req.params.id === requester.userId) {
            res.status(400).json({ error: 'Cannot delete yourself' });
            return;
        }
        await prisma_1.prisma.user.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'User not found or could not be deleted' });
    }
});
// ─── GET /admin/zones — List all zones ────────────────────────────────────────
exports.adminRouter.get('/zones', async (_req, res) => {
    try {
        // Return distinct zones from agents + users tables
        const [agentZones, userZones] = await Promise.all([
            prisma_1.prisma.agent.findMany({ select: { zone: true }, distinct: ['zone'] }),
            prisma_1.prisma.user.findMany({ where: { zone: { not: null } }, select: { zone: true }, distinct: ['zone'] }),
        ]);
        const all = [...new Set([
                ...agentZones.map(a => a.zone).filter(Boolean),
                ...userZones.map(u => u.zone).filter(Boolean),
                // Always include Zambia's 10 provinces as baseline
                'Copperbelt', 'Lusaka', 'Northern', 'Southern', 'Eastern',
                'Western', 'Luapula', 'Muchinga', 'North-Western', 'Central',
            ])];
        all.sort();
        res.json(all);
    }
    catch {
        res.status(500).json({ error: 'Failed to list zones' });
    }
});
// ─── POST /admin/zones — Add a custom zone (HSD only) ─────────────────────────
exports.adminRouter.post('/zones', async (req, res) => {
    const requester = req.user;
    if (requester.role !== 'HSD') {
        res.status(403).json({ error: 'Only HSD can add zones' });
        return;
    }
    const { name } = req.body;
    if (!name?.trim()) {
        res.status(400).json({ error: 'Zone name is required' });
        return;
    }
    // Zones are stored implicitly via users/agents; we just confirm and echo back
    res.status(201).json({ name: name.trim(), message: `Zone "${name.trim()}" registered. Assign TDRs/ZBMs to activate it.` });
});
// ─── PATCH /admin/users/:id — Update user profile (name, zone, role, active) ──
exports.adminRouter.patch('/users/:id', async (req, res) => {
    try {
        const { name, zone, role, active } = req.body;
        const requester = req.user;
        // ZBM can only update TDRs in their own zone
        if (requester.role === 'ZBM') {
            const target = await prisma_1.prisma.user.findUnique({ where: { id: req.params.id } });
            if (!target || target.role !== 'TDR' || target.zone !== requester.zone) {
                res.status(403).json({ error: 'ZBM can only update TDRs in their own zone' });
                return;
            }
        }
        const updated = await prisma_1.prisma.user.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(zone !== undefined && { zone }),
                ...(role !== undefined && { role: role }),
                ...(active !== undefined && { active }),
            },
            select: { id: true, name: true, role: true, zone: true, active: true },
        });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── DELETE /admin/zones/:name — Remove a zone (HSD only) ─────────────────────
exports.adminRouter.delete('/zones/:name', async (req, res) => {
    const requester = req.user;
    if (requester.role !== 'HSD') {
        res.status(403).json({ error: 'Only HSD can delete zones' });
        return;
    }
    const zoneName = decodeURIComponent(req.params.name);
    // Check if zone has active users
    const activeUsers = await prisma_1.prisma.user.count({ where: { zone: zoneName, active: true } });
    if (activeUsers > 0) {
        res.status(400).json({ error: `Zone has ${activeUsers} active user(s). Reassign them first.` });
        return;
    }
    res.json({ success: true, message: `Zone "${zoneName}" removed from registry` });
});
//# sourceMappingURL=admin.js.map