/**
 * DM (Device Manager) routes — Sera Tamina's dashboard
 * Access: view all KYC devices, add devices, log follow-ups
 */
import { Router, Request, Response } from 'express';
import { prisma }       from '../prisma';
import { requireAuth }  from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';

export const dmRouter = Router();
dmRouter.use(requireAuth('DM', 'HSD'));   // HSD can also access
dmRouter.use(apiRateLimit);

const ZONES = [
  'Central','Copperbelt','Eastern','Luapula',
  'Lusaka North','Lusaka South','Muchinga',
  'North-Western','Northern','Southern','Western',
];

// ─── GET /dm/dashboard — summary cards + zone breakdown ──────────────────────
dmRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const [summary, byZone, bySource, recentlyAdded] = await Promise.all([
      // National totals
      prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*)::int                                          AS total,
          SUM("activityStatus")::int                            AS active,
          COUNT(*) - SUM("activityStatus")                      AS inactive,
          SUM("kycReg")::int                                    AS total_kyc,
          SUM("grossAdds")::int                                 AS total_ga,
          SUM("zamoGA")::int                                    AS total_zamo,
          ROUND(SUM("recharges")::numeric,2)                    AS total_recharges,
          ROUND(SUM("activityStatus")::numeric/NULLIF(COUNT(*),0)*100,1) AS activity_pct
        FROM kyc_devices
      `,
      // By zone
      prisma.$queryRaw<any[]>`
        SELECT
          zone,
          COUNT(*)::int                                          AS total,
          SUM("activityStatus")::int                            AS active,
          COUNT(*) - SUM("activityStatus")                      AS inactive,
          SUM("kycReg")::int                                    AS kyc,
          SUM("grossAdds")::int                                 AS ga,
          ROUND(SUM("activityStatus")::numeric/NULLIF(COUNT(*),0)*100,1) AS pct
        FROM kyc_devices
        GROUP BY zone
        ORDER BY total DESC
      `,
      // By device source
      prisma.$queryRaw<any[]>`
        SELECT
          "deviceSource" AS source,
          COUNT(*)::int  AS total,
          SUM("activityStatus")::int AS active
        FROM kyc_devices GROUP BY "deviceSource" ORDER BY total DESC
      `,
      // Most recently added (manual entries)
      prisma.$queryRaw<any[]>`
        SELECT id,"dealerCode","imei1","aseName","teamLead","zone","deviceSource",
               "activityStatus","kycReg","grossAdds","status","createdAt"
        FROM kyc_devices
        ORDER BY "createdAt" DESC LIMIT 10
      `,
    ]);

    res.json({
      summary: summary[0] || {},
      byZone,
      bySource,
      recentlyAdded,
      zones: ZONES,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load DM dashboard' });
  }
});

// ─── GET /dm/devices — paginated device list with search & filters ────────────
dmRouter.get('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(200, parseInt(req.query.limit as string) || 50);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').replace(/'/g, "''");
    const zone   = (req.query.zone   as string || '').replace(/'/g, "''");
    const source = (req.query.source as string || '').replace(/'/g, "''");
    const status = req.query.status as string | undefined;
    const ase    = (req.query.ase    as string || '').replace(/'/g, "''");

    const conds: string[] = [];
    if (zone)   conds.push(`LOWER(zone) = LOWER('${zone}')`);
    if (source) conds.push(`"deviceSource" = '${source}'`);
    if (ase)    conds.push(`"aseName" ILIKE '%${ase}%'`);
    if (status === 'active')   conds.push(`"activityStatus" = 1`);
    if (status === 'inactive') conds.push(`"activityStatus" = 0`);
    if (search) conds.push(
      `("dealerCode" ILIKE '%${search}%' OR imei1 ILIKE '%${search}%' OR ` +
      `"aseName" ILIKE '%${search}%' OR "teamLead" ILIKE '%${search}%' OR ` +
      `zone ILIKE '%${search}%' OR "msisdn" ILIKE '%${search}%')`
    );
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows, cnt] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT id,"dealerCode","description","imei1","imei2","msisdn","simSerial",` +
        `"aseName","teamLead","zone","region","status","activityStatus","deviceSource",` +
        `"kycReg","grossAdds","zamoGA","recharges","createdAt","updatedAt"` +
        ` FROM kyc_devices ${where}` +
        ` ORDER BY "activityStatus" DESC,"createdAt" DESC LIMIT ${limit} OFFSET ${offset}`
      ),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as cnt, SUM("activityStatus")::int as active FROM kyc_devices ${where}`
      ),
    ]);
    const total  = (cnt as any[])[0]?.cnt    || 0;
    const active = (cnt as any[])[0]?.active || 0;
    res.json({ success: true, data: rows, total, active, inactive: total - active, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load devices' });
  }
});

// ─── POST /dm/devices — add a new device ─────────────────────────────────────
dmRouter.post('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      dealerCode, description, imei1, imei2, msisdn, simSerial, siteId,
      region, zone, aseName, teamLead, status, activityStatus,
      kycReg, grossAdds, zamoGA, recharges, deviceSource,
    } = req.body as Record<string, any>;

    if (!imei1?.trim()) { res.status(400).json({ error: 'IMEI 1 is required' }); return; }
    if (!zone?.trim())  { res.status(400).json({ error: 'Zone is required' }); return; }

    const existing = await prisma.$queryRaw<any[]>`SELECT id FROM kyc_devices WHERE imei1=${imei1} LIMIT 1`;
    if (existing.length > 0) {
      res.status(409).json({ error: `Device with IMEI ${imei1} already exists` });
      return;
    }

    const result = await prisma.$queryRaw<any[]>`
      INSERT INTO kyc_devices
        (id,"dealerCode","description","imei1","imei2","msisdn","simSerial","siteId",
         "region","zone","rbmName","aseName","teamLead","status","activityStatus",
         "kycReg","grossAdds","zamoGA","recharges","deviceSource","createdAt","updatedAt")
      VALUES (
        gen_random_uuid(),
        ${dealerCode||null},${description||'Manual Entry'},${imei1.trim()},${imei2||null},
        ${msisdn||null},${simSerial||null},${siteId||null},
        ${region||zone},${zone},${req.user!.name},
        ${aseName||null},${teamLead||null},${status||'ACTIVE'},
        ${Number(activityStatus)||0},${Number(kycReg)||0},${Number(grossAdds)||0},
        ${Number(zamoGA)||0},${Number(recharges)||0},${deviceSource||'MobiGO2+'},
        NOW(),NOW()
      )
      RETURNING id,"dealerCode","imei1","aseName","zone","deviceSource","createdAt"
    `;
    res.status(201).json({ success: true, data: result[0], message: 'Device registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// ─── PATCH /dm/devices/:id — update activity status / follow-up notes ────────
dmRouter.patch('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityStatus, status, kycReg, grossAdds, zamoGA, recharges, aseName, teamLead } = req.body as Record<string, any>;
    const check = await prisma.$queryRaw<any[]>`SELECT id FROM kyc_devices WHERE id=${req.params.id} LIMIT 1`;
    if (!check.length) { res.status(404).json({ error: 'Device not found' }); return; }

    const updates: string[] = [`"updatedAt" = NOW()`];
    if (activityStatus !== undefined) updates.push(`"activityStatus" = ${Number(activityStatus)}`);
    if (status    !== undefined) updates.push(`"status" = '${String(status).replace(/'/g,"''")}'`);
    if (kycReg    !== undefined) updates.push(`"kycReg" = ${Number(kycReg)}`);
    if (grossAdds !== undefined) updates.push(`"grossAdds" = ${Number(grossAdds)}`);
    if (zamoGA    !== undefined) updates.push(`"zamoGA" = ${Number(zamoGA)}`);
    if (recharges !== undefined) updates.push(`"recharges" = ${Number(recharges)}`);
    if (aseName   !== undefined) updates.push(`"aseName" = '${String(aseName).replace(/'/g,"''")}'`);
    if (teamLead  !== undefined) updates.push(`"teamLead" = '${String(teamLead).replace(/'/g,"''")}'`);

    await prisma.$queryRawUnsafe(`UPDATE kyc_devices SET ${updates.join(', ')} WHERE id='${req.params.id}'`);
    res.json({ success: true, message: 'Device updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// ─── DELETE /dm/devices/:id ───────────────────────────────────────────────────
dmRouter.delete('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const check = await prisma.$queryRaw<any[]>`SELECT id FROM kyc_devices WHERE id=${req.params.id} LIMIT 1`;
    if (!check.length) { res.status(404).json({ error: 'Device not found' }); return; }
    await prisma.$queryRaw`DELETE FROM kyc_devices WHERE id=${req.params.id}`;
    res.json({ success: true, message: 'Device removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// ─── GET /dm/ases — list all ASE names for autocomplete ──────────────────────
dmRouter.get('/ases', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = (req.query.zone as string || '').replace(/'/g, "''");
    const where = zone ? `WHERE LOWER(zone) = LOWER('${zone}')` : '';
    const rows = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT "aseName", zone FROM kyc_devices ${where} WHERE "aseName" IS NOT NULL ORDER BY zone,"aseName"`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load ASEs' });
  }
});
