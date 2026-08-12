// ASE Tracker data loader — refreshes devices, loads day plans, ingests approved/rejected transactions
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

// Canonical zone names (match AseZoneTarget.zone)
const ZONE_MAP = {
  'eastern': 'Eastern', 'central': 'Central', 'copperbelt': 'Copperbelt',
  'lusaka central': 'Lusaka Central', 'lusaka north': 'Lusaka North', 'lusaka south': 'Lusaka South',
  'luapula': 'Luapula', 'muchinga': 'Muchinga', 'northern': 'Northern', 'southern': 'Southern',
  'western': 'Western', 'north western': 'North Western', 'north-west': 'North Western',
  'north-western': 'North Western', 'northwestern': 'North Western',
};
function normZone(z) {
  if (!z) return null;
  const k = String(z).trim().toLowerCase().replace(/\s+province$/, '').trim();
  return ZONE_MAP[k] || (z.charAt(0).toUpperCase() + z.slice(1).toLowerCase());
}

async function loadDevices() {
  const devices = JSON.parse(fs.readFileSync('/tmp/devices.json'));
  console.log(`Refreshing ${devices.length} KYC devices...`);
  // wipe + reload (device master is a full snapshot each month)
  await prisma.kycDevice.deleteMany({});
  let n = 0;
  const batch = [];
  for (const d of devices) {
    batch.push({
      dealerCode: d.dealerCode, description: d.description, imei1: d.imei1, imei2: d.imei2,
      msisdn: d.msisdn, simSerial: d.simSerial, siteId: d.siteId, region: normZone(d.region),
      zone: normZone(d.region), rbmName: d.rbmName, aseName: d.aseName, teamLead: d.teamLead,
      status: (d.status || 'ACTIVE').toUpperCase(), kycReg: d.kycReg, grossAdds: d.grossAdds,
      zamoGA: d.zamoGA, recharges: d.recharges,
      activityStatus: d.grossAdds > 0 ? 1 : 0,
      deviceSource: (d.description || '').includes('A100') ? 'ItelA100C' : ((d.description || '').includes('A50') ? 'A50' : 'MobiGO2+'),
    });
  }
  // chunked createMany
  for (let i = 0; i < batch.length; i += 500) {
    await prisma.kycDevice.createMany({ data: batch.slice(i, i + 500), skipDuplicates: true });
    n += Math.min(500, batch.length - i);
    process.stdout.write(`\r  loaded ${n}/${batch.length}`);
  }
  console.log(`\n  devices done.`);
}

async function loadDayPlans() {
  const plans = JSON.parse(fs.readFileSync('/tmp/dayplans.json'));
  console.log(`Loading ${plans.length} day plans...`);
  await prisma.aseDayPlan.deleteMany({});
  for (let i = 0; i < plans.length; i += 500) {
    await prisma.aseDayPlan.createMany({ data: plans.slice(i, i + 500), skipDuplicates: true });
  }
  console.log('  day plans done.');
}

async function ingest(file, statusVal) {
  const rows = JSON.parse(fs.readFileSync(file));
  console.log(`Ingesting ${rows.length} ${statusVal} transactions...`);
  // dealer_code -> {ase, zone, region}
  const devices = await prisma.kycDevice.findMany({ select: { dealerCode: true, aseName: true, zone: true, region: true } });
  const map = {};
  devices.forEach(d => { if (d.dealerCode) map[d.dealerCode.trim().toUpperCase()] = d; });
  // Fallback attribution: SUPERVISOR name -> ASE (from device master), per SRS Step 3
  const aseByName = {};
  devices.forEach(d => { if (d.aseName) aseByName[d.aseName.trim().toLowerCase()] = { aseName: d.aseName, zone: d.zone, region: d.region }; });

  let credited = 0, unmapped = 0, viaSupervisor = 0, skipped = 0;
  const data = [];
  const seen = new Set();
  for (const r of rows) {
    const dc = String(r.dealer_code || '').trim().toUpperCase();
    const txnDate = statusVal === 'APPROVED' ? r.APPROVED_DATE : r.REJECTED_DATE;
    if (!dc || !txnDate) { skipped++; continue; }
    let dev = map[dc];
    // Fallback: attribute by SUPERVISOR -> ASE name, zone from LOCATION
    if (!dev && r.SUPERVISOR) {
      const sup = aseByName[String(r.SUPERVISOR).trim().toLowerCase()];
      if (sup) { dev = { aseName: sup.aseName, zone: sup.zone || normZone(r.LOCATION), region: sup.region || normZone(r.LOCATION) }; viaSupervisor++; }
    }
    const isUnmapped = !dev;
    if (isUnmapped) unmapped++; else credited++;
    const cm = String(r.CUSTOMER_MSISDN || (dc + txnDate));
    const cid = String(r.CUSTOMER_ID || '');
    const dedupeKey = `${cm}|${cid}|${statusVal}|${txnDate}`;
    if (seen.has(dedupeKey)) { continue; }
    seen.add(dedupeKey);
    data.push({
      dealerCode: dc, aseName: dev?.aseName || null, zone: dev?.zone || normZone(r.LOCATION), region: dev?.region || normZone(r.LOCATION),
      status: statusVal, rejectReason: r.REJECTED_REASON || null, customerMsisdn: cm, customerId: cid,
      supervisor: r.SUPERVISOR || null, location: r.LOCATION || null, txnDate, unmapped: isUnmapped, duplicate: false,
    });
  }
  console.log(`  (dealer_code matched=${credited - viaSupervisor}, via supervisor=${viaSupervisor})`);
  // clear existing txns for this status+date range then insert
  const dates = [...new Set(data.map(d => d.txnDate))];
  await prisma.aseTransaction.deleteMany({ where: { status: statusVal, txnDate: { in: dates } } });
  for (let i = 0; i < data.length; i += 500) {
    await prisma.aseTransaction.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
  }
  console.log(`  ${statusVal}: credited=${credited} unmapped=${unmapped} skipped=${skipped} inserted=${data.length}`);
}

(async () => {
  try {
    if (process.env.RELOAD_ALL === '1') { await loadDevices(); await loadDayPlans(); }
    await ingest('/tmp/approved.json', 'APPROVED');
    await ingest('/tmp/rejected.json', 'REJECTED');
    console.log('\n=== SUMMARY ===');
    console.log('devices:', await prisma.kycDevice.count());
    console.log('dayPlans:', await prisma.aseDayPlan.count());
    console.log('approved txns:', await prisma.aseTransaction.count({ where: { status: 'APPROVED' } }));
    console.log('rejected txns:', await prisma.aseTransaction.count({ where: { status: 'REJECTED' } }));
    console.log('attributed approved:', await prisma.aseTransaction.count({ where: { status: 'APPROVED', unmapped: false } }));
  } catch (e) { console.error('LOAD ERROR:', e.message); }
  finally { await prisma.$disconnect(); }
})();
