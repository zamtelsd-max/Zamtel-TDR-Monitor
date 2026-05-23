"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ssoOdrRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const mtd_1 = require("../utils/mtd");
exports.ssoOdrRouter = (0, express_1.Router)();
exports.ssoOdrRouter.use((0, auth_1.requireAuth)('TDR', 'ASE', 'ZBM', 'HSD'));
exports.ssoOdrRouter.use(rateLimit_1.apiRateLimit);
function zoneFilter(req) {
    const role = req.user.role;
    if (role === 'HSD')
        return req.query.zone || null;
    return req.user.zone || null;
}
// GET /sso-odr/summary
exports.ssoOdrRouter.get('/summary', async (req, res) => {
    try {
        const zone = zoneFilter(req);
        const role = req.user.role;
        const { start, end } = (0, mtd_1.mtdRange)();
        const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const tdrId = role === 'TDR' ? req.user.userId : undefined;
        const aseId = role === 'ASE' ? req.user.userId : undefined;
        const baseWhere = { active: true, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}), ...(aseId ? { aseId } : {}) };
        const mtdWhere = { ...baseWhere, createdAt: { gte: start, lte: end } };
        const [totalSso, totalOdr, mtdSso, mtdOdr] = await Promise.all([
            prisma_1.prisma.ssoOutlet.count({ where: baseWhere }),
            prisma_1.prisma.odrOutlet.count({ where: baseWhere }),
            prisma_1.prisma.ssoOutlet.count({ where: mtdWhere }),
            prisma_1.prisma.odrOutlet.count({ where: mtdWhere }),
        ]);
        let targetSso = 0, targetOdr = 0;
        if (zone && ['ZBM', 'HSD', 'ASE'].includes(role)) {
            const t = await prisma_1.prisma.ssoOdrTarget.findUnique({ where: { zone_period: { zone, period } } });
            targetSso = t?.targetSso ?? 0;
            targetOdr = t?.targetOdr ?? 0;
        }
        res.json({ success: true, data: { totalSso, totalOdr, mtdSso, mtdOdr, targetSso, targetOdr } });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load summary' });
    }
});
// GET /sso-odr/sso
exports.ssoOdrRouter.get('/sso', async (req, res) => {
    try {
        const zone = zoneFilter(req);
        const role = req.user.role;
        const tdrId = role === 'TDR' ? req.user.userId : undefined;
        const aseId = role === 'ASE' ? req.user.userId : undefined;
        const data = await prisma_1.prisma.ssoOutlet.findMany({
            where: { active: true, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}), ...(aseId ? { aseId } : {}) },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// POST /sso-odr/sso
exports.ssoOdrRouter.post('/sso', async (req, res) => {
    try {
        const role = req.user.role;
        if (!['TDR', 'ASE'].includes(role)) {
            res.status(403).json({ error: 'TDR or ASE only' });
            return;
        }
        const { outletName, ownerName, contactPhone, town, address, cluster, deviceType, msisdn, simSerial, imei, notes, latitude, longitude } = req.body;
        if (!outletName || !ownerName || !contactPhone || !town) {
            res.status(400).json({ error: 'Required fields missing' });
            return;
        }
        const outlet = await prisma_1.prisma.ssoOutlet.create({ data: {
                tdrId: req.user.userId, tdrName: req.user.name, zone: req.user.zone || '',
                aseId: role === 'ASE' ? req.user.userId : null,
                aseName: role === 'ASE' ? req.user.name : null,
                outletName, ownerName, contactPhone, town, address, cluster,
                deviceType: deviceType || 'SSO', msisdn, simSerial, imei, notes,
                latitude: latitude != null ? Number(latitude) : null,
                longitude: longitude != null ? Number(longitude) : null,
            } });
        res.status(201).json({ success: true, data: outlet });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// GET /sso-odr/odr
exports.ssoOdrRouter.get('/odr', async (req, res) => {
    try {
        const zone = zoneFilter(req);
        const role = req.user.role;
        const tdrId = role === 'TDR' ? req.user.userId : undefined;
        const aseId = role === 'ASE' ? req.user.userId : undefined;
        const data = await prisma_1.prisma.odrOutlet.findMany({
            where: { active: true, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}), ...(aseId ? { aseId } : {}) },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// POST /sso-odr/odr
exports.ssoOdrRouter.post('/odr', async (req, res) => {
    try {
        const role = req.user.role;
        if (!['TDR', 'ASE'].includes(role)) {
            res.status(403).json({ error: 'TDR or ASE only' });
            return;
        }
        const { outletName, ownerName, contactPhone, town, address, cluster, deviceType, msisdn, simSerial, imei, notes, latitude, longitude } = req.body;
        if (!outletName || !ownerName || !contactPhone || !town) {
            res.status(400).json({ error: 'Required fields missing' });
            return;
        }
        const outlet = await prisma_1.prisma.odrOutlet.create({ data: {
                tdrId: req.user.userId, tdrName: req.user.name, zone: req.user.zone || '',
                aseId: role === 'ASE' ? req.user.userId : null,
                aseName: role === 'ASE' ? req.user.name : null,
                outletName, ownerName, contactPhone, town, address, cluster,
                deviceType: deviceType || 'Zamtel', msisdn, simSerial, imei, notes,
                latitude: latitude != null ? Number(latitude) : null,
                longitude: longitude != null ? Number(longitude) : null,
            } });
        res.status(201).json({ success: true, data: outlet });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// DELETE /sso-odr/sso/:id — MUST be after static routes
exports.ssoOdrRouter.delete('/sso/:id', async (req, res) => {
    try {
        const outlet = await prisma_1.prisma.ssoOutlet.findUnique({ where: { id: req.params.id } });
        if (!outlet) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        if (req.user.role === 'TDR' && outlet.tdrId !== req.user.userId) {
            res.status(403).json({ error: 'Not your outlet' });
            return;
        }
        await prisma_1.prisma.ssoOutlet.update({ where: { id: req.params.id }, data: { active: false } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// DELETE /sso-odr/odr/:id
exports.ssoOdrRouter.delete('/odr/:id', async (req, res) => {
    try {
        const outlet = await prisma_1.prisma.odrOutlet.findUnique({ where: { id: req.params.id } });
        if (!outlet) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        if (req.user.role === 'TDR' && outlet.tdrId !== req.user.userId) {
            res.status(403).json({ error: 'Not your outlet' });
            return;
        }
        await prisma_1.prisma.odrOutlet.update({ where: { id: req.params.id }, data: { active: false } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// GET /sso-odr/targets
exports.ssoOdrRouter.get('/targets', async (req, res) => {
    try {
        const zone = zoneFilter(req);
        const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        if (!zone) {
            res.json({ success: true, data: null });
            return;
        }
        const target = await prisma_1.prisma.ssoOdrTarget.findUnique({ where: { zone_period: { zone, period } } });
        res.json({ success: true, data: target });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// POST /sso-odr/targets — ZBM/HSD sets targets
exports.ssoOdrRouter.post('/targets', async (req, res) => {
    try {
        if (!['ZBM', 'HSD'].includes(req.user.role)) {
            res.status(403).json({ error: 'ZBM or HSD only' });
            return;
        }
        const zone = req.user.role === 'ZBM' ? (req.user.zone || '') : (req.body.zone || '');
        const period = req.body.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const { targetSso, targetOdr } = req.body;
        if (!zone) {
            res.status(400).json({ error: 'zone required' });
            return;
        }
        const target = await prisma_1.prisma.ssoOdrTarget.upsert({
            where: { zone_period: { zone, period } },
            create: { zone, period, targetSso: Number(targetSso) || 10, targetOdr: Number(targetOdr) || 10, setByZbmId: req.user.userId },
            update: { targetSso: Number(targetSso) || 10, targetOdr: Number(targetOdr) || 10 },
        });
        res.json({ success: true, data: target });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// GET /sso-odr/map
exports.ssoOdrRouter.get('/map', async (req, res) => {
    try {
        const zone = zoneFilter(req);
        const role = req.user.role;
        const tdrId = role === 'TDR' ? req.user.userId : undefined;
        const where = { active: true, latitude: { not: null }, longitude: { not: null }, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}) };
        const [sso, odr] = await Promise.all([
            prisma_1.prisma.ssoOutlet.findMany({ where, take: 500 }),
            prisma_1.prisma.odrOutlet.findMany({ where, take: 500 }),
        ]);
        res.json({ success: true, data: { sso, odr } });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
//# sourceMappingURL=ssoOdr.js.map