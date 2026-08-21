import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isTunnel = process.env.VITE_TUNNEL === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    hmr: isTunnel ? { clientPort: 443 } : true,
  },
});
