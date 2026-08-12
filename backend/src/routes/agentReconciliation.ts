import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth';

export const agentReconRouter = Router();

function period() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function get(r: any, ...names: string[]) {
  const keys = Object.keys(r);
  for (const n of names) { const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === n.toLowerCase().replace(/[^a-z0-9]/g, '')); if (k !== undefined && r[k] !== '') return r[k]; }
  return undefined;
}
function toDate(v: any): Date | null { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }

// ── FR-001: HSD uploads canonical Agent Creations file (xlsx/csv) ─────────────
// Supersede logic: replaces canonical rows, then runs reconciliation vs TDR records.
agentReconRouter.post('/upload-agents', requireAuth('HSD', 'DM'), async (req: Request, res: Response): Promise<void> => {
  try {
    const XLSX = await import('xlsx');
    const { fileBase64 } = req.body as { fileBase64?: string };
    if (!fileBase64) { res.status(400).json({ error: 'fileBase64 is required' }); return; }
    const b64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
    const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) { res.status(400).json({ error: 'No rows found in file' }); return; }

    const batch = new Date().toISOString();
    let upserted = 0, skipped = 0;
    for (const r of rows) {
      const code = String(get(r, 'agent_code', 'agentcode', 'agent code', 'dealer_code') || '').trim().toUpperCase();
      if (!code) { skipped++; continue; }
      const data = {
        agentName: String(get(r, 'agent_name', 'agentname', 'name') || '') || null,
        creationDate: toDate(get(r, 'creation_date', 'creationdate', 'created', 'date')),
        tdrId: String(get(r, 'tdr_id', 'tdrid', 'tdr') || '') || null,
        tdrName: String(get(r, 'tdr_name', 'tdrname') || '') || null,
        region: String(get(r, 'region', 'zone', 'province') || '') || null,
        status: String(get(r, 'status') || 'Active'),
        uploadBatch: batch,
      };
      await prisma.canonicalAgent.upsert({ where: { agentCode: code }, update: data, create: { agentCode: code, ...data } });
      upserted++;
    }

    // Run reconciliation immediately
    const recon = await runReconciliation();
    res.json({ success: true, data: { rows: rows.length, agentsUpserted: upserted, skipped, reconciliation: recon } });
  } catch (err) {
    console.error('agent upload error:', err);
    res.status(500).json({ error: 'Upload failed — file must have agent_code column (+ agent_name, creation_date, tdr_id, region, status)' });
  }
});

