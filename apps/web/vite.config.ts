import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Geliştirmede /api ve /ws istekleri backend'e yönlendirilir.
// Böylece frontend ve backend aynı origin'de çalışıyormuş gibi davranır (üretimde Nginx bunu yapar).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Kütüphaneleri ayrı dosyalara böl: uygulama kodu değişince tarayıcı bunları önbellekten kullanır
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
          data: ['@tanstack/react-query', 'react-hook-form', 'luxon'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
