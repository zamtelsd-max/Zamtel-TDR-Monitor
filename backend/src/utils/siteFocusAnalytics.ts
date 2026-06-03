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
}

interface AseRef { id: string; name: string; zone?: string | null }

const PER_SITE = (s: SiteRow): number => {
  const parts = [
    Math.min(s.agentsRec / 3 * 100, 100),
    Math.min(s.ssosRec   / 2 * 100, 100),
    Math.min(s.odrsRec   / 1 * 100, 100),
    Math.min(s.dataActs  / 15 * 100, 100),
    Math.min(s.dtuSold   / 500 * 100, 100),
  ];
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
};

export function buildSiteFocusAnalytics(sites: SiteRow[], ases: AseRef[]) {
  const aseMap = Object.fromEntries(ases.map(a => [a.id, a]));
  const visited = sites.filter(s => s.status === 'visited');
  const planned = sites.filter(s => s.status === 'planned');

  // Totals across visited sites (actual deliverables)
  const totals = visited.reduce((acc, s) => {
    acc.agents += s.agentsRec; acc.ssos += s.ssosRec; acc.odrs += s.odrsRec;
    acc.dataActs += s.dataActs; acc.dtu += s.dtuSold;
    return acc;
  }, { agents: 0, ssos: 0, odrs: 0, dataActs: 0, dtu: 0 });

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
      planned: 0, visited: 0, agents: 0, ssos: 0, odrs: 0, dataActs: 0, dtu: 0, scoreSum: 0,
    };
    const row = byAseMap[k];
    if (s.status === 'visited') {
      row.visited++; row.agents += s.agentsRec; row.ssos += s.ssosRec;
      row.odrs += s.odrsRec; row.dataActs += s.dataActs; row.dtu += s.dtuSold;
      row.scoreSum += PER_SITE(s);
    } else { row.planned++; }
  }
  const byAse = Object.values(byAseMap).map((r: any) => ({
    aseId: r.aseId, aseName: r.aseName, zone: r.zone,
    planned: r.planned, visited: r.visited,
    totalSites: r.planned + r.visited,
    agents: r.agents, ssos: r.ssos, odrs: r.odrs, dataActs: r.dataActs, dtu: r.dtu,
    avgScore: r.visited ? Math.round(r.scoreSum / r.visited) : 0,
  })).sort((a, b) => b.avgScore - a.avgScore || b.visited - a.visited);

  // Deliverable target attainment (per-visited-site targets × visited count)
  const tgt = visited.length;
  const attainment = {
    agents:   tgt ? Math.min(Math.round(totals.agents   / (3 * tgt)  * 100), 100) : 0,
    ssos:     tgt ? Math.min(Math.round(totals.ssos     / (2 * tgt)  * 100), 100) : 0,
    odrs:     tgt ? Math.min(Math.round(totals.odrs     / (1 * tgt)  * 100), 100) : 0,
    dataActs: tgt ? Math.min(Math.round(totals.dataActs / (15 * tgt) * 100), 100) : 0,
    dtu:      tgt ? Math.min(Math.round(totals.dtu      / (500 * tgt)* 100), 100) : 0,
  };

  return {
    summary: {
      totalSites:   sites.length,
      plannedSites: planned.length,
      visitedSites: visited.length,
      completionRate,
      avgSiteScore,
      activeAses:   byAse.filter((a: any) => a.totalSites > 0).length,
    },
    totals,
    attainment,
    byAse,
  };
}
