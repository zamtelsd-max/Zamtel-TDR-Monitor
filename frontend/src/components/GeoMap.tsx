import React, { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import 'leaflet.heat'

// Inject popup style overrides once
if (typeof document !== 'undefined' && !document.getElementById('zamtel-popup-style')) {
  const s = document.createElement('style');
  s.id = 'zamtel-popup-style';
  s.textContent = `
    .zamtel-popup .leaflet-popup-content-wrapper {
      padding: 0 !important;
      border-radius: 10px !important;
      box-shadow: 0 8px 30px rgba(0,0,0,0.18) !important;
      overflow: hidden !important;
    }
    .zamtel-popup .leaflet-popup-content {
      margin: 0 !important;
      width: auto !important;
      min-width: 240px !important;
      max-height: 60vh !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }
    .zamtel-popup .leaflet-popup-content * {
      box-sizing: border-box;
    }
    .zamtel-popup .leaflet-popup-tip-container {
      margin-top: -1px;
    }
    .zamtel-popup .leaflet-popup-close-button {
      top: 7px !important;
      right: 9px !important;
      color: #ffffff !important;
      font-size: 20px !important;
      font-weight: 400 !important;
      z-index: 10 !important;
      width: 22px !important;
      height: 22px !important;
      line-height: 20px !important;
    }
  `;
  document.head.appendChild(s);
}

// Fix Leaflet default icon paths for Vite
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface AgentPoint {
  id: string
  agentName: string
  agentCode: string
  type: string
  tdrName: string
  zone: string
  town: string
  latitude: number
  longitude: number
  initialFloat: number
  merchantCategory?: string
  createdAt: string
  lastVisitedAt?: string | null
  daysAgo?: number | null
}

interface VisitPoint {
  id: string
  outletName: string
  agentCode: string
  tdrName: string
  zone: string
  town: string
  latitude: number
  longitude: number
  floatAmount?: number
  createdAt: string
}

interface GeoMapProps {
  agents: AgentPoint[]
  visits: VisitPoint[]
  height?: string
  showVisits?: boolean
  showHeatToggle?: boolean
}

export const GeoMap: React.FC<GeoMapProps> = ({
  agents, visits, height = '500px', showVisits = true, showHeatToggle = true
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const heatLayerRef = useRef<any>(null)
  const [showAgents, setShowAgents] = useState(true)
  const [showVisitLayer, setShowVisitLayer] = useState(false)
  const [showHeat, setShowHeat] = useState(false)
  const [activeZone, setActiveZone] = useState<string>('all')

  const zones = ['all', 'Lusaka (Both)', ...Array.from(new Set(agents.map(a => a.zone).filter(Boolean))).sort()]

  // Lusaka zone manager mapping
  const LUSAKA_ZBM: Record<string, { name: string; colour: string; accent: string }> = {
    'Lusaka North': { name: 'Trebby Mando',  colour: '#7C3AED', accent: '#DDD6FE' }, // purple
    'Lusaka South': { name: 'Sharon Zulu',   colour: '#0369A1', accent: '#BAE6FD' }, // blue
  };

  const isLusakaView = activeZone === 'Lusaka (Both)' || activeZone === 'Lusaka North' || activeZone === 'Lusaka South';

  const getOutletColour = (a: AgentPoint): string => {
    if (a.daysAgo === null || a.daysAgo === undefined) return '#DC2626';
    if (a.daysAgo >= 4) return '#DC2626';
    if (a.daysAgo >= 2) return '#D97706';
    return '#16A34A';
  };

  useEffect(() => {
    if (!mapRef.current) return

    // Destroy any previous instance (handles tab remount)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Zambia bounding box: SW (-18.08, 21.99) → NE (-8.22, 33.71)
    const zambiaBounds: L.LatLngBoundsExpression = [[-18.08, 21.99], [-8.22, 33.71]];

    const map = L.map(mapRef.current, {
      zoomControl: true,
      minZoom: 6,
      maxZoom: 18,
      maxBounds: zambiaBounds,
      maxBoundsViscosity: 1.0,
    }).setView([-13.1339, 27.8493], 7);

    mapInstanceRef.current = map

    // OSM tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    // Critical: force size recalc after the DOM has painted
    // Needed when map renders inside a tab/conditional that was hidden
    const t1 = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(zambiaBounds);
    }, 50);
    const t2 = setTimeout(() => { map.invalidateSize(); }, 250);
    const t3 = setTimeout(() => { map.invalidateSize(); }, 600);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      map.remove();
      mapInstanceRef.current = null;
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Clear existing layers except tile
    map.eachLayer(layer => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer) })

    const filteredAgents = activeZone === 'all' ? agents
      : activeZone === 'Lusaka (Both)' ? agents.filter(a => a.zone === 'Lusaka North' || a.zone === 'Lusaka South')
      : agents.filter(a => a.zone === activeZone)
    const filteredVisits = activeZone === 'all' ? visits
      : activeZone === 'Lusaka (Both)' ? visits.filter(v => v.zone === 'Lusaka North' || v.zone === 'Lusaka South')
      : visits.filter(v => v.zone === activeZone)

    const bounds: L.LatLngTuple[] = []

    // ─── Agent markers (green = agent, pink = merchant) ────────────────────
    if (showAgents) {
      filteredAgents.forEach(a => {
        if (!a.latitude || !a.longitude) return
        const isMerchant = a.type === 'merchant'
        const colour = getOutletColour(a);
        // In Lusaka view: outer ring shows ZBM territory colour
        const lusZbm = (activeZone === 'Lusaka (Both)' || activeZone === 'Lusaka North' || activeZone === 'Lusaka South')
          ? LUSAKA_ZBM[a.zone] : null;
        const borderColour = lusZbm ? lusZbm.colour : (isMerchant ? '#E4007C' : '#ffffff');
        const dotSize = lusZbm ? 13 : 12;
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:${dotSize}px;height:${dotSize}px;border-radius:50%;
            background:${colour};border:2.5px solid ${borderColour};
            box-shadow:0 1px 4px rgba(0,0,0,0.4);">
          </div>`,
          iconSize: [dotSize, dotSize],
          iconAnchor: [dotSize/2, dotSize/2],
        })
        const visitStatus = a.daysAgo === null || a.daysAgo === undefined
          ? '<span style="display:inline-block;background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;margin-top:4px">🔴 Never visited</span>'
          : a.daysAgo >= 4
            ? `<span style="display:inline-block;background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;margin-top:4px">🔴 Overdue — ${a.daysAgo} days ago</span>`
            : a.daysAgo >= 2
              ? `<span style="display:inline-block;background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;margin-top:4px">🟡 Due soon — ${a.daysAgo} days ago</span>`
              : `<span style="display:inline-block;background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;margin-top:4px">🟢 ${a.daysAgo === 0 ? 'Visited today' : `Visited ${a.daysAgo}d ago`}</span>`;
        const marker = L.marker([a.latitude, a.longitude], { icon })
          .bindPopup(`
            <div style="width:260px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:visible">
              <div style="background:${colour};color:white;padding:8px 34px 8px 12px;border-radius:8px 8px 0 0;font-weight:700;font-size:13px;letter-spacing:0.3px">
                ${isMerchant ? '🏪 Merchant Outlet' : '🏦 Mobile Agent'}
              </div>
              <div style="padding:10px 12px;background:#fff;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
                <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:2px">${a.agentName}</div>
                <div style="font-size:11px;color:#6b7280;margin-bottom:8px;font-family:monospace;background:#f9fafb;display:inline-block;padding:1px 6px;border-radius:4px">${a.agentCode}</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                  <tr><td style="padding:2px 0;color:#6b7280;width:70px">📍 Location</td><td style="padding:2px 0;font-weight:600;color:#374151">${a.town || '—'}, ${a.zone}</td></tr>
                  <tr><td style="padding:2px 0;color:#6b7280">👤 TDR</td><td style="padding:2px 0;font-weight:600;color:#374151">${a.tdrName}</td></tr>
                  ${lusZbm ? `<tr><td style="padding:2px 0;color:#6b7280">📋 ZBM</td><td style="padding:2px 0;font-weight:600;color:${lusZbm.colour}">${lusZbm.name}</td></tr>` : ''}
                  <tr><td style="padding:2px 0;color:#6b7280">💰 Float</td><td style="padding:2px 0;font-weight:600;color:#374151">K${Number(a.initialFloat).toLocaleString()}</td></tr>
                  ${a.merchantCategory ? `<tr><td style="padding:2px 0;color:#6b7280">🏷️ Category</td><td style="padding:2px 0;font-weight:600;color:#374151">${a.merchantCategory}</td></tr>` : ''}
                  <tr><td style="padding:2px 0;color:#6b7280">📅 Added</td><td style="padding:2px 0;color:#9ca3af;font-size:11px">${new Date(a.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td></tr>
                </table>
                ${visitStatus}
              </div>
            </div>
          `, { maxWidth: 300, minWidth: 262, className: 'zamtel-popup' })
        marker.addTo(map)
        bounds.push([a.latitude, a.longitude])
      })
    }

    // ─── Visit markers (blue dots) ─────────────────────────────────────────
    if (showVisitLayer && showVisits) {
      filteredVisits.forEach(v => {
        if (!v.latitude || !v.longitude) return
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:8px;height:8px;border-radius:50%;
            background:#2563EB;border:1.5px solid white;
            box-shadow:0 1px 3px rgba(0,0,0,0.3);opacity:0.75">
          </div>`,
          iconSize: [8, 8],
          iconAnchor: [4, 4],
        })
        L.marker([v.latitude, v.longitude], { icon })
          .bindPopup(`
            <div style="width:240px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
              <div style="background:#2563EB;color:white;padding:8px 34px 8px 12px;border-radius:8px 8px 0 0;font-weight:700;font-size:13px">
                📋 Outlet Visit
              </div>
              <div style="padding:10px 12px;background:#fff;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
                <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px">${v.outletName}</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                  <tr><td style="padding:2px 0;color:#6b7280;width:70px">📍 Location</td><td style="padding:2px 0;font-weight:600;color:#374151">${v.town || '—'}, ${v.zone}</td></tr>
                  <tr><td style="padding:2px 0;color:#6b7280">👤 TDR</td><td style="padding:2px 0;font-weight:600;color:#374151">${v.tdrName}</td></tr>
                  ${v.floatAmount ? `<tr><td style="padding:2px 0;color:#6b7280">💰 Float</td><td style="padding:2px 0;font-weight:600;color:#374151">K${Number(v.floatAmount).toLocaleString()}</td></tr>` : ''}
                  <tr><td style="padding:2px 0;color:#6b7280">📅 Date</td><td style="padding:2px 0;color:#9ca3af;font-size:11px">${new Date(v.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td></tr>
                </table>
              </div>
            </div>
          `, { maxWidth: 280, minWidth: 242, className: 'zamtel-popup' })
          .addTo(map)
        bounds.push([v.latitude, v.longitude])
      })
    }

    // Fit map to markers — use wider zoom for better visibility
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [agents, visits, showAgents, showVisitLayer, activeZone])

  // ─── Activity heat map layer (sites visited + activity density) ────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Remove existing heat layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current)
      heatLayerRef.current = null
    }
    if (!showHeat) return

    const scoped = activeZone === 'all' ? agents
      : activeZone === 'Lusaka (Both)' ? agents.filter(a => a.zone === 'Lusaka North' || a.zone === 'Lusaka South')
      : agents.filter(a => a.zone === activeZone)
    const scopedV = activeZone === 'all' ? visits
      : activeZone === 'Lusaka (Both)' ? visits.filter(v => v.zone === 'Lusaka North' || v.zone === 'Lusaka South')
      : visits.filter(v => v.zone === activeZone)

    // Heat points: each outlet weighted by recency of activity; each visit adds density
    const heatPts: [number, number, number][] = []
    scoped.forEach(a => {
      if (!a.latitude || !a.longitude) return
      // More recently visited = hotter; never/overdue = cooler base presence
      const intensity = (a.daysAgo == null) ? 0.3 : a.daysAgo < 2 ? 1.0 : a.daysAgo < 4 ? 0.6 : 0.4
      heatPts.push([a.latitude, a.longitude, intensity])
    })
    scopedV.forEach(v => {
      if (!v.latitude || !v.longitude) return
      heatPts.push([v.latitude, v.longitude, 0.8])
    })

    if (heatPts.length > 0) {
      // @ts-ignore — leaflet.heat augments L at runtime
      heatLayerRef.current = (L as any).heatLayer(heatPts, {
        radius: 28, blur: 22, maxZoom: 14, max: 1.0,
        gradient: { 0.0: '#2563EB', 0.35: '#16A34A', 0.6: '#F59E0B', 0.85: '#EF4444', 1.0: '#B91C1C' },
      }).addTo(map)
    }
  }, [showHeat, agents, visits, activeZone])

  useEffect(() => {
    const handler = () => window.dispatchEvent(new Event('resize'));
    window.addEventListener('zamtel-offline-synced', handler);
    return () => window.removeEventListener('zamtel-offline-synced', handler);
  }, []);

  // ResizeObserver — invalidate Leaflet size whenever the container resizes
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const m = mapInstanceRef.current;
      if (m) { m.invalidateSize(); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scopedAgents = activeZone === 'all' ? agents
    : activeZone === 'Lusaka (Both)' ? agents.filter(a => a.zone === 'Lusaka North' || a.zone === 'Lusaka South')
    : agents.filter(a => a.zone === activeZone);
  const scopedVisits = activeZone === 'all' ? visits
    : activeZone === 'Lusaka (Both)' ? visits.filter(v => v.zone === 'Lusaka North' || v.zone === 'Lusaka South')
    : visits.filter(v => v.zone === activeZone);
  const agentCount    = scopedAgents.length;
  const visitCount    = scopedVisits.length;
  const merchantCount = scopedAgents.filter(a => a.type === 'merchant').length;
  const neverOrOverdue  = scopedAgents.filter(a => a.daysAgo == null || a.daysAgo >= 4).length;
  const dueSoon         = scopedAgents.filter(a => a.daysAgo != null && a.daysAgo >= 2 && a.daysAgo < 4).length;
  const recentlyVisited = scopedAgents.filter(a => a.daysAgo != null && a.daysAgo < 2).length;
  // Lusaka split counts
  const lnCount = agents.filter(a => a.zone === 'Lusaka North').length;
  const lsCount = agents.filter(a => a.zone === 'Lusaka South').length;

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden border border-gray-100">
      {/* Map toolbar */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">🗺️ Field Map</span>
          <span className="text-xs text-gray-400">
            🔴 {neverOrOverdue} overdue · 🟡 {dueSoon} due soon · 🟢 {recentlyVisited} ok · {visitCount} visits
          </span>
        </div>

        <div className="flex-1" />

        {/* Zone filter */}
        <select
          value={activeZone}
          onChange={e => setActiveZone(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 font-medium focus:outline-none focus:border-green-500"
        >
          {zones.map(z => (
            <option key={z} value={z}>{z === 'all' ? 'All Zones' : z}</option>
          ))}
        </select>

        {/* Layer toggles */}
        <button
          onClick={() => setShowAgents(!showAgents)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition"
          style={{ background: showAgents ? '#00843D' : '#f3f4f6', color: showAgents ? 'white' : '#374151' }}
        >
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: showAgents ? 'white' : '#00843D' }} />
          Agents
        </button>

        <button
          onClick={() => setShowAgents(true) as any || (() => {
            const a = agents.filter(x => x.type === 'merchant')
          })}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition"
          style={{ background: '#fff0f8', color: '#E4007C', border: '1px solid #E4007C' }}
        >
          <span className="w-2.5 h-2.5 rounded-full inline-block bg-pink-500" />
          Merchants
        </button>

        {showVisits && (
          <button
            onClick={() => setShowVisitLayer(!showVisitLayer)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition"
            style={{ background: showVisitLayer ? '#2563EB' : '#f3f4f6', color: showVisitLayer ? 'white' : '#374151' }}
          >
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: showVisitLayer ? 'white' : '#2563EB' }} />
            Visits
          </button>
        )}

        {showHeatToggle && (
          <button
            onClick={() => setShowHeat(!showHeat)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition"
            style={{ background: showHeat ? '#EF4444' : '#f3f4f6', color: showHeat ? 'white' : '#374151' }}
          >
            <span>🔥</span>
            Heat Map
          </button>
        )}

        {/* Fit all markers */}
        <button
          onClick={() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            const all: L.LatLngTuple[] = [
              ...agents.filter(a => a.latitude && a.longitude).map(a => [a.latitude, a.longitude] as L.LatLngTuple),
              ...visits.filter(v => v.latitude && v.longitude).map(v => [v.latitude, v.longitude] as L.LatLngTuple),
            ];
            if (all.length > 0) map.fitBounds(all, { padding: [50, 50], maxZoom: 15 });
          }}
          className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition"
          title="Fit all markers in view"
        >⊕ Fit All</button>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex gap-4 text-xs text-gray-500 flex-wrap">
        {isLusakaView ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full inline-block border-2" style={{background:'#9CA3AF', borderColor:'#7C3AED'}} />
              Lusaka North — Trebby Mando ({lnCount})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full inline-block border-2" style={{background:'#9CA3AF', borderColor:'#0369A1'}} />
              Lusaka South — Sharon Zulu ({lsCount})
            </span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-red-600" /> Overdue</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-amber-500" /> Due Soon</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-green-600" /> OK</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-red-600" /> Never / Overdue (&gt;4d)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-amber-500" /> Due Soon (2–4d)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-green-600" /> Visited (&lt;2d)</span>
          </>
        )}
        {showVisitLayer && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-blue-600 opacity-75" /> Visit</span>}
        {showHeat && <span className="flex items-center gap-1.5"><span className="inline-block w-8 h-3 rounded" style={{ background: 'linear-gradient(to right,#2563EB,#16A34A,#F59E0B,#EF4444)' }} /> Activity density (low→high)</span>}
        <span className="ml-auto text-gray-400">Click any marker for details</span>
      </div>

      {/* Map container */}
      <div ref={mapRef} style={{ height, width: '100%' }} />
    </div>
  )
}
