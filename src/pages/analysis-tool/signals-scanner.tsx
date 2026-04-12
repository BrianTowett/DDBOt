import React, { useCallback,useEffect, useRef, useState } from 'react';
import { APP_IDS, getSocketURL } from '@/components/shared/utils/config/config';
import './signals-scanner.scss';

const MARKETS = [
    { label: 'Volatility 10 (1s)', value: '1HZ10V' },
    { label: 'Volatility 25 (1s)', value: '1HZ25V' },
    { label: 'Volatility 50 (1s)', value: '1HZ50V' },
    { label: 'Volatility 75 (1s)', value: '1HZ75V' },
    { label: 'Volatility 100 (1s)', value: '1HZ100V' },
    { label: 'Volatility 10', value: 'R_10' },
    { label: 'Volatility 25', value: 'R_25' },
    { label: 'Volatility 50', value: 'R_50' },
    { label: 'Volatility 75', value: 'R_75' },
    { label: 'Volatility 100', value: 'R_100' },
    { label: 'Jump 10', value: 'JD10' },
    { label: 'Jump 25', value: 'JD25' },
    { label: 'Jump 50', value: 'JD50' },
    { label: 'Jump 75', value: 'JD75' },
    { label: 'Jump 100', value: 'JD100' },
];

const TICK_WINDOWS = [50, 100, 200, 500, 1000];

type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NEUTRAL';

interface Signal {
    type: string;
    direction: string;
    strength: SignalStrength;
    confidence: number;
    reason: string;
}

