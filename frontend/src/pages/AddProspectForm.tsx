import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Select, Textarea, Button } from '../components/UI';
import { MERCHANT_CATEGORIES } from '../types';
import type { ProspectType, ProspectStatus } from '../types';

export const AddProspectForm: React.FC = () => {
  const navigate    = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const DRAFT_KEY = 'draft_prospect';
  type ProspectForm = { prospectType: ProspectType; businessName: string; ownerName: string; contactPhone: string; town: string; address: string; merchantCategory: string; estimatedFloat: string; status: ProspectStatus; notes: string; followUpDate: string; };
  const savedDraft: ProspectForm | null = (() => { try { const d = localStorage.getItem(DRAFT_KEY); return d ? JSON.parse(d) as ProspectForm : null; } catch { return null; } })();
  useEffect(() => { if (savedDraft) toast('📋 Draft restored', { icon: '📋' }); }, []); // eslint-disable-line
  const [form, setForm] = useState<ProspectForm>(savedDraft || {
    prospectType:    'agent' as ProspectType,
    businessName:    '',
    ownerName:       '',
    contactPhone:    '',
    town:            '',
    address:         '',
    merchantCategory: '',
    estimatedFloat:  '',
    status:          'identified' as ProspectStatus,
    notes:           '',
    followUpDate:    '',
  });

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm(prev => { const next = { ...prev, [key]: e.target.value }; localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); return next; });
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName || !form.ownerName || !form.contactPhone || !form.town) {
      toast.error('Please fill in required fields');
      return;
    }

    setSubmitting(true);
    try {
      await tdrApi.createProspect({
        prospectType:    form.prospectType,
        businessName:    form.businessName,
        ownerName:       form.ownerName,
        contactPhone:    form.contactPhone,
        town:            form.town,
        address:         form.address         || undefined,
        merchantCategory: form.prospectType === 'merchant' ? form.merchantCategory || undefined : undefined,
        estimatedFloat:  form.estimatedFloat  ? parseFloat(form.estimatedFloat)  : undefined,
        status:          form.status,
        notes:           form.notes           || undefined,
        followUpDate:    form.followUpDate     || undefined,
      });
      localStorage.removeItem(DRAFT_KEY);
      toast.success('Prospect added to pipeline!');
      navigate('/tdr');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(typeof msg === 'string' ? msg : 'Failed to add prospect');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Add Prospect" showBack backTo="/tdr">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
        <h2 className="text-lg font-bold text-zamtel-dark mb-2">Add to Prospects Pipeline</h2>

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
          type="number"
          min="0"
          step="0.01"
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

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Add to Pipeline
        </Button>
      </form>
    </Layout>
  );
};
