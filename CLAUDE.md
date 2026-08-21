# SwasthSetu — Claude Code Project Context

## Project Overview

SwasthSetu is a single-page React 18 + Vite + TypeScript web application for Indian users to:
1. **Chat with a local AI** about medicines, health topics, government schemes (Gemma via llama-server)
2. **Find nearby hospitals** that accept MAA Card / Ayushman Bharat (guided FSM flow)

## Architecture

```
Dual-mode chat panel (ChatPanel.tsx)
├── AI Chat mode  → streams from llama-server at localhost:8080 via llm.ts
└── Hospital FSM mode → structured flow: card → location → map results

Map panel (MapPanel.tsx)
└── Color-coded HospitalMarkers → glass Popup + HospitalSheet

Shared state via App.tsx lifts:
  - mapAction (show_markers, clear_markers, fly_to, highlight_marker)
  - selectedHospital (for HospitalSheet)
  - isDark (theme, persisted to localStorage)
```

## Key Files & What They Do

| File | Purpose | Critical Rules |
|------|---------|---------------|
| `src/components/ChatPanel.tsx` | Dual-mode chat: AI streaming + hospital FSM. Manages `llmMessagesRef` for LLM context and `fsmState` for hospital flow. | Never import hospital search logic into AI mode directly — pass results via `llmMessagesRef` after FSM completes. |
| `src/lib/llm.ts` | Streaming fetch to `localhost:8080/v1/chat/completions`. OpenAI-compatible. | Uses SSE parsing. `AbortController` for cancel. Change `DEFAULT_BASE_URL` for other servers. |
| `src/lib/filterHospitals.ts` | Haversine distance + card type filter. **One-line swap** for real API. | `getHospitals()` is the swappable function. |
| `src/lib/geocode.ts` | Nominatim pincode/city → coords. Also `getCurrentPosition()` for GPS. | No API key needed. Nominatim rate limit: 1 req/sec. |
| `src/data/hospitals.ts` | 14 seeded hospitals (Ahmedabad, Gandhinagar, Surat, Vadodara). | Real lat/lon. Mix of MAA-only, Ayushman-only, both, neither. |
| `src/types.ts` | All shared types. `FilteredHospital` extends `Hospital` with `distanceKm`. | `ChatMode`, `LLMMessage`, `HospitalFSMState` are used by ChatPanel. |
| `src/index.css` | CSS variables (light/dark), `.glass` material system, Leaflet overrides, streaming cursor. | **Never** stack glass-on-glass. Text on glass must use `--text-primary`. |
| `src/App.tsx` | Shell layout. Chat (380px) + Map (flex-1) on desktop. Stacked 55/45 on mobile. | `mapAction` state batches React updates — only last action per render cycle takes effect. |

## Commands

```bash
npm install          # install deps
tsc --noEmit         # type-check (via node node_modules/typescript/bin/tsc --noEmit)
npx vite build      # production build
npm run dev          # dev server on :5173
```

## LLM Server

```bash
llama-server -m gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf -c 65536 -ctv q4_0 -ctk q4_0 -fa on --jinja --load-mode mmap --temp 0.3 --top-p 0.95 --top-k 20 -t 4 -np 1 -ngl 99
```
- Endpoint: `http://localhost:8080/v1/chat/completions`
- OpenAI-compatible API
- Change `DEFAULT_BASE_URL` in `src/lib/llm.ts` for Ollama (`:11434`), vLLM, TGI, etc.

## Design System — Liquid Glass Rules

1. **Glass classes**: `.glass` (regular), `.glass-strong` (sidebars/popovers)
2. **Apply glass ONLY to**: chat panel, map panel container, top bar, popups, quick-reply buttons, hospital sheet
3. **NEVER stack glass directly on glass** without a gap (popup over map is OK — map is content, not glass)
4. **Text on glass**: always `var(--text-primary)` for WCAG AA
5. **Dark mode**: toggle class `.dark` on `<html>`, persisted to `localStorage('swasthsetu-theme')`
6. **Motion**: Framer Motion spring (260/26). Respect `prefers-reduced-motion`
7. **Markers**: MAA=green(`--maa`), Ayushman=saffron(`--ayushman`), Both=blue(`--both`), None=grey(`--none`)
8. **Map tiles**: light=OSM, dark=CartoDB Dark Matter. Swap via `key={isDark ? 'dark' : 'light'}` on `<TileLayer>`

## Common Pitfalls

- **LLM server offline**: ChatPanel shows error but hospital finder still works
- **Geolocation denied**: Falls back to pincode/city input
- **Map tile flash on theme switch**: The `key` prop on TileLayer forces remount (intentional)
- **React state batching**: Two `setMapAction()` calls in same sync block — only last takes effect
- **FSM + AI context**: After hospital search, results are injected into `llmMessagesRef` as a user+assistant pair so the AI can answer follow-up questions
- **Mobile layout**: Uses CSS classes `chat-panel-mobile` / `map-panel-mobile` with flex ratios, not Tailwind responsive prefixes (because GlassPanel is a motion.div)

## Testing Without LLM

The hospital finder works fully without llama-server. Only AI chat mode requires it. To test hospital flow, click "Find Hospitals" in the chat header or the 🏥 quick reply.

## Emergency Detection

Regex: `/chest pain|unconscious|severe bleeding|stroke|not breathing|accident/i`
Triggers from BOTH AI chat and FSM modes. Shows nearest emergency hospital + tells user to call 108.
