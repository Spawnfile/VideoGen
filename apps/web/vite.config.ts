import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Names the build for the service worker cache and Settings → This device (short commit + build time).
const sha = (() => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'dev'; } })();
const BUILD_ID = `${sha}-${Date.now().toString(36)}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
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
