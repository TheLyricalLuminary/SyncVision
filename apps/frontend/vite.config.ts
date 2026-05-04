import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendProxy = {
  target: 'http://localhost:3001',
  changeOrigin: true,
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backendProxy,
    },
  },
  // preview (npm run preview) also needs the proxy so local production
  // builds can hit the backend without setting VITE_API_URL
  preview: {
    proxy: {
      '/api': backendProxy,
    },
  },
})
