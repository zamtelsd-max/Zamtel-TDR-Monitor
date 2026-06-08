// Shared Site Focus analytics builder — used by ZBM (zone) and HSD (national) views.

interface SiteRow {
  aseId: string;
  status?: string | null;
  siteName: string;
  siteId: string;
  agentsRec: number;
  ssosRec: number;
  odrsRec: number;
  dataActs: number;
  dtuSold: number;
  zmGrossAdds?: number | null;
  siteType?: string | null;
  carryCount?: number | null;
  plannedDate?: Date | string | null;
}

interface AseRef { id: string; name: string; zone?: string | null }

const zmTargetFor = (s: SiteRow): number => (s.siteType === 'rural') ? 30 : 50;

const PER_SITE = (s: SiteRow): number => {
  const parts = [
    Math.min(s.agentsRec / 3 * 100, 100),
    Math.min(s.ssosRec   / 2 * 100, 100),
    Math.min(s.odrsRec   / 1 * 100, 100),
    Math.min(s.dataActs  / 15 * 100, 100),
    Math.min(s.dtuSold   / 500 * 100, 100),
    Math.min((s.zmGrossAdds || 0) / zmTargetFor(s) * 100, 100),
  ];
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
};

export function buildSiteFocusAnalytics(sites: SiteRow[], ases: AseRef[]) {
  const aseMap = Object.fromEntries(ases.map(a => [a.id, a]));
  const visited = sites.filter(s => s.status === 'visited');
  const planned = sites.filter(s => s.status === 'planned');
  const now = new Date();
  const overdue = planned.filter(s => (s.carryCount || 0) > 0 || (s.plannedDate ? new Date(s.plannedDate) < now : false));

  // Totals across visited sites (actual deliverables)
  const totals = visited.reduce((acc, s) => {
    acc.agents += s.agentsRec; acc.ssos += s.ssosRec; acc.odrs += s.odrsRec;
    acc.dataActs += s.dataActs; acc.dtu += s.dtuSold; acc.zmGa += (s.zmGrossAdds || 0);
    return acc;
  }, { agents: 0, ssos: 0, odrs: 0, dataActs: 0, dtu: 0, zmGa: 0 });
  // Sum of per-site ZM GA targets (30 rural / 50 urban) across visited sites
  const zmTargetTotal = visited.reduce((a, s) => a + zmTargetFor(s), 0);

  const avgSiteScore = visited.length
    ? Math.round(visited.reduce((a, s) => a + PER_SITE(s), 0) / visited.length)
    : 0;

  const completionRate = sites.length
    ? Math.round(visited.length / sites.length * 100)
    : 0;

  // Per-ASE breakdown
  const byAseMap: Record<string, any> = {};
  for (const s of sites) {
    const k = s.aseId;
    if (!byAseMap[k]) byAseMap[k] = {
      aseId: k, aseName: aseMap[k]?.name || k, zone: aseMap[k]?.zone || '',
      planned: 0, visited: 0, agents: 0, ssos: 0, odrs: 0, dataActs: 0, dtu: 0, zmGa: 0, zmTgt: 0, scoreSum: 0,
    };
    const row = byAseMap[k];
    if (s.status === 'visited') {
      row.visited++; row.agents += s.agentsRec; row.ssos += s.ssosRec;
      row.odrs += s.odrsRec; row.dataActs += s.dataActs; row.dtu += s.dtuSold;
      row.zmGa += (s.zmGrossAdds || 0); row.zmTgt += zmTargetFor(s);
      row.scoreSum += PER_SITE(s);
    } else { row.planned++; }
  }
  const WEEKLY_SITES = 5; // sites per week target
  const byAse = Object.values(byAseMap).map((r: any) => {
    const v = r.visited;
    // Weekly target = 5 sites × per-site deliverable target (ZM GA uses 50/urban default avg)
    const tgtAgents = WEEKLY_SITES * 3, tgtSsos = WEEKLY_SITES * 2, tgtOdrs = WEEKLY_SITES * 1;
    const tgtData = WEEKLY_SITES * 15, tgtDtu = WEEKLY_SITES * 500;
    // ZM GA target: use the actual mix where recorded, else 50/site default
    const tgtZmGa = r.zmTgt > 0 ? r.zmTgt + (WEEKLY_SITES - v) * 50 : WEEKLY_SITES * 50;
    const pend = (target: number, actual: number) => Math.max(target - actual, 0);
    return {
      aseId: r.aseId, aseName: r.aseName, zone: r.zone,
      planned: r.planned, visited: v, totalSites: r.planned + v,
      sitesTarget: WEEKLY_SITES, sitesPending: pend(WEEKLY_SITES, v),
      agents: r.agents, ssos: r.ssos, odrs: r.odrs, dataActs: r.dataActs, dtu: r.dtu, zmGa: r.zmGa,
      targets:  { sites: WEEKLY_SITES, agents: tgtAgents, ssos: tgtSsos, odrs: tgtOdrs, dataActs: tgtData, dtu: tgtDtu, zmGa: tgtZmGa },
      pending:  { sites: pend(WEEKLY_SITES, v), agents: pend(tgtAgents, r.agents), ssos: pend(tgtSsos, r.ssos), odrs: pend(tgtOdrs, r.odrs), dataActs: pend(tgtData, r.dataActs), dtu: pend(tgtDtu, r.dtu), zmGa: pend(tgtZmGa, r.zmGa) },
      avgScore: v ? Math.round(r.scoreSum / v) : 0,
    };
  }).sort((a, b) => b.avgScore - a.avgScore || b.visited - a.visited);

  // Deliverable target attainment (per-visited-site targets × visited count)
  const tgt = visited.length;
  const attainment = {
    agents:   tgt ? Math.min(Math.round(totals.agents   / (3 * tgt)  * 100), 100) : 0,
    ssos:     tgt ? Math.min(Math.round(totals.ssos     / (2 * tgt)  * 100), 100) : 0,
    odrs:     tgt ? Math.min(Math.round(totals.odrs     / (1 * tgt)  * 100), 100) : 0,
    dataActs: tgt ? Math.min(Math.round(totals.dataActs / (15 * tgt) * 100), 100) : 0,
    dtu:      tgt ? Math.min(Math.round(totals.dtu      / (500 * tgt)* 100), 100) : 0,
    zmGa:     zmTargetTotal ? Math.min(Math.round(totals.zmGa / zmTargetTotal * 100), 100) : 0,
  };

  // ── Zone roll-up (build-up from ASE → Zone) ──────────────────────────────
  const zoneMap: Record<string, any> = {};
  for (const s of sites) {
    const z = aseMap[s.aseId]?.zone || 'Unassigned';
    if (!zoneMap[z]) zoneMap[z] = {
      zone: z, aseIds: new Set<string>(), planned: 0, visited: 0,
      agents: 0, ssos: 0, odrs: 0, dataActs: 0, dtu: 0, zmGa: 0, zmTgt: 0, scoreSum: 0,
    };
    const r = zoneMap[z];
    r.aseIds.add(s.aseId);
    if (s.status === 'visited') {
      r.visited++; r.agents += s.agentsRec; r.ssos += s.ssosRec; r.odrs += s.odrsRec;
      r.dataActs += s.dataActs; r.dtu += s.dtuSold; r.zmGa += (s.zmGrossAdds || 0);
      r.zmTgt += zmTargetFor(s); r.scoreSum += PER_SITE(s);
    } else { r.planned++; }
  }
  const byZone = Object.values(zoneMap).map((r: any) => {
    const v = r.visited;
    return {
      zone: r.zone, ases: r.aseIds.size,
      planned: r.planned, visited: v, totalSites: r.planned + v,
      agents: r.agents, ssos: r.ssos, odrs: r.odrs, dataActs: r.dataActs, dtu: r.dtu, zmGa: r.zmGa,
      // achievement % vs per-site targets × visited count
      attainment: {
        agents:   v ? Math.min(Math.round(r.agents   / (3 * v)   * 100), 100) : 0,
        ssos:     v ? Math.min(Math.round(r.ssos     / (2 * v)   * 100), 100) : 0,
        odrs:     v ? Math.min(Math.round(r.odrs     / (1 * v)   * 100), 100) : 0,
        dataActs: v ? Math.min(Math.round(r.dataActs / (15 * v)  * 100), 100) : 0,
        dtu:      v ? Math.min(Math.round(r.dtu      / (500 * v) * 100), 100) : 0,
        zmGa:     r.zmTgt ? Math.min(Math.round(r.zmGa / r.zmTgt * 100), 100) : 0,
      },
      avgScore: v ? Math.round(r.scoreSum / v) : 0,
    };
  }).sort((a, b) => b.avgScore - a.avgScore);

  // ── Top sites by activity (visited only) ─────────────────────────────────
  // Activity = sum of all deliverables actually achieved at the site.
  const topSites = visited.map((s: any) => ({
    siteName: s.siteName, siteId: s.siteId, siteType: s.siteType || 'urban',
    aseName: aseMap[s.aseId]?.name || s.aseId, zone: aseMap[s.aseId]?.zone || '',
    agents: s.agentsRec, ssos: s.ssosRec, odrs: s.odrsRec, dataActs: s.dataActs,
    dtu: s.dtuSold, zmGa: s.zmGrossAdds || 0,
    score: PER_SITE(s),
    // composite activity metric (raw deliverable units)
    activity: (s.agentsRec || 0) + (s.ssosRec || 0) + (s.odrsRec || 0) + (s.dataActs || 0) + (s.zmGrossAdds || 0),
    latitude: s.latitude ?? null, longitude: s.longitude ?? null,
  })).sort((a, b) => b.activity - a.activity || b.score - a.score).slice(0, 40);

  return {
    summary: {
      totalSites:   sites.length,
      plannedSites: planned.length,
      visitedSites: visited.length,
      overdueSites: overdue.length,
      completionRate,
      avgSiteScore,
      activeAses:   byAse.filter((a: any) => a.totalSites > 0).length,
    },
    totals,
    attainment,
    byAse,
    byZone,
    topSites,
  };
}
