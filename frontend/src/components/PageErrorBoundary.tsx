import React from 'react';

interface State { error: Error | null }

export class PageErrorBoundary extends React.Component<{ children: React.ReactNode; page?: string }, State> {
  constructor(props: { children: React.ReactNode; page?: string }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  handleReset = () => {
    // Clear all cached dashboard data that could be corrupted
    ['zamtel_tdr_dashboard','zamtel_zbm_dashboard','zamtel_hsd_dashboard'].forEach(k => localStorage.removeItem(k));
    this.setState({ error: null });
    window.location.hash = '#/login';
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#f9fafb', padding: 24, textAlign: 'center'
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: '#00843D', fontWeight: 700, marginBottom: 8, fontSize: 18 }}>
            Something went wrong
          </h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 8, maxWidth: 280 }}>
            {this.state.error.message || 'An unexpected error occurred'}
          </p>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 24 }}>
            Page: {this.props.page || 'dashboard'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              background: '#00843D', color: 'white', border: 'none',
              borderRadius: 12, padding: '12px 28px', fontSize: 14,
              fontWeight: 700, cursor: 'pointer', marginBottom: 12
            }}
          >
            🔄 Clear Cache &amp; Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
