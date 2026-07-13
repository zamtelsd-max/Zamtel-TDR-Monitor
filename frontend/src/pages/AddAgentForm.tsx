import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin, Loader, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Select, Textarea, Button } from '../components/UI';
import { MERCHANT_CATEGORIES, ZAMBIA_ZONES } from '../types';
import { useAppSelector } from '../hooks/useAppDispatch';
import { useGPS } from '../hooks/useGPS';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { enqueueOffline } from '../utils/offlineQueue';

// ── Duplicate Agent Popup ───────────────────────────────────────────────────
type DuplicateInfo = {
  agentCode: string;
  agentName: string;
  tdrName: string;
  tdrId: string;
  zone: string;
  registeredAt: string;
};

const DuplicatePopup: React.FC<{ info: DuplicateInfo; onClose: () => void }> = ({ info, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
    <div
      className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
        <span className="text-3xl">🚫</span>
        <div>
          <p className="text-white font-black text-base leading-tight">Duplicate Agent Code</p>
          <p className="text-red-200 text-xs mt-0.5">This code is already in the system</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-2">
          <Row label="Agent Code" value={info.agentCode} mono />
          <Row label="Agent Name" value={info.agentName} />
        </div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">First registered by</p>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
          <Row label="TDR Name" value={info.tdrName} />
          <Row label="TDR ID" value={info.tdrId.slice(0, 8).toUpperCase()} mono />
          <Row label="Zone" value={info.zone} />
          <Row label="Date" value={new Date(info.registeredAt).toLocaleDateString('en-ZM', { day:'2-digit', month:'short', year:'numeric' })} />
        </div>
        <p className="text-xs text-gray-500 text-center leading-relaxed">
          If this agent is inactive, use the <strong>Reactivation Form</strong> to earn NT points.
        </p>
      </div>

      {/* Footer */}
      <div className="px-5 pb-5">
        <button
          onClick={onClose}
          className="w-full bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold py-3 rounded-xl transition-all"
        >
          OK, Got It
        </button>
      </div>
    </div>
  </div>
);

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex justify-between items-center gap-2">
    <span className="text-xs text-gray-500 shrink-0">{label}</span>
    <span className={`text-sm font-bold text-gray-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);

// ── Main Form ───────────────────────────────────────────────────────────────
export const AddAgentForm: React.FC = () => {
  const navigate  = useNavigate();
  const user      = useAppSelector(s => s.auth.user);
  const { capture: captureGPS, loading: gpsLoading } = useGPS();

  const [submitting, setSubmitting] = useState(false);
  const [duplicatePopup, setDuplicatePopup] = useState<DuplicateInfo | null>(null);
  const [codeChecking, setCodeChecking] = useState(false);
  const [codeStatus, setCodeStatus] = useState<null | {
    status: 'existing_agent' | 'nt_base' | 'not_found';
    agent?: { agentCode: string; agentName: string; type: string; zone: string; town: string; ownerName: string; tdrId: string; createdAt: string; registeredAt: string };
    ntRecord?: { agent_code: string; zone: string | null; agent_name: string | null; town: string | null };
  }>(null);
  const [ntConfirmed, setNtConfirmed] = useState(false);
  const checkedCodeRef = useRef<string>('');
  const { isOnline, pendingCount } = useOfflineSync();
  const DRAFT_KEY = 'draft_agent';
  type AgentForm = { agentName: string; agentCode: string; contactPhone: string; type: 'normal'|'merchant'; merchantCategory: string; initialFloat: string; town: string; address: string; cluster: string; market: string; latitude: string; longitude: string; notes: string; };
  const defaultForm: AgentForm = { agentName: '', agentCode: '', contactPhone: '', type: 'normal', merchantCategory: '', initialFloat: '', town: '', address: '', cluster: '', market: '', latitude: '', longitude: '', notes: '' };
  const savedDraft: AgentForm | null = (() => { try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) as AgentForm : null; } catch { return null; } })();
  const [form, setForm] = useState<AgentForm>(savedDraft || defaultForm);
  useEffect(() => { if (savedDraft) toast('📋 Draft restored', { icon: '📋' }); }, []); // eslint-disable-line

  // ── Prospect lookup: typing the name suggests matching prospects to auto-fill ──
  const [prospectMatches, setProspectMatches] = useState<any[]>([]);
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [showProspects, setShowProspects] = useState(false);
  const prospectTimer = useRef<any>(null);

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    set('agentName')(e);
    setProspectId(null);
    const q = e.target.value.trim();
    if (prospectTimer.current) clearTimeout(prospectTimer.current);
    if (q.length < 2) { setProspectMatches([]); setShowProspects(false); return; }
    prospectTimer.current = setTimeout(async () => {
      try {
        const r = await tdrApi.searchProspects(q);
        setProspectMatches(r.data.data || []);
        setShowProspects((r.data.data || []).length > 0);
      } catch { /* silent */ }
    }, 350);
  };

  const applyProspect = (p: any) => {
    setForm(prev => {
      const next = {
        ...prev,
        agentName: p.businessName || p.ownerName || prev.agentName,
        contactPhone: p.contactPhone || prev.contactPhone,
        type: (p.prospectType === 'merchant' ? 'merchant' : 'normal') as 'normal'|'merchant',
        merchantCategory: p.merchantCategory || prev.merchantCategory,
        initialFloat: p.estimatedFloat != null ? String(p.estimatedFloat) : prev.initialFloat,
        town: p.town || prev.town,
        address: p.address || prev.address,
        latitude: p.latitude != null ? String(p.latitude) : prev.latitude,
        longitude: p.longitude != null ? String(p.longitude) : prev.longitude,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      return next;
    });
    setProspectId(p.id);
    setShowProspects(false);
    setProspectMatches([]);
    toast.success('Prospect details loaded — now enter the Agent Code', { duration: 4000 });
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setForm(prev => { const next = { ...prev, [key]: val }; localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); return next; });
    // Reset code check when agentCode changes
    if (key === 'agentCode') {
      setCodeStatus(null);
      setNtConfirmed(false);
      checkedCodeRef.current = '';
    }
  };

  // Check agent code against system + NT base on blur
  const handleCodeBlur = async () => {
    const code = form.agentCode.trim();
    if (!code || code === checkedCodeRef.current) return;
    checkedCodeRef.current = code;
    setCodeChecking(true);
    setCodeStatus(null);
    setNtConfirmed(false);
    try {
      const API = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('zamtel_tdr_token') || sessionStorage.getItem('tdr_pending_token') || '';
      const res = await fetch(`${API}/tdr/agents/check-code?code=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCodeStatus(data);
    } catch {
      // silent — don't block the form
    } finally {
      setCodeChecking(false);
    }
  };

  const handleGPS = async () => {
    try {
      const { latitude, longitude } = await captureGPS();
      setForm(prev => ({ ...prev, latitude: String(latitude), longitude: String(longitude) }));
      toast.success('Location captured');
    } catch (err) {
      toast.error((err as Error).message || 'GPS capture failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agentName || !form.agentCode || !form.contactPhone || !form.town) {
      toast.error('Please fill in required fields');
      return;
    }
    // Block if code already registered in system — show popup
    if (codeStatus?.status === 'existing_agent' && codeStatus.agent) {
      setDuplicatePopup({
        agentCode:    codeStatus.agent.agentCode,
        agentName:    codeStatus.agent.agentName,
        tdrName:      codeStatus.agent.ownerName,
        tdrId:        codeStatus.agent.tdrId || codeStatus.agent.ownerName,
        zone:         codeStatus.agent.zone,
        registeredAt: codeStatus.agent.registeredAt || codeStatus.agent.createdAt,
      });
      return;
    }
    // NT base — require acknowledgement
    if (codeStatus?.status === 'nt_base' && !ntConfirmed) {
      toast('Tap the confirmation checkbox to acknowledge this is a reactivation', { icon: '⚠️', duration: 4000 });
      return;
    }
    setSubmitting(true);
    const payload = {
      agentName:        form.agentName,
      agentCode:        form.agentCode,
      contactPhone:     form.contactPhone,
      type:             form.type,
      merchantCategory: form.type === 'merchant' ? form.merchantCategory : undefined,
      initialFloat:     parseFloat(form.initialFloat) || 0,
      town:             form.town,
      address:          form.address  || undefined,
      cluster:          form.cluster  || undefined,
      market:           form.market   || undefined,
      latitude:         form.latitude  ? parseFloat(form.latitude)  : undefined,
      longitude:        form.longitude ? parseFloat(form.longitude) : undefined,
      notes:            form.notes    || undefined,
      prospectId:       prospectId    || undefined,
    };
    try {
      if (!navigator.onLine) {
        await enqueueOffline('agent', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
        return;
      }
      await tdrApi.createAgent(payload as any);
      localStorage.removeItem(DRAFT_KEY);
      toast.success('Agent recruited successfully!');
      navigate('/tdr');
    } catch (err: unknown) {
      const isNetworkError = !(err as any)?.response;
      if (isNetworkError) {
        await enqueueOffline('agent', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
      } else {
        const respData = (err as any)?.response?.data;
        // Show enriched duplicate popup if backend returns conflict info
        if ((err as any)?.response?.status === 409 && respData?.duplicate) {
          setDuplicatePopup(respData.duplicate as DuplicateInfo);
        } else {
          const msg = respData?.error;
          toast.error(typeof msg === 'string' ? msg : 'Failed to save. Try again.');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Add Agent" showBack backTo="/tdr">
      {/* Duplicate popup */}
      {duplicatePopup && (
        <DuplicatePopup info={duplicatePopup} onClose={() => setDuplicatePopup(null)} />
      )}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
        <h2 className="text-lg font-bold text-zamtel-dark mb-2">New Agent Recruitment</h2>

        {!isOnline && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-300 rounded-xl px-4 py-3">
            <span className="text-lg">📵</span>
            <div>
              <p className="text-sm font-bold text-orange-700">You are offline</p>
              <p className="text-xs text-orange-600">Data will be saved on your device and synced when you reconnect</p>
            </div>
          </div>
        )}
        {pendingCount > 0 && isOnline && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <span className="text-base">🔄</span>
            <p className="text-sm text-blue-700">{pendingCount} record{pendingCount > 1 ? 's' : ''} pending sync</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 relative">
            <Input label="Agent / Business Name *" value={form.agentName} onChange={onNameChange}
              placeholder="Type the prospect / business name…" required
              onFocus={() => { if (prospectMatches.length) setShowProspects(true); }} />
            {prospectId && (
              <p className="text-[11px] mt-1 font-semibold" style={{ color: '#00843D' }}>✓ Loaded from prospect — just enter the Agent Code below</p>
            )}
            {showProspects && prospectMatches.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50">Matching prospects — tap to load</p>
                {prospectMatches.map((p: any) => (
                  <button key={p.id} type="button" onClick={() => applyProspect(p)}
                    className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-semibold text-gray-800">{p.businessName || p.ownerName}</p>
                    <p className="text-[10px] text-gray-400">{p.ownerName ? `${p.ownerName} · ` : ''}{p.town || ''} · {p.contactPhone || ''} · {p.prospectType}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Agent Code with live system check */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agent Code / Dealer Code <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                value={form.agentCode}
                onChange={set('agentCode')}
                onBlur={handleCodeBlur}
                placeholder="e.g. ZM-COP-0023"
                required
                className={
                  codeStatus?.status === 'existing_agent' ? 'border-red-400 bg-red-50' :
                  codeStatus?.status === 'nt_base'        ? 'border-amber-400 bg-amber-50' :
                  codeStatus?.status === 'not_found'      ? 'border-green-400 bg-green-50' : ''
                }
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {codeChecking
                  ? <Loader className="w-4 h-4 animate-spin text-gray-400" />
                  : codeStatus?.status === 'existing_agent' ? <AlertTriangle className="w-4 h-4 text-red-500" />
                  : codeStatus?.status === 'nt_base'        ? <RefreshCw className="w-4 h-4 text-amber-500" />
                  : codeStatus?.status === 'not_found'      ? <CheckCircle className="w-4 h-4 text-green-500" />
                  : null
                }
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">Enter code then tap out — system checks automatically</p>

            {/* Status banners */}
            {codeStatus?.status === 'existing_agent' && codeStatus.agent && (
              <div className="mt-2 flex items-start gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                <span className="text-xl mt-0.5">🚫</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-700">Already Registered in System</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    <strong>{codeStatus.agent.agentName}</strong> — {codeStatus.agent.type === 'merchant' ? 'Merchant' : 'Agent'} · {codeStatus.agent.town}
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">
                    Registered by: <strong>{codeStatus.agent.ownerName}</strong> · Zone: {codeStatus.agent.zone}
                  </p>
                  <p className="text-xs font-semibold text-red-700 mt-1.5">You cannot re-register this code. If this agent is inactive, use the <Link to="/tdr/reactivations/new" className="underline">Reactivation Form</Link> instead.</p>
                </div>
              </div>
            )}

            {codeStatus?.status === 'nt_base' && (
              <div className="mt-2 flex items-start gap-3 bg-amber-50 border border-amber-400 rounded-xl px-4 py-3">
                <span className="text-xl mt-0.5">🔄</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-800">Non-Transacting Base Code</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    This code exists in the non-transacting agent base
                    {codeStatus.ntRecord?.zone ? ` (Zone: ${codeStatus.ntRecord.zone})` : ''}.
                    You are <strong>reactivating an existing inactive agent</strong>, not registering a new one.
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    💡 <strong>Tip:</strong> For a better experience and to earn NT points, use the{' '}
                    <Link to="/tdr/reactivations/new" className="underline font-semibold">Reactivation Form</Link> instead.
                  </p>
                  {/* Confirmation checkbox */}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ntConfirmed}
                      onChange={e => setNtConfirmed(e.target.checked)}
                      className="w-4 h-4 accent-amber-600"
                    />
                    <span className="text-xs font-semibold text-amber-800">
                      I understand — I am reactivating an existing inactive agent
                    </span>
                  </label>
                </div>
              </div>
            )}

            {codeStatus?.status === 'not_found' && (
              <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-300 rounded-xl px-3 py-2">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-xs font-semibold text-green-700">New code — not in system. Proceed to register.</p>
              </div>
            )}
          </div>

          <Input label="Contact Phone *" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+260..." required />
          <div /> {/* grid spacer */}
        </div>

        <Select
          label="Agent Type *"
          value={form.type}
          onChange={set('type')}
          options={[
            { value: 'normal',   label: 'Normal Agent' },
            { value: 'merchant', label: 'Merchant Agent' },
          ]}
        />

        {form.type === 'merchant' && (
          <Select
            label="Merchant Category"
            value={form.merchantCategory}
            onChange={set('merchantCategory')}
            options={[
              { value: '', label: '— Select Category —' },
              ...MERCHANT_CATEGORIES.map(c => ({ value: c, label: c })),
            ]}
          />
        )}

        <Input
          label="Initial Float (ZMW)"
          type="number"
          min="0"
          step="0.01"
          value={form.initialFloat}
          onChange={set('initialFloat')}
          placeholder="0.00"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Town *" value={form.town} onChange={set('town')} placeholder="e.g. Kitwe" required />
          <Input label="Cluster" value={form.cluster} onChange={set('cluster')} placeholder="e.g. Cluster A" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Market" value={form.market} onChange={set('market')} placeholder="e.g. Town Market" />
          <Input label="Address" value={form.address} onChange={set('address')} placeholder="Street / Plot" />
        </div>

        {/* GPS */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">GPS Location</label>
          <div className="flex gap-2">
            <Input value={form.latitude} onChange={set('latitude')} placeholder="Latitude" className="flex-1" type="number" step="any" />
            <Input value={form.longitude} onChange={set('longitude')} placeholder="Longitude" className="flex-1" type="number" step="any" />
          </div>
          <button
            type="button"
            onClick={handleGPS}
            disabled={gpsLoading}
            className="mt-2 flex items-center gap-2 text-sm text-zamtel-pink font-medium hover:underline disabled:opacity-60"
          >
            {gpsLoading ? <Loader className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {gpsLoading ? 'Capturing...' : 'Auto-capture GPS'}
          </button>
        </div>

        <Textarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="Any additional notes..." />

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Submit Agent Recruitment
        </Button>
      </form>
    </Layout>
  );
};
