import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { responseCache, invalidateCache } from '../middleware/responseCache';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange, visitMtdTarget, prorateMtdTarget, visitMonthlyTarget,
         workingDaysElapsed, workingDaysThisMonth } from '../utils/mtd';

export const tdrRouter = Router();
tdrRouter.use(requireAuth('TDR'));
tdrRouter.use(apiRateLimit);

// ─── GET /tdr/dashboard ───────────────────────────────────────────────────────
tdrRouter.get('/dashboard', responseCache(30), async (req: Request, res: Response): Promise<void> => {
  const tdrId = req.user!.userId;
  const { start, end } = mtdRange();

  // Today's window (midnight → now)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();

  const [agentsCount, merchantsCount, visitsCount, floatIssues, prospects, recentAgents, recentVisits,
         agentsToday, merchantsToday, visitsToday, reactivationsCount] =
    await Promise.all([
      prisma.agent.count({ where: { tdrId, type: 'normal',   createdAt: { gte: start,      lte: end      } } }),
      prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: start,      lte: end      } } }),
      prisma.visit.count({ where: { tdrId, compliant: true,   createdAt: { gte: start,      lte: end      } } }),
      prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
      prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
      prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.agent.count({ where: { tdrId, type: 'normal',   createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.agent.count({ where: { tdrId, type: 'merchant', createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.visit.count({ where: { tdrId, compliant: true,   createdAt: { gte: todayStart, lte: todayEnd } } }),
      // Reactivations submitted via the dedicated form this MTD
      prisma.reactivation.count({ where: { tdrId, createdAt: { gte: start, lte: end } } }),
    ]);

  // NT base points: sum of ntPoints for this TDR this MTD
  const ntPointsRows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM("ntPoints"), 0)::int AS total
    FROM reactivations
    WHERE "tdrId" = ${tdrId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
  `;
  const ntPointsTotal = ntPointsRows[0]?.total ?? 0;
  // NT bonus: 100 pts = 20% of agent score added on top (prorated: ntPts/100 * 20)
  // Capped at 20% bonus
  const NT_POINTS_TARGET = 100;
  const ntBonusPct = Math.min(Math.round((ntPointsTotal / NT_POINTS_TARGET) * 20), 20);

  const floatResolved  = floatIssues.filter(f => f.status === 'resolved').length;
  const floatPending   = floatIssues.filter(f => f.status !== 'resolved').length;
  const prospectsConverted = prospects.filter(
    p => p.status === 'converted' && p.convertedAt && p.convertedAt >= start && p.convertedAt <= end
  ).length;
  const prospectsPending = prospects.filter(
    p => p.followUpDate && p.followUpDate <= new Date() && p.status !== 'converted' && p.status !== 'rejected'
  ).length;

  // Targets
  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const target = await prisma.salesTarget.findUnique({ where: { zone_period: { zone: req.user!.zone || '', period } } });

  res.json({
    tdr: { id: tdrId, name: req.user!.name, zone: req.user!.zone },
    month: period,
    mtd: {
      workingDaysElapsed: workingDaysElapsed(),
      workingDaysTotal:   workingDaysThisMonth(),
    },
    stats: {
      agents:       { count: agentsCount,        target: prorateMtdTarget(target?.targetAgents    || 96) },
      merchants:    { count: merchantsCount,      target: prorateMtdTarget(target?.targetMerchants || 96) },
      visits:       { count: visitsCount,         target: visitMtdTarget() },
      reactivations:{ count: reactivationsCount,  target: 6 * workingDaysElapsed() },
      ntPoints:     { total: ntPointsTotal, target: NT_POINTS_TARGET, bonusPct: ntBonusPct },
    },
    today: {
      agents:    agentsToday,
      merchants: merchantsToday,
      visits:    visitsToday,
      target:    20, // 20 visits per working day
    },
    floatIssues: {
      total:    floatIssues.length,
      resolved: floatResolved,
      pending:  floatPending,
    },
    prospects: {
      total:     prospects.length,
      converted: prospectsConverted,
      pending:   prospectsPending,
    },
    recentActivity: {
      agents: recentAgents,
      visits: recentVisits,
    },
  });
});

// ─── POST /tdr/agents ─────────────────────────────────────────────────────────
const agentSchema = z.object({
  agentName:        z.string().min(1),
  agentCode:        z.string().min(1),
  contactPhone:     z.string().min(1),
  type:             z.enum(['normal', 'merchant']),
  merchantCategory: z.string().optional(),
  initialFloat:     z.number().default(0),
  town:             z.string().min(1),
  address:          z.string().optional(),
  cluster:          z.string().optional(),
  market:           z.string().optional(),
  latitude:         z.number().optional(),
  longitude:        z.number().optional(),
  notes:            z.string().optional(),
  prospectId:       z.string().optional(),  // if converting a prospect → agent
});

tdrRouter.post('/agents', async (req: Request, res: Response): Promise<void> => {
  const parsed = agentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    const tdrId = req.user!.userId;

    // Check if agent code already exists anywhere in the system (globally unique)
    const existing = await prisma.agent.findUnique({
      where: { agentCode: parsed.data.agentCode },
    });
    if (existing) {
      const owner = await prisma.user.findUnique({ where: { id: existing.tdrId }, select: { name: true, zone: true, id: true } });
      res.status(409).json({
        error: `Agent code ${parsed.data.agentCode} is already registered in the system.`,
        duplicate: {
          agentCode:  existing.agentCode,
          agentName:  existing.agentName,
          tdrName:    owner?.name || existing.tdrName,
          tdrId:      existing.tdrId,
          zone:       existing.zone || owner?.zone || '',
          registeredAt: existing.createdAt,
        },
      });
      return;
    }

    const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user!.zone || '' } });
    const { prospectId, ...agentData } = parsed.data;
    const agent = await prisma.agent.create({
      data: {
        ...agentData,
        tdrId,
        tdrName: req.user!.name,
        zone:    req.user!.zone || '',
        zbmName: zbm?.name || '',
      },
    });
    // If this agent came from a prospect, mark that prospect converted
    if (prospectId) {
      await prisma.prospect.updateMany({
        where: { id: prospectId, tdrId },
        data: { status: 'converted', convertedAt: new Date() },
      }).catch(() => {});
    }
    invalidateCache(`${req.user!.userId}::`);
    res.status(201).json(agent);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Race condition — look up owner for enriched response
      try {
        const race = await prisma.agent.findUnique({ where: { agentCode: (req.body as any)?.agentCode } });
        const owner = race ? await prisma.user.findUnique({ where: { id: race.tdrId }, select: { name: true, zone: true } }) : null;
        res.status(409).json({
          error: `Agent code ${(req.body as any)?.agentCode} is already registered in the system.`,
          duplicate: race ? {
            agentCode:    race.agentCode,
            agentName:    race.agentName,
            tdrName:      owner?.name || race.tdrName,
            tdrId:        race.tdrId,
            zone:         race.zone || owner?.zone || '',
            registeredAt: race.createdAt,
          } : undefined,
        });
      } catch { res.status(409).json({ error: `Agent code already registered.` }); }
    } else {
      res.status(500).json({ error: 'Failed to create agent' });
    }
  }
});

// ─── POST /tdr/visits ─────────────────────────────────────────────────────────
const visitSchema = z.object({
  outletName:   z.string().min(1),
  agentCode:    z.string().min(1),
  contactPhone: z.string().min(1),
  town:         z.string().min(1),
  cluster:      z.string().optional(),
  market:       z.string().optional(),
  floatAmount:  z.number().default(0),
  latitude:     z.number().optional(),
  longitude:    z.number().optional(),
  notes:        z.string().optional(),
  durationMin:  z.number().optional(),   // minutes at outlet
  startedAt:    z.string().optional(),   // ISO check-in time
});

// Haversine distance in metres between two GPS points
function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Visit quality/fraud rules
const QUALITY_MIN_MINUTES = 10;   // a quality visit averages ~10 minutes
const LOCATION_TOLERANCE_M = 250; // visit must be within 250m of saved agent GPS
const RAPID_WINDOW_MIN = 10;      // window for rapid-visit detection
const RAPID_MAX_VISITS = 2;       // >2 visits within the window = suspicious

tdrRouter.post('/visits', async (req: Request, res: Response): Promise<void> => {
  const parsed = visitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  try {
    // Duplicate check: same TDR + same agentCode on same calendar day
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const existing = await prisma.visit.findFirst({
      where: { tdrId: req.user!.userId, agentCode: d.agentCode, createdAt: { gte: todayStart, lte: todayEnd } },
    });
    if (existing) {
      res.status(409).json({ error: `You already recorded a visit for agent ${d.agentCode} today.` });
      return;
    }

    // ── Quality & fraud evaluation ──
    let compliant = true, suspicious = false;
    const reasons: string[] = [];
    let distanceM: number | null = null;

    // 1) Location check against the agent's SAVED GPS (name correct but wrong place = faked)
    const agent = await prisma.agent.findUnique({ where: { agentCode: d.agentCode } }).catch(() => null);
    if (agent && agent.latitude != null && agent.longitude != null) {
      if (d.latitude != null && d.longitude != null) {
        distanceM = Math.round(distanceMetres(agent.latitude, agent.longitude, d.latitude, d.longitude));
        if (distanceM > LOCATION_TOLERANCE_M) {
          compliant = false;
          reasons.push(`Location mismatch: ${distanceM}m from saved outlet location (allowed ${LOCATION_TOLERANCE_M}m) — non-compliant / faked visit`);
        }
      } else {
        compliant = false;
        reasons.push('No GPS captured — cannot verify against saved outlet location');
      }
    } else if (agent && (agent.latitude == null || agent.longitude == null)) {
      // Existing agent without a saved location yet → save it now from this visit (new-addition rule)
      if (d.latitude != null && d.longitude != null) {
        await prisma.agent.update({ where: { id: agent.id }, data: { latitude: d.latitude, longitude: d.longitude } }).catch(() => {});
      }
    }
    // (If agent not found at all, it's a brand-new outlet — location is saved when the agent is created.)

    // 2) Duration: quality visit should average ~10 minutes
    if (d.durationMin != null && d.durationMin < QUALITY_MIN_MINUTES) {
      suspicious = true;
      reasons.push(`Visit too short: ${d.durationMin} min (quality target ${QUALITY_MIN_MINUTES} min)`);
    }

    // 3) Rapid-fire: more than 2 visits within a 10-minute window by this TDR
    const windowStart = new Date(Date.now() - RAPID_WINDOW_MIN * 60 * 1000);
    const recentCount = await prisma.visit.count({ where: { tdrId: req.user!.userId, createdAt: { gte: windowStart } } });
    if (recentCount >= RAPID_MAX_VISITS) {
      suspicious = true;
      reasons.push(`Rapid visits: ${recentCount + 1} visits within ${RAPID_WINDOW_MIN} min (max ${RAPID_MAX_VISITS}) — suspicious`);
    }

    const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: req.user!.zone || '' } });
    const visit = await prisma.visit.create({
      data: {
        outletName: d.outletName, agentCode: d.agentCode, contactPhone: d.contactPhone,
        town: d.town, cluster: d.cluster, market: d.market, floatAmount: d.floatAmount,
        latitude: d.latitude, longitude: d.longitude, notes: d.notes,
        durationMin: d.durationMin ?? null,
        startedAt: d.startedAt ? new Date(d.startedAt) : null,
        compliant, suspicious, distanceM,
        flagReason: reasons.length ? reasons.join(' | ') : null,
        tdrId: req.user!.userId, tdrName: req.user!.name, zone: req.user!.zone || '', zbmName: zbm?.name || '',
      },
    });
    invalidateCache(`${req.user!.userId}::`);
    res.status(201).json({ ...visit, quality: { compliant, suspicious, distanceM, reasons } });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record visit' });
  }
});

// ─── POST /tdr/float-issues ───────────────────────────────────────────────────
const floatIssueSchema = z.object({
  agentCode:     z.string().min(1),
  agentName:     z.string().min(1),
  contactPhone:  z.string().min(1),
  issueType:     z.enum(['low_float', 'stuck_transaction', 'system_error', 'other']),
  reportedFloat: z.number().default(0),
  description:   z.string().min(1),
  latitude:      z.number().optional(),
  longitude:     z.number().optional(),
});

tdrRouter.post('/float-issues', async (req: Request, res: Response): Promise<void> => {
  const parsed = floatIssueSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    const issue = await prisma.floatIssue.create({
      data: {
        ...parsed.data,
        tdrId:   req.user!.userId,
        tdrName: req.user!.name,
        zone:    req.user!.zone || '',
        status:  'reported',
      },
    });
    res.status(201).json(issue);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to report float issue' });
  }
});

// ─── GET /tdr/float-issues ────────────────────────────────────────────────────
tdrRouter.get('/float-issues', async (req: Request, res: Response): Promise<void> => {
  const issues = await prisma.floatIssue.findMany({
    where: { tdrId: req.user!.userId },
    orderBy: { reportedAt: 'desc' },
  });
  res.json(issues);
});

// ─── PATCH /tdr/float-issues/:id ─────────────────────────────────────────────
tdrRouter.patch('/float-issues/:id', async (req: Request, res: Response): Promise<void> => {
  const issue = await prisma.floatIssue.findUnique({ where: { id: req.params.id } });
  if (!issue || issue.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }

  const updated = await prisma.floatIssue.update({
    where: { id: req.params.id },
    data: {
      status: req.body.status === 'in_progress' ? 'in_progress' : undefined,
    },
  });
  res.json(updated);
});

// ─── POST /tdr/prospects ──────────────────────────────────────────────────────
const prospectSchema = z.object({
  prospectType:    z.enum(['agent', 'merchant']),
  businessName:    z.string().min(1),
  ownerName:       z.string().min(1),
  contactPhone:    z.string().min(1),
  town:            z.string().min(1),
  address:         z.string().optional(),
  merchantCategory: z.string().optional(),
  estimatedFloat:  z.number().optional(),
  status:          z.enum(['identified', 'contacted', 'interested', 'converted', 'rejected']).default('identified'),
  notes:           z.string().optional(),
  followUpDate:    z.string().optional(),
  latitude:        z.number().optional(),
  longitude:       z.number().optional(),
});

tdrRouter.post('/prospects', async (req: Request, res: Response): Promise<void> => {
  const parsed = prospectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    const prospect = await prisma.prospect.create({
      data: {
        ...parsed.data,
        followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null,
        tdrId:   req.user!.userId,
        tdrName: req.user!.name,
        zone:    req.user!.zone || '',
      },
    });
    res.status(201).json(prospect);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create prospect' });
  }
});

// ─── GET /tdr/prospects ───────────────────────────────────────────────────────
tdrRouter.get('/prospects', async (req: Request, res: Response): Promise<void> => {
  const prospects = await prisma.prospect.findMany({
    where: { tdrId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(prospects);
});

// ─── GET /tdr/prospects/search?q= — find prospects by business/owner name ─────
// Used at agent creation: TDR types the name → prospect details auto-fill.
tdrRouter.get('/prospects/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) { res.json({ data: [] }); return; }
    const matches = await prisma.prospect.findMany({
      where: {
        // this TDR's prospects (their own prospecting pipeline)
        tdrId: req.user!.userId,
        status: { not: 'converted' },
        OR: [
          { businessName: { contains: q, mode: 'insensitive' } },
          { ownerName:    { contains: q, mode: 'insensitive' } },
          { contactPhone: { contains: q } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json({ data: matches });
  } catch (err) {
    res.status(500).json({ error: 'Prospect search failed' });
  }
});

// ─── POST /tdr/reactivations ──────────────────────────────────────────────────
const reactivationSchema = z.object({
  agentCode:    z.string().min(1),
  agentName:    z.string().min(1),
  contactPhone: z.string().min(1),
  town:         z.string().min(1),
  cluster:      z.string().optional(),
  market:       z.string().optional(),
  floatAmount:  z.number().default(0),
  latitude:     z.number().optional(),
  longitude:    z.number().optional(),
  notes:        z.string().optional(),
});

tdrRouter.post('/reactivations', async (req: Request, res: Response): Promise<void> => {
  const parsed = reactivationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    const tdrId = req.user!.userId;

    // Check if code is in non-transacting base → earns 5 NT points
    const ntRows = await prisma.$queryRaw<{ agent_code: string }[]>`
      SELECT agent_code FROM nt_codes WHERE agent_code = ${parsed.data.agentCode} LIMIT 1
    `;
    const isNtBase = ntRows.length > 0;
    const ntPoints = isNtBase ? 5 : 0;

    const record = await prisma.$queryRaw<any[]>`
      INSERT INTO reactivations
        ("id", "tdrId", "tdrName", zone, "agentCode", "agentName", "contactPhone", town, cluster, market,
         "floatAmount", latitude, longitude, notes, "isNtBase", "ntPoints", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid()::text, ${tdrId}, ${req.user!.name}, ${req.user!.zone || ''},
         ${parsed.data.agentCode}, ${parsed.data.agentName}, ${parsed.data.contactPhone},
         ${parsed.data.town}, ${parsed.data.cluster ?? null}, ${parsed.data.market ?? null},
         ${parsed.data.floatAmount}, ${parsed.data.latitude ?? null}, ${parsed.data.longitude ?? null},
         ${parsed.data.notes ?? null}, ${isNtBase}, ${ntPoints}, NOW(), NOW())
      RETURNING *
    `;
    res.status(201).json({ ...record[0], isNtBase, ntPoints });
  } catch (err) {
    console.error('Reactivation create error:', err);
    res.status(500).json({ error: 'Failed to record reactivation' });
  }
});

// ─── GET /tdr/reactivations ───────────────────────────────────────────────────
tdrRouter.get('/reactivations', async (req: Request, res: Response): Promise<void> => {
  const reactivations = await prisma.reactivation.findMany({
    where: { tdrId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(reactivations);
});

// ─── PATCH /tdr/prospects/:id ─────────────────────────────────────────────────
tdrRouter.patch('/prospects/:id', async (req: Request, res: Response): Promise<void> => {
  const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
  if (!prospect || prospect.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }

  const { status, notes, followUpDate } = req.body;
  const convertedAt = status === 'converted' && prospect.status !== 'converted' ? new Date() : undefined;

  const updated = await prisma.prospect.update({
    where: { id: req.params.id },
    data: {
      status:       status || undefined,
      notes:        notes  || undefined,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      convertedAt:  convertedAt,
    },
  });

  // Auto-create Agent record when prospect converts
  if (convertedAt) {
    const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: updated.zone } });
    await prisma.agent.create({
      data: {
        agentName:        updated.businessName,
        agentCode:        `CONV-${updated.id.slice(0, 8).toUpperCase()}`,
        contactPhone:     updated.contactPhone,
        type:             updated.prospectType === 'merchant' ? 'merchant' : 'normal',
        merchantCategory: updated.merchantCategory || undefined,
        initialFloat:     updated.estimatedFloat    || 0,
        town:             updated.town,
        address:          updated.address            || undefined,
        tdrId:            updated.tdrId,
        tdrName:          updated.tdrName,
        zone:             updated.zone,
        zbmName:          zbm?.name || '',
      },
    });
  }

  res.json(updated);
});

// ─── GET /tdr/agents/check-code ───────────────────────────────────────────────
// MUST remain before /agents/:id — checks a code against both agents table and nt_codes.
// Returns: { status: 'existing_agent'|'nt_base'|'not_found', agent?, ntRecord? }
tdrRouter.get('/agents/check-code', async (req: Request, res: Response): Promise<void> => {
  const code = ((req.query.code as string) || '').trim();
  if (!code) { res.status(400).json({ error: 'code query param required' }); return; }
  try {
    // 1. Check agents table — already registered?
    const agent = await prisma.agent.findUnique({ where: { agentCode: code } });
    if (agent) {
      // Find out who owns it
      const owner = await prisma.user.findUnique({ where: { id: agent.tdrId }, select: { name: true, zone: true } });
      res.json({
        status: 'existing_agent',
        agent: {
          agentCode:    agent.agentCode,
          agentName:    agent.agentName,
          type:         agent.type,
          zone:         agent.zone,
          town:         agent.town,
          tdrName:      agent.tdrName,
          tdrId:        agent.tdrId,
          ownerName:    owner?.name || agent.tdrName,
          createdAt:    agent.createdAt,
          registeredAt: agent.createdAt,
        },
      });
      return;
    }

    // 2. Check NT base — non-transacting pool
    const ntRows = await prisma.$queryRaw<{ agent_code: string; zone: string | null; agent_name: string | null; town: string | null; cluster: string | null; market: string | null }[]>`
      SELECT agent_code, zone, agent_name, town, cluster, market
      FROM nt_codes WHERE agent_code = ${code} LIMIT 1
    `;
    if (ntRows.length > 0) {
      res.json({ status: 'nt_base', ntRecord: ntRows[0] });
      return;
    }

    res.json({ status: 'not_found' });
  } catch (err) {
    console.error('check-code error:', err);
    res.status(500).json({ error: 'Check failed' });
  }
});

// ─── GET /tdr/agents/by-code/:code ────────────────────────────────────────────
tdrRouter.get('/agents/by-code/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await prisma.agent.findUnique({ where: { agentCode: req.params.code } });
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    // Include last visit info for stale detection + WHO last visited (the footprint stays, the visitor is shown)
    const lastVisit = await prisma.visit.findFirst({
      where:   { agentCode: agent.agentCode },
      orderBy: { createdAt: 'desc' },
      select:  { createdAt: true, tdrName: true, tdrId: true },
    });
    const lastVisitedAt   = lastVisit?.createdAt ?? null;
    // Last TDR to visit: prefer the most recent visit's TDR; fall back to the registering TDR
    const lastVisitedBy   = lastVisit?.tdrName ?? agent.tdrName;
    const lastVisitedById = lastVisit?.tdrId   ?? agent.tdrId;
    const daysAgo = lastVisitedAt
      ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
      : null;
    res.json({
      ...agent,
      registeredBy:    agent.tdrName,   // original footprint owner — never changes
      lastVisitedAt,
      lastVisitedBy,                    // most recent TDR to visit this outlet
      lastVisitedById,
      daysAgo,
      isStale: daysAgo === null || daysAgo >= 4,
    });
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ─── GET /tdr/agents/search?q= ── name OR code autocomplete (footprint lookup) ──
// Returns matching outlets so the form can auto-fill on entering a name or code.
tdrRouter.get('/agents/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) { res.json({ data: [] }); return; }
    const matches = await prisma.agent.findMany({
      where: {
        OR: [
          { agentName: { contains: q, mode: 'insensitive' } },
          { agentCode: { contains: q, mode: 'insensitive' } },
          { contactPhone: { contains: q } },
        ],
      },
      orderBy: { agentName: 'asc' },
      take: 10,
    });
    // attach last-visitor info for each match
    const enriched = await Promise.all(matches.map(async (a) => {
      const lv = await prisma.visit.findFirst({
        where: { agentCode: a.agentCode },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, tdrName: true },
      });
      return {
        ...a,
        registeredBy:  a.tdrName,
        lastVisitedAt: lv?.createdAt ?? null,
        lastVisitedBy: lv?.tdrName ?? a.tdrName,
      };
    }));
    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── DELETE /tdr/agents/:id ───────────────────────────────────────────────────
tdrRouter.delete('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.agent.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── PATCH /tdr/agents/:id ────────────────────────────────────────────────────
tdrRouter.patch('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent || agent.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    const { agentName, contactPhone, initialFloat, town, address, cluster, market, notes, latitude, longitude } = req.body;
    const updated = await prisma.agent.update({
      where: { id: req.params.id },
      data: { agentName, contactPhone, initialFloat, town, address, cluster, market, notes, latitude, longitude },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─── DELETE /tdr/visits/:id ───────────────────────────────────────────────────
tdrRouter.delete('/visits/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
    if (!visit || visit.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.visit.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── DELETE /tdr/prospects/:id ────────────────────────────────────────────────
tdrRouter.delete('/prospects/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
    if (!prospect || prospect.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.prospect.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── POST /tdr/prospects/:id/request-closure ─────────────────────────────────
tdrRouter.post('/prospects/:id/request-closure', async (req: Request, res: Response): Promise<void> => {
  try {
    const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
    if (!prospect || prospect.tdrId !== req.user!.userId) { res.status(404).json({ error: 'Not found' }); return; }
    const updated = await prisma.prospect.update({
      where: { id: req.params.id },
      data: { closedByTdr: true, zbmApprovalRequired: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to request closure' });
  }
});

// ─── GET /tdr/activities ─────────────────────────────────────────────────────
tdrRouter.get('/activities', async (req: Request, res: Response): Promise<void> => {
  try {
    const tdrId = req.user!.userId;
    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' }, take: 10 }),
      prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    const activities = [
      ...agents.map(a => ({ type: 'agent', id: a.id, label: a.agentName, sub: `${a.agentCode} · ${a.type} · ${a.town}`, ts: a.createdAt })),
      ...visits.map(v => ({ type: 'visit', id: v.id, label: v.outletName, sub: `Visit · ${v.town}`, ts: v.createdAt })),
      ...floatIssues.map(f => ({ type: 'float', id: f.id, label: f.agentName, sub: `Float Issue · ${f.status}`, ts: f.reportedAt })),
      ...prospects.map(p => ({ type: 'prospect', id: p.id, label: p.businessName, sub: `Prospect · ${p.status}`, ts: p.createdAt })),
    ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 20);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// ─── GET /tdr/export ─────────────────────────────────────────────────────────
tdrRouter.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const tdrId = req.user!.userId;
    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
      prisma.visit.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
      prisma.floatIssue.findMany({ where: { tdrId }, orderBy: { reportedAt: 'desc' } }),
      prisma.prospect.findMany({ where: { tdrId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agents.map(a => ({
      'Agent Name': a.agentName, 'Agent Code': a.agentCode, 'Type': a.type,
      'Town': a.town, 'Phone': a.contactPhone, 'Initial Float': a.initialFloat,
      'Cluster': a.cluster || '', 'Market': a.market || '',
      'Latitude': a.latitude || '', 'Longitude': a.longitude || '',
      'Date': new Date(a.createdAt).toLocaleDateString(),
    }))), 'Agents');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visits.map(v => ({
      'Outlet Name': v.outletName, 'Agent Code': v.agentCode, 'Town': v.town,
      'Float Amount': v.floatAmount, 'Phone': v.contactPhone,
      'Latitude': v.latitude || '', 'Longitude': v.longitude || '',
      'Date': new Date(v.createdAt).toLocaleDateString(),
    }))), 'Visits');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(floatIssues.map(f => ({
      'Agent Code': f.agentCode, 'Agent Name': f.agentName, 'Issue Type': f.issueType,
      'Status': f.status, 'Float': f.reportedFloat, 'Description': f.description,
      'Reported': new Date(f.reportedAt).toLocaleDateString(),
    }))), 'Float Issues');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prospects.map(p => ({
      'Business': p.businessName, 'Owner': p.ownerName, 'Type': p.prospectType,
      'Status': p.status, 'Town': p.town, 'Phone': p.contactPhone,
      'Follow-up': p.followUpDate ? new Date(p.followUpDate).toLocaleDateString() : '',
      'Notes': p.notes || '',
    }))), 'Prospects');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const month = new Date().toISOString().slice(0, 7);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="TDR-Export-${req.user!.name.replace(/\s+/g,'-')}-${month}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─── GET /tdr/visits/summary ──────────────────────────────────────────────────
// Returns weekly + monthly visit counts for the TDR
tdrRouter.get('/visits/summary', async (req: Request, res: Response): Promise<void> => {
  const tdrId = req.user!.userId;

  // Build last 8 weeks buckets
  const now = new Date();
  const weeks: { label: string; start: Date; end: Date }[] = [];
  for (let i = 7; i >= 0; i--) {
    const end   = new Date(now);
    end.setDate(end.getDate() - i * 7);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const label = `W${Math.ceil((start.getDate()) / 7)} ${start.toLocaleString('default', { month: 'short' })}`;
    weeks.push({ label, start, end });
  }

  const weeklyData = await Promise.all(weeks.map(async w => ({
    label: w.label,
    count: await prisma.visit.count({ where: { tdrId, createdAt: { gte: w.start, lte: w.end } } }),
  })));

  // Last 6 months
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    months.push({ label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), start, end });
  }

  const monthlyData = await Promise.all(months.map(async m => ({
    label: m.label,
    count: await prisma.visit.count({ where: { tdrId, createdAt: { gte: m.start, lte: m.end } } }),
  })));

  res.json({ weekly: weeklyData, monthly: monthlyData });
});

// ─── GET /tdr/agents/stale ────────────────────────────────────────────────────
// MUST be before /agents/:id — otherwise "stale" is treated as an ID
// This TDR's agents whose last visit was > 4 days ago (threshold: 4 days)
tdrRouter.get('/agents/stale', async (req: Request, res: Response): Promise<void> => {
  const tdrId  = req.user!.userId;

  const agents = await prisma.agent.findMany({ where: { tdrId }, orderBy: { agentName: 'asc' } });

  const enriched = await Promise.all(agents.map(async (a) => {
    const lastVisit = await prisma.visit.findFirst({
      where:   { tdrId, agentCode: a.agentCode },
      orderBy: { createdAt: 'desc' },
      select:  { createdAt: true },
    });
    const lastVisitedAt = lastVisit?.createdAt ?? null;
    const daysAgo = lastVisitedAt
      ? Math.floor((Date.now() - lastVisitedAt.getTime()) / 86400000)
      : null;
    return { ...a, lastVisitedAt, daysAgo, isStale: daysAgo === null || daysAgo >= 4 };
  }));

  const stale = enriched.filter(a => a.isStale);
  res.json({ stale, total: enriched.length, staleCount: stale.length });
});

// ─── GET /tdr/nt-codes/lookup ─────────────────────────────────────────────────
// Look up a code in the non-transacting base — returns zone/agent info if found
tdrRouter.get('/nt-codes/lookup', async (req: Request, res: Response): Promise<void> => {
  const code = ((req.query.code as string) || '').trim();
  if (!code) { res.status(400).json({ error: 'code query param required' }); return; }
  try {
    const rows = await prisma.$queryRaw<{agent_code:string;zone:string|null;agent_name:string|null;town:string|null;cluster:string|null;market:string|null}[]>`
      SELECT agent_code, zone, agent_name, town, cluster, market
      FROM nt_codes
      WHERE agent_code = ${code}
      LIMIT 1
    `;
    if (rows.length === 0) {
      res.json({ found: false });
    } else {
      res.json({ found: true, ...rows[0] });
    }
  } catch (err) {
    console.error('NT lookup error:', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ─── GET /tdr/agents/:id ──────────────────────────────────────────────────────
// Returns full agent detail including recent visits (joined via agentCode)
tdrRouter.get('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  const tdrId = req.user!.userId;
  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!agent || agent.tdrId !== tdrId) { res.status(404).json({ error: 'Not found' }); return; }

  const visits = await prisma.visit.findMany({
    where: { tdrId, agentCode: agent.agentCode },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({ ...agent, visits });
});
