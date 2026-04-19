import { Router, Request, Response } from 'express';
import { prisma }       from '../prisma';
import { requireAuth }  from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';

export const aseRouter = Router();
aseRouter.use(requireAuth('ASE'));
aseRouter.use(apiRateLimit);

// ─── GET /ase/dashboard ───────────────────────────────────────────────────────
aseRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    // Find TDRs assigned to this ASE
    const tdrs = await prisma.user.findMany({
      where: { aseId: req.user!.userId, role: 'TDR', active: true },
    });

    const tdrIds = tdrs.map(t => t.id);

    // Get counts for each TDR
    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds } }, _count: true }),
      prisma.visit.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds } }, _count: true }),
      prisma.floatIssue.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds }, status: { not: 'resolved' } }, _count: true }),
      prisma.prospect.groupBy({ by: ['tdrId'], where: { tdrId: { in: tdrIds } }, _count: true }),
    ]);

    const tdrStats = tdrs.map(tdr => ({
      tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone },
      agents:      agents.find(a => a.tdrId === tdr.id)?._count ?? 0,
      visits:      visits.find(v => v.tdrId === tdr.id)?._count ?? 0,
      floatIssues: floatIssues.find(f => f.tdrId === tdr.id)?._count ?? 0,
      prospects:   prospects.find(p => p.tdrId === tdr.id)?._count ?? 0,
    }));

    res.json({ ase: { id: req.user!.userId, name: req.user!.name }, tdrStats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load ASE dashboard' });
  }
});

// ─── GET /ase/tdr/:id ─────────────────────────────────────────────────────────
aseRouter.get('/tdr/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify this TDR is assigned to the ASE
    const tdr = await prisma.user.findFirst({
      where: { id: req.params.id, aseId: req.user!.userId, role: 'TDR' },
    });
    if (!tdr) { res.status(403).json({ error: 'TDR not assigned to you' }); return; }

    const [agents, visits, floatIssues, prospects] = await Promise.all([
      prisma.agent.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.visit.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.floatIssue.findMany({ where: { tdrId: tdr.id }, orderBy: { reportedAt: 'desc' }, take: 20 }),
      prisma.prospect.findMany({ where: { tdrId: tdr.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    res.json({ tdr: { id: tdr.id, name: tdr.name, zone: tdr.zone }, agents, visits, floatIssues, prospects });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load TDR data' });
  }
});
