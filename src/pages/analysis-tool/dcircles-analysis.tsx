import React, { useCallback,useEffect, useRef, useState } from 'react';
import { APP_IDS, getSocketURL } from '@/components/shared/utils/config/config';
import './dcircles-analysis.scss';

const MARKETS = [
    { label: 'Volatility 10 (1s) Index', value: '1HZ10V' },
    { label: 'Volatility 15 (1s) Index', value: '1HZ15V' },
    { label: 'Volatility 25 (1s) Index', value: '1HZ25V' },
    { label: 'Volatility 30 (1s) Index', value: '1HZ30V' },
    { label: 'Volatility 50 (1s) Index', value: '1HZ50V' },
    { label: 'Volatility 75 (1s) Index', value: '1HZ75V' },
    { label: 'Volatility 90 (1s) Index', value: '1HZ90V' },
    { label: 'Volatility 100 (1s) Index', value: '1HZ100V' },
    { label: 'Volatility 10 Index', value: 'R_10' },
    { label: 'Volatility 25 Index', value: 'R_25' },
    { label: 'Volatility 50 Index', value: 'R_50' },
    { label: 'Volatility 75 Index', value: 'R_75' },
    { label: 'Volatility 100 Index', value: 'R_100' },
    { label: 'Volatility 250 Index', value: 'R_250' },
    { label: 'Jump 10 Index', value: 'JD10' },
    { label: 'Jump 25 Index', value: 'JD25' },
    { label: 'Jump 50 Index', value: 'JD50' },
    { label: 'Jump 75 Index', value: 'JD75' },
    { label: 'Jump 100 Index', value: 'JD100' },
];

