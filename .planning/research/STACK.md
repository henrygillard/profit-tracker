# Technology Stack: Profit Analytics Dashboard UI Layer

**Project:** Shopify Profit Tracker — React frontend milestone
**Researched:** 2026-03-10
**Confidence Note:** All external research tools (WebSearch, WebFetch, Bash) were unavailable in this session. All findings are based on training knowledge (cutoff August 2025) plus inference from the existing project's Shopify API version (2025-10), which places the scaffold firmly in the post-App-Bridge-4 era. Confidence levels reflect this constraint.

---

## Context: What Already Exists

The existing scaffold is vanilla Node.js + Express with no frontend build toolchain. The relevant existing constraints:

- Shopify API version `2025-10` (from `shopify.app.profit-tracker.toml`)
- `embedded = true` already set in TOML
- CSP `frame-ancestors` headers already set per shop in `server.js`
- No `package.json` build scripts beyond `prisma` commands
- Deployed via Docker on Railway; static files served from `/public`

The new layer adds: React SPA, Shopify embedded app wiring, Polaris UI components, and a charting library — all built separately and served as static files from Express.

---

## Recommended Stack

### App Bridge

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@shopify/app-bridge-react` | ^4.x (latest) | Embedded app context provider, navigation, session token | The React-specific bridge package for embedded apps |

**CRITICAL — App Bridge architecture changed in 2024:**
Shopify shipped "App Bridge CDN" / "App Bridge native" starting with API versions ~2024-04+. In this model:
- The Shopify Admin *injects* App Bridge via a `<script>` tag in the outer page frame
- The embedded app's iframe receives the App Bridge `window.shopify` global automatically
- `@shopify/app-bridge-react` wraps this injected bridge in a React context provider

The practical implications:
1. You do NOT need to manually load an App Bridge script tag in your HTML
2. You DO still install `@shopify/app-bridge-react` as an npm package for React hooks (`useAppBridge`, `useNavigate`, etc.)
3. The `AppProvider` from `@shopify/app-bridge-react` replaces the old `@shopify/app-bridge` direct initialization pattern

**Confidence: MEDIUM** — Architecture verified by training data from Shopify docs pre-Aug 2025. The 2025-10 API version in this project confirms it falls within the modern App Bridge era. Exact package version should be verified against `npm show @shopify/app-bridge-react version` before coding.

**What NOT to use:**
- `@shopify/app-bridge` (the non-React package) — still exists but for non-React use cases; use the React package
- `@shopify/app-bridge` v2.x patterns (manual `createApp()` calls, `getSessionToken()` directly) — deprecated; the React package handles this
- CDN script tags to load App Bridge manually — handled by Shopify admin automatically for 2024+ API versions

### Session Token Authentication (API calls from React)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@shopify/app-bridge-react` hooks | (included above) | Get session tokens for API calls | The only Shopify-sanctioned way to authenticate embedded app API calls |

Pattern for authenticating React → Express API calls:

```javascript
// In React component
import { useAppBridge } from '@shopify/app-bridge-react';

const shopify = useAppBridge();
const token = await shopify.idToken(); // Gets current session token
// Pass as Bearer token to your Express API
```

Express then verifies this token against Shopify's JWKS endpoint. This is the replacement for the old cookie-based session approach in embedded apps.

**Confidence: MEDIUM** — Standard pattern as of 2024 Shopify docs.

### React Setup (No Meta-Framework)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | ^18.x | UI component library | Current stable; 19 was in RC as of Aug 2025, use 18 until 19 is stable |
| ReactDOM | ^18.x | DOM rendering | Paired with React |
| Vite | ^5.x | Build tool | Zero-config, fast HMR for development, optimized production builds; no framework lock-in |
| `@vitejs/plugin-react` | ^4.x | Vite React plugin | Babel-based React transform for Vite; mature and stable |

**Why Vite over alternatives:**
- **Not Create React App (CRA):** Officially deprecated and unmaintained since 2023
- **Not Webpack directly:** Significantly more configuration boilerplate for equivalent output; Vite internally uses Rollup for production which is well-optimized
- **Not Next.js/Remix:** These are full meta-frameworks; this project has Express already; adding Next.js would mean running two servers or abandoning Express, neither acceptable per constraints
- **Not Parcel:** Less ecosystem traction for React apps than Vite; less control over output for embedded app use case

Vite builds to a `/dist` folder that Express serves as static files — clean separation.

**Confidence: HIGH** — Vite as the non-framework React build tool is the clear community consensus as of 2025.

