import React, { useCallback,useEffect, useRef, useState } from 'react';
import { APP_IDS, getSocketURL } from '@/components/shared/utils/config/config';
import './xenon-ai.scss';

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

type Prediction = {
    label: string;
    value: string;
    confidence: number;
    color: string;
    sub?: string;
};

const analyzeTicks = (ticks: number[]): Prediction[] => {
    if (ticks.length < 30) return [];

    const total = ticks.length;
    const counts = Array(10).fill(0);
    ticks.forEach(d => counts[d]++);

    const evenCount = ticks.filter(d => d % 2 === 0).length;
    const oddCount = total - evenCount;
    const underCount = ticks.filter(d => d < 5).length;
    const overCount = total - underCount;

    const evenPct = (evenCount / total) * 100;
    const oddPct = (oddCount / total) * 100;
    const underPct = (underCount / total) * 100;
    const overPct = (overCount / total) * 100;

    const sortedByCount = counts.map((c, d) => ({ digit: d, pct: (c / total) * 100 })).sort((a, b) => b.pct - a.pct);

    const streak = (() => {
        let len = 1;
        const last = ticks[ticks.length - 1];
        for (let i = ticks.length - 2; i >= 0; i--) {
            if (ticks[i] === last) len++;
            else break;
        }
        return { digit: last, len };
    })();

    const predictions: Prediction[] = [];

    const eoDir = evenPct >= oddPct ? 'EVEN' : 'ODD';
    const eoConf = Math.max(evenPct, oddPct);
    predictions.push({
        label: 'Even/Odd Bias',
        value: `BUY ${eoDir}`,
        confidence: Math.min(95, Math.round(eoConf)),
        color: eoConf >= 56 ? '#00e676' : eoConf >= 52 ? '#ffeb3b' : '#90a4ae',
        sub: `E:${evenPct.toFixed(1)}%  O:${oddPct.toFixed(1)}%`,
    });

    const ouDir = underPct >= overPct ? 'UNDER 5' : 'OVER 4';
    const ouConf = Math.max(underPct, overPct);
    predictions.push({
        label: 'Over/Under Bias',
        value: `BUY ${ouDir}`,
        confidence: Math.min(95, Math.round(ouConf)),
        color: ouConf >= 56 ? '#00e676' : ouConf >= 52 ? '#ffeb3b' : '#90a4ae',
        sub: `U:${underPct.toFixed(1)}%  O:${overPct.toFixed(1)}%`,
    });

    const rarest = sortedByCount[sortedByCount.length - 1];
    const rarestConf = Math.min(90, Math.round((10 - rarest.pct) * 7 + 25));
    predictions.push({
        label: 'Digit Due (Rise)',
        value: `DIGIT ${rarest.digit}`,
        confidence: rarestConf,
        color: rarest.pct < 6 ? '#00e676' : rarest.pct < 9 ? '#ffeb3b' : '#90a4ae',
        sub: `Only ${rarest.pct.toFixed(1)}% frequency`,
    });

    const mostFreq = sortedByCount[0];
    predictions.push({
        label: 'Hot Digit (Fade)',
        value: `DIGIT ${mostFreq.digit}`,
        confidence: Math.min(88, Math.round(mostFreq.pct * 4 + 20)),
        color: mostFreq.pct > 15 ? '#ff5252' : mostFreq.pct > 12 ? '#ffeb3b' : '#90a4ae',
        sub: `${mostFreq.pct.toFixed(1)}% — overrepresented`,
    });

    if (streak.len >= 3) {
        const revDir = streak.digit % 2 === 0 ? 'ODD' : 'EVEN';
        predictions.push({
            label: 'Streak Reversal',
            value: `BUY ${revDir}`,
            confidence: Math.min(85, 50 + streak.len * 6),
            color: streak.len >= 5 ? '#00e676' : '#ffeb3b',
            sub: `${streak.len}× digit ${streak.digit} in a row`,
        });
    }

    return predictions;
};

