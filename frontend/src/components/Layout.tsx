import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { logout } from '../store/authSlice';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

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

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleBack = () => {
    if (backTo) navigate(backTo);
    else navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-zamtel-dark text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {showBack && (
            <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-white/10 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Zamtel logo / brand */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 bg-zamtel-red rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">Z</span>
            </div>
            <div className="min-w-0">
              {title ? (
                <h1 className="font-bold text-sm truncate">{title}</h1>
              ) : (
                <h1 className="font-bold text-sm truncate">Zamtel TDR Monitor</h1>
              )}
              {user && (
                <p className="text-xs text-gray-400 truncate">
                  {user.name} · {user.role}{user.zone ? ` · ${user.zone}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online indicator */}
            {isOnline
              ? <Wifi className="w-4 h-4 text-green-400" />
              : <WifiOff className="w-4 h-4 text-red-400" />
            }

            {actions}

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-white/10 transition"
              title="Logout"
            >
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

      {/* Page content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4">
        {children}
      </main>
    </div>
  );
};

// ─── Page Header ──────────────────────────────────────────────────────────────
export const PageHeader: React.FC<{
  title:      string;
  subtitle?:  string;
  children?:  React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div className="mb-6 flex items-start justify-between gap-3">
    <div>
      <h2 className="text-xl font-bold text-zamtel-dark">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
    {children && <div className="flex-shrink-0">{children}</div>}
  </div>
);
