import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
import { AnalyticsInitializer } from './utils/analytics';
import { registerPWA } from './utils/pwa-utils';
import './styles/index.scss';

// Surface any unhandled errors to the console so production white-screen
// issues are debuggable from the browser devtools instead of silently
// hanging on the splash.
window.addEventListener('error', event => {
    // eslint-disable-next-line no-console
    console.error('[App] Uncaught error:', event.error || event.message, event);
});
window.addEventListener('unhandledrejection', event => {
    // eslint-disable-next-line no-console
    console.error('[App] Unhandled promise rejection:', event.reason);
});

class RootErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state = { error: null as Error | null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error('[App] Root error boundary caught error:', error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div
                    style={{
                        padding: 24,
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        color: '#fff',
                        background: '#0e0e0e',
                        minHeight: '100vh',
                    }}
                >
                    <h1 style={{ color: '#ff444f' }}>Something went wrong</h1>
                    <p>The app failed to load. Please try refreshing the page.</p>
                    <pre
                        style={{
                            whiteSpace: 'pre-wrap',
                            background: '#1a1a1a',
                            padding: 12,
                            borderRadius: 6,
                            fontSize: 12,
                            opacity: 0.85,
                        }}
                    >
                        {String(this.state.error?.stack || this.state.error)}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: 16,
                            background: '#ff444f',
                            color: '#fff',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: 6,
                            cursor: 'pointer',
                        }}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children as React.ReactElement;
    }
}

// Force the registered Deriv app IDs for this project so that OAuth/OIDC login
// uses the correct redirect URLs and client config.
// Primary (v2): 335EYAbheBDRlnzzWUIPq
// Legacy  (v1): 335Er2sup70lKuoUAb8Vl
const DBWIN_APP_ID = '335EYAbheBDRlnzzWUIPq';
try {
    const existing = window.localStorage.getItem('config.app_id');
    if (existing !== DBWIN_APP_ID) {
        window.localStorage.setItem('config.app_id', DBWIN_APP_ID);
    }
} catch (e) {
    // localStorage may be unavailable in some private modes — login will fall back to defaults
    // eslint-disable-next-line no-console
    console.warn('Unable to set Deriv app ID override', e);
}

// Hard external safety net: if React has rendered something but AppContent is
// still spinning after 5s (e.g. because Deriv WebSocket is blocked here), set
// a global flag that AppContent reads on the next render to bypass its
// internal `is_loading` check and show the dashboard anyway.
declare global {
    interface Window {
        __dbwin_force_done?: boolean;
    }
}
setTimeout(() => {
    if (window.__dbwin_force_done) return;
    window.__dbwin_force_done = true;
    // eslint-disable-next-line no-console
    console.warn('[main] External 5s safety reached — forcing AppContent past loader.');
    // Nudge React to re-render observers by dispatching a no-op event that
    // AppContent listens for, then fall back to a window resize event which
    // most layouts already listen for.
    try {
        window.dispatchEvent(new Event('dbwin:force-done'));
    } catch (e) {
        /* noop */
    }
    try {
        window.dispatchEvent(new Event('resize'));
    } catch (e) {
        /* noop */
    }
}, 5000);

AnalyticsInitializer();
registerPWA()
    .then(registration => {
        if (registration) {
            console.log('PWA service worker registered successfully for Chrome');
        } else {
            console.log('PWA service worker disabled for non-Chrome browser');
        }
    })
    .catch(error => {
        console.error('PWA service worker registration failed:', error);
    });

const rootEl = document.getElementById('root');
if (!rootEl) {
    // eslint-disable-next-line no-console
    console.error('[App] #root element missing from index.html — cannot mount React app.');
} else {
    ReactDOM.createRoot(rootEl).render(
        <RootErrorBoundary>
            <AuthWrapper />
        </RootErrorBoundary>
    );
    // Tell the splash screen in index.html that React has mounted, so it can
    // hide itself even if the rendered content doesn't match its DOM probe.
    requestAnimationFrame(() => {
        try {
            window.dispatchEvent(new Event('app-ready'));
        } catch (e) {
            // Older browsers — splash will still hide via its DOM probe / safety timeout.
        }
    });
}
