import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APP_IDS, getSocketURL } from '@/components/shared/utils/config/config';
import './dp-tools-ai.scss';
import './matches-signal.scss';

// ── Market discovery ───────────────────────────────────────────────────────────
const IS_VOL_SYM = /^(1HZ\d+V|R_\d+|JD\d+)$/;
const ACTIVE_SYMS_REQ_ID = 998;

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
            const rank = (v: string) => (v.startsWith('1HZ') ? 0 : v.startsWith('R_') ? 1 : 2);
            const r = rank(a.value) - rank(b.value);
            if (r !== 0) return r;
            const num = (v: string) => parseInt(v.replace(/\D/g, ''), 10);
            return num(a.value) - num(b.value);
        });
}

// ── Constants ──────────────────────────────────────────────────────────────────
const CONFIRM_WINDOW   = 5;
const TICK_SIZES       = [100, 200, 500, 1000];
const DEFAULT_TICKS    = 1000;
const MATCH_THRESHOLD  = 0.3;
const BLUE_ISOLATION   = 0.6; // every other digit must be >0.6% away from blue

const LS_NOTIF_ON   = 'ms_notif_on';
const LS_NOTIF_SND  = 'ms_notif_snd';
const LS_LOCKED_SYM = 'ms_locked_sym';
const LS_DANGER_SND = 'ms_danger_snd';

// ── Sound definitions (identical to dp-tools-ai) ───────────────────────────────
type SoundId = 'chime' | 'alert' | 'bell' | 'ping' | 'trade' | 'crystal';

const SOUNDS: { id: SoundId; label: string }[] = [
    { id: 'chime',   label: '🎵 Chime (ascending notes)' },
    { id: 'alert',   label: '🔔 Alert (double beep)' },
    { id: 'bell',    label: '🔕 Bell (resonant)' },
    { id: 'ping',    label: '📍 Ping (short)' },
    { id: 'trade',   label: '📈 Trade (signal fanfare)' },
    { id: 'crystal', label: '💎 Crystal (soft ding)' },
];

type DangerSoundId = 'prison' | 'firesiren' | 'police' | 'emergency' | 'screech';

const DANGER_SOUNDS: { id: DangerSoundId; label: string }[] = [
    { id: 'prison',    label: '🔒 Prison Gate Clang' },
    { id: 'firesiren', label: '🚒 Fire Siren' },
    { id: 'police',    label: '🚔 Police Two-Tone' },
    { id: 'emergency', label: '🚨 Emergency Alarm' },
    { id: 'screech',   label: '💀 Critical Screech' },
];

function getAudioCtx(): AudioContext {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
}

function playChime() {
    const ctx = getAudioCtx();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t); osc.stop(t + 0.55);
    });
}
function playAlert() {
    const ctx = getAudioCtx();
    [0, 0.22].forEach(offset => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.value = 880;
        const t = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.2);
    });
}
function playBell() {
    const ctx = getAudioCtx();
    [1318.5, 1567.98, 2093].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25 / (i + 1), t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        osc.start(t); osc.stop(t + 1.3);
    });
}
function playPing() {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 1480;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(); osc.stop(ctx.currentTime + 0.45);
}
function playTrade() {
    const ctx = getAudioCtx();
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i, seq) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = i < 4 ? 'triangle' : 'sine'; osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.09;
        const vol = i === seq.length - 1 ? 0.45 : 0.28;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + (i === seq.length - 1 ? 0.7 : 0.25));
        osc.start(t); osc.stop(t + 0.8);
    });
}
function playCrystal() {
    const ctx = getAudioCtx();
    [1046.5, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        osc.start(t); osc.stop(t + 1.0);
    });
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
    } catch (e) { console.warn('Sound playback failed:', e); }
}

