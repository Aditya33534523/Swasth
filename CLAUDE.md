# SwasthSetu — Claude Code Project Context

## Project Overview

SwasthSetu is a single-page React 18 + Vite + TypeScript web application for Indian users to:
1. **Chat with a local AI** about medicines, health topics, government schemes (Gemma via llama-server)
2. **Find nearby hospitals** that accept MAA Card / Ayushman Bharat (guided FSM flow)

## Architecture

```
App.tsx — shell, auth gate, theme, tab switching
├── LoginPage.tsx (unauthenticated)
└── Authenticated app
    ├── AppHeader.tsx — logo, Chat/Map tabs, export/delete-account, theme toggle, logout
    ├── ChatPanel.tsx (activeSection === 'chat')
    │   ├── AI Chat mode → streams from llama-server via lib/llm.ts
    │   ├── Hospital FSM mode → structured flow: card → location → map results
    │   └── ChatHistoryPanel.tsx → browse/switch/delete/start past conversations
    ├── MapPanel.tsx (activeSection === 'map')
    │   └── Color-coded HospitalMarkers → glass Popup + HospitalSheet
    └── HospitalSheet.tsx — bottom detail sheet (rendered at app level, shown from either tab)

Only ONE of ChatPanel / MapPanel is mounted at a time — this is tab
navigation (AppHeader's Chat/Map tabs), not a side-by-side or stacked
dual-panel layout. There is no desktop-vs-mobile split-layout mode.

Shared state, lifted in App.tsx:
  - mapAction (show_markers, clear_markers, fly_to, highlight_marker) — passed
    to MapPanel even while it's unmounted; MapPanel's own effect picks up
    the current mapAction on mount, so a hospital search done from the
    Chat tab is already reflected when you switch to the Map tab.
  - selectedHospital (for HospitalSheet, shown regardless of active tab)
  - isDark (theme — see Theme section below)
```

## Key Files & What They Do

| File | Purpose | Critical Rules |
|------|---------|---------------|
| `src/components/ChatPanel.tsx` | Dual-mode chat: AI streaming + hospital FSM + chat history. Manages `llmMessagesRef` for LLM context, `fsmState` for hospital flow, and session switching state. | Never import hospital search logic into AI mode directly — pass results via `llmMessagesRef` after FSM completes. Switching/starting/deleting a session must go through `resetSessionUiState()` so FSM/map state doesn't bleed across conversations. |
| `src/components/ChatHistoryPanel.tsx` | Dropdown of past chat sessions (title, timestamp, message count), New Chat, per-session delete. | Purely presentational — all switching logic lives in `ChatPanel.tsx`. |
| `src/components/AppHeader.tsx` | Top bar: logo, Chat/Map tabs, export data, delete account, theme toggle, logout. | This is the only header — `TopBar.tsx`/`TrafficLights.tsx` were an earlier design and no longer exist. |
| `src/components/ConfirmDeleteAccountModal.tsx` | Type-to-confirm modal gating `deleteAccount()`. | Destructive and irreversible — never wire a delete action to skip this. |
| `src/components/ErrorBoundary.tsx` | Wraps `<App />` in `main.tsx`. Catches render-time crashes app-wide. | Shows a "Try Again" screen instead of a blank white page. |
| `src/lib/llm.ts` | Streaming fetch to `/llm-api/v1/chat/completions` (relative path, proxied — see vite.config.ts). OpenAI-compatible. | SSE parsing, `AbortController` for manual cancel, plus a connect timeout (15s) and stall timeout (30s, resets per token) so a hung server doesn't leave the UI stuck. Default sampling is `temperature=1.0, top_p=0.95, top_k=64` — Gemma 4's documented config; don't lower temperature "for factual answers", it measurably hurts this model. |
| `src/lib/filterHospitals.ts` | Haversine distance + card type filter. **One-line swap** for real API. | `getHospitals()` is the swappable function. |
| `src/lib/geocode.ts` | Nominatim pincode/city → coords. Also `getCurrentPosition()` for GPS. | No API key needed. All requests go through a shared `throttledFetch` queue enforcing Nominatim's 1 req/sec limit — don't call `fetch()` directly for geocoding. |
| `src/lib/auth.ts` | Registration/login/session (plaintext localStorage — demo only, see below) plus `deleteAccount()`. | `deleteAccount()` sweeps every `swasthsetu/{userId}/...` key, not just the user record. |
| `src/lib/storage.ts` | Chat session CRUD (`createChatSession`, `switchChatSession`, `deleteChatSession`, `getChatSessionList`) + activity logging + data export. | Keys are namespaced `swasthsetu/{userId}/...`. `getCurrentChatSession()` reads whichever session the `current_chat` pointer names — switching/deleting update that pointer. |
| `src/data/hospitals.ts` | 14 seeded hospitals (Ahmedabad, Gandhinagar, Surat, Vadodara). | Real lat/lon. Mix of MAA-only, Ayushman-only, both, neither. |
| `src/types.ts` | All shared types. `FilteredHospital` extends `Hospital` with `distanceKm`. | `ChatMode`, `LLMMessage`, `HospitalFSMState`, `ChatSession` are used by ChatPanel/storage. |
| `src/index.css` | CSS variables (light/dark), `.glass` material system, Leaflet overrides, streaming cursor. | **Never** stack glass-on-glass. Text on glass must use `--text-primary`. |
| `src/App.tsx` | Shell layout, auth gate, theme (see below), tab switching between ChatPanel/MapPanel. | `mapAction` state batches React updates — only the last `setMapAction()` call per render cycle takes effect. |
| `src/vite-env.d.ts` | Pulls in Vite's client types (`import.meta.env`, etc). | Required — without it, `tsc --noEmit` fails on `main.tsx`'s `import.meta.env.PROD` check. Don't delete. |
| `public/manifest.webmanifest`, `public/sw.js` | PWA installability. | `sw.js` is intentionally a no-op network passthrough — this app needs `llama-server` and live geocoding, so a cached offline shell would be misleading, not helpful. |

