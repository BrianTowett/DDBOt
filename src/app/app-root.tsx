import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ErrorBoundary from '@/components/error-component/error-boundary';
import ErrorComponent from '@/components/error-component/error-component';
import ChunkLoader from '@/components/loader/chunk-loader';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import useTMB from '@/hooks/useTMB';
import { localize } from '@deriv-com/translations';
import './app-root.scss';

const AppContent = lazy(() => import('./app-content'));

const AppRootLoader = () => {
    return <ChunkLoader message={localize('Loading...')} />;
};

const ErrorComponentWrapper = observer(() => {
    const { common } = useStore();

    if (!common.error) return null;

    return (
        <ErrorComponent
            header={common.error?.header}
            message={common.error?.message}
            redirect_label={common.error?.redirect_label}
            redirectOnClick={common.error?.redirectOnClick}
            should_clear_error_on_click={common.error?.should_clear_error_on_click}
            setError={common.setError}
            redirect_to={common.error?.redirect_to}
            should_redirect={common.error?.should_redirect}
        />
    );
});

const AppRoot = () => {
    const store = useStore();
    const api_base_initialized = useRef(false);
    const [is_api_initialized, setIsApiInitialized] = useState(false);
    const [is_tmb_check_complete, setIsTmbCheckComplete] = useState(false);
    const [, setIsTmbEnabled] = useState(false);
    const [hard_deadline_reached, setHardDeadlineReached] = useState(false);
    const { isTmbEnabled } = useTMB();

    // Hard deadline: regardless of any async init, show the app within 3 seconds.
    useEffect(() => {
        const t = setTimeout(() => setHardDeadlineReached(true), 3000);
        return () => clearTimeout(t);
    }, []);

    // Effect to check TMB status - independent of API initialization
    useEffect(() => {
        let settled = false;
        const safety = setTimeout(() => {
            if (!settled) {
                settled = true;
                setIsTmbCheckComplete(true);
            }
        }, 2000);

        const checkTmbStatus = async () => {
            try {
                const tmb_status = await isTmbEnabled();
                const final_status = tmb_status || window.is_tmb_enabled === true;

                setIsTmbEnabled(final_status);
            } catch (error) {
                console.error('TMB check failed:', error);
            } finally {
                if (!settled) {
                    settled = true;
                    clearTimeout(safety);
                    setIsTmbCheckComplete(true);
                }
            }
        };

        checkTmbStatus();
        return () => clearTimeout(safety);
    }, []);

    // Initialize API when TMB check is complete with timeout fallback
    useEffect(() => {
        if (!is_tmb_check_complete) {
            return; // Wait until TMB check is complete
        }

        const timeoutId = setTimeout(() => {
            if (!is_api_initialized) {
                setIsApiInitialized(true);
            }
        }, 5000);

        const initializeApi = async () => {
            if (!api_base_initialized.current) {
                try {
                    await api_base.init();
                    api_base_initialized.current = true;
                } catch (error) {
                    console.error('API initialization failed:', error);
                    api_base_initialized.current = false;
                } finally {
                    setIsApiInitialized(true);
                    clearTimeout(timeoutId); // Clear timeout if API init completes
                }
            }
        };

        initializeApi();
        return () => clearTimeout(timeoutId);
    }, [is_tmb_check_complete]);

    // Wait for store to be available; otherwise after the hard deadline, render the app
    // even if the optional API/TMB init is still pending. This guarantees the body
    // never gets stuck on the loader if a network call (Firebase config, WebSocket) hangs.
    if (!store) return <AppRootLoader />;
    if (!is_api_initialized && !hard_deadline_reached) return <AppRootLoader />;

    return (
        <Suspense fallback={<AppRootLoader />}>
            <div
                id='dbwin-approot-marker'
                style={{
                    position: 'fixed',
                    top: 50,
                    left: 0,
                    zIndex: 999998,
                    background: '#2563eb',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: 11,
                    fontFamily: 'monospace',
                }}
            >
                AppRoot mounted (api={String(is_api_initialized)}, hard={String(hard_deadline_reached)})
            </div>
            <ErrorBoundary root_store={store}>
                <ErrorComponentWrapper />
                <AppContent />
            </ErrorBoundary>
        </Suspense>
    );
};

export default AppRoot;
