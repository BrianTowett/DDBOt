import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APP_IDS, getSocketURL } from '@/components/shared/utils/config/config';
import './dp-tools-ai.scss';

// ── Market discovery ──────────────────────────────────────────────────────────
// Regex that matches all Deriv synthetic volatility symbols automatically.
// When Deriv adds new indices (e.g. V200 1s) they appear without code changes.
const IS_VOL_SYM = /^(1HZ\d+V|R_\d+|JD\d+)$/;
const ACTIVE_SYMS_REQ_ID = 999;

// Comprehensive static fallback used until the API responds.
const FALLBACK_MARKETS: { label: string; value: string }[] = [
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

function buildMarketsFromActiveSyms(syms: any[]): { label: string; value: string }[] {
    return syms
        .filter((s: any) => IS_VOL_SYM.test(s.symbol))
        .map((s: any) => ({ label: s.display_name || s.symbol, value: s.symbol }))
        .sort((a, b) => {
            // Order: 1s volatility → standard volatility → jump
            const rank = (v: string) => (v.startsWith('1HZ') ? 0 : v.startsWith('R_') ? 1 : 2);
            const r = rank(a.value) - rank(b.value);
            if (r !== 0) return r;
            const num = (v: string) => parseInt(v.replace(/\D/g, ''), 10);
            return num(a.value) - num(b.value);
        });
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ODD_DIGITS = new Set([1, 3, 5, 7, 9]);
const EVEN_DIGITS = new Set([0, 2, 4, 6, 8]);
const CONFIRM_WINDOW = 5;
const TICK_SIZES = [100, 200, 500, 1000];
const DEFAULT_TICKS = 1000;

const LS_NOTIF_ON = 'eo_notif_on';
const LS_NOTIF_SND = 'eo_notif_snd';
const LS_LOCKED_SYM = 'eo_locked_sym';

// ── Sound definitions ─────────────────────────────────────────────────────────
export type SoundId = 'chime' | 'alert' | 'bell' | 'ping' | 'trade' | 'crystal';

export const SOUNDS: { id: SoundId; label: string }[] = [
    { id: 'chime', label: '🎵 Chime (ascending notes)' },
    { id: 'alert', label: '🔔 Alert (double beep)' },
    { id: 'bell', label: '🔕 Bell (resonant)' },
    { id: 'ping', label: '📍 Ping (short)' },
    { id: 'trade', label: '📈 Trade (signal fanfare)' },
    { id: 'crystal', label: '💎 Crystal (soft ding)' },
];

function getAudioCtx(): AudioContext {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
}

function playChime() {
    const ctx = getAudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.55);
    });
}

function playAlert() {
    const ctx = getAudioCtx();
    [0, 0.22].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = 880;
        const t = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t);
        osc.stop(t + 0.2);
    });
}

function playBell() {
    const ctx = getAudioCtx();
    const freqs = [1318.5, 1567.98, 2093];
    freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25 / (i + 1), t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        osc.start(t);
        osc.stop(t + 1.3);
    });
}

function playPing() {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 1480;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
}

function playTrade() {
    const ctx = getAudioCtx();
    const seq = [392, 523.25, 659.25, 783.99, 1046.5];
    seq.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = i < 4 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.09;
        const vol = i === seq.length - 1 ? 0.45 : 0.28;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + (i === seq.length - 1 ? 0.7 : 0.25));
        osc.start(t);
        osc.stop(t + 0.8);
    });
}

function playCrystal() {
    const ctx = getAudioCtx();
    const freqs = [1046.5, 1318.5];
    freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        osc.start(t);
        osc.stop(t + 1.0);
    });
}

// ── Danger sound — fired only for the locked volatility signal exit ───────────
function playDanger() {
    try {
        const ctx = getAudioCtx();
        // Descending urgent tones (opposite of chime)
        const notes = [880, 660, 440, 330];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.13;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.38, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    } catch (e) {
        console.warn('Danger sound failed:', e);
    }
}

