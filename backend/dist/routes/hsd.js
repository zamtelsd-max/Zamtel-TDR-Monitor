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
exports.mapRouter = exports.hsdRouter = void 0;
const express_1 = require("express");
const responseCache_1 = require("../middleware/responseCache");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const mtd_1 = require("../utils/mtd");
exports.hsdRouter = (0, express_1.Router)();
exports.hsdRouter.use((0, auth_1.requireAuth)('HSD'));
exports.hsdRouter.use(rateLimit_1.apiRateLimit);
// Shared map router — accessible by both HSD and ZBM
exports.mapRouter = (0, express_1.Router)();
exports.mapRouter.use((0, auth_1.requireAuth)('HSD', 'ZBM'));
exports.mapRouter.use(rateLimit_1.apiRateLimit);
const ZONES = [
    'Lusaka', 'Copperbelt', 'Northern', 'Eastern', 'Southern',
    'Western', 'Luapula', 'Muchinga', 'North-Western', 'Central',
];
function monthRange(period) {
    let year, month;
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (period) {
        [year, month] = period.split('-').map(Number);
    }
    else {
        year = now.getFullYear();
        month = now.getMonth() + 1;
    }
    const start = new Date(year, month - 1, 1);
    // MTD: if viewing current month, end is today; otherwise full month
    const isCurrentMonth = !period || period === currentPeriod;
    const end = isCurrentMonth
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
        : new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end, isCurrentMonth };
}
// ─── GET /hsd/dashboard ───────────────────────────────────────────────────────
exports.hsdRouter.get('/dashboard', (0, responseCache_1.responseCache)(30), async (req, res) => {
    const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end, isCurrentMonth } = monthRange(period);
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const [totalAgents, totalMerchants, totalVisits, openIssues, criticalIssues, prospectsBreakdown] = await Promise.all([
        prisma_1.prisma.agent.count({ where: { type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.count({ where: { type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.count({ where: { createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.count({ where: { status: { not: 'resolved' } } }),
        prisma_1.prisma.floatIssue.findMany({
            where: { status: { not: 'resolved' }, reportedAt: { lte: fortyEightHoursAgo } },
            orderBy: { reportedAt: 'asc' },
        }),
        prisma_1.prisma.$queryRaw `SELECT status, COUNT(*)::int AS "_count" FROM prospects GROUP BY status`.catch(() => []),
    ]);
    const totalRecruits = totalAgents + totalMerchants;
    const totalConversions = await prisma_1.prisma.prospect.count({ where: { status: 'converted', convertedAt: { gte: start, lte: end } } });
    const conversionRate = totalRecruits > 0 ? Math.round(totalConversions / totalRecruits * 100) : 0;
    res.json({
        period,
        kpis: { totalAgents, totalMerchants, totalVisits, openFloatIssues: openIssues, conversionRate },
        criticalAlerts: criticalIssues,
        prospectsBreakdown,
    });
});
// ─── GET /hsd/zones ───────────────────────────────────────────────────────────
exports.hsdRouter.get('/zones', (0, responseCache_1.responseCache)(30), async (req, res) => {
    const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end, isCurrentMonth } = monthRange(period);
    // Batch queries for all zones at once
    const [zbmUsers, tdrCounts, zAgents, zMerchants, zVisits, zFloats, zTargets] = await Promise.all([
        prisma_1.prisma.user.findMany({ where: { role: 'ZBM', active: true } }),
        prisma_1.prisma.user.groupBy({ by: ['zone'], _count: true, where: { role: 'TDR', active: true } }),
        prisma_1.prisma.agent.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, status: { not: 'resolved' } } }),
        prisma_1.prisma.salesTarget.findMany({ where: { period, zone: { in: ZONES } } }),
    ]);
    const zbmMap = Object.fromEntries(zbmUsers.map((u) => [u.zone, u.name]));
    const tdrMap = Object.fromEntries(tdrCounts.map((r) => [r.zone, r._count]));
    const agentZMap = Object.fromEntries(zAgents.map((r) => [r.zone, r._count]));
    const mchZMap = Object.fromEntries(zMerchants.map((r) => [r.zone, r._count]));
    const visitZMap = Object.fromEntries(zVisits.map((r) => [r.zone, r._count]));
    const floatZMap = Object.fromEntries(zFloats.map((r) => [r.zone, r._count]));
    const targetMap = Object.fromEntries(zTargets.map((t) => [t.zone, t]));
    const zoneStats = ZONES.map(zone => {
        const tdrs = tdrMap[zone] || 0;
        const agents = agentZMap[zone] || 0;
        const merchants = mchZMap[zone] || 0;
        const visits = visitZMap[zone] || 0;
        const floatIssues = floatZMap[zone] || 0;
        const target = targetMap[zone];
        const agentTarget = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(target?.targetAgents || 96 * tdrs) : (target?.targetAgents || 96 * tdrs);
        const merchantTarget = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(target?.targetMerchants || 96 * tdrs) : (target?.targetMerchants || 96 * tdrs);
        const visitTarget = isCurrentMonth ? (0, mtd_1.visitMtdTarget)() * tdrs : (target?.targetOutlets || (0, mtd_1.visitMonthlyTarget)() * tdrs);
        const pct = tdrs > 0
            ? Math.round(((agents / Math.max(agentTarget, 1)) + (merchants / Math.max(merchantTarget, 1)) + (visits / Math.max(visitTarget, 1))) / 3 * 100)
            : 0;
        return { zone, zbm: zbmMap[zone] || 'Unassigned', tdrs, agents, merchants, visits, floatIssues, pct };
    });
    res.json({
        period,
        zones: zoneStats,
        mtd: isCurrentMonth ? {
            workingDaysElapsed: (0, mtd_1.workingDaysElapsed)(),
            workingDaysTotal: (0, mtd_1.workingDaysThisMonth)(),
        } : null,
    });
});
// ─── GET /hsd/zones/:zone ─────────────────────────────────────────────────────
exports.hsdRouter.get('/zones/:zone', (0, responseCache_1.responseCache)(30), async (req, res) => {
    const zone = req.params.zone;
    const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end, isCurrentMonth } = monthRange(period);
    const tdrs = await prisma_1.prisma.user.findMany({ where: { role: 'TDR', zone, active: true } });
    const zoneTdrIds = tdrs.map((t) => t.id);
    const zat = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const zmt = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const zvt = isCurrentMonth ? (0, mtd_1.visitMtdTarget)() : (0, mtd_1.visitMonthlyTarget)();
    const [ztAgents, ztMerchants, ztVisits, ztFloats] = await Promise.all([
        prisma_1.prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.floatIssue.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, status: { not: 'resolved' } } }),
    ]);
    const ztAm = Object.fromEntries(ztAgents.map((r) => [r.tdrId, r._count]));
    const ztMm = Object.fromEntries(ztMerchants.map((r) => [r.tdrId, r._count]));
    const ztVm = Object.fromEntries(ztVisits.map((r) => [r.tdrId, r._count]));
    const ztFm = Object.fromEntries(ztFloats.map((r) => [r.tdrId, r._count]));
    const tdrStats = tdrs.map((tdr) => {
        const agents = ztAm[tdr.id] || 0;
        const merchants = ztMm[tdr.id] || 0;
        const visits = ztVm[tdr.id] || 0;
        const floatIssues = ztFm[tdr.id] || 0;
        const pct = Math.round(((agents / zat) + (merchants / zmt) + (visits / zvt)) / 3 * 100);
        return { tdr, agents, merchants, visits, floatIssues, pct };
    });
    const floatIssues = await prisma_1.prisma.floatIssue.findMany({ where: { zone }, orderBy: { reportedAt: 'desc' } });
    const prospects = await prisma_1.prisma.prospect.findMany({ where: { zone }, orderBy: { createdAt: 'desc' } });
    res.json({ zone, period, tdrStats, floatIssues, prospects });
});
// ─── PATCH /hsd/float-issues/:id ──────────────────────────────────────────────
exports.hsdRouter.patch('/float-issues/:id', async (req, res) => {
    const issue = await prisma_1.prisma.floatIssue.findUnique({ where: { id: req.params.id } });
    if (!issue) {
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
            resolvedAt,
            resolvedBy: status === 'resolved' ? req.user.name : undefined,
        },
    });
    res.json(updated);
});
// ─── POST /hsd/targets ────────────────────────────────────────────────────────
const targetSchema = zod_1.z.object({
    zone: zod_1.z.string().min(1),
    period: zod_1.z.string().regex(/^\d{4}-\d{2}$/),
    targetAgents: zod_1.z.number().int().positive().default(96),
    targetMerchants: zod_1.z.number().int().positive().default(96),
    targetOutlets: zod_1.z.number().int().positive().default(20),
});
exports.hsdRouter.post('/targets', async (req, res) => {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const target = await prisma_1.prisma.salesTarget.upsert({
        where: { zone_period: { zone: parsed.data.zone, period: parsed.data.period } },
        update: { ...parsed.data, setByHsdId: req.user.userId },
        create: { ...parsed.data, setByHsdId: req.user.userId },
    });
    res.json(target);
});
// ─── GET /hsd/export ──────────────────────────────────────────────────────────
exports.hsdRouter.get('/export', async (req, res) => {
    try {
        const XLSX = await Promise.resolve().then(() => __importStar(require('xlsx')));
        const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const { start, end } = monthRange(period);
        const [agents, visits, floatIssues, prospects] = await Promise.all([
            prisma_1.prisma.agent.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: [{ zone: 'asc' }, { createdAt: 'desc' }] }),
            prisma_1.prisma.visit.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
            prisma_1.prisma.floatIssue.findMany({ orderBy: { reportedAt: 'desc' } }),
            prisma_1.prisma.prospect.findMany({ orderBy: { createdAt: 'desc' } }),
        ]);
        const wb = XLSX.utils.book_new();
        // Sheet 1: Agents
        const agentRows = agents.map(a => ({
            'Zone': a.zone, 'ZBM': a.zbmName, 'TDR Name': a.tdrName,
            'Agent Name': a.agentName, 'Agent Code': a.agentCode, 'Phone': a.contactPhone,
            'Type': a.type, 'Category': a.merchantCategory || '',
            'Initial Float': a.initialFloat, 'Town': a.town, 'Address': a.address || '',
            'Cluster': a.cluster || '', 'Market': a.market || '',
            'Latitude': a.latitude || '', 'Longitude': a.longitude || '',
            'Notes': a.notes || '', 'Date': a.createdAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agentRows.length > 0 ? agentRows : [{}]), 'Agents');
        // Sheet 2: Visits
        const visitRows = visits.map(v => ({
            'Zone': v.zone, 'ZBM': v.zbmName, 'TDR Name': v.tdrName,
            'Outlet Name': v.outletName, 'Agent Code': v.agentCode, 'Phone': v.contactPhone,
            'Town': v.town, 'Cluster': v.cluster || '', 'Market': v.market || '',
            'Float Amount': v.floatAmount,
            'Latitude': v.latitude || '', 'Longitude': v.longitude || '',
            'Notes': v.notes || '', 'Date': v.createdAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitRows.length > 0 ? visitRows : [{}]), 'Visits');
        // Sheet 3: Float Issues
        const issueRows = floatIssues.map(f => ({
            'Zone': f.zone, 'TDR Name': f.tdrName,
            'Agent Code': f.agentCode, 'Agent Name': f.agentName, 'Phone': f.contactPhone,
            'Issue Type': f.issueType, 'Float Amount': f.reportedFloat,
            'Description': f.description, 'Status': f.status,
            'Resolved At': f.resolvedAt?.toISOString().split('T')[0] || '',
            'Resolution Notes': f.resolutionNotes || '',
            'Reported At': f.reportedAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issueRows.length > 0 ? issueRows : [{}]), 'Float Issues');
        // Sheet 4: Prospects
        const prospectRows = prospects.map(p => ({
            'Zone': p.zone, 'TDR Name': p.tdrName,
            'Prospect Type': p.prospectType, 'Business Name': p.businessName,
            'Owner Name': p.ownerName, 'Phone': p.contactPhone, 'Town': p.town,
            'Category': p.merchantCategory || '', 'Est. Float': p.estimatedFloat || '',
            'Status': p.status,
            'Follow-up Date': p.followUpDate?.toISOString().split('T')[0] || '',
            'Converted At': p.convertedAt?.toISOString().split('T')[0] || '',
            'Notes': p.notes || '', 'Date': p.createdAt.toISOString().split('T')[0],
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prospectRows.length > 0 ? prospectRows : [{}]), 'Prospects');
        // Sheet 5: Unvisited Outlets — single batched query (no N+1)
        const allAgents = await prisma_1.prisma.agent.findMany({
            orderBy: [{ zone: 'asc' }, { tdrName: 'asc' }, { agentName: 'asc' }],
        });
        // Get latest visit per agent in one query
        const latestVisits = await prisma_1.prisma.visit.groupBy({
            by: ['agentCode'],
            _max: { createdAt: true },
        });
        const lastVisitMap = new Map();
        for (const v of latestVisits) {
            if (v._max.createdAt)
                lastVisitMap.set(v.agentCode, v._max.createdAt);
        }
        const unvisitedRows = [];
        for (const a of allAgents) {
            const lastVisitedAt = lastVisitMap.get(a.agentCode) ?? null;
            const daysAgo = lastVisitedAt
                ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
                : null;
            if (daysAgo === null || daysAgo >= 4) {
                unvisitedRows.push({
                    'Zone': a.zone, 'ZBM': a.zbmName, 'TDR Name': a.tdrName,
                    'Agent Name': a.agentName, 'Agent Code': a.agentCode,
                    'Type': a.type, 'Phone': a.contactPhone, 'Town': a.town,
                    'Cluster': a.cluster || '', 'Market': a.market || '',
                    'Last Visited': lastVisitedAt ? lastVisitedAt.toISOString().split('T')[0] : 'NEVER',
                    'Days Since Visit': daysAgo === null ? 'Never' : daysAgo,
                    'Status': daysAgo === null ? '🔴 Never Visited' : `🔴 ${daysAgo} days ago`,
                });
            }
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unvisitedRows.length > 0 ? unvisitedRows : [{ 'Status': 'All outlets visited within 4 days ✅' }]), 'Unvisited Outlets');
        // Sheet 6: All System Users (all roles)
        const allUsers = await prisma_1.prisma.user.findMany({
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
        });
        const userRows = allUsers.map((u) => ({
            'User ID': u.id,
            'Full Name': u.name,
            'Role': u.role,
            'Zone': u.zone || '',
            'Active': u.active ? 'Yes' : 'No',
            'Must Change PIN': u.mustChangePin ? 'Yes' : 'No',
            'Created': u.createdAt?.toISOString().split('T')[0] || '',
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userRows.length > 0 ? userRows : [{}]), 'System Users');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="zamtel-hsd-export-${period}.xlsx"`);
        res.send(buf);
    }
    catch (err) {
        console.error('HSD export error:', err);
        res.status(500).json({ error: 'Export failed' });
    }
});
// ─── GPS Map Data ──────────────────────────────────────────────────────────────
exports.mapRouter.get('/', (0, responseCache_1.responseCache)(45), async (req, res) => {
    try {
        const { zone } = req.query;
        const user = req.user;
        // ZBM can only see their own zone; HSD can filter by zone param
        const zoneFilter = user.role === 'ZBM' ? user.zone :
            (zone && zone !== 'all' ? zone : undefined);
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
        // Enrich each agent with last visit info (batched by agentCode)
        const agentCodes = agents.map((a) => a.agentCode);
        const recentVisits = agentCodes.length > 0 ? await prisma_1.prisma.visit.findMany({
            where: { agentCode: { in: agentCodes } },
            select: { agentCode: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        }) : [];
        // Build a map: agentCode -> most recent visit date
        const lastVisitMap = {};
        for (const v of recentVisits) {
            if (!lastVisitMap[v.agentCode]) {
                lastVisitMap[v.agentCode] = v.createdAt;
            }
        }
        const enrichedAgents = agents.map((a) => {
            const lastVisitedAt = lastVisitMap[a.agentCode] ?? null;
            const daysAgo = lastVisitedAt
                ? Math.floor((Date.now() - new Date(lastVisitedAt).getTime()) / 86400000)
                : null;
            return { ...a, lastVisitedAt, daysAgo };
        });
        res.json({
            success: true,
            data: { agents: enrichedAgents, visits },
            summary: {
                totalAgents: enrichedAgents.length,
                totalVisits: visits.length,
                zones: [...new Set([...enrichedAgents.map((a) => a.zone), ...visits.map((v) => v.zone)])].filter(Boolean),
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch map data' });
    }
});
// ─── GET /hsd/agents/stale ────────────────────────────────────────────────────
// All agents nationwide whose last visit was > 5 days ago (HSD national view)
exports.hsdRouter.get('/agents/stale', async (req, res) => {
    const agents = await prisma_1.prisma.agent.findMany({ orderBy: [{ zone: 'asc' }, { agentName: 'asc' }] });
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
        return { ...a, lastVisitedAt, daysAgo, isStale: daysAgo === null || daysAgo >= 5 };
    }));
    const stale = enriched.filter(a => a.isStale);
    res.json({ stale, total: agents.length, staleCount: stale.length });
});
// ─── GET /hsd/leaderboard ─────────────────────────────────────────────────────
// Top TDRs (all zones) + Zone leaderboard ranked by % achievement
exports.hsdRouter.get('/leaderboard', (0, responseCache_1.responseCache)(60), async (req, res) => {
    const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { start, end, isCurrentMonth } = monthRange(period);
    const at = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const mt = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const vt = isCurrentMonth ? (0, mtd_1.visitMtdTarget)() : (0, mtd_1.visitMonthlyTarget)();
    const tdrs = await prisma_1.prisma.user.findMany({ where: { role: 'TDR', active: true } });
    const allTdrIds = tdrs.map((t) => t.id);
    // Batch: 3 groupBy queries instead of 3×309 individual counts
    const [lbAgents, lbMerchants, lbVisits] = await Promise.all([
        prisma_1.prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agent.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visit.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, createdAt: { gte: start, lte: end } } }),
    ]);
    const lbAm = Object.fromEntries(lbAgents.map((r) => [r.tdrId, r._count]));
    const lbMm = Object.fromEntries(lbMerchants.map((r) => [r.tdrId, r._count]));
    const lbVm = Object.fromEntries(lbVisits.map((r) => [r.tdrId, r._count]));
    const tdrRows = tdrs.map((tdr) => {
        const agents = lbAm[tdr.id] || 0;
        const merchants = lbMm[tdr.id] || 0;
        const visits = lbVm[tdr.id] || 0;
        const pct = Math.round(((agents / at) + (merchants / mt) + (visits / vt)) / 3 * 100);
        return { id: tdr.id, name: tdr.name, zone: tdr.zone || 'Unassigned', agents, merchants, visits, pct };
    });
    // Top 30 TDRs by pct
    const topTDRs = [...tdrRows].sort((a, b) => b.pct - a.pct || b.agents - a.agents).slice(0, 30);
    // Zone leaderboard (aggregate per zone)
    const zoneMap = {};
    for (const r of tdrRows) {
        if (!zoneMap[r.zone])
            zoneMap[r.zone] = { zone: r.zone, agents: 0, merchants: 0, visits: 0, tdrCount: 0 };
        zoneMap[r.zone].agents += r.agents;
        zoneMap[r.zone].merchants += r.merchants;
        zoneMap[r.zone].visits += r.visits;
        zoneMap[r.zone].tdrCount += 1;
    }
    const zoneRows = Object.values(zoneMap).map(z => {
        const zt = z.tdrCount;
        const pct = zt > 0 ? Math.round(((z.agents / (at * zt)) + (z.merchants / (mt * zt)) + (z.visits / (vt * zt))) / 3 * 100) : 0;
        return { ...z, pct };
    }).sort((a, b) => b.pct - a.pct || b.agents - a.agents);
    res.json({
        period,
        topTDRs,
        zoneLeaderboard: zoneRows,
        mtd: isCurrentMonth ? { workingDaysElapsed: (0, mtd_1.workingDaysElapsed)(), workingDaysTotal: (0, mtd_1.workingDaysThisMonth)() } : null,
    });
});
//# sourceMappingURL=hsd.js.map