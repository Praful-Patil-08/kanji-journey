import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
    proxy: {
      '/api': 'http://localhost:4000',
      '/exam': 'http://localhost:4000',
    },
  },

  // Pre-bundle heavy deps so Vite doesn't crawl them on every cold start
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      '@tanstack/react-query',
      '@supabase/supabase-js',
    ],
  },

  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve("./src"),
    },
  },

  build: {
    // manualChunks removed — Vite 6 + Node 26 hangs with object-style manualChunks
    // for this project (2150 modules). Let Vite/Rollup auto-split; keep config minimal
    // and re-introduce chunking only if measured chunk >500kB causes perf issue.
    chunkSizeWarningLimit: 800,
  },
}));