## Commands

```bash
npm install          # install deps
tsc --noEmit         # type-check (via node node_modules/typescript/bin/tsc --noEmit)
npx vite build       # production build
npm run dev           # dev server on :5173
```

## LLM Server

```bash
llama-server -m gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf -c 65536 -fa on --jinja --load-mode mmap --temp 1.0 --top-p 0.95 --top-k 64 -t 4 -np 1 -ngl 99
```
- `UD-Q4_K_XL` is currently the highest-accuracy quant available for the E4B QAT weights (the repo only ships `UD-Q2_K_XL` and `UD-Q4_K_XL` for the actual model — `Q8_0`/`F16` variants in that repo are for a small speculative-decoding drafter, not the main model).
- No `-ctv`/`-ctk` KV-cache quantization — left at the f16 default for better long-context accuracy. Only add `-ctv q4_0 -ctk q4_0` back if you're memory-constrained (e.g. Apple Silicon unified memory) and need it to fit at this context length; quantizing the KV cache costs some accuracy but a model that has to swap/truncate mid-context is worse.
- Sampling (`temp 1.0 / top-p 0.95 / top-k 64`) matches Gemma 4's documented recommended config — don't lower temperature expecting more "factual" output; it's tuned around this setting.
- Endpoint: `http://localhost:8080/v1/chat/completions`, OpenAI-compatible.
- The frontend never calls `localhost:8080` directly — see "Accessing over Cloudflare Tunnel" below.

### Accessing over Cloudflare Tunnel

`src/lib/llm.ts`'s `DEFAULT_BASE_URL` is `/llm-api` (relative), and `vite.config.ts` proxies `/llm-api` → `http://localhost:8080` server-side. This is required, not optional, for tunnel access: to serve the app to another device, run `llama-server` and `npm run dev` on the same machine, then point cloudflared at the Vite dev server's port (5173) — **one tunnel**, not two. The browser on the other device only ever talks to that one tunnel URL; Vite does the real `localhost:8080` call from your machine, where "localhost" correctly means llama-server. Do not change `DEFAULT_BASE_URL` to an absolute `http://localhost:8080` — that only works when the browser and llama-server are the same machine, and silently breaks for anyone using the tunnel.

## Design System — Liquid Glass Rules

1. **Glass classes**: `.glass` (regular), `.glass-strong` (sidebars/popovers)
2. **Apply glass ONLY to**: chat panel, map panel container, top bar, popups, quick-reply buttons, hospital sheet
3. **NEVER stack glass directly on glass** without a gap (popup over map is OK — map is content, not glass)
4. **Text on glass**: always `var(--text-primary)` for WCAG AA. Never reuse `.login-glass-input`'s hardcoded white text outside the login page — it only works there because of the dark gradient background; on the main app's theme-adaptive glass it's unreadable in light mode.
5. **Dark mode**: toggle class `.dark` on `<html>`. See Theme section below — it's not a simple "read once, persist always" pattern.
6. **Motion**: Framer Motion spring (260/26). Respect `prefers-reduced-motion`
7. **Markers**: MAA=green(`--maa`), Ayushman=saffron(`--ayushman`), Both=blue(`--both`), None=grey(`--none`)
8. **Map tiles**: light=OSM, dark=CartoDB Dark Matter. Swap via `key={isDark ? 'dark' : 'light'}` on `<TileLayer>`
9. **Mobile viewport**: use `h-dvh`, never `h-screen` (`100vh`), on any full-screen container — `100vh` on mobile Chrome includes space hidden behind the address bar, clipping content like the chat input off-screen when the bar is visible.

