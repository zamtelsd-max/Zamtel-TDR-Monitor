import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Select, Textarea, Button } from '../components/UI';
import type { IssueType } from '../types';
import { ISSUE_TYPE_LABELS } from '../types';
import { MapPin, Loader } from 'lucide-react';
import { useGPS } from '../hooks/useGPS';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { enqueueOffline } from '../utils/offlineQueue';

export const ReportFloatIssueForm: React.FC = () => {
  const navigate    = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const { capture: captureGPS, loading: gpsLoading } = useGPS();
  const { isOnline, pendingCount } = useOfflineSync();

  const DRAFT_KEY = 'draft_float_issue';
  const savedDraft = (() => {
    try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) : null; } catch { return null; }
  })();

  const [form, setForm] = useState(savedDraft || {
    agentCode:     '',
    agentName:     '',
    contactPhone:  '',
    issueType:     'low_float' as IssueType,
    reportedFloat: '',
    description:   '',
    latitude:      '',
    longitude:     '',
  });

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev: typeof form) => {
        const next = { ...prev, [key]: e.target.value };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        return next;
      });
    };

  const handleGPS = async () => {
    try {
      const { latitude, longitude } = await captureGPS();
      setForm((prev: typeof form) => {
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
    if (!form.agentCode || !form.agentName || !form.description) {
      toast.error('Please fill in required fields');
      return;
    }
    setSubmitting(true);
    const payload = {
      agentCode:     form.agentCode,
      agentName:     form.agentName,
      contactPhone:  form.contactPhone,
      issueType:     form.issueType,
      reportedFloat: parseFloat(form.reportedFloat) || 0,
      description:   form.description,
      latitude:      form.latitude  ? parseFloat(form.latitude)  : undefined,
      longitude:     form.longitude ? parseFloat(form.longitude) : undefined,
    };

    try {
      if (!navigator.onLine) {
        await enqueueOffline('float_issue', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
        return;
      }
      await tdrApi.createFloatIssue(payload);
      localStorage.removeItem(DRAFT_KEY);
      toast.success('Float issue reported!');
      navigate('/tdr');
    } catch (err: unknown) {
      const isNetworkError = !(err as any)?.response;
      if (isNetworkError) {
        await enqueueOffline('float_issue', payload as Record<string, unknown>);
        localStorage.removeItem(DRAFT_KEY);
        toast.success('📴 Saved offline — will sync when internet restores', { duration: 5000 });
        navigate('/tdr');
      } else {
        const msg = (err as any)?.response?.data?.error;
        toast.error(typeof msg === 'string' ? msg : 'Failed to report issue');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Report Float Issue" showBack backTo="/tdr">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
        <h2 className="text-lg font-bold text-zamtel-dark mb-2">Report Critical Float Issue</h2>

        {/* Offline banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-300 rounded-xl px-4 py-3">
            <span className="text-lg">📵</span>
            <div>
              <p className="text-sm font-bold text-orange-700">You are offline</p>
              <p className="text-xs text-orange-600">Report will be saved on your device and synced when you reconnect</p>
            </div>
          </div>
        )}
        {pendingCount > 0 && isOnline && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <span className="text-base">🔄</span>
            <p className="text-sm text-blue-700">{pendingCount} record{pendingCount > 1 ? 's' : ''} pending sync</p>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-800">
            Use this form to report agents experiencing float problems that need urgent attention from your ZBM.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Agent Code *" value={form.agentCode} onChange={set('agentCode')} placeholder="ZM-COP-0023" required />
          <Input label="Agent / Business Name *" value={form.agentName} onChange={set('agentName')} placeholder="Business name" required />
        </div>

        <Input label="Contact Phone" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+260..." />

        <Select
          label="Issue Type *"
          value={form.issueType}
          onChange={set('issueType')}
          options={Object.entries(ISSUE_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />

        <Input
          label="Current Float Amount (ZMW)"
          type="number" min="0" step="0.01"
          value={form.reportedFloat}
          onChange={set('reportedFloat')}
          placeholder="0.00"
          hint="Current float balance at time of reporting"
        />

        <Textarea
          label="Description *"
          value={form.description}
          onChange={set('description')}
          placeholder="Describe the issue in detail. What happened? What did the agent experience?"
          rows={4}
        />

        {/* GPS */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent GPS Location</label>
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

        <Button type="submit" loading={submitting} className="w-full" size="lg" variant="danger">
          {!isOnline ? '💾 Save Offline' : 'Report Float Issue'}
        </Button>
      </form>
    </Layout>
  );
};
