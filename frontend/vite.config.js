import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use polling instead of inotify to avoid ENOSPC on systems with low
  // fs.inotify.max_user_watches. Polling is slightly slower but always works.
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173,
    },
    headers: {
      // Allow iframe embedding
      'X-Frame-Options': 'SAMEORIGIN',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8007',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8007',
        ws: true,
        changeOrigin: true,
        // Suppress ECONNRESET errors that occur when WS clients disconnect abruptly
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
              // Expected when backend restarts or client navigates away – not an app error
              return;
            }
            console.error('[ws proxy error]', err.message);
          });
        },
      },
      '/media': {
        target: 'http://127.0.0.1:8007',
        changeOrigin: true,
      },
    },
  },
})
