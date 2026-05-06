import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin, Loader, RefreshCw, Search } from 'lucide-react';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Textarea, Button } from '../components/UI';
import { useGPS } from '../hooks/useGPS';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { enqueueOffline } from '../utils/offlineQueue';

const DRAFT_KEY = 'draft_reactivation';

type ReactivationForm = {
  agentCode:    string;
  agentName:    string;
  contactPhone: string;
  town:         string;
  cluster:      string;
  market:       string;
  floatAmount:  string;
  latitude:     string;
  longitude:    string;
  notes:        string;
};

const defaultForm: ReactivationForm = {
  agentCode: '', agentName: '', contactPhone: '', town: '',
  cluster: '', market: '', floatAmount: '', latitude: '', longitude: '', notes: '',
};

export const ReactivationForm: React.FC = () => {
  const navigate  = useNavigate();
  const { capture: captureGPS, loading: gpsLoading } = useGPS();
  const isOnline  = useOnlineStatus();
  const [submitting, setSubmitting] = useState(false);
  const [lookingUp,  setLookingUp]  = useState(false);
  const [agentFound, setAgentFound] = useState<boolean | null>(null);

  const savedDraft: ReactivationForm | null = (() => {
    try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) as ReactivationForm : null; } catch { return null; }
  })();
  const [form, setForm] = useState<ReactivationForm>(savedDraft || defaultForm);

  const set = (key: keyof ReactivationForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(prev => {
        const next = { ...prev, [key]: e.target.value };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        return next;
      });
    };

  // Look up agent by dealer code
  const handleAgentCodeBlur = async () => {
    const code = form.agentCode.trim();
    if (!code) return;
    setLookingUp(true);
    setAgentFound(null);
    try {
      const r = await tdrApi.getAgentByCode(code);
      const a = r.data as any;
      setForm(prev => {
        const next = {
          ...prev,
          agentName:    a.agentName    || prev.agentName,
          contactPhone: a.contactPhone || prev.contactPhone,
          town:         a.town         || prev.town,
          cluster:      a.cluster      || prev.cluster,
          market:       a.market       || prev.market,
          latitude:     a.latitude     ? String(a.latitude)  : prev.latitude,
          longitude:    a.longitude    ? String(a.longitude) : prev.longitude,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        return next;
      });
      setAgentFound(true);
      const daysMsg = typeof a.daysAgo === 'number'
        ? `Last visited ${a.daysAgo} days ago`
        : 'Never visited before';
      toast.success(`✅ Agent found: ${a.agentName} — ${daysMsg}`);
    } catch {
      setAgentFound(false);
      toast('ℹ️ Agent code not in system — fill details manually', { duration: 4000 });
    } finally {
      setLookingUp(false);
    }
  };

  const handleGPS = async () => {
    try {
      const { latitude, longitude } = await captureGPS();
      setForm(prev => {
        const next = { ...prev, latitude: String(latitude), longitude: String(longitude) };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        return next;
      });
      toast.success('📍 GPS location captured');
    } catch (err) {
      toast.error((err as Error).message || 'GPS capture failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agentCode || !form.agentName || !form.contactPhone || !form.town) {
      toast.error('Please fill in Agent Code, Agent Name, Contact Phone and Town');
      return;
    }
    if (!form.latitude || !form.longitude) {
      toast.error('GPS coordinates are required — please capture location');
      return;
    }

    setSubmitting(true);
    const payload = {
      agentCode:    form.agentCode.trim(),
      agentName:    form.agentName.trim(),
      contactPhone: form.contactPhone.trim(),
      town:         form.town.trim(),
      cluster:      form.cluster   || undefined,
      market:       form.market    || undefined,
      floatAmount:  parseFloat(form.floatAmount) || 0,
      latitude:     parseFloat(form.latitude),
      longitude:    parseFloat(form.longitude),
      notes:        form.notes || undefined,
    };

    try {
      if (!navigator.onLine) {
        await enqueueOffline('reactivation', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem('zamtel_tdr_dashboard');
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
        return;
      }
      await tdrApi.createReactivation(payload);
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem('zamtel_tdr_dashboard');
      toast.success('✅ Agent reactivation recorded!', { duration: 4000 });
      navigate('/tdr');
    } catch (err: unknown) {
      const isNetworkError = !(err as any)?.response;
      if (isNetworkError) {
        await enqueueOffline('reactivation', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem('zamtel_tdr_dashboard');
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
      } else {
        const msg = (err as any)?.response?.data?.error;
        toast.error(typeof msg === 'string' ? msg : 'Failed to record reactivation');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Agent Reactivation" showBack backTo="/tdr">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-teal-100 rounded-xl">
            <RefreshCw className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zamtel-dark">Agent Reactivation</h2>
            <p className="text-xs text-gray-500">Record details of a reactivated inactive agent</p>
          </div>
        </div>

        {/* Offline banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-300 rounded-xl px-4 py-3">
            <span className="text-lg">📵</span>
            <div>
              <p className="text-sm font-bold text-orange-700">You are offline</p>
              <p className="text-xs text-orange-600">Data will be saved on your device and synced when you reconnect</p>
            </div>
          </div>
        )}

        {/* GPS required notice */}
        <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <MapPin className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
          <p className="text-xs text-teal-700">
            <span className="font-semibold">GPS location is required</span> for agent reactivation records.
            Please capture your location before submitting.
          </p>
        </div>

        {/* GPS Capture — at the top */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            GPS Location <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={handleGPS}
            disabled={gpsLoading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold text-sm transition-all
              ${form.latitude && form.longitude
                ? 'border-teal-400 bg-teal-50 text-teal-700'
                : 'border-dashed border-gray-300 bg-gray-50 text-gray-600 hover:border-teal-400 hover:bg-teal-50'
              }`}
          >
            {gpsLoading
              ? <><Loader className="w-4 h-4 animate-spin" /> Capturing GPS…</>
              : form.latitude && form.longitude
                ? <><MapPin className="w-4 h-4" /> {parseFloat(form.latitude).toFixed(5)}, {parseFloat(form.longitude).toFixed(5)} — Tap to refresh</>
                : <><MapPin className="w-4 h-4" /> Tap to capture GPS location</>
            }
          </button>
          {form.latitude && form.longitude && (
            <div className="flex gap-2 mt-2">
              <Input value={form.latitude}  onChange={set('latitude')}  placeholder="Latitude"  className="flex-1" type="number" step="any" />
              <Input value={form.longitude} onChange={set('longitude')} placeholder="Longitude" className="flex-1" type="number" step="any" />
            </div>
          )}
        </div>

        {/* Agent Code lookup */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dealer Code / Agent Code <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Input
              value={form.agentCode}
              onChange={e => { setAgentFound(null); set('agentCode')(e); }}
              onBlur={handleAgentCodeBlur}
              placeholder="e.g. CBT005309"
              required
              className={
                agentFound === true  ? 'border-green-400 bg-green-50' :
                agentFound === false ? 'border-amber-400 bg-amber-50' : ''
              }
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {lookingUp
                ? <Loader className="w-4 h-4 animate-spin text-gray-400" />
                : agentFound === true
                  ? <span className="text-green-600 text-xs font-bold">✓ Found</span>
                  : agentFound === false
                    ? <Search className="w-4 h-4 text-amber-500" />
                    : null
              }
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">Enter code and tap out — agent details auto-fill if found</p>
        </div>

        {/* Agent details */}
        <Input
          label={`Agent / Business Name *`}
          value={form.agentName}
          onChange={set('agentName')}
          placeholder="e.g. CHALI MUTALE"
          required
        />

        <Input
          label="Contact Phone *"
          value={form.contactPhone}
          onChange={set('contactPhone')}
          placeholder="+260..."
          type="tel"
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Town *" value={form.town} onChange={set('town')} placeholder="e.g. Ndola" required />
          <Input label="Cluster" value={form.cluster} onChange={set('cluster')} placeholder="Cluster A" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Market / Location" value={form.market} onChange={set('market')} placeholder="Town Market" />
          <Input
            label="Current Float (ZMW)"
            type="number"
            min="0"
            step="0.01"
            value={form.floatAmount}
            onChange={set('floatAmount')}
            placeholder="0.00"
          />
        </div>

        <Textarea
          label="Reactivation Notes"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Reason for inactivity, actions taken to reactivate, current float level, any observations…"
          rows={4}
        />

        <Button
          type="submit"
          loading={submitting}
          className="w-full bg-teal-600 hover:bg-teal-700 focus:ring-teal-500"
          size="lg"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Record Reactivation
        </Button>
      </form>
    </Layout>
  );
};
