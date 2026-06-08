import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

interface Props { sites: any[]; height?: string; }

// Compact map of Site Focus locations (GPS), colored by per-site score.
export const SiteFocusMap: React.FC<Props> = ({ sites, height = '320px' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const bounds: L.LatLngBoundsExpression = [[-18.08, 21.99], [-8.22, 33.71]];
    const map = L.map(ref.current, { zoomControl: true, minZoom: 6, maxZoom: 18, maxBounds: bounds, maxBoundsViscosity: 1.0 }).setView([-13.13, 27.85], 7);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
    const t1 = setTimeout(() => { map.invalidateSize(); map.fitBounds(bounds); }, 50);
    const t2 = setTimeout(() => map.invalidateSize(), 250);
    const t3 = setTimeout(() => map.invalidateSize(), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer(l => { if (!(l instanceof L.TileLayer)) map.removeLayer(l); });
    const pts: L.LatLngTuple[] = [];
    sites.forEach(s => {
      const lat = Number(s.latitude), lng = Number(s.longitude);
      if (!lat || !lng) return;
      const sc = s.siteScore || 0;
      const planned = s.status === 'planned';
      const col = planned ? '#0EA5E9' : sc >= 70 ? '#16A34A' : sc >= 40 ? '#F59E0B' : '#EF4444';
      const icon = L.divIcon({ className: '', html: `<div style="width:14px;height:14px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`, iconSize: [14,14], iconAnchor: [7,7] });
      L.marker([lat, lng], { icon }).bindPopup(`<div style="font-family:sans-serif;min-width:180px"><div style="background:${col};color:#fff;padding:6px 10px;border-radius:6px 6px 0 0;font-weight:700;font-size:12px">${planned ? '📅 Planned' : '✅ Visited'} · ${sc}%</div><div style="padding:8px 10px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 6px 6px"><b>${s.siteName||'—'}</b><br/><span style="font-size:11px;color:#6b7280">#${s.siteId||''} · ${s.aseName||''}</span><br/><span style="font-size:11px;color:#6b7280">${s.siteType==='rural'?'🌾 Rural':'🏙️ Urban'}</span></div></div>`).addTo(map);
      pts.push([lat, lng]);
    });
    if (pts.length > 0) map.fitBounds(pts, { padding: [40,40], maxZoom: 14 });
  }, [sites]);

  const withGps = sites.filter(s => Number(s.latitude) && Number(s.longitude)).length;
  return (
    <div>
      <div ref={ref} style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden' }} />
      <p className="text-[10px] text-gray-400 mt-1">{withGps} of {sites.length} sites have GPS · 🟢 good 🟡 fair 🔴 low 🔵 planned</p>
    </div>
  );
};
