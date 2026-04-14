import { Router, Request, Response } from 'express';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';

export const adminRouter = Router();

// Admin routes accessible to HSD (full) and ZBM (zone-scoped add TDR)
adminRouter.use(requireAuth('HSD', 'ZBM'));

// ─── POST /admin/migrate-from-sheets ─────────────────────────────────────────
// Accepts a JSON body with rows exported from the Google Sheet CSV
// Expected format: { agents: Array, visits: Array }
adminRouter.post('/migrate-from-sheets', async (req: Request, res: Response): Promise<void> => {
  const { agents = [], visits = [] } = req.body as {
    agents?: Array<Record<string, string>>;
    visits?: Array<Record<string, string>>;
  };

  let agentCount = 0;
  let visitCount = 0;
  const errors: string[] = [];

  // Migrate agents
  for (const row of agents) {
    try {
      const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: row.zone || '' } });
      await prisma.agent.upsert({
        where: { agentCode: row.agentCode || `MIGRATED-${Date.now()}-${agentCount}` },
        update: {},
        create: {
          agentName:        row.agentName        || row.businessName || 'Unknown',
          agentCode:        row.agentCode        || `MIGRATED-${Date.now()}-${agentCount}`,
          contactPhone:     row.contactPhone     || row.phone || '',
          type:             (row.type as 'normal' | 'merchant') || 'normal',
          merchantCategory: row.merchantCategory || undefined,
          initialFloat:     parseFloat(row.initialFloat || '0') || 0,
          town:             row.town   || '',
          address:          row.address || undefined,
          cluster:          row.cluster || undefined,
          market:           row.market  || undefined,
          tdrId:            row.tdrId   || 'tdr-001',
          tdrName:          row.tdrName || '',
          zone:             row.zone    || '',
          zbmName:          zbm?.name   || '',
          notes:            row.notes   || undefined,
        },
      });
      agentCount++;
    } catch (e) {
      errors.push(`Agent ${row.agentCode}: ${(e as Error).message}`);
    }
  }

  // Migrate visits
  for (const row of visits) {
    try {
      const zbm = await prisma.user.findFirst({ where: { role: 'ZBM', zone: row.zone || '' } });
      await prisma.visit.create({
        data: {
          outletName:   row.outletName   || row.agentName || 'Unknown',
          agentCode:    row.agentCode    || '',
          contactPhone: row.contactPhone || '',
          town:         row.town         || '',
          cluster:      row.cluster      || undefined,
          market:       row.market       || undefined,
          floatAmount:  parseFloat(row.floatAmount || '0') || 0,
          tdrId:        row.tdrId        || 'tdr-001',
          tdrName:      row.tdrName      || '',
          zone:         row.zone         || '',
          zbmName:      zbm?.name        || '',
          notes:        row.notes        || undefined,
        },
      });
      visitCount++;
    } catch (e) {
      errors.push(`Visit ${row.agentCode}: ${(e as Error).message}`);
    }
  }

  res.json({
    message:    'Migration complete',
    agentCount,
    visitCount,
    errors: errors.slice(0, 50), // cap error list
  });
});

// ─── GET /admin/users ─────────────────────────────────────────────────────────
adminRouter.get('/users', async (_req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true, zone: true, active: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

// ─── POST /admin/users — Create TDR/ZBM account ───────────────────────────────
adminRouter.post('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, name, role, zone, pin } = req.body as {
      id: string; name: string; role: string; zone: string; pin: string;
    };
    if (!id || !name || !pin) {
      res.status(400).json({ error: 'id, name, and pin are required' }); return;
    }
    const bcrypt = await import('bcryptjs');
    const pinHash = await bcrypt.hash(pin, 10);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (existing) {
      res.status(409).json({ error: `User ID "${id}" already exists` }); return;
    }

    const user = await prisma.user.create({
      data: { id, name, role: role as 'TDR' | 'ZBM' | 'HSD', zone: zone || null, pin: pinHash, active: true },
    });
    res.status(201).json({ id: user.id, name: user.name, role: user.role, zone: user.zone });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── PATCH /admin/users/:id/pin — Reset PIN ────────────────────────────────────
adminRouter.patch('/users/:id/pin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pin } = req.body as { pin: string };
    if (!pin || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'PIN must be exactly 4 digits' }); return;
    }
    const bcrypt = await import('bcryptjs');
    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { pin: pinHash } });
    res.json({ success: true, message: `PIN reset for ${req.params.id}` });
  } catch {
    res.status(500).json({ error: 'Failed to reset PIN' });
  }
});

// ─── DELETE /admin/users/:id — Delete user ─────────────────────────────────────
adminRouter.delete('/users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const requester = (req as any).user;
    if (req.params.id === requester.userId) {
      res.status(400).json({ error: 'Cannot delete yourself' }); return;
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'User not found or could not be deleted' });
  }
});
