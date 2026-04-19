import React, { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

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
}

export const GeoMap: React.FC<GeoMapProps> = ({
  agents, visits, height = '500px', showVisits = true
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [showAgents, setShowAgents] = useState(true)
  const [showVisitLayer, setShowVisitLayer] = useState(false)
  const [activeZone, setActiveZone] = useState<string>('all')

  const zones = ['all', ...Array.from(new Set(agents.map(a => a.zone).filter(Boolean))).sort()]

  useEffect(() => {
    if (!mapRef.current) return

    // Zambia bounding box: SW (-18.08, 21.99) → NE (-8.22, 33.71)
    const zambiaBounds: L.LatLngBoundsExpression = [[-18.08, 21.99], [-8.22, 33.71]];

    const map = L.map(mapRef.current, {
      zoomControl: true,
      minZoom: 6,
      maxZoom: 18,
      maxBounds: zambiaBounds,
      maxBoundsViscosity: 1.0,   // hard wall — can't pan outside
    }).setView([-13.1339, 27.8493], 7);
    map.fitBounds(zambiaBounds);
    mapInstanceRef.current = map

    // OSM tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    return () => { map.remove(); mapInstanceRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Clear existing layers except tile
    map.eachLayer(layer => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer) })

    const filteredAgents = activeZone === 'all' ? agents : agents.filter(a => a.zone === activeZone)
    const filteredVisits = activeZone === 'all' ? visits : visits.filter(v => v.zone === activeZone)

    const bounds: L.LatLngTuple[] = []

    // ─── Agent markers (green = agent, pink = merchant) ────────────────────
    if (showAgents) {
      filteredAgents.forEach(a => {
        if (!a.latitude || !a.longitude) return
        const isMerchant = a.type === 'merchant'
        const colour = isMerchant ? '#E4007C' : '#00843D'
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:12px;height:12px;border-radius:50%;
            background:${colour};border:2px solid white;
            box-shadow:0 1px 4px rgba(0,0,0,0.4);">
          </div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        })
        const marker = L.marker([a.latitude, a.longitude], { icon })
          .bindPopup(`
            <div style="min-width:200px;font-family:Arial,sans-serif">
              <div style="background:${colour};color:white;padding:6px 10px;border-radius:6px 6px 0 0;margin:-8px -8px 8px;font-weight:700;font-size:13px">
                ${isMerchant ? '🏪 Merchant' : '🏦 Agent'}
              </div>
              <b>${a.agentName}</b><br/>
              <span style="color:#888;font-size:11px">Code: ${a.agentCode}</span><br/>
              <span style="font-size:12px">📍 ${a.town}, ${a.zone}</span><br/>
              <span style="font-size:12px">👤 TDR: ${a.tdrName}</span><br/>
              <span style="font-size:12px">💰 Float: K${Number(a.initialFloat).toLocaleString()}</span><br/>
              ${a.merchantCategory ? `<span style="font-size:12px">🏷️ ${a.merchantCategory}</span><br/>` : ''}
              <span style="color:#aaa;font-size:10px">${new Date(a.createdAt).toLocaleDateString()}</span>
            </div>
          `, { maxWidth: 260 })
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
            <div style="min-width:180px;font-family:Arial,sans-serif">
              <div style="background:#2563EB;color:white;padding:6px 10px;border-radius:6px 6px 0 0;margin:-8px -8px 8px;font-weight:700;font-size:13px">
                📋 Outlet Visit
              </div>
              <b>${v.outletName}</b><br/>
              <span style="font-size:12px">📍 ${v.town}, ${v.zone}</span><br/>
              <span style="font-size:12px">👤 TDR: ${v.tdrName}</span><br/>
              ${v.floatAmount ? `<span style="font-size:12px">💰 Float: K${Number(v.floatAmount).toLocaleString()}</span><br/>` : ''}
              <span style="color:#aaa;font-size:10px">${new Date(v.createdAt).toLocaleDateString()}</span>
            </div>
          `, { maxWidth: 240 })
          .addTo(map)
        bounds.push([v.latitude, v.longitude])
      })
    }

    // Fit map to markers — use wider zoom for better visibility
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [agents, visits, showAgents, showVisitLayer, activeZone])

  const agentCount = activeZone === 'all' ? agents.length : agents.filter(a => a.zone === activeZone).length
  const visitCount = activeZone === 'all' ? visits.length : visits.filter(v => v.zone === activeZone).length
  const merchantCount = (activeZone === 'all' ? agents : agents.filter(a => a.zone === activeZone)).filter(a => a.type === 'merchant').length

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden border border-gray-100">
      {/* Map toolbar */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">🗺️ Field Map</span>
          <span className="text-xs text-gray-400">{agentCount} agents · {merchantCount} merchants · {visitCount} visits</span>
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
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{background:'#00843D'}} /> Agent</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{background:'#E4007C'}} /> Merchant</span>
        {showVisitLayer && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block bg-blue-600 opacity-75" /> Visit</span>}
        <span className="ml-auto text-gray-400">Click any marker for details</span>
      </div>

      {/* Map container */}
      <div ref={mapRef} style={{ height, width: '100%' }} />
    </div>
  )
}