const XenonAI: React.FC = () => {
    const [symbol, setSymbol] = useState('1HZ75V');
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [totalTicks, setTotalTicks] = useState(0);
    const [lastPrice, setLastPrice] = useState('');
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [scanState, setScanState] = useState('Initializing...');
    const [scanAnim, setScanAnim] = useState(0);

    const wsRef = useRef<WebSocket | null>(null);
    const ticksRef = useRef<number[]>([]);
    const pipRef = useRef(2);

    const recompute = useCallback(() => {
        const preds = analyzeTicks(ticksRef.current);
        setPredictions(preds);
        setTotalTicks(ticksRef.current.length);
        setScanAnim(n => n + 1);
        if (ticksRef.current.length > 30) {
            setScanState('Analysis complete — signals updated');
        }
    }, []);

    const connect = useCallback(
        (sym: string) => {
            if (wsRef.current) wsRef.current.close();
            ticksRef.current = [];
            pipRef.current = 2;
            setConnected(false);
            setLoading(true);
            setPredictions([]);
            setLastPrice('');
            setLastDigit(null);
            setTotalTicks(0);
            setScanState('Connecting to market...');

            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                setScanState('Fetching market history...');
                ws.send(
                    JSON.stringify({
                        ticks_history: sym,
                        count: 500,
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
                    ticksRef.current = quotes.map(q => extractDigit(q, pip));
                    if (quotes.length > 0) {
                        const last = quotes[quotes.length - 1];
                        setLastPrice(Number(last).toFixed(pip));
                        setLastDigit(extractDigit(last, pip));
                    }
                    setScanState('Running AI pattern detection...');
                    recompute();
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
                    if (ticksRef.current.length > 1000) ticksRef.current.shift();
                    recompute();
                    setLoading(false);
                }
            };

            ws.onerror = () => {
                setConnected(false);
                setLoading(false);
                setScanState('Connection error');
            };
            ws.onclose = () => {
                setConnected(false);
                setScanState('Disconnected');
            };
        },
        [recompute]
    );

    useEffect(() => {
        connect(symbol);
        return () => wsRef.current?.close();
    }, [symbol, connect]);

    return (
        <div className='xenon-ai'>
            <div className='xenon-ai__hero'>
                <div className='xenon-ai__hero-left'>
                    <div className='xenon-ai__logo'>
                        <span className='xenon-ai__logo-x'>X</span>
                        <span className='xenon-ai__logo-text'>ENON AI</span>
                    </div>
                    <div className='xenon-ai__tagline'>Real-time pattern intelligence for Deriv markets</div>
                </div>
                <div className='xenon-ai__hero-right'>
                    <select className='xenon-ai__select' value={symbol} onChange={e => setSymbol(e.target.value)}>
                        {MARKETS.map(m => (
                            <option key={m.value} value={m.value}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                    <div className={`xenon-ai__live-badge ${connected ? 'xenon-ai__live-badge--on' : ''}`}>
                        <span className='xenon-ai__live-dot' />
                        {connected ? 'LIVE' : 'OFFLINE'}
                    </div>
                </div>
            </div>

            <div className='xenon-ai__scan-bar'>
                <div
                    className='xenon-ai__scan-progress'
                    style={{ animationPlayState: connected ? 'running' : 'paused' }}
                />
                <span className='xenon-ai__scan-state'>{scanState}</span>
                <span className='xenon-ai__tick-info'>{totalTicks} ticks analysed</span>
            </div>

            <div className='xenon-ai__price-panel'>
                <div className='xenon-ai__price-item'>
                    <label>Current Price</label>
                    <span>{lastPrice || '—'}</span>
                </div>
                <div className='xenon-ai__price-item'>
                    <label>Last Digit</label>
                    <span className='xenon-ai__digit'>{lastDigit !== null ? lastDigit : '—'}</span>
                </div>
                <div className='xenon-ai__price-item'>
                    <label>Parity</label>
                    <span
                        className={lastDigit !== null ? (lastDigit % 2 === 0 ? 'xenon-ai__even' : 'xenon-ai__odd') : ''}
                    >
                        {lastDigit !== null ? (lastDigit % 2 === 0 ? 'EVEN' : 'ODD') : '—'}
                    </span>
                </div>
                <div className='xenon-ai__price-item'>
                    <label>Side</label>
                    <span>{lastDigit !== null ? (lastDigit < 5 ? 'UNDER 5' : 'OVER 4') : '—'}</span>
                </div>
            </div>

            {loading && totalTicks === 0 ? (
                <div className='xenon-ai__loading'>
                    <div className='xenon-ai__radar'>
                        <div className='xenon-ai__radar-ring xenon-ai__radar-ring--1' />
                        <div className='xenon-ai__radar-ring xenon-ai__radar-ring--2' />
                        <div className='xenon-ai__radar-ring xenon-ai__radar-ring--3' />
                        <div className='xenon-ai__radar-sweep' />
                        <span className='xenon-ai__radar-center'>AI</span>
                    </div>
                    <p>Scanning market patterns...</p>
                </div>
            ) : (
                <div className='xenon-ai__predictions'>
                    <div className='xenon-ai__pred-title'>
                        🧠 Xenon AI Predictions
                        <span className='xenon-ai__pred-note'>Based on {totalTicks} ticks</span>
                    </div>
                    {predictions.length === 0 ? (
                        <div className='xenon-ai__no-pred'>Gathering more data...</div>
                    ) : (
                        <div className='xenon-ai__pred-grid'>
                            {predictions.map((p, i) => (
                                <div key={i} className='xenon-ai__pred-card'>
                                    <div className='xenon-ai__pred-label'>{p.label}</div>
                                    <div className='xenon-ai__pred-value' style={{ color: p.color }}>
                                        {p.value}
                                    </div>
                                    <div className='xenon-ai__pred-bar-row'>
                                        <div className='xenon-ai__pred-bar-bg'>
                                            <div
                                                className='xenon-ai__pred-bar-fill'
                                                style={{ width: `${p.confidence}%`, background: p.color }}
                                            />
                                        </div>
                                        <span style={{ color: p.color }}>{p.confidence}%</span>
                                    </div>
                                    {p.sub && <div className='xenon-ai__pred-sub'>{p.sub}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className='xenon-ai__footer'>
                Xenon AI — Statistical pattern engine. Not financial advice. Use at own risk.
            </div>
        </div>
    );
};

export default XenonAI;
