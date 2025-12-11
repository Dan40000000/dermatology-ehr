import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Output directory
    outDir: 'dist',
    // Generate sourcemaps for production debugging (optional, disable for smaller bundles)
    sourcemap: false,
    // Chunk size warning limit (500 KB)
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Manual chunking for better caching
        manualChunks: {
          // Vendor chunk - React and core libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'vendor-query': ['@tanstack/react-query'],
          // PDF generation
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          // Virtual scrolling (if used heavily)
          'vendor-virtual': ['@tanstack/react-virtual'],
        },
        // Clean file names for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    // Minification
    minify: 'esbuild',
    // Target modern browsers for smaller bundle
    target: 'es2020',
  },
  // Development server configuration
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    open: false,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
  },
})
