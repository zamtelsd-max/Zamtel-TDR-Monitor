import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ── Kill any old service workers + clear stale caches ────────────────────────
// Old PWA SW caused blank screens by serving stale JS. Nuke everything.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}
if ('caches' in window) {
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

// ── Global error boundary (class component — required by React) ───────────────
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0D1B12', color: 'white', padding: '24px', textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#00843D', marginBottom: 8 }}>App Error</h2>
          <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 24 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{
              background: '#00843D', color: 'white', border: 'none',
              borderRadius: 12, padding: '12px 24px', fontSize: 14,
              fontWeight: 700, cursor: 'pointer'
            }}
          >
            Clear & Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
