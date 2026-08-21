# SwasthSetu — AI Health Assistant + Hospital Finder

A single-page web application with a **dual-mode chat interface**: free-form AI health chat powered by a local LLM (Gemma via llama-server) and a guided hospital finder for Indian government health scheme cards.

![SwasthSetu Screenshot](screenshot.png)

## Features

### AI Chat Mode
- **ChatGPT-style free-form conversation** — ask about medicines, health topics, government schemes
- **Streaming responses** with a blinking cursor, token-by-token display
- **Stop generation** button to cancel mid-response
- **Markdown bold** rendering in bot messages
- **Multilingual** — the LLM responds in whatever language the user types (English, Hindi, Hinglish, etc.)
- **Medical disclaimers** built into the system prompt
- **Graceful offline handling** — if the LLM server isn't running, shows a clear error and the hospital finder still works

### Hospital Finder Mode
- **FSM-guided flow**: card selection → location input → hospital results
- **Three location input modes**: GPS, pincode lookup, city name lookup (Nominatim)
- **Interactive map** with color-coded markers (green=MAA, saffron=Ayushman, blue=both, grey=general)
- **Glass popup + bottom detail sheet** on marker click
- **Emergency keyword detection** — "chest pain", "accident", etc. triggers immediate emergency response
- **Smart context passing** — after a hospital search, the AI chat knows the results for follow-up questions

### Design
- **Apple macOS Tahoe "Liquid Glass"** theme with translucent surfaces, backdrop blur, animated gradient background
- **Adaptive light/dark mode** with persistent toggle
- **Fully responsive** — desktop side-by-side, mobile stacked
- **Accessibility** — ARIA roles, keyboard navigation, WCAG AA contrast, prefers-reduced-motion

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
  -c 65536 -ctv q4_0 -ctk q4_0 -fa on --jinja \
  --load-mode mmap --temp 0.3 --top-p 0.95 --top-k 20 \
  -t 4 -np 1 -ngl 99
```

This starts the server at `http://localhost:8080` with the OpenAI-compatible `/v1/chat/completions` endpoint.

### 3. Start the frontend

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

> **Note:** The hospital finder works without the LLM server. The AI chat mode requires llama-server to be running.

## Changing the LLM Server URL

Edit `src/lib/llm.ts` — change `DEFAULT_BASE_URL`:

```ts
const DEFAULT_BASE_URL = 'http://localhost:8080';  // change to your server
```

Compatible with any OpenAI-compatible server: llama.cpp, Ollama (`http://localhost:11434`), vLLM, TGI, LiteLLM, etc.

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

## Project Structure

```
src/
  main.tsx                    # Entry point
  App.tsx                     # App shell, theme state, layout
  index.css                   # CSS variables, glass utilities, streaming cursor
  types.ts                    # TypeScript interfaces + LLM message types
  data/
    hospitals.ts              # Seeded hospital data (14 hospitals)
  lib/
    llm.ts                    # Streaming LLM client (OpenAI-compatible)
    geocode.ts                # Pincode/city → coords via Nominatim
    filterHospitals.ts        # Card filter + haversine distance sort
  components/
    GlassPanel.tsx             # Reusable glass surface wrapper
    TopBar.tsx                 # Title bar with theme toggle
    TrafficLights.tsx          # Decorative macOS window dots
    ChatPanel.tsx              # Dual-mode: AI chat + Hospital FSM
    ChatMessage.tsx            # Message bubble with markdown bold
    QuickReplies.tsx           # Quick-reply pill buttons
    MapPanel.tsx               # Leaflet map wrapper
    HospitalMarker.tsx         # Color-coded marker + glass popup
    HospitalSheet.tsx          # Bottom detail sheet
```

## License

MIT# Swasth
# Swasth
