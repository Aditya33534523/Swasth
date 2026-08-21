import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only force HMR onto port 443 when actually running behind the
// Cloudflare tunnel — direct localhost access needs the real dev port.
const isTunnel = process.env.VITE_TUNNEL === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    hmr: isTunnel ? { clientPort: 443 } : true,
    // Proxy LLM requests server-side to llama-server. This is what makes
    // src/lib/llm.ts work identically over plain localhost AND through a
    // Cloudflare tunnel: the browser always calls the SAME origin it
    // loaded the page from ('/llm-api/...'), and Vite (running on your
    // machine, next to llama-server) forwards that to localhost:8080.
    // Without this, "localhost:8080" in the browser would resolve to
    // whatever device opened the tunnel link, not your machine.
    proxy: {
      '/llm-api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/llm-api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, ''),
      },
    },
  },
});