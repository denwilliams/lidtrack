import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ranges': 'http://localhost:8787',
      '/events': 'http://localhost:8787',
      '/devices': 'http://localhost:8787',
      '/days': 'http://localhost:8787',
    },
  },
})
