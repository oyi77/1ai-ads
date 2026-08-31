import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

function logError(error: unknown) { /* logged to console in dev only */ if (import.meta.env?.DEV) console.error(error); }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    logError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)',
          fontFamily: 'var(--font)',
        }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.85rem' }}>
              An unexpected error occurred. Please try reloading the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', background: 'var(--accent)', color: 'var(--bg-deep)',
                border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: '0.85rem',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
