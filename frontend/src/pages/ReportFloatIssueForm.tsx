import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Select, Textarea, Button } from '../components/UI';
import type { IssueType } from '../types';
import { ISSUE_TYPE_LABELS } from '../types';
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

        {/* GPS coordinates */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">📍 Agent Location (GPS)</span>
            <button
              type="button"
              onClick={handleGPS}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition"
              style={{ background: form.latitude ? '#dcfce7' : '#00843D', color: form.latitude ? '#15803d' : 'white' }}
            >
              {gpsLoading ? '⏳ Getting location…' : form.latitude ? '✅ Location captured' : '📡 Capture GPS'}
            </button>
          </div>
          {form.latitude && form.longitude ? (
            <p className="text-xs text-green-700 font-mono bg-green-50 rounded-lg px-3 py-1.5">
              {parseFloat(form.latitude).toFixed(6)}, {parseFloat(form.longitude).toFixed(6)}
              <button
                type="button"
                onClick={() => setForm((p: typeof form) => ({ ...p, latitude: '', longitude: '' }))}
                className="ml-2 text-red-400 hover:text-red-600"
              >✕ clear</button>
            </p>
          ) : (
            <p className="text-xs text-gray-400">Capture GPS to record the agent's location at the time of reporting. Works offline.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input label="Latitude (manual)" value={form.latitude} onChange={set('latitude')} placeholder="-15.416724" />
            <Input label="Longitude (manual)" value={form.longitude} onChange={set('longitude')} placeholder="28.281510" />
          </div>
        </div>

        <Button type="submit" loading={submitting} className="w-full" size="lg" variant="danger">
          {!isOnline ? '💾 Save Offline' : 'Report Float Issue'}
        </Button>
      </form>
    </Layout>
  );
};
