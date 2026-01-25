import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    copyPublicDir: true,
    assetsInlineLimit: 0, // Don't inline any assets, keep HDR files as separate files
  },
  server: {
    fs: {
      strict: false, // Allow serving files from outside root
    },
  },
})