const getWsUrl = () => {
    try {
        const server = getSocketURL();
        return `wss://${server}/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    } catch {
        return `wss://ws.derivws.com/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    }
};

const extractDigit = (quote: number | string, pipSize = 2): number => {
    const s = Number(quote).toFixed(pipSize);
    return parseInt(s[s.length - 1], 10);
};

const DCirclesAnalysis = () => {
    const [symbol, setSymbol] = useState('1HZ10V');
    const [tickWindow, setTickWindow] = useState(1000);
    const [tickInput, setTickInput] = useState('1000');
    const [price, setPrice] = useState('');
    const [currentDigit, setCurrentDigit] = useState<number | null>(null);
    const [digitCounts, setDigitCounts] = useState<number[]>(Array(10).fill(0));
    const [recentEO, setRecentEO] = useState<string[]>([]);
    const [showMoreEO, setShowMoreEO] = useState(false);
    const [overUnder, setOverUnder] = useState(5);
    const [totalTicks, setTotalTicks] = useState(0);
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);

    const wsRef = useRef<WebSocket | null>(null);
    const ticksRef = useRef<number[]>([]);
    const windowRef = useRef(1000);
    const pipRef = useRef(2);

    const rebuild = useCallback(() => {
        const counts = Array(10).fill(0);
        ticksRef.current.forEach(d => counts[d]++);
        setDigitCounts([...counts]);
        setTotalTicks(ticksRef.current.length);
    }, []);

    const connect = useCallback(
        (sym: string, winSize: number) => {
            if (wsRef.current) wsRef.current.close();

            ticksRef.current = [];
            windowRef.current = winSize;
            pipRef.current = 2;
            setDigitCounts(Array(10).fill(0));
            setRecentEO([]);
            setTotalTicks(0);
            setPrice('');
            setCurrentDigit(null);
            setConnected(false);
            setLoading(true);

            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                // 1. Request last N ticks history immediately
                ws.send(
                    JSON.stringify({
                        ticks_history: sym,
                        count: winSize,
                        end: 'latest',
                        style: 'ticks',
                        req_id: 1,
                    })
                );
            };

            ws.onmessage = evt => {
                const msg = JSON.parse(evt.data);

                // Handle history response — fills all ticks at once
                if (msg.msg_type === 'history' && msg.history) {
                    // Capture pip_size so trailing zeros are preserved in digit extraction
                    if (msg.pip_size != null) pipRef.current = Number(msg.pip_size);
                    const pip = pipRef.current;

                    const quotes: number[] = msg.history.prices || [];
                    const digits = quotes.map(q => extractDigit(q, pip));
                    ticksRef.current = digits.slice(-winSize);
                    rebuild();

                    const eoHistory = ticksRef.current.map(d => (d % 2 === 0 ? 'E' : 'O'));
                    setRecentEO(eoHistory.slice(-55));

                    if (quotes.length > 0) {
                        const lastQ = quotes[quotes.length - 1];
                        setPrice(Number(lastQ).toFixed(pip));
                        setCurrentDigit(extractDigit(lastQ, pip));
                    }
                    setLoading(false);

                    // 2. Now subscribe to live ticks
                    ws.send(JSON.stringify({ ticks: sym, subscribe: 1, req_id: 2 }));
                }

                // Handle live tick updates
                if (msg.msg_type === 'tick' && msg.tick) {
                    const { quote, pip_size } = msg.tick;
                    if (pip_size != null) pipRef.current = Number(pip_size);
                    const pip = pipRef.current;
                    const digit = extractDigit(quote, pip);

                    setPrice(Number(quote).toFixed(pip));
                    setCurrentDigit(digit);

                    ticksRef.current.push(digit);
                    if (ticksRef.current.length > windowRef.current) {
                        ticksRef.current.shift();
                    }
                    rebuild();

                    setRecentEO(prev => {
                        const updated = [...prev, digit % 2 === 0 ? 'E' : 'O'];
                        return updated.slice(-55);
                    });
                    setLoading(false);
                }
            };

            ws.onerror = () => {
                setConnected(false);
                setLoading(false);
            };
            ws.onclose = () => {
                setConnected(false);
            };
        },
        [rebuild]
    );

    useEffect(() => {
        connect(symbol, tickWindow);
        return () => {
            wsRef.current?.close();
        };
    }, [symbol, tickWindow, connect]);

    const handleSymbolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSymbol(e.target.value);
    };

    const handleTickInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTickInput(e.target.value);
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val >= 50 && val <= 5000) {
            setTickWindow(val);
        }
    };

    const sorted = [...digitCounts.map((count, digit) => ({ digit, count }))].sort((a, b) => b.count - a.count);

    const getColor = (digit: number) => {
        if (totalTicks === 0) return 'neutral';
        if (digit === sorted[0]?.digit) return 'green';
        if (digit === sorted[1]?.digit) return 'blue';
        if (digit === sorted[sorted.length - 2]?.digit) return 'yellow';
        if (digit === sorted[sorted.length - 1]?.digit) return 'red';
        return 'neutral';
    };

    const getLabel = (digit: number) => {
        if (totalTicks === 0) return '';
        const isCurrent = digit === currentDigit;
        const isMost = digit === sorted[0]?.digit;
        const isLeast = digit === sorted[sorted.length - 1]?.digit;
        if (isCurrent && isMost) return 'current digit / most';
        if (isCurrent) return 'current digit';
        if (isMost) return 'most';
        if (isLeast) return 'least frequency';
        return '';
    };

    const evenCount = digitCounts.filter((_, d) => d % 2 === 0).reduce((a, b) => a + b, 0);
    const oddCount = totalTicks - evenCount;
    const evenPct = totalTicks > 0 ? ((evenCount / totalTicks) * 100).toFixed(1) : '0.0';
    const oddPct = totalTicks > 0 ? ((oddCount / totalTicks) * 100).toFixed(1) : '0.0';

    return (
        <div className='dcircles'>
            <div className='dcircles__status-row'>
                <span className={`dcircles__dot ${connected ? 'dcircles__dot--live' : 'dcircles__dot--off'}`} />
                <span className='dcircles__status-txt'>
                    {loading ? 'Loading live data...' : connected ? 'LIVE' : 'Disconnected'}
                </span>
            </div>

            <div className='dcircles__market-row'>
                <label className='dcircles__label'>Select Market:</label>
                <select className='dcircles__select' value={symbol} onChange={handleSymbolChange}>
                    {MARKETS.map(m => (
                        <option key={m.value} value={m.value}>
                            {m.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className='dcircles__price-row'>
                <span className='dcircles__price'>{price || '—'}</span>
                <span className='dcircles__current-digit'>{currentDigit !== null ? currentDigit : '—'}</span>
            </div>

            <div className='dcircles__ticks-row'>
                <label className='dcircles__label'>Ticks window:</label>
                <input
                    className='dcircles__tick-input'
                    type='number'
                    min={50}
                    max={5000}
                    value={tickInput}
                    onChange={handleTickInput}
                />
                <span className='dcircles__range-hint'>(50-5000)</span>
            </div>

            <div className='dcircles__dist-header'>
                <span>Last {tickWindow} ticks digit distribution</span>
                <span>
                    {totalTicks}/{tickWindow}
                </span>
            </div>

            <div className='dcircles__circles-row'>
                {Array.from({ length: 10 }, (_, d) => {
                    const count = digitCounts[d];
                    const pct = totalTicks > 0 ? ((count / totalTicks) * 100).toFixed(1) : '0.0';
                    const color = getColor(d);
                    const label = getLabel(d);
                    const isCurr = d === currentDigit;

                    return (
                        <div key={d} className='dcircles__digit-col'>
                            {isCurr && <div className='dcircles__arrow' />}
                            <div
                                className={`dcircles__circle dcircles__circle--${color} ${isCurr ? 'dcircles__circle--current' : ''}`}
                            >
                                <span className='dcircles__digit-num'>{d}</span>
                                <span className='dcircles__digit-pct'>{pct}%</span>
                            </div>
                            {label && <div className='dcircles__digit-label'>{label}</div>}
                        </div>
                    );
                })}
            </div>

            <div className='dcircles__eo-section'>
                <h3 className='dcircles__eo-title'>Even/Odd</h3>
                <div className='dcircles__eo-grid'>
                    <div className='dcircles__eo-card'>
                        <span className='dcircles__eo-name'>Even</span>
                        <span className='dcircles__eo-count'>
                            {evenCount} <small>({evenPct}%)</small>
                        </span>
                        <div className='dcircles__bar-bg'>
                            <div
                                className='dcircles__bar-fill dcircles__bar-fill--even'
                                style={{ width: `${evenPct}%` }}
                            />
                        </div>
                    </div>
                    <div className='dcircles__eo-card'>
                        <span className='dcircles__eo-name'>Odd</span>
                        <span className='dcircles__eo-count'>
                            {oddCount} <small>({oddPct}%)</small>
                        </span>
                        <div className='dcircles__bar-bg'>
                            <div
                                className='dcircles__bar-fill dcircles__bar-fill--odd'
                                style={{ width: `${oddPct}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className='dcircles__recent-section'>
                <div className='dcircles__recent-header'>
                    <span>Recent E/O</span>
                    <button className='dcircles__more-btn' onClick={() => setShowMoreEO(v => !v)}>
                        {showMoreEO ? 'Less' : 'More'}
                    </button>
                </div>
                <div className='dcircles__eo-dots'>
                    {(showMoreEO ? recentEO : recentEO.slice(-11)).map((eo, i) => (
                        <div
                            key={i}
                            className={`dcircles__eo-dot ${eo === 'E' ? 'dcircles__eo-dot--even' : 'dcircles__eo-dot--odd'}`}
                        >
                            {eo}
                        </div>
                    ))}
                </div>
            </div>

            <div className='dcircles__ou-section'>
                <label className='dcircles__label'>Over/Under:</label>
                <select
                    className='dcircles__select dcircles__select--sm'
                    value={overUnder}
                    onChange={e => setOverUnder(Number(e.target.value))}
                >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default DCirclesAnalysis;
