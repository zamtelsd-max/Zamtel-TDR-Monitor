import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Select, Textarea, Button } from '../components/UI';
import { MERCHANT_CATEGORIES } from '../types';
import type { ProspectType, ProspectStatus } from '../types';
import { MapPin, Loader } from 'lucide-react';
import { useGPS } from '../hooks/useGPS';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { enqueueOffline } from '../utils/offlineQueue';

export const AddProspectForm: React.FC = () => {
  const navigate    = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const { capture: captureGPS, loading: gpsLoading } = useGPS();
  const { isOnline, pendingCount } = useOfflineSync();

  const DRAFT_KEY = 'draft_prospect';
  type ProspectForm = {
    prospectType: ProspectType; businessName: string; ownerName: string;
    contactPhone: string; town: string; address: string; merchantCategory: string;
    estimatedFloat: string; status: ProspectStatus; notes: string; followUpDate: string;
    latitude: string; longitude: string;
  };
  const savedDraft: ProspectForm | null = (() => {
    try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) as ProspectForm : null; } catch { return null; }
  })();
  useEffect(() => { if (savedDraft) toast('📋 Draft restored', { icon: '📋' }); }, []); // eslint-disable-line

  const [form, setForm] = useState<ProspectForm>(savedDraft || {
    prospectType: 'agent' as ProspectType,
    businessName: '', ownerName: '', contactPhone: '', town: '', address: '',
    merchantCategory: '', estimatedFloat: '', status: 'identified' as ProspectStatus,
    notes: '', followUpDate: '', latitude: '', longitude: '',
  });

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm(prev => {
        const next = { ...prev, [key]: e.target.value };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        return next;
      });
    };

  const handleGPS = async () => {
    try {
      const { latitude, longitude } = await captureGPS();
      setForm(prev => {
        const next = { ...prev, latitude: String(latitude), longitude: String(longitude) };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        return next;
      });
      toast.success(`📍 Location captured`);
    } catch (err) {
      toast.error((err as Error).message || 'GPS capture failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName || !form.ownerName || !form.contactPhone || !form.town) {
      toast.error('Please fill in required fields');
      return;
    }
    setSubmitting(true);
    const payload = {
      prospectType:     form.prospectType,
      businessName:     form.businessName,
      ownerName:        form.ownerName,
      contactPhone:     form.contactPhone,
      town:             form.town,
      address:          form.address           || undefined,
      merchantCategory: form.prospectType === 'merchant' ? form.merchantCategory || undefined : undefined,
      estimatedFloat:   form.estimatedFloat     ? parseFloat(form.estimatedFloat) : undefined,
      status:           form.status,
      notes:            form.notes              || undefined,
      followUpDate:     form.followUpDate        || undefined,
      latitude:         form.latitude            ? parseFloat(form.latitude)  : undefined,
      longitude:        form.longitude           ? parseFloat(form.longitude) : undefined,
    };

    try {
      if (!navigator.onLine) {
        await enqueueOffline('prospect', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
        return;
      }
      await tdrApi.createProspect(payload);
      localStorage.removeItem(DRAFT_KEY);
      toast.success('Prospect added to pipeline!');
      navigate('/tdr');
    } catch (err: unknown) {
      const isNetworkError = !(err as any)?.response;
      if (isNetworkError) {
        await enqueueOffline('prospect', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
      } else {
        const msg = (err as any)?.response?.data?.error;
        toast.error(typeof msg === 'string' ? msg : 'Failed to add prospect');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Add Prospect" showBack backTo="/tdr">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
        <h2 className="text-lg font-bold text-zamtel-dark mb-2">Add to Prospects Pipeline</h2>

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
        {pendingCount > 0 && isOnline && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <span className="text-base">🔄</span>
            <p className="text-sm text-blue-700">{pendingCount} record{pendingCount > 1 ? 's' : ''} pending sync</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-sm text-blue-800">
            Add potential agents and merchants you've identified but haven't recruited yet. Track their progress here.
          </p>
        </div>

        <Select
          label="Prospect Type *"
          value={form.prospectType}
          onChange={set('prospectType')}
          options={[
            { value: 'agent',    label: 'Agent Prospect' },
            { value: 'merchant', label: 'Merchant Prospect' },
          ]}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Business Name *" value={form.businessName} onChange={set('businessName')} placeholder="Business name" required />
          <Input label="Owner Name *" value={form.ownerName} onChange={set('ownerName')} placeholder="Owner full name" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Contact Phone *" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+260..." required />
          <Input label="Town *" value={form.town} onChange={set('town')} placeholder="e.g. Livingstone" required />
        </div>

        <Input label="Address" value={form.address} onChange={set('address')} placeholder="Street / Plot number" />

        {form.prospectType === 'merchant' && (
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
          label="Estimated Starting Float (ZMW)"
          type="number" min="0" step="0.01"
          value={form.estimatedFloat}
          onChange={set('estimatedFloat')}
          placeholder="0.00"
          hint="Estimated float they would start with if recruited"
        />

        <Select
          label="Current Status"
          value={form.status}
          onChange={set('status')}
          options={[
            { value: 'identified', label: 'Identified' },
            { value: 'contacted',  label: 'Contacted' },
            { value: 'interested', label: 'Interested' },
            { value: 'converted',  label: 'Converted ✅' },
            { value: 'rejected',   label: 'Rejected ❌' },
          ]}
        />

        <Input
          label="Follow-up Date"
          type="date"
          value={form.followUpDate}
          onChange={set('followUpDate')}
          min={new Date().toISOString().split('T')[0]}
        />

        <Textarea
          label="Notes"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Notes about this prospect — what they said, their concerns, your assessment..."
          rows={4}
        />

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

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          {!isOnline ? '💾 Save Offline' : 'Add to Pipeline'}
        </Button>
      </form>
    </Layout>
  );
};
