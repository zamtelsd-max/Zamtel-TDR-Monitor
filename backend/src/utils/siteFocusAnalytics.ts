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

// Build a multi-sheet analytical Excel workbook (XLSX) from sites + analytics.
export function buildSiteFocusWorkbook(XLSX: any, sites: any[], ases: AseRef[], scope: string, period: string) {
  const a = buildSiteFocusAnalytics(sites, ases);
  const aseMap = Object.fromEntries(ases.map(x => [x.id, x]));
  const wb = XLSX.utils.book_new();
  const aoa = (rows: any[][]) => XLSX.utils.aoa_to_sheet(rows);

  // ── Sheet 1: Executive Summary ──
  const s = a.summary; const t = a.totals; const at = a.attainment;
  const summary: any[][] = [
    ['ZAMTEL SITE FOCUS — SUMMARY REPORT'],
    ['Scope', scope, '', 'Period', period, '', 'Generated', new Date().toISOString().split('T')[0]],
    [],
    ['KEY METRICS'],
    ['Total Sites', s.totalSites],
    ['Visited', s.visitedSites],
    ['Planned (pending)', s.plannedSites],
    ['Overdue', s.overdueSites],
    ['Completion Rate %', s.completionRate],
    ['Avg Site Score %', s.avgSiteScore],
    ['Active ASEs', s.activeAses],
    [],
    ['DELIVERABLES — ACTUAL vs ATTAINMENT (visited sites)'],
    ['Deliverable', 'Actual', 'Attainment %'],
    ['Agents (tgt 3/site)', t.agents, at.agents],
    ['SSOs (tgt 2/site)', t.ssos, at.ssos],
    ['ODRs (tgt 1/site)', t.odrs, at.odrs],
    ['Data Acts (tgt 15/site)', t.dataActs, at.dataActs],
    ['DTU ZMW (tgt 500/site)', t.dtu, at.dtu],
    ['ZM Gross Adds (30 rural/50 urban)', t.zmGa, at.zmGa],
  ];
  XLSX.utils.book_append_sheet(wb, aoa(summary), 'Summary');

  // ── Sheet 2: By Zone ──
  const zoneRows = a.byZone.map((z: any) => ({
    Zone: z.zone, ASEs: z.ases, 'Sites Visited': z.visited, 'Total Sites': z.totalSites,
    'Agents %': z.attainment.agents, 'SSOs %': z.attainment.ssos, 'ODRs %': z.attainment.odrs,
    'Data %': z.attainment.dataActs, 'DTU %': z.attainment.dtu, 'ZM GA %': z.attainment.zmGa,
    'Avg Score %': z.avgScore,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(zoneRows.length ? zoneRows : [{ Zone: 'No data' }]), 'By Zone');

  // ── Sheet 3: By ASE (planned vs actual + pending) ──
  const aseRows = a.byAse.map((r: any) => ({
    ASE: r.aseName, Zone: r.zone,
    'Sites Visited': r.visited, 'Sites Planned': r.planned, 'Sites Target': r.sitesTarget, 'Sites Pending': r.sitesPending,
    'Agents': r.agents, 'Agents Tgt': r.targets.agents, 'Agents Pending': r.pending.agents,
    'SSOs': r.ssos, 'SSOs Tgt': r.targets.ssos, 'SSOs Pending': r.pending.ssos,
    'ODRs': r.odrs, 'ODRs Tgt': r.targets.odrs, 'ODRs Pending': r.pending.odrs,
    'Data Acts': r.dataActs, 'Data Tgt': r.targets.dataActs, 'Data Pending': r.pending.dataActs,
    'DTU ZMW': r.dtu, 'DTU Tgt': r.targets.dtu, 'DTU Pending': r.pending.dtu,
    'ZM GA': r.zmGa, 'ZM GA Tgt': r.targets.zmGa, 'ZM GA Pending': r.pending.zmGa,
    'Avg Score %': r.avgScore,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aseRows.length ? aseRows : [{ ASE: 'No data' }]), 'By ASE');

  // ── Sheet 4: Top Sites by Activity ──
  const topRows = a.topSites.map((x: any, i: number) => ({
    Rank: i + 1, Site: x.siteName, 'Site ID': x.siteId, Type: x.siteType, ASE: x.aseName, Zone: x.zone,
    Agents: x.agents, SSOs: x.ssos, ODRs: x.odrs, 'Data Acts': x.dataActs, 'ZM GA': x.zmGa,
    'Total Activity': x.activity, 'Score %': x.score,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topRows.length ? topRows : [{ Rank: 0 }]), 'Top Sites');

  // ── Sheet 5: Raw Site Data ──
  const raw = sites.map((x: any) => {
    const zmTgt = x.siteType === 'rural' ? 30 : 50;
    const parts = [Math.min(x.agentsRec/3,1), Math.min(x.ssosRec/2,1), Math.min(x.odrsRec/1,1), Math.min(x.dataActs/15,1), Math.min(x.dtuSold/500,1), Math.min((x.zmGrossAdds||0)/zmTgt,1)];
    return {
      ASE: aseMap[x.aseId]?.name || x.aseId, Zone: aseMap[x.aseId]?.zone || '',
      'Week': x.weekStart ? new Date(x.weekStart).toISOString().split('T')[0] : '',
      Status: x.status, 'Site Name': x.siteName, 'Site ID': x.siteId, 'Type': x.siteType || 'urban',
      Agents: x.agentsRec, SSOs: x.ssosRec, ODRs: x.odrsRec, 'Data Acts': x.dataActs,
      'DTU ZMW': x.dtuSold, 'ZM GA': x.zmGrossAdds || 0, 'ZM GA Tgt': zmTgt,
      'Agent Codes': x.agentCodes || '', 'SSO Codes': x.ssoCodes || '', 'ODR Codes': x.odrCodes || '',
      'Score %': Math.round(parts.reduce((p,q)=>p+q,0)/parts.length*100),
      Latitude: x.latitude ?? '', Longitude: x.longitude ?? '',
      'GPS Link': (x.latitude!=null&&x.longitude!=null)?`https://www.google.com/maps?q=${x.latitude},${x.longitude}`:'',
      Notes: x.notes || '',
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(raw.length ? raw : [{ Status: 'No site focus this period' }]), 'Raw Data');

  return wb;
}

// ── Zamtel-green styled multi-sheet workbook (ExcelJS) ──────────────────────
const ZG = 'FF00843D';      // Zamtel green
const ZG_DARK = 'FF006630';
const ZG_LIGHT = 'FFE6F4EC';
const ZPINK = 'FFE4007C';

export async function buildSiteFocusWorkbookStyled(ExcelJS: any, sites: any[], ases: AseRef[], scope: string, period: string) {
  const a = buildSiteFocusAnalytics(sites, ases);
  const aseMap = Object.fromEntries(ases.map(x => [x.id, x]));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zamtel TDR Monitor';
  wb.created = new Date();

  const titleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZG } };
  const headFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZG_DARK } };
  const whiteBold = { bold: true, color: { argb: 'FFFFFFFF' } };
  const scoreColor = (v: number) => v >= 70 ? 'FF00843D' : v >= 40 ? 'FFB45309' : 'FFB91C1C';

  const styleHeaderRow = (row: any) => {
    row.eachCell((c: any) => {
      c.fill = headFill; c.font = whiteBold;
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: ZG } } };
    });
    row.height = 22;
  };

  // ===== Sheet 1: Summary =====
  const s = a.summary; const t = a.totals; const at = a.attainment;
  const sum = wb.addWorksheet('Summary', { properties: { tabColor: { argb: ZG } } });
  sum.mergeCells('A1:C1');
  const title = sum.getCell('A1');
  title.value = 'ZAMTEL — SITE FOCUS ANALYTICS REPORT';
  title.fill = titleFill; title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  sum.getRow(1).height = 30;
  sum.getCell('A2').value = 'Scope'; sum.getCell('B2').value = scope;
  sum.getCell('A3').value = 'Period'; sum.getCell('B3').value = period;
  sum.getCell('A4').value = 'Generated'; sum.getCell('B4').value = new Date().toISOString().split('T')[0];
  ['A2','A3','A4'].forEach(c => sum.getCell(c).font = { bold: true, color: { argb: ZG_DARK } });
  sum.addRow([]);
  const kHead = sum.addRow(['KEY METRICS', 'Value']); styleHeaderRow(kHead);
  const metrics: [string, any][] = [
    ['Total Sites', s.totalSites], ['Visited', s.visitedSites], ['Planned (pending)', s.plannedSites],
    ['Overdue', s.overdueSites], ['Completion Rate %', s.completionRate], ['Avg Site Score %', s.avgSiteScore],
    ['Active ASEs', s.activeAses],
  ];
  metrics.forEach(([k, v], i) => { const r = sum.addRow([k, v]); if (i % 2 === 0) r.eachCell((c:any)=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:ZG_LIGHT}}); r.getCell(1).font={bold:true}; });
  sum.addRow([]);
  const dHead = sum.addRow(['DELIVERABLE', 'Actual', 'Attainment %']); styleHeaderRow(dHead);
  const deliv: [string, number, number][] = [
    ['Agents (tgt 3/site)', t.agents, at.agents], ['SSOs (tgt 2/site)', t.ssos, at.ssos],
    ['ODRs (tgt 1/site)', t.odrs, at.odrs], ['Data Acts (tgt 15/site)', t.dataActs, at.dataActs],
    ['DTU ZMW (tgt 500/site)', t.dtu, at.dtu], ['ZM Gross Adds (30 rural/50 urban)', t.zmGa, at.zmGa],
  ];
  deliv.forEach(([k, v, p]) => { const r = sum.addRow([k, v, p]); r.getCell(1).font={bold:true}; const pc=r.getCell(3); pc.font={bold:true,color:{argb:scoreColor(p)}}; pc.alignment={horizontal:'center'}; });
  sum.getColumn(1).width = 32; sum.getColumn(2).width = 16; sum.getColumn(3).width = 16;

  // ===== Sheet 2: By Zone =====
  const zs = wb.addWorksheet('By Zone', { properties: { tabColor: { argb: ZG } } });
  const zHead = zs.addRow(['Zone','ASEs','Visited','Total','Agents %','SSOs %','ODRs %','Data %','DTU %','ZM GA %','Avg Score %']); styleHeaderRow(zHead);
  a.byZone.forEach((z: any, i: number) => {
    const r = zs.addRow([z.zone, z.ases, z.visited, z.totalSites, z.attainment.agents, z.attainment.ssos, z.attainment.odrs, z.attainment.dataActs, z.attainment.dtu, z.attainment.zmGa, z.avgScore]);
    if (i % 2 === 0) r.eachCell((c:any)=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:ZG_LIGHT}});
    r.getCell(1).font = { bold: true };
    [5,6,7,8,9,10,11].forEach(ci => { const c=r.getCell(ci); c.font={bold:true,color:{argb:scoreColor(Number(c.value)||0)}}; c.alignment={horizontal:'center'}; });
  });
  zs.columns.forEach((c:any,i:number)=>{ c.width = i===0?18:11; });

  // ===== Sheet 3: By ASE (planned vs actual + pending) =====
  const as = wb.addWorksheet('By ASE', { properties: { tabColor: { argb: ZG } } });
  const aHead = as.addRow(['ASE','Zone','Sites','Sites Tgt','Sites Pend','Agents','Ag Tgt','Ag Pend','SSOs','SSO Tgt','SSO Pend','ODRs','ODR Tgt','ODR Pend','Data','Data Tgt','Data Pend','DTU','DTU Tgt','DTU Pend','ZM GA','ZMGA Tgt','ZMGA Pend','Score %']); styleHeaderRow(aHead);
  a.byAse.forEach((r: any, i: number) => {
    const row = as.addRow([r.aseName, r.zone, r.visited, r.targets.sites, r.sitesPending, r.agents, r.targets.agents, r.pending.agents, r.ssos, r.targets.ssos, r.pending.ssos, r.odrs, r.targets.odrs, r.pending.odrs, r.dataActs, r.targets.dataActs, r.pending.dataActs, r.dtu, r.targets.dtu, r.pending.dtu, r.zmGa, r.targets.zmGa, r.pending.zmGa, r.avgScore]);
    if (i % 2 === 0) row.eachCell((c:any)=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:ZG_LIGHT}});
    row.getCell(1).font = { bold: true };
    const sCell = row.getCell(24); sCell.font={bold:true,color:{argb:scoreColor(r.avgScore)}}; sCell.alignment={horizontal:'center'};
    // pending cells in pink if >0
    [5,8,11,14,17,20,23].forEach(ci => { const c=row.getCell(ci); if(Number(c.value)>0) c.font={bold:true,color:{argb:ZPINK}}; });
  });
  as.columns.forEach((c:any,i:number)=>{ c.width = i===0?20:(i===1?14:8); });
  as.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  // ===== Sheet 4: Top Sites =====
  const ts = wb.addWorksheet('Top Sites', { properties: { tabColor: { argb: ZG } } });
  const tHead = ts.addRow(['Rank','Site','Site ID','Type','ASE','Zone','Agents','SSOs','ODRs','Data','ZM GA','Activity','Score %']); styleHeaderRow(tHead);
  a.topSites.forEach((x: any, i: number) => {
    const r = ts.addRow([i+1, x.siteName, x.siteId, x.siteType, x.aseName, x.zone, x.agents, x.ssos, x.odrs, x.dataActs, x.zmGa, x.activity, x.score]);
    if (i < 3) r.eachCell((c:any)=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF7E0'}});
    else if (i % 2 === 0) r.eachCell((c:any)=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:ZG_LIGHT}});
    r.getCell(2).font={bold:true};
    const sc=r.getCell(13); sc.font={bold:true,color:{argb:scoreColor(x.score)}}; sc.alignment={horizontal:'center'};
  });
  ts.columns.forEach((c:any,i:number)=>{ c.width = i===1?22:(i===4?18:(i===5?14:9)); });

  // ===== Sheet 5: Raw Data =====
  const rs = wb.addWorksheet('Raw Data', { properties: { tabColor: { argb: ZG } } });
  const rHead = rs.addRow(['ASE','Zone','Week','Status','Site Name','Site ID','Type','Agents','SSOs','ODRs','Data Acts','DTU ZMW','ZM GA','ZMGA Tgt','Agent Codes','SSO Codes','ODR Codes','Score %','Latitude','Longitude','GPS Link','Notes']); styleHeaderRow(rHead);
  sites.forEach((x: any, i: number) => {
    const zmTgt = x.siteType === 'rural' ? 30 : 50;
    const parts = [Math.min(x.agentsRec/3,1), Math.min(x.ssosRec/2,1), Math.min(x.odrsRec/1,1), Math.min(x.dataActs/15,1), Math.min(x.dtuSold/500,1), Math.min((x.zmGrossAdds||0)/zmTgt,1)];
    const r = rs.addRow([aseMap[x.aseId]?.name||x.aseId, aseMap[x.aseId]?.zone||'', x.weekStart?new Date(x.weekStart).toISOString().split('T')[0]:'', x.status, x.siteName, x.siteId, x.siteType||'urban', x.agentsRec, x.ssosRec, x.odrsRec, x.dataActs, x.dtuSold, x.zmGrossAdds||0, zmTgt, x.agentCodes||'', x.ssoCodes||'', x.odrCodes||'', Math.round(parts.reduce((p,q)=>p+q,0)/parts.length*100), x.latitude??'', x.longitude??'', (x.latitude!=null&&x.longitude!=null)?`https://www.google.com/maps?q=${x.latitude},${x.longitude}`:'', x.notes||'']);
    if (i % 2 === 0) r.eachCell((c:any)=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:ZG_LIGHT}});
  });
  rs.columns.forEach((c:any,i:number)=>{ c.width = (i===4?22:(i>=14&&i<=16?24:(i===21?16:11))); });
  rs.views = [{ state: 'frozen', ySplit: 1 }];

  return wb;
}
