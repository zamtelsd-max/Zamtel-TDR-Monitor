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
