import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin, Loader } from 'lucide-react';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Select, Textarea, Button } from '../components/UI';
import { MERCHANT_CATEGORIES, ZAMBIA_ZONES } from '../types';
import { useAppSelector } from '../hooks/useAppDispatch';
import { useGPS } from '../hooks/useGPS';

export const AddAgentForm: React.FC = () => {
  const navigate  = useNavigate();
  const user      = useAppSelector(s => s.auth.user);
  const { capture: captureGPS, loading: gpsLoading } = useGPS();

  const [submitting, setSubmitting] = useState(false);
  const DRAFT_KEY = 'draft_agent';
  type AgentForm = { agentName: string; agentCode: string; contactPhone: string; type: 'normal'|'merchant'; merchantCategory: string; initialFloat: string; town: string; address: string; cluster: string; market: string; latitude: string; longitude: string; notes: string; };
  const defaultForm: AgentForm = { agentName: '', agentCode: '', contactPhone: '', type: 'normal', merchantCategory: '', initialFloat: '', town: '', address: '', cluster: '', market: '', latitude: '', longitude: '', notes: '' };
  const savedDraft: AgentForm | null = (() => { try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) as AgentForm : null; } catch { return null; } })();
  const [form, setForm] = useState<AgentForm>(savedDraft || defaultForm);
  useEffect(() => { if (savedDraft) toast('📋 Draft restored', { icon: '📋' }); }, []); // eslint-disable-line

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => { const next = { ...prev, [key]: e.target.value }; localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); return next; });
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

    setSubmitting(true);
    try {
      await tdrApi.createAgent({
        agentName:        form.agentName,
        agentCode:        form.agentCode,
        contactPhone:     form.contactPhone,
        type:             form.type,
        merchantCategory: form.type === 'merchant' ? form.merchantCategory : undefined,
        initialFloat:     parseFloat(form.initialFloat) || 0,
        town:             form.town,
        address:          form.address || undefined,
        cluster:          form.cluster || undefined,
        market:           form.market  || undefined,
        latitude:         form.latitude  ? parseFloat(form.latitude)  : undefined,
        longitude:        form.longitude ? parseFloat(form.longitude) : undefined,
        notes:            form.notes || undefined,
      });
      localStorage.removeItem(DRAFT_KEY);
      toast.success('Agent recruited successfully!');
      navigate('/tdr');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (typeof msg === 'string') toast.error(msg);
      else toast.error('Failed to save. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Add Agent" showBack backTo="/tdr">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
        <h2 className="text-lg font-bold text-zamtel-dark mb-2">New Agent Recruitment</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input label="Agent / Business Name *" value={form.agentName} onChange={set('agentName')} placeholder="e.g. Chanda Supermarket" required />
          </div>
          <Input label="Agent Code *" value={form.agentCode} onChange={set('agentCode')} placeholder="e.g. ZM-COP-0023" required />
          <Input label="Contact Phone *" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+260..." required />
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
