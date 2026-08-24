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
    // Proxy API requests to the backend (Express on 3001)
    // and LLM requests to Ollama (11434)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/llm-api': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/llm-api': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, ''),
      },
    },
  },
});
