import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isTunnel = process.env.VITE_TUNNEL === '1';
const llmTarget = process.env.LLM_TARGET || 'http://localhost:8080';

const llmProxy = {
  '/llm-api': {
    target: llmTarget,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/llm-api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    hmr: isTunnel ? { clientPort: 443 } : true,
    proxy: llmProxy,
  },
  preview: {
    proxy: llmProxy,
  },
});
