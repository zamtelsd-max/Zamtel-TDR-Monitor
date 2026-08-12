import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';

export const aseTrackerRouter = Router();

// ── Zone targets from the SEE-2026-08 plan (seedable) ────────────────────────
const ZONE_TARGETS = [
  { zone: 'Central', zbmName: 'Rose Kamwanya', monthlyTarget: 18533.52, dailyTarget: 842.43 },
  { zone: 'Copperbelt', zbmName: 'Ira Ivor Chileshe', monthlyTarget: 23166.90, dailyTarget: 1053.04 },
  { zone: 'Eastern', zbmName: 'Monica Kambimbi', monthlyTarget: 18533.52, dailyTarget: 842.43 },
  { zone: 'Lusaka Central', zbmName: 'Evans Mutambo', monthlyTarget: 27800.28, dailyTarget: 1263.65 },
  { zone: 'Lusaka North', zbmName: 'Trebby Mando', monthlyTarget: 18533.52, dailyTarget: 842.43 },
  { zone: 'Lusaka South', zbmName: 'Sharon Zulu', monthlyTarget: 20850.21, dailyTarget: 947.74 },
  { zone: 'Luapula', zbmName: 'Ntamanyile Munungwe', monthlyTarget: 16216.83, dailyTarget: 737.13 },
  { zone: 'Muchinga', zbmName: 'Muchele Mwazembe', monthlyTarget: 13900.14, dailyTarget: 631.82 },
  { zone: 'North Western', zbmName: 'Daniel Chimbili', monthlyTarget: 20850.21, dailyTarget: 947.74 },
  { zone: 'Northern', zbmName: 'Mukuka Kapeya', monthlyTarget: 16216.83, dailyTarget: 737.13 },
  { zone: 'Southern', zbmName: 'Roy Mofya', monthlyTarget: 20850.21, dailyTarget: 947.74 },
  { zone: 'Western', zbmName: 'Michelo Munamboka', monthlyTarget: 16216.83, dailyTarget: 737.13 },
];

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart(d: string) { return d.slice(0, 8) + '01'; }
function weekStart(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
function status(pct: number): string { return pct >= 95 ? 'green' : pct >= 75 ? 'amber' : 'red'; }
const ZN: Record<string,string> = { "eastern":"Eastern","central":"Central","copperbelt":"Copperbelt","lusaka central":"Lusaka Central","lusaka north":"Lusaka North","lusaka south":"Lusaka South","luapula":"Luapula","muchinga":"Muchinga","northern":"Northern","southern":"Southern","western":"Western","north western":"North Western","north-west":"North Western" };
function normZoneName(z: any): string | null { if (!z) return null; const k = String(z).trim().toLowerCase().replace(/\s+province$/, "").trim(); return ZN[k] || (String(z).charAt(0).toUpperCase() + String(z).slice(1).toLowerCase()); }
function norm(s: string) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Seed / refresh zone targets (admin/hsd)
aseTrackerRouter.post('/seed-zones', requireAuth('HSD', 'DM'), async (_req: Request, res: Response) => {
  for (const z of ZONE_TARGETS) {
    await prisma.aseZoneTarget.upsert({ where: { zone: z.zone }, update: z, create: z });
  }
  res.json({ success: true, zones: ZONE_TARGETS.length });
});

// ── Attribution engine: ingest approved/rejected rows, credit to ASE via KYC ──
// body: { status:'APPROVED'|'REJECTED', rows:[{dealer_code, CUSTOMER_MSISDN, CUSTOMER_ID, SUPERVISOR, LOCATION, APPROVED_DATE|REJECTED_DATE, REJECTED_REASON, UPLOADED_DATETIME}] }
aseTrackerRouter.post('/ingest', requireAuth('HSD', 'ZBM', 'DM'), async (req: Request, res: Response) => {
  const { status: st, rows } = req.body as any;
  if (!st || !Array.isArray(rows)) { res.status(400).json({ error: 'status and rows[] required' }); return; }
  // Build dealer_code → {ase, zone, region} map from KYC masterfile
  const devices = await prisma.kycDevice.findMany({ select: { dealerCode: true, aseName: true, zone: true, region: true } });
  const map: Record<string, any> = {};
  devices.forEach(d => { if (d.dealerCode) map[String(d.dealerCode).trim().toUpperCase()] = d; });

  const parseDate = (r: any): string | null => {
    const raw = r.APPROVED_DATE || r.REJECTED_DATE || r.UPLOADED_DATETIME || r.txnDate;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  let credited = 0, unmapped = 0, skipped = 0;
  for (const r of rows) {
    const dc = String(r.dealer_code || r.dealerCode || '').trim().toUpperCase();
    if (!dc) { skipped++; continue; }
    const txnDate = parseDate(r);
    if (!txnDate) { skipped++; continue; }
    const dev = map[dc];
    const isUnmapped = !dev;
    if (isUnmapped) unmapped++; else credited++;
    try {
      await prisma.aseTransaction.upsert({
        where: { txn_dedupe: { customerMsisdn: String(r.CUSTOMER_MSISDN || r.customerMsisdn || dc + txnDate), customerId: String(r.CUSTOMER_ID || r.customerId || ''), status: st, txnDate } },
        update: { dealerCode: dc, aseName: dev?.aseName || null, zone: dev?.zone || null, region: dev?.region || null, rejectReason: r.REJECTED_REASON || null, supervisor: r.SUPERVISOR || null, location: r.LOCATION || null, unmapped: isUnmapped },
        create: { dealerCode: dc, aseName: dev?.aseName || null, zone: dev?.zone || null, region: dev?.region || null, status: st, rejectReason: r.REJECTED_REASON || null, customerMsisdn: String(r.CUSTOMER_MSISDN || r.customerMsisdn || ''), customerId: String(r.CUSTOMER_ID || r.customerId || ''), supervisor: r.SUPERVISOR || null, location: r.LOCATION || null, txnDate, unmapped: isUnmapped },
      });
    } catch { skipped++; }
  }
  res.json({ success: true, credited, unmapped, skipped, total: rows.length });
});

// ── Executive (HSD) view ──────────────────────────────────────────────────────
aseTrackerRouter.get('/executive', requireAuth('HSD', 'DM'), async (req: Request, res: Response) => {
  const date = (req.query.date as string) || today();
  const ms = monthStart(date), ws = weekStart(date);
  const zones = await prisma.aseZoneTarget.findMany();
  const totalMonthly = zones.reduce((s, z) => s + z.monthlyTarget, 0);
  const totalDaily = zones.reduce((s, z) => s + z.dailyTarget, 0);

  const [dayApproved, wtdApproved, mtdApproved, dayRejected] = await Promise.all([
    prisma.aseTransaction.count({ where: { status: 'APPROVED', txnDate: date, duplicate: false } }),
    prisma.aseTransaction.count({ where: { status: 'APPROVED', txnDate: { gte: ws, lte: date }, duplicate: false } }),
    prisma.aseTransaction.count({ where: { status: 'APPROVED', txnDate: { gte: ms, lte: date }, duplicate: false } }),
    prisma.aseTransaction.count({ where: { status: 'REJECTED', txnDate: date } }),
  ]);
  // zone rankings (MTD)
  const zoneAgg = await prisma.aseTransaction.groupBy({ by: ['zone'], where: { status: 'APPROVED', txnDate: { gte: ms, lte: date }, duplicate: false, zone: { not: null } }, _count: true });
  const zoneMap: Record<string, number> = {}; zoneAgg.forEach(z => { if (z.zone) zoneMap[z.zone] = z._count; });
  const ranked = zones.map(z => ({ zone: z.zone, zbm: z.zbmName, actual: zoneMap[z.zone] || 0, target: z.monthlyTarget, pct: z.monthlyTarget ? Math.round((zoneMap[z.zone] || 0) / z.monthlyTarget * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const workingDayTarget = Math.round(totalDaily);
  const rejRate = (dayApproved + dayRejected) ? +(dayRejected / (dayApproved + dayRejected) * 100).toFixed(1) : 0;

  res.json({
    date,
    daily: { actual: dayApproved, target: workingDayTarget, pct: workingDayTarget ? Math.round(dayApproved / workingDayTarget * 100) : 0, status: status(workingDayTarget ? dayApproved / workingDayTarget * 100 : 0) },
    wtd: { actual: wtdApproved, target: workingDayTarget * 5, pct: workingDayTarget * 5 ? Math.round(wtdApproved / (workingDayTarget * 5) * 100) : 0 },
    mtd: { actual: mtdApproved, target: Math.round(totalMonthly), pct: totalMonthly ? Math.round(mtdApproved / totalMonthly * 100) : 0 },
    rejectionRate: rejRate, dayRejected, dayApproved,
    topZones: ranked.slice(0, 3).map(z => z.zone),
    bottomZones: ranked.slice(-3).reverse().map(z => z.zone),
    zones: ranked,
  });
});

// ── Zonal (ZBM) view: ranked ASEs in a zone ──────────────────────────────────
aseTrackerRouter.get('/zone/:zone', requireAuth('HSD', 'ZBM', 'DM'), async (req: Request, res: Response) => {
  const zone = decodeURIComponent(req.params.zone);
  const date = (req.query.date as string) || today();
  const ms = monthStart(date), ws = weekStart(date);
  // day plans for today (market/cluster/target per ASE)
  const plans = await prisma.aseDayPlan.findMany({ where: { zone, date } });
  const planByAse: Record<string, any> = {}; plans.forEach(p => { planByAse[norm(p.aseName)] = p; });
  // all ASE names in zone (from plans + transactions)
  const txAgg = await prisma.aseTransaction.groupBy({ by: ['aseName'], where: { zone, status: 'APPROVED', txnDate: date, duplicate: false, aseName: { not: null } }, _count: true });
  const mtdAgg = await prisma.aseTransaction.groupBy({ by: ['aseName'], where: { zone, status: 'APPROVED', txnDate: { gte: ms, lte: date }, duplicate: false, aseName: { not: null } }, _count: true });
  const dayMap: Record<string, number> = {}; txAgg.forEach(t => { if (t.aseName) dayMap[norm(t.aseName)] = t._count; });
  const mtdMap: Record<string, number> = {}; mtdAgg.forEach(t => { if (t.aseName) mtdMap[norm(t.aseName)] = t._count; });
  const names = new Set([...plans.map(p => norm(p.aseName)), ...txAgg.map(t => norm(t.aseName || ''))]);
  const rows = [...names].filter(Boolean).map(n => {
    const plan = planByAse[n];
    const actual = dayMap[n] || 0;
    const target = plan?.gaTarget || 0;
    const displayName = plan?.aseName || txAgg.find(t => norm(t.aseName || '') === n)?.aseName || n;
    const pct = target ? Math.round(actual / target * 100) : 0;
    return { ase: displayName, market: plan?.market || '—', cluster: plan?.cluster || '—', target, actual, mtd: mtdMap[n] || 0, dsaCount: plan?.dsaCount || 0, pct, status: status(pct) };
  }).sort((a, b) => b.actual - a.actual).map((r, i) => ({ rank: i + 1, ...r }));
  res.json({ zone, date, aseCount: rows.length, rows });
});

// ── ASE self-view ─────────────────────────────────────────────────────────────
aseTrackerRouter.get('/ase/:name', requireAuth('HSD', 'ZBM', 'ASE', 'DM'), async (req: Request, res: Response) => {
  const name = decodeURIComponent(req.params.name);
  const date = (req.query.date as string) || today();
  const ms = monthStart(date), ws = weekStart(date);
  const nname = norm(name);
  const plan = await prisma.aseDayPlan.findFirst({ where: { aseName: { contains: name.split(' ')[0], mode: 'insensitive' }, date } });
  const [day, wtd, mtd] = await Promise.all([
    prisma.aseTransaction.count({ where: { aseName: { equals: name, mode: 'insensitive' }, status: 'APPROVED', txnDate: date, duplicate: false } }),
    prisma.aseTransaction.count({ where: { aseName: { equals: name, mode: 'insensitive' }, status: 'APPROVED', txnDate: { gte: ws, lte: date }, duplicate: false } }),
    prisma.aseTransaction.count({ where: { aseName: { equals: name, mode: 'insensitive' }, status: 'APPROVED', txnDate: { gte: ms, lte: date }, duplicate: false } }),
  ]);
  const dayTarget = plan?.gaTarget || 0;
  const insights = await prisma.aseInsight.findMany({ where: { aseName: { equals: name, mode: 'insensitive' } }, orderBy: { score: 'desc' }, take: 3 });
  const mk = (a: number, t: number) => ({ actual: a, target: t, pct: t ? Math.round(a / t * 100) : 0, gap: Math.max(0, t - a), status: status(t ? a / t * 100 : 0) });
  res.json({
    ase: name, date, market: plan?.market || '—', cluster: plan?.cluster || '—', dsaCount: plan?.dsaCount || 0,
    today: mk(day, dayTarget), wtd: mk(wtd, dayTarget * 5), mtd: mk(mtd, dayTarget * 22),
    insights,
  });
});

// ── ML / rule-based insight engine (re-score) ─────────────────────────────────
aseTrackerRouter.post('/rescore-insights', requireAuth('HSD', 'ZBM', 'DM'), async (_req: Request, res: Response) => {
  const to = today();
  const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const last7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // gather per-ASE stats over window
  const [approved, rejected, rejectReasons, devices] = await Promise.all([
    prisma.aseTransaction.groupBy({ by: ['aseName', 'zone'], where: { status: 'APPROVED', txnDate: { gte: from, lte: to }, duplicate: false, aseName: { not: null } }, _count: true }),
    prisma.aseTransaction.groupBy({ by: ['aseName'], where: { status: 'REJECTED', txnDate: { gte: last7, lte: to }, aseName: { not: null } }, _count: true }),
    prisma.aseTransaction.findMany({ where: { status: 'REJECTED', txnDate: { gte: last7, lte: to }, aseName: { not: null } }, select: { aseName: true, rejectReason: true } }),
    prisma.kycDevice.groupBy({ by: ['aseName'], where: { aseName: { not: null } }, _sum: { grossAdds: true, recharges: true, activityStatus: true }, _count: true }),
  ]);
  const rejMap: Record<string, number> = {}; rejected.forEach(r => { if (r.aseName) rejMap[norm(r.aseName)] = r._count; });
  const imageRejMap: Record<string, number> = {};
  rejectReasons.forEach(r => { const rr = (r.rejectReason || '').toUpperCase(); if (rr.includes('NOT CLEAR') || rr.includes('TAMPER') || rr.includes('SCARF') || rr.includes('HAT')) { const k = norm(r.aseName!); imageRejMap[k] = (imageRejMap[k] || 0) + 1; } });
  const devMap: Record<string, any> = {}; devices.forEach(d => { if (d.aseName) devMap[norm(d.aseName)] = d; });

  await prisma.aseInsight.deleteMany({});
  const insights: any[] = [];
  const zoneOf: Record<string, string> = {}; approved.forEach(a => { if (a.aseName) zoneOf[norm(a.aseName)] = a.zone || ''; });

  const allAse = new Set([...approved.map(a => norm(a.aseName!)), ...Object.keys(devMap)]);
  for (const key of allAse) {
    if (!key) continue;
    const disp = approved.find(a => norm(a.aseName!) === key)?.aseName || Object.entries(devMap).find(([k]) => k === key)?.[0] || key;
    const ga = approved.find(a => norm(a.aseName!) === key)?._count || 0;
    const dev = devMap[key];
    // 1. Image quality rejects
    if ((imageRejMap[key] || 0) > 15) {
      insights.push({ aseName: disp, zone: zoneOf[key] || null, focusArea: 'Image quality rejects', severity: 'warning', trigger: `${imageRejMap[key]} image-related rejections in last 7 days (ID not clear / tampered / headscarf)`, action: 'Schedule refresher on image capture (photo/portrait framing)', escalation: 'Raise at next morning huddle', evidenceCount: imageRejMap[key], score: 0.7 + Math.min(0.29, imageRejMap[key] / 100) });
    }
    // 2. Device inactivity
    if (dev && dev._count > 0) {
      const activeRate = (dev._sum.activityStatus || 0) / dev._count;
      if (activeRate < 0.30) {
        insights.push({ aseName: disp, zone: zoneOf[key] || null, focusArea: 'Device inactivity', severity: 'warning', trigger: `Active device rate ${(activeRate * 100).toFixed(0)}% (<30%) across ${dev._count} devices`, action: 'Field sweep: recover defective/unused devices, reissue', escalation: 'Return-device list printed for ZBM', evidenceCount: dev._count, score: 0.75 });
      }
    }
    // 3. Low recharges vs GA
    if (dev && ga > 0) {
      const rechargePerGa = (dev._sum.recharges || 0) / Math.max(1, dev._sum.grossAdds || ga);
      if (rechargePerGa < 0.5) {
        insights.push({ aseName: disp, zone: zoneOf[key] || null, focusArea: 'Low recharges vs GA', severity: 'watch', trigger: `Recharges per GA = ${rechargePerGa.toFixed(2)} (<0.5) — MoMo usage not pushed`, action: 'Coach on activation + MoMo spend bundle', escalation: 'Pair with top-quartile ASE for ride-along', evidenceCount: ga, score: 0.55 });
      }
    }
    // 4. High overall rejection rate
    const rej = rejMap[key] || 0;
    if (rej > 15) {
      insights.push({ aseName: disp, zone: zoneOf[key] || null, focusArea: 'High rejection volume', severity: rej > 40 ? 'critical' : 'warning', trigger: `${rej} rejected records in last 7 days`, action: 'Review capture quality and KYC compliance with the ASE', escalation: rej > 40 ? 'ASE → ZBM → HSD same day' : 'ASE → ZBM next morning', evidenceCount: rej, score: 0.6 + Math.min(0.35, rej / 100) });
    }
  }
  if (insights.length) await prisma.aseInsight.createMany({ data: insights });
  res.json({ success: true, generated: insights.length });
});

// ── Insights feed (scoped) ────────────────────────────────────────────────────
aseTrackerRouter.get('/insights', requireAuth('HSD', 'ZBM', 'DM'), async (req: Request, res: Response) => {
  const zone = req.query.zone as string | undefined;
  const where: any = {}; if (zone) where.zone = zone;
  const insights = await prisma.aseInsight.findMany({ where, orderBy: [{ severity: 'asc' }, { score: 'desc' }], take: 100 });
  const summary = {
    total: insights.length,
    critical: insights.filter(i => i.severity === 'critical').length,
    warning: insights.filter(i => i.severity === 'warning').length,
    watch: insights.filter(i => i.severity === 'watch').length,
  };
  res.json({ summary, insights });
});

// ── Day plan upload (bulk) ────────────────────────────────────────────────────
aseTrackerRouter.post('/dayplan', requireAuth('HSD', 'ZBM', 'DM'), async (req: Request, res: Response) => {
  const { plans } = req.body as any;
  if (!Array.isArray(plans)) { res.status(400).json({ error: 'plans[] required' }); return; }
  let created = 0;
  for (const p of plans) {
    if (!p.date || !p.aseName || !p.zone) continue;
    await prisma.aseDayPlan.create({ data: { date: p.date, aseName: p.aseName, zone: p.zone, market: p.market || null, cluster: p.cluster || null, gaTarget: Number(p.gaTarget) || 0, dsaCount: Number(p.dsaCount) || 0 } }).catch(() => {});
    created++;
  }
  res.json({ success: true, created });
});

// ── Unmapped dealer queue (for ZBM review) ────────────────────────────────────
aseTrackerRouter.get('/unmapped', requireAuth('HSD', 'ZBM', 'DM'), async (_req: Request, res: Response) => {
  const rows = await prisma.aseTransaction.findMany({ where: { unmapped: true }, distinct: ['dealerCode'], select: { dealerCode: true, supervisor: true, location: true, txnDate: true }, take: 200 });
  res.json({ count: rows.length, rows });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGIC / DEVICE-ATTACHMENT / SIM-EFFECTIVENESS / ML  (additive, 2026-08)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Strategic HSD dashboard: high-level KPIs + charts data ─────────────────────
aseTrackerRouter.get('/strategic', requireAuth('HSD', 'DM', 'ZBM'), async (req: Request, res: Response) => {
  const date = (req.query.date as string) || '2026-08-07';
  const ms = monthStart(date), ws = weekStart(date);
  const zones = await prisma.aseZoneTarget.findMany();
  const totalMonthly = zones.reduce((s, z) => s + z.monthlyTarget, 0);
  const totalDaily = zones.reduce((s, z) => s + z.dailyTarget, 0);

  const [dayA, wtdA, mtdA, dayR, wtdR] = await Promise.all([
    prisma.aseTransaction.count({ where: { status: 'APPROVED', txnDate: date, duplicate: false } }),
    prisma.aseTransaction.count({ where: { status: 'APPROVED', txnDate: { gte: ws, lte: date }, duplicate: false } }),
    prisma.aseTransaction.count({ where: { status: 'APPROVED', txnDate: { gte: ms, lte: date }, duplicate: false } }),
    prisma.aseTransaction.count({ where: { status: 'REJECTED', txnDate: date } }),
    prisma.aseTransaction.count({ where: { status: 'REJECTED', txnDate: { gte: ws, lte: date } } }),
  ]);

  // Zone leaderboard vs DAILY target
  const zoneAgg = await prisma.aseTransaction.groupBy({ by: ['zone'], where: { status: 'APPROVED', txnDate: date, duplicate: false, zone: { not: null } }, _count: true });
  const zm: Record<string, number> = {}; zoneAgg.forEach(z => { if (z.zone) zm[z.zone] = z._count; });
  const zoneMtdAgg = await prisma.aseTransaction.groupBy({ by: ['zone'], where: { status: 'APPROVED', txnDate: { gte: ms, lte: date }, duplicate: false, zone: { not: null } }, _count: true });
  const zmMtd: Record<string, number> = {}; zoneMtdAgg.forEach(z => { if (z.zone) zmMtd[z.zone] = z._count; });

  const zoneRows = zones.map(z => {
    const actual = zm[z.zone] || 0;
    const pct = z.dailyTarget ? Math.round(actual / z.dailyTarget * 100) : 0;
    return { zone: z.zone, zbm: z.zbmName, dayActual: actual, dayTarget: Math.round(z.dailyTarget), dayPct: pct,
      mtdActual: zmMtd[z.zone] || 0, mtdTarget: Math.round(z.monthlyTarget), mtdPct: z.monthlyTarget ? Math.round((zmMtd[z.zone] || 0) / z.monthlyTarget * 100) : 0,
      status: status(pct) };
  }).sort((a, b) => b.dayPct - a.dayPct);

  // Daily trend (last 14 days approved)
  const trendRaw = await prisma.aseTransaction.groupBy({ by: ['txnDate'], where: { status: 'APPROVED', duplicate: false }, _count: true, orderBy: { txnDate: 'asc' } });
  const trend = trendRaw.map(t => ({ date: t.txnDate, actual: t._count, target: Math.round(totalDaily) })).slice(-14);

  // Device fleet snapshot
  const totalDevices = await prisma.kycDevice.count();
  const activeDevices = await prisma.kycDevice.count({ where: { grossAdds: { gt: 0 } } });

  // Insight rollup
  const insights = await prisma.aseInsight.groupBy({ by: ['severity'], _count: true });
  const insMap: Record<string, number> = {}; insights.forEach(i => insMap[i.severity] = i._count);

  const dayPct = totalDaily ? Math.round(dayA / totalDaily * 100) : 0;
  const rejRate = (dayA + dayR) ? +(dayR / (dayA + dayR) * 100).toFixed(1) : 0;

  res.json({
    date,
    national: {
      day: { actual: dayA, target: Math.round(totalDaily), pct: dayPct, status: status(dayPct) },
      wtd: { actual: wtdA, target: Math.round(totalDaily * 5), pct: totalDaily ? Math.round(wtdA / (totalDaily * 5) * 100) : 0 },
      mtd: { actual: mtdA, target: Math.round(totalMonthly), pct: totalMonthly ? Math.round(mtdA / totalMonthly * 100) : 0 },
    },
    quality: { rejectionRate: rejRate, dayRejected: dayR, wtdRejected: wtdR, approvalRate: +(100 - rejRate).toFixed(1) },
    fleet: { total: totalDevices, active: activeDevices, idle: totalDevices - activeDevices, utilisation: totalDevices ? Math.round(activeDevices / totalDevices * 100) : 0 },
    insights: { critical: insMap['critical'] || 0, warning: insMap['warning'] || 0, watch: insMap['watch'] || 0 },
    zones: zoneRows,
    topZones: zoneRows.slice(0, 3),
    bottomZones: zoneRows.slice(-3).reverse(),
    trend,
  });
});

// ── Devices attached to an ASE (fleet + SIM effectiveness) ─────────────────────
aseTrackerRouter.get('/ase/:name/devices', requireAuth('HSD', 'ZBM', 'ASE', 'DM'), async (req: Request, res: Response) => {
  const name = decodeURIComponent(req.params.name);
  const devices = await prisma.kycDevice.findMany({ where: { aseName: name }, orderBy: { grossAdds: 'desc' } });
  const total = devices.length;
  const active = devices.filter(d => d.grossAdds > 0).length;
  const totalGA = devices.reduce((s, d) => s + d.grossAdds, 0);
  const totalRecharge = devices.reduce((s, d) => s + d.recharges, 0);
  // SIM effectiveness: recharges per GA (>=0.5 healthy per SRS); device utilisation
  const rechargePerGA = totalGA ? +(totalRecharge / totalGA).toFixed(2) : 0;
  res.json({
    ase: name,
    fleet: { total, active, idle: total - active, utilisation: total ? Math.round(active / total * 100) : 0 },
    simEffectiveness: { totalGA, totalRecharge: Math.round(totalRecharge), rechargePerGA, healthy: rechargePerGA >= 0.5 },
    devices: devices.map(d => ({
      dealerCode: d.dealerCode, deviceType: d.deviceSource, siteId: d.siteId, teamLead: d.teamLead,
      status: d.status, grossAdds: d.grossAdds, recharges: Math.round(d.recharges),
      active: d.grossAdds > 0, msisdn: d.msisdn,
    })),
  });
});

// ── SIM / device effectiveness leaderboard (ML-scored) ─────────────────────────
aseTrackerRouter.get('/effectiveness', requireAuth('HSD', 'ZBM', 'DM'), async (req: Request, res: Response) => {
  const zone = req.query.zone as string | undefined;
  const where: any = { aseName: { not: null } }; if (zone) where.zone = zone;
  const devices = await prisma.kycDevice.findMany({ where });
  // group by ASE
  const byAse: Record<string, any> = {};
  for (const d of devices) {
    const k = d.aseName!;
    if (!byAse[k]) byAse[k] = { ase: k, zone: d.zone, total: 0, active: 0, ga: 0, recharge: 0 };
    byAse[k].total++; if (d.grossAdds > 0) byAse[k].active++;
    byAse[k].ga += d.grossAdds; byAse[k].recharge += d.recharges;
  }
  const rows = Object.values(byAse).map((a: any) => {
    const util = a.total ? a.active / a.total : 0;
    const rpg = a.ga ? a.recharge / a.ga : 0;
    // Composite efficiency score (0-100): 50% device utilisation, 30% recharge/GA (capped at 1), 20% GA volume vs peers
    const effScore = Math.round((util * 50) + (Math.min(rpg, 1) * 30) + (Math.min(a.ga / 200, 1) * 20));
    return { ase: a.ase, zone: a.zone, devices: a.total, activeDevices: a.active, utilisation: Math.round(util * 100),
      ga: a.ga, recharge: Math.round(a.recharge), rechargePerGA: +rpg.toFixed(2), efficiencyScore: effScore,
      band: effScore >= 70 ? 'high' : effScore >= 45 ? 'medium' : 'low' };
  }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  res.json({ count: rows.length, avgEfficiency: rows.length ? Math.round(rows.reduce((s, r) => s + r.efficiencyScore, 0) / rows.length) : 0, rows });
});

// ── Upload daily registration report (xlsx) — incremental, multi-day ──────────
// Body: { fileBase64 }. Auto-detects Approved vs Rejected by columns. Attributes
// each registration to Agent code + ASE (dealer_code → KYC master, supervisor
// fallback). Incremental: re-uploading a day refreshes it; new days accumulate.
aseTrackerRouter.post('/upload-registrations', requireAuth('HSD', 'ZBM', 'DM'), async (req: Request, res: Response) => {
  try {
    const XLSX = await import('xlsx');
    const { fileBase64 } = req.body as { fileBase64?: string };
    if (!fileBase64) { res.status(400).json({ error: 'fileBase64 is required' }); return; }
    const b64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer' });
    const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!raw.length) { res.status(400).json({ error: 'No rows found in file' }); return; }

    // Detect report type: Rejected has REJECTED_DATE / REJECTED_REASON
    const cols = Object.keys(raw[0]).map(k => k.toLowerCase());
    const isRejected = cols.some(c => c.includes('rejected'));
    const st = isRejected ? 'REJECTED' : 'APPROVED';

    const get = (r: any, ...names: string[]) => {
      const keys = Object.keys(r);
      for (const n of names) { const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === n.toLowerCase().replace(/[^a-z0-9]/g, '')); if (k && r[k] !== '') return r[k]; }
      return undefined;
    };
    const ymd = (v: any): string | null => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? (String(v).slice(0, 10) || null) : d.toISOString().slice(0, 10); };

    // attribution maps
    const devices = await prisma.kycDevice.findMany({ select: { dealerCode: true, aseName: true, zone: true, region: true } });
    const map: Record<string, any> = {}; const aseByName: Record<string, any> = {};
    devices.forEach(d => { if (d.dealerCode) map[String(d.dealerCode).trim().toUpperCase()] = d; if (d.aseName) aseByName[d.aseName.trim().toLowerCase()] = d; });

    const data: any[] = []; const seen = new Set<string>();
    let credited = 0, viaSupervisor = 0, unmapped = 0, skipped = 0;
    const dates = new Set<string>();
    for (const r of raw) {
      const dc = String(get(r, 'dealer_code', 'dealercode') || '').trim().toUpperCase();
      const txnDate = ymd(isRejected ? get(r, 'REJECTED_DATE') : get(r, 'APPROVED_DATE')) || ymd(get(r, 'UPLOADED_DATETIME'));
      if (!dc || !txnDate) { skipped++; continue; }
      dates.add(txnDate);
      const supervisor = get(r, 'SUPERVISOR');
      const location = get(r, 'LOCATION') || get(r, 'PROVINCE');
      let dev = map[dc];
      if (!dev && supervisor) { const s = aseByName[String(supervisor).trim().toLowerCase()]; if (s) { dev = s; viaSupervisor++; } }
      const isUn = !dev; if (isUn) unmapped++; else credited++;
      const cm = String(get(r, 'CUSTOMER_MSISDN') || (dc + txnDate));
      const cid = String(get(r, 'CUSTOMER_ID') || '');
      const key = `${cm}|${cid}|${st}|${txnDate}`;
      if (seen.has(key)) continue; seen.add(key);
      data.push({ dealerCode: dc, aseName: dev?.aseName || null, zone: dev?.zone || normZoneName(location), region: dev?.region || normZoneName(location), status: st, rejectReason: get(r, 'REJECTED_REASON') || null, customerMsisdn: cm, customerId: cid, supervisor: supervisor || null, location: location || null, txnDate, unmapped: isUn, duplicate: false });
    }
    // Incremental: refresh only the days present in THIS upload for this status
    const dayList = [...dates];
    await prisma.aseTransaction.deleteMany({ where: { status: st, txnDate: { in: dayList } } });
    for (let i = 0; i < data.length; i += 500) await prisma.aseTransaction.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });

    res.json({ success: true, data: { report: st, rows: raw.length, inserted: data.length, attributed: credited, viaDealerCode: credited - viaSupervisor, viaSupervisor, unmapped, skipped, days: dayList.sort() } });
  } catch (err) {
    console.error('registration upload error:', err);
    res.status(500).json({ error: 'Upload failed — check the file (must be an Approved or Rejected dump xlsx)' });
  }
});