### Shopify Polaris

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@shopify/polaris` | ^13.x | UI component library | Required for Shopify admin look-and-feel compliance; cards, data tables, navigation, form components |

**Why Polaris is mandatory (not optional):**
Shopify's App Store review process increasingly flags embedded apps that don't use Polaris. Merchants expect the admin UI to feel native. The dashboard pages (profit overview, product table, order list) map directly to Polaris `DataTable`, `Card`, `DatePicker`, and `Select` components — no custom CSS work required.

**Polaris v13 changes from v12:**
- Token-based design system (CSS custom properties)
- Removed deprecated `Stack` component in favor of `BlockStack`/`InlineStack`
- Updated color system aligned with Shopify's design tokens

**What NOT to use:**
- Custom CSS frameworks (Tailwind, Bootstrap, etc.) alongside Polaris — Polaris uses its own token-based system; mixing creates visual inconsistency and token conflicts
- `@shopify/polaris-tokens` directly unless you need advanced theming — the main Polaris package includes tokens

**Confidence: MEDIUM** — Polaris v13 was current as of Aug 2025. Verify `npm show @shopify/polaris version` before installing; v14 may be available.

### Charting Library

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Recharts | ^2.x | Profit/margin time series, bar charts, composed charts | Best fit for this use case — see rationale below |

**Decision: Recharts over alternatives**

This is the most contested decision in the stack. Here is the evidence-based rationale:

**Recharts — RECOMMENDED**
- Built on D3 (data-driven, accurate scales and axes) but abstracts D3's complexity
- React-native: components are real React components, not imperative D3 mutations
- SVG-based: sharp at all zoom levels, no canvas blurriness on retina
- `ComposedChart` supports overlaying bar + line charts — exactly what profit dashboards need (revenue bars + margin % line on same chart)
- TypeScript types included
- ~500KB unpacked, tree-shakeable to far less in practice
- Active maintenance: v2.x series has 4+ years of production use

**Why not Chart.js / react-chartjs-2:**
- Chart.js is canvas-based (blurry on retina, can't apply CSS styles to chart elements)
- `react-chartjs-2` is a thin wrapper with an imperative Chart.js config object, not idiomatic React
- Animation and tooltip customization requires reaching into Chart.js internals

**Why not Nivo:**
- High-quality library, but significantly heavier (~2x bundle size vs Recharts)
- Polaris design tokens don't translate easily to Nivo's style system
- More complexity than needed for a standard profit dashboard

**Why not Visx (Airbnb):**
- Low-level D3 wrapper, not a component library — requires significant custom work
- Appropriate for custom visualization work, not a standard analytics dashboard

**Why not Victory:**
- Smaller ecosystem, less active maintenance than Recharts
- More opinionated layout system that conflicts with Polaris Card layouts

**Confidence: HIGH** — Recharts is the dominant choice for React-native charting as of 2025. Pattern is stable.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | ^3.x | Date manipulation for range filters | Use for date range calculation, formatting in dashboard filters; pairs well with Polaris DatePicker |
| `@tanstack/react-query` | ^5.x | Server state management (API data fetching, caching, loading/error states) | Use for all Express API calls from React; eliminates manual fetch boilerplate |
| `react-router-dom` | ^6.x | Client-side routing between dashboard views | Use if multiple pages (Overview, Products, Orders, Settings); optional if single-page tabs |

**Why TanStack Query (React Query):**
The profit dashboard has multiple data-fetching concerns: orders sync status, products list, profit overview by date range. React Query handles caching, background refetch, loading states, and error states with minimal boilerplate. This is substantially less code than manual `useEffect` + `useState` fetch patterns, and avoids common bugs (race conditions, stale closures).

**Why date-fns over moment.js:**
Moment.js is officially deprecated. date-fns is tree-shakeable (import only what you use), immutable (no surprise mutations), and TypeScript-first.

**Why react-router-dom v6 (optional):**
If the app has more than one "page" (e.g., Dashboard, Products, Settings), client-side routing avoids full page reloads. Polaris `Navigation` component works well with react-router's `NavLink`. However, if the entire UI fits in a single page with tab-based navigation, skip react-router entirely and use Polaris `Tabs`.

---

## How to Serve React from Express

This is the Express + Vite integration pattern — no meta-framework required.

### Build Architecture

```
profit-tracker/
├── server.js                 # Existing Express server (unchanged routing)
├── client/                   # New: React app source
│   ├── index.html            # Vite entry point HTML
│   ├── src/
│   │   ├── main.jsx          # React root, AppProvider wrapping
│   │   └── App.jsx           # Root component
│   ├── vite.config.js        # Build config: outDir → ../public/app
│   └── package.json          # Client-only dependencies
└── public/
    └── app/                  # Vite build output, served as static files
        ├── index.html
        └── assets/
            ├── main.[hash].js
            └── main.[hash].css
```

### Express Static Serving

In `server.js`, add one route that serves the React SPA for the `/admin` path:

```javascript
// Serve Vite build output as static files
app.use('/app', express.static(path.join(__dirname, 'public/app')));

