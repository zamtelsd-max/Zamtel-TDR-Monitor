import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Wifi, WifiOff, Settings } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { logout } from '../store/authSlice';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getUserTitle, getShortTitle } from '../utils/userTitle';

interface LayoutProps {
  children:  React.ReactNode;
  title?:    string;
  showBack?: boolean;
  backTo?:   string;
  actions?:  React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children, title, showBack, backTo, actions }) => {
  const dispatch = useAppDispatch();
  const user     = useAppSelector(s => s.auth.user);
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const handleLogout = () => { dispatch(logout()); navigate('/login'); };
  const handleBack   = () => { if (backTo) navigate(backTo); else navigate(-1); };

  const canAdmin = user?.role === 'HSD' || user?.role === 'ZBM';

  return (
    <div className="page-bg flex flex-col min-h-screen">
      {/* Header — Zamtel green→pink */}
      <header className="zamtel-header text-white sticky top-0 z-50 mb-1">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {showBack && (
            <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-white/10 transition flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Zamtel brand */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Z logo with pink accent */}
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow">
              <span className="text-zamtel-green font-black text-sm">Z</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-sm truncate">{title || 'TDR Monitor'}</h1>
                <span className="hidden sm:inline-block text-[10px] bg-zamtel-pink text-white px-1.5 py-0.5 rounded-full font-semibold">
                  {user ? getShortTitle(user.id, user.role) : 'ZAMTEL'}
                </span>
              </div>
              {user && (
                <p className="text-xs text-green-200 truncate">
                  {user.name} · {getUserTitle(user.id, user.role)}{user.zone ? ` · ${user.zone}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isOnline
              ? <Wifi className="w-4 h-4 text-green-200" />
              : <WifiOff className="w-4 h-4 text-red-300" />
            }
            {canAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="p-1.5 rounded-lg hover:bg-white/10 transition"
                title="Admin Panel"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            {actions}
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/10 transition" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-center text-xs py-1.5 px-4">
          Offline — showing cached data. New records will sync when connected.
        </div>
      )}

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4">
        {children}
      </main>
    </div>
  );
};

export const PageHeader: React.FC<{
  title: string; subtitle?: string; children?: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div className="mb-5 flex items-start justify-between gap-3">
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        <div className="w-1 h-5 rounded-full bg-zamtel-green" />
        <h2 className="text-xl font-black text-gray-900">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5 pl-3">{subtitle}</p>}
    </div>
    {children && <div className="flex-shrink-0">{children}</div>}
  </div>
);
