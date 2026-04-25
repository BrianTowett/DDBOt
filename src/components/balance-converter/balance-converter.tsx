import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { useStore } from '@/hooks/useStore';
import './balance-converter.scss';

const RATE_CACHE_KEY_PREFIX = 'dbwin.kes_rate.';
const RATE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedRate = { rate: number; ts: number };

const readCachedRate = (currency: string): number | null => {
    try {
        const raw = window.localStorage.getItem(RATE_CACHE_KEY_PREFIX + currency);
        if (!raw) return null;
        const parsed: CachedRate = JSON.parse(raw);
        if (Date.now() - parsed.ts > RATE_TTL_MS) return null;
        return parsed.rate;
    } catch {
        return null;
    }
};

const writeCachedRate = (currency: string, rate: number) => {
    try {
        window.localStorage.setItem(
            RATE_CACHE_KEY_PREFIX + currency,
            JSON.stringify({ rate, ts: Date.now() })
        );
    } catch {
        /* ignore */
    }
};

const fetchKesRate = async (currency: string): Promise<number> => {
    const cached = readCachedRate(currency);
    if (cached) return cached;

    // Frankfurter API (free, no key required) — supports major fiat currencies.
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=KES`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Rate request failed (${res.status})`);
    const data = await res.json();
    const rate: number | undefined = data?.rates?.KES;
    if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) {
        throw new Error(`No KES rate available for ${currency}`);
    }
    writeCachedRate(currency, rate);
    return rate;
};

const formatKes = (amount: number) =>
    `KSh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BalanceConverter = observer(() => {
    const { client } = useStore();
    const { data: activeAccount } = useActiveAccount({ allBalanceData: client?.all_accounts_balance });
    const [open, setOpen] = useState(false);
    const [rate, setRate] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const currency = (activeAccount?.currency || '').toUpperCase();
    const balance = Number(activeAccount?.balance) || 0;
    const isVirtual = Boolean(activeAccount?.is_virtual);

    // Close popup on outside click
    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [open]);

    // Reset rate when currency changes
    useEffect(() => {
        setRate(null);
        setError(null);
    }, [currency]);

    if (!activeAccount || !currency) return null;

    const ensureRate = async () => {
        if (rate !== null || loading) return;
        try {
            setLoading(true);
            setError(null);
            // Demo accounts use USD pricing for conversion display.
            const fromCurrency = isVirtual ? 'USD' : currency;
            const r = await fetchKesRate(fromCurrency);
            setRate(r);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unable to fetch rate';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleClick = () => {
        const next = !open;
        setOpen(next);
        if (next) ensureRate();
    };

    const kesAmount = rate !== null ? balance * rate : null;

    return (
        <div className='balance-converter' ref={wrapperRef}>
            <button
                type='button'
                className='balance-converter__btn'
                onClick={handleClick}
                aria-label='Convert balance to Kenyan Shillings'
                title='Convert to KSh'
            >
                <span className='balance-converter__btn-icon' aria-hidden='true'>
                    KSh
                </span>
            </button>
            {open && (
                <div className='balance-converter__popup' role='dialog'>
                    <div className='balance-converter__popup-header'>Balance in Kenyan Shillings</div>
                    <div className='balance-converter__popup-body'>
                        {loading && <span className='balance-converter__msg'>Fetching rate…</span>}
                        {!loading && error && (
                            <span className='balance-converter__msg balance-converter__msg--error'>{error}</span>
                        )}
                        {!loading && !error && kesAmount !== null && (
                            <>
                                <div className='balance-converter__amount'>{formatKes(kesAmount)}</div>
                                <div className='balance-converter__rate'>
                                    1 {isVirtual ? 'USD' : currency} ≈{' '}
                                    {rate!.toLocaleString('en-KE', { maximumFractionDigits: 2 })} KES
                                </div>
                                {isVirtual && (
                                    <div className='balance-converter__note'>
                                        Demo balance shown using USD rate.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default BalanceConverter;
