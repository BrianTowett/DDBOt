import React, { useCallback,useEffect, useRef, useState } from 'react';
import { APP_IDS, getSocketURL } from '@/components/shared/utils/config/config';
import './over-under-signal.scss';

const MARKETS = [
    { label: 'V10 (1s)', value: '1HZ10V' },
    { label: 'V15 (1s)', value: '1HZ15V' },
    { label: 'V25 (1s)', value: '1HZ25V' },
    { label: 'V30 (1s)', value: '1HZ30V' },
    { label: 'V50 (1s)', value: '1HZ50V' },
    { label: 'V75 (1s)', value: '1HZ75V' },
    { label: 'V90 (1s)', value: '1HZ90V' },
    { label: 'V100 (1s)', value: '1HZ100V' },
    { label: 'Volt 10', value: 'R_10' },
    { label: 'Volt 25', value: 'R_25' },
    { label: 'Volt 50', value: 'R_50' },
    { label: 'Volt 75', value: 'R_75' },
    { label: 'Volt 100', value: 'R_100' },
    { label: 'Volt 250', value: 'R_250' },
    { label: 'Jump 10', value: 'JD10' },
    { label: 'Jump 25', value: 'JD25' },
    { label: 'Jump 50', value: 'JD50' },
    { label: 'Jump 75', value: 'JD75' },
    { label: 'Jump 100', value: 'JD100' },
];

const TICK_SIZES = [100, 200, 500, 1000];
const DEFAULT_TICKS = 200;
const ENTRY_TTL_MS = 10_000;

const extractDigit = (quote: number | string, pipSize = 2): number => {
    const s = Number(quote).toFixed(pipSize);
    return parseInt(s[s.length - 1], 10);
};

