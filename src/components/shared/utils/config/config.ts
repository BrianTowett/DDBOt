import { LocalStorageConstants, LocalStorageUtils, URLUtils } from '@deriv-com/utils';
import { isStaging } from '../url/helpers';

export const APP_IDS = {
    LOCALHOST: 36300,
    TMP_STAGING: 64584,
    STAGING: 29934,
    STAGING_BE: 29934,
    STAGING_ME: 29934,
    PRODUCTION: 65555,
    PRODUCTION_BE: 65556,
    PRODUCTION_ME: 65557,
};

export const AFFILIATE_APP_ID = 129304;

export const livechat_license_id = 12049137;
export const livechat_client_id = '66aa088aad5a414484c1fd1fa8a5ace7';

export const domain_app_ids = {
    'master.bot-standalone.pages.dev': APP_IDS.TMP_STAGING,
    'staging-dbot.deriv.com': APP_IDS.STAGING,
    'staging-dbot.deriv.be': APP_IDS.STAGING_BE,
    'staging-dbot.deriv.me': APP_IDS.STAGING_ME,
    'dbot.deriv.com': APP_IDS.PRODUCTION,
    'dbot.deriv.be': APP_IDS.PRODUCTION_BE,
    'dbot.deriv.me': APP_IDS.PRODUCTION_ME,
    'ddbot.pages.dev': 66860,
};

export const getCurrentProductionDomain = () =>
    !/^staging\./.test(window.location.hostname) &&
    Object.keys(domain_app_ids).find(domain => window.location.hostname === domain);

export const isProduction = () => {
    const all_domains = Object.keys(domain_app_ids).map(domain => `(www\\.)?${domain.replace('.', '\\.')}`);
    return new RegExp(`^(${all_domains.join('|')})$`, 'i').test(window.location.hostname);
};

export const isTestLink = () => {
    return (
        window.location.origin?.includes('.binary.sx') ||
        window.location.origin?.includes('bot-65f.pages.dev') ||
        isLocal()
    );
};

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname);

const getDefaultServerURL = () => {
    if (isTestLink()) {
        return 'ws.derivws.com';
    }

    let active_loginid_from_url;
    const search = window.location.search;
    if (search) {
        const params = new URLSearchParams(document.location.search.substring(1));
        active_loginid_from_url = params.get('acct1');
    }

    const loginid = window.localStorage.getItem('active_loginid') ?? active_loginid_from_url;
    const is_real = loginid && !/^(VRT|VRW)/.test(loginid);

    const server = is_real ? 'green' : 'blue';
    const server_url = `${server}.derivws.com`;

    return server_url;
};

export const getDefaultAppIdAndUrl = () => {
    const server_url = getDefaultServerURL();

    if (isTestLink()) {
        return { app_id: APP_IDS.LOCALHOST, server_url };
    }

    const current_domain = getCurrentProductionDomain() ?? '';
    const app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION;

    return { app_id, server_url };
};

export const getAppId = () => {
    let app_id: string | number | null = null;
    const config_app_id = window.localStorage.getItem('config.app_id');
    const current_domain = getCurrentProductionDomain() ?? '';
    const hostname = (typeof window !== 'undefined' && window.location.hostname) || '';

    if (config_app_id) {
        app_id = config_app_id;
    } else if (isStaging()) {
        app_id = APP_IDS.STAGING;
    } else if (isTestLink()) {
        app_id = APP_IDS.LOCALHOST;
    } else if (current_domain && domain_app_ids[current_domain as keyof typeof domain_app_ids]) {
        app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids];
    } else {
        // No mapping for this hostname. Warn loudly instead of silently using
        // an unrelated fallback. Still return PRODUCTION so the app boots.
        // eslint-disable-next-line no-console
        console.warn(
            `[AppID] No domain_app_ids mapping for hostname "${hostname}". ` +
                `Falling back to APP_IDS.PRODUCTION (${APP_IDS.PRODUCTION}). ` +
                `Add this hostname to domain_app_ids in config.ts to fix.`
        );
        app_id = APP_IDS.PRODUCTION;
    }

    return app_id;
};