function playDangerPrison() {
    const ctx = getAudioCtx();
    [55, 110, 165, 220, 330].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        const vol = i === 0 ? 0.55 : 0.3 / i;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 2.0);
    });
    [1200, 1800].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6 + i * 0.2);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8 + i * 0.2);
    });
}
function playDangerFireSiren() {
    const ctx = getAudioCtx();
    for (let cycle = 0; cycle < 3; cycle++) {
        const base = ctx.currentTime + cycle * 0.55;
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, base);
        osc.frequency.linearRampToValueAtTime(1200, base + 0.22);
        osc.frequency.linearRampToValueAtTime(600, base + 0.44);
        gain.gain.setValueAtTime(0, base);
        gain.gain.linearRampToValueAtTime(0.45, base + 0.05);
        gain.gain.setValueAtTime(0.45, base + 0.42);
        gain.gain.exponentialRampToValueAtTime(0.001, base + 0.54);
        osc.start(base); osc.stop(base + 0.56);
    }
}
function playDangerPolice() {
    const ctx = getAudioCtx();
    [960, 700, 960, 700, 960, 700].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.22;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.38, t + 0.03);
        gain.gain.setValueAtTime(0.38, t + 0.19);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t); osc.stop(t + 0.23);
    });
}
function playDangerEmergency() {
    const ctx = getAudioCtx();
    for (let i = 0; i < 8; i++) {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.value = i % 2 === 0 ? 1400 : 1000;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t); osc.stop(t + 0.11);
    }
}
function playDangerScreech() {
    const ctx = getAudioCtx();
    const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
    osc1.connect(gain1); gain1.connect(ctx.destination);
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(200, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.5);
    gain1.gain.setValueAtTime(0, ctx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain1.gain.setValueAtTime(0.5, ctx.currentTime + 0.45);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.6);
    const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(300, ctx.currentTime + 0.65);
    osc2.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 1.1);
    gain2.gain.setValueAtTime(0, ctx.currentTime + 0.65);
    gain2.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 0.7);
    gain2.gain.setValueAtTime(0.55, ctx.currentTime + 1.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.15);
    osc2.start(ctx.currentTime + 0.65); osc2.stop(ctx.currentTime + 1.2);
}
function playDangerById(id: DangerSoundId) {
    try {
        switch (id) {
            case 'prison':    return playDangerPrison();
            case 'firesiren': return playDangerFireSiren();
            case 'police':    return playDangerPolice();
            case 'emergency': return playDangerEmergency();
            case 'screech':   return playDangerScreech();
        }
    } catch (e) { console.warn('Danger sound failed:', e); }
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ColorBar { digit: number; pct: number; }

interface MSAnalysis {
    rawSignal: 'MATCH' | 'NEUTRAL';
    green: ColorBar;
    blue: ColorBar;
    red: ColorBar;
    yellow: ColorBar;
    diff: number;
    tickCount: number;
    pcts: number[];
}

interface MSMarketState {
    ticks: number[];
    pipSize: number;
    lastPrice: string;
    ready: boolean;
    analysis: MSAnalysis | null;
    signalQueue: string[];
    confirmedSignal: 'MATCH' | 'NEUTRAL';
    confirmStrength: number;
}

type MSMarketsMap = Record<string, MSMarketState>;

// ── Analysis ───────────────────────────────────────────────────────────────────
const extractDigit = (quote: number | string, pipSize = 2): number => {
    const s = Number(quote).toFixed(pipSize);
    return parseInt(s[s.length - 1], 10);
};

function analyzeDigitsMS(ticks: number[]): MSAnalysis {
    const total = ticks.length;
    const counts = Array(10).fill(0);
    ticks.forEach(d => counts[d]++);
    const pcts = counts.map(c => (total > 0 ? (c / total) * 100 : 0));

    const sorted = pcts
        .map((p, d) => ({ digit: d, count: counts[d], pct: p }))
        .sort((a, b) => a.count - b.count);

    const red    = sorted[0];
    const yellow = sorted[1];
    const green  = sorted[9];
    const blue   = sorted[8];

    const diff = Math.abs(green.pct - blue.pct);

    // Every digit except blue and green must be more than BLUE_ISOLATION% away from blue.
    // This ensures blue is isolated — no nearby competitor that could easily overtake it.
    const blueIsolated = pcts.every((p, d) => {
        if (d === blue.digit || d === green.digit) return true;
        return Math.abs(p - blue.pct) > BLUE_ISOLATION;
    });

    const rawSignal: 'MATCH' | 'NEUTRAL' = diff <= MATCH_THRESHOLD && blueIsolated ? 'MATCH' : 'NEUTRAL';

    return {
        rawSignal,
        green:  { digit: green.digit,  pct: green.pct  },
        blue:   { digit: blue.digit,   pct: blue.pct   },
        red:    { digit: red.digit,    pct: red.pct    },
        yellow: { digit: yellow.digit, pct: yellow.pct },
        diff,
        tickCount: total,
        pcts,
    };
}

function advanceConfirmationMS(
    prev: MSMarketState,
    analysis: MSAnalysis
): Pick<MSMarketState, 'signalQueue' | 'confirmedSignal' | 'confirmStrength'> {
    const queue = [...prev.signalQueue, analysis.rawSignal].slice(-CONFIRM_WINDOW);
    const allMatch = queue.length === CONFIRM_WINDOW && queue.every(s => s === 'MATCH');
    const strength = queue.filter(s => s === analysis.rawSignal).length;

    let confirmedSignal: 'MATCH' | 'NEUTRAL';
    if (analysis.rawSignal === 'NEUTRAL') {
        confirmedSignal = 'NEUTRAL';
    } else if (allMatch) {
        confirmedSignal = 'MATCH';
    } else if (prev.confirmedSignal === 'MATCH' && analysis.rawSignal === 'MATCH') {
        confirmedSignal = 'MATCH';
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

// ── Component ──────────────────────────────────────────────────────────────────
const MatchesSignal: React.FC = () => {
    const [tickCount,  setTickCount]  = useState(DEFAULT_TICKS);
    const [markets,    setMarkets]    = useState<MSMarketsMap>({});
    const [connected,  setConnected]  = useState(false);
    const [scanTime,   setScanTime]   = useState<Date | null>(null);
    const [marketList, setMarketList] = useState(FALLBACK_MARKETS);
    const marketListRef = useRef(FALLBACK_MARKETS);

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

    const [lockedSymbol, setLockedSymbol] = useState<string | null>(() => {
        try { return localStorage.getItem(LS_LOCKED_SYM) || null; } catch { return null; }
    });
    const lockedSymRef = useRef<string | null>(lockedSymbol);

    const [dangerSoundId, setDangerSoundId] = useState<DangerSoundId>(() => {
        try {
            const v = localStorage.getItem(LS_DANGER_SND) as DangerSoundId | null;
            return v && DANGER_SOUNDS.some(s => s.id === v) ? v : 'prison';
        } catch { return 'prison'; }
    });
    const dangerSndRef    = useRef<DangerSoundId>(dangerSoundId);
    const autoUnlockRef   = useRef<() => void>(() => {});
    const wsRef           = useRef<WebSocket | null>(null);
    const reqMapRef       = useRef<Record<number, string>>({});
    const stateRef        = useRef<MSMarketsMap>({});
    const tickCountRef    = useRef(DEFAULT_TICKS);
    const prevSignalsRef  = useRef<Record<string, 'MATCH' | 'NEUTRAL'>>({});
    const intentionalRef  = useRef(false);
    const mountedRef      = useRef(true);
    const notifOnRef      = useRef(notifOn);
    const selectedSndRef  = useRef<SoundId>(selectedSnd);
    const notifCoolRef    = useRef<Record<string, number>>({});

    useEffect(() => { notifOnRef.current = notifOn; try { localStorage.setItem(LS_NOTIF_ON, String(notifOn)); } catch {} }, [notifOn]);
    useEffect(() => { selectedSndRef.current = selectedSnd; try { localStorage.setItem(LS_NOTIF_SND, selectedSnd); } catch {} }, [selectedSnd]);
    useEffect(() => {
        lockedSymRef.current = lockedSymbol;
        try {
            if (lockedSymbol) localStorage.setItem(LS_LOCKED_SYM, lockedSymbol);
            else localStorage.removeItem(LS_LOCKED_SYM);
        } catch {}
    }, [lockedSymbol]);
    useEffect(() => { dangerSndRef.current = dangerSoundId; try { localStorage.setItem(LS_DANGER_SND, dangerSoundId); } catch {} }, [dangerSoundId]);
    useEffect(() => {
        autoUnlockRef.current = () => {
            lockedSymRef.current = null;
            setLockedSymbol(null);
            try { localStorage.removeItem(LS_LOCKED_SYM); } catch {}
        };
    });

    const initMarkets = useCallback((list: { label: string; value: string }[]) => {
        const init: MSMarketsMap = {};
        list.forEach(m => {
            init[m.value] = {
                ticks: [], pipSize: 2, lastPrice: '', ready: false,
                analysis: null, signalQueue: [], confirmedSignal: 'NEUTRAL', confirmStrength: 0,
            };
        });
        stateRef.current = init;
        prevSignalsRef.current = {};
        notifCoolRef.current   = {};
        setMarkets({ ...init });
    }, []);

    const renderScheduledRef = useRef(false);
    const scheduleRender = useCallback(() => {
        if (renderScheduledRef.current) return;
        renderScheduledRef.current = true;
        requestAnimationFrame(() => {
            renderScheduledRef.current = false;
            setMarkets({ ...stateRef.current });
        });
    }, []);

    const updateMarket = useCallback((symbol: string, updater: (prev: MSMarketState) => MSMarketState) => {
        if (!stateRef.current[symbol]) return;
        const next = updater(stateRef.current[symbol]);
        stateRef.current[symbol] = next;

        const prev    = prevSignalsRef.current[symbol] ?? 'NEUTRAL';
        const current = next.confirmedSignal;
        const coolMs  = 30_000;
        const coolOk  = Date.now() - (notifCoolRef.current[symbol] ?? 0) > coolMs;

        // Danger sound + auto-unlock: locked symbol lost its confirmed signal.
        // Also silently clears stale locks restored from localStorage after a page
        // reload (prev is 'NEUTRAL' by default on mount, so no danger sound then).
        if (lockedSymRef.current === symbol && current === 'NEUTRAL' && next.ready) {
            if (prev === 'MATCH') {
                playDangerById(dangerSndRef.current);
            }
            autoUnlockRef.current();
        }

        if (notifOnRef.current && current === 'MATCH' && (current !== prev || coolOk) && current !== prev) {
            playSound(selectedSndRef.current);
            notifCoolRef.current[symbol] = Date.now();
        }

        prevSignalsRef.current[symbol] = current;
        scheduleRender();
    }, [scheduleRender]);

    const startScan = useCallback(
        (count: number, list?: { label: string; value: string }[]) => {
            intentionalRef.current = true;
            if (wsRef.current) wsRef.current.close();
            const useList = list ?? marketListRef.current;
            initMarkets(useList);
            tickCountRef.current = count;
            setScanTime(null);

            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                intentionalRef.current = false;
                setConnected(true);
                reqMapRef.current = {};
                ws.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic', req_id: ACTIVE_SYMS_REQ_ID }));
                useList.forEach((m, i) => {
                    const reqId = 300 + i;
                    reqMapRef.current[reqId] = m.value;
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ ticks_history: m.value, count, end: 'latest', style: 'ticks', req_id: reqId }));
                        }
                    }, i * 80);
                });
            };

            ws.onmessage = evt => {
                const msg = JSON.parse(evt.data);

                if (msg.msg_type === 'active_symbols' && Array.isArray(msg.active_symbols)) {
                    const discovered = buildMarketsFromActiveSyms(msg.active_symbols);
                    if (discovered.length > 0) {
                        const existing = new Set(Object.keys(stateRef.current));
                        const newOnes  = discovered.filter(m => !existing.has(m.value));
                        if (newOnes.length > 0) {
                            newOnes.forEach(m => {
                                stateRef.current[m.value] = {
                                    ticks: [], pipSize: 2, lastPrice: '', ready: false,
                                    analysis: null, signalQueue: [], confirmedSignal: 'NEUTRAL', confirmStrength: 0,
                                };
                            });
                            setMarkets({ ...stateRef.current });
                            const baseIdx = marketListRef.current.length;
                            newOnes.forEach((m, i) => {
                                const reqId = 400 + baseIdx + i;
                                reqMapRef.current[reqId] = m.value;
                                setTimeout(() => {
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({ ticks_history: m.value, count, end: 'latest', style: 'ticks', req_id: reqId }));
                                    }
                                }, i * 80);
                            });
                        }
                        const seen = new Set<string>();
                        const merged: { label: string; value: string }[] = [];
                        [...discovered, ...FALLBACK_MARKETS].forEach(m => {
                            if (!seen.has(m.value)) { seen.add(m.value); merged.push(m); }
                        });
                        marketListRef.current = merged;
                        setMarketList(merged);
                    }
                    return;
                }

                if (msg.msg_type === 'history' && msg.history) {
                    const symbol = reqMapRef.current[msg.req_id];
                    if (!symbol) return;
                    const pipSize   = msg.pip_size != null ? Number(msg.pip_size) : 2;
                    const quotes: number[] = msg.history.prices || [];
                    const ticks     = quotes.map(q => extractDigit(q, pipSize));
                    const lastPrice = quotes.length > 0 ? Number(quotes[quotes.length - 1]).toFixed(pipSize) : '';
                    const analysis  = analyzeDigitsMS(ticks);
                    updateMarket(symbol, prev => {
                        const conf = advanceConfirmationMS(prev, analysis);
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
                        const analysis = analyzeDigitsMS(newTicks);
                        const conf     = advanceConfirmationMS(prev, analysis);
                        return { ...prev, pipSize, lastPrice: Number(quote).toFixed(pipSize), ticks: newTicks, ready: true, analysis, ...conf };
                    });
                    setScanTime(new Date());
                }
            };

            ws.onerror = () => setConnected(false);
            ws.onclose = () => {
                setConnected(false);
                if (intentionalRef.current || !mountedRef.current) return;
                // Unexpected network drop — reconnect after 3 s
                setTimeout(() => {
                    if (!mountedRef.current) return;
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
            intentionalRef.current = true;
            wsRef.current?.close();
        };
    }, []);

    const handleRescan     = () => startScan(tickCount);
    const handleTickCount  = (n: number) => { setTickCount(n); tickCountRef.current = n; startScan(n); };
    const toggleNotif      = () => {
        const next = !notifOn; setNotifOn(next);
        if (next) { setShowSndPicker(true); try { getAudioCtx(); } catch {} } else { setShowSndPicker(false); }
    };
    const handleSelectSound = (id: SoundId) => { setSelectedSnd(id); playSound(id); };
    const handleLockSymbol  = (sym: string | null) => setLockedSymbol(prev => (prev === sym ? null : sym));
    const handleDangerSound = (id: DangerSoundId) => { setDangerSoundId(id); playDangerById(id); };

    const [filter, setFilter] = useState<'ALL' | 'MATCH'>('ALL');

    const readyMarkets   = marketList.filter(m => markets[m.value]?.ready);
    const matchCount     = readyMarkets.filter(m => markets[m.value]?.confirmedSignal === 'MATCH').length;
    const lockedLabel    = marketList.find(m => m.value === lockedSymbol)?.label ?? null;
    const displayMarkets = marketList.filter(m => {
        if (filter === 'MATCH') return markets[m.value]?.confirmedSignal === 'MATCH';
        return true;
    });

    return (
        <div className='dp-ai ms-ai'>
            <div className='dp-ai__header'>
                <div className='dp-ai__title-row'>
                    <span className={`dp-ai__dot ${connected ? 'dp-ai__dot--live' : 'dp-ai__dot--off'}`} />
                    <h2 className='dp-ai__title'>Matches Signal — Volatility Scanner</h2>
                </div>
                <p className='dp-ai__subtitle'>
                    Scanning {marketList.length} markets · signal confirmed when |GREEN% − BLUE%| ≤ {MATCH_THRESHOLD}% · confirmed after {CONFIRM_WINDOW} consecutive matches · Predict = BLUE digit · Entry = GREEN digit
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

                            <div className='dp-ai__sound-title dp-ai__sound-title--danger' style={{ marginTop: 12 }}>
                                🔴 Danger sound — when locked volatility exits signal (click to preview):
                            </div>
                            {DANGER_SOUNDS.map(s => (
                                <button
                                    key={s.id}
                                    className={`dp-ai__sound-opt dp-ai__sound-opt--danger ${dangerSoundId === s.id ? 'dp-ai__sound-opt--active' : ''}`}
                                    onClick={() => handleDangerSound(s.id)}
                                >
                                    {s.label}
                                    {dangerSoundId === s.id && <span className='dp-ai__sound-check'>✓</span>}
                                </button>
                            ))}

                            {lockedLabel && (
                                <div className='dp-ai__lock-hint' style={{ marginTop: 8 }}>
                                    🔒 Locked: <strong style={{ color: '#f85149' }}>{lockedLabel}</strong>
                                    <button className='dp-ai__lock-clear-btn' onClick={() => handleLockSymbol(null)}>
                                        Unlock
                                    </button>
                                </div>
                            )}

                            <button className='dp-ai__sound-close' onClick={() => setShowSndPicker(false)}>Close</button>
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
                <div className='dp-ai__summary-item ms-ai__summary-item--match'>
                    <span className='dp-ai__summary-val ms-ai__summary-val--match'>{matchCount}</span>
                    <span className='dp-ai__summary-lbl'>MATCH confirmed</span>
                </div>
                <div className='dp-ai__summary-item'>
                    <span className='dp-ai__summary-val'>{readyMarkets.length - matchCount}</span>
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

            {/* Filter bar */}
            <div className='ms-ai__filter-row'>
                <button
                    className={`ms-ai__filter-btn ${filter === 'ALL' ? 'ms-ai__filter-btn--active-all' : ''}`}
                    onClick={() => setFilter('ALL')}
                >
                    All Markets
                </button>
                <button
                    className={`ms-ai__filter-btn ms-ai__filter-btn--match-only ${filter === 'MATCH' ? 'ms-ai__filter-btn--active-match' : ''}`}
                    onClick={() => setFilter('MATCH')}
                >
                    ✓ MATCH Only {matchCount > 0 && <span className='ms-ai__filter-count'>{matchCount}</span>}
                </button>
            </div>

            {/* Market cards */}
            <div className='dp-ai__grid-scroll'>
                <div className='dp-ai__grid'>
                    {displayMarkets.length === 0 && filter === 'MATCH' && (
                        <div className='ms-ai__empty-state'>
                            No confirmed MATCH signals yet — scanning…
                        </div>
                    )}
                    {displayMarkets.map(m => {
                        const state     = markets[m.value];
                        const an        = state?.analysis;
                        const ready     = state?.ready;
                        const confirmed = state?.confirmedSignal ?? 'NEUTRAL';
                        const strength  = state?.confirmStrength ?? 0;
                        const rawSig    = an?.rawSignal ?? 'NEUTRAL';
                        const isLocked  = lockedSymbol === m.value;
                        const diff      = an?.diff ?? null;

                        return (
                            <div
                                key={m.value}
                                className={`ms-ai__card ms-ai__card--${confirmed.toLowerCase()} ${isLocked ? 'dp-ai__card--locked' : ''}`}
                            >
                                <div className='dp-ai__card-header'>
                                    <span className='dp-ai__card-label'>{m.label}</span>
                                    <div className='dp-ai__card-header-right'>
                                        {ready && an ? (
                                            <span className={`dp-ai__badge ms-ai__badge--${confirmed.toLowerCase()}`}>
                                                {confirmed === 'MATCH' ? '✓ MATCH' : 'NEUTRAL'}
                                            </span>
                                        ) : (
                                            <span className='dp-ai__badge dp-ai__badge--loading'>…</span>
                                        )}
                                        {confirmed === 'MATCH' && ready && (
                                            <button
                                                className={`dp-ai__card-lock-btn ${isLocked ? 'dp-ai__card-lock-btn--active' : ''}`}
                                                onClick={() => handleLockSymbol(m.value)}
                                                title={isLocked ? `Unlock ${m.label}` : `Lock ${m.label} — danger sound fires when diff exceeds ${MATCH_THRESHOLD}%`}
                                            >
                                                {isLocked ? '🔒' : '🔓'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {ready && an ? (
                                    <>
                                        {/* Signal Confirmed banner + Predict/Entry */}
                                        {confirmed === 'MATCH' && (
                                            <>
                                                <div className='ms-ai__confirmed-banner'>
                                                    ✅ Signal Confirmed
                                                </div>
                                                <div className='ms-ai__predict-row'>
                                                    <div className='ms-ai__predict-cell ms-ai__predict-cell--predict'>
                                                        <span className='ms-ai__predict-lbl'>Predict</span>
                                                        <span className='ms-ai__predict-digit'>{an.blue.digit}</span>
                                                    </div>
                                                    <div className='ms-ai__predict-divider' />
                                                    <div className='ms-ai__predict-cell ms-ai__predict-cell--entry'>
                                                        <span className='ms-ai__predict-lbl'>Entry</span>
                                                        <span className='ms-ai__predict-digit'>{an.green.digit}</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* Confirmation dots */}
                                        <div className='dp-ai__confirm-row'>
                                            <div className='dp-ai__confirm-dots'>
                                                {Array.from({ length: CONFIRM_WINDOW }).map((_, i) => (
                                                    <span
                                                        key={i}
                                                        className={`dp-ai__confirm-dot ${i < strength ? 'ms-ai__confirm-dot--match' : ''}`}
                                                    />
                                                ))}
                                            </div>
                                            <span className='dp-ai__confirm-label'>
                                                {confirmed !== rawSig && rawSig === 'MATCH'
                                                    ? `building MATCH (${strength}/${CONFIRM_WINDOW})`
                                                    : strength === CONFIRM_WINDOW && confirmed === 'MATCH'
                                                      ? `confirmed MATCH`
                                                      : `${strength}/${CONFIRM_WINDOW} ticks`}
                                            </span>
                                        </div>

                                        {/* Diff meter */}
                                        <div className='ms-ai__diff-row'>
                                            <span className='ms-ai__diff-label'>GREEN vs BLUE diff</span>
                                            <div className='ms-ai__diff-track'>
                                                <div
                                                    className={`ms-ai__diff-fill ${diff !== null && diff <= MATCH_THRESHOLD ? 'ms-ai__diff-fill--match' : 'ms-ai__diff-fill--no'}`}
                                                    style={{ width: `${Math.min((diff ?? 0) * 20, 100)}%` }}
                                                />
                                            </div>
                                            <span className={`ms-ai__diff-val ${diff !== null && diff <= MATCH_THRESHOLD ? 'ms-ai__diff-val--match' : 'ms-ai__diff-val--no'}`}>
                                                {diff !== null ? diff.toFixed(2) : '--'}%
                                            </span>
                                            <span className={`ms-ai__diff-badge ${diff !== null && diff <= MATCH_THRESHOLD ? 'ms-ai__diff-badge--pass' : 'ms-ai__diff-badge--fail'}`}>
                                                {diff !== null && diff <= MATCH_THRESHOLD ? '≤ 0.3' : '> 0.3'}
                                            </span>
                                        </div>

                                        {/* Color bars */}
                                        <div className='dp-ai__bars'>
                                            {(
                                                [
                                                    { key: 'green',  bar: an.green,  role: confirmed === 'MATCH' ? 'Entry'   : undefined },
                                                    { key: 'blue',   bar: an.blue,   role: confirmed === 'MATCH' ? 'Predict' : undefined },
                                                    { key: 'yellow', bar: an.yellow, role: undefined },
                                                    { key: 'red',    bar: an.red,    role: undefined },
                                                ] as const
                                            ).map(({ key, bar, role }) => (
                                                <div key={key} className={`dp-ai__bar-row dp-ai__bar-row--${key}`}>
                                                    <span className='dp-ai__bar-label'>
                                                        {role
                                                            ? <span className='ms-ai__bar-role'>{role}</span>
                                                            : key.toUpperCase()}
                                                    </span>
                                                    <span className='dp-ai__bar-digit'>{bar.digit}</span>
                                                    <div className='dp-ai__bar-track'>
                                                        <div
                                                            className={`dp-ai__bar-fill dp-ai__bar-fill--${key}`}
                                                            style={{ width: `${Math.min(bar.pct * 4, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className='dp-ai__bar-pct dp-ai__bar-pct--pass'>
                                                        {bar.pct.toFixed(1)}%
                                                    </span>
                                                </div>
                                            ))}
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

        </div>
    );
};

export default MatchesSignal;