const getWsUrl = () => {
    try {
        return `wss://${getSocketURL()}/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    } catch {
        return `wss://ws.derivws.com/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    }
};

interface MarketState {
    ticks: number[];
    pipSize: number;
    lastPrice: string;
    currentDigit: number | null;
    ready: boolean;
    pcts: number[]; // [0..9] percentages
    greenDigit: number;
    blueDigit: number;
    redDigit: number;
    yellowDigit: number;
    // OVER analysis
    overVariant: 'OVER3' | 'OVER2' | 'NONE';
    overConds: boolean[]; // [low<10, R/Y in low, high≥11×2, G/B in high]
    overTriggerLeast: number | null;
    overTriggerSet: number[];
    overWatching: boolean;
    overEntryAt: number | null;
    // UNDER analysis
    underVariant: 'UNDER6' | 'UNDER7' | 'NONE';
    underConds: boolean[]; // [high<10, R/Y in high, low≥11×2, G/B in low]
    underTriggerLeast: number | null;
    underTriggerSet: number[];
    underWatching: boolean;
    underEntryAt: number | null;
}

type MarketsMap = Record<string, MarketState>;

function analyze(ticks: number[], prevState: MarketState | null, newDigit: number | null): MarketState {
    const prev = prevState ?? {
        ticks: [],
        pipSize: 2,
        lastPrice: '',
        currentDigit: null,
        ready: false,
        pcts: Array(10).fill(0),
        greenDigit: 0,
        blueDigit: 1,
        redDigit: 9,
        yellowDigit: 8,
        overVariant: 'NONE',
        overConds: [false, false, false, false],
        overTriggerLeast: null,
        overTriggerSet: [],
        overWatching: false,
        overEntryAt: null,
        underVariant: 'NONE',
        underConds: [false, false, false, false],
        underTriggerLeast: null,
        underTriggerSet: [],
        underWatching: false,
        underEntryAt: null,
    };

    const total = ticks.length;
    const counts = Array(10).fill(0);
    ticks.forEach(d => counts[d]++);
    const pcts = counts.map(c => (total > 0 ? (c / total) * 100 : 0));

    const sorted = pcts.map((p, d) => ({ d, p })).sort((a, b) => a.p - b.p);
    const red = sorted[0].d;
    const yellow = sorted[1].d;
    const green = sorted[9].d;
    const blue = sorted[8].d;

    // ── OVER ──────────────────────────────────────────────────────────────────
    const low0123below10 = [0, 1, 2, 3].filter(d => pcts[d] < 10);
    const high4to9above11 = [4, 5, 6, 7, 8, 9].filter(d => pcts[d] >= 11);
    const ryInLow = [0, 1, 2, 3].includes(red) || [0, 1, 2, 3].includes(yellow);
    const gbInHigh = [4, 5, 6, 7, 8, 9].includes(green) && [4, 5, 6, 7, 8, 9].includes(blue);

    let overVariant: 'OVER3' | 'OVER2' | 'NONE' = 'NONE';
    let overTriggerSet: number[] = [];

    if (low0123below10.length === 4 && high4to9above11.length >= 2 && ryInLow && gbInHigh) {
        overVariant = 'OVER3';
        overTriggerSet = [1, 2, 3];
    } else if ([0, 1, 2].every(d => pcts[d] < 10) && high4to9above11.length >= 2 && ryInLow && gbInHigh) {
        overVariant = 'OVER2';
        overTriggerSet = [1, 2];
    }

    const overTriggerLeast =
        overTriggerSet.length > 0 ? overTriggerSet.reduce((a, b) => (counts[a] <= counts[b] ? a : b)) : null;

    const overConds = [low0123below10.length >= 3, ryInLow, high4to9above11.length >= 2, gbInHigh];

    // ── UNDER ─────────────────────────────────────────────────────────────────
    const high6789below10 = [6, 7, 8, 9].filter(d => pcts[d] < 10);
    const low0to5above11 = [0, 1, 2, 3, 4, 5].filter(d => pcts[d] >= 11);
    const ryInHigh = [6, 7, 8, 9].includes(red) || [6, 7, 8, 9].includes(yellow);
    const gbInLow = [0, 1, 2, 3, 4, 5].includes(green) && [0, 1, 2, 3, 4, 5].includes(blue);

    let underVariant: 'UNDER6' | 'UNDER7' | 'NONE' = 'NONE';
    let underTriggerSet: number[] = [];

    if (high6789below10.length === 4 && low0to5above11.length >= 2 && ryInHigh && gbInLow) {
        underVariant = 'UNDER6';
        underTriggerSet = [6, 7, 8];
    } else if ([7, 8, 9].every(d => pcts[d] < 10) && low0to5above11.length >= 2 && ryInHigh && gbInLow) {
        underVariant = 'UNDER7';
        underTriggerSet = [7, 8];
    }

    const underTriggerLeast =
        underTriggerSet.length > 0 ? underTriggerSet.reduce((a, b) => (counts[a] <= counts[b] ? a : b)) : null;

    const underConds = [high6789below10.length >= 3, ryInHigh, low0to5above11.length >= 2, gbInLow];

    // ── Entry detection ───────────────────────────────────────────────────────
    let overWatching = overVariant !== 'NONE' ? prev.overWatching : false;
    let underWatching = underVariant !== 'NONE' ? prev.underWatching : false;
    let overEntryAt = prev.overEntryAt;
    let underEntryAt = prev.underEntryAt;

    if (newDigit !== null) {
        // Fire entry if we were watching and new digit is in entry zone
        if (overWatching) {
            if ([4, 5, 6, 7, 8, 9].includes(newDigit)) {
                overEntryAt = Date.now();
            }
            overWatching = false;
        }
        if (underWatching) {
            if ([0, 1, 2, 3, 4].includes(newDigit)) {
                underEntryAt = Date.now();
            }
            underWatching = false;
        }

        // Set watching if new digit is the trigger
        if (overVariant !== 'NONE' && overTriggerLeast !== null && newDigit === overTriggerLeast) {
            overWatching = true;
        }
        if (underVariant !== 'NONE' && underTriggerLeast !== null && newDigit === underTriggerLeast) {
            underWatching = true;
        }
    }

    return {
        ...prev,
        ticks,
        pcts,
        greenDigit: green,
        blueDigit: blue,
        redDigit: red,
        yellowDigit: yellow,
        overVariant,
        overConds,
        overTriggerLeast,
        overTriggerSet,
        overWatching,
        overEntryAt,
        underVariant,
        underConds,
        underTriggerLeast,
        underTriggerSet,
        underWatching,
        underEntryAt,
    };
}

const OverUnderSignal: React.FC = () => {
    const [tickCount, setTickCount] = useState(DEFAULT_TICKS);
    const [markets, setMarkets] = useState<MarketsMap>({});
    const [connected,    setConnected]    = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [scanTime,     setScanTime]     = useState<Date | null>(null);
    const [filter,       setFilter]       = useState<'ALL' | 'OVER' | 'UNDER'>('ALL');

    const wsRef          = useRef<WebSocket | null>(null);
    const reqMapRef      = useRef<Record<number, string>>({});
    const stateRef       = useRef<MarketsMap>({});
    const tickCountRef   = useRef(DEFAULT_TICKS);
    const reconnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef     = useRef(true);

    const initMarkets = useCallback(() => {
        const init: MarketsMap = {};
        MARKETS.forEach(m => {
            init[m.value] = analyze([], null, null);
        });
        stateRef.current = init;
        setMarkets({ ...init });
    }, []);

    const updateMarket = useCallback((symbol: string, updater: (prev: MarketState) => MarketState) => {
        stateRef.current[symbol] = updater(stateRef.current[symbol]);
        setMarkets({ ...stateRef.current });
    }, []);

    const startScan = useCallback(
        (count: number) => {
            if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current); reconnTimerRef.current = null; }
            setReconnecting(false);
            if (wsRef.current) wsRef.current.close();
            initMarkets();
            tickCountRef.current = count;
            setScanTime(null);

            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                reqMapRef.current = {};
                MARKETS.forEach((m, i) => {
                    const reqId = 200 + i;
                    reqMapRef.current[reqId] = m.value;
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(
                                JSON.stringify({
                                    ticks_history: m.value,
                                    count,
                                    end: 'latest',
                                    style: 'ticks',
                                    req_id: reqId,
                                })
                            );
                        }
                    }, i * 80);
                });
            };

            ws.onmessage = evt => {
                const msg = JSON.parse(evt.data);

                if (msg.msg_type === 'history' && msg.history) {
                    const symbol = reqMapRef.current[msg.req_id];
                    if (!symbol) return;
                    const pipSize = msg.pip_size != null ? Number(msg.pip_size) : 2;
                    const quotes: number[] = msg.history.prices || [];
                    const ticks = quotes.map(q => extractDigit(q, pipSize));
                    const lastTick = ticks[ticks.length - 1] ?? null;
                    const lastPrice = quotes.length > 0 ? Number(quotes[quotes.length - 1]).toFixed(pipSize) : '';

                    updateMarket(symbol, prev => {
                        const next = analyze(ticks.slice(-tickCountRef.current), prev, lastTick);
                        return { ...next, pipSize, lastPrice, currentDigit: lastTick, ready: true };
                    });
                    setScanTime(new Date());
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
                    }
                }

                if (msg.msg_type === 'tick' && msg.tick) {
                    const { symbol, quote, pip_size } = msg.tick;
                    if (!symbol || !stateRef.current[symbol]) return;
                    const pipSize = pip_size != null ? Number(pip_size) : stateRef.current[symbol].pipSize;
                    const digit = extractDigit(quote, pipSize);
                    const maxLen = tickCountRef.current;

                    updateMarket(symbol, prev => {
                        const newTicks = [...prev.ticks, digit].slice(-maxLen);
                        const next = analyze(newTicks, prev, digit);
                        return {
                            ...next,
                            pipSize,
                            lastPrice: Number(quote).toFixed(pipSize),
                            currentDigit: digit,
                            ready: true,
                        };
                    });
                    setScanTime(new Date());
                }
            };

            ws.onerror = () => setConnected(false);
            ws.onclose = () => {
                setConnected(false);
                if (!mountedRef.current) return;
                setReconnecting(true);
                reconnTimerRef.current = setTimeout(() => {
                    if (!mountedRef.current) return;
                    setReconnecting(false);
                    startScan(tickCountRef.current);
                }, 3000);
            };
        },
        [initMarkets, updateMarket]
    );

    useEffect(() => {
        mountedRef.current = true;
        startScan(tickCount);
        return () => {
            mountedRef.current = false;
            if (reconnTimerRef.current) clearTimeout(reconnTimerRef.current);
            wsRef.current?.close();
        };
    }, []);

    const handleRescan = () => startScan(tickCount);
    const handleTickCount = (n: number) => {
        setTickCount(n);
        tickCountRef.current = n;
        startScan(n);
    };

    const now = Date.now();
    const readyMarkets = MARKETS.filter(m => markets[m.value]?.ready);
    const overCount = readyMarkets.filter(m => markets[m.value]?.overVariant !== 'NONE').length;
    const underCount = readyMarkets.filter(m => markets[m.value]?.underVariant !== 'NONE').length;
    const entryCount = readyMarkets.filter(m => {
        const s = markets[m.value];
        return (
            (s?.overEntryAt && now - s.overEntryAt < ENTRY_TTL_MS) ||
            (s?.underEntryAt && now - s.underEntryAt < ENTRY_TTL_MS)
        );
    }).length;

    const displayMarkets = MARKETS.filter(m => {
        const s = markets[m.value];
        if (filter === 'OVER') return s?.overVariant !== 'NONE';
        if (filter === 'UNDER') return s?.underVariant !== 'NONE';
        return true;
    });

    const check = (ok: boolean) => (ok ? '✓' : '✗');
    const cx = (ok: boolean) => (ok ? 'ou__cond--pass' : 'ou__cond--fail');

    return (
        <div className='ou'>
            <div className='ou__header'>
                <div className='ou__title-row'>
                    <span className={`ou__dot ${connected ? 'ou__dot--live' : reconnecting ? 'ou__dot--reconnecting' : 'ou__dot--off'}`} />
                    <h2 className='ou__title'>Over/Under Signal — All Markets</h2>
                    {reconnecting && <span className='ou__reconnect-badge'>↻ Reconnecting…</span>}
                    {/* <span className='ou__mintpal'> */}
                    {/* Trade on <a href='https://www.mintpal.com' target='_blank' rel='noreferrer'>mintpal.com</a> */}
                    {/* </span> */}
                </div>
                <p className='ou__subtitle'>
                    Scans all {MARKETS.length} volatility markets for OVER 1,2,3 and UNDER 8,7,6 signals with live entry
                    detection
                </p>
            </div>

            <div className='ou__controls'>
                <div className='ou__tick-selector'>
                    <span className='ou__ctrl-label'>Tick window:</span>
                    {TICK_SIZES.map(n => (
                        <button
                            key={n}
                            className={`ou__tick-btn ${tickCount === n ? 'ou__tick-btn--active' : ''}`}
                            onClick={() => handleTickCount(n)}
                        >
                            {n}
                        </button>
                    ))}
                </div>
                <button className='ou__rescan-btn' onClick={handleRescan}>
                    ↻ Rescan
                </button>
            </div>

            <div className='ou__summary'>
                <div className='ou__summary-item'>
                    <span className='ou__summary-val'>
                        {readyMarkets.length}/{MARKETS.length}
                    </span>
                    <span className='ou__summary-lbl'>Scanned</span>
                </div>
                <div className='ou__summary-item ou__summary-item--over'>
                    <span className='ou__summary-val'>{overCount}</span>
                    <span className='ou__summary-lbl'>OVER signals</span>
                </div>
                <div className='ou__summary-item ou__summary-item--under'>
                    <span className='ou__summary-val'>{underCount}</span>
                    <span className='ou__summary-lbl'>UNDER signals</span>
                </div>
                {entryCount > 0 && (
                    <div className='ou__summary-item ou__summary-item--entry'>
                        <span className='ou__summary-val ou__summary-val--flash'>{entryCount}</span>
                        <span className='ou__summary-lbl'>ENTER NOW</span>
                    </div>
                )}
                {scanTime && <div className='ou__summary-time'>Updated {scanTime.toLocaleTimeString()}</div>}
            </div>

            <div className='ou__filter-row'>
                {(['ALL', 'OVER', 'UNDER'] as const).map(f => (
                    <button
                        key={f}
                        className={`ou__filter-btn ou__filter-btn--${f.toLowerCase()} ${filter === f ? 'ou__filter-btn--active' : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f}
                    </button>
                ))}
            </div>

            <div className='ou__grid'>
                {displayMarkets.map(m => {
                    const s = markets[m.value];
                    const ready = s?.ready;
                    const overActive = s?.overEntryAt && now - s.overEntryAt < ENTRY_TTL_MS;
                    const underActive = s?.underEntryAt && now - s.underEntryAt < ENTRY_TTL_MS;
                    const hasOver = s?.overVariant !== 'NONE';
                    const hasUnder = s?.underVariant !== 'NONE';
                    const cardClass = overActive
                        ? 'ou__card--enter-over'
                        : underActive
                          ? 'ou__card--enter-under'
                          : s?.overWatching
                            ? 'ou__card--watching-over'
                            : s?.underWatching
                              ? 'ou__card--watching-under'
                              : hasOver || hasUnder
                                ? 'ou__card--signal'
                                : '';

                    return (
                        <div key={m.value} className={`ou__card ${cardClass}`}>
                            <div className='ou__card-header'>
                                <span className='ou__card-label'>{m.label}</span>
                                <div className='ou__card-badges'>
                                    {ready && s.overVariant !== 'NONE' && (
                                        <span
                                            className={`ou__badge ou__badge--over ${overActive ? 'ou__badge--enter' : s.overWatching ? 'ou__badge--watching' : ''}`}
                                        >
                                            {overActive
                                                ? '▲ ENTER'
                                                : s.overWatching
                                                  ? '▲ WATCH'
                                                  : `▲ ${s.overVariant === 'OVER3' ? 'OVER 3' : 'OVER 2'}`}
                                        </span>
                                    )}
                                    {ready && s.underVariant !== 'NONE' && (
                                        <span
                                            className={`ou__badge ou__badge--under ${underActive ? 'ou__badge--enter' : s.underWatching ? 'ou__badge--watching' : ''}`}
                                        >
                                            {underActive
                                                ? '▼ ENTER'
                                                : s.underWatching
                                                  ? '▼ WATCH'
                                                  : `▼ ${s.underVariant === 'UNDER6' ? 'UNDER 6' : 'UNDER 7'}`}
                                        </span>
                                    )}
                                    {ready && !hasOver && !hasUnder && (
                                        <span className='ou__badge ou__badge--neutral'>NEUTRAL</span>
                                    )}
                                    {!ready && <span className='ou__badge ou__badge--loading'>…</span>}
                                </div>
                            </div>

                            {ready && s ? (
                                <>
                                    {/* Digit zone quick-view */}
                                    <div className='ou__digit-zones'>
                                        <div className='ou__zone ou__zone--over'>
                                            <span className='ou__zone-lbl'>▲ OVER zone (0–3)</span>
                                            <div className='ou__zone-digits'>
                                                {[0, 1, 2, 3].map(d => (
                                                    <div
                                                        key={d}
                                                        className={`ou__zone-digit ${s.pcts[d] < 10 ? 'ou__zone-digit--low' : ''} ${d === s.currentDigit ? 'ou__zone-digit--current' : ''}`}
                                                    >
                                                        <span className='ou__zd-num'>{d}</span>
                                                        <span className='ou__zd-pct'>{s.pcts[d].toFixed(1)}%</span>
                                                        {d === s.redDigit && (
                                                            <span className='ou__zd-tag ou__zd-tag--red'>R</span>
                                                        )}
                                                        {d === s.yellowDigit && (
                                                            <span className='ou__zd-tag ou__zd-tag--yellow'>Y</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className='ou__zone ou__zone--under'>
                                            <span className='ou__zone-lbl'>▼ UNDER zone (6–9)</span>
                                            <div className='ou__zone-digits'>
                                                {[6, 7, 8, 9].map(d => (
                                                    <div
                                                        key={d}
                                                        className={`ou__zone-digit ${s.pcts[d] < 10 ? 'ou__zone-digit--low' : ''} ${d === s.currentDigit ? 'ou__zone-digit--current' : ''}`}
                                                    >
                                                        <span className='ou__zd-num'>{d}</span>
                                                        <span className='ou__zd-pct'>{s.pcts[d].toFixed(1)}%</span>
                                                        {d === s.redDigit && (
                                                            <span className='ou__zd-tag ou__zd-tag--red'>R</span>
                                                        )}
                                                        {d === s.yellowDigit && (
                                                            <span className='ou__zd-tag ou__zd-tag--yellow'>Y</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* GREEN / BLUE positions */}
                                    <div className='ou__gb-row'>
                                        <span className='ou__gb-item'>
                                            <span className='ou__chip ou__chip--green'>G</span>
                                            digit <strong>{s.greenDigit}</strong>
                                            <span
                                                className={`ou__gb-zone ${[4, 5, 6, 7, 8, 9].includes(s.greenDigit) ? 'ou__gb-zone--high' : [0, 1, 2, 3].includes(s.greenDigit) ? 'ou__gb-zone--low-ok' : ''}`}
                                            >
                                                {[4, 5, 6, 7, 8, 9].includes(s.greenDigit)
                                                    ? '✓ HIGH'
                                                    : [0, 1, 2, 3, 4, 5].includes(s.greenDigit)
                                                      ? '✓ LOW'
                                                      : ''}
                                            </span>
                                        </span>
                                        <span className='ou__gb-item'>
                                            <span className='ou__chip ou__chip--blue'>B</span>
                                            digit <strong>{s.blueDigit}</strong>
                                            <span
                                                className={`ou__gb-zone ${[4, 5, 6, 7, 8, 9].includes(s.blueDigit) ? 'ou__gb-zone--high' : [0, 1, 2, 3, 4, 5].includes(s.blueDigit) ? 'ou__gb-zone--low-ok' : ''}`}
                                            >
                                                {[4, 5, 6, 7, 8, 9].includes(s.blueDigit)
                                                    ? '✓ HIGH'
                                                    : [0, 1, 2, 3, 4, 5].includes(s.blueDigit)
                                                      ? '✓ LOW'
                                                      : ''}
                                            </span>
                                        </span>
                                    </div>

                                    {/* Entry point hint */}
                                    {(hasOver || hasUnder) && (
                                        <div className='ou__entry-row'>
                                            {hasOver && s.overTriggerLeast !== null && (
                                                <div
                                                    className={`ou__entry-hint ${s.overWatching ? 'ou__entry-hint--watching' : ''}`}
                                                >
                                                    {s.overWatching
                                                        ? `⚡ Trigger ${s.overTriggerLeast} seen! Next tick 4-9 → ENTER OVER`
                                                        : `▲ Wait for digit ${s.overTriggerLeast} (least of ${s.overTriggerSet.join(',')}) → next 4-9`}
                                                </div>
                                            )}
                                            {hasUnder && s.underTriggerLeast !== null && (
                                                <div
                                                    className={`ou__entry-hint ${s.underWatching ? 'ou__entry-hint--watching' : ''}`}
                                                >
                                                    {s.underWatching
                                                        ? `⚡ Trigger ${s.underTriggerLeast} seen! Next tick 0-4 → ENTER UNDER`
                                                        : `▼ Wait for digit ${s.underTriggerLeast} (least of ${s.underTriggerSet.join(',')}) → next 0-4`}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className='ou__card-footer'>
                                        <span className='ou__card-price'>{s.lastPrice}</span>
                                        <span className='ou__card-ticks'>{s.ticks.length} ticks</span>
                                    </div>
                                </>
                            ) : (
                                <div className='ou__card-loading'>
                                    <div className='ou__spinner' />
                                    <span>Loading…</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className='ou__legend'>
                <div className='ou__legend-grid'>
                    <div className='ou__legend-block ou__legend-block--over'>
                        <strong>▲ OVER 1,2,3 Strategy</strong>
                        <ul>
                            <li>Digits 0–3 all below 10% (OVER 3) or 0–2 (OVER 2)</li>
                            <li>RED or YELLOW bar sits in digits 0–3</li>
                            <li>At least 2 digits from 4–9 are ≥ 11%</li>
                            <li>GREEN &amp; BLUE bars both in digits 4–9</li>
                            <li>
                                <em>Entry: least of 1,2,3 appears → next 4–9 = ENTER</em>
                            </li>
                        </ul>
                    </div>
                    <div className='ou__legend-block ou__legend-block--under'>
                        <strong>▼ UNDER 8,7,6 Strategy</strong>
                        <ul>
                            <li>Digits 6–9 all below 10% (UNDER 6) or 7–9 (UNDER 7)</li>
                            <li>RED or YELLOW bar sits in digits 6–9</li>
                            <li>At least 2 digits from 0–5 are ≥ 11%</li>
                            <li>GREEN &amp; BLUE bars both in digits 0–5</li>
                            <li>
                                <em>Entry: least of 6,7,8 appears → next 0–4 = ENTER</em>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OverUnderSignal;
