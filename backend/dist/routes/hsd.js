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
    'Lusaka North', 'Lusaka South', 'Copperbelt', 'Northern', 'Eastern',
    'Southern', 'Western', 'Luapula', 'Muchinga', 'North-Western', 'Central',
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
    const [totalAgents, totalMerchants, totalVisits, openIssues, criticalIssues, prospectsBreakdown, totalReactivations, ntTotalRows] = await Promise.all([
        prisma_1.prisma.agents.count({ where: { type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agents.count({ where: { type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visits.count({ where: { createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.float_issues.count({ where: { status: { not: 'resolved' } } }),
        prisma_1.prisma.float_issues.findMany({
            where: { status: { not: 'resolved' }, reportedAt: { lte: fortyEightHoursAgo } },
            orderBy: { reportedAt: 'asc' },
        }),
        prisma_1.prisma.$queryRaw `SELECT status, COUNT(*)::int AS "_count" FROM prospects GROUP BY status`.catch(() => []),
        // Total reactivations submitted this MTD (all TDRs nationally)
        prisma_1.prisma.reactivation.count({ where: { createdAt: { gte: start, lte: end } } }),
        // Total NT base codes (the full inactive pool)
        prisma_1.prisma.$queryRaw `SELECT COUNT(*)::int AS cnt FROM nt_codes`.catch(() => [{ cnt: 0 }]),
    ]);
    const ntTotal = ntTotalRows?.[0]?.cnt ?? 86411; // fallback to known import count
    const totalRecruits = totalAgents + totalMerchants;
    const totalConversions = await prisma_1.prisma.prospects.count({ where: { status: 'converted', convertedAt: { gte: start, lte: end } } });
    const conversionRate = totalRecruits > 0 ? Math.round(totalConversions / totalRecruits * 100) : 0;
    // National targets = sum of all zone-level targets (each zone target is per-TDR × TDR count)
    const [tdrCounts, zTargets] = await Promise.all([
        prisma_1.prisma.users.groupBy({ by: ['zone'], _count: true, where: { role: 'TDR', active: true, zone: { in: ZONES } } }),
        prisma_1.prisma.sales_targets.findMany({ where: { period, zone: { in: ZONES } } }),
    ]);
    const tdrCountMap = Object.fromEntries(tdrCounts.map((r) => [r.zone, r._count]));
    const targetByZone = Object.fromEntries(zTargets.map((t) => [t.zone, t]));
    let nationalAgentTarget = 0;
    let nationalMerchantTarget = 0;
    let nationalVisitTarget = 0;
    for (const zone of ZONES) {
        const tdrs = tdrCountMap[zone] || 0;
        const t = targetByZone[zone];
        nationalAgentTarget += isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(t?.targetAgents || 96 * tdrs) : (t?.targetAgents || 96 * tdrs);
        nationalMerchantTarget += isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(t?.targetMerchants || 96 * tdrs) : (t?.targetMerchants || 96 * tdrs);
        nationalVisitTarget += isCurrentMonth ? (0, mtd_1.visitMtdTarget)() * tdrs : (t?.targetOutlets || (0, mtd_1.visitMonthlyTarget)() * tdrs);
    }
    res.json({
        period,
        kpis: {
            totalAgents, totalMerchants, totalVisits, openFloatIssues: openIssues, conversionRate,
            agentPct: nationalAgentTarget > 0 ? Math.min(Math.round(totalAgents / nationalAgentTarget * 100), 100) : 0,
            merchantPct: nationalMerchantTarget > 0 ? Math.min(Math.round(totalMerchants / nationalMerchantTarget * 100), 100) : 0,
            visitPct: nationalVisitTarget > 0 ? Math.min(Math.round(totalVisits / nationalVisitTarget * 100), 100) : 0,
            nationalTargets: { agents: nationalAgentTarget, merchants: nationalMerchantTarget, visits: nationalVisitTarget },
        },
        ntBase: {
            totalInactive: ntTotal,
            totalReactivated: totalReactivations,
            remaining: ntTotal - totalReactivations,
            pct: ntTotal > 0 ? Math.min(Math.round(totalReactivations / ntTotal * 100 * 10) / 10, 100) : 0,
        },
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
        prisma_1.prisma.users.findMany({ where: { role: 'ZBM', active: true } }),
        prisma_1.prisma.users.groupBy({ by: ['zone'], _count: true, where: { role: 'TDR', active: true } }),
        prisma_1.prisma.agents.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agents.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visits.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.float_issues.groupBy({ by: ['zone'], _count: true, where: { zone: { in: ZONES }, status: { not: 'resolved' } } }),
        prisma_1.prisma.sales_targets.findMany({ where: { period, zone: { in: ZONES } } }),
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
        return { zone, zbm: zbmMap[zone] || 'Unassigned', tdrs, agents, merchants, visits, floatIssues, pct,
            targets: { agents: agentTarget, merchants: merchantTarget, visits: visitTarget } };
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
    const tdrs = await prisma_1.prisma.users.findMany({ where: { role: 'TDR', zone, active: true } });
    const zoneTdrIds = tdrs.map((t) => t.id);
    const zat = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const zmt = isCurrentMonth ? (0, mtd_1.prorateMtdTarget)(96) : 96;
    const zvt = isCurrentMonth ? (0, mtd_1.visitMtdTarget)() : (0, mtd_1.visitMonthlyTarget)();
    const [ztAgents, ztMerchants, ztVisits, ztFloats] = await Promise.all([
        prisma_1.prisma.agents.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agents.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visits.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.float_issues.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: zoneTdrIds }, status: { not: 'resolved' } } }),
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
    const floatIssues = await prisma_1.prisma.float_issues.findMany({ where: { zone }, orderBy: { reportedAt: 'desc' } });
    const prospects = await prisma_1.prisma.prospects.findMany({ where: { zone }, orderBy: { createdAt: 'desc' } });
    res.json({ zone, period, tdrStats, floatIssues, prospects });
});
// ─── PATCH /hsd/float-issues/:id ──────────────────────────────────────────────
exports.hsdRouter.patch('/float-issues/:id', async (req, res) => {
    const issue = await prisma_1.prisma.float_issues.findUnique({ where: { id: req.params.id } });
    if (!issue) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const { status, resolutionNotes } = req.body;
    const resolvedAt = status === 'resolved' ? new Date() : undefined;
    const updated = await prisma_1.prisma.float_issues.update({
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
    const target = await prisma_1.prisma.sales_targets.upsert({
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
            prisma_1.prisma.agents.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: [{ zone: 'asc' }, { createdAt: 'desc' }] }),
            prisma_1.prisma.visits.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' } }),
            prisma_1.prisma.float_issues.findMany({ orderBy: { reportedAt: 'desc' } }),
            prisma_1.prisma.prospects.findMany({ orderBy: { createdAt: 'desc' } }),
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
        const allAgents = await prisma_1.prisma.agents.findMany({
            orderBy: [{ zone: 'asc' }, { tdrName: 'asc' }, { agentName: 'asc' }],
        });
        // Get latest visit per agent in one query
        const latestVisits = await prisma_1.prisma.visits.groupBy({
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
        const allUsers = await prisma_1.prisma.users.findMany({
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
            prisma_1.prisma.agents.findMany({
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
            prisma_1.prisma.visits.findMany({
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
        const recentVisits = agentCodes.length > 0 ? await prisma_1.prisma.visits.findMany({
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
    const agents = await prisma_1.prisma.agents.findMany({ orderBy: [{ zone: 'asc' }, { agentName: 'asc' }] });
    const enriched = await Promise.all(agents.map(async (a) => {
        const lastVisit = await prisma_1.prisma.visits.findFirst({
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
    const tdrs = await prisma_1.prisma.users.findMany({ where: { role: 'TDR', active: true } });
    const allTdrIds = tdrs.map((t) => t.id);
    // Batch: 3 groupBy queries instead of 3×309 individual counts
    const [lbAgents, lbMerchants, lbVisits] = await Promise.all([
        prisma_1.prisma.agents.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, type: 'normal', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.agents.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, type: 'merchant', createdAt: { gte: start, lte: end } } }),
        prisma_1.prisma.visits.groupBy({ by: ['tdrId'], _count: true, where: { tdrId: { in: allTdrIds }, createdAt: { gte: start, lte: end } } }),
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
// ─── GET /hsd/ase-performance — National ASE KPI summary ─────────────────────
exports.hsdRouter.get('/ase-performance', (0, responseCache_1.responseCache)(60), async (req, res) => {
    try {
        const period = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const { start, end } = monthRange(period);
        // All ASEs and their TDRs
        const [ases, tdrs, devicesByAse] = await Promise.all([
            prisma_1.prisma.users.findMany({ where: { role: 'ASE', active: true }, select: { id: true, name: true, zone: true } }),
            prisma_1.prisma.users.findMany({ where: { role: 'TDR', active: true }, select: { id: true, name: true, aseId: true, zone: true } }),
            prisma_1.prisma.$queryRaw `
        SELECT "aseName", zone,
          COUNT(*)::int                         AS total,
          SUM("activityStatus")::int            AS active,
          SUM("kycReg")::int                    AS kyc_reg,
          SUM("grossAdds")::int                 AS gross_adds,
          ROUND(SUM("activityStatus")::numeric/NULLIF(COUNT(*),0)*100,1) AS activity_pct
        FROM kyc_devices
        GROUP BY "aseName", zone
      `,
        ]);
        const devMap = {};
        for (const d of devicesByAse) {
            devMap[(d.aseName?.toLowerCase() || '')] = d;
        }
        // TDR scoring per ASE (agents, merchants, visits)
        const aseTdrMap = {};
        for (const t of tdrs) {
            if (t.aseId) {
                (aseTdrMap[t.aseId] = aseTdrMap[t.aseId] || []).push(t.id);
            }
        }
        const agentsByTdr = await prisma_1.prisma.agents.groupBy({
            by: ['tdrId'], _count: true,
            where: { createdAt: { gte: start, lte: end }, type: 'normal' }
        });
        const merchantsByTdr = await prisma_1.prisma.agents.groupBy({
            by: ['tdrId'], _count: true,
            where: { createdAt: { gte: start, lte: end }, type: 'merchant' }
        });
        const visitsByTdr = await prisma_1.prisma.visits.groupBy({
            by: ['tdrId'], _count: true,
            where: { createdAt: { gte: start, lte: end } }
        });
        const agMap = Object.fromEntries(agentsByTdr.map((r) => [r.tdrId, r._count]));
        const mchMap = Object.fromEntries(merchantsByTdr.map((r) => [r.tdrId, r._count]));
        const visMap = Object.fromEntries(visitsByTdr.map((r) => [r.tdrId, r._count]));
        const aseList = ases.map((ase) => {
            const aseTdrIds = aseTdrMap[ase.id] || [];
            const tdrCount = aseTdrIds.length;
            // Supervision = avg TDR score
            let tdrScoreSum = 0;
            for (const tid of aseTdrIds) {
                const ag = agMap[tid] || 0;
                const mc = mchMap[tid] || 0;
                const vi = visMap[tid] || 0;
                tdrScoreSum += Math.round((ag / 96) * 40 + (mc / 96) * 20 + (vi / 20) * 10);
            }
            const supervisionScore = tdrCount > 0 ? Math.round(tdrScoreSum / tdrCount) : 0;
            const devData = devMap[ase.name.toLowerCase()] || { total: 0, active: 0, kyc_reg: 0, gross_adds: 0, activity_pct: 0 };
            const kycDeviceScore = devData.total > 0 ? Math.round(devData.active / devData.total * 100) : 0;
            // ASE KPI weights: KYC Device 36.36%, Supervision 31.82%, Sim Outlet 22.73%, Own Device 9.09%
            const finalScore = Math.round(kycDeviceScore * 0.3636 + supervisionScore * 0.3182 + supervisionScore * 0.2273);
            return {
                id: ase.id, name: ase.name, zone: ase.zone, tdrCount,
                devices: {
                    total: devData.total, active: devData.active,
                    inactive: devData.total - devData.active,
                    kycReg: devData.kyc_reg || 0, grossAdds: devData.gross_adds || 0,
                    activityPct: parseFloat(devData.activity_pct) || 0,
                },
                supervisionScore,
                kycDeviceScore,
                finalScore,
            };
        });
        // Device summary totals
        const totalDevices = devicesByAse.reduce((s, d) => s + (d.total || 0), 0);
        const activeDevices = devicesByAse.reduce((s, d) => s + (d.active || 0), 0);
        const totalKycReg = devicesByAse.reduce((s, d) => s + (d.kyc_reg || 0), 0);
        const totalGA = devicesByAse.reduce((s, d) => s + (d.gross_adds || 0), 0);
        const avgScore = aseList.length > 0 ? Math.round(aseList.reduce((s, a) => s + a.finalScore, 0) / aseList.length) : 0;
        // Zone-level device aggregation
        const zoneMap = {};
        for (const d of devicesByAse) {
            const z = d.zone || 'Unassigned';
            if (!zoneMap[z])
                zoneMap[z] = { zone: z, total: 0, active: 0, kyc: 0, ga: 0 };
            zoneMap[z].total += d.total || 0;
            zoneMap[z].active += d.active || 0;
            zoneMap[z].kyc += d.kyc_reg || 0;
            zoneMap[z].ga += d.gross_adds || 0;
        }
        const byZone = Object.values(zoneMap)
            .map((z) => ({ ...z, pct: z.total > 0 ? Math.round(z.active / z.total * 100) : 0 }))
            .sort((a, b) => b.total - a.total);
        res.json({
            summary: { totalASEs: aseList.length, totalDevices, activeDevices, inactiveDevices: totalDevices - activeDevices,
                activityPct: totalDevices > 0 ? Math.round(activeDevices / totalDevices * 100 * 10) / 10 : 0,
                totalKycReg, totalGA, avgScore },
            ases: aseList.sort((a, b) => b.finalScore - a.finalScore),
            byZone,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load ASE performance' });
    }
});
// ─── POST /hsd/devices — HSD adds a new KYC device (any zone) ────────────────
exports.hsdRouter.post('/devices', async (req, res) => {
    try {
        const { dealerCode, description, imei1, imei2, msisdn, simSerial, siteId, region, zone, aseName, teamLead, status, activityStatus, kycReg, grossAdds, zamoGA, recharges, deviceSource, } = req.body;
        if (!imei1) {
            res.status(400).json({ error: 'IMEI 1 is required' });
            return;
        }
        if (!zone) {
            res.status(400).json({ error: 'Zone is required' });
            return;
        }
        const existing = await prisma_1.prisma.$queryRaw `SELECT id FROM kyc_devices WHERE imei1=${imei1} LIMIT 1`;
        if (existing.length > 0) {
            res.status(409).json({ error: `Device with IMEI ${imei1} already exists` });
            return;
        }
        const result = await prisma_1.prisma.$queryRaw `
      INSERT INTO kyc_devices
        (id,"dealerCode","description","imei1","imei2","msisdn","simSerial","siteId",
         "region","zone","rbmName","aseName","teamLead","status","activityStatus",
         "kycReg","grossAdds","zamoGA","recharges","deviceSource","createdAt","updatedAt")
      VALUES (
        gen_random_uuid(),
        ${dealerCode || null},${description || 'Manual Entry'},${imei1},${imei2 || null},
        ${msisdn || null},${simSerial || null},${siteId || null},
        ${region || zone},${zone},${req.user.name},
        ${aseName || null},${teamLead || null},${status || 'ACTIVE'},
        ${Number(activityStatus) || 0},${Number(kycReg) || 0},${Number(grossAdds) || 0},
        ${Number(zamoGA) || 0},${Number(recharges) || 0},${deviceSource || 'MobiGO2+'},
        NOW(),NOW()
      )
      RETURNING id,"dealerCode","imei1","aseName","zone","deviceSource"
    `;
        res.status(201).json({ success: true, data: result[0], message: 'Device added successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add device' });
    }
});
// ─── GET /hsd/devices — HSD lists all devices (any zone, searchable) ─────────
exports.hsdRouter.get('/devices', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').replace(/'/g, "''");
        const zone = (req.query.zone || '').replace(/'/g, "''");
        const source = req.query.source;
        const status = req.query.status;
        const conds = [];
        if (zone)
            conds.push(`LOWER("zone") = LOWER('${zone}')`);
        if (source)
            conds.push(`"deviceSource" = '${source.replace(/'/g, "''")}' `);
        if (status === 'active')
            conds.push(`"activityStatus" = 1`);
        if (status === 'inactive')
            conds.push(`"activityStatus" = 0`);
        if (search)
            conds.push(`("dealerCode" ILIKE '%${search}%' OR "aseName" ILIKE '%${search}%' OR imei1 ILIKE '%${search}%' OR "teamLead" ILIKE '%${search}%' OR "zone" ILIKE '%${search}%')`);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const [rows, cnt] = await Promise.all([
            prisma_1.prisma.$queryRawUnsafe(`SELECT id,"dealerCode","description","imei1","imei2","msisdn","aseName","teamLead","zone","region","status","activityStatus","kycReg","grossAdds","zamoGA","recharges","deviceSource","createdAt" FROM kyc_devices ${where} ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}`),
            prisma_1.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as cnt, SUM("activityStatus")::int as active FROM kyc_devices ${where}`),
        ]);
        res.json({ success: true, data: rows, total: cnt[0]?.cnt || 0, active: cnt[0]?.active || 0, inactive: (cnt[0]?.cnt || 0) - (cnt[0]?.active || 0), page, limit });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load devices' });
    }
});
// ─── DELETE /hsd/devices/:id — HSD removes any device ────────────────────────
exports.hsdRouter.delete('/devices/:id', async (req, res) => {
    try {
        const check = await prisma_1.prisma.$queryRaw `SELECT id FROM kyc_devices WHERE id=${req.params.id} LIMIT 1`;
        if (!check.length) {
            res.status(404).json({ error: 'Device not found' });
            return;
        }
        await prisma_1.prisma.$queryRaw `DELETE FROM kyc_devices WHERE id=${req.params.id}`;
        res.json({ success: true, message: 'Device removed' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete device' });
    }
});
//# sourceMappingURL=hsd.js.map