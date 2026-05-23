import React, { useState } from 'react';
import { X, MapPin, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { ssoOdrApi } from '../services/api';

interface Props {
  type: 'SSO' | 'ODR';
  onClose: () => void;
  onSuccess: () => void;
}

export const OutletForm: React.FC<Props> = ({ type, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    outletName: '', ownerName: '', contactPhone: '', town: '', cluster: '',
    deviceType: type === 'SSO' ? 'SSO' : 'Zamtel',
    msisdn: '', simSerial: '', imei: '', notes: '',
  });
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  const getGPS = () => {
    if (!navigator.geolocation) { toast.error('GPS not available'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGpsLoading(false); toast.success('GPS captured!'); },
      () => { setGpsLoading(false); toast.error('GPS failed — check permissions'); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const submit = async () => {
    if (!form.outletName || !form.ownerName || !form.contactPhone || !form.town) {
      toast.error('Name, owner, phone and town are required'); return;
    }
    setSubmitting(true);
    try {
      const payload = { ...form, latitude: lat, longitude: lng };
      if (type === 'SSO') await ssoOdrApi.createSso(payload);
      else await ssoOdrApi.createOdr(payload);
      toast.success(`${type} outlet registered!`);
      onSuccess();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to register outlet');
    } finally {
      setSubmitting(false);
    }
  };

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';
  const lbl = 'text-xs font-semibold text-gray-600 block mb-1';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-y-auto max-h-[92vh]">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10 rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <h3 className="font-black text-gray-900 text-base">Register {type} Outlet</h3>
            <p className="text-xs text-gray-400 mt-0.5">{type === 'SSO' ? 'Sim Selling Outlet' : 'Own Device Retailer'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div><label className={lbl}>Outlet / Business Name *</label><input className={inp} value={form.outletName} onChange={set('outletName')} placeholder="e.g. Mwila Shop" /></div>
          <div><label className={lbl}>Owner Name *</label><input className={inp} value={form.ownerName} onChange={set('ownerName')} placeholder="Full name" /></div>
          <div><label className={lbl}>Contact Phone *</label><input className={inp} type="tel" value={form.contactPhone} onChange={set('contactPhone')} placeholder="09XXXXXXXX" /></div>
          <div><label className={lbl}>Town *</label><input className={inp} value={form.town} onChange={set('town')} placeholder="e.g. Kabwe" /></div>
          <div><label className={lbl}>Cluster (optional)</label><input className={inp} value={form.cluster} onChange={set('cluster')} placeholder="e.g. Cluster A" /></div>

          {type === 'ODR' && (
            <div>
              <label className={lbl}>Device Type</label>
              <select className={inp} value={form.deviceType} onChange={set('deviceType')}>
                <option value="Zamtel">Zamtel Device</option>
                <option value="SSO">SSO Device</option>
              </select>
            </div>
          )}

          <div><label className={lbl}>MSISDN (optional)</label><input className={inp} value={form.msisdn} onChange={set('msisdn')} placeholder="e.g. 0950000000" /></div>
          <div><label className={lbl}>SIM Serial (optional)</label><input className={inp} value={form.simSerial} onChange={set('simSerial')} placeholder="SIM serial" /></div>
          <div><label className={lbl}>IMEI (optional)</label><input className={inp} value={form.imei} onChange={set('imei')} placeholder="Device IMEI" /></div>
          <div>
            <label className={lbl}>Notes (optional)</label>
            <textarea className={inp} rows={2} value={form.notes} onChange={set('notes')} placeholder="Additional notes..." />
          </div>

          <div>
            <label className={lbl}>GPS Location</label>
            <button onClick={getGPS} disabled={gpsLoading}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl border-2 border-green-600 text-green-700 hover:bg-green-50 w-full justify-center disabled:opacity-50 transition-colors">
              {gpsLoading ? <Loader size={15} className="animate-spin" /> : <MapPin size={15} />}
              {gpsLoading ? 'Getting GPS...' : lat ? '✅ GPS Captured — Refresh?' : '📍 Get GPS Location'}
            </button>
            {lat !== null && lng !== null && (
              <p className="text-xs text-green-600 font-mono mt-1.5 text-center">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
            )}
          </div>

          <button onClick={submit} disabled={submitting}
            className="w-full text-white font-black py-3.5 rounded-xl text-sm tracking-wide disabled:opacity-50 transition-all"
            style={{ background: '#00843D' }}>
            {submitting ? 'Registering...' : `Register ${type} Outlet`}
          </button>
          <div className="pb-2" />
        </div>
      </div>
    </div>
  );
};
