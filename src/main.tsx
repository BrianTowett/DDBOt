import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './app/AuthWrapper';
import { AnalyticsInitializer } from './utils/analytics';
import { registerPWA } from './utils/pwa-utils';
import './styles/index.scss';

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

ReactDOM.createRoot(document.getElementById('root')!).render(<AuthWrapper />);
