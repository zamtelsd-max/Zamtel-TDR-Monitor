import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  base: '/Zamtel-TDR-Monitor/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Zamtel TDR Monitor',
        short_name: 'TDR Monitor',
        description: 'Zamtel Territory Development Representative Sales Performance Monitor',
        theme_color: '#00843D',
        background_color: '#0D1B12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/Zamtel-TDR-Monitor/',
        scope: '/Zamtel-TDR-Monitor/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: 'dist-ghpages',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux'],
        },
      },
    },
  },
});
