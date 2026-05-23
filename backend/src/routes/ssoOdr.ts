import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { mtdRange } from '../utils/mtd';

export const ssoOdrRouter = Router();
ssoOdrRouter.use(requireAuth('TDR', 'ASE', 'ZBM', 'HSD'));
ssoOdrRouter.use(apiRateLimit);

function zoneFilter(req: Request): string | null {
  const role = req.user!.role;
  if (role === 'HSD') return (req.query.zone as string) || null;
  return req.user!.zone || null;
}

// GET /sso-odr/summary
ssoOdrRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = zoneFilter(req);
    const role = req.user!.role;
    const { start, end } = mtdRange();
    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const tdrId = role === 'TDR' ? req.user!.userId : undefined;
    const aseId = role === 'ASE' ? req.user!.userId : undefined;
    const baseWhere: any = { active: true, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}), ...(aseId ? { aseId } : {}) };
    const mtdWhere = { ...baseWhere, createdAt: { gte: start, lte: end } };

    const [totalSso, totalOdr, mtdSso, mtdOdr] = await Promise.all([
      prisma.ssoOutlet.count({ where: baseWhere }),
      prisma.odrOutlet.count({ where: baseWhere }),
      prisma.ssoOutlet.count({ where: mtdWhere }),
      prisma.odrOutlet.count({ where: mtdWhere }),
    ]);

    let targetSso = 0, targetOdr = 0;
    if (zone && ['ZBM','HSD','ASE'].includes(role)) {
      const t = await prisma.ssoOdrTarget.findUnique({ where: { zone_period: { zone, period } } });
      targetSso = t?.targetSso ?? 0;
      targetOdr = t?.targetOdr ?? 0;
    }

    res.json({ success: true, data: { totalSso, totalOdr, mtdSso, mtdOdr, targetSso, targetOdr } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

// GET /sso-odr/sso
ssoOdrRouter.get('/sso', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = zoneFilter(req);
    const role = req.user!.role;
    const tdrId = role === 'TDR' ? req.user!.userId : undefined;
    const aseId = role === 'ASE' ? req.user!.userId : undefined;
    const data = await prisma.ssoOutlet.findMany({
      where: { active: true, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}), ...(aseId ? { aseId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /sso-odr/sso
ssoOdrRouter.post('/sso', async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user!.role;
    if (!['TDR','ASE'].includes(role)) { res.status(403).json({ error: 'TDR or ASE only' }); return; }
    const { outletName, ownerName, contactPhone, town, address, cluster, deviceType, msisdn, simSerial, imei, notes, latitude, longitude } = req.body;
    if (!outletName || !ownerName || !contactPhone || !town) { res.status(400).json({ error: 'Required fields missing' }); return; }
    const outlet = await prisma.ssoOutlet.create({ data: {
      tdrId: req.user!.userId, tdrName: req.user!.name, zone: req.user!.zone || '',
      aseId: role === 'ASE' ? req.user!.userId : null,
      aseName: role === 'ASE' ? req.user!.name : null,
      outletName, ownerName, contactPhone, town, address, cluster,
      deviceType: deviceType || 'SSO', msisdn, simSerial, imei, notes,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
    }});
    res.status(201).json({ success: true, data: outlet });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /sso-odr/odr
ssoOdrRouter.get('/odr', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = zoneFilter(req);
    const role = req.user!.role;
    const tdrId = role === 'TDR' ? req.user!.userId : undefined;
    const aseId = role === 'ASE' ? req.user!.userId : undefined;
    const data = await prisma.odrOutlet.findMany({
      where: { active: true, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}), ...(aseId ? { aseId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /sso-odr/odr
ssoOdrRouter.post('/odr', async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user!.role;
    if (!['TDR','ASE'].includes(role)) { res.status(403).json({ error: 'TDR or ASE only' }); return; }
    const { outletName, ownerName, contactPhone, town, address, cluster, deviceType, msisdn, simSerial, imei, notes, latitude, longitude } = req.body;
    if (!outletName || !ownerName || !contactPhone || !town) { res.status(400).json({ error: 'Required fields missing' }); return; }
    const outlet = await prisma.odrOutlet.create({ data: {
      tdrId: req.user!.userId, tdrName: req.user!.name, zone: req.user!.zone || '',
      aseId: role === 'ASE' ? req.user!.userId : null,
      aseName: role === 'ASE' ? req.user!.name : null,
      outletName, ownerName, contactPhone, town, address, cluster,
      deviceType: deviceType || 'Zamtel', msisdn, simSerial, imei, notes,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
    }});
    res.status(201).json({ success: true, data: outlet });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// DELETE /sso-odr/sso/:id — MUST be after static routes
ssoOdrRouter.delete('/sso/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const outlet = await prisma.ssoOutlet.findUnique({ where: { id: req.params.id } });
    if (!outlet) { res.status(404).json({ error: 'Not found' }); return; }
    if (req.user!.role === 'TDR' && outlet.tdrId !== req.user!.userId) { res.status(403).json({ error: 'Not your outlet' }); return; }
    await prisma.ssoOutlet.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// DELETE /sso-odr/odr/:id
ssoOdrRouter.delete('/odr/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const outlet = await prisma.odrOutlet.findUnique({ where: { id: req.params.id } });
    if (!outlet) { res.status(404).json({ error: 'Not found' }); return; }
    if (req.user!.role === 'TDR' && outlet.tdrId !== req.user!.userId) { res.status(403).json({ error: 'Not your outlet' }); return; }
    await prisma.odrOutlet.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /sso-odr/targets
ssoOdrRouter.get('/targets', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = zoneFilter(req);
    const period = (req.query.period as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    if (!zone) { res.json({ success: true, data: null }); return; }
    const target = await prisma.ssoOdrTarget.findUnique({ where: { zone_period: { zone, period } } });
    res.json({ success: true, data: target });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// POST /sso-odr/targets — ZBM/HSD sets targets
ssoOdrRouter.post('/targets', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!['ZBM','HSD'].includes(req.user!.role)) { res.status(403).json({ error: 'ZBM or HSD only' }); return; }
    const zone = req.user!.role === 'ZBM' ? (req.user!.zone || '') : (req.body.zone || '');
    const period = req.body.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const { targetSso, targetOdr } = req.body;
    if (!zone) { res.status(400).json({ error: 'zone required' }); return; }
    const target = await prisma.ssoOdrTarget.upsert({
      where: { zone_period: { zone, period } },
      create: { zone, period, targetSso: Number(targetSso)||10, targetOdr: Number(targetOdr)||10, setByZbmId: req.user!.userId },
      update: { targetSso: Number(targetSso)||10, targetOdr: Number(targetOdr)||10 },
    });
    res.json({ success: true, data: target });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

// GET /sso-odr/map
ssoOdrRouter.get('/map', async (req: Request, res: Response): Promise<void> => {
  try {
    const zone = zoneFilter(req);
    const role = req.user!.role;
    const tdrId = role === 'TDR' ? req.user!.userId : undefined;
    const where: any = { active: true, latitude: { not: null }, longitude: { not: null }, ...(zone ? { zone } : {}), ...(tdrId ? { tdrId } : {}) };
    const [sso, odr] = await Promise.all([
      prisma.ssoOutlet.findMany({ where, take: 500 }),
      prisma.odrOutlet.findMany({ where, take: 500 }),
    ]);
    res.json({ success: true, data: { sso, odr } });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});
