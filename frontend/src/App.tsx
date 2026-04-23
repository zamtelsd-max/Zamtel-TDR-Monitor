import React, { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { Login }                from './pages/Login';
import { TDRDashboardPage }     from './pages/TDRDashboard';
import { ZBMDashboardPage }     from './pages/ZBMDashboard';
import { ZBMLeaderboardPage }  from './pages/ZBMLeaderboardPage';
import { HSDDashboardPage }     from './pages/HSDDashboard';
import { AddAgentForm }         from './pages/AddAgentForm';
import { RecordVisitForm }      from './pages/RecordVisitForm';
import { ReportFloatIssueForm } from './pages/ReportFloatIssueForm';
import { AddProspectForm }      from './pages/AddProspectForm';
import { AdminPanel }           from './pages/AdminPanel';
import { LeaderboardPage }      from './pages/Leaderboard';
import { ASEDashboardPage }     from './pages/ASEDashboard';

function RootRedirect() {
  const state = store.getState();
  const user  = state.auth.user;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'TDR') return <Navigate to="/tdr" replace />;
  if (user.role === 'ZBM') return <Navigate to="/zbm" replace />;
  if (user.role === 'HSD') return <Navigate to="/hsd" replace />;
  if (user.role === 'ASE') return <Navigate to="/ase" replace />;
  return <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"      element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />

      {/* TDR */}
      <Route path="/tdr" element={
        <ProtectedRoute roles={['TDR']}>
          <PageErrorBoundary page="TDR Dashboard"><TDRDashboardPage /></PageErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/tdr/agents/new" element={
        <ProtectedRoute roles={['TDR']}>
          <PageErrorBoundary page="Add Agent"><AddAgentForm /></PageErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/tdr/visits/new" element={
        <ProtectedRoute roles={['TDR']}>
          <PageErrorBoundary page="Record Visit"><RecordVisitForm /></PageErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/tdr/float-issues/new" element={
        <ProtectedRoute roles={['TDR']}>
          <PageErrorBoundary page="Float Issue"><ReportFloatIssueForm /></PageErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/tdr/prospects/new" element={
        <ProtectedRoute roles={['TDR']}>
          <PageErrorBoundary page="Add Prospect"><AddProspectForm /></PageErrorBoundary>
        </ProtectedRoute>
      } />

      {/* ZBM */}
      <Route path="/zbm" element={
        <ProtectedRoute roles={['ZBM']}>
          <PageErrorBoundary page="ZBM Dashboard"><ZBMDashboardPage /></PageErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/zbm/leaderboard" element={
        <ProtectedRoute roles={['ZBM']}>
          <PageErrorBoundary page="ZBM Leaderboard"><ZBMLeaderboardPage /></PageErrorBoundary>
        </ProtectedRoute>
      } />

      {/* HSD */}
      <Route path="/hsd" element={
        <ProtectedRoute roles={['HSD']}>
          <PageErrorBoundary page="HSD Dashboard"><HSDDashboardPage /></PageErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Leaderboard — HSD + ZBM */}
      <Route path="/leaderboard" element={
        <ProtectedRoute roles={['HSD', 'ZBM']}>
          <PageErrorBoundary page="Leaderboard"><LeaderboardPage /></PageErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Admin Panel — HSD + ZBM */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['HSD', 'ZBM']}>
          <PageErrorBoundary page="Admin Panel"><AdminPanel /></PageErrorBoundary>
        </ProtectedRoute>
      } />

      {/* ASE */}
      <Route path="/ase" element={
        <ProtectedRoute roles={['ASE']}>
          <PageErrorBoundary page="ASE Dashboard"><ASEDashboardPage /></PageErrorBoundary>
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Register service worker event listeners
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        console.log('Service Worker ready');
      });
    }
  }, []);

  return (
    <Provider store={store}>
      {import.meta.env.VITE_USE_HASH === 'true' ? (
        <HashRouter>
          <AppRoutes />
          <Toaster position="top-center" toastOptions={{ duration: 3000, style: { borderRadius: '12px', background: '#1A1A2E', color: '#fff', fontSize: '14px' }, success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } }, error: { iconTheme: { primary: '#E2231A', secondary: '#fff' } } }} />
        </HashRouter>
      ) : (
        <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || '/tdr'}>
          <AppRoutes />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: { borderRadius: '12px', background: '#1A1A2E', color: '#fff', fontSize: '14px' },
              success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
              error: { iconTheme: { primary: '#E2231A', secondary: '#fff' } },
            }}
          />
        </BrowserRouter>
      )}
    </Provider>
  );
}
