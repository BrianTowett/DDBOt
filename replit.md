# Deriv Bot

## Overview

Deriv Bot is a web-based automated trading platform that allows users to create trading bots without coding. The application uses a visual block-based programming interface (powered by Blockly) to let users design trading strategies. Users can build bots from scratch, use quick strategies, or import existing bot configurations. The platform supports both demo and real trading accounts through the Deriv trading API.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Framework

- **React 18** with TypeScript as the primary UI framework
- **MobX** for state management across the application
- Stores are organized in `src/stores/` with a root store pattern that aggregates domain-specific stores (client, dashboard, chart, run-panel, etc.)

### Build System

- **Rsbuild** as the primary build tool (modern, fast bundler)
- Webpack configuration available as fallback
- Babel for transpilation with support for decorators and class properties

### Visual Programming

- **Blockly** library for the drag-and-drop bot building interface
- Custom blocks and toolbox configurations for trading-specific operations
- Workspace serialization for saving/loading bot strategies

### Trading Integration

- **@deriv/deriv-api** for WebSocket-based communication with Deriv trading servers
- Real-time market data streaming and order execution
- Support for multiple account types (demo, real, wallet-based)

### Authentication

- OAuth2-based authentication flow with OIDC support
- Token Management Backend (TMB) integration for enhanced session handling
- Multi-account support with account switching capabilities

### Charting

- **@deriv/deriv-charts** for displaying market data and trade visualizations
- Real-time chart updates during bot execution

### PWA Support

- Service worker for offline capabilities
- Installable as a Progressive Web App on mobile devices
- Offline fallback page

### Internationalization

- **@deriv-com/translations** for multi-language support
- CDN-based translation loading with Crowdin integration

### Analytics & Monitoring

- **RudderStack** for event tracking and analytics
- **Datadog** for session replay and performance monitoring
- **TrackJS** for error tracking in production

## External Dependencies

### Deriv Ecosystem Packages

- `@deriv-com/auth-client` - Authentication client
- `@deriv-com/analytics` - Analytics integration
- `@deriv-com/quill-ui` / `@deriv-com/quill-ui-next` - UI component library
- `@deriv-com/translations` - Internationalization
- `@deriv/deriv-api` - Trading API client
- `@deriv/deriv-charts` - Charting library

### Cloud Services

- **Cloudflare Pages** - Deployment platform
- **Google Drive API** - Bot strategy storage and sync
- **LiveChat** - Customer support integration
- **Intercom** - In-app messaging (feature-flagged)
- **GrowthBook** - Feature flag management
- **Survicate** - User surveys

### Third-Party Libraries

- `blockly` - Visual programming blocks
- `mobx` / `mobx-react-lite` - State management
- `react-router-dom` - Client-side routing
- `formik` - Form handling
- `@tanstack/react-query` - Server state management
- `js-cookie` - Cookie management
- `localforage` - Client-side storage
- `lz-string` / `pako` - Compression utilities

## Recent Changes

### Free Bots Feature (December 2025)

- Added Free Bots page with 12 pre-built trading bot templates
- Bot cards display with category filtering (Speed Trading, AI Trading, Pattern Analysis, etc.)
- Click-to-load functionality that imports bot XML into Bot Builder
- Responsive card design with hover effects and loading states
- Bot XML files stored in `/public/bots/` directory
- Files: `src/pages/free-bots/index.tsx`, `src/pages/free-bots/free-bots.scss`

### App Loading Bulletproof Fix (April 2026)

- Fixed body stuck on `AppRootLoader` spinner forever on `https://ddbot.pages.dev/`
- Root cause: `AppRoot` awaited `isTmbEnabled()` (Firebase config fetch) without a timeout. When that network call hung, `setIsTmbCheckComplete(true)` was never called, so the API init effect (which has its own 5s safety) never even started. Body stayed on spinner indefinitely.
- Fix in `src/app/app-root.tsx`:
  1. TMB check now has its own 2s safety timeout that forces `is_tmb_check_complete=true`
  2. Added a 3s "hard deadline" that forces the app to render even if `api_base.init()` is still pending
  3. Store gate kept (without store there's nothing to render)
- Worst-case path to interactive: ~3 seconds, regardless of network conditions

### Cloudflare Pages White-Screen / Splash Hang Fix (April 2026)

Returning users on Cloudflare Pages saw the gold "DBwin" splash with money rain spin forever. Multiple causes:

- **Service worker poisoning** — `public/sw.js` precached `/` and `/index.html` and intercepted navigation requests. After every redeploy, the cached HTML still referenced JS chunks with old content hashes that no longer existed on the CDN, so React never mounted. Replaced `public/sw.js` with a kill-switch worker that on activate clears all caches, calls `registration.unregister()`, and reloads controlled tabs. New visitors don't get a worker at all (`registerServiceWorker` in `src/utils/pwa-utils.ts` only registers when an existing one is found, purely so the kill-switch can run).
- **Splash never hid** — the inline splash in `index.html` waited for very specific class names (`.app-header`, `.dashboard__main`, etc.) that don't exist while the in-app `<ChunkLoader>` is showing, so the splash sat for the full 10s safety. Now hides the moment `#root` has any children, listens for an explicit `app-ready` event dispatched from `src/main.tsx`, and the safety is shortened to 5s. Also bails out immediately on `ChunkLoadError`.
- **No SPA fallback** — added `public/_redirects` (`/* /index.html 200`) so direct route hits and reloads on Cloudflare Pages serve `index.html` instead of returning 404.
- **Top-level error boundary + global error logging** added in `src/main.tsx` (`RootErrorBoundary` plus `error` / `unhandledrejection` listeners) so any future crash renders a visible error UI instead of just a white screen.
- **Node version pinned** to 20.20.0 via `.node-version` and `.nvmrc` for the CF Pages build.
