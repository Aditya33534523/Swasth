# SwasthSetu — AI Health Assistant + Hospital Finder

A single-page web application with a **dual-mode chat interface**: free-form AI health chat powered by a local LLM (Gemma via llama-server) and a guided hospital finder for Indian government health scheme cards.

![SwasthSetu Screenshot](screenshot.png)

## Features

### AI Chat Mode
- **ChatGPT-style free-form conversation** — ask about medicines, health topics, government schemes
- **Streaming responses** with a typing indicator, then token-by-token display and a blinking cursor
- **Stop generation** button to cancel mid-response
- **Markdown bold** rendering in bot messages
- **Multilingual** — the LLM responds in whatever language the user types (English, Hindi, Hinglish, etc.)
- **Medical disclaimers** built into the system prompt
- **Graceful offline handling** — if the LLM server isn't running, shows a clear error (with a connect/stall timeout so it never hangs indefinitely) and the hospital finder still works
- **Conversation history** — browse, resume, or delete past conversations from the history panel; start a new chat anytime

### Hospital Finder Mode
- **FSM-guided flow**: card selection → location input → hospital results
- **Three location input modes**: GPS, pincode lookup, city name lookup (Nominatim, rate-limit safe)
- **Interactive map** with color-coded markers (green=MAA, saffron=Ayushman, blue=both, grey=general)
- **Glass popup + bottom detail sheet** on marker click
- **Emergency keyword detection** — English and Hindi/Hinglish ("chest pain", "seene mein dard", "accident", etc.) triggers immediate emergency response
- **Smart context passing** — after a hospital search, the AI chat knows the results for follow-up questions

### Account & Data
- Email/password registration and login backed by the Express API
- **Export your data** — download all chats and activity logs as JSON
- **Delete your account** — type-to-confirm modal, permanently erases the account and every associated chat/log

### Design
- **Apple macOS Tahoe "Liquid Glass"** theme with translucent surfaces, backdrop blur, animated gradient background
- **Adaptive light/dark mode** — respects system preference and live-follows OS theme changes until you explicitly pick one yourself
- **Installable as a PWA** — manifest + icons + service worker for "Add to Home Screen"
- **Fully responsive**, mobile-safe viewport handling (no content clipped behind the browser's address bar or a gesture nav bar)
- **Accessibility** — ARIA roles, keyboard navigation, WCAG AA contrast, `prefers-reduced-motion`, labeled form fields

## Tech Stack

- React 18 + TypeScript, Vite 6, Tailwind CSS v3.4
- react-leaflet v4 + OpenStreetMap (no API key)
- Framer Motion, lucide-react
- **llama.cpp llama-server** (local LLM, OpenAI-compatible API)

## Getting Started

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Start the local LLM server

```bash
llama-server -m gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf \
  -c 65536 -fa on --jinja --load-mode mmap \
  --temp 1.0 --top-p 0.95 --top-k 64 \
  -t 4 -np 1 -ngl 99
```

This starts the server at `http://localhost:8080` with the OpenAI-compatible `/v1/chat/completions` endpoint. `UD-Q4_K_XL` is the highest-accuracy quant currently available for this model's QAT weights; the sampling values above are Gemma 4's own documented recommendation — lowering temperature does not make answers "more factual," it measurably hurts this model.

If you're memory-constrained (e.g. Apple Silicon unified memory) and 65536 context doesn't fit, either lower `-c` or add `-ctv q4_0 -ctk q4_0` back — quantizing the KV cache costs some accuracy, but a model forced to swap or truncate context is worse.

### 3. Start the frontend

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

> **Note:** The hospital finder works without the LLM server. The AI chat mode requires llama-server to be running.

### 4. (Optional) Share over a Cloudflare Tunnel

The frontend talks to the LLM through a relative `/llm-api` path, which Vite's dev server proxies server-side to `localhost:8080` (see `vite.config.ts`). This means one tunnel pointed at Vite's port (5173) — not two — is enough for another device to use the app fully, including AI chat:

```bash
cloudflared tunnel --url http://localhost:5173
```

Both `llama-server` and `npm run dev` must be running on the same machine as cloudflared for this to work — the tunnel only fronts Vite; Vite is the one making the real `localhost:8080` call, from the machine where that's actually correct.

## Changing the LLM Server URL

`src/lib/llm.ts`'s `DEFAULT_BASE_URL` is `/llm-api` by design — **don't** change it to an absolute URL like `http://localhost:8080` unless you specifically want to lose Cloudflare Tunnel support, since an absolute `localhost` URL only resolves correctly when the browser and llama-server are the same machine.

To point at a different local server (Ollama, vLLM, TGI, etc.), update the proxy *target* in `vite.config.ts` instead of `DEFAULT_BASE_URL`:

```ts
proxy: {
  '/llm-api': {
    target: 'http://localhost:11434', // e.g. Ollama
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/llm-api/, ''),
  },
},
```

This keeps the relative-path/proxy pattern intact (and therefore tunnel support) no matter which server you're actually running.

## Swapping Seeded Hospital Data for a Real API

Open `src/lib/filterHospitals.ts` and replace `getHospitals()`:

```ts
// Before (seeded data):
const getHospitals = (): Hospital[] => seededHospitals;

// After (real API):
const getHospitals = async (): Promise<Hospital[]> => {
  const res = await fetch('/api/hospitals');
  return res.json();
};
```

## Security Notes

The backend hashes passwords with bcrypt and authenticates API requests with JWTs. Configure a strong `JWT_SECRET` and set `FRONTEND_URL` in production to restrict CORS. The browser stores only the JWT and a cached public user profile; never commit `.env` files or expose API keys.

## Project Structure

```
src/
  main.tsx                    # Entry point, error boundary + service worker registration
  App.tsx                     # App shell, auth gate, theme, tab switching
  index.css                   # CSS variables, glass utilities, streaming cursor
  types.ts                    # TypeScript interfaces + LLM message types
  vite-env.d.ts                # Vite client type declarations (required — do not delete)
  data/
    hospitals.ts              # Seeded hospital data (14 hospitals)
  lib/
    llm.ts                    # Streaming LLM client (OpenAI-compatible, via /llm-api proxy)
    geocode.ts                # Pincode/city → coords via Nominatim, rate-limit throttled
    filterHospitals.ts        # Card filter + haversine distance sort
    auth.ts                   # Register/login/session + account deletion
    storage.ts                # Chat session CRUD + activity logging + data export
  components/
    LoginPage.tsx              # Auth screen
    AppHeader.tsx               # Top bar: logo, Chat/Map tabs, export, delete account, theme, logout
    ChatPanel.tsx               # Dual-mode: AI chat + Hospital FSM + session history
    ChatHistoryPanel.tsx        # Past-conversations browser (switch/delete/new)
    ChatMessage.tsx             # Message bubble with markdown bold
    QuickReplies.tsx            # Quick-reply pill buttons
    ConfirmDeleteAccountModal.tsx  # Type-to-confirm destructive-action modal
    ErrorBoundary.tsx           # App-wide crash guard
    MapPanel.tsx                # Leaflet map wrapper
    HospitalMarker.tsx          # Color-coded marker + glass popup
    HospitalSheet.tsx           # Bottom detail sheet
public/
  manifest.webmanifest         # PWA manifest
  sw.js                        # Minimal service worker (installability only, no caching)
  icon-*.png, apple-touch-icon.png
```

## License

MIT