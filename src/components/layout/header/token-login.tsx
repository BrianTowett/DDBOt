import React, { useState } from 'react';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';
import { Button } from '@deriv-com/ui';
import './token-login.scss';

const TokenLogin: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [token, setToken] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        const trimmed = token.trim();
        if (!trimmed) {
            setError('Please paste your API token.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const api: any = generateDerivApiInstance();
            if (!api) throw new Error('Could not connect to Deriv.');

            const response = await api.authorize(trimmed);
            try {
                api.disconnect();
            } catch (_e) {
                /* noop */
            }

            if (response?.error) {
                setError(response.error.message || 'Invalid token.');
                setBusy(false);
                return;
            }

            const authorize = response?.authorize;
            const loginid: string = authorize?.loginid;
            const currency: string = authorize?.currency || 'USD';

            if (!loginid) {
                setError('Login failed — no account returned.');
                setBusy(false);
                return;
            }

            const accountsList: Record<string, string> = { [loginid]: trimmed };
            const clientAccounts: Record<string, { loginid: string; token: string; currency: string }> = {
                [loginid]: { loginid, token: trimmed, currency },
            };

            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
            localStorage.setItem('authToken', trimmed);
            localStorage.setItem('active_loginid', loginid);

            const account_param = loginid.startsWith('VR') ? 'demo' : currency;
            window.location.replace(`${window.location.origin}/bot/?account=${account_param}`);
        } catch (e: any) {
            setError(e?.message || 'Login failed.');
            setBusy(false);
        }
    };

    return (
        <>
            <Button tertiary onClick={() => setOpen(true)} className='token-login__trigger'>
                Token Login
            </Button>
            {open && (
                <div className='token-login__overlay' onClick={() => !busy && setOpen(false)}>
                    <div className='token-login__modal' onClick={e => e.stopPropagation()}>
                        <div className='token-login__header'>
                            <h3>Login with Deriv API token</h3>
                            <button
                                className='token-login__close'
                                onClick={() => !busy && setOpen(false)}
                                aria-label='Close'
                            >
                                ×
                            </button>
                        </div>
                        <p className='token-login__hint'>
                            Create a token at{' '}
                            <a
                                href='https://app.deriv.com/account/api-token'
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                app.deriv.com/account/api-token
                            </a>{' '}
                            with <strong>Read, Trade, Trading information, Payments</strong> scopes, then paste it
                            below.
                        </p>
                        <input
                            type='password'
                            className='token-login__input'
                            placeholder='Paste your API token here'
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            disabled={busy}
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleLogin();
                            }}
                        />
                        {error && <div className='token-login__error'>{error}</div>}
                        <div className='token-login__actions'>
                            <Button tertiary onClick={() => setOpen(false)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button primary onClick={handleLogin} disabled={busy}>
                                {busy ? 'Logging in…' : 'Log in'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TokenLogin;
