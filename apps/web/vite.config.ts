import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5180',
      '/events': {
        target: 'http://127.0.0.1:5180',
        // The proxy otherwise keeps the browser's SSE response open after the API dies, so EventSource never notices.
        // Ending it lets the client reconnect (502 while the API is down → CLOSED → live.ts backoff retry).
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            proxyRes.on('close', () => { if (!res.writableEnded) res.destroy(); });
          });
        },
      },
    },
  },
});
