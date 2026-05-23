import React, { useState } from 'react';
import { X, Smartphone, Save, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const ZAMBIA_ZONES = [
  'Central','Copperbelt','Eastern','Luapula',
  'Lusaka North','Lusaka South','Muchinga',
  'North-Western','Northern','Southern','Western',
];

const DEVICE_SOURCES = ['MobiGO2+', 'A100C', 'P38', 'A50', 'A60', 'Other'];

interface Props {
  onClose: () => void;
  onSaved: () => void;
  defaultZone?: string;
  /** 'zbm' uses /zbm/devices, 'hsd' uses /hsd/devices */
  role: 'ZBM' | 'HSD';
  addDevice: (data: Record<string, any>) => Promise<any>;
}

export const AddDeviceModal: React.FC<Props> = ({ onClose, onSaved, defaultZone, addDevice }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    dealerCode:    '',
    description:   '',
    imei1:         '',
    imei2:         '',
    msisdn:        '',
    simSerial:     '',
    siteId:        '',
    region:        defaultZone || '',
    zone:          defaultZone || '',
    aseName:       '',
    teamLead:      '',
    status:        'ACTIVE',
    activityStatus:'1',
    kycReg:        '0',
    grossAdds:     '0',
    zamoGA:        '0',
    recharges:     '0',
    deviceSource:  'MobiGO2+',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.imei1.trim()) { toast.error('IMEI 1 is required'); return; }
    if (!form.zone) { toast.error('Zone is required'); return; }
    setSaving(true);
    try {
      await addDevice({
        ...form,
        activityStatus: Number(form.activityStatus),
        kycReg:         Number(form.kycReg),
        grossAdds:      Number(form.grossAdds),
        zamoGA:         Number(form.zamoGA),
        recharges:      Number(form.recharges),
      });
      toast.success('Device added successfully');
      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to add device';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';
  const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';
  const selectCls = inputCls;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-green-700 to-green-600 rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-lg p-2">
              <Smartphone size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Add New KYC Device</h2>
              <p className="text-green-100 text-xs">Register a device not in the existing allocation list</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex gap-2 text-xs text-blue-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>This device will be added to the KYC device registry and attributed to the selected ASE. IMEI 1 must be unique.</span>
          </div>

          {/* Section: Identity */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Device Identity</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>IMEI 1 <span className="text-red-500">*</span></label>
                <input className={inputCls} value={form.imei1} onChange={e=>set('imei1',e.target.value)}
                  placeholder="e.g. 350094515540903" maxLength={20}/>
              </div>
              <div>
                <label className={labelCls}>IMEI 2</label>
                <input className={inputCls} value={form.imei2} onChange={e=>set('imei2',e.target.value)}
                  placeholder="e.g. 350094515540911" maxLength={20}/>
              </div>
              <div>
                <label className={labelCls}>Dealer Code</label>
                <input className={inputCls} value={form.dealerCode} onChange={e=>set('dealerCode',e.target.value)}
                  placeholder="e.g. CEN099694"/>
              </div>
              <div>
                <label className={labelCls}>Device Model</label>
                <select className={selectCls} value={form.deviceSource} onChange={e=>set('deviceSource',e.target.value)}>
                  {DEVICE_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <input className={inputCls} value={form.description} onChange={e=>set('description',e.target.value)}
                  placeholder="e.g. ITEL A100C"/>
              </div>
              <div>
                <label className={labelCls}>SIM Serial / MSISDN</label>
                <input className={inputCls} value={form.msisdn} onChange={e=>set('msisdn',e.target.value)}
                  placeholder="e.g. 260976543210"/>
              </div>
            </div>
          </div>

          {/* Section: Assignment */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Assignment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Zone <span className="text-red-500">*</span></label>
                <select className={selectCls} value={form.zone} onChange={e=>{ set('zone',e.target.value); set('region',e.target.value); }}>
                  <option value="">— Select Zone —</option>
                  {ZAMBIA_ZONES.map(z=><option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Region</label>
                <input className={inputCls} value={form.region} onChange={e=>set('region',e.target.value)}
                  placeholder="Same as zone or sub-region"/>
              </div>
              <div>
                <label className={labelCls}>ASE / BDC / TSE Name</label>
                <input className={inputCls} value={form.aseName} onChange={e=>set('aseName',e.target.value)}
                  placeholder="e.g. Charity Mtonga"/>
              </div>
              <div>
                <label className={labelCls}>Team Lead / TDR Name</label>
                <input className={inputCls} value={form.teamLead} onChange={e=>set('teamLead',e.target.value)}
                  placeholder="e.g. Mordecai"/>
              </div>
              <div>
                <label className={labelCls}>Site ID</label>
                <input className={inputCls} value={form.siteId} onChange={e=>set('siteId',e.target.value)}
                  placeholder="e.g. LKP0144"/>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={selectCls} value={form.status} onChange={e=>set('status',e.target.value)}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="PENDING">PENDING DEPLOYMENT</option>
                  <option value="DEFECTIVE">DEFECTIVE</option>
                  <option value="RETURNED">RETURNED</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section: Performance (optional) */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Performance Data <span className="text-gray-300 font-normal">(optional)</span></h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Activity Status</label>
                <select className={selectCls} value={form.activityStatus} onChange={e=>set('activityStatus',e.target.value)}>
                  <option value="1">Active (1)</option>
                  <option value="0">Inactive (0)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>KYC Registrations</label>
                <input type="number" min="0" className={inputCls} value={form.kycReg}
                  onChange={e=>set('kycReg',e.target.value)} placeholder="0"/>
              </div>
              <div>
                <label className={labelCls}>Gross Adds</label>
                <input type="number" min="0" className={inputCls} value={form.grossAdds}
                  onChange={e=>set('grossAdds',e.target.value)} placeholder="0"/>
              </div>
              <div>
                <label className={labelCls}>ZaMo GA</label>
                <input type="number" min="0" className={inputCls} value={form.zamoGA}
                  onChange={e=>set('zamoGA',e.target.value)} placeholder="0"/>
              </div>
              <div>
                <label className={labelCls}>Recharges (K)</label>
                <input type="number" min="0" step="0.01" className={inputCls} value={form.recharges}
                  onChange={e=>set('recharges',e.target.value)} placeholder="0.00"/>
              </div>
              <div>
                <label className={labelCls}>Sim Serial</label>
                <input className={inputCls} value={form.simSerial} onChange={e=>set('simSerial',e.target.value)}
                  placeholder="e.g. 8926003..."/>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-gradient-to-r from-green-700 to-green-600 text-white rounded-xl py-3 text-sm font-bold
                         shadow-lg shadow-green-200 hover:from-green-800 hover:to-green-700 transition-all
                         disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Saving...</>
              ) : (
                <><Save size={16}/>Add Device</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
