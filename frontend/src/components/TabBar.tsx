import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
  badgeColor?: 'red' | 'amber' | 'green';
}

interface TabBarProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * Shared, polished tab bar used across all dashboards (TDR/ASE/ZBM/HSD).
 * Horizontal-scrollable pill bar with a subtle sticky container.
 */
export const TabBar: React.FC<TabBarProps> = ({ tabs, active, onChange }) => (
  <div className="sticky top-[56px] z-30 -mx-4 px-4 py-2 bg-gray-50/95 backdrop-blur border-b border-gray-100 mb-4">
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
      {tabs.map(t => {
        const isActive = active === t.id;
        const badgeBg = t.badgeColor === 'red' ? 'bg-red-500' : t.badgeColor === 'amber' ? 'bg-amber-500' : 'bg-zamtel-green';
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold tracking-wide transition-all ${
              isActive
                ? 'bg-zamtel-green text-white shadow-md shadow-green-200'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black text-white ${isActive ? 'bg-white/25' : badgeBg}`}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);