function playSound(id: SoundId) {
    try {
        switch (id) {
            case 'chime':   return playChime();
            case 'alert':   return playAlert();
            case 'bell':    return playBell();
            case 'ping':    return playPing();
            case 'trade':   return playTrade();
            case 'crystal': return playCrystal();
        }
    } catch (e) {
        console.warn('Sound playback failed:', e);
    }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ColorBar {
    digit: number;
    pct: number;
}

interface ConditionStatus {
    greenPass: boolean;
    bluePass: boolean;
    redPass: boolean;
    yellowPass: boolean;
    greenOnTarget: boolean;
    blueOnTarget: boolean;
    redOnTarget: boolean;
    yellowOnTarget: boolean;
}

interface MarketAnalysis {
    rawSignal: 'EVEN' | 'ODD' | 'NEUTRAL';
    green: ColorBar;
    blue: ColorBar;
    red: ColorBar;
    yellow: ColorBar;
    tickCount: number;
    pcts: number[];
    cond: ConditionStatus;
}

interface MarketState {
    ticks: number[];
    pipSize: number;
    lastPrice: string;
    ready: boolean;
    analysis: MarketAnalysis | null;
    signalQueue: string[];
    confirmedSignal: 'EVEN' | 'ODD' | 'NEUTRAL';
    confirmStrength: number;
}

type MarketsMap = Record<string, MarketState>;

// ── Analysis ──────────────────────────────────────────────────────────────────
const extractDigit = (quote: number | string, pipSize = 2): number => {
    const s = Number(quote).toFixed(pipSize);
    return parseInt(s[s.length - 1], 10);
};

function analyzeDigits(ticks: number[]): MarketAnalysis {
    const total = ticks.length;
    const counts = Array(10).fill(0);
    ticks.forEach(d => counts[d]++);
    const pcts = counts.map(c => (total > 0 ? (c / total) * 100 : 0));

    const sorted = pcts.map((p, d) => ({ digit: d, count: counts[d], pct: p })).sort((a, b) => a.count - b.count);

    const red    = sorted[0];
    const yellow = sorted[1];
    const green  = sorted[9];
    const blue   = sorted[8];

    const allOddBelow10  = [1, 3, 5, 7, 9].every(d => pcts[d] < 10);
    const allEvenBelow10 = [0, 2, 4, 6, 8].every(d => pcts[d] < 10);

    const greenOnEven = EVEN_DIGITS.has(green.digit);
    const blueOnEven  = EVEN_DIGITS.has(blue.digit);
    const redOnOdd    = ODD_DIGITS.has(red.digit);
    const yellowOnOdd = ODD_DIGITS.has(yellow.digit);

    const greenOnOdd  = ODD_DIGITS.has(green.digit);
    const blueOnOdd   = ODD_DIGITS.has(blue.digit);
    const redOnEven   = EVEN_DIGITS.has(red.digit);
    const yellowOnEven = EVEN_DIGITS.has(yellow.digit);

    const greenPctOk = green.pct >= 11;
    const bluePctOk  = blue.pct >= 11;

    const evenSignal = allOddBelow10  && greenOnEven && blueOnEven && redOnOdd   && yellowOnOdd   && greenPctOk && bluePctOk;
    const oddSignal  = allEvenBelow10 && greenOnOdd  && blueOnOdd  && redOnEven  && yellowOnEven  && greenPctOk && bluePctOk;

    const rawSignal: 'EVEN' | 'ODD' | 'NEUTRAL' = evenSignal ? 'EVEN' : oddSignal ? 'ODD' : 'NEUTRAL';

    const cond: ConditionStatus = {
        greenPass:     greenPctOk,
        bluePass:      bluePctOk,
        redPass:       rawSignal === 'EVEN' ? allOddBelow10  : rawSignal === 'ODD' ? allEvenBelow10 : false,
        yellowPass:    rawSignal === 'EVEN' ? allOddBelow10  : rawSignal === 'ODD' ? allEvenBelow10 : false,
        greenOnTarget: rawSignal === 'EVEN' ? greenOnEven    : rawSignal === 'ODD' ? greenOnOdd     : false,
        blueOnTarget:  rawSignal === 'EVEN' ? blueOnEven     : rawSignal === 'ODD' ? blueOnOdd      : false,
        redOnTarget:   rawSignal === 'EVEN' ? redOnOdd       : rawSignal === 'ODD' ? redOnEven      : false,
        yellowOnTarget:rawSignal === 'EVEN' ? yellowOnOdd    : rawSignal === 'ODD' ? yellowOnEven   : false,
    };

    return {
        rawSignal,
        green:  { digit: green.digit,  pct: green.pct  },
        blue:   { digit: blue.digit,   pct: blue.pct   },
        red:    { digit: red.digit,    pct: red.pct    },
        yellow: { digit: yellow.digit, pct: yellow.pct },
        tickCount: total,
        pcts,
        cond,
    };
}

function advanceConfirmation(
    prev: MarketState,
    analysis: MarketAnalysis
): Pick<MarketState, 'signalQueue' | 'confirmedSignal' | 'confirmStrength'> {
    const queue = [...prev.signalQueue, analysis.rawSignal].slice(-CONFIRM_WINDOW);
    const allSame = queue.length === CONFIRM_WINDOW && queue.every(s => s === analysis.rawSignal);
    const strength = queue.filter(s => s === analysis.rawSignal).length;

    let confirmedSignal: 'EVEN' | 'ODD' | 'NEUTRAL';
    if (analysis.rawSignal === 'NEUTRAL') {
        confirmedSignal = 'NEUTRAL';
    } else if (allSame) {
        confirmedSignal = analysis.rawSignal as 'EVEN' | 'ODD';
    } else if (analysis.rawSignal === prev.confirmedSignal) {
        confirmedSignal = prev.confirmedSignal;
    } else {
        confirmedSignal = 'NEUTRAL';
    }

    return { signalQueue: queue, confirmedSignal, confirmStrength: strength };
}

const getWsUrl = () => {
    try {
        return `wss://${getSocketURL()}/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    } catch {
        return `wss://ws.derivws.com/websockets/v3?app_id=${APP_IDS.LOCALHOST}`;
    }
};

const pctClass = (pass: boolean) => (pass ? 'dp-ai__pct--pass' : 'dp-ai__pct--fail');
const posClass = (ok: boolean)  => (ok  ? 'dp-ai__pos--pass' : 'dp-ai__pos--fail');

// ── Component ─────────────────────────────────────────────────────────────────
const DPToolsAI: React.FC = () => {
    const [tickCount, setTickCount] = useState(DEFAULT_TICKS);
    const [markets, setMarkets] = useState<MarketsMap>({});
    const [connected, setConnected] = useState(false);
    const [scanTime, setScanTime] = useState<Date | null>(null);
    const [filter, setFilter] = useState<'ALL' | 'EVEN' | 'ODD'>('ALL');

    // Dynamic market list — starts from fallback, updated by active_symbols API
    const [marketList, setMarketList] = useState<{ label: string; value: string }[]>(FALLBACK_MARKETS);
    const marketListRef = useRef<{ label: string; value: string }[]>(FALLBACK_MARKETS);

    // Notification state
    const [notifOn, setNotifOn] = useState<boolean>(() => {
        try { return localStorage.getItem(LS_NOTIF_ON) === 'true'; } catch { return false; }
    });
    const [selectedSnd, setSelectedSnd] = useState<SoundId>(() => {
        try {
            const v = localStorage.getItem(LS_NOTIF_SND) as SoundId | null;
            return v && SOUNDS.some(s => s.id === v) ? v : 'chime';
        } catch { return 'chime'; }
    });
    const [showSndPicker, setShowSndPicker] = useState(false);

    // Lock confirm volatility
    const [lockedSymbol, setLockedSymbol] = useState<string | null>(() => {
        try { return localStorage.getItem(LS_LOCKED_SYM) || null; } catch { return null; }
    });
    const lockedSymRef = useRef<string | null>(lockedSymbol);

    const wsRef         = useRef<WebSocket | null>(null);
    const reqMapRef     = useRef<Record<number, string>>({});
    const stateRef      = useRef<MarketsMap>({});
    const tickCountRef  = useRef(DEFAULT_TICKS);
    const prevSignalsRef = useRef<Record<string, 'EVEN' | 'ODD' | 'NEUTRAL'>>({});
    const notifOnRef    = useRef(notifOn);
    const selectedSndRef = useRef<SoundId>(selectedSnd);
    const notifCoolRef  = useRef<Record<string, number>>({});

    // Sync refs / localStorage
    useEffect(() => {
        notifOnRef.current = notifOn;
        try { localStorage.setItem(LS_NOTIF_ON, String(notifOn)); } catch {}
    }, [notifOn]);

    useEffect(() => {
        selectedSndRef.current = selectedSnd;
        try { localStorage.setItem(LS_NOTIF_SND, selectedSnd); } catch {}
    }, [selectedSnd]);

    useEffect(() => {
        lockedSymRef.current = lockedSymbol;
        try {
            if (lockedSymbol) localStorage.setItem(LS_LOCKED_SYM, lockedSymbol);
            else localStorage.removeItem(LS_LOCKED_SYM);
        } catch {}
    }, [lockedSymbol]);

    const initMarkets = useCallback((list: { label: string; value: string }[]) => {
        const init: MarketsMap = {};
        list.forEach(m => {
            init[m.value] = {
                ticks: [], pipSize: 2, lastPrice: '', ready: false,
                analysis: null, signalQueue: [], confirmedSignal: 'NEUTRAL', confirmStrength: 0,
            };
        });
        stateRef.current = init;
        prevSignalsRef.current = {};
        notifCoolRef.current  = {};
        setMarkets({ ...init });
    }, []);

    const updateMarket = useCallback((symbol: string, updater: (prev: MarketState) => MarketState) => {
        if (!stateRef.current[symbol]) return;
        const next = updater(stateRef.current[symbol]);
        stateRef.current[symbol] = next;

        const prev    = prevSignalsRef.current[symbol] ?? 'NEUTRAL';
        const current = next.confirmedSignal;
        const coolMs  = 30_000;
        const lastAt  = notifCoolRef.current[symbol] ?? 0;
        const coolOk  = Date.now() - lastAt > coolMs;

        // Danger sound: locked symbol just lost its confirmed signal
        if (
            lockedSymRef.current === symbol &&
            prev !== 'NEUTRAL' &&
            current === 'NEUTRAL'
        ) {
            playDanger();
        }

        // Regular notification: any market gains a confirmed signal
        if (notifOnRef.current && current !== 'NEUTRAL' && (current !== prev || coolOk) && current !== prev) {
            playSound(selectedSndRef.current);
            notifCoolRef.current[symbol] = Date.now();
        }

        prevSignalsRef.current[symbol] = current;
        setMarkets({ ...stateRef.current });
    }, []);

    const startScan = useCallback(
        (count: number, list?: { label: string; value: string }[]) => {
            if (wsRef.current) wsRef.current.close();
            const useList = list ?? marketListRef.current;
            initMarkets(useList);
            tickCountRef.current = count;
            setScanTime(null);

            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                reqMapRef.current = {};

                // Request active symbols — response dynamically updates the market list
                ws.send(JSON.stringify({
                    active_symbols: 'brief',
                    product_type: 'basic',
                    req_id: ACTIVE_SYMS_REQ_ID,
                }));

                // Start fetching history for the current list immediately
                useList.forEach((m, i) => {
                    const reqId = 100 + i;
                    reqMapRef.current[reqId] = m.value;
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                ticks_history: m.value,
                                count,
                                end: 'latest',
                                style: 'ticks',
                                req_id: reqId,
                            }));
                        }
                    }, i * 80);
                });
            };

            ws.onmessage = evt => {
                const msg = JSON.parse(evt.data);

                // ── Dynamic market discovery ───────────────────────────────────
                if (msg.msg_type === 'active_symbols' && Array.isArray(msg.active_symbols)) {
                    const discovered = buildMarketsFromActiveSyms(msg.active_symbols);
                    if (discovered.length > 0) {
                        // Find new symbols not already subscribed
                        const existing = new Set(Object.keys(stateRef.current));
                        const newOnes  = discovered.filter(m => !existing.has(m.value));

                        if (newOnes.length > 0) {
                            // Add new markets to state
                            const extra: MarketsMap = {};
                            newOnes.forEach(m => {
                                extra[m.value] = {
                                    ticks: [], pipSize: 2, lastPrice: '', ready: false,
                                    analysis: null, signalQueue: [], confirmedSignal: 'NEUTRAL', confirmStrength: 0,
                                };
                                stateRef.current[m.value] = extra[m.value];
                            });
                            setMarkets({ ...stateRef.current });

                            // Subscribe & fetch history for newly discovered markets
                            const baseIdx = marketListRef.current.length;
                            newOnes.forEach((m, i) => {
                                const reqId = 200 + baseIdx + i;
                                reqMapRef.current[reqId] = m.value;
                                setTimeout(() => {
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({
                                            ticks_history: m.value,
                                            count,
                                            end: 'latest',
                                            style: 'ticks',
                                            req_id: reqId,
                                        }));
                                    }
                                }, i * 80);
                            });
                        }

                        // Update the market list state
                        marketListRef.current = discovered;
                        setMarketList(discovered);
                    }
                    return;
                }

                if (msg.msg_type === 'history' && msg.history) {
                    const symbol = reqMapRef.current[msg.req_id];
                    if (!symbol) return;
                    const pipSize   = msg.pip_size != null ? Number(msg.pip_size) : 2;
                    const quotes: number[] = msg.history.prices || [];
                    const ticks    = quotes.map(q => extractDigit(q, pipSize));
                    const lastPrice = quotes.length > 0 ? Number(quotes[quotes.length - 1]).toFixed(pipSize) : '';
                    const analysis  = analyzeDigits(ticks);

                    updateMarket(symbol, prev => {
                        const conf = advanceConfirmation(prev, analysis);
                        return { ...prev, ticks, pipSize, lastPrice, ready: true, analysis, ...conf };
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
                    const digit   = extractDigit(quote, pipSize);
                    const maxLen  = tickCountRef.current;

                    updateMarket(symbol, prev => {
                        const newTicks = [...prev.ticks, digit];
                        if (newTicks.length > maxLen) newTicks.shift();
                        const analysis = analyzeDigits(newTicks);
                        const conf     = advanceConfirmation(prev, analysis);
                        return {
                            ...prev, pipSize,
                            lastPrice: Number(quote).toFixed(pipSize),
                            ticks: newTicks, ready: true, analysis, ...conf,
                        };
                    });
                    setScanTime(new Date());
                }
            };

            ws.onerror = () => setConnected(false);
            ws.onclose = () => setConnected(false);
        },
        [initMarkets, updateMarket]
    );

    useEffect(() => {
        startScan(tickCount);
        return () => { wsRef.current?.close(); };
    }, []);

    const handleRescan = () => startScan(tickCount);
    const handleTickCount = (n: number) => {
        setTickCount(n);
        tickCountRef.current = n;
        startScan(n);
    };

    const toggleNotif = () => {
        const next = !notifOn;
        setNotifOn(next);
        if (next) {
            setShowSndPicker(true);
            try { getAudioCtx(); } catch {}
        } else {
            setShowSndPicker(false);
        }
    };

    const handleSelectSound = (id: SoundId) => {
        setSelectedSnd(id);
        playSound(id);
    };

    const handleLockSymbol = (sym: string | null) => {
        setLockedSymbol(prev => (prev === sym ? null : sym));
    };

    const readyMarkets   = marketList.filter(m => markets[m.value]?.ready);
    const evenCount      = readyMarkets.filter(m => markets[m.value]?.confirmedSignal === 'EVEN').length;
    const oddCount       = readyMarkets.filter(m => markets[m.value]?.confirmedSignal === 'ODD').length;

    const displayMarkets = marketList.filter(m => {
        const sig = markets[m.value]?.confirmedSignal;
        if (filter === 'EVEN') return sig === 'EVEN';
        if (filter === 'ODD')  return sig === 'ODD';
        return true;
    });

    const lockedLabel = marketList.find(m => m.value === lockedSymbol)?.label ?? null;

    return (
        <div className='dp-ai'>
            <div className='dp-ai__header'>
                <div className='dp-ai__title-row'>
                    <span className={`dp-ai__dot ${connected ? 'dp-ai__dot--live' : 'dp-ai__dot--off'}`} />
                    <h2 className='dp-ai__title'>Even/Odd Signal — Volatility Scanner</h2>
                </div>
                <p className='dp-ai__subtitle'>
                    Scanning {marketList.length} markets (auto-detected) · confirmed after {CONFIRM_WINDOW} consecutive
                    matching evaluations · all opposite-type digits must be &lt;10%
                </p>
            </div>

            {/* Controls row */}
            <div className='dp-ai__controls'>
                <div className='dp-ai__tick-selector'>
                    <span className='dp-ai__ctrl-label'>Tick window:</span>
                    {TICK_SIZES.map(n => (
                        <button
                            key={n}
                            className={`dp-ai__tick-btn ${tickCount === n ? 'dp-ai__tick-btn--active' : ''}`}
                            onClick={() => handleTickCount(n)}
                        >
                            {n}
                        </button>
                    ))}
                </div>

                <button className='dp-ai__rescan-btn' onClick={handleRescan}>↻ Rescan</button>

                {/* Notification toggle */}
                <div className='dp-ai__notif-wrap'>
                    <button
                        className={`dp-ai__notif-btn ${notifOn ? 'dp-ai__notif-btn--on' : ''}`}
                        onClick={toggleNotif}
                        title={notifOn ? 'Turn off notifications' : 'Turn on notifications'}
                    >
                        {notifOn ? '🔔 Notifications ON' : '🔕 Notifications OFF'}
                    </button>

                    {notifOn && (
                        <button
                            className='dp-ai__notif-picker-btn'
                            onClick={() => setShowSndPicker(v => !v)}
                            title='Sound & lock settings'
                        >
                            {SOUNDS.find(s => s.id === selectedSnd)?.label ?? 'Sound'} ▾
                        </button>
                    )}

                    {showSndPicker && notifOn && (
                        <div className='dp-ai__sound-dropdown'>
                            {/* ── Signal sound ─────────────────────────────── */}
                            <div className='dp-ai__sound-title'>Signal sound (click to preview):</div>
                            {SOUNDS.map(s => (
                                <button
                                    key={s.id}
                                    className={`dp-ai__sound-opt ${selectedSnd === s.id ? 'dp-ai__sound-opt--active' : ''}`}
                                    onClick={() => handleSelectSound(s.id)}
                                >
                                    {s.label}
                                    {selectedSnd === s.id && <span className='dp-ai__sound-check'>✓</span>}
                                </button>
                            ))}

                            {/* ── Lock confirm volatility ───────────────────── */}
                            <div className='dp-ai__sound-title dp-ai__sound-title--danger' style={{ marginTop: 12 }}>
                                🔒 Lock confirm volatility (danger sound on exit):
                            </div>
                            <div className='dp-ai__lock-hint'>
                                {lockedLabel
                                    ? <>Locked: <strong style={{ color: '#f85149' }}>{lockedLabel}</strong> — danger sound fires when its confirmed signal exits.</>
                                    : 'None locked. Select a volatility below to lock it.'
                                }
                            </div>

                            <div className='dp-ai__lock-grid'>
                                <button
                                    className={`dp-ai__lock-opt ${lockedSymbol === null ? 'dp-ai__lock-opt--none' : ''}`}
                                    onClick={() => handleLockSymbol(null)}
                                >
                                    None
                                </button>
                                {marketList.map(m => (
                                    <button
                                        key={m.value}
                                        className={`dp-ai__lock-opt ${lockedSymbol === m.value ? 'dp-ai__lock-opt--active' : ''}`}
                                        onClick={() => handleLockSymbol(m.value)}
                                        title={`Lock ${m.label} — danger sound fires when confirmed signal exits`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                className='dp-ai__sound-opt dp-ai__sound-opt--preview-danger'
                                onClick={playDanger}
                                style={{ marginTop: 6 }}
                            >
                                🔴 Preview danger sound
                            </button>

                            <button className='dp-ai__sound-close' onClick={() => setShowSndPicker(false)}>
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Summary */}
            <div className='dp-ai__summary'>
                <div className='dp-ai__summary-item dp-ai__summary-item--scanned'>
                    <span className='dp-ai__summary-val'>{readyMarkets.length}/{marketList.length}</span>
                    <span className='dp-ai__summary-lbl'>Scanned</span>
                </div>
                <div className='dp-ai__summary-item dp-ai__summary-item--even'>
                    <span className='dp-ai__summary-val'>{evenCount}</span>
                    <span className='dp-ai__summary-lbl'>EVEN confirmed</span>
                </div>
                <div className='dp-ai__summary-item dp-ai__summary-item--odd'>
                    <span className='dp-ai__summary-val'>{oddCount}</span>
                    <span className='dp-ai__summary-lbl'>ODD confirmed</span>
                </div>
                <div className='dp-ai__summary-item'>
                    <span className='dp-ai__summary-val'>{readyMarkets.length - evenCount - oddCount}</span>
                    <span className='dp-ai__summary-lbl'>Neutral</span>
                </div>
                {lockedLabel && (
                    <div className='dp-ai__summary-item dp-ai__summary-item--locked'>
                        <span className='dp-ai__summary-val'>🔒</span>
                        <span className='dp-ai__summary-lbl'>{lockedLabel}</span>
                    </div>
                )}
                {scanTime && <div className='dp-ai__summary-time'>Updated {scanTime.toLocaleTimeString()}</div>}
            </div>

            {/* Filter */}
            <div className='dp-ai__filter-row'>
                {(['ALL', 'EVEN', 'ODD'] as const).map(f => (
                    <button
                        key={f}
                        className={`dp-ai__filter-btn dp-ai__filter-btn--${f.toLowerCase()} ${filter === f ? 'dp-ai__filter-btn--active' : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Market cards — scrollable */}
            <div className='dp-ai__grid-scroll'>
                <div className='dp-ai__grid'>
                    {displayMarkets.map(m => {
                        const state     = markets[m.value];
                        const an        = state?.analysis;
                        const ready     = state?.ready;
                        const confirmed = state?.confirmedSignal ?? 'NEUTRAL';
                        const strength  = state?.confirmStrength ?? 0;
                        const rawSig    = an?.rawSignal ?? 'NEUTRAL';
                        const isLocked  = lockedSymbol === m.value;

                        return (
                            <div
                                key={m.value}
                                className={`dp-ai__card dp-ai__card--${confirmed.toLowerCase()} ${isLocked ? 'dp-ai__card--locked' : ''}`}
                            >
                                <div className='dp-ai__card-header'>
                                    <span className='dp-ai__card-label'>
                                        {isLocked && <span className='dp-ai__lock-icon'>🔒 </span>}
                                        {m.label}
                                    </span>
                                    {ready && an ? (
                                        <span className={`dp-ai__badge dp-ai__badge--${confirmed.toLowerCase()}`}>
                                            {confirmed}
                                        </span>
                                    ) : (
                                        <span className='dp-ai__badge dp-ai__badge--loading'>…</span>
                                    )}
                                </div>

                                {ready && an ? (
                                    <>
                                        {/* Confirmation dots */}
                                        <div className='dp-ai__confirm-row'>
                                            <div className='dp-ai__confirm-dots'>
                                                {Array.from({ length: CONFIRM_WINDOW }).map((_, i) => (
                                                    <span
                                                        key={i}
                                                        className={`dp-ai__confirm-dot ${i < strength ? `dp-ai__confirm-dot--${rawSig.toLowerCase()}` : ''}`}
                                                    />
                                                ))}
                                            </div>
                                            <span className='dp-ai__confirm-label'>
                                                {confirmed !== rawSig && rawSig !== 'NEUTRAL'
                                                    ? `building ${rawSig} (${strength}/${CONFIRM_WINDOW})`
                                                    : strength === CONFIRM_WINDOW
                                                      ? `confirmed ${confirmed}`
                                                      : `${strength}/${CONFIRM_WINDOW} ticks`}
                                            </span>
                                        </div>

                                        {/* Color bars */}
                                        <div className='dp-ai__bars'>
                                            {(
                                                [
                                                    { key: 'green',  bar: an.green,  passKey: 'greenPass',  posKey: 'greenOnTarget'  },
                                                    { key: 'blue',   bar: an.blue,   passKey: 'bluePass',   posKey: 'blueOnTarget'   },
                                                    { key: 'yellow', bar: an.yellow, passKey: 'yellowPass', posKey: 'yellowOnTarget' },
                                                    { key: 'red',    bar: an.red,    passKey: 'redPass',    posKey: 'redOnTarget'    },
                                                ] as const
                                            ).map(({ key, bar, passKey, posKey }) => (
                                                <div key={key} className={`dp-ai__bar-row dp-ai__bar-row--${key}`}>
                                                    <span className='dp-ai__bar-label'>{key.toUpperCase()}</span>
                                                    <span className='dp-ai__bar-digit'>{bar.digit}</span>
                                                    <div className='dp-ai__bar-track'>
                                                        <div
                                                            className={`dp-ai__bar-fill dp-ai__bar-fill--${key}`}
                                                            style={{ width: `${Math.min(bar.pct * 4, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className={`dp-ai__bar-pct ${pctClass(an.cond[passKey])}`}>
                                                        {bar.pct.toFixed(1)}%
                                                    </span>
                                                    <span
                                                        className={`dp-ai__bar-type ${posClass(an.cond[posKey])} ${ODD_DIGITS.has(bar.digit) ? 'dp-ai__bar-type--odd' : 'dp-ai__bar-type--even'}`}
                                                    >
                                                        {ODD_DIGITS.has(bar.digit) ? 'ODD' : 'EVEN'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* All-digit % row */}
                                        <div className='dp-ai__digit-row'>
                                            {an.pcts.map((p, d) => {
                                                const isOdd  = ODD_DIGITS.has(d);
                                                const isEven = EVEN_DIGITS.has(d);
                                                const bad =
                                                    (confirmed === 'EVEN' && isOdd  && p >= 10) ||
                                                    (confirmed === 'ODD'  && isEven && p >= 10);
                                                const isG = d === an.green.digit;
                                                const isB = d === an.blue.digit;
                                                const isR = d === an.red.digit;
                                                const isY = d === an.yellow.digit;
                                                return (
                                                    <div
                                                        key={d}
                                                        className={`dp-ai__dg
                                                            ${bad ? 'dp-ai__dg--bad' : ''}
                                                            ${isG ? 'dp-ai__dg--g' : isB ? 'dp-ai__dg--b' : isR ? 'dp-ai__dg--r' : isY ? 'dp-ai__dg--y' : ''}
                                                        `}
                                                    >
                                                        <span className='dp-ai__dg-num'>{d}</span>
                                                        <span className='dp-ai__dg-pct'>{p.toFixed(1)}</span>
                                                        {bad && <span className='dp-ai__dg-warn'>!</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className='dp-ai__card-footer'>
                                            <span className='dp-ai__card-ticks'>{an.tickCount} ticks</span>
                                            <span className='dp-ai__card-price'>{state.lastPrice}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className='dp-ai__card-loading'>
                                        <div className='dp-ai__spinner' />
                                        <span>Loading {m.label}…</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend */}
            <div className='dp-ai__legend'>
                <h4>Signal Conditions (Strict)</h4>
                <div className='dp-ai__legend-grid'>
                    <div className='dp-ai__legend-block dp-ai__legend-block--even'>
                        <strong>EVEN Signal</strong>
                        <ul>
                            <li><span className='dp-ai__chip dp-ai__chip--green'>GREEN</span> must be on EVEN digit &amp; ≥ 11%</li>
                            <li><span className='dp-ai__chip dp-ai__chip--blue'>BLUE</span> must be on EVEN digit &amp; ≥ 11%</li>
                            <li><span className='dp-ai__chip dp-ai__chip--red'>RED</span> must be on ODD digit</li>
                            <li><span className='dp-ai__chip dp-ai__chip--yellow'>YELLOW</span> must be on ODD digit</li>
                            <li className='dp-ai__legend-strict'>ALL odd digits (1,3,5,7,9) must be &lt; 10%</li>
                        </ul>
                    </div>
                    <div className='dp-ai__legend-block dp-ai__legend-block--odd'>
                        <strong>ODD Signal</strong>
                        <ul>
                            <li><span className='dp-ai__chip dp-ai__chip--green'>GREEN</span> must be on ODD digit &amp; ≥ 11%</li>
                            <li><span className='dp-ai__chip dp-ai__chip--blue'>BLUE</span> must be on ODD digit &amp; ≥ 11%</li>
                            <li><span className='dp-ai__chip dp-ai__chip--red'>RED</span> must be on EVEN digit</li>
                            <li><span className='dp-ai__chip dp-ai__chip--yellow'>YELLOW</span> must be on EVEN digit</li>
                            <li className='dp-ai__legend-strict'>ALL even digits (0,2,4,6,8) must be &lt; 10%</li>
                        </ul>
                    </div>
                </div>
                <p className='dp-ai__legend-note'>
                    Digit row matches Dcircles. <span style={{ color: '#f85149' }}>Red border</span> = digit is breaking
                    the strict rule. Signal fires only when all 7 conditions pass simultaneously for {CONFIRM_WINDOW}{' '}
                    consecutive ticks.
                </p>
            </div>
        </div>
    );
};

export default DPToolsAI;