// SPA fallback: all /admin/* requests serve the React index.html
app.get('/admin', (req, res) => {
  // Existing session check stays here
  // If session valid, serve the SPA entry point
  res.sendFile(path.join(__dirname, 'public/app/index.html'));
});
```

The existing session check on `GET /admin` stays in Express — the server validates the session before serving the SPA, keeping the auth logic server-side.

### Vite Config (Key Settings)

```javascript
// client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  // base must match the Express static serving path
  base: '/app/',
});
```

### Development Workflow

In development, run two processes:
1. Express server: `npm run dev` (existing, port 3000)
2. Vite dev server: `npm run client:dev` (port 5173, with proxy to Express)

Configure Vite proxy to forward API calls to Express during development:

```javascript
server: {
  proxy: {
    '/api': 'http://localhost:3000',
  }
}
```

In production (Docker/Railway), only Express runs. The `npm run client:build` step (added to Dockerfile) compiles the React app to `public/app/` before `node server.js` starts.

### Docker Build Step Addition

The Dockerfile needs one additional step:

```dockerfile
# Install client dependencies and build
WORKDIR /app/client
RUN npm install
RUN npm run build
WORKDIR /app
```

**Confidence: HIGH** — This is a well-established pattern for Express + Vite SPAs. No framework magic; straightforward static file serving.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tool | Vite 5 | Create React App | CRA officially deprecated 2023, unmaintained |
| Build tool | Vite 5 | Webpack 5 direct | ~200 lines of config vs ~15 for Vite; no benefit |
| Build tool | Vite 5 | Next.js | Full framework requiring its own server; conflicts with existing Express |
| Build tool | Vite 5 | Remix | Same issue as Next.js; needs its own server adapter |
| Charting | Recharts | Chart.js | Canvas-based, not React-native, poor retina quality |
| Charting | Recharts | Nivo | 2x bundle size, overkill for standard dashboard |
| Charting | Recharts | Visx | Low-level, requires significant custom work |
| Date utils | date-fns | moment.js | Officially deprecated, not tree-shakeable |
| Date utils | date-fns | dayjs | Similar quality; date-fns more TypeScript-native |
| Server state | TanStack Query | Redux Toolkit | Redux is overkill for API data fetching; RTK Query adds learning curve |
| Server state | TanStack Query | SWR | Both are good; TanStack Query has more features (mutations, devtools, offline) |
| UI framework | Polaris | Tailwind + headless | Polaris is required for Shopify admin look-and-feel; custom CSS fights Shopify's design system |

---

## Installation

### Client-side (new `client/` directory)

```bash
# Core React + build
npm install react@^18 react-dom@^18
npm install -D vite@^5 @vitejs/plugin-react@^4

# Shopify embedded app
npm install @shopify/app-bridge-react@^4
npm install @shopify/polaris@^13

# Data & utilities
npm install recharts@^2
npm install date-fns@^3
npm install @tanstack/react-query@^5

# Routing (include only if multi-page)
npm install react-router-dom@^6
```

### Server-side additions (existing `package.json`)

No new server dependencies are required. Express already serves static files. The Vite build output is just HTML/JS/CSS that Express hands to the browser.

---

## CSP Header Update Required

The existing CSP header in `server.js` will need updating. Currently it only allows frame-ancestors. The React app will load external resources (fonts from Shopify CDN, Polaris icons) that need to be whitelisted.

Minimum additions needed:
- `script-src`: allow the Shopify CDN that injects App Bridge
- `style-src`: allow inline styles (Polaris uses them) and Shopify CDN stylesheets
- `img-src`: allow Shopify CDN for product images and Polaris icons
- `connect-src`: allow Shopify API endpoints for GraphQL/REST calls from the browser

This is an existing concern noted in `CONCERNS.md` and must be addressed before the React app will function in the embedded iframe context.

**Confidence: HIGH** — CSP restrictions are a known, documented requirement for Shopify embedded apps.

---

## Open Questions (Verify Before Coding)

| Question | How to Verify | Impact if Wrong |
|----------|--------------|-----------------|
| Is `@shopify/app-bridge-react` v4 still the correct package name in 2026? | `npm show @shopify/app-bridge-react` | Could be renamed or consolidated |
| Is Polaris at v13 or v14+ now? | `npm show @shopify/polaris version` | API changes in major versions |
| Does the 2025-10 API version require any specific App Bridge configuration? | Shopify changelog for 2025-10 | Could affect session token approach |
| Is `shopify.idToken()` the correct method for session tokens (vs `getSessionToken`)? | Shopify App Bridge React docs | Auth will break if wrong |

---

## Sources

- Training knowledge: Shopify App Bridge documentation (pre-August 2025)
- Training knowledge: Shopify Polaris v12/v13 release notes
- Training knowledge: Vite 5 official documentation
- Training knowledge: Recharts v2 documentation
- Training knowledge: TanStack Query v5 documentation
- Existing project file: `shopify.app.profit-tracker.toml` (API version 2025-10 confirmed)
- Existing project file: `server.js` (CSP header pattern confirmed)
- **Note:** No live web lookups were possible in this session. All version numbers should be verified with `npm show [package] version` before starting implementation.