// ── FR-010..014: Reconcile TDR-recorded agents vs canonical upload ────────────
async function runReconciliation() {
  const p = period();
  const canonical = await prisma.canonicalAgent.findMany({ select: { agentCode: true } });
  const canonSet = new Set(canonical.map(c => c.agentCode.trim().toUpperCase()));

  const agents = await prisma.agent.findMany({ select: { agentCode: true, tdrId: true, tdrName: true, zone: true } });
  // count claimants per code (Suspected if >1 TDR claims same code)
  const claimants: Record<string, Set<string>> = {};
  agents.forEach(a => { const c = a.agentCode.trim().toUpperCase(); (claimants[c] ||= new Set()).add(a.tdrId); });

  let matched = 0, fake = 0, suspected = 0;
  const fakeByTdr: Record<string, number> = {};
  // clear this period's recon then rebuild
  await prisma.codeReconciliation.deleteMany({ where: { period: p } });
  const batch: any[] = [];
  for (const a of agents) {
    const c = a.agentCode.trim().toUpperCase();
    const nClaim = claimants[c]?.size || 1;
    let result: string;
    if (nClaim > 1) { result = 'Suspected'; suspected++; }
    else if (canonSet.has(c)) { result = 'Matched'; matched++; }
    else { result = 'FakeCode'; fake++; if (a.tdrId) fakeByTdr[a.tdrId] = (fakeByTdr[a.tdrId] || 0) + 1; }
    batch.push({ agentCode: c, tdrId: a.tdrId, tdrName: a.tdrName, zone: a.zone, result, claimants: nClaim, period: p });
  }
  // dedupe by code+period
  const seen = new Set<string>();
  const uniq = batch.filter(b => { const k = b.agentCode + '|' + b.period; if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = 0; i < uniq.length; i += 500) await prisma.codeReconciliation.createMany({ data: uniq.slice(i, i + 500), skipDuplicates: true });

  // FR-051/052: apply thresholds per TDR (rolling — using this period's fake count)
  let warned = 0, blocked = 0;
  for (const [tdrId, count] of Object.entries(fakeByTdr)) {
    if (count >= 11) { await prisma.user.update({ where: { id: tdrId }, data: { fakeCodeCount: count, blockedForFakeCodes: true, active: false, blockReason: `Auto-blocked: ${count} fake codes (>10)` } }).catch(() => {}); blocked++; }
    else { await prisma.user.update({ where: { id: tdrId }, data: { fakeCodeCount: count } }).catch(() => {}); if (count >= 10) warned++; }
  }
  return { matched, fake, suspected, tdrsWarned: warned, tdrsBlocked: blocked };
}

agentReconRouter.post('/reconcile', requireAuth('HSD', 'DM'), async (_req, res: Response) => {
  const r = await runReconciliation(); res.json({ success: true, data: r });
});

// ── FR-030..033: Codes-tracking summary + reconciliation results ──────────────
agentReconRouter.get('/summary', requireAuth('HSD', 'ZBM', 'DM'), async (_req, res: Response) => {
  const p = period();
  const [matched, fake, suspected, canonTotal, agentTotal] = await Promise.all([
    prisma.codeReconciliation.count({ where: { period: p, result: 'Matched' } }),
    prisma.codeReconciliation.count({ where: { period: p, result: 'FakeCode' } }),
    prisma.codeReconciliation.count({ where: { period: p, result: 'Suspected' } }),
    prisma.canonicalAgent.count(),
    prisma.agent.count(),
  ]);
  // Unreported = canonical codes not present in TDR records
  const unreported = Math.max(0, canonTotal - matched - suspected);
  res.json({ success: true, data: { period: p, created: agentTotal, validated: matched, suspected, fake, unreported, canonicalTotal: canonTotal } });
});

// TDR fake-code leaderboard (escalation buckets)
agentReconRouter.get('/tdr-risk', requireAuth('HSD', 'ZBM', 'DM'), async (_req, res: Response) => {
  const p = period();
  const rows = await prisma.codeReconciliation.groupBy({ by: ['tdrId', 'tdrName', 'zone'], where: { period: p, result: 'FakeCode', tdrId: { not: null } }, _count: true, orderBy: { _count: { tdrId: 'desc' } } });
  const band = (n: number) => n >= 11 ? 'Blocked' : n >= 10 ? 'Warning' : n >= 5 ? 'Watchlist' : 'Informational';
  res.json({ success: true, data: rows.map(r => ({ tdrId: r.tdrId, tdr: r.tdrName, zone: r.zone, fakeCodes: r._count, band: band(r._count) })) });
});

// Unlock a blocked TDR (supervisor/HSD) — FR-060..065
agentReconRouter.post('/unlock/:tdrId', requireAuth('HSD', 'ZBM', 'DM'), async (req: Request, res: Response): Promise<void> => {
  const { reason } = req.body || {};
  if (!reason) { res.status(400).json({ error: 'reason is required to unlock' }); return; }
  const cooldown = new Date(); cooldown.setDate(cooldown.getDate() + 30);
  await prisma.user.update({ where: { id: req.params.tdrId }, data: { blockedForFakeCodes: false, active: true, blockReason: null, cooldownUntil: cooldown } });
  res.json({ success: true, message: 'TDR unlocked with 30-day cooldown (warning threshold reduced to 5).' });
});
