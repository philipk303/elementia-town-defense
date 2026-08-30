import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../client/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: path.resolve(__dirname, 'index.html'),
        windPreview: path.resolve(__dirname, 'wind-preview.html'),
        waterPreview: path.resolve(__dirname, 'water-preview.html'),
      },
      output: {
        // Split Phaser (~1.4 MB) into its own chunk so the game-logic chunk
        // stays small and the browser can cache Phaser independently.
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  resolve: {
    alias: { '@shared': path.resolve(process.cwd(), 'shared') },
  },
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
})
