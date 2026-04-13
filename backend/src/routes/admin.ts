import { Router, Request, Response } from 'express';
import { prisma }      from '../prisma';
import { requireAuth } from '../middleware/auth';

export const adminRouter = Router();

// Admin routes only accessible in non-production or with HSD role
adminRouter.use(requireAuth('HSD'));

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
