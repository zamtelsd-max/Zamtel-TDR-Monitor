import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin, Loader } from 'lucide-react';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Textarea, Button } from '../components/UI';
import { useGPS } from '../hooks/useGPS';

export const RecordVisitForm: React.FC = () => {
  const navigate = useNavigate();
  const { capture: captureGPS, loading: gpsLoading } = useGPS();
  const [submitting, setSubmitting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const DRAFT_KEY = 'draft_visit';
  type VisitForm = { outletName: string; agentCode: string; contactPhone: string; town: string; cluster: string; market: string; floatAmount: string; latitude: string; longitude: string; notes: string; };
  const defaultForm: VisitForm = { outletName: '', agentCode: '', contactPhone: '', town: '', cluster: '', market: '', floatAmount: '', latitude: '', longitude: '', notes: '' };
  const savedDraft: VisitForm | null = (() => { try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) as VisitForm : null; } catch { return null; } })();
  const [form, setForm] = useState<VisitForm>(savedDraft || defaultForm);
  useEffect(() => { if (savedDraft) toast('📋 Draft restored', { icon: '📋' }); }, []); // eslint-disable-line

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(prev => { const next = { ...prev, [key]: e.target.value }; localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); return next; });
    };

  // Auto-lookup agent by code on blur
  const handleAgentCodeBlur = async () => {
    const code = form.agentCode.trim();
    if (!code) return;
    setLookingUp(true);
    try {
      const r = await tdrApi.getAgentByCode(code);
      const a = r.data;
      setForm(prev => {
        const next = {
          ...prev,
          outletName:   a.agentName,
          contactPhone: a.contactPhone,
          town:         a.town,
          latitude:     a.latitude  ? String(a.latitude)  : prev.latitude,
          longitude:    a.longitude ? String(a.longitude) : prev.longitude,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        return next;
      });
      toast.success(`Agent found: ${a.agentName}`);
    } catch {
      // Agent not found — no action, let user fill manually
    } finally {
      setLookingUp(false);
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
    if (!form.outletName || !form.agentCode || !form.town) {
      toast.error('Please fill in required fields');
      return;
    }

    setSubmitting(true);
    try {
      await tdrApi.createVisit({
        outletName:   form.outletName,
        agentCode:    form.agentCode,
        contactPhone: form.contactPhone,
        town:         form.town,
        cluster:      form.cluster   || undefined,
        market:       form.market    || undefined,
        floatAmount:  parseFloat(form.floatAmount) || 0,
        latitude:     form.latitude  ? parseFloat(form.latitude)  : undefined,
        longitude:    form.longitude ? parseFloat(form.longitude) : undefined,
        notes:        form.notes     || undefined,
      });
      localStorage.removeItem(DRAFT_KEY);
      toast.success('Visit recorded successfully!');
      navigate('/tdr');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(typeof msg === 'string' ? msg : 'Failed to record visit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Record Visit" showBack backTo="/tdr">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
        <h2 className="text-lg font-bold text-zamtel-dark mb-2">Outlet Visitation Record</h2>

        <Input label="Outlet / Business Name *" value={form.outletName} onChange={set('outletName')} placeholder="e.g. Mwamba Grocery" required />

        <div className="grid grid-cols-2 gap-3">
          <Input label={`Agent Code * ${lookingUp ? '(looking up…)' : ''}`} value={form.agentCode} onChange={set('agentCode')} onBlur={handleAgentCodeBlur} placeholder="e.g. ZM-COP-0023" required />
          <Input label="Contact Phone" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+260..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Town *" value={form.town} onChange={set('town')} placeholder="e.g. Ndola" required />
          <Input label="Cluster" value={form.cluster} onChange={set('cluster')} placeholder="Cluster A" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Market" value={form.market} onChange={set('market')} placeholder="Town Market" />
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

        <Textarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="Observations, float level comments..." />

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Record Visit
        </Button>
      </form>
    </Layout>
  );
};
