import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { tdrApi } from '../services/api';
import { Layout } from '../components/Layout';
import { Input, Select, Textarea, Button } from '../components/UI';
import type { IssueType } from '../types';
import { ISSUE_TYPE_LABELS } from '../types';

export const ReportFloatIssueForm: React.FC = () => {
  const navigate    = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    agentCode:     '',
    agentName:     '',
    contactPhone:  '',
    issueType:     'low_float' as IssueType,
    reportedFloat: '',
    description:   '',
  });

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agentCode || !form.agentName || !form.description) {
      toast.error('Please fill in required fields');
      return;
    }

    setSubmitting(true);
    try {
      await tdrApi.createFloatIssue({
        agentCode:     form.agentCode,
        agentName:     form.agentName,
        contactPhone:  form.contactPhone,
        issueType:     form.issueType,
        reportedFloat: parseFloat(form.reportedFloat) || 0,
        description:   form.description,
      });
      toast.success('Float issue reported!');
      navigate('/tdr');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(typeof msg === 'string' ? msg : 'Failed to report issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Report Float Issue" showBack backTo="/tdr">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-8">
        <h2 className="text-lg font-bold text-zamtel-dark mb-2">Report Critical Float Issue</h2>

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
          type="number"
          min="0"
          step="0.01"
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

        <Button type="submit" loading={submitting} className="w-full" size="lg" variant="danger">
          Report Float Issue
        </Button>
      </form>
    </Layout>
  );
};