export const getSocketURL = () => {
    const local_storage_server_url = window.localStorage.getItem('config.server_url');
    if (local_storage_server_url) return local_storage_server_url;

    const server_url = getDefaultServerURL();

    return server_url;
};

export const checkAndSetEndpointFromUrl = () => {
    if (isTestLink()) {
        const url_params = new URLSearchParams(location.search.slice(1));

        if (url_params.has('qa_server') && url_params.has('app_id')) {
            const qa_server = url_params.get('qa_server') || '';
            const app_id = url_params.get('app_id') || '';

            url_params.delete('qa_server');
            url_params.delete('app_id');

            if (/^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[0-9]+$/.test(app_id)) {
                localStorage.setItem('config.app_id', app_id);
                localStorage.setItem('config.server_url', qa_server.replace(/"/g, ''));
            }

            const params = url_params.toString();
            const hash = location.hash;

            location.href = `${location.protocol}//${location.hostname}${location.pathname}${
                params ? `?${params}` : ''
            }${hash || ''}`;

            return true;
        }
    }

    return false;
};

export const getDebugServiceWorker = () => {
    const debug_service_worker_flag = window.localStorage.getItem('debug_service_worker');
    if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

    return false;
};

export const generateOAuthURL = () => {
    const hostname = window.location.hostname;

    // 1) Pick OAuth host. ONLY use deriv.me / deriv.be hosts when the page itself
    //    is on a Deriv-owned .me / .be domain. For EVERY other host (including
    //    ddbot.pages.dev, *.pages.dev, *.replit.dev, localhost, etc.) we ALWAYS
    //    fall back to oauth.deriv.com. We never strip a non-Deriv subdomain.
    let oauth_host = 'oauth.deriv.com';
    if (/(^|\.)deriv\.me$/i.test(hostname)) {
        oauth_host = 'oauth.deriv.me';
    } else if (/(^|\.)deriv\.be$/i.test(hostname)) {
        oauth_host = 'oauth.deriv.be';
    }

    // 2) Honour QA/configured server overrides if explicitly set.
    const configured_server_url = (LocalStorageUtils.getValue(LocalStorageConstants.configServerURL) ||
        localStorage.getItem('config.server_url')) as string;
    const valid_server_urls = ['green.derivws.com', 'red.derivws.com', 'blue.derivws.com', 'canary.derivws.com'];
    if (
        configured_server_url &&
        typeof configured_server_url === 'string' &&
        !valid_server_urls.includes(configured_server_url)
    ) {
        oauth_host = configured_server_url;
    }

    // 3) Pick app_id. Domain-based; never silently random.
    const app_id = getAppId();

    // 4) Build canonical URL. brand is always 'deriv'.
    const final_url = `https://${oauth_host}/oauth2/authorize?app_id=${app_id}&l=EN&brand=deriv`;

    try {
        // Debug — leave on so production issues are easy to diagnose from devtools.
        // eslint-disable-next-line no-console
        console.info('[OAuth] hostname:', hostname);
        // eslint-disable-next-line no-console
        console.info('[OAuth] oauth_host:', oauth_host);
        // eslint-disable-next-line no-console
        console.info('[OAuth] app_id:', app_id);
        // eslint-disable-next-line no-console
        console.info('[OAuth] final URL:', final_url);
        // Use the SDK URL only for parity warnings — never as the source of truth.
        const sdk_url = URLUtils.getOauthURL();
        if (sdk_url && !sdk_url.includes(oauth_host)) {
            // eslint-disable-next-line no-console
            console.warn('[OAuth] SDK suggested', sdk_url, '— overridden to', final_url);
        }
    } catch {
        /* noop */
    }

    return final_url;
};