## Theme (light/dark)

Two effects, deliberately split:
- One applies `.dark` to `<html>` on every `isDark` change, but does **not** write to `localStorage`.
- A second listens for OS theme changes (`matchMedia('(prefers-color-scheme: dark)')`) and updates `isDark` live — but only while `localStorage.getItem('swasthsetu-theme')` is still `null`.

Only `toggleTheme()` writes to `localStorage`. This split is what lets the app tell "inferred from system preference" apart from "user explicitly chose this" — writing to `localStorage` on every render (the naive approach) makes that distinction impossible and either breaks live OS-follow or overrides explicit user choices. Don't collapse these back into one effect.

## Common Pitfalls

- **LLM server offline**: ChatPanel shows an error (with the actual llama-server command as a hint) but the hospital finder still works
- **LLM server hung/unresponsive**: `streamChat()` has a 15s connect timeout and 30s stall timeout (resets per token) — after that it surfaces an error instead of leaving the UI stuck on "generating" forever
- **Geolocation denied**: Falls back to pincode/city input
- **Nominatim rate limiting**: all geocoding calls go through a shared throttle queue (1.1s spacing) in `geocode.ts` — don't bypass it with a direct `fetch()`
- **React state batching**: Two `setMapAction()` calls in same sync block — only last takes effect
- **FSM + AI context**: After hospital search, results are injected into `llmMessagesRef` as a user+assistant pair so the AI can answer follow-up questions
- **Switching/starting/deleting chat sessions**: always goes through `resetSessionUiState()` in `ChatPanel.tsx` — it aborts any in-flight stream and resets FSM/map/hospital-selection state, so leftover state from one conversation can't bleed into another
- **Account deletion**: `deleteAccount()` in `auth.ts` removes the user record AND sweeps every `swasthsetu/{userId}/...` localStorage key (all sessions, all activity logs) — it's not just profile deletion

## Confirmed Architecture & Behavior

### Session Switching Isolation
`resetSessionUiState()` in `ChatPanel.tsx` is the gate for all session transitions (switch/new/delete). It:
1. Calls `stopStreaming()` to cancel any in-flight LLM request
2. Calls `resetFSM()` to clear hospital FSM state
3. Clears `selectedImage` (attachment preview)
4. Clears `lastKnownCoordsRef` (coordinates used for emergency fallback)
5. Triggers `onMapAction({ type: 'clear_markers' })` to wipe the map

This ensures one conversation's partial state (mid-stream response, incomplete hospital search, selected hospital) never bleeds into the next one.

### Emergency Location Tracking
When the user performs a hospital search (FSM mode):
- `useHospitalFSM` hook calls `onLocationUpdate({ lat, lon })` after geolocation succeeds
- This callback in `ChatPanel.tsx` writes into `lastKnownCoordsRef`
- When an emergency is detected (in AI chat mode), `EMERGENCY_RE` triggers and uses those coords to find the nearest hospital
- This allows the app to respond with an emergency hospital location even though the emergency detection happens in a different part of the flow

### Typing Indicator UX
- While `isStreaming` is true and the LLM hasn't sent the first token yet (`!streamingText`), the UI shows three pulsing dots
- Once the first token arrives (`streamingText` has content), the dots are replaced with the streaming text bubble and blinking cursor
- This prevents a "silent waiting" period of up to 15 seconds (the connect timeout) — users see feedback immediately after hitting Send

## Known Minor Issues (Tracked but Lower Priority)

1. **Message persistence frequency**: Every new message in a conversation triggers a full `GET` (to load current session) + `PUT` (to resend entire message history). This is fine for a demo but will need batching/debouncing as conversations grow long.

2. **Glass-on-glass overlay rule**: The documented "never stack glass on glass" rule is violated by `ChatHistoryPanel`, `LLMSettingsModal`, and `ConfirmDeleteAccountModal` — all are `glass-strong` popovers rendered on top of the main app's `glass` shell/chat panel. This may look acceptable in practice due to the blur/opacity difference, but it contradicts the stated design rule.

## Testing Without LLM

The hospital finder works fully without llama-server. Only AI chat mode requires it. To test hospital flow, click "Find Hospitals" in the chat header or the 🏥 quick reply.

## Emergency Detection

`EMERGENCY_RE` in `ChatPanel.tsx` matches both English and Hindi/Hinglish phrasing (chest pain, unconscious, severe bleeding, stroke, not breathing, accident, heart attack, paralysis, and their Hindi/Hinglish equivalents). This matters because the system prompt tells the AI to respond in whatever language the user types — English-only detection would miss a genuine emergency typed in Hindi. Triggers from BOTH AI chat and FSM modes. Shows nearest emergency hospital + tells user to call 108.