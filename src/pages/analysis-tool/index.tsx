import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import DCirclesAnalysis from './dcircles-analysis';
import DPToolsAI from './dp-tools-ai';
import MatchesSignal from './matches-signal';
import OverUnderSignal from './over-under-signal';
import SignalsScanner from './signals-scanner';
import XenonAI from './xenon-ai';
import './analysis-tool.scss';

const IFRAME_TABS: Record<string, string> = {
    'Analysis Tool': 'https://bot-analysis-tool-belex.web.app',
    'All Analysis': 'https://bot-analysis-tool-belex.web.app',
};

const LiveStreamsTab: React.FC = () => (
    <div className='analysis-tool__live-streams'>
        <h2>📺 Live Trading Streams</h2>
        <p className='analysis-tool__live-desc'>Follow live trading sessions and analysis on YouTube and TikTok.</p>
        <div className='analysis-tool__stream-grid'>
            <a
                className='analysis-tool__stream-card analysis-tool__stream-card--yt'
                href='https://www.youtube.com/@derivtrading'
                target='_blank'
                rel='noreferrer'
            >
                <svg viewBox='0 0 48 48' width='40' height='40'>
                    <path
                        fill='#FF0000'
                        d='M43.2 33.9c-.4 2.1-2.1 3.7-4.2 4C34.1 38.4 29 38.5 24 38.5s-10.1-.1-15-.6c-2.1-.3-3.8-1.9-4.2-4C4.2 31 4 28.6 4 24s.2-7 .8-9.9c.4-2.1 2.1-3.7 4.2-4C14 9.6 19 9.5 24 9.5s10.1.1 15 .6c2.1.3 3.8 1.9 4.2 4 .6 2.9.8 5.3.8 9.9s-.2 7-.8 9.9z'
                    />
                    <path fill='#FFF' d='m20 29 12.5-5L20 19z' />
                </svg>
                <div>
                    <strong>YouTube — Deriv Trading</strong>
                    <span>Live sessions &amp; strategy</span>
                </div>
                <span className='analysis-tool__stream-arrow'>→</span>
            </a>
            <a
                className='analysis-tool__stream-card analysis-tool__stream-card--tt'
                href='https://www.tiktok.com/tag/derivtrading'
                target='_blank'
                rel='noreferrer'
            >
                <svg viewBox='0 0 48 48' width='40' height='40'>
                    <path
                        fill='#fff'
                        d='M33.2 10c.7 3.5 3 6.3 6.3 7.4v5.4c-2.2-.2-4.2-.8-6-1.8v13c0 6.3-5.1 11.4-11.4 11.4S11 40.3 11 34s5.1-11.4 11.4-11.4c.4 0 .8 0 1.2.1v5.5c-.4-.1-.8-.1-1.2-.1-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6V10h5.8z'
                    />
                </svg>
                <div>
                    <strong>TikTok — Deriv Trading</strong>
                    <span>Short tips &amp; live trades</span>
                </div>
                <span className='analysis-tool__stream-arrow'>→</span>
            </a>
            <a
                className='analysis-tool__stream-card analysis-tool__stream-card--yt'
                href='https://www.youtube.com/results?search_query=deriv+bot+live+trading'
                target='_blank'
                rel='noreferrer'
            >
                <svg viewBox='0 0 48 48' width='40' height='40'>
                    <path
                        fill='#FF0000'
                        d='M43.2 33.9c-.4 2.1-2.1 3.7-4.2 4C34.1 38.4 29 38.5 24 38.5s-10.1-.1-15-.6c-2.1-.3-3.8-1.9-4.2-4C4.2 31 4 28.6 4 24s.2-7 .8-9.9c.4-2.1 2.1-3.7 4.2-4C14 9.6 19 9.5 24 9.5s10.1.1 15 .6c2.1.3 3.8 1.9 4.2 4 .6 2.9.8 5.3.8 9.9s-.2 7-.8 9.9z'
                    />
                    <path fill='#FFF' d='m20 29 12.5-5L20 19z' />
                </svg>
                <div>
                    <strong>YouTube — DBot Live</strong>
                    <span>Bot trading &amp; tutorials</span>
                </div>
                <span className='analysis-tool__stream-arrow'>→</span>
            </a>
            <a
                className='analysis-tool__stream-card analysis-tool__stream-card--tt'
                href='https://www.tiktok.com/tag/dbot'
                target='_blank'
                rel='noreferrer'
            >
                <svg viewBox='0 0 48 48' width='40' height='40'>
                    <path
                        fill='#fff'
                        d='M33.2 10c.7 3.5 3 6.3 6.3 7.4v5.4c-2.2-.2-4.2-.8-6-1.8v13c0 6.3-5.1 11.4-11.4 11.4S11 40.3 11 34s5.1-11.4 11.4-11.4c.4 0 .8 0 1.2.1v5.5c-.4-.1-.8-.1-1.2-.1-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6V10h5.8z'
                    />
                </svg>
                <div>
                    <strong>TikTok — DBot Tips</strong>
                    <span>Quick setups &amp; signals</span>
                </div>
                <span className='analysis-tool__stream-arrow'>→</span>
            </a>
        </div>
    </div>
);

const AnalysisTool = observer(() => {
    const [activeTabName, setActiveTabName] = useState('Dcircles');

    const tabs = [
        'Dcircles',
        'Signals',
        'Analysis Tool',
        'Even/Odd Signal',
        'Smart Analysis',
        'All Analysis',
        'Tick Analyser',
        'Xenon AI',
        'Over/Under Signal',
        'Matches Signal',
        'TikTok YouTube Live',
    ];

    const renderContent = () => {
        switch (activeTabName) {
            case 'Dcircles':
                return <DCirclesAnalysis />;
            case 'Signals':
            case 'Tick Analyser':
                return <SignalsScanner />;
            case 'Smart Analysis':
            case 'Xenon AI':
                return <XenonAI />;
            case 'Even/Odd Signal':
                return <DPToolsAI />;
            case 'Over/Under Signal':
                return <OverUnderSignal />;
            case 'Matches Signal':
                return <MatchesSignal />;
            case 'TikTok YouTube Live':
                return <LiveStreamsTab />;
            default:
                return (
                    <div className='analysis-tool__iframe-container'>
                        <iframe
                            src={IFRAME_TABS[activeTabName] || 'https://bot-analysis-tool-belex.web.app'}
                            className='analysis-tool__iframe'
                            title={activeTabName}
                            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                            allowFullScreen
                        />
                    </div>
                );
        }
    };

    return (
        <div className='analysis-tool'>
            <div className='analysis-tool__tabs'>
                {tabs.map(name => (
                    <button
                        key={name}
                        className={`analysis-tool__tab ${activeTabName === name ? 'analysis-tool__tab--active' : ''}`}
                        onClick={() => setActiveTabName(name)}
                    >
                        {name}
                    </button>
                ))}
            </div>

            <div className='analysis-tool__content'>{renderContent()}</div>

            <div className='analysis-tool__risk-disclaimer'>Risk Disclaimer</div>
        </div>
    );
});

export default AnalysisTool;
