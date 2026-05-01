/**
 * Centralised Deriv OAuth configuration.
 *
 * To swap the base URL (e.g. when Deriv Support provides a new endpoint),
 * change DERIV_CONFIG.baseUrl here — nowhere else.
 */
export const DERIV_CONFIG = {
    baseUrl: 'https://oauth.deriv.com/oauth2/authorize',
    appId: '335EYAbheBDRlnzzWUIPq',
    redirectUri: 'https://ddbot.pages.dev',
} as const;

type BuildDerivAuthUrlParams = {
    baseUrl?: string;
    appId?: string;
    redirectUri?: string;
    state?: string;
};

/**
 * Build a fully-formed Deriv OAuth authorisation URL.
 * Every param is optional — falls back to DERIV_CONFIG values.
 */
export const buildDerivAuthUrl = ({
    baseUrl = DERIV_CONFIG.baseUrl,
    appId = DERIV_CONFIG.appId,
    redirectUri = DERIV_CONFIG.redirectUri,
    state,
}: BuildDerivAuthUrlParams = {}): string => {
    const url = new URL(baseUrl);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('l', 'EN');
    url.searchParams.set('brand', 'deriv');
    url.searchParams.set('redirect_uri', redirectUri);
    if (state) url.searchParams.set('state', state);
    return url.toString();
};

/**
 * Build auth URL using the production config, choosing the right
 * base URL for .me / .be Deriv domains.  Every other hostname
 * (including ddbot.pages.dev, localhost, *.replit.dev) always uses
 * oauth.deriv.com — never strips subdomains.
 */
export const buildAuthUrlForCurrentHost = (): string => {
    const hostname = (typeof window !== 'undefined' && window.location.hostname) || '';

    let baseUrl = DERIV_CONFIG.baseUrl;
    if (/(^|\.)deriv\.me$/i.test(hostname)) {
        baseUrl = 'https://oauth.deriv.me/oauth2/authorize';
    } else if (/(^|\.)deriv\.be$/i.test(hostname)) {
        baseUrl = 'https://oauth.deriv.be/oauth2/authorize';
    }

    const redirectUri =
        typeof window !== 'undefined'
            ? `${window.location.protocol}//${window.location.host}`
            : DERIV_CONFIG.redirectUri;

    let state: string | undefined;
    try {
        state = crypto.randomUUID();
    } catch {
        state = Math.random().toString(36).slice(2);
    }

    const authUrl = buildDerivAuthUrl({ baseUrl, redirectUri, state });

    console.info('[OAuth] hostname   :', hostname);
    console.info('[OAuth] baseUrl    :', baseUrl);
    console.info('[OAuth] appId      :', DERIV_CONFIG.appId);
    console.info('[OAuth] redirectUri:', redirectUri);
    console.info('[OAuth] state      :', state);
    console.info('[OAuth] final URL  :', authUrl);

    return authUrl;
};

/**
 * Parse and log the parameters Deriv sends back to the redirect URI.
 * Call this once on page load — safe to call even when no params present.
 */
export const parseOAuthCallback = (): Record<string, string> => {
    const params = new URLSearchParams(window.location.search);
    const entries = Object.fromEntries(params.entries());

    if (params.has('acct1') || params.has('token1') || params.has('code') || params.has('error')) {
        console.info('[OAuth callback] Returned params:', entries);
        if (params.has('error')) {
            console.error('[OAuth callback] Error from Deriv:', params.get('error'), params.get('error_description'));
        }
    } else if (params.has('app_id')) {
        console.warn('[OAuth callback] OAuth failed or was blocked upstream — no acct/token/code params received.');
        console.info('[OAuth callback] Raw params:', entries);
    }

    return entries;
};
