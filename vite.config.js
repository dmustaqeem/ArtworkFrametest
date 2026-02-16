import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    copyPublicDir: true,
    assetsInlineLimit: 0, // Don't inline any assets, keep HDR files as separate files
    // Optimize chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
          'three-loaders': [
            'three/addons/loaders/GLTFLoader.js',
            'three/addons/loaders/RGBELoader.js',
            'three/addons/loaders/DRACOLoader.js',
          ],
          'three-controls': ['three/examples/jsm/controls/OrbitControls.js'],
        },
      },
    },
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
  },
  server: {
    fs: {
      strict: false, // Allow serving files from outside root
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['three'],
    // Pre-bundle Three.js for faster dev server startup
    esbuildOptions: {
      target: 'es2020',
    },
  },
  // Improve build performance
  esbuild: {
    // Drop console.log in production
    drop: process.env.NODE_ENV === 'production' ? ['console'] : [],
    // Target modern browsers for smaller bundle
    target: 'es2020',
  },
})
