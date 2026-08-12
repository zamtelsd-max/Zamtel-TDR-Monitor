import React from 'react';
import clsx from 'clsx';

interface ProgressRingProps {
  value:     number;
  size?:     number;
  stroke?:   number;
  color?:    string;
  label?:    string;
  sublabel?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value, size = 80, stroke = 8, color = '#00843D', label, sublabel,
}) => {
  const radius       = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset       = circumference - (Math.min(value, 100) / 100) * circumference;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-gray-800">{Math.min(value, 100)}%</span>
        </div>
      </div>
      {label    && <p className="mt-1 text-xs font-semibold text-gray-700 text-center">{label}</p>}
      {sublabel && <p className="text-xs text-gray-500 text-center">{sublabel}</p>}
    </div>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('bg-gray-200 rounded animate-skeleton', className)} />
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={clsx('bg-white rounded-2xl shadow-sm border border-gray-100 p-4', className)}>
    {children}
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = 'bg-gray-100 text-gray-700' }) => (
  <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', color)}>
    {children}
  </span>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'pink';
  size?:    'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', loading = false, disabled, className, ...props
}) => {
  const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
  const variants = {
    primary:   'bg-zamtel-green text-white hover:bg-zamtel-green-dark focus:ring-zamtel-green',
    pink:      'bg-zamtel-green text-white hover:bg-zamtel-green-dark focus:ring-zamtel-green',
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-300',
    danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost:     'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-300',
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string;
}
export const Input: React.FC<InputProps> = ({ label, error, hint, className, ...props }) => (
  <div className="w-full">
    {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
    <input className={clsx(
      'w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green focus:border-transparent transition',
      error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white', className
    )} {...props} />
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
  </div>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string; options: Array<{ value: string; label: string }>;
}
export const Select: React.FC<SelectProps> = ({ label, error, options, className, ...props }) => (
  <div className="w-full">
    {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
    <select className={clsx(
      'w-full rounded-xl border px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zamtel-green focus:border-transparent transition',
      error ? 'border-red-400' : 'border-gray-200', className
    )} {...props}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string; error?: string;
}
export const Textarea: React.FC<TextareaProps> = ({ label, error, className, ...props }) => (
  <div className="w-full">
    {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
    <textarea rows={3} className={clsx(
      'w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zamtel-green focus:border-transparent transition resize-none',
      error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white', className
    )} {...props} />
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
);

interface StatCardProps {
  label: string; value: number | string; sub?: string;
  icon?: React.ReactNode; color?: string; loading?: boolean; accent?: 'green' | 'pink';
}
export const StatCard: React.FC<StatCardProps> = ({ label, value, sub, icon, color, loading, accent }) => {
  // Modern KPI card: white surface, faint-green icon chip, big green number,
  // subtle top accent bar. Zamtel green/white identity across all dashboards.
  const trendUp = typeof sub === 'string' && /▲|\+|up/i.test(sub);
  const trendDown = typeof sub === 'string' && /▼|-\d|down/i.test(sub);
  return (
    <div className="relative bg-white rounded-2xl border border-[#DCEAE2] p-4 overflow-hidden shadow-[0_1px_3px_rgba(0,80,40,0.05)] transition-all hover:shadow-[0_6px_18px_rgba(0,132,61,0.12)] hover:-translate-y-0.5">
      <span className="absolute top-0 left-0 h-1 w-full" style={{ background: 'linear-gradient(90deg,#00843D,#4CAF7D)' }} />
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {loading ? (
            <><Skeleton className="h-8 w-20 mb-1.5" /><Skeleton className="h-3.5 w-24" /></>
          ) : (
            <>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#5B7267] mb-1.5">{label}</p>
              <p className="text-[28px] leading-none font-extrabold text-[#006630]">{value}</p>
              {sub && (
                <p className={clsx('text-xs mt-1.5 font-medium', trendUp ? 'text-[#00843D]' : trendDown ? 'text-[#5B7267]' : 'text-[#5B7267]')}>{sub}</p>
              )}
            </>
          )}
        </div>
        {icon && (
          <div className="ml-3 shrink-0 w-11 h-11 rounded-xl grid place-items-center" style={{ background: '#E8F5EE', color: '#006630' }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};
