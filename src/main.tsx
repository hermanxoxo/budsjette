import { StrictMode, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppStoreProvider } from './state/AppStore';
import { ToastProvider } from './ui/Toast';
import './index.css';

/** Siste skanse: viser en forståelig feilmelding i stedet for blank skjerm. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uventet feil i Budsjette', error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Noe gikk galt</h1>
          <p style={{ maxWidth: '26rem', opacity: 0.75, margin: 0, lineHeight: 1.6 }}>
            Appen støtte på en uventet feil. Dataene dine ligger trygt lagret i nettleseren.
            Last siden på nytt for å fortsette.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#4f46e5',
              color: 'white',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Last inn på nytt
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Fant ikke #root i dokumentet.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <AppStoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppStoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);

/* Registrer service worker for offline-støtte (kun i produksjonsbygg). */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn('Service worker kunne ikke registreres', error);
    });
  });
}
