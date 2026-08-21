import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isTunnel = process.env.VITE_TUNNEL === '1';
const llmTarget = process.env.LLM_TARGET || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    hmr: isTunnel ? { clientPort: 443 } : true,
    proxy: {
      '/llm-api': {
        target: llmTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, ''),
      },
    },
  },
});
