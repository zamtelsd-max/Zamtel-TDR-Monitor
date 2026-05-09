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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.zbmRouter = void 0;
const express_1 = require("express");
const responseCache_1 = require("../middleware/responseCache");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const mtd_1 = require("../utils/mtd");
exports.zbmRouter = (0, express_1.Router)();
exports.zbmRouter.use((0, auth_1.requireAuth)('ZBM', 'HSD'));
exports.zbmRouter.use(rateLimit_1.apiRateLimit);
// Helper: resolve zone for a request.
// ZBM → always their own zone (from JWT).
// HSD → can pass ?zone=Copperbelt to drill into any zone; omit for all-zones (null).
function resolveZone(req) {
    if (req.user.role === 'HSD') {
        return req.query.zone || null; // null = all zones
    }
    return req.user.zone || null;
}
// ─── GET /zbm/dashboard ───────────────────────────────────────────────────────
exports.zbmRouter.get('/dashboard', (0, responseCache_1.responseCache)(30), async (req, res) => {
    const zone = resolveZone(req); // HSD can pass ?zone=; ZBM always sees own zone
    const { start, end } = (0, mtd_1.mtdRange)();
    // All TDRs in this zone (or all if zone is null)
    const tdrs = await prisma_1.prisma.user.findMany({
        where: { role: 'TDR', active: true, ...(zone ? { zone } : {}) },
    });
    const tdrIds = tdrs.map(t => t.id);
    // ── Batched groupBy — 5 queries instead of 5×N ──────────────────────────
    const [agentsByTdr, merchantsByTdr, visitsByTdr, floatsByTdr, reactivationsByTdr] = await Promise.all([
        prisma_1.prisma.agent.groupBy({
            by: ['tdrId'], _count: true,
            where: { tdrId: { in: tdrIds }, type: 'normal', createdAt: { gte: start, lte: end } },
        }),
        prisma_1.prisma.agent.groupBy({
            by: ['tdrId'], _count: true,
            where: { tdrId: { in: tdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } },
        }),
        prisma_1.prisma.visit.groupBy({
            by: ['tdrId'], _count: true,
            where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } },
        }),
        prisma_1.prisma.floatIssue.groupBy({
            by: ['tdrId'], _count: true,
            where: { tdrId: { in: tdrIds }, status: { not: 'resolved' } },
        }),
        prisma_1.prisma.reactivation.groupBy({
            by: ['tdrId'], _count: true,
            where: { tdrId: { in: tdrIds }, createdAt: { gte: start, lte: end } },
        }),
    ]);
    const agentMap = Object.fromEntries(agentsByTdr.map((r) => [r.tdrId, r._count]));
    const merchantMap = Object.fromEntries(merchantsByTdr.map((r) => [r.tdrId, r._count]));
    const visitMap = Object.fromEntries(visitsByTdr.map((r) => [r.tdrId, r._count]));
    const floatMap = Object.fromEntries(floatsByTdr.map((r) => [r.tdrId, r._count]));
    const reactivationMap = Object.fromEntries(reactivationsByTdr.map((r) => [r.tdrId, r._count]));
    const agentTarget = (0, mtd_1.prorateMtdTarget)(96);
    const merchantTarget = (0, mtd_1.prorateMtdTarget)(96);
    const visitTarget = (0, mtd_1.visitMtdTarget)();
    const tdrStats = tdrs.map(tdr => {
        const agents = agentMap[tdr.id] || 0;
        const merchants = merchantMap[tdr.id] || 0;
        const visits = visitMap[tdr.id] || 0;
        const floatIssues = floatMap[tdr.id] || 0;
        const reactivations = reactivationMap[tdr.id] || 0;
        const pct = Math.round(((agents / agentTarget) + (merchants / merchantTarget) + (visits / visitTarget)) / 3 * 100);
        return { tdr, agents, merchants, visits, floatIssues, reactivations, pct };
    });
    const zoneWhere = zone ? { zone } : {};
    // Zone totals
    const [totalAgents, totalMerchants, totalVisits, floatIssuesPending, prospects, totalReactivations] = await Promise.all([
        prisma_1.prisma.agent.count({ where: { ...zoneWhere, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.count({ where: { ...zoneWhere, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.count({ where: { ...zoneWhere, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.count({ where: { ...zoneWhere, status: { not: 'resolved' } } }),
        (zoneWhere.zone
            ? prisma_1.prisma.$queryRaw `SELECT status, COUNT(*)::int AS "_count" FROM prospects WHERE zone = ${zoneWhere.zone} GROUP BY status`.catch(() => [])
            : prisma_1.prisma.$queryRaw `SELECT status, COUNT(*)::int AS "_count" FROM prospects GROUP BY status`.catch(() => [])),
        prisma_1.prisma.reactivation.count({ where: { ...(zoneWhere.zone ? { zone: zoneWhere.zone } : {}), createdAt: { gte: start, lte: end } } }),
    ]);
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const target = zone
        ? await prisma_1.prisma.salesTarget.findUnique({ where: { zone_period: { zone, period } } })
        : null;
    res.json({
        zbm: { id: req.user.userId, name: req.user.name, zone },
        month: period,
        mtd: {
            workingDaysElapsed: (0, mtd_1.workingDaysElapsed)(),
            workingDaysTotal: (0, mtd_1.workingDaysThisMonth)(),
        },
        zone: {
            totals: { agents: totalAgents, merchants: totalMerchants, visits: totalVisits, floatIssuesPending, reactivations: totalReactivations },
            targets: {
                agents: (0, mtd_1.prorateMtdTarget)(target?.targetAgents || 96 * tdrs.length),
                merchants: (0, mtd_1.prorateMtdTarget)(target?.targetMerchants || 96 * tdrs.length),
                visits: (0, mtd_1.visitMtdTarget)() * tdrs.length,
            },
        },
        tdrStats,
        prospectsBreakdown: prospects,
    });
});
// ─── GET /zbm/tdr/:tdrId ──────────────────────────────────────────────────────
exports.zbmRouter.get('/tdr/:tdrId', async (req, res) => {
    const zone = resolveZone(req);
    const tdrId = req.params.tdrId;
    const tdr = await prisma_1.prisma.user.findFirst({ where: { id: tdrId, ...(zone ? { zone } : {}), role: 'TDR' } });
    if (!tdr) {
        res.status(404).json({ error: 'TDR not found' });
        return;
    }
    const { start, end } = (0, mtd_1.mtdRange)();
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
        where: { ...(resolveZone(req) ? { zone: resolveZone(req) } : {}) },
        orderBy: { reportedAt: 'desc' },
    });
    res.json(issues);
});
// ─── PATCH /zbm/float-issues/:id ──────────────────────────────────────────────
exports.zbmRouter.patch('/float-issues/:id', async (req, res) => {
    const issue = await prisma_1.prisma.floatIssue.findUnique({ where: { id: req.params.id } });
    if (!issue || (resolveZone(req) && issue.zone !== resolveZone(req))) {
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
        where: { ...(resolveZone(req) ? { zone: resolveZone(req) } : {}) },
        orderBy: { createdAt: 'desc' },
    });
    res.json(prospects);
});
// ─── GPS Map Data (ZBM — zone-scoped) ─────────────────────────────────────────
exports.zbmRouter.get('/map', (0, responseCache_1.responseCache)(45), async (req, res) => {
    try {
        const user = req.user;
        const zoneFilter = resolveZone(req);
        const [agents, visits] = await Promise.all([
            prisma_1.prisma.agent.findMany({
                where: {
                    ...(zoneFilter ? { zone: zoneFilter } : {}),
                    latitude: { not: null },
                    longitude: { not: null },
                },
                select: {
                    id: true, agentName: true, agentCode: true, type: true,
                    tdrName: true, zone: true, town: true, cluster: true,
                    latitude: true, longitude: true, initialFloat: true,
                    merchantCategory: true, createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 2000,
            }),
            prisma_1.prisma.visit.findMany({
                where: {
                    ...(zoneFilter ? { zone: zoneFilter } : {}),
                    latitude: { not: null },
                    longitude: { not: null },
                },
                select: {
                    id: true, outletName: true, agentCode: true,
                    tdrName: true, zone: true, town: true,
                    latitude: true, longitude: true, floatAmount: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 2000,
            }),
        ]);
        res.json({
            success: true,
            data: { agents, visits },
            summary: {
                totalAgents: agents.length,
                totalVisits: visits.length,
                zones: [zoneFilter].filter(Boolean),
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch map data' });
    }
});
// ─── GET /zbm/export  ─────────────────────────────────────────────────────────
// Zone-scoped Excel export. null zone (e.g. zbm-kuzanga) → all zones.
exports.zbmRouter.get('/export', async (req, res) => {
    try {
        const XLSX = await Promise.resolve().then(() => __importStar(require('xlsx')));
        const zone = resolveZone(req);
        const period = req.query.period ||
            `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const [y, m] = period.split('-').map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0, 23, 59, 59, 999);
        const zoneWhere = zone ? { zone } : {};
        const [agents, visits, floatIssues, prospects] = await Promise.all([
            prisma_1.prisma.agent.findMany({
                where: { ...zoneWhere, createdAt: { gte: start, lte: end } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.visit.findMany({
                where: { ...zoneWhere, createdAt: { gte: start, lte: end } },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.floatIssue.findMany({
                where: zoneWhere,
                orderBy: { reportedAt: 'desc' },
            }),
            prisma_1.prisma.prospect.findMany({
                where: zoneWhere,
                orderBy: { createdAt: 'desc' },
            }),
        ]);
        const wb = XLSX.utils.book_new();
        // Sheet 1: Agents
        const agentRows = agents.map(a => ({
            'TDR ID': a.tdrId, 'TDR Name': a.tdrName, 'Zone': a.zone, 'ZBM': a.zbmName,
            'Agent Name': a.agentName, 'Agent Code': a.agentCode, 'Phone': a.contactPhone,
            'Type': a.type, 'Category': a.merchantCategory || '',
            'Initial Float': a.initialFloat, 'Town': a.town, 'Address': a.address || '',
            'Cluster': a.cluster || '', 'Market': a.market || '',
            'Latitude': a.latitude || '', 'Longitude': a.longitude || '',
            'Notes': a.notes || '', 'Date': a.createdAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agentRows), 'Agents');
        // Sheet 2: Visits
        const visitRows = visits.map(v => ({
            'TDR ID': v.tdrId, 'TDR Name': v.tdrName, 'Zone': v.zone, 'ZBM': v.zbmName,
            'Outlet Name': v.outletName, 'Agent Code': v.agentCode, 'Phone': v.contactPhone,
            'Town': v.town, 'Cluster': v.cluster || '', 'Market': v.market || '',
            'Float Amount': v.floatAmount,
            'Latitude': v.latitude || '', 'Longitude': v.longitude || '',
            'Notes': v.notes || '', 'Date': v.createdAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitRows), 'Visits');
        // Sheet 3: Float Issues
        const issueRows = floatIssues.map(f => ({
            'TDR ID': f.tdrId, 'TDR Name': f.tdrName, 'Zone': f.zone,
            'Agent Code': f.agentCode, 'Agent Name': f.agentName, 'Phone': f.contactPhone,
            'Issue Type': f.issueType, 'Float Amount': f.reportedFloat,
            'Description': f.description, 'Status': f.status,
            'Resolved At': f.resolvedAt?.toISOString().split('T')[0] || '',
            'Resolved By': f.resolvedBy || '', 'Resolution Notes': f.resolutionNotes || '',
            'Reported At': f.reportedAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issueRows), 'Float Issues');
        // Sheet 4: Prospects
        const prospectRows = prospects.map(p => ({
            'TDR ID': p.tdrId, 'TDR Name': p.tdrName, 'Zone': p.zone,
            'Prospect Type': p.prospectType, 'Business Name': p.businessName,
            'Owner Name': p.ownerName, 'Phone': p.contactPhone,
            'Town': p.town, 'Address': p.address || '',
            'Category': p.merchantCategory || '', 'Est. Float': p.estimatedFloat || '',
            'Status': p.status,
            'Follow-up Date': p.followUpDate?.toISOString().split('T')[0] || '',
            'Converted At': p.convertedAt?.toISOString().split('T')[0] || '',
            'Notes': p.notes || '', 'Date': p.createdAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prospectRows), 'Prospects');
        // Sheet 5: Unvisited Outlets — batched (no N+1)
        const allAgentsForUnvisited = await prisma_1.prisma.agent.findMany({
            where: zoneWhere,
            orderBy: [{ zone: 'asc' }, { tdrName: 'asc' }, { agentName: 'asc' }],
        });
        const latestVisitsZone = await prisma_1.prisma.visit.groupBy({
            by: ['agentCode'],
            where: zoneWhere,
            _max: { createdAt: true },
        });
        const lastVisitMapZone = new Map();
        for (const v of latestVisitsZone) {
            if (v._max.createdAt)
                lastVisitMapZone.set(v.agentCode, v._max.createdAt);
        }
        const unvisitedRows = [];
        for (const a of allAgentsForUnvisited) {
            const lastVisitedAt = lastVisitMapZone.get(a.agentCode) ?? null;
            const daysAgo = lastVisitedAt
                ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
                : null;
            if (daysAgo === null || daysAgo >= 4) {
                unvisitedRows.push({
                    'Zone': a.zone, 'TDR Name': a.tdrName, 'Agent Name': a.agentName,
                    'Agent Code': a.agentCode, 'Type': a.type,
                    'Phone': a.contactPhone, 'Town': a.town,
                    'Cluster': a.cluster || '', 'Market': a.market || '',
                    'Last Visited': lastVisitedAt ? lastVisitedAt.toISOString().split('T')[0] : 'NEVER',
                    'Days Since Visit': daysAgo === null ? 'Never' : daysAgo,
                    'Status': daysAgo === null ? '🔴 Never Visited' : `🔴 ${daysAgo} days ago`,
                });
            }
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unvisitedRows.length > 0 ? unvisitedRows : [{ 'Status': 'All outlets visited within 4 days ✅' }]), 'Unvisited Outlets');
        // Sheet 6: TDR User IDs & Names (scoped to this zone)
        const zoneUsers = await prisma_1.prisma.user.findMany({
            where: zone ? { zone } : {},
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
        });
        const userRows = zoneUsers.map((u) => ({
            'User ID': u.id,
            'Full Name': u.name,
            'Role': u.role,
            'Zone': u.zone || '',
            'Active': u.active ? 'Yes' : 'No',
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userRows.length > 0 ? userRows : [{}]), 'System Users');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const scope = zone || 'ALL-ZONES';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="zamtel-tdr-${scope}-${period}.xlsx"`);
        res.send(buf);
    }
    catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Export failed' });
    }
});
// ─── POST /zbm/prospects/:id/approve-closure ──────────────────────────────────
exports.zbmRouter.post('/prospects/:id/approve-closure', async (req, res) => {
    try {
        const prospect = await prisma_1.prisma.prospect.findUnique({ where: { id: req.params.id } });
        if (!prospect) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        const _zone = resolveZone(req);
        if (_zone && prospect.zone !== _zone) {
            res.status(403).json({ error: 'Not in your zone' });
            return;
        }
        const updated = await prisma_1.prisma.prospect.update({
            where: { id: req.params.id },
            data: { status: 'converted', convertedAt: new Date(), closedByTdr: true, zbmApprovalRequired: false },
        });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to approve closure' });
    }
});
// ─── GET /zbm/agents/stale ────────────────────────────────────────────────────
// Agents + merchants in this ZBM's zone whose last visit was > 5 days ago (red flag)
exports.zbmRouter.get('/agents/stale', async (req, res) => {
    const zone = resolveZone(req) ?? undefined;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 5);
    // All agents in zone
    const agents = await prisma_1.prisma.agent.findMany({
        where: zone ? { zone } : {},
        orderBy: { agentName: 'asc' },
    });
    // For each agent get the most recent visit
    const enriched = await Promise.all(agents.map(async (a) => {
        const lastVisit = await prisma_1.prisma.visit.findFirst({
            where: { agentCode: a.agentCode },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        const lastVisitedAt = lastVisit?.createdAt ?? null;
        const daysAgo = lastVisitedAt
            ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
            : null;
        const isStale = daysAgo === null ? true : daysAgo >= 4;
        return { ...a, lastVisitedAt, daysAgo, isStale };
    }));
    const stale = enriched.filter(a => a.isStale);
    res.json({ stale, total: agents.length, staleCount: stale.length });
});
// ─── GET /zbm/leaderboard ─────────────────────────────────────────────────────
// TDR performance leaderboard scoped to this ZBM's zone
exports.zbmRouter.get('/leaderboard', (0, responseCache_1.responseCache)(60), async (req, res) => {
    const zbmId = req.user.userId;
    const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    // Get ZBM's zone
    const zbm = await prisma_1.prisma.user.findUnique({ where: { id: zbmId }, select: { zone: true, name: true } });
    const zone = zbm?.zone || null;
    // Date range for period
    const [year, month] = period.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() + 1 === month;
    const at = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const mt = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const vt = isCurrentMonth ? (0, mtd_1.visitMtdTarget)() : (0, mtd_1.visitMonthlyTarget)();
    // All TDRs in this ZBM's zone
    const tdrs = await prisma_1.prisma.user.findMany({
        where: { role: 'TDR', active: true, ...(zone ? { zone } : {}) },
        orderBy: { name: 'asc' },
    });
    const lbTdrIds = tdrs.map(t => t.id);
    const [lbAgents, lbMerchants, lbVisits, lbFloatAll, lbFloatRes] = await Promise.all([
        prisma_1.prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, reportedAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: lbTdrIds }, status: 'resolved', reportedAt: { gte: start, lte: end } } }),
    ]);
    const lbAm = Object.fromEntries(lbAgents.map((r) => [r.tdrId, r._count]));
    const lbMm = Object.fromEntries(lbMerchants.map((r) => [r.tdrId, r._count]));
    const lbVm = Object.fromEntries(lbVisits.map((r) => [r.tdrId, r._count]));
    const lbFm = Object.fromEntries(lbFloatAll.map((r) => [r.tdrId, r._count]));
    const lbFrm = Object.fromEntries(lbFloatRes.map((r) => [r.tdrId, r._count]));
    const rows = tdrs.map(tdr => {
        const agents = lbAm[tdr.id] || 0;
        const merchants = lbMm[tdr.id] || 0;
        const visits = lbVm[tdr.id] || 0;
        const floatTotal = lbFm[tdr.id] || 0;
        const floatResolved = lbFrm[tdr.id] || 0;
        const agentPct = Math.min(Math.round(agents / Math.max(at, 1) * 100), 100);
        const merchantPct = Math.min(Math.round(merchants / Math.max(mt, 1) * 100), 100);
        const visitPct = Math.min(Math.round(visits / Math.max(vt, 1) * 100), 100);
        const floatPct = floatTotal > 0 ? Math.round(floatResolved / floatTotal * 100) : 100;
        const score = Math.round(agentPct * 0.4 + merchantPct * 0.2 + floatPct * 0.3 + visitPct * 0.1);
        const pct = Math.round((agentPct + merchantPct + visitPct) / 3);
        return { id: tdr.id, name: tdr.name, zone: tdr.zone || 'Unassigned', agents, merchants, visits, floatTotal, floatResolved, agentPct, merchantPct, visitPct, floatPct, score, pct };
    });
    const ranked = [...rows].sort((a, b) => b.score - a.score || b.agents - a.agents);
    res.json({
        period,
        zone: zone || 'All Zones',
        zbmName: zbm?.name || '',
        tdrLeaderboard: ranked,
        targets: { agents: at, merchants: mt, visits: vt },
        mtd: isCurrentMonth ? { workingDaysElapsed: (0, mtd_1.workingDaysElapsed)(), workingDaysTotal: (0, mtd_1.workingDaysThisMonth)() } : null,
    });
});
// ─── GET /zbm/ases — list ASEs in this zone ───────────────────────────────────
exports.zbmRouter.get('/ases', async (req, res) => {
    try {
        const zone = resolveZone(req);
        const ases = await prisma_1.prisma.user.findMany({
            where: { role: 'ASE', active: true, ...(zone ? { zone } : {}) },
            select: { id: true, name: true, zone: true },
            orderBy: { name: 'asc' },
        });
        // For each ASE, count their TDRs
        const result = await Promise.all(ases.map(async (ase) => ({
            ...ase,
            tdrCount: await prisma_1.prisma.user.count({ where: { aseId: ase.id, role: 'TDR' } }),
        })));
        res.json({ success: true, data: result });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load ASEs' });
    }
});
// ─── POST /zbm/ases — create a new ASE ────────────────────────────────────────
exports.zbmRouter.post('/ases', async (req, res) => {
    try {
        const zone = resolveZone(req);
        const { id, name, pin } = req.body;
        if (!id || !name || !pin) {
            res.status(400).json({ error: 'id, name and pin required' });
            return;
        }
        const existing = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (existing) {
            res.status(409).json({ error: 'User ID already exists' });
            return;
        }
        const hashedPin = await bcryptjs_1.default.hash(pin, 10);
        const user = await prisma_1.prisma.user.create({
            data: { id, name, pin: hashedPin, role: 'ASE', zone: zone || null, active: true },
        });
        res.status(201).json({ success: true, data: { id: user.id, name: user.name, role: user.role, zone: user.zone } });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create ASE' });
    }
});
// ─── GET /zbm/tdrs — list all TDRs in this zone with their ASE assignment ─────
exports.zbmRouter.get('/tdrs', async (req, res) => {
    try {
        const zone = resolveZone(req);
        const tdrs = await prisma_1.prisma.user.findMany({
            where: { role: 'TDR', active: true, ...(zone ? { zone } : {}) },
            select: { id: true, name: true, zone: true, aseId: true },
            orderBy: { name: 'asc' },
        });
        res.json({ success: true, data: tdrs });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to load TDRs' });
    }
});
// ─── POST /zbm/assign-tdr — assign TDR to an ASE ─────────────────────────────
exports.zbmRouter.post('/assign-tdr', async (req, res) => {
    try {
        const zone = resolveZone(req);
        const { tdrId, aseId } = req.body;
        // Verify TDR is in this zone
        const tdr = await prisma_1.prisma.user.findFirst({ where: { id: tdrId, role: 'TDR', ...(zone ? { zone } : {}) } });
        if (!tdr) {
            res.status(404).json({ error: 'TDR not found in your zone' });
            return;
        }
        // Verify ASE is in this zone (if assigning)
        if (aseId) {
            const ase = await prisma_1.prisma.user.findFirst({ where: { id: aseId, role: 'ASE', ...(zone ? { zone } : {}) } });
            if (!ase) {
                res.status(404).json({ error: 'ASE not found in your zone' });
                return;
            }
        }
        await prisma_1.prisma.user.update({ where: { id: tdrId }, data: { aseId: aseId || null } });
        res.json({ success: true, message: aseId ? 'TDR assigned to ASE' : 'TDR unassigned' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to assign TDR' });
    }
});
//# sourceMappingURL=zbm.js.map