const getWsUrl = () => {
    try {
        const server = getSocketURL();
        return `wss://${server}/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    } catch {
        return `wss://ws.derivws.com/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    }
};

const extractDigit = (quote: number, pip = 2): number => {
    const s = Number(quote).toFixed(pip);
    return parseInt(s[s.length - 1], 10);
};

const strengthColor: Record<SignalStrength, string> = {
    STRONG: '#00e676',
    MODERATE: '#ffeb3b',
    WEAK: '#ff9800',
    NEUTRAL: '#90a4ae',
};

const getStrength = (confidence: number): SignalStrength => {
    if (confidence >= 60) return 'STRONG';
    if (confidence >= 55) return 'MODERATE';
    if (confidence >= 52) return 'WEAK';
    return 'NEUTRAL';
};

const computeSignals = (digits: number[]): Signal[] => {
    if (digits.length < 20) return [];
    const total = digits.length;

    const evenCount = digits.filter(d => d % 2 === 0).length;
    const oddCount = total - evenCount;
    const evenPct = (evenCount / total) * 100;
    const oddPct = (oddCount / total) * 100;

    const underCount = digits.filter(d => d < 5).length;
    const overCount = total - underCount;
    const underPct = (underCount / total) * 100;
    const overPct = (overCount / total) * 100;

    const counts = Array(10).fill(0);
    digits.forEach(d => counts[d]++);

    const signals: Signal[] = [];

    const eoConf = Math.max(evenPct, oddPct);
    if (eoConf >= 52) {
        const dir = evenPct > oddPct ? 'EVEN' : 'ODD';
        const conf = Math.round(eoConf);
        signals.push({
            type: 'Even/Odd',
            direction: `BUY ${dir}`,
            strength: getStrength(conf),
            confidence: conf,
            reason: `${dir} at ${conf.toFixed(1)}% in last ${total} ticks`,
        });
    }

    const ouConf = Math.max(underPct, overPct);
    if (ouConf >= 52) {
        const dir = underPct > overPct ? 'UNDER 5' : 'OVER 4';
        const conf = Math.round(ouConf);
        signals.push({
            type: 'Over/Under',
            direction: `BUY ${dir}`,
            strength: getStrength(conf),
            confidence: conf,
            reason: `${dir.split(' ')[1]} side at ${conf.toFixed(1)}% in last ${total} ticks`,
        });
    }

    const sortedDigits = counts.map((c, d) => ({ digit: d, pct: (c / total) * 100 })).sort((a, b) => a.pct - b.pct);

    const rarest = sortedDigits[0];
    if (rarest.pct < 8) {
        signals.push({
            type: 'Digit Rise',
            direction: `DIGIT ${rarest.digit} DUE`,
            strength: rarest.pct < 5 ? 'STRONG' : 'MODERATE',
            confidence: Math.round(100 - rarest.pct * 5),
            reason: `Digit ${rarest.digit} appeared only ${rarest.pct.toFixed(1)}% — statistically due`,
        });
    }

    const mostFreq = sortedDigits[9];
    if (mostFreq.pct > 14) {
        signals.push({
            type: 'Digit Fade',
            direction: `AVOID DIGIT ${mostFreq.digit}`,
            strength: mostFreq.pct > 17 ? 'STRONG' : 'MODERATE',
            confidence: Math.round(mostFreq.pct * 4),
            reason: `Digit ${mostFreq.digit} overrepresented at ${mostFreq.pct.toFixed(1)}%`,
        });
    }

    const last5 = digits.slice(-5);
    const allEven = last5.every(d => d % 2 === 0);
    const allOdd = last5.every(d => d % 2 !== 0);
    if (allEven) {
        signals.push({
            type: 'Streak Reversal',
            direction: 'BUY ODD',
            strength: 'MODERATE',
            confidence: 62,
            reason: '5 consecutive EVEN ticks — reversal likely',
        });
    } else if (allOdd) {
        signals.push({
            type: 'Streak Reversal',
            direction: 'BUY EVEN',
            strength: 'MODERATE',
            confidence: 62,
            reason: '5 consecutive ODD ticks — reversal likely',
        });
    }

    return signals;
};

const SignalsScanner: React.FC = () => {
    const [symbol, setSymbol] = useState('1HZ75V');
    const [tickWindow, setTickWindow] = useState(100);
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [lastPrice, setLastPrice] = useState('');
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [totalTicks, setTotalTicks] = useState(0);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [digitCounts, setDigitCounts] = useState<number[]>(Array(10).fill(0));

    const wsRef = useRef<WebSocket | null>(null);
    const ticksRef = useRef<number[]>([]);
    const pipRef = useRef(2);
    const winRef = useRef(100);

    const recompute = useCallback(() => {
        const counts = Array(10).fill(0);
        ticksRef.current.forEach(d => counts[d]++);
        setDigitCounts([...counts]);
        setTotalTicks(ticksRef.current.length);
        setSignals(computeSignals(ticksRef.current));
        setLastUpdate(new Date());
    }, []);

    const connect = useCallback(
        (sym: string, win: number) => {
            if (wsRef.current) wsRef.current.close();
            ticksRef.current = [];
            winRef.current = win;
            pipRef.current = 2;
            setConnected(false);
            setLoading(true);
            setSignals([]);
            setLastPrice('');
            setLastDigit(null);
            setTotalTicks(0);
            setDigitCounts(Array(10).fill(0));

            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                ws.send(
                    JSON.stringify({
                        ticks_history: sym,
                        count: win,
                        end: 'latest',
                        style: 'ticks',
                        req_id: 1,
                    })
                );
            };

            ws.onmessage = evt => {
                const msg = JSON.parse(evt.data);

                if (msg.msg_type === 'history' && msg.history) {
                    if (msg.pip_size != null) pipRef.current = Number(msg.pip_size);
                    const pip = pipRef.current;
                    const quotes = (msg.history.prices || []) as number[];
                    ticksRef.current = quotes.map(q => extractDigit(q, pip)).slice(-win);
                    recompute();
                    if (quotes.length > 0) {
                        const last = quotes[quotes.length - 1];
                        setLastPrice(Number(last).toFixed(pip));
                        setLastDigit(extractDigit(last, pip));
                    }
                    setLoading(false);
                    ws.send(JSON.stringify({ ticks: sym, subscribe: 1, req_id: 2 }));
                }

                if (msg.msg_type === 'tick' && msg.tick) {
                    const { quote, pip_size } = msg.tick;
                    if (pip_size != null) pipRef.current = Number(pip_size);
                    const pip = pipRef.current;
                    const digit = extractDigit(quote, pip);
                    setLastPrice(Number(quote).toFixed(pip));
                    setLastDigit(digit);
                    ticksRef.current.push(digit);
                    if (ticksRef.current.length > winRef.current) ticksRef.current.shift();
                    recompute();
                    setLoading(false);
                }
            };

            ws.onerror = () => {
                setConnected(false);
                setLoading(false);
            };
            ws.onclose = () => setConnected(false);
        },
        [recompute]
    );

    useEffect(() => {
        connect(symbol, tickWindow);
        return () => wsRef.current?.close();
    }, [symbol, tickWindow, connect]);

    const evenCount = digitCounts.filter((_, d) => d % 2 === 0).reduce((a, b) => a + b, 0);
    const oddCount = totalTicks - evenCount;
    const evenPct = totalTicks > 0 ? ((evenCount / totalTicks) * 100).toFixed(1) : '0.0';
    const oddPct = totalTicks > 0 ? ((oddCount / totalTicks) * 100).toFixed(1) : '0.0';

    return (
        <div className='signals-scanner'>
            <div className='signals-scanner__header'>
                <div className='signals-scanner__status'>
                    <span className={`signals-scanner__dot ${connected ? 'signals-scanner__dot--live' : ''}`} />
                    <span className='signals-scanner__status-txt'>
                        {loading ? 'Scanning...' : connected ? 'AI SCANNING LIVE' : 'Disconnected'}
                    </span>
                    {lastUpdate && (
                        <span className='signals-scanner__updated'>Updated: {lastUpdate.toLocaleTimeString()}</span>
                    )}
                </div>

                <div className='signals-scanner__controls'>
                    <select
                        className='signals-scanner__select'
                        value={symbol}
                        onChange={e => setSymbol(e.target.value)}
                    >
                        {MARKETS.map(m => (
                            <option key={m.value} value={m.value}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                    <select
                        className='signals-scanner__select signals-scanner__select--sm'
                        value={tickWindow}
                        onChange={e => setTickWindow(Number(e.target.value))}
                    >
                        {TICK_WINDOWS.map(w => (
                            <option key={w} value={w}>
                                {w} ticks
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className='signals-scanner__price-row'>
                <span className='signals-scanner__price'>{lastPrice || '—'}</span>
                <span className='signals-scanner__last-digit'>
                    Last digit: <strong>{lastDigit !== null ? lastDigit : '—'}</strong>
                </span>
                <span className='signals-scanner__tick-count'>
                    {totalTicks}/{tickWindow} ticks
                </span>
            </div>

            <div className='signals-scanner__eo-bar'>
                <div className='signals-scanner__eo-bar-even' style={{ width: `${evenPct}%` }}>
                    <span>EVEN {evenPct}%</span>
                </div>
                <div className='signals-scanner__eo-bar-odd' style={{ width: `${oddPct}%` }}>
                    <span>ODD {oddPct}%</span>
                </div>
            </div>

            <div className='signals-scanner__signals-title'>
                <span>🤖 AI Entry Signals</span>
                <span className='signals-scanner__signals-count'>
                    {signals.length} signal{signals.length !== 1 ? 's' : ''}
                </span>
            </div>

            {loading && totalTicks === 0 ? (
                <div className='signals-scanner__loading'>
                    <div className='signals-scanner__spinner' />
                    <p>Loading market data...</p>
                </div>
            ) : signals.length === 0 ? (
                <div className='signals-scanner__no-signal'>
                    <span>📊</span>
                    <p>No clear signal — market is balanced. Wait for a stronger bias.</p>
                </div>
            ) : (
                <div className='signals-scanner__signals-grid'>
                    {signals.map((sig, i) => (
                        <div
                            key={i}
                            className={`signals-scanner__signal signals-scanner__signal--${sig.strength.toLowerCase()}`}
                        >
                            <div className='signals-scanner__signal-header'>
                                <span className='signals-scanner__signal-type'>{sig.type}</span>
                                <span
                                    className='signals-scanner__signal-strength'
                                    style={{ color: strengthColor[sig.strength] }}
                                >
                                    {sig.strength}
                                </span>
                            </div>
                            <div className='signals-scanner__signal-direction'>{sig.direction}</div>
                            <div className='signals-scanner__signal-confidence'>
                                <div className='signals-scanner__conf-bar-bg'>
                                    <div
                                        className='signals-scanner__conf-bar-fill'
                                        style={{
                                            width: `${sig.confidence}%`,
                                            background: strengthColor[sig.strength],
                                        }}
                                    />
                                </div>
                                <span>{sig.confidence}% confidence</span>
                            </div>
                            <div className='signals-scanner__signal-reason'>{sig.reason}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className='signals-scanner__digits-row'>
                {digitCounts.map((c, d) => {
                    const pct = totalTicks > 0 ? ((c / totalTicks) * 100).toFixed(1) : '0.0';
                    const isLow = totalTicks > 20 && Number(pct) < 8;
                    const isHigh = totalTicks > 20 && Number(pct) > 14;
                    return (
                        <div
                            key={d}
                            className={`signals-scanner__digit-chip ${isLow ? 'signals-scanner__digit-chip--low' : isHigh ? 'signals-scanner__digit-chip--high' : ''}`}
                        >
                            <span>{d}</span>
                            <small>{pct}%</small>
                        </div>
                    );
                })}
            </div>

            <div className='signals-scanner__disclaimer'>
                Signals are statistical — not financial advice. Always manage risk.
            </div>
        </div>
    );
};

export default SignalsScanner;
